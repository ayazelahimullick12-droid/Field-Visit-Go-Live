import React, { useMemo, useState } from "react";
import { MapPin, Building2, Star, UserRound, Users, ShieldCheck } from "lucide-react";
import InteractiveMap from "../../lib/InteractiveMap";
import { RankedBarChart, TrendLineChart } from "../../lib/charts";
import { Reveal } from "../../lib/ui";
import { average, visitChecks, visitRatings, clientsHeard, CHECK_LABELS, monthBuckets, monthKeyOf, toShapeName } from "../../lib/offices";
import { Kpi, MapPanel, LocationFilterBar, DateFilterBar, EMPTY_LOCATION_FILTER, EMPTY_DATE_FILTER, SERIES_COLORS, matchesLocation, matchesDate, drillFieldFor, DRILL_LABELS } from "./common";
import bdDivisions from "../../lib/bd-divisions.geojson.json";
import bdDistricts from "../../lib/bd-districts.geojson.json";

const fmt = (n) => (n == null ? "—" : `${n.toFixed(1)}`);

export default function VisitsView({ visits, coverage, offices, showCoverage = false, target, loc, setLoc, date, setDate, onOpenBranch }) {
  const [mode, setMode] = useState("visits");

  const real = useMemo(() => visits.filter((v) => v.date && v.steps?.register !== false), [visits]);
  const filtered = useMemo(() => real.filter((v) => matchesLocation(v, loc) && matchesDate(v.date, date)), [real, loc, date]);

  // the map shows visit volume for the chosen date range across the whole country
  const visitValues = useMemo(() => {
    const division = {}, district = {};
    real.filter((v) => matchesDate(v.date, date)).forEach((v) => {
      const d = toShapeName(v.division); if (d) division[d] = (division[d] || 0) + 1;
      if (v.region) district[v.region] = (district[v.region] || 0) + 1;
    });
    return { division, district };
  }, [real, date]);

  const stats = useMemo(() => {
    // star ratings come from client interactions only; observations have none
    const ratings = filtered.flatMap(visitRatings);
    const staffObservations = filtered.reduce((s, v) => s + (v.observations || []).length, 0);
    const offices = new Set(filtered.map((v) => `${v.region}::${v.location}`));
    const quality = filtered.map((v) => visitChecks(v));
    const passRates = Object.keys(CHECK_LABELS).map((k) => ({
      key: k, label: CHECK_LABELS[k],
      value: quality.length ? Math.round((quality.filter((q) => q.checks[k]).length / quality.length) * 100) : 0,
    }));
    return {
      overall: average(ratings), staffObservations,
      reached: filtered.reduce((s, v) => s + clientsHeard(v), 0), officesVisited: offices.size,
      quality: average(quality.map((q) => q.score)), passRates,
    };
  }, [filtered]);

  const months = useMemo(() => monthBuckets(6), []);
  const trend = useMemo(() => {
    const base = real.filter((v) => matchesLocation(v, loc));
    return months.map((m) => base.filter((v) => monthKeyOf(v.date) === m.key).length);
  }, [real, loc, months]);

  const field = drillFieldFor(loc);
  const drill = useMemo(() => {
    if (!field) return null;
    const counts = {}, ratings = {};
    filtered.forEach((v) => {
      const k = v[field] || "Unspecified";
      counts[k] = (counts[k] || 0) + 1;
      const r = visitRatings(v);
      if (r.length) (ratings[k] = ratings[k] || []).push(...r);
    });
    return {
      counts: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: SERIES_COLORS[i % SERIES_COLORS.length] })),
      ratings: Object.entries(ratings).map(([label, rs], i) => ({ label, value: Number(average(rs).toFixed(1)), color: SERIES_COLORS[i % SERIES_COLORS.length] })).sort((a, b) => b.value - a.value),
    };
  }, [filtered, field]);

  const reasons = useMemo(() => {
    const c = {};
    filtered.forEach((v) => { const k = v.reason || "Unspecified"; c[k] = (c[k] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: SERIES_COLORS[i % SERIES_COLORS.length] }));
  }, [filtered]);

  const officesInSel = coverage.filter((o) => matchesLocation(o, loc)).length;

  const filtersActive = Object.values(loc).some((v) => v && v !== "All") || date.preset !== "all";

  const visitsByLevel = (
    <div className="card card-pad" style={{ minWidth: 0 }}>
      {!drill ? (
        <>
          <p className="analytics-card-title">{loc.branch}</p>
          <p className="analytics-card-sub">A single branch is as fine-grained as this gets — {filtered.length} visit(s) here.</p>
        </>
      ) : (
        <>
          <p className="analytics-card-title">Visits by {DRILL_LABELS[field].toLowerCase()}</p>
          <p className="analytics-card-sub">{loc.division === "All" ? "Nationwide. Select a division to view districts, then areas and branches." : "Within your current selection."}</p>
          <RankedBarChart items={drill.counts} />
        </>
      )}
    </div>
  );

  return (
    <div>
      {/* filters live beside the map, so choosing one and watching the map zoom happen on the same screen */}
      <div className="cov-grid" style={{ marginBottom: 16 }}>
        <MapPanel
          title="Visit density"
          sub="Where visits are concentrated — and where they aren't. Click through to zoom into districts and area offices."
          filters={
            <>
              <LocationFilterBar offices={offices} value={loc} onChange={setLoc} labelled />
              <div className="mf-field"><span className="mf-label">Date range</span><DateFilterBar value={date} onChange={setDate} /></div>
            </>
          }
          canClear={filtersActive} onClear={() => { setLoc(EMPTY_LOCATION_FILTER); setDate(EMPTY_DATE_FILTER); }}
        >
          <InteractiveMap
            divisions={bdDivisions} districts={bdDistricts} offices={coverage}
            mode={mode} onModeChange={setMode} filter={loc} onFilter={setLoc} onOpenBranch={onOpenBranch}
            visitValues={visitValues} targetDays={target} showCoverage={showCoverage}
          />
        </MapPanel>
        {visitsByLevel}
      </div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Reveal i={0}><Kpi icon={MapPin} label="Visits in selection" value={filtered.length} /></Reveal>
        <Reveal i={1}><Kpi icon={Building2} tone="green" label={`Offices visited (of ${officesInSel})`} value={stats.officesVisited} /></Reveal>
        <Reveal i={2}><Kpi icon={Star} tone="amber" label="Avg client rating" value={stats.overall == null ? "—" : Number(stats.overall.toFixed(1))} decimals={1} suffix={stats.overall == null ? "" : "★"} /></Reveal>
        <Reveal i={3}><Kpi icon={UserRound} tone="blue" label="Observations" value={stats.staffObservations} /></Reveal>
        <Reveal i={4}><Kpi icon={Users} label="Clients heard" value={stats.reached} /></Reveal>
        <Reveal i={5}><Kpi icon={ShieldCheck} tone="green" label="Info completeness" value={stats.quality == null ? "—" : Math.round(stats.quality * 100)} suffix={stats.quality == null ? "" : "%"} /></Reveal>
      </div>

      <div className="analytics-grid" style={{ marginBottom: 16 }}>
        <div className="card card-pad" style={{ minWidth: 0 }}>
          {!drill ? (
            <>
              <p className="analytics-card-title">Rating — {loc.branch}</p>
              <p className="analytics-card-sub">Open the branch profile for its full rating history.</p>
            </>
          ) : drill.ratings.length === 0 ? (
            <>
              <p className="analytics-card-title">Avg rating by {DRILL_LABELS[field].toLowerCase()}</p>
              <p className="analytics-card-sub">No client ratings in this selection yet.</p>
            </>
          ) : (
            <>
              <p className="analytics-card-title">Avg rating by {DRILL_LABELS[field].toLowerCase()}</p>
              <p className="analytics-card-sub">Combined staff + member stars — who's happiest, or not.</p>
              <RankedBarChart items={drill.ratings} valueSuffix="★" max={5} />
            </>
          )}
        </div>
        <div className="card card-pad" style={{ minWidth: 0 }}>
          <p className="analytics-card-title">Visits over time</p>
          <p className="analytics-card-sub">Last 6 months, for the selected location.</p>
          <TrendLineChart labels={months.map((m) => m.label)} series={[{ key: "v", label: "Visits", color: "var(--brand)", values: trend }]} />
        </div>
      </div>

      <div className="analytics-grid">
        <div className="card card-pad" style={{ minWidth: 0 }}>
          <p className="analytics-card-title">Why we visit</p>
          <p className="analytics-card-sub">Visit purpose mix within your selection.</p>
          <RankedBarChart items={reasons} />
        </div>
        <div className="card card-pad" style={{ minWidth: 0 }}>
          <p className="analytics-card-title">Was the information gathered properly?</p>
          <p className="analytics-card-sub">Share of visits in this selection that captured each piece of information. Low bars show what staff most often skip.</p>
          <RankedBarChart
            items={stats.passRates.map((p) => ({ label: p.label, value: p.value, color: p.value >= 80 ? "var(--success)" : p.value >= 60 ? "var(--warning)" : "var(--danger)" }))}
            valueSuffix="%" max={100} wide
          />
        </div>
      </div>
    </div>
  );
}
