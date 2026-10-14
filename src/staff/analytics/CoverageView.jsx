import React, { useMemo, useState } from "react";
import { Target, CheckCircle2, Clock, EyeOff, Hourglass, Download, Search, ChevronRight } from "lucide-react";
import InteractiveMap from "../../lib/InteractiveMap";
import { StackedBarChart } from "../../lib/charts";
import { downloadCsv, Reveal } from "../../lib/ui";
import { coverageSummary, timeAgo, STATUS_META, toShapeName } from "../../lib/offices";
import { Kpi, MapPanel, LocationFilterBar, EMPTY_LOCATION_FILTER, matchesLocation, drillFieldFor, DRILL_LABELS } from "./common";
import bdDivisions from "../../lib/bd-divisions.geojson.json";
import bdDistricts from "../../lib/bd-districts.geojson.json";

const SORT_RANK = { never: 0, stale: 1, ok: 2 };

// `mapOnly`: just the map (with its filters) and the Needs attention list beside it — the
// staff app's Offices page supplies its own table and numbers below.
export default function CoverageView({ coverage, offices, visits, target, loc, setLoc, onOpenBranch, mapOnly = false }) {
  const [mode, setMode] = useState("coverage");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => coverage.filter((o) => matchesLocation(o, loc)), [coverage, loc]);
  const sum = useMemo(() => coverageSummary(rows), [rows]);

  const attention = useMemo(
    () => rows.filter((r) => r.status !== "ok").sort((a, b) => SORT_RANK[a.status] - SORT_RANK[b.status] || (b.daysSince ?? 0) - (a.daysSince ?? 0) || a.name.localeCompare(b.name)),
    [rows]
  );

  // visit volume per division / district, for the map's "Visits" colouring
  const visitValues = useMemo(() => {
    const division = {}, district = {};
    visits.forEach((v) => {
      if (!v.date || v.steps?.register === false) return;
      const d = toShapeName(v.division); if (d) division[d] = (division[d] || 0) + 1;
      if (v.region) district[v.region] = (district[v.region] || 0) + 1;
    });
    return { division, district };
  }, [visits]);

  const field = drillFieldFor(loc);
  const breakdown = useMemo(() => {
    if (!field) return [];
    const m = {};
    rows.forEach((r) => {
      const k = r[field] || "Unspecified";
      (m[k] = m[k] || { label: k, ok: 0, stale: 0, never: 0, total: 0 })[r.status]++;
      m[k].total++;
    });
    return Object.values(m).sort((a, b) => a.ok / a.total - b.ok / b.total || b.total - a.total);
  }, [rows, field]);

  const counts = { all: rows.length, never: sum.never, stale: sum.stale, ok: sum.ok };
  const tableRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...rows]
      .filter((r) => (statusFilter === "all" || r.status === statusFilter) && (!q || `${r.name} ${r.area} ${r.district} ${r.division}`.toLowerCase().includes(q)))
      .sort((a, b) => SORT_RANK[a.status] - SORT_RANK[b.status] || (b.daysSince ?? 0) - (a.daysSince ?? 0) || a.name.localeCompare(b.name));
  }, [rows, statusFilter, query]);
  const shown = showAll ? tableRows : tableRows.slice(0, 12);

  const exportCsv = () =>
    downloadCsv(`office-coverage-${new Date().toISOString().slice(0, 10)}.csv`, [
      { label: "Branch", key: "name" }, { label: "Area", key: "area" }, { label: "District", key: "district" }, { label: "Division", key: "division" },
      { label: "Status", get: (r) => STATUS_META[r.status].label }, { label: "Last visit", get: (r) => r.lastDate || "" },
      { label: "Days since last visit", get: (r) => r.daysSince ?? "" }, { label: "Visits", key: "visitCount" },
      { label: "Avg rating", get: (r) => (r.avgRating == null ? "" : r.avgRating.toFixed(1)) }, { label: "Open action items", key: "openComplaints" },
    ], tableRows);

  const single = loc.branch !== "All" ? rows[0] : null;
  const filtered = Object.values(loc).some((v) => v && v !== "All");

  return (
    <div>
      {/* the filters sit right beside the map, so picking one and watching the map zoom happen on the same screen */}
      <div className="cov-grid">
        <MapPanel
          title="Field-office coverage map"
          sub="Select a division to zoom in, then a district and an area. Drag to pan; use Ctrl + scroll to zoom."
          filters={<LocationFilterBar offices={offices} value={loc} onChange={setLoc} labelled />}
          canClear={filtered} onClear={() => setLoc(EMPTY_LOCATION_FILTER)}
        >
          <InteractiveMap
            divisions={bdDivisions} districts={bdDistricts} offices={coverage}
            mode={mode} onModeChange={setMode} filter={loc} onFilter={setLoc} onOpenBranch={onOpenBranch}
            visitValues={visitValues} targetDays={target}
          />
        </MapPanel>

        <div className="card card-pad" style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div className="section-header" style={{ marginBottom: 8 }}>
            <div>
              <p className="analytics-card-title" style={{ marginBottom: 2 }}>Needs attention</p>
              <p className="analytics-card-sub" style={{ margin: 0 }}>{attention.length} office{attention.length === 1 ? "" : "s"} · never visited first, then longest overdue</p>
            </div>
          </div>
          {attention.length === 0 ? (
            <div className="viz-empty">Every office in this selection has been visited within {target} days.</div>
          ) : (
            <div className="attn-list">
              {attention.map((r) => (
                <button key={r.key} className="attn-row" onClick={() => onOpenBranch(r)}>
                  <span className="status-dot" style={{ background: STATUS_META[r.status].color }} />
                  <span className="attn-main">
                    <div className="attn-name">{r.name}</div>
                    <div className="attn-sub">{r.area} · {r.district}</div>
                  </span>
                  <span className={`pill ${STATUS_META[r.status].pill}`}>{r.status === "never" ? "Never" : `${r.daysSince}d`}</span>
                  <ChevronRight size={15} color="var(--ink-faint)" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!mapOnly && <>
      {/* the network-wide numbers already sit in the Network health strip, so this row
          only appears once a filter narrows the selection — and it sits below the map so
          it never pushes the map away from the filters */}
      {filtered && (
        <div className="kpi-grid" style={{ marginTop: 16 }}>
          <Reveal i={0}><Kpi icon={Target} tone="green" label={`Coverage (visited within ${target}d)`} value={sum.pct} suffix="%" foot={<span className="pill pill-ok">{sum.ok} of {sum.total}</span>} /></Reveal>
          <Reveal i={1}><Kpi icon={CheckCircle2} tone="green" label="On track" value={sum.ok} /></Reveal>
          <Reveal i={2}><Kpi icon={Hourglass} tone="amber" label={`Overdue (> ${target} days)`} value={sum.stale} /></Reveal>
          <Reveal i={3}><Kpi icon={EyeOff} tone="red" label="Never visited" value={sum.never} /></Reveal>
          <Reveal i={4}><Kpi icon={Clock} label="Avg days since last visit" value={sum.avgDays == null ? "—" : sum.avgDays} /></Reveal>
        </div>
      )}

      <div className="card card-pad" style={{ marginTop: 16 }}>
        {field ? (
          <>
            <p className="analytics-card-title">Coverage by {DRILL_LABELS[field].toLowerCase()}</p>
            <p className="analytics-card-sub">Weakest coverage first — on track, overdue and never-visited offices per {DRILL_LABELS[field].toLowerCase()}.</p>
            <StackedBarChart
              rows={breakdown.map((b) => ({ label: b.label, segments: [{ key: "ok", value: b.ok }, { key: "stale", value: b.stale }, { key: "never", value: b.never }] }))}
              segmentDefs={[
                { key: "ok", label: `Visited within ${target}d`, color: "var(--success)" },
                { key: "stale", label: "Overdue", color: "var(--warning)" },
                { key: "never", label: "Never visited", color: "var(--danger)" },
              ]}
            />
          </>
        ) : single ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div>
              <p className="analytics-card-title">{single.name}</p>
              <p className="analytics-card-sub" style={{ margin: 0 }}>
                <span className={`pill ${STATUS_META[single.status].pill}`} style={{ marginRight: 8 }}>{STATUS_META[single.status].label}</span>
                {single.lastDate ? `Last visited ${timeAgo(single.daysSince)} by ${single.lastBy}` : "No visits recorded yet"}
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => onOpenBranch(single)}>Open branch profile</button>
          </div>
        ) : null}
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="section-header">
          <div>
            <p className="analytics-card-title" style={{ marginBottom: 2 }}>All offices</p>
            <p className="analytics-card-sub" style={{ margin: 0 }}>{tableRows.length} of {rows.length} shown</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}><Download size={14} /> Export CSV</button>
        </div>

        <div className="toolbar">
          <div className="search-box">
            <Search size={16} />
            <input className="input" placeholder="Search branch, area, district…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="filter-chips">
            {[["all", "All"], ["never", "Never visited"], ["stale", "Overdue"], ["ok", "On track"]].map(([k, label]) => (
              <button key={k} className={`filter-chip ${statusFilter === k ? "active" : ""}`} onClick={() => setStatusFilter(k)}>
                {label} <span className="fc-count">{counts[k]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="ctable-wrap office-table">
          <table className="ctable">
            <thead><tr><th>Branch</th><th>Status</th><th>Last visit</th><th>Visits</th><th>Rating</th><th>Open action items</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key} style={{ cursor: "pointer" }} onClick={() => onOpenBranch(r)}>
                  <td><div className="cell-main">{r.name}</div><div className="cell-sub">{r.area} · {r.district}</div></td>
                  <td><span className={`pill ${STATUS_META[r.status].pill}`}>{STATUS_META[r.status].short}</span></td>
                  <td>{r.lastDate ? <><div className="cell-main">{timeAgo(r.daysSince)}</div><div className="cell-sub">{r.lastDate}</div></> : <span style={{ color: "var(--ink-faint)" }}>—</span>}</td>
                  <td>{r.visitCount}</td>
                  <td>{r.avgRating == null ? "—" : `${r.avgRating.toFixed(1)}★`}</td>
                  <td>{r.openComplaints > 0 ? <span className="pill pill-stale">{r.openComplaints} open</span> : <span style={{ color: "var(--ink-faint)" }}>0</span>}</td>
                  <td style={{ textAlign: "right" }}><ChevronRight size={15} color="var(--ink-faint)" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="office-cards">
          {shown.map((r) => (
            <button key={r.key} className="attn-row" style={{ border: "1px solid var(--line)", background: "var(--paper)" }} onClick={() => onOpenBranch(r)}>
              <span className="status-dot" style={{ background: STATUS_META[r.status].color }} />
              <span className="attn-main">
                <div className="attn-name">{r.name}</div>
                <div className="attn-sub">{r.area} · {r.district}</div>
                <div className="attn-sub" style={{ marginTop: 4 }}>
                  {r.lastDate ? `Last ${timeAgo(r.daysSince)}` : "Never visited"} · {r.visitCount} visits{r.avgRating != null ? ` · ${r.avgRating.toFixed(1)}★` : ""}
                </div>
              </span>
              <span className={`pill ${STATUS_META[r.status].pill}`}>{STATUS_META[r.status].short}</span>
            </button>
          ))}
        </div>

        {tableRows.length === 0 && <div className="viz-empty">No offices match.</div>}
        {tableRows.length > 12 && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAll((s) => !s)}>{showAll ? "Show fewer" : `Show all ${tableRows.length}`}</button>
          </div>
        )}
      </div>
      </>}
    </div>
  );
}
