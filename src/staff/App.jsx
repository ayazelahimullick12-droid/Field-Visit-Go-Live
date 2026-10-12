import React, { useState, useEffect, useMemo } from "react";
import {
  MapPin, Calendar, Clock, ChevronRight, ChevronUp, ChevronDown, Plus, Check,
  Camera, Heart, MessageCircle, Share2, CheckCircle2, Home, Wrench, ClipboardList, Radar, BarChart3, CheckCheck,
} from "lucide-react";
import { usePersistedCollection } from "../lib/usePersistedCollection";
import { useVisitStore } from "../lib/useVisitStore";
import { makeId } from "../lib/ids";
import { useTheme } from "../lib/theme";
import AppShell from "../lib/AppShell";
import CommandPalette from "../lib/CommandPalette";
import { PersonDetails } from "../lib/PersonInfo";
import { FEATURES } from "../lib/features";
import BdOutline from "../lib/BdOutline";
import { CountUp, Reveal, Sparkline, DeltaChip } from "../lib/ui";
import { buildLocationTree, computeCoverage, monthBuckets, monthKeyOf, DEFAULT_SETTINGS, STATUS_META } from "../lib/offices";
import { expandVisits, submittedComplaints, phaseOf, PHASES, tripTitle, isoDate, plural, shortName, isDraft, countsOf, placeOffice } from "../lib/visits";
import Analytics from "./Analytics";
import NetworkHealth from "./NetworkHealth";
import BranchProfile from "./BranchProfile";
import VisitCard, { VisitGroups } from "./visits/VisitCard";
import RegisterVisit from "./visits/RegisterVisit";
import VisitHub from "./visits/VisitHub";
import { SyncPill } from "./visits/SyncPill";

/* ------------------------------- API ACTION HELPERS -------------------------------
   Used by the Fixer Queue tab and the story feed, the parts of the staff app that
   need the server's business-logic endpoints rather than saving a visit — see
   server/logic.js for what these actually do.
   ----------------------------------------------------------------------------------- */

const API_BASE = "/api";

async function postAction(path, body) {
  const res = await fetch(`${API_BASE}/actions/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Action failed");
  return json;
}

const photoGradients = [
  "linear-gradient(135deg,#EC008C 0%,#7A1FA2 100%)",
  "linear-gradient(135deg,#2F6FED 0%,#1D1E22 100%)",
  "linear-gradient(135deg,#1C8A54 0%,#0D3B24 100%)",
  "linear-gradient(135deg,#B7791F 0%,#5C3A0A 100%)",
  "linear-gradient(135deg,#EC008C 0%,#2F6FED 100%)",
  "linear-gradient(135deg,#5B5D68 0%,#1D1E22 100%)",
];

const initials = (name) => (name || "?").split(" ").map(p => p[0]).join("").slice(0,2).toUpperCase();

/* ================================ APP ================================ */
// Sign-in lives on the landing page (src/landing/App.jsx): PIN and password only.

const SESSION_KEY = "fvt-staff-session"; // stores just the employee id

// The four kinds of user: base users (field staff), fixers and management sign in
// here; admins use the admin console. Everyone here can register visits.
export const ROLE_LABELS = { field: "Base user", fixer: "Fixer", management: "Management" };
const roleText = (roles) => (roles.length ? roles.map((r) => ROLE_LABELS[r] || r) : [ROLE_LABELS.field]);

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [employees, , employeesLoaded] = usePersistedCollection("employees", []);
  const [departments] = usePersistedCollection("departments", []);
  const [offices] = usePersistedCollection("offices", []);
  const [settings] = usePersistedCollection("settings", DEFAULT_SETTINGS);
  // Visits work offline: kept on the phone and sent when there's signal.
  const store = useVisitStore();
  const visits = store.visits;
  const sync = { pending: store.pending, online: store.online, syncing: store.syncing };

  // The session only remembers *which* employee is signed in (their id) —
  // the actual employee record always comes fresh from the "employees"
  // collection, so admin edits (role changes, etc.) are reflected without
  // needing to log out and back in.
  const [sessionEmployeeId, setSessionEmployeeId] = useState(() => {
    try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
  });
  const currentEmployee = employees.find((e) => e.id === sessionEmployeeId) || null;

  // dashboard | history | myComplaints | details | network | fixerQueue | branch | register | visit | done
  const [staffTab, setStaffTab] = useState("dashboard");
  const [prevTab, setPrevTab] = useState("dashboard");
  const [branchKey, setBranchKey] = useState(null);
  const [activeVisitId, setActiveVisitId] = useState(null);
  const [registerCtx, setRegisterCtx] = useState(null); // { visitId?, prefill?, focus?, back }
  const [hubSheet, setHubSheet] = useState(null);       // a sheet to open when the visit page shows
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  const persistSession = (id) => {
    setSessionEmployeeId(id);
    try {
      if (id) localStorage.setItem(SESSION_KEY, id);
      else localStorage.removeItem(SESSION_KEY);
    } catch { /* private browsing etc. — session just won't survive a reload */ }
  };

  const handleLogout = () => {
    persistSession(null);
    setStaffTab("dashboard");
    setActiveVisitId(null);
    window.location.href = "/";
  };

  // Sign-in/registration lives on the unified landing page ("/"). If there's
  // no valid session here (never logged in, or a stale/deleted employee id),
  // bounce back there instead of showing a login form.
  useEffect(() => {
    if (!employeesLoaded) return;
    if (!currentEmployee) {
      try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
      window.location.replace("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeesLoaded, currentEmployee]);

  // Ctrl/⌘ + K opens quick search
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const roles = currentEmployee?.roles || [];
  const isManagement = roles.includes("management");
  const isFixer = roles.includes("fixer");
  // Network health / coverage is admin-only unless the feature switch (src/lib/features.js) says otherwise
  const seesNetwork = isManagement && FEATURES.managementSeesNetworkCoverage;
  const tree = useMemo(() => buildLocationTree(offices), [offices]);
  const target = settings?.visitTargetDays || DEFAULT_SETTINGS.visitTargetDays;
  const questions = settings?.clientRatingQuestions || [];
  // the analytics, coverage and Branch 360° read one record per office of each visit (submitted entries only)
  const reportVisits = useMemo(() => expandVisits(visits), [visits]);
  const coverage = useMemo(() => (isManagement ? computeCoverage(offices, reportVisits, target) : []), [isManagement, offices, reportVisits, target]);

  if (!employeesLoaded || !currentEmployee || !store.loaded) {
    return (
      <div className="fvt">
        <div className="session-loading"><div className="brand-mark"><MapPin size={20} /></div></div>
      </div>
    );
  }

  // "instant": the page's smooth scrolling would otherwise be cut short by the page change
  const go = (tab) => { setStaffTab(tab); window.scrollTo({ top: 0, behavior: "instant" }); };
  const openNewVisit = (prefill) => {
    const p = prefill && prefill.key ? prefill : null; // from a branch profile; ignore click events
    setRegisterCtx({ prefill: p, back: staffTab === "branch" ? "branch" : "dashboard" });
    go("register");
  };
  const openVisit = (id, sheet = null) => { setActiveVisitId(id); setHubSheet(sheet); go("visit"); };
  const openBranch = (office) => {
    setPrevTab(staffTab === "branch" ? prevTab : staffTab);
    setBranchKey(office.key);
    go("branch");
  };

  const activeVisit = visits.find((v) => v.id === activeVisitId);
  const editingVisit = registerCtx?.visitId ? visits.find((v) => v.id === registerCtx.visitId) : null;
  const myVisits = visits.filter((v) => v.employeeId === currentEmployee.id);
  const branchRow = branchKey ? coverage.find((o) => o.key === branchKey) : null;

  const saveRegistration = (fields) => {
    if (editingVisit) {
      store.saveVisit({ ...editingVisit, ...fields });
      showToast("Visit updated");
      setActiveVisitId(editingVisit.id);
      go("visit");
    } else {
      const id = makeId("V");
      store.saveVisit({
        id, schema: 3, employeeId: currentEmployee.id, employeeName: currentEmployee.name,
        ...fields, status: "open", doneAt: null,
        complaints: [], interactions: [], observations: [], stories: [],
        lastPlace: null, createdAt: new Date().toISOString(),
      });
      showToast("Visit registered");
      openVisit(id);
    }
    setRegisterCtx(null);
  };
  const cancelRegistration = () => {
    const back = registerCtx?.back || "dashboard";
    setRegisterCtx(null);
    go(back === "visit" ? "visit" : back === "branch" && branchRow ? "branch" : back === "history" ? "history" : "dashboard");
  };
  const editVisit = (focus = null) => {
    setRegisterCtx({ visitId: activeVisit.id, focus, back: "visit" });
    go("register");
  };

  const assignedOpen = submittedComplaints(visits).filter((c) => c.assignedEmployeeId === currentEmployee.id && c.status !== "Resolved").length;
  const tabs = [
    { key: "dashboard", label: "Dashboard", short: "Home", icon: Home },
    { key: "history", label: "Visits", short: "Visits", icon: ClipboardList },
    { key: "myComplaints", label: "My complaints", short: "Complaints", icon: MessageCircle },
    ...(isManagement ? [{ key: "details", label: "Details", short: "Details", icon: BarChart3 }] : []),
    ...(seesNetwork ? [{ key: "network", label: "Network health", short: "Network", icon: Radar }] : []),
    ...(isFixer ? [{ key: "fixerQueue", label: "Fixer queue", short: "Queue", icon: Wrench, count: assignedOpen }] : []),
  ];
  // the visit screens belong to "Visits"; a branch profile belongs to whichever page it was opened from
  const shellActive = ["register", "visit", "done"].includes(staffTab) ? "history" : staffTab === "branch" ? (prevTab || "dashboard") : staffTab;

  const paletteItems = [
    { id: "go-dash", group: "Go to", label: "Dashboard", icon: Home, run: () => go("dashboard") },
    { id: "go-new", group: "Go to", label: "Register a new visit", icon: Plus, run: () => openNewVisit() },
    { id: "go-visits", group: "Go to", label: "My visits", icon: ClipboardList, run: () => go("history") },
    { id: "go-comp", group: "Go to", label: "My complaints", icon: MessageCircle, run: () => go("myComplaints") },
    ...(isManagement ? [{ id: "go-details", group: "Go to", label: "Details (management view)", icon: BarChart3, run: () => go("details") }] : []),
    ...(seesNetwork ? [{ id: "go-net", group: "Go to", label: "Network health", icon: Radar, run: () => go("network") }] : []),
    ...(isFixer ? [{ id: "go-fix", group: "Go to", label: "Fixer queue", icon: Wrench, run: () => go("fixerQueue") }] : []),
    // branch search for management; the coverage status is only shown to those who may see coverage
    ...(isManagement ? coverage.map((o) => ({
      id: o.key, group: "Branches", label: o.name,
      sub: seesNetwork ? `${o.area} · ${o.district} — ${STATUS_META[o.status].label}` : `${o.area} · ${o.district}`,
      icon: MapPin, color: seesNetwork ? STATUS_META[o.status].color : undefined, run: () => openBranch(o),
    })) : []),
    ...myVisits.slice(0, 25).map((v) => ({
      id: v.id, group: "My visits", label: tripTitle(v),
      sub: [v.date || "No date", PHASES[phaseOf(v)].label, (v.stops || []).map((s) => shortName(s.name)).join(", ")].filter(Boolean).join(" · "),
      icon: Calendar, run: () => openVisit(v.id),
    })),
  ];

  let content = null;
  if (staffTab === "dashboard") {
    content = (
      <StaffDashboard
        currentEmployee={currentEmployee} visits={visits} myVisits={myVisits}
        sync={sync}
        onNew={() => openNewVisit()} onOpenVisit={openVisit} onViewHistory={() => go("history")}
        onRefresh={store.refresh} showToast={showToast}
      />
    );
  } else if (staffTab === "details" && isManagement) {
    content = (
      <div className="page">
        <div style={{ marginBottom: 22 }}>
          <p className="h-eyebrow">Management view</p>
          <h1 className="h-title">Details</h1>
          <p className="h-desc">Visits and complaints across the network: ratings, offices reached, and how complaints are being handled. Built from submitted entries.</p>
        </div>
        <Analytics visits={reportVisits} offices={offices} departments={departments} settings={settings} onOpenBranch={openBranch} asPage />
      </div>
    );
  } else if (staffTab === "history") {
    content = <VisitHistory visits={myVisits} sync={sync} onOpen={openVisit} onNew={() => openNewVisit()} />;
  } else if (staffTab === "myComplaints") {
    content = <MyComplaints myVisits={myVisits} />;
  } else if (staffTab === "network" && seesNetwork) {
    content = <NetworkHealth visits={reportVisits} offices={offices} settings={settings} onOpenBranch={openBranch} />;
  } else if (staffTab === "fixerQueue" && isFixer) {
    content = <FixerQueue me={currentEmployee} visits={visits} onRefresh={store.refresh} showToast={showToast} />;
  } else if (staffTab === "branch" && branchRow) {
    content = <BranchProfile office={branchRow} coverageRows={coverage} onBack={() => go(prevTab || "dashboard")} onNewVisit={openNewVisit} />;
  } else if (staffTab === "register" && registerCtx) {
    content = (
      <RegisterVisit
        key={registerCtx.visitId || "new"}
        tree={tree} visit={editingVisit} prefill={registerCtx.prefill} focusField={registerCtx.focus}
        onSave={saveRegistration} onCancel={cancelRegistration}
        onDelete={editingVisit ? () => { store.deleteVisit(editingVisit.id); setRegisterCtx(null); showToast("Visit deleted"); go("dashboard"); } : null}
      />
    );
  } else if (staffTab === "visit" && activeVisit) {
    content = (
      <VisitHub
        key={activeVisit.id}
        visit={activeVisit} tree={tree} departments={departments} questions={questions} sync={sync} initialSheet={hubSheet}
        onSave={store.saveVisit} showToast={showToast}
        onEditDetails={(focus) => editVisit(focus || null)}
        onMarkedDone={() => go("done")}
        onBack={() => { if (activeVisit.status !== "done") showToast("Saved. Pick it up from Your visits any time."); go("history"); }}
      />
    );
  } else if (staffTab === "done" && activeVisit) {
    content = <VisitDone visit={activeVisit} sync={sync} onDone={() => go("dashboard")} onOpen={() => openVisit(activeVisit.id)} />;
  }

  return (
    <div className="fvt">
      <AppShell
        theme={theme} onToggleTheme={toggleTheme} brandSub="BRAC · Head Office"
        tabs={tabs} active={shellActive} pageKey={staffTab} onTab={go}
        fab={{ label: "New visit", icon: Plus, onClick: () => openNewVisit() }}
        onSearch={() => setPaletteOpen(true)}
        user={currentEmployee.name} userSub={roleText(roles).join(" · ")} onLogout={handleLogout}
      >
        {content}
      </AppShell>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems}
        placeholder={isManagement ? "Search pages, branches, visits…" : "Search pages and your visits…"} />

      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </div>
  );
}

/* ============================ STAFF DASHBOARD ============================ */

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function SectionHead({ eyebrow, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
      <p className="h-eyebrow" style={{ margin: 0, fontSize: 12 }}>{eyebrow}</p>
      {action}
    </div>
  );
}

function StaffDashboard({ currentEmployee, visits, myVisits, sync, onNew, onOpenVisit, onViewHistory, onRefresh, showToast }) {
  // Every number here is derived live from the visits — nothing is tracked
  // separately, so it always matches what's actually stored.
  const myComplaints = myVisits.flatMap((v) => (v.complaints || []).filter((c) => !isDraft(c)));
  const openComplaints = myComplaints.filter((c) => c.status !== "Resolved").length;
  const resolvedComplaints = myComplaints.filter((c) => c.status === "Resolved").length;
  const myDrafts = myVisits.filter((v) => v.status !== "done").reduce((s, v) => s + countsOf(v).drafts, 0);

  const today = isoDate(new Date());
  const todayVisits = myVisits.filter((v) => v.date === today).length;
  const observationsLogged = myVisits.reduce((s, v) => { const c = countsOf(v); return s + c.observation.submitted + c.interaction.submitted; }, 0);

  // The story feed shows everyone's submitted stories; "your stories" is this employee's.
  const allStories = visits
    .flatMap((v) => (v.stories || []).filter((s) => !isDraft(s)).map((s) => ({ ...s, visitId: v.id, location: placeOffice(s), staffName: v.employeeName, date: (s.submittedAt || "").slice(0, 10) || v.date, employeeId: v.employeeId })))
    .sort((a, b) => (b.submittedAt || b.date || "").localeCompare(a.submittedAt || a.date || ""));
  const myStoriesCount = allStories.filter((s) => s.employeeId === currentEmployee.id).length;

  // What needs attention first (back but not done, in progress, upcoming), then the latest done.
  const rank = { due: 0, progress: 1, upcoming: 2, done: 3 };
  const latestVisits = [...myVisits]
    .sort((a, b) => rank[phaseOf(a)] - rank[phaseOf(b)] || (b.date || "").localeCompare(a.date || ""))
    .slice(0, 4);

  const months = useMemo(() => monthBuckets(6), []);
  const mySpark = months.map(m => myVisits.filter(v => monthKeyOf(v.date) === m.key).length);
  const thisMonth = mySpark[5], lastMonth = mySpark[4];
  const officesVisited = new Set(expandVisits(myVisits).map((r) => r.location)).size;

  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [storiesExpanded, setStoriesExpanded] = useState(false);
  const STORY_PREVIEW_COUNT = 4;
  const visibleStories = storiesExpanded ? allStories : allStories.slice(0, STORY_PREVIEW_COUNT);
  const roles = currentEmployee.roles || [];

  const toggleLike = async (s) => {
    try {
      await postAction("toggle-story-like", { visitId: s.visitId, storyId: s.id });
      await onRefresh();
    } catch {
      showToast("Couldn't reach the server. Try again when you're online.");
    }
  };

  return (
    <div className="page">
      {/* hero */}
      <Reveal className="hero">
        <BdOutline className="hero-outline" />
        <div className="hero-row">
          <div>
            <p className="h-eyebrow">{greeting()}</p>
            <h1>{currentEmployee.name.split(" ")[0]}</h1>
            <p style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {roleText(roles).map(r => <span key={r} className="role-chip">{r}</span>)}
              <span>{currentEmployee.phone ? `${currentEmployee.phone} · ` : ""}PIN {currentEmployee.pin}</span>
            </p>
          </div>
          <button className="btn btn-primary btn-lg" onClick={onNew}><Plus size={18} strokeWidth={2.6} /> Register new visit</button>
        </div>
        <div className="hero-tiles">
          <div className="hero-tile glass"><div className="ht-num"><CountUp value={myVisits.length} /></div><div className="ht-label">Your visits</div></div>
          <div className="hero-tile glass"><div className="ht-num"><CountUp value={thisMonth} /></div><div className="ht-label">This month</div></div>
          <div className="hero-tile glass"><div className="ht-num"><CountUp value={officesVisited} /></div><div className="ht-label">Offices visited</div></div>
          <div className="hero-tile glass"><div className="ht-num"><CountUp value={myDrafts} /></div><div className="ht-label">Drafts not sent</div></div>
        </div>
      </Reveal>

      {/* your visits */}
      <div className="section-gap">
        <SectionHead
          eyebrow="Your visits"
          action={
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <SyncPill sync={sync} />
              <button className="btn btn-ghost btn-sm" onClick={onViewHistory}>View all <ChevronRight size={14} /></button>
            </div>
          }
        />
        {latestVisits.length === 0 ? (
          <div className="empty-note card card-pad">
            <p style={{ margin: "0 0 14px" }}>No visits yet. Register your first field visit to get started.</p>
            <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> Register new visit</button>
          </div>
        ) : (
          <div className="vgrid">
            {latestVisits.map((v) => <VisitCard key={v.id} visit={v} onOpen={onOpenVisit} />)}
          </div>
        )}
      </div>

      {/* your overview */}
      <div className="section-gap">
        <SectionHead
          eyebrow="Your overview"
          action={
            <button className="btn btn-ghost btn-sm" onClick={() => setOverviewExpanded(e => !e)}>
              {overviewExpanded ? <>Show less <ChevronUp size={14} /></> : <>Show more <ChevronDown size={14} /></>}
            </button>
          }
        />
        <div className="stat-row-group">
          <Reveal i={0} className="stat-card">
            <div className="stat-num"><CountUp value={myVisits.length} /></div>
            <div className="stat-label">Total visits</div>
            <div className="kpi-foot"><Sparkline data={mySpark} color="var(--brand)" w={92} h={26} /></div>
          </Reveal>
          <Reveal i={1} className="stat-card">
            <div className="stat-num"><CountUp value={thisMonth} /></div>
            <div className="stat-label">Visits this month</div>
            <div className="kpi-foot"><DeltaChip current={thisMonth} previous={lastMonth} /><span /></div>
          </Reveal>
          <Reveal i={2} className="stat-card">
            <div className="stat-num"><CountUp value={todayVisits} /></div>
            <div className="stat-label">Today's visits</div>
          </Reveal>
          {overviewExpanded && (
            <>
              <Reveal i={0} className="stat-card"><div className="stat-num"><CountUp value={observationsLogged} /></div><div className="stat-label">Client interactions &amp; observations</div></Reveal>
              <Reveal i={1} className="stat-card"><div className="stat-num"><CountUp value={myStoriesCount} /></div><div className="stat-label">Stories shared</div></Reveal>
              <Reveal i={2} className="stat-card"><div className="stat-num" style={{ color: "var(--danger)" }}><CountUp value={openComplaints} /></div><div className="stat-label">Open complaints</div></Reveal>
              <Reveal i={3} className="stat-card"><div className="stat-num" style={{ color: "var(--success)" }}><CountUp value={resolvedComplaints} /></div><div className="stat-label">Resolved complaints</div></Reveal>
            </>
          )}
        </div>
      </div>

      {/* story feed */}
      <div className="section-gap">
        <SectionHead
          eyebrow="Story feed"
          action={allStories.length > STORY_PREVIEW_COUNT && (
            <button className="btn btn-ghost btn-sm" onClick={() => setStoriesExpanded(e => !e)}>
              {storiesExpanded ? <>Show less <ChevronUp size={14} /></> : <>Show more <ChevronDown size={14} /></>}
            </button>
          )}
        />
        {allStories.length === 0 ? (
          <div className="empty-note card card-pad">No stories posted yet. Stories appear here once they're submitted.</div>
        ) : (
          <div className="feed-grid">
            {visibleStories.map((s, i) => (
              <Reveal className="story-card" i={i % 4} key={`${s.visitId}-${s.id}`}>
                <div className="story-photo" style={s.photoUrl ? undefined : { background: s.gradient || photoGradients[i % photoGradients.length] }}>
                  {s.photoUrl ? (
                    <img src={s.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <Camera size={28} color="rgba(255,255,255,0.85)" />
                  )}
                  <div className="story-photo-tag"><MapPin size={11} /> {s.location}</div>
                </div>
                <div className="story-head">
                  <div className="avatar">{initials(s.staffName)}</div>
                  <div>
                    <div className="story-name">{s.staffName}</div>
                    <div className="story-loc">{s.location} · {s.date}</div>
                  </div>
                </div>
                <div className="story-cap">{s.caption}</div>
                <div className="story-actions">
                  <button className={`story-action ${s.liked ? "liked" : ""}`} onClick={() => toggleLike(s)}>
                    <Heart size={17} fill={s.liked ? "var(--brand)" : "none"} /> {s.likes || 0}
                  </button>
                  <button className="story-action"><MessageCircle size={17} /> {s.comments || 0}</button>
                  <button className="story-action" style={{ marginLeft: "auto" }}><Share2 size={17} /></button>
                </div>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================== VISIT HISTORY ============================== */

function VisitHistory({ visits, sync, onOpen, onNew }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="h-eyebrow">All visits</p>
          <h1 className="h-title">Your visits</h1>
          <p className="h-desc">{plural(visits.length, "visit")} on record. Open any visit to add complaints, client interactions, observations and stories, or to mark it as done.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <SyncPill sync={sync} />
          <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> Register new visit</button>
        </div>
      </div>
      <VisitGroups visits={visits} onOpen={onOpen} empty={<div className="empty-note card card-pad">No visits yet.</div>} />
    </div>
  );
}

/* ============================== VISIT DONE ============================== */

function VisitDone({ visit, sync, onDone, onOpen }) {
  const c = countsOf(visit);
  const waiting = sync.pending > 0;
  return (
    <div className="page-narrow">
      <div className="wizard-shell">
        <div className="confirm-wrap">
          <div className="confirm-check"><CheckCheck size={30} /></div>
          <h1 className="h-title">Visit marked as done</h1>
          <p className="h-desc" style={{ margin: "8px auto 0" }}>
            {tripTitle(visit)} · {plural(c.submitted, "entry", "entries")} submitted{c.drafts ? ` · ${plural(c.drafts, "draft")} left unsent` : ""}
          </p>
          {waiting && <p className="field-hint" style={{ marginTop: 10 }}>This phone is offline, so this is saved here and will be sent when the connection comes back.</p>}
          <p className="field-hint" style={{ marginTop: 8 }}>Visit ID: <span className="mono">{visit.id}</span></p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
            <button className="btn btn-secondary" onClick={onOpen}>View the visit</button>
            <button className="btn btn-primary" onClick={onDone}>Back to dashboard</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================== MY COMPLAINTS ============================== */
// Read-only view: every complaint this signed-in employee has recorded, across
// all of their visits, with where it stands. Complaints on a visit that hasn't
// been submitted yet haven't reached the admin.

function MyComplaints({ myVisits }) {
  const myComplaints = myVisits
    .flatMap(v => (v.complaints || []).map(c => ({ ...c, visitId: v.id, visitLocation: placeOffice(c), visitDate: v.date, sent: !isDraft(c), visitDone: v.status === "done" })))
    .sort((a, b) => (b.visitDate || "").localeCompare(a.visitDate || ""));

  return (
    <div className="page">
      <div style={{ marginBottom: 22 }}>
        <p className="h-eyebrow">Your submissions</p>
        <h1 className="h-title">My Complaints</h1>
        <p className="h-desc">{plural(myComplaints.length, "complaint")} recorded by you, and where each one stands.</p>
      </div>

      {myComplaints.length === 0 ? (
        <div className="empty-note card card-pad">You haven't recorded any complaints yet.</div>
      ) : (
        myComplaints.map(c => (
          <div className="card card-pad" key={`${c.visitId}-${c.id}`} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
              <div>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-faint)" }}>{c.id}</span>
                <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{c.description || "Voice note, not written up yet"}</div>
              </div>
              {c.sent
                ? <span className={`status-pill status-${(c.status || "Open").replace(/\s/g, "")}`}>{c.status || "Open"}</span>
                : <span className="pill pill-stale">Draft · not sent</span>}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--ink-soft)" }}>
              <span className={`urgency-badge urgency-${c.urgency}`}>{c.urgency}</span>
              <span className="source-badge">{c.department}{c.unit ? ` · ${c.unit}` : ""}</span>
              <span>{c.visitDate || "No date"} · {c.visitLocation || c.visitId}</span>
            </div>
            {!c.sent && <div className="field-hint">{c.visitDone ? "The visit is done, so this draft was never sent." : "It goes to the admin when you submit it from the visit."}</div>}
            {c.person && <PersonDetails kind={c.source} person={c.person} compact />}
            {c.photoUrl && (
              <img src={c.photoUrl} alt="" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 8, marginTop: 10 }} />
            )}
            {c.assignedTo && (
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 8 }}>
                Assigned to <strong>{c.assignedTo}</strong>
                {c.deadline && <> · Deadline: {new Date(c.deadline).toLocaleString()}</>}
              </div>
            )}
            {c.status === "Resolved" && c.resolvedAt && (
              <div style={{ fontSize: 12, color: "var(--success)", marginTop: 6, fontWeight: 650 }}>
                Resolved on {new Date(c.resolvedAt).toLocaleString()}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

/* ============================== FIXER QUEUE ============================== */
// Visible only to employees tagged with the "fixer" role — since fixers are
// "just like normal users" with an extra role, this lives as another tab in
// the same app rather than a separate login/panel.

function FixerQueue({ me, visits, onRefresh, showToast }) {
  const [busyId, setBusyId] = useState(null);

  // Work still to do comes first (escalated ones at the very top, then the soonest
  // deadline); resolved complaints sit at the bottom, newest first.
  const mine = submittedComplaints(visits).filter(c => c.assignedEmployeeId === me.id);
  const inProgress = mine
    .filter(c => c.status !== "Resolved")
    .sort((a, b) => (b.escalated ? 1 : 0) - (a.escalated ? 1 : 0) || new Date(a.deadline || 8.64e15) - new Date(b.deadline || 8.64e15));
  const resolved = mine
    .filter(c => c.status === "Resolved")
    .sort((a, b) => new Date(b.resolvedAt || 0) - new Date(a.resolvedAt || 0));
  const myComplaints = [...inProgress, ...resolved];

  const assignedCount = myComplaints.length;
  const fixedCount = resolved.length;

  const handleResolve = async (c) => {
    setBusyId(c.id);
    try {
      await postAction("resolve-complaint", { visitId: c.visitId, complaintId: c.id, employeeId: me.id });
      await onRefresh();
      showToast(`Marked ${c.id} as resolved.`);
    } catch (err) {
      showToast(err.message === "Failed to fetch" ? "You're offline. Try again when you have signal." : err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page">
      <div style={{ marginBottom: 22 }}>
        <p className="h-eyebrow">Fixer Queue</p>
        <h1 className="h-title">Assigned to you</h1>
        <p className="h-desc">Everything assigned to you as a fixer, its timeline, and whether it's been dealt with.</p>
      </div>

      <div className="score-row">
        <div className="score-card"><div className="score-num">{assignedCount}</div><div className="score-label">Assigned</div></div>
        <div className="score-card"><div className="score-num" style={{ color: "var(--success)" }}>{fixedCount}</div><div className="score-label">Fixed</div></div>
        <div className="score-card"><div className="score-num" style={{ color: "var(--magenta)" }}>{assignedCount - fixedCount}</div><div className="score-label">Still Open</div></div>
      </div>

      {myComplaints.length === 0 ? (
        <div className="card empty-note card-pad">Nothing assigned to you yet.</div>
      ) : (
        myComplaints.map((c, idx) => (
          <React.Fragment key={`${c.visitId}-${c.id}`}>
          {idx === 0 && inProgress.length > 0 && <QueueHeading label="In progress" count={inProgress.length} />}
          {idx === inProgress.length && resolved.length > 0 && <QueueHeading label="Resolved" count={resolved.length} />}
          <div className="card complaint-card" style={{ marginBottom: 12, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
              <div>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-faint)" }}>{c.id}</span>
                <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{c.description || "Voice note (listen below)"}</div>
              </div>
              <span className={`status-pill status-${c.status.replace(/\s/g, "")}`}>{c.status}</span>
            </div>

            {c.voice?.url && <audio controls preload="metadata" src={c.voice.url} style={{ width: "100%", marginBottom: 8 }} />}
            {c.photoUrl && (
              <img src={c.photoUrl} alt="" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>
              <span className={`urgency-badge urgency-${c.urgency}`}>{c.urgency}</span>
              <span className="source-badge">{c.department}{c.unit ? ` · ${c.unit}` : ""}</span>
              <span>Visit: {c.location} · {c.visitDate}</span>
            </div>

            {/* who raised it and how to reach them, so the fixer can follow up */}
            <div style={{ marginBottom: 10 }}>
              <PersonDetails kind={c.source} person={c.person} consent={c.consent} />
            </div>

            {c.deadline && (
              <div style={{ fontSize: 11.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, color: c.escalated ? "var(--danger)" : "var(--ink-soft)" }}>
                <Clock size={13} /> Deadline: {new Date(c.deadline).toLocaleString()}
                {c.escalated && c.status !== "Resolved" && " — ESCALATED"}
              </div>
            )}

            <div className="timeline" style={{ marginTop: 12, borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
              {(c.log || []).map((item, i) => (
                <div className="tl-item" key={i}>
                  <div className="tl-dot-wrap">
                    <div className="tl-dot" />
                    {i < c.log.length - 1 && <div className="tl-bar" />}
                  </div>
                  <div>
                    <div className="tl-label">{item.label}</div>
                    <div className="tl-time">{item.time}</div>
                  </div>
                </div>
              ))}
            </div>

            {c.status !== "Resolved" && (
              <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => handleResolve(c)} disabled={busyId === c.id}>
                <CheckCircle2 size={14} /> Mark Resolved
              </button>
            )}
          </div>
          </React.Fragment>
        ))
      )}
    </div>
  );
}

function QueueHeading({ label, count }) {
  return (
    <div className="section-header" style={{ margin: "6px 0 12px" }}>
      <div className="section-title">{label}</div>
      <span className="badge-count">{count}</span>
    </div>
  );
}
