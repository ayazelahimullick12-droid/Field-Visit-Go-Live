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

// A unit can have any number of fixers. A complaint is assigned to the unit as a whole:
// every fixer in it sees it in their queue and any one of them can resolve it.
function getUnitFixers(db, departmentId) {
  return (db.employees || []).filter(
    (e) => departmentId && e.departmentId === departmentId && (e.roles || []).includes("fixer")
  );
}

const person = (e) => ({ id: e.id, name: e.name, email: e.email || null });
const names = (list) => list.map((p) => p.name).join(", ");
const emails = (list) => list.map((p) => p.email).filter(Boolean).join(", ") || null;

/** The fixers working a complaint now: the unit's current fixers (so someone added later is
 *  included), or whoever was stored at assignment time if the unit has none left. */
function currentFixers(db, complaint) {
  const live = getUnitFixers(db, complaint.assignedDepartmentId).map(person);
  if (live.length) return live;
  if (complaint.assignees?.length) return complaint.assignees;
  return complaint.assignedEmployeeId
    ? [{ id: complaint.assignedEmployeeId, name: complaint.assignedTo, email: complaint.assignedEmployeeEmail }]
    : [];
}

/** Each fixer's supervisor, once each — they receive escalations. */
function supervisorsOf(db, fixers) {
  const ids = [...new Set(fixers.map((f) => (db.employees || []).find((e) => e.id === f.id)?.supervisorId).filter(Boolean))];
  return ids.map((id) => (db.employees || []).find((e) => e.id === id)).filter(Boolean).map(person);
}

/** One logged email per recipient (or a single "(no email on file)" entry when there's nobody). */
function emailEach(db, recipients, build) {
  const list = recipients.length ? recipients : [{ name: "", email: null }];
  return list.map((r) => pushEmail(db, { ...build(r), to: r.email || "(no email on file)", toName: r.name || null }));
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
    `Action item ID: ${complaint.id}`,
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
    status: "Waiting",
    statusModel: 2,
    filedBy: out.filedBy || visit.employeeName,
    visitId: visit.id,
    filedDate: at.slice(0, 10),
    assignedTo: null,
    supervisor: null,
    deadline: null,
    escalationApproved: false,
    resolutionNotes: null,
    log: [{ label: "Action item submitted", time: now.toLocaleString() }],
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

// --- Action: assign a complaint to the unit's fixers and set its deadline
function assignComplaint(db, { visitId, complaintId, departmentId, unit, days }) {
  const found = findComplaint(db, visitId, complaintId);
  if (!found) throw new Error("Action item not found");
  const { complaint, visit } = found;

  let dept;
  // "Undefined" (formerly "Other") means the filer wasn't sure — the admin picks the real unit
  if (complaint.department === "Undefined" || complaint.department === "Other" || departmentId) {
    dept = findDeptByIdOrName(db, departmentId);
    if (!dept) throw new Error("A valid unit must be chosen for this action item");
  } else {
    dept = findDeptByIdOrName(db, complaint.department);
    if (!dept) throw new Error(`No unit matches "${complaint.department}" — choose one explicitly`);
  }

  const fixers = getUnitFixers(db, dept.id).map(person);
  if (!fixers.length) throw new Error(`No fixer is set up in the "${dept.name}" unit yet`);
  const supervisors = supervisorsOf(db, fixers);

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
  complaint.assignedDepartmentId = dept.id;
  complaint.assignees = fixers;
  // the single-person fields are kept (first fixer / joined names) for older screens and the emails
  complaint.assignedEmployeeId = fixers[0].id;
  complaint.assignedTo = names(fixers);
  complaint.assignedEmployeeEmail = emails(fixers);
  complaint.supervisors = supervisors;
  complaint.supervisorId = supervisors[0]?.id || null;
  complaint.supervisor = supervisors.length ? names(supervisors) : null;
  complaint.supervisorEmail = emails(supervisors);
  complaint.status = "Assigned";
  complaint.statusModel = 2;
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
    `Assigned to the ${dept.name} fixers: ${names(fixers)} (${dept.name}${complaint.unit ? ` · ${complaint.unit}` : ""}) — ${daysNum} day(s) given, deadline ${deadline.toLocaleString()}`
  );

  const sent = emailEach(db, fixers, (r) => ({
    complaintId: complaint.id,
    type: "assignment",
    subject: `[Field Visit Tracker] New action item assigned: ${complaint.id}`,
    body:
      `Hello ${r.name},\n\nA new action item has been assigned to the ${dept.name} unit's fixers (${names(fixers)}). Any one of you can resolve it. You have ${daysNum} day(s) (deadline: ${deadline.toLocaleString()}).\n\n` +
      complaintDetailBlock(complaint, visit),
  }));

  addLog(complaint, `Assignment email generated for ${names(fixers)}`);

  return { complaint, email: sent[0], emails: sent };
}

// --- Action: admin grants a supervisor-approved extension -----------------
function extendDeadline(db, { visitId, complaintId, days }) {
  const found = findComplaint(db, visitId, complaintId);
  if (!found) throw new Error("Action item not found");
  const { complaint, visit } = found;
  if (!complaint.assignedEmployeeId) throw new Error("Action item has not been assigned yet");

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
    `Deadline extended by the admin — ${daysNum} more day(s), new deadline ${deadline.toLocaleString()}`
  );

  const fixers = currentFixers(db, complaint);
  const sent = emailEach(db, fixers, (r) => ({
    complaintId: complaint.id,
    type: "extension",
    subject: `[Field Visit Tracker] Deadline extended: ${complaint.id}`,
    body:
      `Hello ${r.name},\n\nYour deadline for the action item below has been extended by ${daysNum} day(s). New deadline: ${deadline.toLocaleString()}.\n\n` +
      complaintDetailBlock(complaint, visit),
  }));
  const email = sent[0];

  return { complaint, email };
}

// --- Action: fixer marks a complaint resolved ------------------------------
// Only a fixer of the unit a complaint is assigned to can move it along.
function fixerFor(db, complaint, employeeId) {
  const employee = (db.employees || []).find((e) => e.id === employeeId);
  if (!employee) throw new Error("Unknown employee");
  const allowed = currentFixers(db, complaint).some((f) => f.id === employee.id) ||
    (complaint.assignees || []).some((f) => f.id === employee.id) || complaint.assignedEmployeeId === employee.id;
  if (!allowed) throw new Error("Only a fixer of the unit this action item is assigned to can update it");
  return employee;
}

// --- Action: a fixer starts work (Assigned -> In Progress) -------------------
function startComplaint(db, { visitId, complaintId, employeeId }) {
  const found = findComplaint(db, visitId, complaintId);
  if (!found) throw new Error("Action item not found");
  const { complaint } = found;
  if (complaint.status !== "Assigned") throw new Error(`This action item is ${complaint.status}, so it can't be started`);
  const employee = fixerFor(db, complaint, employeeId);
  complaint.status = "In Progress";
  complaint.startedAt = nowIso();
  complaint.startedBy = employee.name;
  addLog(complaint, `Work started by ${employee.name}`);
  return { complaint };
}

// --- Action: a fixer marks it Long Term (needs longer work; no deadline reminders) ---
function markLongTerm(db, { visitId, complaintId, employeeId, note }) {
  const found = findComplaint(db, visitId, complaintId);
  if (!found) throw new Error("Action item not found");
  const { complaint } = found;
  if (!["Assigned", "In Progress"].includes(complaint.status)) throw new Error(`This action item is ${complaint.status}, so it can't be marked Long Term`);
  const employee = fixerFor(db, complaint, employeeId);
  const text = String(note || "").trim().slice(0, 1000);
  complaint.status = "Long Term";
  complaint.longTermAt = nowIso();
  complaint.longTermBy = employee.name;
  complaint.longTermNote = text || null;
  addLog(complaint, `Marked Long Term by ${employee.name}${text ? `: "${text}"` : ""}`);
  return { complaint };
}

// --- Action: a fixer marks it Fixed, optionally saying what was done (note and/or photo) ---
function resolveComplaint(db, { visitId, complaintId, employeeId, note, photoUrl }) {
  const found = findComplaint(db, visitId, complaintId);
  if (!found) throw new Error("Action item not found");
  const { complaint } = found;
  if (!["Assigned", "In Progress", "Long Term"].includes(complaint.status)) throw new Error(`This action item is ${complaint.status}, so it can't be marked Fixed`);
  const employee = fixerFor(db, complaint, employeeId);

  const text = String(note || "").trim().slice(0, 1000);
  complaint.status = "Fixed";
  complaint.resolvedAt = nowIso();
  complaint.resolvedBy = employee.name;
  complaint.resolvedById = employee.id;
  complaint.resolutionNotes = text || null;
  complaint.resolutionPhotoUrl = photoUrl || null;
  addLog(complaint, `Marked Fixed by ${complaint.resolvedBy}${text ? `: "${text}"` : ""}${photoUrl ? " (photo attached)" : ""}`);

  return { complaint };
}

// --- Periodic / manual: deadline reminders (there are no escalations) ---------------------------
function runDeadlineCheck(db) {
  const generated = [];
  const now = new Date();

  flattenComplaints(db).forEach(({ complaint, visit }) => {
    if (!["Assigned", "In Progress"].includes(complaint.status) || !complaint.deadline) return;

    const deadline = new Date(complaint.deadline);
    const setAt = new Date(complaint.deadlineSetAt || complaint.deadline);
    const totalMs = deadline.getTime() - setAt.getTime();
    const reminderWindowMs = totalMs > 2 * DAY ? 48 * HOUR : 24 * HOUR;
    const reminderAt = new Date(deadline.getTime() - reminderWindowMs);

    // Reminder — fires once per deadline cycle.
    if (!complaint.reminderSent && now >= reminderAt && now < deadline) {
      complaint.reminderSent = true;
      addLog(complaint, `Reminder email sent — deadline in under ${reminderWindowMs / HOUR}h`);
      const fixers = currentFixers(db, complaint);
      generated.push(...emailEach(db, fixers, (r) => ({
        complaintId: complaint.id,
        type: "reminder",
        subject: `[Field Visit Tracker] Reminder — deadline approaching: ${complaint.id}`,
        body:
          `Hello ${r.name},\n\nThis is a reminder that the deadline for the action item below is ${deadline.toLocaleString()}.\n\n` +
          complaintDetailBlock(complaint, visit),
      })));
    }
  });

  return generated;
}

// --- Story feed: likes (one per person) and comments ------------------------
function findStory(db, visitId, storyId) {
  const v = (db.visits || []).find((x) => x.id === visitId);
  const story = v && (v.stories || []).find((x) => x.id === storyId);
  if (!story) throw new Error("Story not found");
  return story;
}

function toggleStoryLike(db, { visitId, storyId, employeeId }) {
  const story = findStory(db, visitId, storyId);
  if (!employeeId) throw new Error("Sign in to like a story");
  // older stories kept only a count: keep it as likes from before, and track people from now on
  const by = new Set(story.likedBy || []);
  if (by.has(employeeId)) by.delete(employeeId); else by.add(employeeId);
  story.likedBy = [...by];
  story.likesBefore = story.likesBefore ?? Math.max(0, (story.likes || 0) - (story.liked ? 1 : 0));
  story.likes = story.likesBefore + story.likedBy.length;
  delete story.liked;
  return { story };
}

function addStoryComment(db, { visitId, storyId, employeeId, text }) {
  const story = findStory(db, visitId, storyId);
  const employee = (db.employees || []).find((e) => e.id === employeeId);
  if (!employee) throw new Error("Sign in to comment");
  const body = String(text || "").trim().slice(0, 600);
  if (!body) throw new Error("Write a comment first");
  story.comments = Array.isArray(story.comments) ? story.comments : [];
  story.comments.push({ id: `CM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, byId: employee.id, by: employee.name, text: body, time: nowIso() });
  return { story };
}

export { assignComplaint, extendDeadline, resolveComplaint, startComplaint, markLongTerm, runDeadlineCheck, mergeVisit, hasSubmitted, toggleStoryLike, addStoryComment };
