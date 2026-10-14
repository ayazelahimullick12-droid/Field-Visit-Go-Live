import React, { useMemo, useState } from "react";
import { Star, ShieldCheck, CheckCircle2, CalendarDays, EyeOff, Hourglass } from "lucide-react";
import { Ring, Reveal, CountUp } from "../lib/ui";
import { computeCoverage, coverageSummary } from "../lib/offices";
import { Kpi, DeltaChip, EMPTY_LOCATION_FILTER } from "./analytics/common";
import { registeredVisits, flattenComplaints, computeHealth } from "./analytics/health";
import CoverageView from "./analytics/CoverageView";

/** "Network health": are all field offices visited, and is the information gathered properly?
 *  `embedded` drops the page wrapper and heading (the Management section supplies its own). */
export default function NetworkHealth({ visits, offices, settings, onOpenBranch, embedded = false }) {
  const target = settings?.visitTargetDays || 90;
  const [loc, setLoc] = useState(EMPTY_LOCATION_FILTER);

  const coverage = useMemo(() => computeCoverage(offices, visits, target), [offices, visits, target]);
  const sum = useMemo(() => coverageSummary(coverage), [coverage]);
  const real = useMemo(() => registeredVisits(visits), [visits]);
  const complaints = useMemo(() => flattenComplaints(visits), [visits]);
  const health = useMemo(() => computeHealth(real, complaints, target), [real, complaints, target]);

  const ringColor = sum.pct >= 80 ? "var(--success)" : sum.pct >= 50 ? "var(--warning)" : "var(--danger)";

  const Wrap = embedded ? React.Fragment : "div";
  return (
    <Wrap {...(embedded ? {} : { className: "page" })}>
      {!embedded && (
        <div className="page-head">
          <div>
            <p className="h-eyebrow">Coverage overview</p>
            <h1 className="h-title">Network health</h1>
            <p className="h-desc">Whether every field office is being visited — and whether the information gathered is complete.</p>
          </div>
        </div>
      )}

      <div className="card card-pad">
        <div className="net-hero">
          <Reveal>
            <Ring value={sum.pct} color={ringColor} size={152} stroke={14}>
              <div className="rc-num"><CountUp value={sum.pct} suffix="%" /></div>
              <div className="rc-label">Coverage</div>
            </Ring>
            <div style={{ textAlign: "center", marginTop: 12, fontSize: 12.5, color: "var(--ink-soft)", maxWidth: 190 }}>
              <strong>{sum.ok}</strong> of <strong>{sum.total}</strong> field offices visited in the last {target} days
            </div>
          </Reveal>

          <div className="kpi-grid">
            <Reveal i={1}><Kpi icon={EyeOff} tone="red" label="Never visited" value={sum.never} foot={<span className="pill pill-never">needs a first visit</span>} /></Reveal>
            <Reveal i={2}><Kpi icon={Hourglass} tone="amber" label={`Overdue (> ${target} days)`} value={sum.stale} foot={<span className="pill pill-stale">revisit due</span>} /></Reveal>
            <Reveal i={3}>
              <Kpi icon={CalendarDays} tone="blue" label="Visits this month" value={health.thisMonth}
                   delta={<DeltaChip current={health.thisMonth} previous={health.lastMonth} />} spark={health.visitsSpark} sparkColor="var(--info)" />
            </Reveal>
            <Reveal i={4}>
              <Kpi icon={Star} tone="amber" label="Avg rating" value={health.rating == null ? "—" : Number(health.rating.toFixed(1))} decimals={1} suffix={health.rating == null ? "" : "★"}
                   delta={health.ratingNow != null && health.ratingPrev != null ? <DeltaChip current={health.ratingNow} previous={health.ratingPrev} /> : null}
                   spark={health.ratingSpark} sparkColor="var(--warning)" />
            </Reveal>
            <Reveal i={5}><Kpi icon={ShieldCheck} tone="green" label={`Info completeness (last ${target}d)`} value={health.quality == null ? "—" : Math.round(health.quality * 100)} suffix={health.quality == null ? "" : "%"} /></Reveal>
            <Reveal i={6}><Kpi icon={CheckCircle2} tone="green" label="Action items resolved" value={health.resolvedPct} suffix="%" foot={<span className="pill pill-brand">{health.open} open</span>} /></Reveal>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <CoverageView coverage={coverage} offices={offices} visits={real} target={target} loc={loc} setLoc={setLoc} onOpenBranch={onOpenBranch} />
      </div>
    </Wrap>
  );
}
