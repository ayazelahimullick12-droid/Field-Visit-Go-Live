import React, { useMemo, useState } from "react";
import { Search, Download, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { downloadCsv } from "../../lib/ui";
import { timeAgo, DAY_MS, STATUS_META, coverageSummary } from "../../lib/offices";
import { plural } from "../../lib/visits";
import { EMPTY_LOCATION_FILTER } from "../analytics/common";
import CoverageView from "../analytics/CoverageView";
import { officeRows, entryTotal, KIND_LABEL, KIND_PLURAL } from "./data";
import { periodRange, periodMeta } from "./periods";

const KINDS = ["branch", "vo", "area", "region"];
const STATUS_RANK = { never: 0, stale: 1, ok: 2 };
const SORTS = {
  attention: { label: "Needs attention first", fn: (a, b) => (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3) || (a.lastDate || "").localeCompare(b.lastDate || "") || a.name.localeCompare(b.name) },
  most: { label: "Most visited", fn: (a, b) => b.visits - a.visits || a.name.localeCompare(b.name) },
  least: { label: "Least visited", fn: (a, b) => a.visits - b.visits || (a.lastDate || "").localeCompare(b.lastDate || "") },
  oldest: { label: "Longest since last visit", fn: (a, b) => (a.lastDate || "").localeCompare(b.lastDate || "") },
  entries: { label: "Most recorded", fn: (a, b) => entryTotal(b.entries) - entryTotal(a.entries) },
  name: { label: "Name", fn: (a, b) => a.name.localeCompare(b.name) },
};
const daysSince = (d) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d)) / DAY_MS)) : null);

// A VO / area / region office isn't on the master list, so it only matches a location filter by what was recorded with it.
function matchLoc(r, f) {
  if (f.division !== "All" && r.division !== f.division) return false;
  if (f.region !== "All" && r.region !== f.region) return false;
  if (f.area !== "All" && r.area !== f.area) return false;
  if (f.branch !== "All" && r.name !== f.branch && r.parent !== f.branch) return false;
  return true;
}

/** Management → Offices: whether every branch is being visited (coverage map + status), and how often
 *  every branch, VO, area and region office is visited, by whom, and what was recorded there. */
export default function OfficesView({ records, offices, coverage, target, period, onOpenBranch, onOpenCoverageRow, onOpenPerson, onOpenVisit }) {
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [loc, setLoc] = useState(EMPTY_LOCATION_FILTER);
  const [sort, setSort] = useState("attention");
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const meta = periodMeta(period);

  // coverage status (visited within the target / overdue / never) exists for branches only: they're the master list
  const statusByKey = useMemo(() => new Map(coverage.map((c) => [c.key, c.status])), [coverage]);
  const rows = useMemo(
    () => officeRows(records, offices, periodRange(period)).map((r) => ({ ...r, status: r.kind === "branch" ? statusByKey.get(r.key) || null : null })),
    [records, offices, period, statusByKey]
  );
  const mapVisits = useMemo(() => records.filter((r) => r.date), [records]);
  const located = rows.filter((r) => matchLoc(r, loc));
  const cov = coverageSummary(located.filter((r) => r.status));
  const totals = Object.fromEntries(KINDS.map((k) => [k, located.filter((r) => r.kind === k).reduce((s, r) => s + r.visits, 0)]));
  const counts = Object.fromEntries(["all", ...KINDS].map((k) => [k, k === "all" ? located.length : located.filter((r) => r.kind === k).length]));
  const statusCounts = { never: cov.never, stale: cov.stale, ok: cov.ok };
  const q = query.trim().toLowerCase();
  const list = located
    .filter((r) => kind === "all" || r.kind === kind)
    .filter((r) => status === "all" || r.status === status)
    .filter((r) => !q || [r.name, r.parent, r.area, r.region, r.division, r.lastBy].some((x) => String(x || "").toLowerCase().includes(q)))
    .sort(SORTS[sort].fn);
  const shown = showAll ? list : list.slice(0, 25);

  const exportCsv = () => downloadCsv(`office-visits-${period}.csv`, [
    { label: "Office", key: "name" }, { label: "Type", get: (r) => KIND_LABEL[r.kind] }, { label: "Under", key: "parent" },
    { label: `Status (visited within ${target} days)`, get: (r) => (r.status ? STATUS_META[r.status].label : "") },
    { label: "Division", key: "division" }, { label: "District", key: "region" }, { label: "Area", key: "area" },
    { label: `Visits (${meta.label})`, key: "visits" }, { label: "Staff", key: "staff" },
    { label: "Action items", get: (r) => r.entries.complaints }, { label: "Client interactions", get: (r) => r.entries.interactions },
    { label: "Observations", get: (r) => r.entries.observations }, { label: "Stories", get: (r) => r.entries.stories },
    { label: "Avg rating", get: (r) => (r.avgRating == null ? "" : r.avgRating.toFixed(2)) },
    { label: "Info completeness %", get: (r) => (r.quality == null ? "" : Math.round(r.quality * 100)) },
    { label: "Open action items", key: "openComplaints" }, { label: "Last visit", key: "lastDate" }, { label: "Last visited by", key: "lastBy" },
  ], list);

  return (
    <>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        {KINDS.map((k) => (
          <button key={k} type="button" className={`kpi kpi-btn ${kind === k ? "on" : ""}`} onClick={() => setKind(kind === k ? "all" : k)}>
            <div className="kpi-num">{totals[k]}</div>
            <div className="kpi-label">{KIND_PLURAL[k]}: visits · {meta.label.toLowerCase()}</div>
            <div className="kpi-foot">
              <span className="pill pill-brand">{counts[k]} offices</span>
              {k === "branch" && cov.total > 0 && <span className={`pill ${cov.pct >= 80 ? "pill-ok" : cov.pct >= 50 ? "pill-stale" : "pill-never"}`}>{cov.pct}% covered</span>}
            </div>
          </button>
        ))}
      </div>

      {/* coverage map: its filters narrow the table below too */}
      <div style={{ marginBottom: 16 }}>
        <CoverageView coverage={coverage} offices={offices} visits={mapVisits} target={target} loc={loc} setLoc={setLoc} onOpenBranch={onOpenCoverageRow} mapOnly />
      </div>

      <div className="card card-pad">
        <div className="section-header">
          <div>
            <p className="analytics-card-title" style={{ marginBottom: 2 }}>Every office</p>
            <p className="analytics-card-sub" style={{ margin: 0 }}>{list.length} of {rows.length} · visits in {meta.label.toLowerCase()} (done visits and submitted entries). Status and last visit ignore the period: status means visited within {target} days. Use the map's filters to narrow by location; tap a row for its visits.</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}><Download size={14} /> Export CSV</button>
        </div>

        <div className="toolbar">
          <div className="search-box">
            <Search size={16} />
            <input className="input" placeholder="Search office, area, district, person…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select className="select" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: "auto" }}>
            {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select>
        </div>
        <div className="toolbar">
          <div className="filter-chips">
            {["all", ...KINDS].map((k) => (
              <button key={k} className={`filter-chip ${kind === k ? "active" : ""}`} onClick={() => setKind(k)}>
                {k === "all" ? "All" : KIND_PLURAL[k]} <span className="fc-count">{counts[k]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar">
          <div className="filter-chips">
            {[["all", "Any status"], ["never", STATUS_META.never.label], ["stale", `Overdue (> ${target}d)`], ["ok", STATUS_META.ok.short]].map(([k, label]) => (
              <button key={k} className={`filter-chip ${status === k ? "active" : ""}`} onClick={() => setStatus(k)}>
                {k !== "all" && <span className="status-dot" style={{ background: STATUS_META[k].color }} />}{label}{k !== "all" && <span className="fc-count">{statusCounts[k]}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="ctable-wrap">
          <table className="ctable stack">
            <thead><tr><th>Office</th><th>Type</th><th>Status</th><th>Visits</th><th>Staff</th><th>Recorded</th><th>Rating</th><th>Open action items</th><th>Last visit</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => {
                const isOpen = open === r.key;
                const d = daysSince(r.lastDate);
                return (
                  <React.Fragment key={r.key}>
                    <tr style={{ cursor: "pointer" }} onClick={() => setOpen(isOpen ? null : r.key)}>
                      <td data-label="Office"><div className="cell-main">{r.name}</div><div className="cell-sub">{[r.kind === "vo" ? r.parent : r.area, r.region].filter(Boolean).join(" · ") || "—"}</div></td>
                      <td data-label="Type"><span className="tag-badge">{KIND_LABEL[r.kind]}</span></td>
                      <td data-label="Status">{r.status ? <span className={`pill ${STATUS_META[r.status].pill}`}>{STATUS_META[r.status].short}</span> : <span style={{ color: "var(--ink-faint)" }} title="Only branches are measured against the visit target">—</span>}</td>
                      <td data-label="Visits"><b>{r.visits}</b></td>
                      <td data-label="Staff">{r.staff}</td>
                      <td data-label="Recorded" title="action items · client interactions · observations · stories">
                        {entryTotal(r.entries) ? `${r.entries.complaints} · ${r.entries.interactions} · ${r.entries.observations} · ${r.entries.stories}` : <span style={{ color: "var(--ink-faint)" }}>—</span>}
                      </td>
                      <td data-label="Rating">{r.avgRating == null ? "—" : `${r.avgRating.toFixed(1)}★`}</td>
                      <td data-label="Open action items">{r.openComplaints > 0 ? <span className="pill pill-stale">{r.openComplaints} open</span> : <span style={{ color: "var(--ink-faint)" }}>0</span>}</td>
                      <td data-label="Last visit">{r.lastDate ? <><div className="cell-main">{timeAgo(d)}</div><div className="cell-sub">{r.lastBy}</div></> : <span style={{ color: "var(--ink-faint)" }}>Never</span>}</td>
                      <td data-label="" style={{ textAlign: "right" }}>{isOpen ? <ChevronUp size={15} color="var(--ink-faint)" /> : <ChevronDown size={15} color="var(--ink-faint)" />}</td>
                    </tr>
                    {isOpen && (
                      <tr className="ctable-detail">
                        <td colSpan={10} data-label="">
                          <div className="od-head">
                            <span><b>{plural(r.records.length, "visit")}</b> in {meta.label.toLowerCase()}{r.kind === "branch" ? "" : r.parent ? ` · under ${r.parent}` : ""}</span>
                            {r.kind === "branch" && r.office && <button className="btn btn-secondary btn-sm" onClick={() => onOpenBranch(r.office)}><ExternalLink size={13} /> Branch 360°</button>}
                          </div>
                          {r.records.length === 0 ? <div className="viz-empty" style={{ padding: 12 }}>No visits in this period.</div> : (
                            [...r.records].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((v) => (
                              <div key={v.id} className="od-row">
                                <span className="mono od-date">{v.date}</span>
                                <button className="link-btn" onClick={() => onOpenPerson(v.employeeId)}>{v.employeeName}</button>
                                <span className="od-what">{v.reason || "—"} · {[
                                  v.complaints.length && plural(v.complaints.length, "action item"),
                                  v.interactions.length && plural(v.interactions.length, "client interaction"),
                                  v.observations.length && plural(v.observations.length, "observation"),
                                  v.stories.length && plural(v.stories.length, "story", "stories"),
                                ].filter(Boolean).join(", ") || "nothing recorded"}</span>
                                <button className="btn btn-ghost btn-sm" onClick={() => onOpenVisit(v.tripId)}>Open visit</button>
                              </div>
                            ))
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {list.length === 0 && <div className="viz-empty">No offices match.</div>}
        {list.length > 25 && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAll((s) => !s)}>{showAll ? "Show fewer" : `Show all ${list.length}`}</button>
          </div>
        )}
      </div>
    </>
  );
}

