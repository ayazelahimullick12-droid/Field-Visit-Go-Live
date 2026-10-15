import React, { useState } from "react";
import { LayoutDashboard, Building2, Users, BarChart3, Link2, ExternalLink, Check } from "lucide-react";
import { officeKey } from "../../lib/offices";
import { managementTabOn } from "../../lib/features";
import Analytics from "../Analytics";
import VisitHub from "../visits/VisitHub";
import Summary from "./Summary";
import OfficesView from "./OfficesView";
import { PeopleDirectory, PersonProfile } from "./People";
import { peopleList } from "./data";
import { PeriodSelect } from "./periods";

export const MGMT_TABS = [
  { key: "summary", label: "Summary", icon: LayoutDashboard, desc: "Programme performance at a glance: field activity, network coverage, information gathered and action item handling. Filter by time, location and staff department." },
  { key: "offices", label: "Offices", icon: Building2, desc: "Whether every branch is being visited (the coverage map), and how often each branch, village organisation (VO), area and region office is visited, by whom, and what was recorded there." },
  { key: "people", label: "People", icon: Users, desc: "Everyone who makes visits: how many, where, how complete, and their full visit history." },
  { key: "analytics", label: "Analytics", icon: BarChart3, desc: "Visits and action items in depth: ratings, visit reasons, offices reached, and the path from action item to resolution." },
];

/** The tabs this deployment shows: Summary always, the others when an admin has switched them on. */
export const visibleMgmtTabs = (settings) => MGMT_TABS.filter((t) => managementTabOn(settings, t.key));

/** The public, sign-in-free copy of the Summary (see src/summary/): copy or open its link. */
function PublicLink() {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/summary.html`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt("Copy this link:", url); }
  };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="btn btn-secondary btn-sm" onClick={copy} title="Anyone with this link can see a read-only summary, without names or contact details">
        {copied ? <><Check size={14} /> Copied</> : <><Link2 size={14} /> Copy public link</>}
      </button>
      <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>
    </div>
  );
}

export const EMPTY_MGMT_VIEW = { tab: "summary", period: "30d", personId: null, visitId: null };

/**
 * The Management section of the staff app (employees tagged "management"). Read-only and
 * organisation-wide. `view` lives in the app so it survives a trip to a Branch 360° profile:
 * { tab, period, personId, visitId } — a visit opened from a person's profile returns there.
 */
export default function Management({ view, setView, trips, records, coverage, offices, employees, departments, settings, tree, questions, onOpenBranch }) {
  const set = (patch) => { setView({ ...view, ...patch }); window.scrollTo({ top: 0, behavior: "instant" }); };
  const openPerson = (personId) => set({ personId, visitId: null });
  const openVisit = (visitId) => set({ visitId });
  const openBranchByName = (name) => { const row = coverage.find((o) => o.name === name); if (row) onOpenBranch(row); };
  const openMasterOffice = (o) => onOpenBranch({ key: officeKey(o) });

  const visit = view.visitId ? trips.find((v) => v.id === view.visitId) : null;
  if (visit) {
    return (
      <VisitHub
        key={visit.id} visit={visit} tree={tree} departments={departments} questions={questions}
        sync={{ pending: 0, online: true, syncing: false }} viewer={{ backLabel: view.personId ? "Back to profile" : "Back" }}
        onSave={() => {}} showToast={() => {}} onEditDetails={() => {}} onMarkedDone={() => {}}
        onBack={() => set({ visitId: null })}
      />
    );
  }

  const tabs = visibleMgmtTabs(settings);
  const peopleOn = managementTabOn(settings, "people");
  // person profiles belong to the People tab, so they are only reachable while it is switched on
  const person = peopleOn && view.personId ? peopleList(employees, trips).find((p) => p.id === view.personId) : null;
  const tab = tabs.find((t) => t.key === view.tab) || tabs[0];
  const showPeriod = person || ["offices", "people"].includes(tab.key); // the Summary has its own filters

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="h-eyebrow">Management{person ? " · People" : ""}</p>
          <h1 className="h-title">{person ? "Visit history" : tab.label}</h1>
          {!person && <p className="h-desc">{tab.desc}</p>}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {!person && tab.key === "summary" && <PublicLink />}
          {showPeriod && <PeriodSelect value={view.period} onChange={(period) => setView({ ...view, period })} />}
        </div>
      </div>

      {!person && tabs.length > 1 && (
        <div className="analytics-subtabs" role="tablist" style={{ marginTop: 0 }}>
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab.key === t.key} className={`analytics-subtab ${tab.key === t.key ? "active" : ""}`} onClick={() => set({ tab: t.key })}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      )}

      <div key={person ? `p-${person.id}` : tab.key} className="page-enter">
        {person ? (
          <PersonProfile person={person} employees={employees} departments={departments} trips={trips} records={records} period={view.period}
            onBack={() => set({ personId: null, tab: "people" })} onOpenVisit={openVisit} onOpenBranchByName={openBranchByName} />
        ) : tab.key === "summary" ? (
          <Summary trips={trips} records={records} coverage={coverage} offices={offices} employees={employees} departments={departments} settings={settings}
            period={view.period} onGo={(t) => set({ tab: t })} onOpenPerson={peopleOn ? openPerson : undefined} />
        ) : tab.key === "offices" ? (
          <OfficesView records={records} offices={offices} coverage={coverage} target={settings?.visitTargetDays || 90} period={view.period} onOpenBranch={openMasterOffice} onOpenCoverageRow={onOpenBranch} onOpenPerson={openPerson} onOpenVisit={openVisit} />
        ) : tab.key === "people" ? (
          <PeopleDirectory employees={employees} trips={trips} records={records} period={view.period} onOpenPerson={openPerson} />
        ) : (
          <Analytics visits={records} offices={offices} departments={departments} settings={settings} onOpenBranch={onOpenBranch} asPage />
        )}
      </div>
    </div>
  );
}
