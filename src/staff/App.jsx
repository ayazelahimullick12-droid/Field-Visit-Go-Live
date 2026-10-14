import React, { useState, useEffect, useMemo } from "react";
import {
  MapPin, Calendar, ChevronRight, ChevronUp, ChevronDown, Plus, Check,
  MessageCircle, Home, Wrench, Search, ClipboardList, BarChart3, CheckCheck, User, Users, Eye, Image as ImageIcon,
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
import { expandVisits, submittedComplaints, phaseOf, PHASES, tripTitle, isoDate, plural, shortName, isDraft, countsOf, placeOffice, inFixerQueue } from "../lib/visits";
import Management, { MGMT_TABS, EMPTY_MGMT_VIEW } from "./management/Management";
import BranchProfile from "./BranchProfile";
import VisitCard, { VisitGroups } from "./visits/VisitCard";
import RegisterVisit from "./visits/RegisterVisit";
import VisitHub from "./visits/VisitHub";
import { SyncPill } from "./visits/SyncPill";
import ComplaintPage, { ComplaintTile } from "./ComplaintPage";
import { allStories, StoryCard, StorySheet, useStoryActions, captureStoryLink, takeStoryLink } from "./Stories";
import { statusOf, isFixed, isLate } from "../lib/complaints";

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

  // dashboard | history | myComplaints | mgmt | fixerQueue | branch | register | visit | done
  const [staffTab, setStaffTab] = useState("dashboard");
  const [mgmtView, setMgmtView] = useState(EMPTY_MGMT_VIEW); // which Management page / person / visit is open
  const [prevTab, setPrevTab] = useState("dashboard");
  const [branchKey, setBranchKey] = useState(null);
  const [activeVisitId, setActiveVisitId] = useState(null);
  const [registerCtx, setRegisterCtx] = useState(null); // { visitId?, prefill?, focus?, back }
  const [hubSheet, setHubSheet] = useState(null);       // a sheet to open when the visit page shows
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [complaintRef, setComplaintRef] = useState(null); // { visitId, id, back } — the complaint page
  const [storyRef, setStoryRef] = useState(null);         // { visitId, id } — a story opened in full

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  // A shared story link (#story=…) is remembered before the sign-in redirect, and opened once signed in.
  useEffect(() => { captureStoryLink(); }, []);
  useEffect(() => {
    if (!currentEmployee || !store.loaded) return;
    const ref = takeStoryLink();
    if (ref) setStoryRef(ref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEmployee?.id, store.loaded]);

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
  const openComplaint = (c) => { setComplaintRef({ visitId: c.visitId, id: c.id, back: staffTab }); go("complaint"); };
  const openMgmt = (patch) => { setMgmtView((m) => ({ ...m, personId: null, visitId: null, ...patch })); go("mgmt"); };
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

  const assignedOpen = submittedComplaints(visits).filter((c) => inFixerQueue(c, currentEmployee) && !isFixed(c)).length;
  const tabs = [
    { key: "dashboard", label: "Dashboard", short: "Home", icon: Home },
    { key: "history", label: "Visits", short: "Visits", icon: ClipboardList },
    { key: "myComplaints", label: "My action items", short: "Action items", icon: MessageCircle },
    ...(isManagement ? [{ key: "mgmt", label: "Management", short: "Manage", icon: BarChart3 }] : []),
    ...(isFixer ? [{ key: "fixerQueue", label: "Action item queue", short: "Queue", icon: Wrench, count: assignedOpen }] : []),
  ];
  // the visit screens belong to "Visits"; a branch profile belongs to whichever page it was opened from
  const shellActive = ["register", "visit", "done"].includes(staffTab) ? "history" : staffTab === "branch" ? (prevTab || "dashboard")
    : staffTab === "complaint" ? (complaintRef?.back || "myComplaints") : staffTab;
  const storyAll = storyRef ? allStories(visits) : [];
  const openStory = storyRef ? storyAll.find((x) => x.visitId === storyRef.visitId && x.id === storyRef.id) : null;
  const complaintVisit = complaintRef ? visits.find((v) => v.id === complaintRef.visitId) : null;
  const complaintRec = complaintVisit ? (complaintVisit.complaints || []).find((c) => c.id === complaintRef.id) : null;

  const paletteItems = [
    { id: "go-dash", group: "Go to", label: "Dashboard", icon: Home, run: () => go("dashboard") },
    { id: "go-new", group: "Go to", label: "Register a new visit", icon: Plus, run: () => openNewVisit() },
    { id: "go-visits", group: "Go to", label: "My visits", icon: ClipboardList, run: () => go("history") },
    { id: "go-comp", group: "Go to", label: "My action items", icon: MessageCircle, run: () => go("myComplaints") },
    ...(isManagement ? MGMT_TABS.map((t) => ({ id: `go-m-${t.key}`, group: "Management", label: t.label, icon: t.icon, run: () => openMgmt({ tab: t.key }) })) : []),
    ...(isManagement ? employees.map((e) => ({
      id: `p-${e.id}`, group: "People", label: e.name,
      sub: [e.designation, e.department, e.pin && `PIN ${e.pin}`].filter(Boolean).join(" · "),
      icon: User, run: () => openMgmt({ personId: e.id }),
    })) : []),
    ...(isFixer ? [{ id: "go-fix", group: "Go to", label: "Action item queue", icon: Wrench, run: () => go("fixerQueue") }] : []),
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
        onRefresh={store.refresh} showToast={showToast} onOpenStory={(st) => setStoryRef({ visitId: st.visitId, id: st.id })}
      />
    );
  } else if (staffTab === "mgmt" && isManagement) {
    content = (
      <Management
        view={mgmtView} setView={setMgmtView}
        trips={visits} records={reportVisits} coverage={coverage} offices={offices}
        employees={employees} departments={departments} settings={settings} tree={tree} questions={questions}
        onOpenBranch={openBranch}
      />
    );
  } else if (staffTab === "history") {
    content = <VisitHistory visits={myVisits} sync={sync} onOpen={openVisit} onNew={() => openNewVisit()} />;
  } else if (staffTab === "myComplaints") {
    content = <MyComplaints myVisits={myVisits} onOpen={openComplaint} />;
  } else if (staffTab === "fixerQueue" && isFixer) {
    content = <FixerQueue me={currentEmployee} employees={employees} departments={departments} visits={visits} onOpen={openComplaint} />;
  } else if (staffTab === "complaint" && complaintRec) {
    content = (
      <ComplaintPage c={complaintRec} visit={complaintVisit} me={currentEmployee}
        canAct={isFixer && complaintRec.state !== "draft" && inFixerQueue(complaintRec, currentEmployee)}
        onBack={() => go(complaintRef.back || "myComplaints")} onRefresh={store.refresh} showToast={showToast}
        onOpenVisit={() => openVisit(complaintVisit.id)} />
    );
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
        onDelete={() => { store.deleteVisit(activeVisit.id); setActiveVisitId(null); showToast("Visit deleted"); go("history"); }}
        onBack={() => { if (activeVisit.status !== "done") showToast("Saved. Continue this visit any time from My visits."); go("history"); }}
      />
    );
  } else if (staffTab === "done" && activeVisit) {
    content = <VisitDone visit={activeVisit} sync={sync} onDone={() => go("dashboard")} onOpen={() => openVisit(activeVisit.id)} />;
  }

  return (
    <div className="fvt">
      <AppShell
        theme={theme} onToggleTheme={toggleTheme} brandSub="BRAC · Head Office"
        tabs={tabs} active={shellActive} pageKey={staffTab} onTab={(k) => (k === "mgmt" ? openMgmt({}) : go(k))}
        fab={{ label: "New visit", icon: Plus, onClick: () => openNewVisit() }}
        onSearch={() => setPaletteOpen(true)}
        user={currentEmployee.name} userSub={roleText(roles).join(" · ")} onLogout={handleLogout}
      >
        {content}
      </AppShell>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems}
        placeholder={isManagement ? "Search pages, people, branches and visits" : "Search pages and visits"} />

      {openStory && <StoryView s={openStory} me={currentEmployee} onClose={() => setStoryRef(null)} onRefresh={store.refresh} showToast={showToast} />}

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

function StaffDashboard({ currentEmployee, visits, myVisits, sync, onNew, onOpenVisit, onViewHistory, onRefresh, showToast, onOpenStory }) {
  // Every number here is derived live from the visits — nothing is tracked
  // separately, so it always matches what's actually stored.
  const myComplaints = myVisits.flatMap((v) => (v.complaints || []).filter((c) => !isDraft(c)));
  const openComplaints = myComplaints.filter((c) => !isFixed(c)).length;
  const fixedComplaints = myComplaints.filter(isFixed).length;
  const submitted = (type) => myVisits.reduce((s, v) => s + countsOf(v)[type].submitted, 0);

  const today = isoDate(new Date());
  const todayVisits = myVisits.filter((v) => v.date === today).length;

  // The story feed shows everyone's submitted stories.
  const stories = allStories(visits);
  const { like } = useStoryActions(currentEmployee, onRefresh, showToast);

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
  const visibleStories = storiesExpanded ? stories : stories.slice(0, STORY_PREVIEW_COUNT);
  const roles = currentEmployee.roles || [];

  const tile = (i, icon, cls, value, label, color) => (
    <Reveal i={i} className="stat-card">
      <span className={`hub-ico ${cls}`} style={{ width: 30, height: 30 }}>{React.createElement(icon, { size: 15 })}</span>
      <div className="stat-num" style={color ? { color } : undefined}><CountUp value={value} /></div>
      <div className="stat-label">{label}</div>
    </Reveal>
  );

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
              <span>{[currentEmployee.designation, currentEmployee.phone, `PIN ${currentEmployee.pin}`].filter(Boolean).join(" · ")}</span>
            </p>
          </div>
          <button className="btn btn-primary btn-lg" onClick={onNew}><Plus size={18} strokeWidth={2.6} /> Register a visit</button>
        </div>
        <div className="hero-tiles">
          <div className="hero-tile glass"><div className="ht-num"><CountUp value={myVisits.length} /></div><div className="ht-label">Total visits</div></div>
          <div className="hero-tile glass"><div className="ht-num"><CountUp value={thisMonth} /></div><div className="ht-label">This month</div></div>
          <div className="hero-tile glass"><div className="ht-num"><CountUp value={officesVisited} /></div><div className="ht-label">Offices visited</div></div>
        </div>
      </Reveal>

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
          {tile(0, MessageCircle, "ico-complaint", submitted("complaint"), "Action items")}
          {tile(1, Users, "ico-client", submitted("interaction"), "Client interactions")}
          {tile(2, Eye, "ico-obs", submitted("observation"), "Observations")}
          {tile(3, ImageIcon, "ico-story", submitted("story"), "Stories")}
          {overviewExpanded && (
            <>
              <Reveal i={0} className="stat-card">
                <div className="stat-num"><CountUp value={thisMonth} /></div>
                <div className="stat-label">Visits this month</div>
                <div className="kpi-foot"><Sparkline data={mySpark} color="var(--brand)" w={92} h={26} /><DeltaChip current={thisMonth} previous={lastMonth} /></div>
              </Reveal>
              <Reveal i={1} className="stat-card"><div className="stat-num"><CountUp value={todayVisits} /></div><div className="stat-label">Visits today</div></Reveal>
              <Reveal i={2} className="stat-card"><div className="stat-num" style={{ color: "var(--danger)" }}><CountUp value={openComplaints} /></div><div className="stat-label">Open action items</div></Reveal>
              <Reveal i={3} className="stat-card"><div className="stat-num" style={{ color: "var(--success)" }}><CountUp value={fixedComplaints} /></div><div className="stat-label">Fixed action items</div></Reveal>
            </>
          )}
        </div>
      </div>

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
            <p style={{ margin: "0 0 14px" }}>No visits registered yet.</p>
            <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> Register a visit</button>
          </div>
        ) : (
          <div className="vgrid">
            {latestVisits.map((v) => <VisitCard key={v.id} visit={v} onOpen={onOpenVisit} />)}
          </div>
        )}
      </div>

      {/* story feed */}
      <div className="section-gap">
        <SectionHead
          eyebrow="Story feed"
          action={stories.length > STORY_PREVIEW_COUNT && (
            <button className="btn btn-ghost btn-sm" onClick={() => setStoriesExpanded(e => !e)}>
              {storiesExpanded ? <>Show less <ChevronUp size={14} /></> : <>Show more <ChevronDown size={14} /></>}
            </button>
          )}
        />
        {stories.length === 0 ? (
          <div className="empty-note card card-pad">No stories have been published yet.</div>
        ) : (
          <div className="feed-grid">
            {visibleStories.map((s, i) => (
              <Reveal i={i % 4} key={`${s.visitId}-${s.id}`}>
                <StoryCard s={s} i={i} me={currentEmployee} onOpen={() => onOpenStory(s)} onLike={like} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A story opened in full (from the feed or a shared link), with likes and comments. */
function StoryView({ s, me, onClose, onRefresh, showToast }) {
  const { like, comment } = useStoryActions(me, onRefresh, showToast);
  return <StorySheet s={s} me={me} onClose={onClose} onLike={like} onComment={comment} />;
}

/* ============================== VISIT HISTORY ============================== */

function VisitHistory({ visits, sync, onOpen, onNew }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="h-eyebrow">Visits</p>
          <h1 className="h-title">My visits</h1>
          <p className="h-desc">{plural(visits.length, "visit")} on record. Open a visit to record action items, client interactions, observations and stories, or to mark it as done.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <SyncPill sync={sync} />
          <button className="btn btn-primary" onClick={onNew}><Plus size={16} /> Register a visit</button>
        </div>
      </div>
      <VisitGroups visits={visits} onOpen={onOpen} empty={<div className="empty-note card card-pad">No visits registered yet.</div>} />
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
            {tripTitle(visit)} · {plural(c.submitted, "entry", "entries")} submitted{c.drafts ? ` · ${plural(c.drafts, "draft")} not submitted` : ""}
          </p>
          {waiting && <p className="field-hint" style={{ marginTop: 10 }}>This device is offline. The visit is saved here and will be sent when the connection is restored.</p>}
          <p className="field-hint" style={{ marginTop: 8 }}>Visit ID: <span className="mono">{visit.id}</span></p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
            <button className="btn btn-secondary" onClick={onOpen}>View visit</button>
            <button className="btn btn-primary" onClick={onDone}>Back to dashboard</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================== MY COMPLAINTS ============================== */
// Every complaint this employee has recorded, newest first. Each tile opens the complaint page.

// Grouped by where each one stands (drafts first, fixed last), with search and status filters.
const MY_GROUPS = [
  ["draft", "Drafts · not submitted"],
  ["Waiting", "Waiting for assignment"],
  ["Assigned", "Assigned"],
  ["In Progress", "In progress"],
  ["Long Term", "Long term"],
  ["Fixed", "Fixed"],
];
const FIXED_PREVIEW = 6;

function MyComplaints({ myVisits, onOpen }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [allFixed, setAllFixed] = useState(false);
  const list = myVisits
    .flatMap((v) => (v.complaints || []).map((c) => ({ ...c, visitId: v.id, visitDate: v.date, draft: isDraft(c) })))
    .sort((a, b) => (b.submittedAt || b.updatedAt || b.visitDate || "").localeCompare(a.submittedAt || a.updatedAt || a.visitDate || ""));
  const groupOf = (c) => (c.draft ? "draft" : statusOf(c));
  const q = query.trim().toLowerCase();
  const matches = list.filter((c) => !q || [c.id, c.title, c.description, c.department, c.unit].some((x) => String(x || "").toLowerCase().includes(q)));
  const count = (k) => (k === "all" ? matches.length : matches.filter((c) => groupOf(c) === k).length);
  const groups = MY_GROUPS
    .filter(([k]) => filter === "all" || filter === k)
    .map(([k, label]) => [k, label, matches.filter((c) => groupOf(c) === k)])
    .filter(([, , items]) => items.length);
  const open = list.filter((c) => !c.draft && !isFixed(c)).length;

  return (
    <div className="page">
      <div style={{ marginBottom: 18 }}>
        <p className="h-eyebrow">Action items</p>
        <h1 className="h-title">My action items</h1>
        <p className="h-desc">{plural(list.length, "action item")} recorded by you · {open} open. Select an action item to view its full details and progress.</p>
      </div>

      {list.length === 0 ? (
        <div className="empty-note card card-pad">No action items recorded yet.</div>
      ) : (
        <>
          <div className="toolbar">
            <div className="search-box">
              <Search size={16} />
              <input className="input" placeholder="Search by code, title, description or unit" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>
          <div className="toolbar">
            <div className="filter-chips">
              {[["all", "All"], ["draft", "Drafts"], ...MY_GROUPS.slice(1).map(([k]) => [k, k])].map(([k, label]) => (
                <button key={k} className={`filter-chip ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>
                  {label} <span className="fc-count">{count(k)}</span>
                </button>
              ))}
            </div>
          </div>

          {groups.length === 0 && <div className="empty-note card card-pad">No action items match.</div>}
          {groups.map(([k, label, items]) => {
            const shown = k === "Fixed" && !allFixed && filter === "all" ? items.slice(0, FIXED_PREVIEW) : items;
            return (
              <section key={k} style={{ marginBottom: 20 }}>
                <QueueHeading label={label} count={items.length} />
                <div className="ctile-grid">
                  {shown.map((c) => <ComplaintTile key={`${c.visitId}-${c.id}`} c={c} draft={c.draft} onOpen={() => onOpen(c)} />)}
                </div>
                {shown.length < items.length && (
                  <div style={{ textAlign: "center", marginTop: 12 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setAllFixed(true)}>Show all {items.length} fixed</button>
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

/* =========================== ACTION ITEM QUEUE =========================== */
// Visible only to employees tagged "fixer": the complaints assigned to their unit's fixers.
// Any fixer of the unit can start, fix or mark a complaint long term, from its page.

function FixerQueue({ me, employees, departments, visits, onOpen }) {
  const unitName = departments.find((d) => d.id === me.departmentId)?.name;
  const teammates = employees.filter((e) => e.id !== me.id && e.departmentId && e.departmentId === me.departmentId && (e.roles || []).includes("fixer"));
  const mine = submittedComplaints(visits).filter((c) => inFixerQueue(c, me));
  // past-deadline first, then the soonest deadline
  const byDeadline = (a, b) => (isLate(b) - isLate(a)) || new Date(a.deadline || 8.64e15) - new Date(b.deadline || 8.64e15);
  const active = mine.filter((c) => ["Assigned", "In Progress"].includes(statusOf(c))).sort(byDeadline);
  const longTerm = mine.filter((c) => statusOf(c) === "Long Term");
  const fixed = mine.filter(isFixed).sort((a, b) => new Date(b.resolvedAt || 0) - new Date(a.resolvedAt || 0));
  const groups = [["Action required", active], ["Long term", longTerm], ["Fixed", fixed]];

  return (
    <div className="page">
      <div style={{ marginBottom: 22 }}>
        <p className="h-eyebrow">Action item queue</p>
        <h1 className="h-title">{unitName ? `${unitName} action items` : "Assigned action items"}</h1>
        <p className="h-desc">
          Action items assigned to {unitName ? `the ${unitName} unit's` : "your"} fixers.
          {teammates.length > 0 && <> Shared with {teammates.map((e) => e.name).join(", ")}; any fixer can update an action item.</>}
        </p>
      </div>

      <div className="score-row score-row-4">
        <div className="score-card"><div className="score-num">{mine.length}</div><div className="score-label">Assigned</div></div>
        <div className="score-card"><div className="score-num" style={{ color: "var(--magenta)" }}>{active.length}</div><div className="score-label">Action required</div></div>
        <div className="score-card"><div className="score-num" style={{ color: "var(--warning)" }}>{longTerm.length}</div><div className="score-label">Long term</div></div>
        <div className="score-card"><div className="score-num" style={{ color: "var(--success)" }}>{fixed.length}</div><div className="score-label">Fixed</div></div>
      </div>

      {mine.length === 0 ? (
        <div className="card empty-note card-pad">No action items assigned yet.</div>
      ) : groups.filter(([, list]) => list.length).map(([label, list]) => (
        <div key={label} style={{ marginBottom: 18 }}>
          <QueueHeading label={label} count={list.length} />
          <div className="ctile-grid">
            {list.map((c) => <ComplaintTile key={`${c.visitId}-${c.id}`} c={c} onOpen={() => onOpen(c)} />)}
          </div>
        </div>
      ))}
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
