// Core business logic for the complaint-assignment / deadline / escalation
// workflow. Kept separate from index.js (routing) so it's easy to read and
// test in isolation. Everything here operates on the in-memory `db` object
// (the parsed contents of db.json) and returns the pieces the caller needs
// to persist and respond with.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function makeId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${rand}`;
}

function nowIso() {
  return new Date().toISOString();
}

// Every submitted complaint, across every visit, flattened with a back-reference
// so we can find & mutate the right visit/complaint pair. A complaint that is
// still a draft hasn't been sent to the admin yet.
function flattenComplaints(db) {
  const out = [];
  (db.visits || []).forEach((v) => {
    (v.complaints || []).forEach((c) => {
      if (c.state === "draft") return;
      out.push({ complaint: c, visit: v });
    });
  });
  return out;
}

function findComplaint(db, visitId, complaintId) {
  const visit = (db.visits || []).find((v) => v.id === visitId);
  if (!visit) return null;
  const complaint = (visit.complaints || []).find((c) => c.id === complaintId);
  if (!complaint) return null;
  return { visit, complaint };
}

function findDeptByIdOrName(db, idOrName) {
  return (db.departments || []).find(
    (d) => d.id === idOrName || d.name === idOrName
  );
}

// Each department has exactly one fixer (enforced in the admin console's
// Employees tab), so assignment is just "find that person."
function getDepartmentFixer(db, departmentId) {
  return (
    (db.employees || []).find(
      (e) => e.departmentId === departmentId && (e.roles || []).includes("fixer")
    ) || null
  );
}

function addLog(complaint, label) {
  complaint.log = complaint.log || [];
  complaint.log.push({ label, time: new Date().toLocaleString() });
}

function pushEmail(db, { complaintId, to, toName, type, subject, body }) {
  db.emailLog = db.emailLog || [];
  const email = {
    id: makeId("MAIL"),
    complaintId,
    to,
    toName,
    type,
    subject,
    body,
    sentAt: nowIso(),
  };
  db.emailLog.push(email);
  return email;
}

const PERSON_LABELS = {
  name: "Name", pin: "PIN", designation: "Designation", department: "Department", contact: "Contact",
  phone: "Phone", memberNumber: "Member number", voCode: "VO code", branchCode: "Branch code", projectCode: "Project code",
};

// "Raised by (member): Name: …, Phone: …" — only the details that were given.
function raisedByLine(complaint) {
  const entries = Object.entries(complaint.person || {}).filter(([, v]) => String(v ?? "").trim() !== "");
  if (entries.length === 0) return null;
  const details = entries.map(([k, v]) => `${PERSON_LABELS[k] || k}: ${v}`).join(", ");
  return `Raised by (${complaint.source}): ${details}${complaint.consent === false ? " — did NOT consent to follow-up" : ""}`;
}

function complaintDetailBlock(complaint, visit) {
  return [
    `Complaint ID: ${complaint.id}`,
    `Unit: ${complaint.department}`,
    ...(complaint.unit ? [`Team: ${complaint.unit}`] : []),
    `Description: ${complaint.description}`,
    `Urgency: ${complaint.urgency}`,
    `Filed by: ${complaint.filedBy} (${complaint.source})`,
    ...(raisedByLine(complaint) ? [raisedByLine(complaint)] : []),
    `Filed on: ${complaint.filedDate}`,
    `Office: ${complaint.place?.office || complaint.branch || "N/A"}${complaint.place ? ` (${[complaint.place.division, complaint.place.region, complaint.place.area].filter(Boolean).join(" › ")})` : ""}`,
    `Related visit: ${visit ? `${visit.id} on ${visit.date || "N/A"}` : complaint.visitId}`,
  ].join("\n");
}

// --- Saving a visit from the staff app ------------------------------------
// Entries are drafts the field person can still change until they submit each
// one. A submitted entry is locked: the server keeps its own copy (which may
// carry the admin's assignment, the fixer's progress or story likes) whatever
// the phone sends, and never lets it be removed. A newly submitted complaint
// gets the admin-workflow fields, once, and enters the admin's queue.
const ENTRY_LISTS = ["complaints", "interactions", "observations", "stories"];

function stampEntry(list, entry, visit, now) {
  const at = now.toISOString();
  const out = { ...entry, state: "submitted", submittedAt: entry.submittedAt || at };
  if (list !== "complaints" || out.status) return out;
  return {
    ...out,
    status: "Open",
    filedBy: out.filedBy || visit.employeeName,
    visitId: visit.id,
    filedDate: at.slice(0, 10),
    assignedTo: null,
    supervisor: null,
    deadline: null,
    escalationApproved: false,
    resolutionNotes: null,
    log: [{ label: "Complaint submitted", time: now.toLocaleString() }],
  };
}

/** The visit to store, given what's stored now (`prev`, or null) and what the phone sent. */
function mergeVisit(prev, body, id) {
  const now = new Date();
  const next = { ...body, id, schema: 3, updatedAt: now.toISOString() };
  ENTRY_LISTS.forEach((list) => {
    const incoming = Array.isArray(body[list]) ? body[list] : [];
    const locked = new Map((prev?.[list] || []).filter((e) => e.state !== "draft").map((e) => [e.id, e]));
    const out = incoming.map((e) => locked.get(e.id) || (e.state === "submitted" ? stampEntry(list, e, next, now) : { ...e, state: "draft" }));
    locked.forEach((e, eid) => { if (!incoming.some((x) => x.id === eid)) out.push(e); });
    next[list] = out;
  });
  next.status = next.status === "done" ? "done" : "open";
  next.doneAt = next.status === "done" ? next.doneAt || now.toISOString() : null;
  return next;
}

const hasSubmitted = (visit) => ENTRY_LISTS.some((list) => (visit[list] || []).some((e) => e.state !== "draft"));

// --- Action: assign a complaint to the department's fixer and set its deadline
function assignComplaint(db, { visitId, complaintId, departmentId, unit, days }) {
  const found = findComplaint(db, visitId, complaintId);
  if (!found) throw new Error("Complaint not found");
  const { complaint, visit } = found;

  let dept;
  // "Undefined" (formerly "Other") means the filer wasn't sure — the admin picks the real unit
  if (complaint.department === "Undefined" || complaint.department === "Other" || departmentId) {
    dept = findDeptByIdOrName(db, departmentId);
    if (!dept) throw new Error("A valid unit must be chosen for this complaint");
  } else {
    dept = findDeptByIdOrName(db, complaint.department);
    if (!dept) throw new Error(`No unit matches "${complaint.department}" — choose one explicitly`);
  }

  const fixer = getDepartmentFixer(db, dept.id);
  if (!fixer) throw new Error(`No fixer is set up in the "${dept.name}" unit yet`);

  const supervisor = fixer.supervisorId
    ? (db.employees || []).find((e) => e.id === fixer.supervisorId)
    : null;

  const daysNum = Number(days) || 1;
  const setAt = new Date();
  const deadline = new Date(setAt.getTime() + daysNum * DAY);

  // A complaint filed as "Undefined" has no team; the admin may pick one when re-routing it.
  // Otherwise the team chosen when it was filed is kept, as long as it still belongs to the unit.
  // (Stored as complaint.department = the Unit, complaint.unit = the Team — see src/lib/terms.js.)
  const wantedUnit = unit || complaint.unit;
  const unitMatch = (dept.units || []).find((u) => u.name === wantedUnit);
  complaint.department = dept.name;
  complaint.unit = unitMatch ? unitMatch.name : null;
  complaint.assignedEmployeeId = fixer.id;
  complaint.assignedTo = fixer.name;
  complaint.assignedEmployeeEmail = fixer.email || null;
  complaint.supervisorId = supervisor ? supervisor.id : null;
  complaint.supervisor = supervisor ? supervisor.name : null;
  complaint.supervisorEmail = supervisor ? supervisor.email : null;
  complaint.status = "In Progress";
  complaint.deadline = deadline.toISOString();
  complaint.deadlineSetAt = setAt.toISOString();
  complaint.deadlineDays = daysNum;
  complaint.reminderSent = false;
  complaint.escalated = false;
  complaint.escalatedAt = null;
  complaint.deadlineHistory = complaint.deadlineHistory || [];
  complaint.deadlineHistory.push({
    deadline: complaint.deadline,
    setAt: complaint.deadlineSetAt,
    days: daysNum,
    type: "initial",
  });

  addLog(
    complaint,
    `Assigned to ${fixer.name} (${dept.name}${complaint.unit ? ` · ${complaint.unit}` : ""}) — ${daysNum} day(s) given, deadline ${deadline.toLocaleString()}`
  );

  const email = pushEmail(db, {
    complaintId: complaint.id,
    to: fixer.email || "(no email on file)",
    toName: fixer.name,
    type: "assignment",
    subject: `[Field Visit Tracker] New complaint assigned: ${complaint.id}`,
    body:
      `Hello ${fixer.name},\n\nA new complaint has been assigned to you. You have ${daysNum} day(s) to resolve it (deadline: ${deadline.toLocaleString()}).\n\n` +
      complaintDetailBlock(complaint, visit),
  });

  addLog(complaint, `Assignment email generated for ${fixer.name}`);

  return { complaint, email };
}

// --- Action: admin grants a supervisor-approved extension -----------------
function extendDeadline(db, { visitId, complaintId, days }) {
  const found = findComplaint(db, visitId, complaintId);
  if (!found) throw new Error("Complaint not found");
  const { complaint, visit } = found;
  if (!complaint.assignedEmployeeId) throw new Error("Complaint has not been assigned yet");

  const daysNum = Number(days) || 1;
  const setAt = new Date();
  const deadline = new Date(setAt.getTime() + daysNum * DAY);

  complaint.deadline = deadline.toISOString();
  complaint.deadlineSetAt = setAt.toISOString();
  complaint.deadlineDays = daysNum;
  complaint.reminderSent = false;
  complaint.escalated = false;
  complaint.escalatedAt = null;
  complaint.deadlineHistory = complaint.deadlineHistory || [];
  complaint.deadlineHistory.push({
    deadline: complaint.deadline,
    setAt: complaint.deadlineSetAt,
    days: daysNum,
    type: "extension",
  });

  addLog(
    complaint,
    `Deadline extended by admin (per supervisor's instruction) — ${daysNum} more day(s), new deadline ${deadline.toLocaleString()}`
  );

  const email = pushEmail(db, {
    complaintId: complaint.id,
    to: complaint.assignedEmployeeEmail || "(no email on file)",
    toName: complaint.assignedTo,
    type: "extension",
    subject: `[Field Visit Tracker] Deadline extended: ${complaint.id}`,
    body:
      `Hello ${complaint.assignedTo},\n\nYour deadline for the complaint below has been extended by ${daysNum} day(s). New deadline: ${deadline.toLocaleString()}.\n\n` +
      complaintDetailBlock(complaint, visit),
  });

  return { complaint, email };
}

// --- Action: fixer marks a complaint resolved ------------------------------
function resolveComplaint(db, { visitId, complaintId, employeeId }) {
  const found = findComplaint(db, visitId, complaintId);
  if (!found) throw new Error("Complaint not found");
  const { complaint } = found;
  const employee = (db.employees || []).find((e) => e.id === employeeId);

  complaint.status = "Resolved";
  complaint.resolvedAt = nowIso();
  complaint.resolvedBy = employee ? employee.name : employeeId;
  addLog(complaint, `Marked resolved by ${complaint.resolvedBy}`);

  return { complaint };
}

// --- Periodic / manual: reminders + escalations ---------------------------
function runDeadlineCheck(db) {
  const generated = [];
  const now = new Date();

  flattenComplaints(db).forEach(({ complaint, visit }) => {
    if (complaint.status !== "In Progress" || !complaint.deadline) return;

    const deadline = new Date(complaint.deadline);
    const setAt = new Date(complaint.deadlineSetAt || complaint.deadline);
    const totalMs = deadline.getTime() - setAt.getTime();
    const reminderWindowMs = totalMs > 2 * DAY ? 48 * HOUR : 24 * HOUR;
    const reminderAt = new Date(deadline.getTime() - reminderWindowMs);

    // Reminder — fires once per deadline cycle.
    if (!complaint.reminderSent && now >= reminderAt && now < deadline) {
      complaint.reminderSent = true;
      addLog(complaint, `Reminder email sent — deadline in under ${reminderWindowMs / HOUR}h`);
      const email = pushEmail(db, {
        complaintId: complaint.id,
        to: complaint.assignedEmployeeEmail || "(no email on file)",
        toName: complaint.assignedTo,
        type: "reminder",
        subject: `[Field Visit Tracker] Reminder — deadline approaching: ${complaint.id}`,
        body:
          `Hello ${complaint.assignedTo},\n\nThis is a reminder that your deadline for the complaint below is ${deadline.toLocaleString()}.\n\n` +
          complaintDetailBlock(complaint, visit),
      });
      generated.push(email);
    }

    // Escalation — fires once per deadline cycle, to the supervisor.
    if (!complaint.escalated && now >= deadline) {
      complaint.escalated = true;
      complaint.escalatedAt = nowIso();
      addLog(
        complaint,
        `Deadline missed — escalation email sent to supervisor (${complaint.supervisor || "none on file"})`
      );
      const email = pushEmail(db, {
        complaintId: complaint.id,
        to: complaint.supervisorEmail || "(no email on file)",
        toName: complaint.supervisor,
        type: "escalation",
        subject: `[Field Visit Tracker] ESCALATION — deadline missed: ${complaint.id}`,
        body:
          `Hello ${complaint.supervisor || ""},\n\n${complaint.assignedTo} has missed the deadline (${deadline.toLocaleString()}) for the complaint below. Please advise the admin how much extra time to grant.\n\n` +
          complaintDetailBlock(complaint, visit),
      });
      generated.push(email);
    }
  });

  return generated;
}

export { assignComplaint, extendDeadline, resolveComplaint, runDeadlineCheck, mergeVisit, hasSubmitted };
