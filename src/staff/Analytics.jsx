import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, MapPin, MessageCircle, CalendarDays, CheckCircle2, AlertCircle } from "lucide-react";
import { Reveal } from "../lib/ui";
import { computeCoverage } from "../lib/offices";
import { Kpi, DeltaChip, LocationFilterBar, EMPTY_LOCATION_FILTER, EMPTY_DATE_FILTER } from "./analytics/common";
import { registeredVisits, flattenComplaints, computeHealth } from "./analytics/health";
import { FEATURES } from "../lib/features";
import VisitsView from "./analytics/VisitsView";
import ComplaintsView from "./analytics/ComplaintsView";

/** The management view: visit + complaint analytics, on management's "Details" page.
 *  (Coverage and network health live in their own tab.) As a page the headline numbers
 *  and the full analytics show together; elsewhere it starts as just the numbers. */
export default function Analytics({ visits, offices, departments, settings, onOpenBranch, asPage = false }) {
  const target = settings?.visitTargetDays || 90;
  const [expanded, setExpanded] = useState(asPage);
  const [tab, setTab] = useState("visits"); // visits | complaints
  const [loc, setLoc] = useState(EMPTY_LOCATION_FILTER);
  const [date, setDate] = useState(EMPTY_DATE_FILTER);

  const coverage = useMemo(() => computeCoverage(offices, visits, target), [offices, visits, target]);
  const real = useMemo(() => registeredVisits(visits), [visits]);
  const complaints = useMemo(() => flattenComplaints(visits), [visits]);
  const health = useMemo(() => computeHealth(real, complaints, target), [real, complaints, target]);

  return (
    <div className="analytics-block">
      {!asPage && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <p className="h-eyebrow" style={{ margin: 0, fontSize: 12 }}>Management view</p>
          <button className="btn btn-ghost btn-sm" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
            {expanded ? <>Show less <ChevronUp size={14} /></> : <>Show details <ChevronDown size={14} /></>}
          </button>
        </div>
      )}

      {(asPage || !expanded) && (
        <div className="kpi-grid" style={asPage ? { marginBottom: 22 } : undefined}>
          <Reveal i={0}><Kpi icon={MapPin} label="Visits on record" value={real.length} spark={health.visitsSpark} sparkColor="var(--brand)" /></Reveal>
          <Reveal i={1}>
            <Kpi icon={CalendarDays} tone="blue" label="Visits this month" value={health.thisMonth}
                 delta={<DeltaChip current={health.thisMonth} previous={health.lastMonth} />} />
          </Reveal>
          <Reveal i={2}><Kpi icon={AlertCircle} tone="red" label="Open action items" value={health.open} foot={<span className="pill pill-brand">{health.totalComplaints} filed</span>} /></Reveal>
          <Reveal i={3}><Kpi icon={CheckCircle2} tone="green" label="Resolution rate" value={health.resolvedPct} suffix="%" /></Reveal>
        </div>
      )}

      {expanded && (
        <>
          <div className="analytics-subtabs" role="tablist">
            <button className={`analytics-subtab ${tab === "visits" ? "active" : ""}`} onClick={() => setTab("visits")}><MapPin size={14} /> Visits</button>
            <button className={`analytics-subtab ${tab === "complaints" ? "active" : ""}`} onClick={() => setTab("complaints")}><MessageCircle size={14} /> Action items</button>
          </div>

          {/* Visits keeps its filters beside the map; Complaints has no map, so its filters stay in a bar */}
          {tab === "complaints" && (
            <div className="analytics-filters">
              <LocationFilterBar offices={offices} value={loc} onChange={setLoc} />
            </div>
          )}

          <div key={tab} className="page-enter">
            {tab === "visits" && <VisitsView visits={visits} coverage={coverage} offices={offices} showCoverage={FEATURES.managementSeesNetworkCoverage} target={target} loc={loc} setLoc={setLoc} date={date} setDate={setDate} onOpenBranch={onOpenBranch} />}
            {tab === "complaints" && <ComplaintsView visits={visits} complaints={complaints} departments={departments} loc={loc} date={date} setDate={setDate} />}
          </div>
        </>
      )}
    </div>
  );
}
