// Upgrades db.json to the current visit shape ("schema 3"), one step at a time.
//
// Schema 1: a single location and a four-step wizard (register → complaints →
//   story → feedback).
// Schema 2: a route of stops; complaints, observations / feedback and stories
//   tagged with the stop they belong to; the whole visit submitted at once.
// Schema 3: every entry — complaint, client interaction, observation, story —
//   is tied to one office (`place`), is a draft until it is submitted on its own,
//   and the visit is closed with "Mark as done" (status "done").
//
// This runs on every server start and only touches records that are still in an
// older shape, so running it twice changes nothing.

export const UNDEFINED_UNIT = "Undefined";

// Shown to field staff when a client rates the branch; admins edit them in the
// admin console (Client questions). Seeded once if the setting doesn't exist yet.
export const DEFAULT_RATING_QUESTIONS = [
  { id: "RQ-STAFF", text: "Staff behaviour", active: true },
  { id: "RQ-WAIT", text: "Waiting time", active: true },
  { id: "RQ-INFO", text: "Clear information on loans and savings", active: true },
  { id: "RQ-CLEAN", text: "Cleanliness of the branch", active: true },
];

// Old member feedback had one overall star rating; it is kept as an answer to this question.
const LEGACY_QUESTION = { id: "RQ-LEGACY", text: "Overall rating (before rating questions)" };

function makeId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

const filled = (s) => String(s ?? "").trim() !== "";

function migrateVisit(v) {
  const branch = v.location || "";
  const at = v.date ? new Date(`${v.date}T${v.visitTime || "09:00"}`).toISOString() : new Date().toISOString();
  const f = v.feedback || {};
  const observations = [];
  const staff = f.staff || {};
  if (filled(staff.notes) || (staff.tags || []).length || staff.rating || staff.person) {
    observations.push({
      id: makeId("OB"), branch, from: "staff", description: staff.notes || "", voice: null,
      tags: staff.tags || [], ratings: [], photoUrl: null, person: staff.person || null, time: at,
      // staff no longer give star ratings; the old one is kept for the record only
      ...(staff.rating ? { legacyRating: staff.rating } : {}),
    });
  }
  const member = f.member || {};
  if (filled(member.notes) || (member.tags || []).length || member.rating || member.person) {
    observations.push({
      id: makeId("OB"), branch, from: "client", description: member.notes || "", voice: null,
      tags: member.tags || [], photoUrl: null, person: member.person || null, time: at,
      ratings: member.rating ? [{ questionId: LEGACY_QUESTION.id, question: LEGACY_QUESTION.text, stars: member.rating }] : [],
      ...(Number(member.count) > 0 ? { consulted: Number(member.count) } : {}),
    });
  }
  const s = v.story;
  const stories = s && (s.posted || filled(s.caption) || s.photoUrl)
    ? [{ id: makeId("ST"), branch, caption: s.caption || "", photoUrl: s.photoUrl || null, gradient: s.gradient || null,
         likes: s.likes || 0, comments: s.comments || 0, liked: !!s.liked, time: at }]
    : [];
  const submitted = !!v.steps?.register;
  return {
    id: v.id, schema: 2,
    employeeId: v.employeeId, employeeName: v.employeeName,
    division: v.division || "", region: v.region || "", area: v.area || "",
    stops: branch ? [{ kind: v.locationType === "office" ? "office" : "branch", name: branch, division: v.division || "", region: v.region || "", area: v.area || "" }] : [],
    reason: v.reason || "Monitoring",
    date: v.date || "", visitTime: v.visitTime || "", returnDate: v.returnDate || "", returnTime: v.returnTime || "",
    status: submitted ? "submitted" : "open",
    submittedAt: submitted ? (v.returnDate ? new Date(`${v.returnDate}T${v.returnTime || "17:00"}`).toISOString() : at) : null,
    nothing: {},
    complaints: (v.complaints || []).map((c) => ({ ...c, branch, voice: c.voice || null })),
    observations,
    stories,
    lastBranch: branch || null,
  };
}

/* ---------- schema 2 → 3 ---------- */

const officeKindOf = (name) => (/ Region Office$/.test(name) ? "region" : / Office$/.test(name) ? "area" : / · /.test(name) ? "vo" : "branch");
const voBranch = (vo) => String(vo).split(" · ")[1] || "";

/** The office an old entry was tagged with, in the shape entries use now. */
function placeOf(v, name) {
  const s = (v.stops || []).find((x) => x.name === name);
  const kind = s?.kind === "vo" ? "vo" : s?.kind === "office" ? officeKindOf(name) : s ? "branch" : officeKindOf(name);
  return {
    division: s?.division || v.division || "", region: s?.region || v.region || "", area: s?.area || v.area || "",
    office: name || "", officeKind: name ? kind : "", branch: kind === "vo" ? voBranch(name) : kind === "branch" ? name || "" : "",
  };
}

function upgradeVisit(v) {
  const sent = v.status === "submitted";
  const firstStop = v.stops?.[0]?.name || "";
  // a submitted visit sent all its entries; an open one only had drafts
  const entry = (e) => {
    const { branch, ...rest } = e;
    return {
      ...rest,
      place: e.place || placeOf(v, branch || firstStop),
      state: sent ? "submitted" : "draft",
      ...(sent ? { submittedAt: v.submittedAt || e.time || null } : {}),
    };
  };
  const obs = v.observations || [];
  const { nothing, lastBranch, submittedAt, ...base } = v;
  return {
    ...base,
    schema: 3,
    reasonOther: v.reasonOther || "",
    stays: v.stays || [],
    status: sent ? "done" : "open",
    doneAt: sent ? submittedAt || null : null,
    complaints: (v.complaints || []).map(entry),
    // client feedback is now a "client interaction"
    interactions: obs.filter((o) => o.from === "client").map((o) => { const { from, ...rest } = entry(o); return rest; }),
    // staff feedback is now an observation that came from a staff member
    observations: obs.filter((o) => o.from !== "client").map((o) => {
      const { from, person, ratings, ...rest } = entry(o);
      return { ...rest, fromStaff: !!person || from === "staff", staff: person || null };
    }),
    stories: (v.stories || []).map(entry),
  };
}

/** Upgrades `db` in place. Returns true if anything changed. */
export function migrateDb(db) {
  let changed = false;

  if (Array.isArray(db.visits)) {
    const next = [];
    db.visits.forEach((v) => {
      if (v.schema === 3) { next.push(v); return; }
      changed = true;
      if (v.schema === 2) { next.push(upgradeVisit(v)); return; }
      // abandoned wizard drafts with no location, date or content carry nothing worth keeping
      if (!v.location && !v.date && !(v.complaints || []).length) return;
      next.push(upgradeVisit(migrateVisit(v)));
    });
    db.visits = next;

    // the catch-all unit used to be called "Other"
    db.visits.forEach((v) => (v.complaints || []).forEach((c) => {
      if (c.department === "Other") { c.department = UNDEFINED_UNIT; changed = true; }
    }));
  }

  db.settings = db.settings && typeof db.settings === "object" ? db.settings : {};
  if (!Array.isArray(db.settings.clientRatingQuestions)) {
    db.settings.clientRatingQuestions = DEFAULT_RATING_QUESTIONS;
    changed = true;
  }

  // sign-in is PIN + password for everyone now, admins included
  if (Array.isArray(db.adminUsers)) {
    db.adminUsers.forEach((a, i) => {
      if (!a.pin) { a.pin = String(9001 + i); changed = true; }
    });
  }

  // Four kinds of user now: base (field), fixer, management, and admin (separate
  // admin accounts). Supervisors become management, who also receive escalations.
  if (Array.isArray(db.employees)) {
    db.employees.forEach((e) => {
      const roles = e.roles || [];
      if (!roles.includes("supervisor")) return;
      e.roles = [...new Set(roles.map((r) => (r === "supervisor" ? "management" : r)))];
      changed = true;
    });
  }

  // Several fixers per unit: a complaint assigned to one fixer before then now belongs to
  // that unit's whole fixer pool (any of them can resolve it).
  if (Array.isArray(db.visits)) {
    db.visits.forEach((v) => (v.complaints || []).forEach((c) => {
      if (!c.assignedEmployeeId || c.assignedDepartmentId) return;
      const dept = (db.departments || []).find((d) => d.name === c.department);
      const fixer = (db.employees || []).find((e) => e.id === c.assignedEmployeeId);
      const deptId = dept?.id || fixer?.departmentId;
      if (!deptId) return;
      c.assignedDepartmentId = deptId;
      c.assignees = c.assignees || [{ id: c.assignedEmployeeId, name: c.assignedTo, email: c.assignedEmployeeEmail || null }];
      changed = true;
    }));
  }

  // Complaint statuses Waiting / Assigned / In Progress / Fixed / Long Term. Before, "In Progress"
  // meant "assigned" (nobody marked starting work), so it becomes Assigned. Each complaint is
  // converted once (statusModel: 2), so a real In Progress set later is never touched.
  if (Array.isArray(db.visits)) {
    const MAP = { Open: "Waiting", "In Progress": "Assigned", Resolved: "Fixed" };
    db.visits.forEach((v) => (v.complaints || []).forEach((c) => {
      if (c.statusModel === 2 || !c.status) return;
      c.status = MAP[c.status] || c.status;
      c.statusModel = 2;
      changed = true;
    }));
    // complaints are called "action items" now, and so is the visit purpose
    db.visits.forEach((v) => {
      if (v.reason !== "Complaint resolution") return;
      v.reason = "Action item resolution";
      changed = true;
    });
  }

  return changed;
}
