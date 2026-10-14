// The numbers behind the Management pages (Summary, Offices, People). Everything is
// built from the same two inputs the rest of the app uses: the raw visits (trips, with
// drafts) and expandVisits()'s one-record-per-office view of them (submitted only).

import { ENTRY_ORDER, ENTRY_TYPES, entriesOf, isDraft, voBranch, placeOffice, phaseOf } from "../../lib/visits";
import { isFixed } from "../../lib/complaints";
import { average, visitChecks, visitRatings, monthBuckets, monthKeyOf, officeKey, DAY_MS } from "../../lib/offices";
import { inPeriod } from "./periods";

export const KIND_LABEL = { branch: "Branch", vo: "VO", area: "Area office", region: "Region office" };
export const KIND_PLURAL = { branch: "Branches", vo: "VOs", area: "Area offices", region: "Region offices" };

const emptyEntryCounts = () => ({ complaints: 0, interactions: 0, observations: 0, stories: 0 });
const addEntries = (acc, rec) => { ENTRY_ORDER.forEach((t) => { const k = ENTRY_TYPES[t].list; acc[k] += (rec[k] || []).length; }); return acc; };
export const entryTotal = (c) => c.complaints + c.interactions + c.observations + c.stories;

/** Days from filing to resolution, or null. */
export function daysToResolve(c) {
  const from = c.submittedAt || c.filedDate;
  if (!from || !c.resolvedAt) return null;
  const d = (new Date(c.resolvedAt) - new Date(from)) / DAY_MS;
  return Number.isFinite(d) && d >= 0 ? d : null;
}

/* ------------------------------------ offices ------------------------------------ */

const recKey = (r) => (r.officeKind === "branch" && r.region ? `${r.region}::${r.location}` : `${r.officeKind}::${r.location}`);

/**
 * One row per office of every kind — branches from the master list (so never-visited
 * ones show as 0), the known VOs, and every area / region office anyone recorded at.
 * Counts are for the period; "last visit" is all-time.
 */
export function officeRows(records, offices, range) {
  const rows = new Map();
  const ensure = (key, base) => {
    if (!rows.has(key)) rows.set(key, { key, ...base, all: [], records: [] });
    return rows.get(key);
  };
  (offices || []).filter((o) => o.active !== false).forEach((o) => ensure(officeKey(o), {
    name: o.name, kind: "branch", division: o.division, region: o.district, area: o.area, parent: o.area, office: o,
  }));

  (records || []).forEach((r) => {
    const kind = r.officeKind || "branch";
    let row = rows.get(recKey(r)) || (kind === "branch" ? [...rows.values()].find((x) => x.kind === "branch" && x.name === r.location) : null);
    if (!row) {
      row = ensure(recKey(r), {
        name: r.location, kind, division: r.division, region: r.region, area: r.area,
        parent: kind === "vo" ? r.branch || voBranch(r.location) : kind === "branch" ? r.area : kind === "area" ? r.region : r.division,
      });
    }
    if (!row.division) Object.assign(row, { division: r.division, region: r.region, area: r.area });
    row.all.push(r);
    if (inPeriod(r.date, range)) row.records.push(r);
  });

  return [...rows.values()].map((row) => {
    const last = [...row.all].sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
    const recs = row.records;
    const complaints = recs.flatMap((r) => r.complaints || []);
    return {
      ...row,
      visits: recs.length,
      staff: new Set(recs.map((r) => r.employeeId)).size,
      entries: recs.reduce(addEntries, emptyEntryCounts()),
      avgRating: average(recs.flatMap(visitRatings)),
      quality: average(recs.map((r) => visitChecks(r).score)),
      openComplaints: complaints.filter((c) => !isFixed(c)).length,
      lastDate: last?.date || null, lastBy: last?.employeeName || null,
    };
  });
}

/* ------------------------------------ people ------------------------------------ */

/** Every person who can make visits, plus anyone with visits who is no longer on the employee list. */
export function peopleList(employees, trips) {
  const list = (employees || []).map((e) => ({ ...e, former: false }));
  const known = new Set(list.map((e) => e.id));
  (trips || []).forEach((v) => {
    if (v.employeeId && !known.has(v.employeeId)) {
      known.add(v.employeeId);
      list.push({ id: v.employeeId, name: v.employeeName || "Unknown", roles: [], former: true });
    }
  });
  return list;
}

/** What one person did in the period. `trips` = raw visits, `records` = expandVisits(trips). */
export function personStats(person, trips, records, range) {
  const mine = trips.filter((v) => v.employeeId === person.id);
  const inP = mine.filter((v) => v.date && inPeriod(v.date, range));
  const recs = records.filter((r) => r.employeeId === person.id && inPeriod(r.date, range));
  const submitted = inP.flatMap((v) => entriesOf(v).filter((e) => !isDraft(e)));
  const byType = emptyEntryCounts();
  submitted.forEach((e) => { byType[ENTRY_TYPES[e.type].list] += 1; });
  const complaints = submitted.filter((e) => e.type === "complaint");
  const last = [...mine].filter((v) => v.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const months = monthBuckets(6);
  return {
    trips: inP.length,
    done: inP.filter((v) => v.status === "done").length,
    notDone: inP.filter((v) => phaseOf(v) === "due").length,
    offices: new Set(recs.map((r) => r.location)).size,
    entries: byType,
    entryCount: submitted.length,
    drafts: inP.reduce((s, v) => s + entriesOf(v).filter(isDraft).length, 0),
    complaints: complaints.length,
    resolved: complaints.filter(isFixed).length,
    avgRating: average(recs.flatMap(visitRatings)),
    quality: average(recs.map((r) => visitChecks(r).score)),
    lastDate: last?.date || null,
    spark: months.map((m) => mine.filter((v) => monthKeyOf(v.date) === m.key).length),
  };
}

/** Offices one person has been to (period), most visited first. */
export function placesOf(person, records, range) {
  const m = new Map();
  records.filter((r) => r.employeeId === person.id && inPeriod(r.date, range)).forEach((r) => {
    const k = `${r.officeKind}::${r.region || ""}::${r.location}`;
    const row = m.get(k) || { key: k, name: r.location, kind: r.officeKind || "branch", where: [r.area, r.region].filter(Boolean).join(" · "), count: 0, last: "", entries: emptyEntryCounts() };
    row.count += 1;
    if ((r.date || "") > row.last) row.last = r.date;
    addEntries(row.entries, r);
    m.set(k, row);
  });
  return [...m.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
}

/** Every submitted entry by one person (period), newest first, with the visit it belongs to. */
export function entriesBy(person, trips, range) {
  return trips
    .filter((v) => v.employeeId === person.id && v.date && inPeriod(v.date, range))
    .flatMap((v) => entriesOf(v).filter((e) => !isDraft(e)).map((e) => ({ ...e, visit: v, office: placeOffice(e) })))
    .sort((a, b) => (b.submittedAt || b.time || "").localeCompare(a.submittedAt || a.time || ""));
}
