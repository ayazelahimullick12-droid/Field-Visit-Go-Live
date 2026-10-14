// Complaint statuses, shared by the staff app, the admin console and the analytics.
//
//   Waiting      submitted, not yet assigned by the admin
//   Assigned     the admin assigned it to a unit's fixers and set a deadline
//   In Progress  one of the fixers has started work on it
//   Fixed        a fixer marked it fixed (optionally saying what was done)
//   Long Term    a fixer marked it as needing longer-term work; no deadline reminders
//
// Older records used Open / In Progress / Resolved; the server upgrades them on start,
// and statusOf() reads the old words too in case a phone still holds an old copy.

export const STATUSES = ["Waiting", "Assigned", "In Progress", "Fixed", "Long Term"];
export const STATUS_HELP = {
  Waiting: "Submitted and awaiting assignment by the admin.",
  Assigned: "Assigned to the unit's fixers, with a deadline.",
  "In Progress": "A fixer is working on it.",
  Fixed: "Marked fixed by a fixer.",
  "Long Term": "Needs longer-term work; tracked without a deadline.",
};
export const STATUS_COLORS = {
  Waiting: "var(--danger)", Assigned: "var(--info)", "In Progress": "var(--series-2)", Fixed: "var(--success)", "Long Term": "var(--warning)",
};

const LEGACY = { Open: "Waiting", Resolved: "Fixed" };

export const statusOf = (c) => LEGACY[c?.status] || c?.status || "Waiting";
export const statusClass = (c) => `status-pill status-${statusOf(c).replace(/\s/g, "")}`;
export const isFixed = (c) => statusOf(c) === "Fixed";
export const isLongTerm = (c) => statusOf(c) === "Long Term";
/** Still needs action: everything except Fixed (Long Term included). */
export const isOpen = (c) => !isFixed(c);
export const isAssigned = (c) => ["Assigned", "In Progress", "Fixed", "Long Term"].includes(statusOf(c)) || !!c?.assignedEmployeeId;

/** Past its deadline and still being worked on (Long Term has no deadline pressure). */
export const isLate = (c, now = new Date()) => ["Assigned", "In Progress"].includes(statusOf(c)) && !!c.deadline && new Date(c.deadline) < now;
/** Fixed by its (latest) deadline. */
export const fixedOnTime = (c) => isFixed(c) && (!c.deadline || !c.resolvedAt || new Date(c.resolvedAt) <= new Date(c.deadline));

export function firstWords(text, n) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  return words.length > n ? `${words.slice(0, n).join(" ")}…` : words.join(" ");
}
/** The complaint's title, or the start of its description for older complaints without one. */
export const complaintTitle = (c) => (c?.title || "").trim() || firstWords(c?.description, 8) || (c?.voice ? "Voice note action item" : "Untitled action item");
