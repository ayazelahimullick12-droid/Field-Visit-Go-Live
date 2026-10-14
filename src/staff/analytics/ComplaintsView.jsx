import React, { useMemo } from "react";
import { MessageCircle, CheckCircle2, AlertTriangle, Timer, Hourglass, Inbox } from "lucide-react";
import { RankedBarChart, StackedBarChart } from "../../lib/charts";
import { Reveal } from "../../lib/ui";
import { average, DAY_MS } from "../../lib/offices";
import { Kpi, SERIES_COLORS, matchesLocation, matchesDate, DateFilterBar } from "./common";
import { STATUSES, STATUS_COLORS, statusOf, isFixed, isLate, fixedOnTime } from "../../lib/complaints";

const days = (a, b) => (new Date(b).getTime() - new Date(a).getTime()) / DAY_MS;
const fmtDays = (n) => (n == null ? "—" : Number(n.toFixed(1)));

function Funnel({ steps }) {
  const max = Math.max(1, steps[0]?.value || 1);
  return (
    <div className="funnel">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const conv = prev ? Math.round((s.value / prev) * 100) : null;
        return (
          <div className="funnel-row" key={s.label}>
            <div className="funnel-label">{s.label}</div>
            <div className="funnel-track">
              <div className="funnel-bar" style={{ width: `${Math.max(2, (s.value / max) * 100)}%`, background: s.color, "--i": i }} />
            </div>
            <div className="funnel-val">{s.value}{conv != null && <span>{conv}%</span>}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function ComplaintsView({ visits, complaints, departments, loc, date, setDate }) {
  const filtered = useMemo(() => complaints.filter((c) => matchesLocation(c, loc) && matchesDate(c.filedDate, date)), [complaints, loc, date]);
  const visitsSel = useMemo(
    () => visits.filter((v) => v.date && v.steps?.register !== false && matchesLocation(v, loc) && matchesDate(v.date, date)),
    [visits, loc, date]
  );

  const deptOrder = departments.length > 0 ? departments.map((d) => d.name) : [...new Set(filtered.map((c) => c.department))];
  const byDept = useMemo(() => deptOrder.map((name, i) => {
    const list = filtered.filter((c) => c.department === name);
    const assigned = list.filter((c) => c.assignedEmployeeId);
    const fixed = list.filter(isFixed);
    const onTime = fixed.filter(fixedOnTime).length;
    return {
      name, color: SERIES_COLORS[i % SERIES_COLORS.length], count: list.length, success: onTime, fail: fixed.length - onTime,
      status: Object.fromEntries(STATUSES.map((st) => [st, list.filter((c) => statusOf(c) === st).length])),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [filtered, departments]);

  // unit → team: which teams inside a unit the complaints actually land on (stored as department → unit)
  const byUnit = useMemo(() => {
    const m = {};
    filtered.forEach((c) => {
      if (!c.unit) return;
      const key = `${c.department} · ${c.unit}`;
      (m[key] = m[key] || { label: key, value: 0, color: SERIES_COLORS[Math.max(0, deptOrder.indexOf(c.department)) % SERIES_COLORS.length] }).value++;
    });
    return Object.values(m).sort((a, b) => b.value - a.value).slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, departments]);

  const k = useMemo(() => {
    const resolved = filtered.filter(isFixed);
    const assigned = filtered.filter((c) => c.assignedEmployeeId);
    const late = resolved.filter((c) => !fixedOnTime(c)).length + filtered.filter((c) => isLate(c)).length;
    const toAssign = filtered.filter((c) => c.deadlineSetAt && c.filedDate).map((c) => days(c.filedDate, c.deadlineSetAt));
    const toResolve = resolved.filter((c) => c.resolvedAt && c.filedDate).map((c) => days(c.filedDate, c.resolvedAt));
    const now = Date.now();
    const open = filtered.filter((c) => !isFixed(c));
    const age = (c) => (now - new Date(c.filedDate).getTime()) / DAY_MS;
    return {
      total: filtered.length,
      rate: filtered.length ? Math.round((resolved.length / filtered.length) * 100) : 0,
      lateRate: assigned.length ? Math.round((late / assigned.length) * 100) : 0,
      avgAssign: average(toAssign), avgResolve: average(toResolve), open: open.length,
      ageing: [
        { label: "0–7 days", value: open.filter((c) => age(c) <= 7).length, color: "var(--success)" },
        { label: "8–14 days", value: open.filter((c) => age(c) > 7 && age(c) <= 14).length, color: "var(--info)" },
        { label: "15–30 days", value: open.filter((c) => age(c) > 14 && age(c) <= 30).length, color: "var(--warning)" },
        { label: "30+ days", value: open.filter((c) => age(c) > 30).length, color: "var(--danger)" },
      ],
      funnel: [
        { label: "Visits", value: visitsSel.length, color: "var(--series-1)" },
        { label: "Raised an issue", value: visitsSel.filter((v) => (v.complaints || []).length > 0).length, color: "var(--series-2)" },
        { label: "Action items filed", value: filtered.length, color: "var(--series-4)" },
        { label: "Assigned to a fixer", value: assigned.length, color: "var(--series-6)" },
        { label: "Fixed", value: resolved.length, color: "var(--success)" },
        { label: "Fixed on time", value: resolved.filter(fixedOnTime).length, color: "var(--series-3)" },
      ],
      urgency: [
        { label: "High", value: filtered.filter((c) => c.urgency === "High").length, color: "var(--danger)" },
        { label: "Medium", value: filtered.filter((c) => c.urgency === "Medium").length, color: "var(--warning)" },
        { label: "Low", value: filtered.filter((c) => c.urgency === "Low").length, color: "var(--success)" },
      ],
    };
  }, [filtered, visitsSel]);

  return (
    <div>
      <div className="analytics-filters" style={{ marginTop: -4 }}>
        <DateFilterBar value={date} onChange={setDate} />
      </div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Reveal i={0}><Kpi icon={MessageCircle} label="Action items in selection" value={k.total} /></Reveal>
        <Reveal i={1}><Kpi icon={CheckCircle2} tone="green" label="Fix rate" value={k.rate} suffix="%" /></Reveal>
        <Reveal i={2}><Kpi icon={Inbox} tone="red" label="Open right now" value={k.open} /></Reveal>
        <Reveal i={3}><Kpi icon={AlertTriangle} tone="amber" label="Missed-deadline rate" value={k.lateRate} suffix="%" /></Reveal>
        <Reveal i={4}><Kpi icon={Timer} tone="blue" label="Avg days to assign" value={fmtDays(k.avgAssign)} /></Reveal>
        <Reveal i={5}><Kpi icon={Hourglass} label="Avg days to fix" value={fmtDays(k.avgResolve)} /></Reveal>
      </div>

      <div className="analytics-grid" style={{ marginBottom: 16 }}>
        <div className="card card-pad" style={{ minWidth: 0 }}>
          <p className="analytics-card-title">From visit to fix</p>
          <p className="analytics-card-sub">How visits turn into fixed problems, and where they drop off. Percentages are step-to-step.</p>
          <Funnel steps={k.funnel} />
        </div>
        <div className="card card-pad" style={{ minWidth: 0 }}>
          <p className="analytics-card-title">Age of open action items</p>
          <p className="analytics-card-sub">Action items not yet fixed, by days since they were filed.</p>
          <RankedBarChart items={k.ageing} />
        </div>
      </div>

      <div className="analytics-grid" style={{ marginBottom: 16 }}>
        <div className="card card-pad" style={{ minWidth: 0 }}>
          <p className="analytics-card-title">Action items by unit</p>
          <p className="analytics-card-sub">Action item volume by unit.</p>
          <RankedBarChart items={[...byDept].sort((a, b) => b.count - a.count).map((d) => ({ label: d.name, value: d.count, color: d.color }))} />
        </div>
        <div className="card card-pad" style={{ minWidth: 0 }}>
          <p className="analytics-card-title">On-time fixes by unit</p>
          <p className="analytics-card-sub">Fixed action items: on time (by the deadline) versus late.</p>
          <StackedBarChart
            rows={byDept.map((d) => ({ label: d.name, segments: [{ key: "Success", value: d.success }, { key: "Fail", value: d.fail }] }))}
            segmentDefs={[{ key: "Success", label: "Fixed on time", color: "var(--success)" }, { key: "Fail", label: "Fixed late", color: "var(--danger)" }]}
          />
        </div>
      </div>

      <div className="analytics-grid">
        <div className="card card-pad" style={{ minWidth: 0 }}>
          <p className="analytics-card-title">Status by unit</p>
          <p className="analytics-card-sub">Waiting, assigned, in progress, fixed and long term.</p>
          <StackedBarChart
            rows={byDept.map((d) => ({ label: d.name, segments: STATUSES.map((key) => ({ key, value: d.status[key] })) }))}
            segmentDefs={STATUSES.map((key) => ({ key, label: key, color: STATUS_COLORS[key] }))}
          />
        </div>
        <div className="card card-pad" style={{ minWidth: 0 }}>
          <p className="analytics-card-title">Urgency mix</p>
          <p className="analytics-card-sub">Urgency of action items in the selection.</p>
          <RankedBarChart items={k.urgency} />
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <p className="analytics-card-title">Action items by team</p>
        <p className="analytics-card-sub">The ten teams receiving the most action items.</p>
        {byUnit.length ? <RankedBarChart items={byUnit} wide /> : <div className="viz-empty">No team-tagged action items in this selection.</div>}
      </div>
    </div>
  );
}
