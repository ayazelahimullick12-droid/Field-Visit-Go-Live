import React, { useEffect, useMemo, useState } from "react";
import {
  MapPin, Building2, Users, CheckCheck, Radar, EyeOff, Hourglass, ShieldCheck, Star, MessageSquare, Eye, Image as ImageIcon,
  MessageCircle, CheckCircle2, Timer, Clock, Inbox, AlertTriangle, PauseCircle, CalendarX, FileWarning, UserX, ChevronRight, X, Filter, RotateCcw,
} from "lucide-react";
import { Reveal } from "../../lib/ui";
import { TrendLineChart, RankedBarChart, StackedBarChart } from "../../lib/charts";
import { Kpi, DeltaChip, LocationFilterBar, EMPTY_LOCATION_FILTER, matchesLocation, drillFieldFor, DRILL_LABELS } from "../analytics/common";
import { average, visitChecks, visitRatings, computeCoverage, coverageSummary, monthBuckets, monthKeyOf, CHECK_LABELS, STATUS_META, timeAgo, DAY_MS } from "../../lib/offices";
import { submittedComplaints, entriesOf, entryPlaces, isDraft, phaseOf, plural, reasonText } from "../../lib/visits";
import { STATUSES, STATUS_COLORS, statusOf, isFixed, isLate, fixedOnTime, complaintTitle } from "../../lib/complaints";
import { PERIODS, periodRange } from "./periods";
import { daysToResolve, peopleList } from "./data";
import Portal from "../../lib/Portal";

/* Management → Summary: how the field-visit programme is performing. Every number reads the same
   filters (time, location, staff department), every tile opens a detailed breakdown, and the
   arrows compare with the same-length period just before. */

const DEFAULT_FILTERS = { period: "30d", from: "", to: "", loc: EMPTY_LOCATION_FILTER, dept: "All" };
const filedOn = (c) => c.submittedAt || c.filedDate || c.visitDate;
const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);
const r1 = (n) => (n == null ? null : Number(n.toFixed(1)));
const inR = (d, a, b) => {
  if (!a && !b) return true;
  if (!d) return false;
  const x = new Date(`${String(d).slice(0, 10)}T00:00`);
  return (!a || x >= a) && (!b || x < b);
};
function rangeOf(f) {
  if (f.period !== "custom") return periodRange(f.period);
  if (!f.from || !f.to || f.to < f.from) return periodRange("all");
  const from = new Date(`${f.from}T00:00`), to = new Date(new Date(`${f.to}T00:00`).getTime() + DAY_MS);
  return { from, to, prevFrom: new Date(from.getTime() - (to - from)), prevTo: from };
}
const periodLabel = (f) => (f.period === "custom" ? (f.from && f.to ? `${f.from} to ${f.to}` : "All time") : PERIODS.find((p) => p.key === f.period)?.label || "");

function groupCount(list, keyFn, valueFn = () => 1) {
  const m = new Map();
  list.forEach((x) => { const k = keyFn(x) || "Not set"; m.set(k, (m.get(k) || 0) + valueFn(x)); });
  return [...m.entries()].map(([label, value]) => ({ label, value, color: "var(--series-1)" })).sort((a, b) => b.value - a.value);
}
function groupAvg(list, keyFn, valsFn) {
  const m = new Map();
  list.forEach((x) => { const k = keyFn(x) || "Not set"; m.set(k, [...(m.get(k) || []), ...valsFn(x)]); });
  return [...m.entries()].filter(([, v]) => v.length).map(([label, v]) => ({ label, value: r1(average(v)), n: v.length, color: "var(--series-2)" })).sort((a, b) => b.value - a.value);
}

/* ------------------------------------------------------------------------------------------ */

export default function Summary({ trips, records, coverage: _coverage, offices = [], employees, settings, period = "30d", onGo, onOpenPerson, publicView = false }) {
  const target = settings?.visitTargetDays || 90;
  const [f, setF] = useState({ ...DEFAULT_FILTERS, period });
  const [open, setOpen] = useState(null); // the tile whose breakdown is showing
  const loc = f.loc;

  const empById = useMemo(() => new Map((employees || []).map((e) => [e.id, e])), [employees]);
  const deptOf = (id) => empById.get(id)?.department || "Not set";
  const departments = useMemo(() => [...new Set((employees || []).map((e) => e.department).filter(Boolean))].sort(), [employees]);

  const D = useMemo(() => {
    const r = rangeOf(f);
    const deptOk = (id) => f.dept === "All" || deptOf(id) === f.dept;
    const tripById = new Map(trips.map((v) => [v.id, v]));
    const tripInLoc = (v) => {
      if (loc.division !== "All" && v.division !== loc.division) return false;
      if (loc.region !== "All" && v.region !== loc.region) return false;
      if (loc.area !== "All" && v.area !== loc.area) return false;
      if (loc.branch !== "All" && !(v.stops || []).some((s) => s.name === loc.branch)
        && !entriesOf(v).some((e) => entryPlaces(e).some((p) => p.office === loc.branch || p.branch === loc.branch))) return false;
      return true;
    };
    const tripsBase = trips.filter((v) => v.date && tripInLoc(v) && deptOk(v.employeeId));
    const tripsIn = tripsBase.filter((v) => inR(v.date, r.from, r.to));
    const tripsPrev = r.prevFrom ? tripsBase.filter((v) => inR(v.date, r.prevFrom, r.prevTo)) : null;
    const recBase = records.filter((x) => x.date && matchesLocation(x, loc) && deptOk(x.employeeId));
    const recIn = recBase.filter((x) => inR(x.date, r.from, r.to));
    const recPrev = r.prevFrom ? recBase.filter((x) => inR(x.date, r.prevFrom, r.prevTo)) : null;
    const cBase = submittedComplaints(trips).filter((c) => matchesLocation(c, loc) && deptOk(tripById.get(c.visitId)?.employeeId))
      .map((c) => ({ ...c, employeeId: tripById.get(c.visitId)?.employeeId }));
    const filedIn = cBase.filter((c) => inR(filedOn(c), r.from, r.to));
    const filedPrev = r.prevFrom ? cBase.filter((c) => inR(filedOn(c), r.prevFrom, r.prevTo)) : null;
    const fixedIn = cBase.filter((c) => isFixed(c) && inR(c.resolvedAt, r.from, r.to));
    const fixedPrev = r.prevFrom ? cBase.filter((c) => isFixed(c) && inR(c.resolvedAt, r.prevFrom, r.prevTo)) : null;
    const officesInLoc = offices.filter((o) => o.active !== false && matchesLocation({ division: o.division, region: o.district, area: o.area, location: o.name }, loc));
    const cov = computeCoverage(officesInLoc, recBase, target);
    const covSum = coverageSummary(cov);
    const people = peopleList(employees, trips).filter((p) => !p.former && deptOk(p.id));
    const sub = (list, type) => list.flatMap((v) => entriesOf(v, type).filter((e) => !isDraft(e)).map((e) => ({ ...e, visit: v })));
    const now = Date.now();

    const m = {
      r, tripsBase, tripsIn, tripsPrev, recBase, recIn, recPrev, cBase, filedIn, filedPrev, fixedIn, fixedPrev, cov, covSum, people,
      interactions: sub(tripsIn, "interaction"), interactionsPrev: tripsPrev && sub(tripsPrev, "interaction"),
      observations: sub(tripsIn, "observation"), observationsPrev: tripsPrev && sub(tripsPrev, "observation"),
      stories: sub(tripsIn, "story"), storiesPrev: tripsPrev && sub(tripsPrev, "story"),
      activeIds: new Set(tripsIn.map((v) => v.employeeId)),
      activePrev: tripsPrev ? new Set(tripsPrev.map((v) => v.employeeId)).size : null,
      ended: tripsIn.filter((v) => ["done", "due"].includes(phaseOf(v))),
      endedPrev: tripsPrev ? tripsPrev.filter((v) => ["done", "due"].includes(phaseOf(v))) : null,
      waiting: cBase.filter((c) => statusOf(c) === "Waiting"),
      late: cBase.filter((c) => isLate(c)),
      longTerm: cBase.filter((c) => statusOf(c) === "Long Term"),
      notDone: tripsBase.filter((v) => phaseOf(v) === "due"),
      lostDrafts: tripsBase.filter((v) => v.status === "done").flatMap((v) => entriesOf(v).filter(isDraft)),
      waitingLong: cBase.filter((c) => statusOf(c) === "Waiting" && now - new Date(filedOn(c)).getTime() > 2 * DAY_MS),
    };
    m.idle = people.filter((p) => !m.activeIds.has(p.id) && (trips.some((v) => v.employeeId === p.id) || (p.roles || []).includes("field")));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, records, offices, employees, f, target]);

  /* ---------- the tiles ---------- */
  const quality = (list) => average(list.map((x) => visitChecks(x).score));
  const rating = (list) => average(list.flatMap(visitRatings));
  const officesN = (list) => new Set(list.map((x) => x.location)).size;
  const fixRate = (list) => pct(list.filter(isFixed).length, list.length);
  const onTimeRate = (list) => pct(list.filter(fixedOnTime).length, list.length);
  const avgDays = (list) => average(list.map(daysToResolve).filter((d) => d != null));
  const doneRate = (list) => pct(list.filter((v) => v.status === "done").length, list.length);
  const prev = (fn, list) => (list ? fn(list) : null);

  const T = {
    visits: { section: "activity", icon: MapPin, label: "Visits", value: D.tripsIn.length, prev: D.tripsPrev?.length, def: "Visits with a visit date in the period." },
    offices: { section: "activity", icon: Building2, tone: "blue", label: "Offices reached", value: officesN(D.recIn), prev: prev(officesN, D.recPrev), def: "Distinct offices with a completed visit or a submitted entry." },
    staff: { section: "activity", icon: Users, tone: "blue", label: "Active staff", value: D.activeIds.size, prev: D.activePrev, foot: `of ${D.people.length}`, def: "Staff who made at least one visit in the period." },
    completion: { section: "activity", icon: CheckCheck, tone: "green", label: "Visits marked done", value: doneRate(D.ended), prev: prev(doneRate, D.endedPrev), suffix: "%", def: "Of visits whose return date has passed, the share marked as done." },
    coverage: { section: "coverage", icon: Radar, tone: D.covSum.pct >= 80 ? "green" : D.covSum.pct >= 50 ? "amber" : "red", label: `Coverage (visited in ${target} days)`, value: D.covSum.pct, suffix: "%", foot: `${D.covSum.ok} of ${D.covSum.total}`, def: `Branches visited within the ${target}-day visit target. Not affected by the time filter.` },
    never: { section: "coverage", icon: EyeOff, tone: "red", label: "Never visited", value: D.covSum.never, good: "down", def: "Branches with no visit on record." },
    overdue: { section: "coverage", icon: Hourglass, tone: "amber", label: `Overdue (> ${target} days)`, value: D.covSum.stale, good: "down", def: `Branches last visited more than ${target} days ago.` },
    quality: { section: "quality", icon: ShieldCheck, tone: "green", label: "Info completeness", value: quality(D.recIn), prev: prev(quality, D.recPrev), scale: 100, suffix: "%", def: "Each office visit is scored on five equal checks: registered, observation, rated client interaction, something recorded, and detail captured." },
    rating: { section: "quality", icon: Star, tone: "amber", label: "Avg client rating", value: rating(D.recIn), prev: prev(rating, D.recPrev), decimals: 1, suffix: "★", def: "Average of client interaction ratings (1–5 stars)." },
    interactions: { section: "quality", icon: MessageSquare, tone: "blue", label: "Client interactions", value: D.interactions.length, prev: D.interactionsPrev?.length, def: "Submitted client interactions." },
    observations: { section: "quality", icon: Eye, label: "Observations", value: D.observations.length, prev: D.observationsPrev?.length, def: "Submitted observations, including those referred by BRAC staff." },
    stories: { section: "quality", icon: ImageIcon, label: "Stories", value: D.stories.length, prev: D.storiesPrev?.length, def: "Published stories, with their likes and comments." },
    filed: { section: "complaints", icon: MessageCircle, tone: "red", label: "Action items filed", value: D.filedIn.length, prev: D.filedPrev?.length, good: "down", def: "Action items submitted in the period." },
    fixRate: { section: "complaints", icon: CheckCircle2, tone: "green", label: "Fix rate", value: fixRate(D.filedIn), prev: prev(fixRate, D.filedPrev), suffix: "%", def: "Share of action items filed in the period that are now fixed." },
    onTime: { section: "complaints", icon: Timer, tone: "green", label: "Fixed on time", value: onTimeRate(D.fixedIn), prev: prev(onTimeRate, D.fixedPrev), suffix: "%", def: "Of action items fixed in the period, the share fixed by their deadline." },
    days: { section: "complaints", icon: Clock, label: "Avg days to fix", value: avgDays(D.fixedIn), prev: prev(avgDays, D.fixedPrev), decimals: 1, good: "down", def: "Average days from submission to fix, for action items fixed in the period." },
    waiting: { section: "complaints", icon: Inbox, tone: "red", label: "Waiting for assignment", value: D.waiting.length, good: "down", def: "Action items not yet assigned by the admin (current, any filing date)." },
    late: { section: "complaints", icon: AlertTriangle, tone: "red", label: "Past deadline", value: D.late.length, good: "down", def: "Assigned or in-progress action items past their deadline (current)." },
    longTerm: { section: "complaints", icon: PauseCircle, tone: "amber", label: "Long term", value: D.longTerm.length, def: "Action items a fixer marked as needing longer-term work (current)." },
  };
  const SECTIONS = [
    ["activity", "Field activity"], ["coverage", "Network coverage"], ["quality", "Information gathered"], ["complaints", "Action item handling"],
  ];
  const meta = PERIODS.find((p) => p.key === f.period);
  const compare = f.period !== "all" && !(f.period === "custom" && !(f.from && f.to));

  const tileValue = (t) => (t.value == null ? "—" : t.scale ? Math.round(t.value * t.scale) : t.decimals ? r1(t.value) : t.value);
  const tileDelta = (t) => {
    if (!compare || t.prev == null || t.value == null) return null;
    return <DeltaChip current={t.value} previous={t.prev} goodWhenDown={t.good === "down"} />;
  };

  const attention = [
    { n: D.covSum.never, icon: EyeOff, tone: "red", text: `${plural(D.covSum.never, "branch", "branches")} never visited`, go: "never" },
    { n: D.late.length, icon: AlertTriangle, tone: "red", text: `${plural(D.late.length, "action item")} past deadline`, go: "late" },
    { n: D.waitingLong.length, icon: Inbox, tone: "amber", text: `${plural(D.waitingLong.length, "action item")} awaiting assignment for over 2 days`, go: "waiting" },
    { n: D.covSum.stale, icon: Hourglass, tone: "amber", text: `${plural(D.covSum.stale, "branch", "branches")} overdue for a visit (> ${target} days)`, go: "overdue" },
    { n: D.notDone.length, icon: CalendarX, tone: "amber", text: `${plural(D.notDone.length, "visit")} past the return date but not marked done`, go: "completion" },
    { n: D.idle.length, icon: UserX, tone: "amber", text: `${plural(D.idle.length, "staff member")} with no visits (${periodLabel(f).toLowerCase()})`, go: "staff" },
    { n: D.longTerm.length, icon: PauseCircle, tone: "", text: `${plural(D.longTerm.length, "action item")} marked long term`, go: "longTerm" },
    { n: D.lostDrafts.length, icon: FileWarning, tone: "", text: `${plural(D.lostDrafts.length, "entry", "entries")} left as drafts on closed visits`, go: "quality" },
  ].filter((a) => a.n > 0);

  const months12 = useMemo(() => monthBuckets(12), []);
  const trendVisits = months12.map((mo) => D.tripsBase.filter((v) => monthKeyOf(v.date) === mo.key).length);
  const trendComplaints = months12.map((mo) => D.cBase.filter((c) => monthKeyOf(filedOn(c)) === mo.key).length);
  const trendFixed = months12.map((mo) => D.cBase.filter((c) => isFixed(c) && monthKeyOf(c.resolvedAt) === mo.key).length);
  const filtersOn = f.loc !== EMPTY_LOCATION_FILTER && Object.values(f.loc).some((v) => v !== "All") || f.dept !== "All" || f.period !== DEFAULT_FILTERS.period;

  return (
    <>
      {!publicView && (
        <div className="card card-pad sum-filters">
          <div className="sf-title"><Filter size={14} /> Filters {filtersOn && <button className="mf-clear" onClick={() => setF(DEFAULT_FILTERS)}><RotateCcw size={12} /> Reset</button>}</div>
          <div className="sf-row">
            <div className="mf-field">
              <span className="mf-label">Time</span>
              <select className="select" aria-label="Time period" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })}>
                {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                <option value="custom">Custom range</option>
              </select>
            </div>
            {f.period === "custom" && (
              <>
                <div className="mf-field"><span className="mf-label">From</span><input type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
                <div className="mf-field"><span className="mf-label">To</span><input type="date" className="input" value={f.to} min={f.from || undefined} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
              </>
            )}
            <LocationFilterBar offices={offices} value={loc} onChange={(next) => setF({ ...f, loc: next })} labelled />
            <div className="mf-field">
              <span className="mf-label">Staff department</span>
              <select className="select" aria-label="Staff department" value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })}>
                <option value="All">All departments</option>
                {departments.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      <p className="h-desc" style={{ marginTop: 0, marginBottom: 18 }}>
        <b>{periodLabel(f)}:</b> {plural(D.tripsIn.length, "visit")} by {plural(D.activeIds.size, "staff member")} to {plural(T.offices.value, "office")};{" "}
        {plural(D.filedIn.length, "action item")} filed and {D.fixedIn.length} fixed.
        {compare && meta?.prevLabel && <span style={{ color: "var(--ink-faint)" }}> Arrows compare with the {meta.prevLabel}.</span>}
        {compare && f.period === "custom" && <span style={{ color: "var(--ink-faint)" }}> Arrows compare with the preceding period of the same length.</span>}
        {!publicView && <span style={{ color: "var(--ink-faint)" }}> Select any figure for a detailed breakdown.</span>}
      </p>

      {SECTIONS.map(([key, title]) => (
        <section key={key} className="sum-section">
          <h2 className="sum-h">{title}</h2>
          <div className="kpi-grid">
            {Object.entries(T).filter(([, t]) => t.section === key).map(([k, t], i) => (
              <Reveal i={i} key={k}>
                <button type="button" className="kpi-click" disabled={publicView} onClick={() => setOpen(k)} aria-label={`${t.label}: show breakdown`}>
                  <Kpi icon={t.icon} tone={t.tone} label={t.label} value={tileValue(t)} decimals={t.decimals || 0} suffix={t.value == null ? "" : t.suffix || ""}
                       delta={tileDelta(t)} foot={t.foot ? <span className="pill pill-brand">{t.foot}</span> : null} />
                </button>
              </Reveal>
            ))}
          </div>
        </section>
      ))}

      <div className={publicView ? "" : "analytics-grid"} style={{ marginTop: 6 }}>
        {!publicView && <Reveal className="card card-pad" style={{ minWidth: 0 }}>
          <p className="analytics-card-title">Needs attention</p>
          <p className="analytics-card-sub">Current issues within the selected location and department.{publicView ? "" : " Select one for details."}</p>
          {attention.length === 0 ? <div className="viz-empty">Nothing needs attention.</div> : attention.map((a) => (
            <button key={a.text} type="button" className="attn-row" disabled={publicView} onClick={() => setOpen(a.go)}>
              <span className={`kpi-icon ${a.tone}`}><a.icon size={15} /></span>
              <span className="attn-main"><span className="attn-name">{a.text}</span></span>
              {!publicView && <ChevronRight size={15} color="var(--ink-faint)" />}
            </button>
          ))}
        </Reveal>}
        <Reveal className="card card-pad" i={1} style={{ minWidth: 0 }}>
          <p className="analytics-card-title">Visits, action items and fixes per month</p>
          <p className="analytics-card-sub">Last 12 months, for the selected location and department.</p>
          <TrendLineChart labels={months12.map((mo) => mo.label)} height={220} series={[
            { key: "v", label: "Visits", color: "var(--series-1)", values: trendVisits },
            { key: "c", label: "Action items filed", color: "var(--series-3)", values: trendComplaints },
            { key: "x", label: "Action items fixed", color: "var(--success)", values: trendFixed },
          ]} />
        </Reveal>
      </div>

      {open && !publicView && (
        <Insight title={T[open]?.label} def={T[open]?.def} value={T[open] ? `${tileValue(T[open])}${T[open].value == null ? "" : T[open].suffix || ""}` : ""} scope={periodLabel(f)} onClose={() => setOpen(null)}>
          <Drill k={open} D={D} loc={loc} deptOf={deptOf} target={target} months12={months12} onOpenPerson={onOpenPerson} />
        </Insight>
      )}
    </>
  );
}

/* ------------------------------------ breakdown modal ------------------------------------ */

function Insight({ title, def, value, scope, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <Portal>
      <div className="modal-veil" onClick={onClose}>
        <div className="modal-box insight" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <div>
              <p className="h-eyebrow" style={{ marginBottom: 2 }}>Breakdown · {scope}</p>
              <h1 className="h-title" style={{ fontSize: 20 }}>{title} <span className="ins-value">{value}</span></h1>
              {def && <p className="field-hint" style={{ margin: "4px 0 0" }}>{def}</p>}
            </div>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><X size={15} /></button>
          </div>
          <div className="modal-body"><div className="ins-grid">{children}</div></div>
        </div>
      </div>
    </Portal>
  );
}

const Panel = ({ title, sub, wide, children }) => (
  <div className={`ins-panel ${wide ? "wide" : ""}`}>
    <p className="analytics-card-title">{title}</p>
    {sub && <p className="analytics-card-sub">{sub}</p>}
    {children}
  </div>
);

function MiniTable({ cols, rows, limit = 12, empty = "Nothing to show." }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <div className="viz-empty">{empty}</div>;
  const shown = all ? rows : rows.slice(0, limit);
  return (
    <>
      <div className="ctable-wrap"><table className="ctable stack">
        <thead><tr>{cols.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead>
        <tbody>{shown.map((r, i) => (
          <tr key={r.key || i} style={r.onClick ? { cursor: "pointer" } : undefined} onClick={r.onClick}>
            {cols.map((c) => <td key={c.label} data-label={c.label}>{c.get(r)}</td>)}
          </tr>
        ))}</tbody>
      </table></div>
      {rows.length > limit && <div style={{ textAlign: "center", marginTop: 10 }}><button className="btn btn-secondary btn-sm" onClick={() => setAll((a) => !a)}>{all ? "Show fewer" : `Show all ${rows.length}`}</button></div>}
    </>
  );
}

/** The detail behind one tile. */
function Drill({ k, D, loc, deptOf, target, months12, onOpenPerson }) {
  const field = drillFieldFor(loc) || "location";
  const levelLabel = DRILL_LABELS[field] || "Office";
  const locKey = (x) => (field === "division" ? (x.division || "").replace(/ Division$/, "") : x[field]);
  const trend = (list, dateFn) => months12.map((mo) => list.filter((x) => monthKeyOf(dateFn(x)) === mo.key).length);
  const trendChart = (label, values, color = "var(--series-1)") => (
    <TrendLineChart labels={months12.map((mo) => mo.label)} height={180} showLegend={false} series={[{ key: "t", label, color, values }]} />
  );
  const name = (id) => D.people.find((p) => p.id === id)?.name || "Unknown";
  const staffRow = (id) => ({ key: id, onClick: onOpenPerson ? () => onOpenPerson(id) : undefined });
  const complaintCols = [
    { label: "Code", get: (c) => <span className="mono">{c.id}</span> },
    { label: "Action item", get: (c) => <><div className="cell-main">{complaintTitle(c)}</div><div className="cell-sub">{c.location}</div></> },
    { label: "Unit", get: (c) => c.department },
    { label: "Status", get: (c) => <span className={`status-pill status-${statusOf(c).replace(/\s/g, "")}`}>{statusOf(c)}</span> },
    { label: "Filed", get: (c) => (filedOn(c) || "").slice(0, 10) },
  ];
  const complaintPanels = (list, title) => [
    <Panel key="st" title="By status"><RankedBarChart items={STATUSES.map((s) => ({ label: s, value: list.filter((c) => statusOf(c) === s).length, color: STATUS_COLORS[s] }))} /></Panel>,
    <Panel key="u" title="By unit"><RankedBarChart items={groupCount(list, (c) => c.department).slice(0, 10)} wide /></Panel>,
    <Panel key="l" title={`By ${levelLabel.toLowerCase()}`}><RankedBarChart items={groupCount(list, locKey).slice(0, 10)} /></Panel>,
    <Panel key="d" title="By staff department (filed by)"><RankedBarChart items={groupCount(list, (c) => deptOf(c.employeeId)).slice(0, 10)} wide /></Panel>,
    <Panel key="t" title={title} wide><MiniTable cols={complaintCols} rows={[...list].sort((a, b) => (filedOn(b) || "").localeCompare(filedOn(a) || ""))} /></Panel>,
  ];

  switch (k) {
    case "visits":
      return [
        <Panel key="t" title="Visits per month" sub="Last 12 months">{trendChart("Visits", trend(D.tripsBase, (v) => v.date))}</Panel>,
        <Panel key="l" title={`Office visits by ${levelLabel.toLowerCase()}`} sub="One visit to three offices counts three times"><RankedBarChart items={groupCount(D.recIn, locKey).slice(0, 12)} /></Panel>,
        <Panel key="r" title="Purpose of visit"><RankedBarChart items={groupCount(D.tripsIn, (v) => reasonText(v))} wide /></Panel>,
        <Panel key="d" title="By staff department"><RankedBarChart items={groupCount(D.tripsIn, (v) => deptOf(v.employeeId))} wide /></Panel>,
        <Panel key="s" title="Most active staff" wide>
          <MiniTable cols={[{ label: "Staff", get: (r) => r.label }, { label: "Department", get: (r) => r.dept }, { label: "Visits", get: (r) => <b>{r.value}</b> }]}
            rows={groupCount(D.tripsIn, (v) => v.employeeId).map((r) => ({ ...r, ...staffRow(r.label), label: name(r.label), dept: deptOf(r.label) }))} />
        </Panel>,
      ];
    case "offices": {
      const byOffice = groupCount(D.recIn, (x) => x.location);
      return [
        <Panel key="k" title="By office type"><RankedBarChart items={groupCount(D.recIn, (x) => ({ branch: "Branch office", vo: "VO", area: "Area office", region: "Regional office" })[x.officeKind] || "Branch office")} wide /></Panel>,
        <Panel key="l" title={`Offices reached by ${levelLabel.toLowerCase()}`}><RankedBarChart items={groupCount([...new Map(D.recIn.map((x) => [x.location, x])).values()], locKey).slice(0, 12)} /></Panel>,
        <Panel key="t" title="Most visited offices" wide>
          <MiniTable cols={[{ label: "Office", get: (r) => r.label }, { label: "Office visits", get: (r) => <b>{r.value}</b> }]} rows={byOffice} />
        </Panel>,
      ];
    }
    case "staff":
      return [
        <Panel key="d" title="Active staff by department"><RankedBarChart items={groupCount([...D.activeIds], (id) => deptOf(id))} wide /></Panel>,
        <Panel key="t" title="Active staff per month" sub="Distinct staff with a visit">{trendChart("Active staff", months12.map((mo) => new Set(D.tripsBase.filter((v) => monthKeyOf(v.date) === mo.key).map((v) => v.employeeId)).size), "var(--info)")}</Panel>,
        <Panel key="i" title="No visits in the period" wide>
          <MiniTable cols={[{ label: "Staff", get: (p) => p.name }, { label: "Designation", get: (p) => p.designation || "—" }, { label: "Department", get: (p) => p.department || "—" }]}
            rows={D.idle.map((p) => ({ ...p, ...staffRow(p.id) }))} empty="Everyone made at least one visit." />
        </Panel>,
      ];
    case "completion":
      return [
        <Panel key="d" title="Marked done, by staff department"><RankedBarChart items={groupAvg(D.ended, (v) => deptOf(v.employeeId), (v) => [v.status === "done" ? 100 : 0])} valueSuffix="%" max={100} wide /></Panel>,
        <Panel key="l" title="Phase of visits in the period"><RankedBarChart items={groupCount(D.tripsIn, (v) => ({ done: "Done", due: "Not marked done", progress: "In progress", upcoming: "Upcoming" })[phaseOf(v)])} wide /></Panel>,
        <Panel key="n" title="Past the return date, not marked done" wide>
          <MiniTable cols={[{ label: "Visit", get: (v) => <span className="mono">{v.id}</span> }, { label: "Staff", get: (v) => v.employeeName }, { label: "Area", get: (v) => v.area || "—" }, { label: "Returned", get: (v) => v.returnDate }]}
            rows={D.notDone.map((v) => ({ ...v, key: v.id }))} empty="All finished visits are marked done." />
        </Panel>,
      ];
    case "coverage": case "never": case "overdue": {
      const rows = k === "coverage" ? D.cov : D.cov.filter((o) => o.status === (k === "never" ? "never" : "stale"));
      const covBy = (fld) => {
        const m = new Map();
        D.cov.forEach((o) => { const key = fld === "division" ? (o.division || "").replace(/ Division$/, "") : o[fld === "region" ? "district" : fld === "location" ? "name" : fld]; const x = m.get(key) || { label: key, ok: 0, stale: 0, never: 0 }; x[o.status]++; m.set(key, x); });
        return [...m.values()].sort((a, b) => a.ok / (a.ok + a.stale + a.never) - b.ok / (b.ok + b.stale + b.never));
      };
      return [
        <Panel key="b" title={`Coverage by ${levelLabel.toLowerCase()}`} sub="Weakest first" wide>
          <StackedBarChart rows={covBy(field).map((b) => ({ label: b.label, segments: [{ key: "ok", value: b.ok }, { key: "stale", value: b.stale }, { key: "never", value: b.never }] }))}
            segmentDefs={[{ key: "ok", label: `Visited within ${target} days`, color: "var(--success)" }, { key: "stale", label: "Overdue", color: "var(--warning)" }, { key: "never", label: "Never visited", color: "var(--danger)" }]} />
        </Panel>,
        <Panel key="t" title={k === "coverage" ? "All branches" : k === "never" ? "Never visited" : "Overdue"} wide>
          <MiniTable cols={[
            { label: "Branch", get: (o) => <><div className="cell-main">{o.name}</div><div className="cell-sub">{o.area} · {o.district}</div></> },
            { label: "Status", get: (o) => <span className={`pill ${STATUS_META[o.status].pill}`}>{STATUS_META[o.status].short}</span> },
            { label: "Last visit", get: (o) => (o.lastDate ? `${timeAgo(o.daysSince)} · ${o.lastBy}` : "Never") },
            { label: "Visits", get: (o) => o.visitCount },
          ]} rows={[...rows].sort((a, b) => (b.daysSince ?? 1e9) - (a.daysSince ?? 1e9)).map((o) => ({ ...o, key: o.key }))} />
        </Panel>,
      ];
    }
    case "quality": {
      const checks = Object.keys(CHECK_LABELS).map((c) => ({ label: CHECK_LABELS[c], value: pct(D.recIn.filter((x) => visitChecks(x).checks[c]).length, D.recIn.length) || 0 }));
      return [
        <Panel key="c" title="Pass rate of each check" sub="Share of office visits passing it"><RankedBarChart items={checks} valueSuffix="%" max={100} wide /></Panel>,
        <Panel key="d" title="Completeness by staff department"><RankedBarChart items={groupAvg(D.recIn, (x) => deptOf(x.employeeId), (x) => [Math.round(visitChecks(x).score * 100)])} valueSuffix="%" max={100} wide /></Panel>,
        <Panel key="l" title={`Completeness by ${levelLabel.toLowerCase()}`}><RankedBarChart items={groupAvg(D.recIn, locKey, (x) => [Math.round(visitChecks(x).score * 100)]).slice(0, 12)} valueSuffix="%" max={100} /></Panel>,
        <Panel key="s" title="Lowest completeness by staff" wide>
          <MiniTable cols={[{ label: "Staff", get: (r) => r.name }, { label: "Department", get: (r) => r.dept }, { label: "Office visits", get: (r) => r.n }, { label: "Completeness", get: (r) => <b>{r.value}%</b> }]}
            rows={groupAvg(D.recIn, (x) => x.employeeId, (x) => [Math.round(visitChecks(x).score * 100)]).sort((a, b) => a.value - b.value).map((r) => ({ ...r, ...staffRow(r.label), name: name(r.label), dept: deptOf(r.label) }))} />
        </Panel>,
      ];
    }
    case "rating": {
      const answers = D.interactions.flatMap((e) => (e.ratings || []).filter((r) => r.stars > 0));
      const dist = [5, 4, 3, 2, 1].map((n) => ({ label: `${n} star${n > 1 ? "s" : ""}`, value: answers.filter((a) => a.stars === n).length, color: n >= 4 ? "var(--success)" : n === 3 ? "var(--warning)" : "var(--danger)" }));
      return [
        <Panel key="q" title="Average by question"><RankedBarChart items={groupAvg(answers, (a) => a.question, (a) => [a.stars])} max={5} wide /></Panel>,
        <Panel key="dist" title="Distribution of ratings"><RankedBarChart items={dist} /></Panel>,
        <Panel key="l" title={`Average by ${levelLabel.toLowerCase()}`}><RankedBarChart items={groupAvg(D.recIn, locKey, visitRatings).slice(0, 12)} max={5} /></Panel>,
        <Panel key="d" title="Average by staff department"><RankedBarChart items={groupAvg(D.recIn, (x) => deptOf(x.employeeId), visitRatings)} max={5} wide /></Panel>,
        <Panel key="low" title="Lowest-rated offices" wide>
          <MiniTable cols={[{ label: "Office", get: (r) => r.label }, { label: "Ratings", get: (r) => r.n }, { label: "Average", get: (r) => <b>{r.value}★</b> }]}
            rows={groupAvg(D.recIn, (x) => x.location, visitRatings).sort((a, b) => a.value - b.value)} />
        </Panel>,
      ];
    }
    case "interactions":
      return [
        <Panel key="t" title="Client interactions per month">{trendChart("Client interactions", trend(D.tripsBase.flatMap((v) => entriesOf(v, "interaction").filter((e) => !isDraft(e))), (e) => e.submittedAt || e.time), "var(--info)")}</Panel>,
        <Panel key="l" title={`By ${levelLabel.toLowerCase()}`}><RankedBarChart items={groupCount(D.recIn, locKey, (x) => (x.interactions || []).length).filter((x) => x.value).slice(0, 12)} /></Panel>,
        <Panel key="d" title="By staff department"><RankedBarChart items={groupCount(D.interactions, (e) => deptOf(e.visit.employeeId))} wide /></Panel>,
        <Panel key="r" title="Rated vs not rated"><RankedBarChart items={[{ label: "With ratings", value: D.interactions.filter((e) => (e.ratings || []).some((r) => r.stars > 0)).length, color: "var(--success)" }, { label: "Without ratings", value: D.interactions.filter((e) => !(e.ratings || []).some((r) => r.stars > 0)).length, color: "var(--ink-faint)" }]} wide /></Panel>,
      ];
    case "observations":
      return [
        <Panel key="t" title="Observations per month">{trendChart("Observations", trend(D.tripsBase.flatMap((v) => entriesOf(v, "observation").filter((e) => !isDraft(e))), (e) => e.submittedAt || e.time))}</Panel>,
        <Panel key="s" title="Source"><RankedBarChart items={[{ label: "Referred by BRAC staff", value: D.observations.filter((e) => e.fromStaff).length, color: "var(--info)" }, { label: "Observed directly", value: D.observations.filter((e) => !e.fromStaff).length, color: "var(--series-1)" }]} wide /></Panel>,
        <Panel key="l" title={`By ${levelLabel.toLowerCase()}`}><RankedBarChart items={groupCount(D.recIn, locKey, (x) => (x.observations || []).length).filter((x) => x.value).slice(0, 12)} /></Panel>,
        <Panel key="d" title="By staff department"><RankedBarChart items={groupCount(D.observations, (e) => deptOf(e.visit.employeeId))} wide /></Panel>,
      ];
    case "stories": {
      const engagement = (e) => (e.likes || 0) + (Array.isArray(e.comments) ? e.comments.length : 0);
      return [
        <Panel key="t" title="Stories per month">{trendChart("Stories", trend(D.tripsBase.flatMap((v) => entriesOf(v, "story").filter((e) => !isDraft(e))), (e) => e.submittedAt || e.time), "var(--brand)")}</Panel>,
        <Panel key="d" title="By staff department"><RankedBarChart items={groupCount(D.stories, (e) => deptOf(e.visit.employeeId))} wide /></Panel>,
        <Panel key="top" title="Most engaging stories" sub="Likes plus comments" wide>
          <MiniTable cols={[{ label: "Story", get: (e) => <><div className="cell-main">{e.title || (e.caption || "").slice(0, 60) || "Untitled"}</div><div className="cell-sub">{e.locationText || e.visit.area}</div></> },
            { label: "By", get: (e) => e.visit.employeeName }, { label: "Likes", get: (e) => e.likes || 0 }, { label: "Comments", get: (e) => (Array.isArray(e.comments) ? e.comments.length : 0) }]}
            rows={[...D.stories].sort((a, b) => engagement(b) - engagement(a)).map((e) => ({ ...e, key: e.id }))} empty="No stories in this period." />
        </Panel>,
      ];
    }
    case "filed":
      return [<Panel key="tr" title="Action items filed per month">{trendChart("Action items filed", trend(D.cBase, filedOn), "var(--series-3)")}</Panel>,
        <Panel key="ur" title="By urgency"><RankedBarChart items={["High", "Medium", "Low"].map((u) => ({ label: u, value: D.filedIn.filter((c) => c.urgency === u).length, color: u === "High" ? "var(--danger)" : u === "Medium" ? "var(--warning)" : "var(--success)" }))} /></Panel>,
        ...complaintPanels(D.filedIn, "Action items filed")];
    case "fixRate": case "onTime": case "days": {
      const list = k === "fixRate" ? D.filedIn : D.fixedIn;
      const perUnit = (fn, suffix) => groupAvg(list, (c) => c.department, (c) => { const v = fn(c); return v == null ? [] : [v]; }).map((x) => ({ ...x, label: x.label }));
      return [
        <Panel key="u" title={k === "days" ? "Avg days to fix by unit" : k === "onTime" ? "Fixed on time by unit" : "Fix rate by unit"}>
          <RankedBarChart items={k === "days" ? perUnit(daysToResolve) : k === "onTime" ? perUnit((c) => (fixedOnTime(c) ? 100 : 0)) : perUnit((c) => (isFixed(c) ? 100 : 0))} valueSuffix={k === "days" ? "" : "%"} max={k === "days" ? undefined : 100} wide />
        </Panel>,
        <Panel key="f" title="Fixed per month">{trendChart("Fixed", trend(D.cBase.filter(isFixed), (c) => c.resolvedAt), "var(--success)")}</Panel>,
        <Panel key="d" title="By staff department (filed by)"><RankedBarChart items={k === "days" ? groupAvg(list, (c) => deptOf(c.employeeId), (c) => { const v = daysToResolve(c); return v == null ? [] : [v]; }) : groupAvg(list, (c) => deptOf(c.employeeId), (c) => [(k === "onTime" ? fixedOnTime(c) : isFixed(c)) ? 100 : 0])} valueSuffix={k === "days" ? "" : "%"} wide /></Panel>,
        <Panel key="t" title={k === "fixRate" ? "Action items filed in the period" : "Action items fixed in the period"} wide>
          <MiniTable cols={[...complaintCols.slice(0, 4), { label: "Days to fix", get: (c) => (daysToResolve(c) == null ? "—" : r1(daysToResolve(c))) }, { label: "On time", get: (c) => (isFixed(c) ? (fixedOnTime(c) ? "Yes" : "No") : "—") }]} rows={list} />
        </Panel>,
      ];
    }
    case "waiting": return complaintPanels(D.waiting, "Waiting for assignment");
    case "late": return complaintPanels(D.late, "Past deadline");
    case "longTerm": return complaintPanels(D.longTerm, "Long-term action items");
    default: return <div className="viz-empty">No breakdown available.</div>;
  }
}
