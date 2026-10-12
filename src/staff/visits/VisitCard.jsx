import React from "react";
import { Clock, ChevronRight, Check, Eye, MessageCircle, Image, Users, PenLine, BedDouble } from "lucide-react";
import { PHASES, phaseOf, countsOf, tripStart, tripTitle, tripPath, computeDuration, fmtDay, fmtTime, relativeDay, plural, reasonText, shortName } from "../../lib/visits";

export const TYPE_ICONS = {
  complaint: { icon: MessageCircle, cls: "ico-complaint" },
  interaction: { icon: Users, cls: "ico-client" },
  observation: { icon: Eye, cls: "ico-obs" },
  story: { icon: Image, cls: "ico-story" },
};

export function PhasePill({ phase }) {
  const p = PHASES[phase];
  return <span className={`pill ${p.pill}`}>{phase === "done" && <Check size={12} />}{p.label}</span>;
}

/** A visit at a glance: its stage, where, when, what was recorded and what's still a draft. */
export default function VisitCard({ visit: v, onOpen }) {
  const phase = phaseOf(v);
  const working = phase === "progress" || phase === "due";
  const c = countsOf(v);
  const dur = computeDuration(v.date, v.visitTime, v.returnDate, v.returnTime);
  const start = v.date ? tripStart(v) : null;
  const path = tripPath(v);
  const stops = v.stops || [];

  const chip = (type, one, many) => {
    const { icon: Icon, cls } = TYPE_ICONS[type];
    const n = c[type].total;
    return <span className={`vchip ${n ? "" : "zero"}`}><span className={`vchip-ico ${cls}`}><Icon size={12} /></span>{plural(n, one, many)}</span>;
  };

  return (
    <button type="button" className={`vcard ${working ? "live" : ""}`} onClick={() => onOpen(v.id)}>
      <span className="vcard-top">
        <PhasePill phase={phase} />
        <span className="vcard-date">{start ? fmtDay(start) : "No date"}{phase === "upcoming" && start ? ` · ${relativeDay(start)}` : ""}</span>
      </span>
      <span>
        <span className="vcard-title">{tripTitle(v)}</span>
        <span className="vcard-meta">
          <span>{reasonText(v)}</span>
          <span><Clock size={12} /> {v.visitTime ? fmtTime(v.visitTime) : "start not set"} – {v.returnTime ? fmtTime(v.returnTime) : <span className={phase !== "done" ? "missing" : ""}>return not set</span>}</span>
          {dur && <span>{dur}</span>}
        </span>
        {path && path !== tripTitle(v) && <span className="vcard-path">{path}</span>}
      </span>
      {stops.length > 0 && (
        <span className="vcard-stops">
          {stops.slice(0, 4).map((s) => <span key={s.name} className={`rs-stop ${s.kind}`}>{s.kind === "branch" ? shortName(s.name) : s.name}</span>)}
          {stops.length > 4 && <span className="rs-more">+{stops.length - 4}</span>}
        </span>
      )}
      {(v.stays || []).length > 0 && (
        <span className="vcard-stay"><BedDouble size={13} /> {v.stays.map((s) => s.name).join(", ")}</span>
      )}
      {c.total > 0 && (
        <span className="vcard-counts">
          {chip("complaint", "complaint")}
          {chip("interaction", "client", "clients")}
          {chip("observation", "observation")}
          {chip("story", "story", "stories")}
        </span>
      )}
      {c.drafts > 0 && <span className="vcard-todo"><PenLine size={15} /><span><b>{plural(c.drafts, "draft")}</b> not submitted yet</span></span>}
      <span className="vcard-foot">
        <span className="mono">{v.id}</span>
        <span className="vcard-go">{PHASES[phase].go} <ChevronRight size={15} /></span>
      </span>
    </button>
  );
}

/** Visits grouped by stage, most urgent first. */
export function VisitGroups({ visits, onOpen, empty }) {
  const groups = { due: [], progress: [], upcoming: [], done: [] };
  visits.forEach((v) => groups[phaseOf(v)].push(v));
  groups.upcoming.sort((a, b) => tripStart(a) - tripStart(b));
  ["due", "progress", "done"].forEach((k) => groups[k].sort((a, b) => (b.date || "").localeCompare(a.date || "")));
  const order = [["due", "Back, not marked done"], ["progress", "In progress"], ["upcoming", "Upcoming"], ["done", "Done"]];
  if (!visits.length) return empty || null;
  return order.filter(([k]) => groups[k].length).map(([k, title]) => (
    <React.Fragment key={k}>
      <div className="vgroup-head"><span>{title}</span><span>{groups[k].length}</span></div>
      <div className="vgrid">{groups[k].map((v) => <VisitCard key={v.id} visit={v} onOpen={onOpen} />)}</div>
    </React.Fragment>
  ));
}
