import React from "react";

// The time window every Management page is read in, plus the window just before it
// (so the Summary can say "up 12% on the previous 30 days").

const DAY = 86400000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const PERIODS = [
  { key: "30d", label: "Last 30 days", prevLabel: "previous 30 days" },
  { key: "90d", label: "Last 90 days", prevLabel: "previous 90 days" },
  { key: "month", label: "This month", prevLabel: "last month" },
  { key: "year", label: "This year", prevLabel: "last year" },
  { key: "all", label: "All time", prevLabel: null },
];
export const periodMeta = (key) => PERIODS.find((p) => p.key === key) || PERIODS[0];

/** { from, to, prevFrom, prevTo } as Dates (`to` exclusive); null bounds mean "no limit". */
export function periodRange(key, now = new Date()) {
  const end = new Date(startOfDay(now).getTime() + DAY);
  if (key === "30d" || key === "90d") {
    const n = key === "30d" ? 30 : 90;
    const from = new Date(end.getTime() - n * DAY);
    return { from, to: end, prevFrom: new Date(from.getTime() - n * DAY), prevTo: from };
  }
  if (key === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from, to: end, prevFrom: new Date(now.getFullYear(), now.getMonth() - 1, 1), prevTo: from };
  }
  if (key === "year") {
    const from = new Date(now.getFullYear(), 0, 1);
    return { from, to: end, prevFrom: new Date(now.getFullYear() - 1, 0, 1), prevTo: from };
  }
  return { from: null, to: null, prevFrom: null, prevTo: null };
}

const inRange = (dateStr, from, to) => {
  if (!from && !to) return true;
  if (!dateStr) return false;
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00`);
  return (!from || d >= from) && (!to || d < to);
};
export const inPeriod = (dateStr, r) => inRange(dateStr, r.from, r.to);
export const inPrevPeriod = (dateStr, r) => (r.prevFrom ? inRange(dateStr, r.prevFrom, r.prevTo) : false);

export function PeriodSelect({ value, onChange }) {
  return (
    <select className="select" aria-label="Period" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "auto" }}>
      {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
    </select>
  );
}
