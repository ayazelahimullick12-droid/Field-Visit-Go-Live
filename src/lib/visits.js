// Visits.
//
// A visit is registered with only its dates (everything else can come later):
// where it is (division / region / area), the offices you plan to visit, why,
// and optionally where you're staying. During and after the visit you add
// entries — complaints, client interactions, observations and stories — in any
// order. Each entry is tied to one office (a branch, VO, area or region office),
// is saved as a draft until you submit it, and can't be changed once submitted.
// "Mark as done" closes the visit once its dates are in.
//
// The analytics, coverage map and Branch 360° still think in one-office visits,
// so expandVisits() turns visits into one record per office for them.

export const UNDEFINED_UNIT = "Undefined";
export const REASONS = ["Onboarding", "Monitoring", "Training", "Action item resolution", "Survey", "Other"];

// Village organisations are typed in as codes under the branch they belong to, and stored as
// "<code> · <branch>" (e.g. "VO-142 · Mirpur Branch"), so the branch is always known.
export const voName = (code, branch) => `${code} · ${branch}`;
export const voBranch = (vo) => String(vo).split(" · ")[1] || "";
export const voCode = (vo) => String(vo).split(" · ")[0] || "";

// Where people stay on multi-day visits. BRAC Learning Centres first; the list is a
// starting point (centres confirmed from public sources) — "Other BLC" takes any name.
export const STAY_TYPES = ["BRAC Learning Centre (BLC)", "Hotel", "Guest house", "BRAC office", "Other"];
export const BLCS = [
  "BLC Barishal", "BLC Chattogram", "BLC Cox's Bazar", "BLC Faridpur",
  "BLC Jashore", "BLC Khulna (Khalishpur)", "BLC Rajshahi", "BLC Sylhet",
];

export const ENTRY_TYPES = {
  complaint: { list: "complaints", label: "Action item", plural: "Action items", prefix: "FC" },
  interaction: { list: "interactions", label: "Client interaction", plural: "Client interactions", prefix: "CI" },
  observation: { list: "observations", label: "Observation", plural: "Observations", prefix: "OB" },
  story: { list: "stories", label: "Story", plural: "Stories", prefix: "ST" },
};
export const ENTRY_ORDER = ["complaint", "interaction", "observation", "story"];

/** Same maths and wording the registration form has always shown. */
export function computeDuration(startDate, startTime, endDate, endTime) {
  if (!startDate || !startTime || !endDate || !endTime) return "";
  const start = new Date(`${startDate}T${startTime}`);
  const end = new Date(`${endDate}T${endTime}`);
  if (isNaN(start) || isNaN(end) || end <= start) return "";
  const totalMinutes = Math.round((end - start) / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days} day${days > 1 ? "s" : ""}`);
  if (hours) parts.push(`${hours} hr${hours > 1 ? "s" : ""}`);
  if (minutes) parts.push(`${minutes} min${minutes > 1 ? "s" : ""}`);
  return parts.join(" ");
}

export const pad2 = (n) => String(n).padStart(2, "0");
export const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const hhmm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const fmtDay = (d) => d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
export const fmtDate = (iso) => (iso ? fmtDay(new Date(`${iso}T00:00`)) : "");
export const fmtClock = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
/** "14:05" → "2:05 PM" */
export function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${pad2(m)} ${h < 12 ? "AM" : "PM"}`;
}
export const shortName = (name) => String(name || "").replace(/ Branch$/, "");
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;
export const mmss = (s) => `${Math.floor(s / 60)}:${pad2(Math.round(s) % 60)}`;

export const tripStart = (v) => new Date(`${v.date}T${v.visitTime || "00:00"}`);
export const tripReturn = (v) => (v.returnDate ? new Date(`${v.returnDate}T${v.returnTime || "23:59"}`) : null);
export const reasonText = (v) => (v.reason === "Other" ? (v.reasonOther || "").trim() || "Other" : v.reason || "");
export const tripTitle = (v) => v.area || v.region || v.division || v.stops?.[0]?.name || (v.date ? `Visit · ${fmtDate(v.date)}` : "Visit");
export const tripPath = (v) => [v.division, v.region, v.area].filter(Boolean).join(" › ");

/** "Mon 12 Oct, 9:30 AM → Tue 13 Oct" */
export function whenText(v) {
  if (!v.date) return "No date";
  const start = `${fmtDate(v.date)}${v.visitTime ? `, ${fmtTime(v.visitTime)}` : ""}`;
  if (!v.returnDate) return `${start} → return date not set`;
  const end = v.returnDate === v.date ? (v.returnTime ? fmtTime(v.returnTime) : "same day") : `${fmtDate(v.returnDate)}${v.returnTime ? `, ${fmtTime(v.returnTime)}` : ""}`;
  return `${start} → ${end}`;
}

export function relativeDay(d, now = new Date()) {
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  const b = new Date(now); b.setHours(0, 0, 0, 0);
  const n = Math.round((a - b) / 86400000);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 1 ? `in ${n} days` : `${-n} days ago`;
}

/* ---------- where a visit is in its life ---------- */

export const PHASES = {
  upcoming: { label: "Upcoming", pill: "pill-info", go: "Open" },
  progress: { label: "In progress", pill: "pill-brand", go: "Continue" },
  due: { label: "Not marked done", pill: "pill-stale", go: "Finish up" },
  done: { label: "Done", pill: "pill-ok", go: "View" },
};

/** Registered ahead, under way, back but not marked done yet, or done. */
export function phaseOf(v, now = new Date()) {
  if (v.status === "done") return "done";
  if (v.date && tripStart(v) > now) return "upcoming";
  const r = tripReturn(v);
  return r && r <= now ? "due" : "progress";
}

/** A visit can be marked done once both its dates are in (and in the right order). */
export function markDoneBlocker(v) {
  if (!v.date) return "Add the visit date first.";
  if (!v.returnDate) return "Add the return date first.";
  if (v.returnDate < v.date) return "The return date is before the visit date.";
  return "";
}

/* ---------- entries ---------- */

/** Older entries without a state were all sent. */
export const entryState = (e) => e.state || "submitted";
export const isDraft = (e) => entryState(e) === "draft";

export function entriesOf(v, type) {
  const types = type ? [type] : ENTRY_ORDER;
  return types.flatMap((t) => (v[ENTRY_TYPES[t].list] || []).map((e) => ({ ...e, type: t })));
}

/** Drafts first (newest first), then submitted (newest first). */
export function sortEntries(list) {
  const t = (e) => e.submittedAt || e.time || "";
  return [...list].sort((a, b) => (isDraft(b) - isDraft(a)) || t(b).localeCompare(t(a)));
}

export function countsOf(v) {
  const c = { drafts: 0, submitted: 0, total: 0 };
  ENTRY_ORDER.forEach((t) => {
    const list = v[ENTRY_TYPES[t].list] || [];
    const d = list.filter(isDraft).length;
    c[t] = { drafts: d, submitted: list.length - d, total: list.length };
    c.drafts += d; c.submitted += list.length - d; c.total += list.length;
  });
  return c;
}

/* ---------- offices an entry belongs to ---------- */

export const officeKindOf = (name) => (/ Region Office$/.test(name) ? "region" : / Office$/.test(name) ? "area" : / · /.test(name) ? "vo" : "branch");
export const OFFICE_KIND_LABEL = { branch: "Branch", vo: "Village organisation", area: "Area office", region: "Region office" };
export const placeOffice = (e) => e.place?.office || e.places?.[0]?.office || e.branch || "";
/** Every office an entry is about (newer entries can name several). */
export const entryPlaces = (e) => (e?.places?.length ? e.places : e?.place?.office ? [e.place] : []);
/** "Mirpur Branch, VO-142 · Mirpur Branch" style list, for one line of text. */
export const placesText = (places) => (places || []).map((p) => (p.officeKind === "branch" ? shortName(p.office) : p.office)).join(", ");
export const placePath = (p) => [p?.division, p?.region, p?.area].filter(Boolean).join(" › ");

/** The place a planned stop stands for, in the shape entries use. */
export function placeOfStop(s, v) {
  const kind = s.kind === "vo" ? "vo" : s.kind === "office" ? officeKindOf(s.name) : "branch";
  return {
    division: s.division || v?.division || "", region: s.region || v?.region || "", area: s.area || v?.area || "",
    office: s.name, officeKind: kind, branch: kind === "vo" ? voBranch(s.name) : kind === "branch" ? s.name : "",
  };
}

/* ---------- for the analytics, coverage map and Branch 360° ---------- */

/** One record per office per visit: the planned stops of done visits, and every office with submitted entries. */
export function expandVisits(trips) {
  const out = [];
  (trips || []).forEach((v) => {
    const groups = new Map();
    const group = (key, base) => {
      if (!groups.has(key)) groups.set(key, { ...base, complaints: [], observations: [], interactions: [], stories: [] });
      return groups.get(key);
    };
    if (v.status === "done") {
      (v.stops || []).forEach((s) => { const p = placeOfStop(s, v); group(s.name, p); });
    }
    ENTRY_ORDER.forEach((t) => (v[ENTRY_TYPES[t].list] || []).forEach((e) => {
      if (isDraft(e)) return;
      // an entry about several offices counts at each of them
      entryPlaces(e).forEach((p) => {
        if (p.office) group(p.office, { ...p })[ENTRY_TYPES[t].list].push(e);
      });
    }));
    let i = 0;
    groups.forEach((g, key) => {
      i += 1;
      out.push({
        id: groups.size > 1 ? `${v.id}-${i}` : v.id,
        tripId: v.id,
        employeeId: v.employeeId, employeeName: v.employeeName,
        location: key, locationType: g.officeKind === "area" || g.officeKind === "region" ? "office" : "branch",
        officeKind: g.officeKind || officeKindOf(key), branch: g.branch || "",
        division: g.division || v.division, region: g.region || v.region, area: g.area || v.area,
        date: v.date, visitTime: v.visitTime, returnDate: v.returnDate, returnTime: v.returnTime,
        duration: computeDuration(v.date, v.visitTime, v.returnDate, v.returnTime),
        reason: reasonText(v),
        steps: { register: true },
        complaints: g.complaints, observations: g.observations, interactions: g.interactions, stories: g.stories,
      });
    });
  });
  return out;
}

/** Every complaint the admin can see (the submitted ones), with where it was raised. */
export function submittedComplaints(trips) {
  const out = [];
  (trips || []).forEach((v) => {
    (v.complaints || []).forEach((c) => {
      if (isDraft(c)) return;
      const p = c.place || {};
      out.push({
        ...c,
        visitId: v.id,
        location: placeOffice(c),
        visitDate: v.date,
        visitReason: reasonText(v),
        division: p.division || v.division,
        region: p.region || v.region,
        district: p.region || v.region,
        area: p.area || v.area,
      });
    });
  });
  return out;
}

/* ---------- office renames (admin console → Offices) ---------- */

const sameOffice = (name, region, office) => name === office.name && (region || "") === (office.district || "");

/** How many visits planned or recorded something at this office. */
export const visitsAtOffice = (trips, office) => (trips || []).filter((v) =>
  (v.stops || []).some((s) => sameOffice(s.name, s.region, office)) ||
  entriesOf(v).some((e) => entryPlaces(e).some((p) => sameOffice(p.office, p.region, office)))).length;

/** Moves past visits along when an office is renamed or moved to another area / district. */
export function relinkOffice(trips, existing, form) {
  const movePlace = (p) => (p && sameOffice(p.office, p.region, existing)
    ? { ...p, office: form.name, branch: p.officeKind === "branch" ? form.name : p.branch, region: form.district, area: form.area, division: form.division }
    : p && p.branch === existing.name ? { ...p, branch: form.name } : p);
  return (trips || []).map((v) => {
    const next = {
      ...v,
      stops: (v.stops || []).map((s) => (sameOffice(s.name, s.region, existing) ? { ...s, name: form.name, region: form.district, area: form.area, division: form.division } : s)),
    };
    ENTRY_ORDER.forEach((t) => {
      const k = ENTRY_TYPES[t].list;
      next[k] = (v[k] || []).map((e) => ({ ...e, place: movePlace(e.place), ...(e.places ? { places: e.places.map(movePlace) } : {}), ...(e.branch === existing.name ? { branch: form.name } : {}) }));
    });
    return next;
  });
}

/* ---------- fixers ---------- */

/** A complaint is assigned to a unit's fixers as a group: it is in my queue if I'm a fixer of
 *  that unit (including one added after it was assigned), or was named on it when assigned. */
export function inFixerQueue(c, me) {
  if (!c.assignedEmployeeId && !c.assignedDepartmentId) return false;
  if (c.assignedDepartmentId && me.departmentId === c.assignedDepartmentId && (me.roles || []).includes("fixer")) return true;
  return c.assignedEmployeeId === me.id || (c.assignees || []).some((a) => a.id === me.id);
}
