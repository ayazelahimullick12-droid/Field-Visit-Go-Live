import { isFixed } from "../../lib/complaints";
import { average, monthBuckets, monthKeyOf, visitRatings, visitChecks, DAY_MS } from "../../lib/offices";

/* Shared numbers behind the management views: the dashboard's "Management view"
   summary and the "Network health" tab both read from these, so they always agree. */

/** Visits that were actually registered (drafts without a date don't count). */
export const registeredVisits = (visits) => visits.filter((v) => v.date && v.steps?.register !== false);

/** Every complaint, flattened with the location fields of the visit it came from. */
export function flattenComplaints(visits) {
  const out = [];
  visits.forEach((v) => (v.complaints || []).forEach((c) => out.push({
    ...c, visitDate: v.date, division: v.division, region: v.region, area: v.area, location: v.location,
  })));
  return out;
}

export function computeHealth(real, complaints, target) {
  const months = monthBuckets(6);
  const perMonth = months.map((m) => real.filter((v) => monthKeyOf(v.date) === m.key));
  const ratingByMonth = perMonth.map((vs) => average(vs.flatMap(visitRatings)));
  const filled = ratingByMonth.map((r, i) => r ?? (i > 0 ? ratingByMonth[i - 1] : null));
  const recent = real.filter((v) => (Date.now() - new Date(v.date).getTime()) / DAY_MS <= target);
  const resolved = complaints.filter(isFixed).length;
  return {
    visitsSpark: perMonth.map((v) => v.length),
    thisMonth: perMonth[5].length, lastMonth: perMonth[4].length,
    ratingSpark: filled.map((r) => (r == null ? 0 : r)),
    rating: average(real.flatMap(visitRatings)),
    ratingNow: ratingByMonth[5], ratingPrev: ratingByMonth[4],
    quality: average(recent.map((v) => visitChecks(v).score)),
    resolvedPct: complaints.length ? Math.round((resolved / complaints.length) * 100) : 0,
    open: complaints.length - resolved,
    totalComplaints: complaints.length,
  };
}
