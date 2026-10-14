import React, { useMemo, useState } from "react";
import {
  Search, Download, ChevronRight, ArrowLeft, MapPin, Building2, PenLine, MessageCircle, Star, ShieldCheck, Mail, Phone, Contact, Users,
} from "lucide-react";
import { Reveal, downloadCsv } from "../../lib/ui";
import { TrendLineChart } from "../../lib/charts";
import { timeAgo, monthBuckets, DAY_MS } from "../../lib/offices";
import { ENTRY_TYPES, ENTRY_ORDER, plural } from "../../lib/visits";
import { Kpi } from "../analytics/common";
import VisitCard from "../visits/VisitCard";
import { EntryRow } from "../visits/VisitHub";
import { EntryView } from "../visits/EntrySheet";
import { peopleList, personStats, placesOf, entriesBy, KIND_LABEL } from "./data";
import { periodRange, periodMeta, inPeriod } from "./periods";

const ROLE_LABELS = { field: "Base user", fixer: "Fixer", management: "Management" };
const initials = (name) => (name || "?").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const sinceText = (d) => (d ? timeAgo(Math.max(0, Math.floor((Date.now() - new Date(d)) / DAY_MS))) : "Never");
const roleList = (p) => (p.roles?.length ? p.roles : ["field"]);
const pctText = (q) => (q == null ? "—" : `${Math.round(q * 100)}%`);

const SORTS = {
  most: { label: "Most visits", fn: (a, b) => b.s.trips - a.s.trips || a.name.localeCompare(b.name) },
  least: { label: "Fewest visits", fn: (a, b) => a.s.trips - b.s.trips || a.name.localeCompare(b.name) },
  quality: { label: "Lowest completeness", fn: (a, b) => (a.s.quality ?? 2) - (b.s.quality ?? 2) },
  last: { label: "Longest since last visit", fn: (a, b) => (a.s.lastDate || "").localeCompare(b.s.lastDate || "") },
  name: { label: "Name", fn: (a, b) => a.name.localeCompare(b.name) },
};

/** Management → People: everyone who makes visits, and what they did in the period. */
export function PeopleDirectory({ employees, trips, records, period, onOpenPerson }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [dept, setDept] = useState("All");
  const [sort, setSort] = useState("most");
  const meta = periodMeta(period);

  const rows = useMemo(() => {
    const r = periodRange(period);
    return peopleList(employees, trips).map((p) => ({ ...p, s: personStats(p, trips, records, r) }));
  }, [employees, trips, records, period]);
  const departments = [...new Set(rows.map((p) => p.department).filter(Boolean))].sort();
  const q = query.trim().toLowerCase();
  const list = rows
    .filter((p) => role === "all" || roleList(p).includes(role))
    .filter((p) => dept === "All" || p.department === dept)
    .filter((p) => !q || [p.name, p.pin, p.designation, p.department, p.email, p.phone].some((x) => String(x || "").toLowerCase().includes(q)))
    .sort(SORTS[sort].fn);
  const roleCount = (k) => (k === "all" ? rows.length : rows.filter((p) => roleList(p).includes(k)).length);

  const exportCsv = () => downloadCsv(`people-${period}.csv`, [
    { label: "Name", key: "name" }, { label: "Designation", key: "designation" }, { label: "Department", key: "department" },
    { label: "PIN", key: "pin" }, { label: "Email", key: "email" }, { label: "Phone", key: "phone" },
    { label: "User type", get: (p) => roleList(p).map((x) => ROLE_LABELS[x] || x).join(" / ") },
    { label: `Visits (${meta.label})`, get: (p) => p.s.trips }, { label: "Marked done", get: (p) => p.s.done },
    { label: "Offices", get: (p) => p.s.offices }, { label: "Entries submitted", get: (p) => p.s.entryCount },
    { label: "Action items filed", get: (p) => p.s.complaints }, { label: "Drafts not submitted", get: (p) => p.s.drafts },
    { label: "Avg rating", get: (p) => (p.s.avgRating == null ? "" : p.s.avgRating.toFixed(2)) },
    { label: "Info completeness %", get: (p) => (p.s.quality == null ? "" : Math.round(p.s.quality * 100)) },
    { label: "Last visit", get: (p) => p.s.lastDate || "" },
  ], list);

  return (
    <div className="card card-pad">
      <div className="section-header">
        <div>
          <p className="analytics-card-title" style={{ marginBottom: 2 }}>Everyone</p>
          <p className="analytics-card-sub" style={{ margin: 0 }}>{list.length} of {rows.length} · numbers are for {meta.label.toLowerCase()}. Select a person to view their full visit history.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={exportCsv}><Download size={14} /> Export CSV</button>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input className="input" placeholder="Search name, PIN, designation, email…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {departments.length > 0 && (
          <select className="select" aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)} style={{ width: "auto" }}>
            <option value="All">All departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <select className="select" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: "auto" }}>
          {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
      </div>
      <div className="toolbar">
        <div className="filter-chips">
          {[["all", "All"], ["field", "Base users"], ["fixer", "Fixers"], ["management", "Management"]].map(([k, label]) => (
            <button key={k} className={`filter-chip ${role === k ? "active" : ""}`} onClick={() => setRole(k)}>{label} <span className="fc-count">{roleCount(k)}</span></button>
          ))}
        </div>
      </div>

      <div className="ctable-wrap">
        <table className="ctable stack">
          <thead><tr><th>Person</th><th>PIN</th><th>Visits</th><th>Offices</th><th>Entries</th><th>Completeness</th><th>Rating</th><th>Last visit</th><th /></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => onOpenPerson(p.id)}>
                <td data-label="Person">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="avatar sm">{initials(p.name)}</span>
                    <div style={{ textAlign: "left" }}>
                      <div className="cell-main">{p.name}{p.former && <span className="pill pill-never" style={{ marginLeft: 6 }}>Former</span>}</div>
                      <div className="cell-sub">{[p.designation, p.department].filter(Boolean).join(" · ") || roleList(p).map((x) => ROLE_LABELS[x] || x).join(" · ")}</div>
                    </div>
                  </div>
                </td>
                <td data-label="PIN" className="mono">{p.pin || "—"}</td>
                <td data-label="Visits"><b>{p.s.trips}</b>{p.s.notDone > 0 && <span className="pill pill-stale" style={{ marginLeft: 6 }} title="Back from the visit but not marked as done">{p.s.notDone} not done</span>}</td>
                <td data-label="Offices">{p.s.offices}</td>
                <td data-label="Entries">{p.s.entryCount}{p.s.drafts > 0 && <span className="cell-sub" style={{ display: "inline", marginLeft: 6 }}>+{p.s.drafts} drafts</span>}</td>
                <td data-label="Completeness">{pctText(p.s.quality)}</td>
                <td data-label="Rating">{p.s.avgRating == null ? "—" : `${p.s.avgRating.toFixed(1)}★`}</td>
                <td data-label="Last visit">{sinceText(p.s.lastDate)}</td>
                <td data-label="" style={{ textAlign: "right" }}><ChevronRight size={15} color="var(--ink-faint)" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length === 0 && <div className="viz-empty">No one matches.</div>}
    </div>
  );
}

/** One person's profile: who they are, what they did, where they went, and everything they recorded. */
export function PersonProfile({ person, employees, departments, trips, records, period, onBack, onOpenVisit, onOpenBranchByName }) {
  const [type, setType] = useState("all");
  const [entry, setEntry] = useState(null);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [showAllVisits, setShowAllVisits] = useState(false);
  const meta = periodMeta(period);
  const r = useMemo(() => periodRange(period), [period]);

  const s = useMemo(() => personStats(person, trips, records, r), [person, trips, records, r]);
  const places = useMemo(() => placesOf(person, records, r), [person, records, r]);
  const entries = useMemo(() => entriesBy(person, trips, r), [person, trips, r]);
  const visits = useMemo(
    () => trips.filter((v) => v.employeeId === person.id && (v.date ? inPeriod(v.date, r) : period === "all")).sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [trips, person.id, r, period]
  );
  const months = useMemo(() => monthBuckets(6), []);

  const unit = departments.find((d) => d.id === person.departmentId)?.name;
  const supervisor = employees.find((e) => e.id === person.supervisorId)?.name;
  const shownEntries = (type === "all" ? entries : entries.filter((e) => e.type === type));
  const typeCount = (t) => (t === "all" ? entries.length : entries.filter((e) => e.type === t).length);

  return (
    <div>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12, paddingLeft: 8 }} onClick={onBack}><ArrowLeft size={15} /> People</button>

      <div className="card card-pad person-hero">
        <div className="avatar lg">{initials(person.name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="ph-name">{person.name}{person.former && <span className="pill pill-never" style={{ marginLeft: 8, verticalAlign: "middle" }}>No longer on the employee list</span>}</h2>
          <div className="ph-role">{[person.designation, person.department].filter(Boolean).join(" · ") || <span style={{ color: "var(--ink-faint)" }}>Designation and department not on file yet</span>}</div>
          <div className="ph-meta">
            <span><Contact size={13} /> PIN <b className="mono">{person.pin || "—"}</b></span>
            {person.email && <a href={`mailto:${person.email}`}><Mail size={13} /> {person.email}</a>}
            {person.phone && <a href={`tel:${person.phone}`}><Phone size={13} /> {person.phone}</a>}
            {unit && <span><Users size={13} /> Unit: {unit}</span>}
            {supervisor && <span>Supervisor: {supervisor}</span>}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {roleList(person).map((x) => <span key={x} className="tag-badge">{ROLE_LABELS[x] || x}</span>)}
            <span className="tag-badge">Last visit: {sinceText(s.lastDate)}</span>
          </div>
        </div>
      </div>

      <div className="kpi-grid" style={{ margin: "16px 0" }}>
        <Reveal i={0}><Kpi icon={MapPin} label={`Visits · ${meta.label.toLowerCase()}`} value={s.trips} spark={s.spark} sparkColor="var(--brand)"
          foot={<span className={`pill ${s.notDone ? "pill-stale" : "pill-ok"}`}>{s.done} done{s.notDone ? ` · ${s.notDone} not marked` : ""}</span>} /></Reveal>
        <Reveal i={1}><Kpi icon={Building2} tone="blue" label="Offices visited" value={s.offices} /></Reveal>
        <Reveal i={2}><Kpi icon={PenLine} tone="green" label="Entries submitted" value={s.entryCount} foot={s.drafts ? <span className="pill pill-stale">{plural(s.drafts, "draft")} unsent</span> : null} /></Reveal>
        <Reveal i={3}><Kpi icon={MessageCircle} tone="red" label="Action items filed" value={s.complaints} foot={s.complaints ? <span className="pill pill-brand">{s.resolved} resolved</span> : null} /></Reveal>
        <Reveal i={4}><Kpi icon={Star} tone="amber" label="Avg client rating" value={s.avgRating == null ? "—" : Number(s.avgRating.toFixed(1))} decimals={1} suffix={s.avgRating == null ? "" : "★"} /></Reveal>
        <Reveal i={5}><Kpi icon={ShieldCheck} tone="green" label="Info completeness" value={s.quality == null ? "—" : Math.round(s.quality * 100)} suffix={s.quality == null ? "" : "%"} /></Reveal>
      </div>

      <div className="bp-grid">
        <Reveal className="card card-pad" i={1} style={{ minWidth: 0 }}>
          <p className="analytics-card-title">Visits</p>
          <p className="analytics-card-sub">{plural(visits.length, "visit")} · {meta.label.toLowerCase()}, newest first. Open one to see everything on it (read-only).</p>
          {visits.length === 0 ? <div className="viz-empty">No visits in this period.</div> : (
            <div className="visit-grid" style={{ gridTemplateColumns: "1fr" }}>
              {(showAllVisits ? visits : visits.slice(0, 6)).map((v) => <VisitCard key={v.id} visit={v} onOpen={() => onOpenVisit(v.id)} />)}
            </div>
          )}
          {visits.length > 6 && (
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAllVisits((x) => !x)}>{showAllVisits ? "Show fewer" : `Show all ${visits.length}`}</button>
            </div>
          )}
        </Reveal>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <Reveal className="card card-pad" i={2}>
            <p className="analytics-card-title">Where they went</p>
            <p className="analytics-card-sub">{plural(places.length, "office")} · {meta.label.toLowerCase()}, most visited first.</p>
            {places.length === 0 ? <div className="viz-empty">Nowhere in this period.</div> : places.map((p) => (
              <button key={p.key} type="button" className="attn-row" onClick={p.kind === "branch" ? () => onOpenBranchByName(p.name) : undefined} style={p.kind === "branch" ? undefined : { cursor: "default" }}>
                <span className="attn-main">
                  <div className="attn-name">{p.name} <span className="tag-badge" style={{ marginLeft: 4 }}>{KIND_LABEL[p.kind]}</span></div>
                  <div className="attn-sub">{p.where || "—"} · last {p.last} · {p.entries.complaints}C · {p.entries.interactions}I · {p.entries.observations}O · {p.entries.stories}S</div>
                </span>
                <b style={{ fontSize: 15 }}>{p.count}×</b>
              </button>
            ))}
          </Reveal>
          <Reveal className="card card-pad" i={3}>
            <p className="analytics-card-title">Visits per month</p>
            <p className="analytics-card-sub">Last 6 months.</p>
            <TrendLineChart labels={months.map((m) => m.label)} series={[{ key: "v", label: "Visits", color: "var(--brand)", values: s.spark }]} height={160} showLegend={false} />
          </Reveal>
        </div>
      </div>

      <Reveal className="card card-pad" i={1} style={{ marginTop: 16 }}>
        <p className="analytics-card-title">Everything they recorded</p>
        <p className="analytics-card-sub">Submitted entries · {meta.label.toLowerCase()}, newest first. Select an entry to view it in full.</p>
        <div className="toolbar">
          <div className="filter-chips">
            {["all", ...ENTRY_ORDER].map((t) => (
              <button key={t} className={`filter-chip ${type === t ? "active" : ""}`} onClick={() => setType(t)}>
                {t === "all" ? "All" : ENTRY_TYPES[t].plural} <span className="fc-count">{typeCount(t)}</span>
              </button>
            ))}
          </div>
        </div>
        {shownEntries.length === 0 ? <div className="viz-empty">Nothing recorded in this period.</div> : (
          <div className="entry-panel" style={{ padding: 0 }}>
            {(showAllEntries ? shownEntries : shownEntries.slice(0, 20)).map((e) => (
              <div key={`${e.visit.id}-${e.id}`}>
                <div className="entry-context">{ENTRY_TYPES[e.type].label} · visit of {e.visit.date || "no date"}</div>
                <EntryRow e={e} onOpen={() => setEntry(e)} />
              </div>
            ))}
          </div>
        )}
        {shownEntries.length > 20 && (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAllEntries((x) => !x)}>{showAllEntries ? "Show fewer" : `Show all ${shownEntries.length}`}</button>
          </div>
        )}
      </Reveal>

      {entry && <EntryView type={entry.type} entry={entry} visit={entry.visit} onClose={() => setEntry(null)} />}
    </div>
  );
}
