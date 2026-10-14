import React, { useMemo } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { ArrowLeft, Plus, Star, MessageCircle, ShieldCheck, Users, CalendarDays } from "lucide-react";
import { Reveal } from "../lib/ui";
import { statusOf, statusClass, isFixed, complaintTitle } from "../lib/complaints";
import { TrendLineChart } from "../lib/charts";
import { Kpi } from "./analytics/common";
import BdOutline from "../lib/BdOutline";
import bdDistricts from "../lib/bd-districts.geojson.json";
import {
  STATUS_META, timeAgo, average, visitChecks, visitRatings, clientsHeard, monthBuckets, monthKeyOf, districtShapeName, MONTH_LABELS,
} from "../lib/offices";

function MiniLocator({ office, siblings }) {
  const geo = useMemo(() => {
    const f = bdDistricts.features.find((x) => x.properties.shapeName === districtShapeName(office.district));
    if (!f) return null;
    const proj = geoMercator().fitExtent([[18, 18], [302, 222]], f);
    return { d: geoPath(proj)(f), proj };
  }, [office.district]);
  if (!geo) return <div className="viz-empty">No map outline for this district.</div>;
  const at = (o) => (Number.isFinite(o.lat) && Number.isFinite(o.lng) ? geo.proj([o.lng, o.lat]) : null);
  const me = at(office);
  return (
    <svg className="mini-locator" viewBox="0 0 320 240" role="img" aria-label={`${office.name} within ${office.district} district`}>
      <path d={geo.d} fill="var(--map-empty)" stroke="var(--card)" strokeWidth="2" />
      {siblings.filter((o) => o.key !== office.key).map((o) => { const p = at(o); return p ? <circle key={o.key} cx={p[0]} cy={p[1]} r="3.4" fill={STATUS_META[o.status].color} opacity=".55" /> : null; })}
      {me && (
        <g>
          <circle className="ping" cx={me[0]} cy={me[1]} r="9" fill="none" stroke="var(--brand)" strokeWidth="1.6" style={{ transformBox: "fill-box", transformOrigin: "center", animation: "ping 2.2s ease-out infinite" }} />
          <circle cx={me[0]} cy={me[1]} r="7" fill="var(--brand)" stroke="var(--card)" strokeWidth="2.4" />
        </g>
      )}
      <text x="16" y="230" fontSize="11" fontWeight="700" fill="var(--ink-faint)">{office.district} district</text>
    </svg>
  );
}

export default function BranchProfile({ office, coverageRows, onBack, onNewVisit, canRegister = true }) {
  const row = office;
  const siblings = useMemo(() => coverageRows.filter((o) => o.district === row.district), [coverageRows, row.district]);
  const months = useMemo(() => monthBuckets(6), []);
  const ratingTrend = useMemo(
    () => months.map((m) => { const r = average(row.visits.filter((v) => monthKeyOf(v.date) === m.key).flatMap(visitRatings)); return r == null ? 0 : Number(r.toFixed(1)); }),
    [row.visits, months]
  );
  const complaints = useMemo(
    () => row.visits.flatMap((v) => (v.complaints || []).map((c) => ({ ...c, visitDate: v.date }))).sort((a, b) => (b.filedDate || "").localeCompare(a.filedDate || "")),
    [row.visits]
  );
  const members = row.visits.reduce((s, v) => s + clientsHeard(v), 0);
  const meta = STATUS_META[row.status];

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12, paddingLeft: 8 }} onClick={onBack}><ArrowLeft size={15} /> Back</button>

      <div className="hero bp-hero">
        <BdOutline className="hero-outline" />
        <div className="hero-row">
          <div>
            <p className="h-eyebrow">{row.division} › {row.district} › {row.area}</p>
            <h1>{row.name}</h1>
            <p>
              <span className={`pill ${meta.pill}`} style={{ marginRight: 10 }}>{meta.label}</span>
              {row.lastDate ? `Last visited ${timeAgo(row.daysSince)} by ${row.lastBy}` : "No visits recorded yet — this office needs a first visit."}
            </p>
          </div>
          {canRegister && <button className="btn btn-primary btn-lg" onClick={() => onNewVisit(row)}><Plus size={17} /> Register a visit here</button>}
        </div>
      </div>

      <div className="kpi-grid" style={{ margin: "16px 0" }}>
        <Reveal i={0}><Kpi icon={CalendarDays} label="Total visits" value={row.visitCount} /></Reveal>
        <Reveal i={1}>
          <Kpi icon={Star} tone="amber" label="Avg rating" value={row.avgRating == null ? "—" : Number(row.avgRating.toFixed(1))} decimals={1} suffix={row.avgRating == null ? "" : "★"}
               spark={ratingTrend.some((x) => x > 0) ? ratingTrend : null} sparkColor="var(--warning)" />
        </Reveal>
        <Reveal i={2}><Kpi icon={MessageCircle} tone={row.openComplaints ? "red" : "green"} label="Open action items" value={row.openComplaints} foot={<span className="pill pill-brand">{row.totalComplaints} total</span>} /></Reveal>
        <Reveal i={3}><Kpi icon={ShieldCheck} tone="green" label="Info completeness" value={row.quality == null ? "—" : Math.round(row.quality * 100)} suffix={row.quality == null ? "" : "%"} /></Reveal>
        <Reveal i={4}><Kpi icon={Users} tone="blue" label="Clients heard" value={members} /></Reveal>
      </div>

      <div className="bp-grid">
        <Reveal className="card card-pad" i={1} style={{ minWidth: 0 }}>
          <p className="analytics-card-title">Visit history</p>
          <p className="analytics-card-sub">Every visit to this office, newest first.</p>
          {row.visits.length === 0 ? (
            <div className="viz-empty">No visits yet.</div>
          ) : (
            row.visits.map((v) => {
              const d = new Date(v.date);
              const q = visitChecks(v).score;
              const rs = visitRatings(v);
              const sp = (v.observations || []).find((o) => o.fromStaff && o.staff)?.staff;
              const mp = (v.interactions || []).find((o) => o.person)?.person;
              return (
                <div className="visit-row" key={v.id}>
                  <div className="vr-date"><div className="d">{d.getDate()}</div><div className="m">{MONTH_LABELS[d.getMonth()]} {String(d.getFullYear()).slice(2)}</div></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span className="visit-reason-tag">{v.reason || "—"}</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{v.employeeName}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {rs.length > 0 && <span>★ {average(rs).toFixed(1)}</span>}
                      <span>{(v.complaints || []).length} action item{(v.complaints || []).length === 1 ? "" : "s"}</span>
                      <span>{Math.round(q * 100)}% complete</span>
                      <span className="mono">{v.id}</span>
                    </div>
                    {(sp || mp) && (
                      <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {sp && <span>Staff observation: {[sp.name, sp.designation, sp.department, sp.pin && `PIN ${sp.pin}`].filter(Boolean).join(" · ") || "details left blank"}</span>}
                        {mp && <span>Client interaction: {[mp.name, mp.memberNumber && `No. ${mp.memberNumber}`, mp.voCode].filter(Boolean).join(" · ") || "details left blank"}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </Reveal>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <Reveal className="card card-pad" i={2}>
            <p className="analytics-card-title">Where it is</p>
            <p className="analytics-card-sub">{row.area} · {siblings.length} office{siblings.length === 1 ? "" : "s"} in {row.district}</p>
            <MiniLocator office={row} siblings={siblings} />
            {!(Number.isFinite(row.lat) && Number.isFinite(row.lng)) && <p className="field-hint">No coordinates on file for this office yet.</p>}
          </Reveal>
          <Reveal className="card card-pad" i={3}>
            <p className="analytics-card-title">Rating trend</p>
            <p className="analytics-card-sub">Average star rating per month, last 6 months.</p>
            <TrendLineChart labels={months.map((m) => m.label)} series={[{ key: "r", label: "Avg rating", color: "var(--warning)", values: ratingTrend }]} height={170} />
          </Reveal>
        </div>
      </div>

      <Reveal className="card card-pad" i={1} style={{ marginTop: 16 }}>
        <p className="analytics-card-title">Action items raised here</p>
        <p className="analytics-card-sub">From filing to resolution.</p>
        {complaints.length === 0 ? <div className="viz-empty">No action items raised at this office.</div> : (
          <div className="ctable-wrap">
            <table className="ctable stack">
              <thead><tr><th>ID</th><th>Issue</th><th>Dept</th><th>Urgency</th><th>Status</th><th>Filed</th><th>Assigned to</th></tr></thead>
              <tbody>
                {complaints.map((c) => (
                  <tr key={c.id}>
                    <td data-label="ID" className="mono">{c.id}</td>
                    <td data-label="Issue" style={{ maxWidth: 280 }}><b>{complaintTitle(c)}</b>{isFixed(c) && c.resolutionNotes && <div className="cell-sub">Fix: {c.resolutionNotes}</div>}</td>
                    <td data-label="Dept">{c.department}</td>
                    <td data-label="Urgency"><span className={`urgency-badge urgency-${c.urgency}`}>{c.urgency}</span></td>
                    <td data-label="Status"><span className={statusClass(c)}>{statusOf(c)}</span></td>
                    <td data-label="Filed">{c.filedDate}</td>
                    <td data-label="Assigned to">{c.assignedTo || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Reveal>
    </div>
  );
}
