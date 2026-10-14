import React, { useState } from "react";
import {
  ArrowLeft, Plus, Route, Edit3, Trash2, CalendarClock, ChevronRight, Mic, CheckCheck, BedDouble, Lock, PenLine, Clock, Image as ImageIcon,
} from "lucide-react";
import {
  ENTRY_TYPES, ENTRY_ORDER, phaseOf, entriesOf, sortEntries, countsOf, isDraft, markDoneBlocker, tripStart, tripTitle,
  computeDuration, fmtDay, fmtDate, fmtClock, relativeDay, plural, shortName, reasonText, whenText, UNDEFINED_UNIT, mmss, entryPlaces, placesText,
} from "../../lib/visits";
import { statusOf, statusClass, complaintTitle } from "../../lib/complaints";
import { PhasePill, TYPE_ICONS } from "./VisitCard";
import EntrySheet, { EntryView, draftReady } from "./EntrySheet";
import { RouteSummary } from "./Places";
import ConfirmDialog from "./Confirm";
import { SyncPill } from "./SyncPill";

const stayRange = (s) => (s.checkIn ? `${fmtDate(s.checkIn)}${s.checkOut && s.checkOut !== s.checkIn ? ` – ${fmtDate(s.checkOut)}` : ""}` : "");

export function EntryRow({ e, onOpen }) {
  const draft = isDraft(e);
  const offices = placesText(entryPlaces(e)) || (e.type === "story" ? e.locationText : "");
  const badges = [
    draft ? <span key="s" className="pill pill-stale"><PenLine size={11} /> Draft</span> : <span key="s" className="pill pill-ok"><Lock size={11} /> Submitted</span>,
    offices && <span key="o" className="tag-badge branch">{offices}</span>,
  ];
  let text = e.type === "complaint" ? (e.title ? complaintTitle(e) : e.description) : e.type === "story" ? (e.title || e.caption) : e.description;
  if (e.type === "complaint") {
    badges.push(<span key="u" className={`urgency-badge urgency-${e.urgency}`}>{e.urgency}</span>);
    if (e.department) badges.push(<span key="d" className="tag-badge">{e.department === UNDEFINED_UNIT ? `Unit: ${UNDEFINED_UNIT}` : `${e.department}${e.unit ? ` · ${e.unit}` : ""}`}</span>);
    if (!draft && e.status) badges.push(<span key="st" className={statusClass(e)}>{statusOf(e)}</span>);
  }
  if (e.type === "interaction") {
    const stars = (e.ratings || []).map((r) => r.stars).filter((n) => n > 0);
    if (stars.length) badges.push(<span key="r" className="tag-badge ok">{(stars.reduce((s, n) => s + n, 0) / stars.length).toFixed(1)} ★</span>);
    if (e.person?.name) badges.push(<span key="p" className="tag-badge">{e.person.name}</span>);
  }
  if (e.type === "observation" && e.fromStaff) badges.push(<span key="f" className="tag-badge info">From staff{e.staff?.name ? `: ${e.staff.name}` : ""}</span>);
  if (e.voice) badges.push(<span key="v" className="tag-badge"><Mic size={11} /> {mmss(e.voice.dur || 0)}</span>);
  if (e.photoUrl) badges.push(<span key="ph" className="tag-badge"><ImageIcon size={11} /> Photo</span>);
  if (!text) text = e.type === "story" ? "Photo, no caption" : e.voice ? "Voice note, not written up yet" : e.type === "interaction" ? "Ratings only" : "No description yet";
  const when = e.submittedAt || e.updatedAt || e.time;
  return (
    <button type="button" className={`entry-row ${draft ? "draft" : ""}`} onClick={onOpen}>
      <span className="entry-main">
        <span className="entry-badges">{badges}<span className="entry-time">{when ? `${fmtDay(new Date(when))}, ${fmtClock(new Date(when))}` : ""}</span></span>
        <span className={`entry-text ${!(e.type === "story" ? e.caption : e.description) ? "muted" : ""}`}>{text}</span>
      </span>
      <ChevronRight size={17} />
    </button>
  );
}

/**
 * The visit page: where and when at the top (both can be changed any time),
 * then the four things you can add — complaints, client interactions,
 * observations and stories. Tap one to see what's already there; drafts first,
 * submitted (locked) after. "Mark as done" closes the visit.
 * `viewer` (management looking at someone else's visit) makes the whole page read-only.
 */
export default function VisitHub({ visit: v, tree, departments, questions, sync, initialSheet, onSave, onEditDetails, onMarkedDone, onBack, showToast, viewer = null, onDelete = null }) {
  const [sheet, setSheet] = useState(initialSheet || null); // { type, entryId? }
  const [openType, setOpenType] = useState(initialSheet?.type || null);
  const [doneAsk, setDoneAsk] = useState(false);
  const [submitReady, setSubmitReady] = useState(true);
  const [askDelete, setAskDelete] = useState(false);

  const phase = phaseOf(v);
  const readOnly = v.status === "done" || !!viewer;
  const counts = countsOf(v);
  const start = v.date ? tripStart(v) : null;
  const dur = computeDuration(v.date, v.visitTime, v.returnDate, v.returnTime);
  const stays = v.stays || [];

  const saveEntry = (type, entry, opts = {}) => {
    const list = ENTRY_TYPES[type].list;
    const items = v[list] || [];
    const exists = items.some((x) => x.id === entry.id);
    onSave({
      ...v,
      [list]: exists ? items.map((x) => (x.id === entry.id ? entry : x)) : [...items, entry],
      lastPlaces: entry.places?.length ? entry.places : v.lastPlaces || null,
    });
    setSheet(null);
    setOpenType(type);
    const what = ENTRY_TYPES[type].label;
    if (opts.submitted) showToast(`${what} submitted${type === "complaint" ? " to the admin" : ""}${sync.online ? "" : " · will be sent when online"}`);
    else showToast(opts.auto ? `${what} kept as a draft` : `${what} saved as a draft`);
  };
  const deleteEntry = (type, id) => {
    const list = ENTRY_TYPES[type].list;
    onSave({ ...v, [list]: (v[list] || []).filter((x) => x.id !== id) });
    setSheet(null);
    showToast("Draft deleted");
  };

  // "Mark as done"
  const blocker = markDoneBlocker(v);
  const drafts = entriesOf(v).filter(isDraft);
  const ready = drafts.filter((e) => draftReady(e.type, e, departments));
  const markDone = () => {
    const now = new Date().toISOString();
    const next = { ...v, status: "done", doneAt: now };
    if (submitReady && ready.length) {
      const ids = new Set(ready.map((e) => e.id));
      ENTRY_ORDER.forEach((t) => {
        const list = ENTRY_TYPES[t].list;
        next[list] = (v[list] || []).map((e) => (ids.has(e.id) ? { ...e, state: "submitted", submittedAt: now } : e));
      });
    }
    onSave(next);
    setDoneAsk(false);
    onMarkedDone();
  };

  const sheetList = sheet ? v[ENTRY_TYPES[sheet.type].list] || [] : [];
  const sheetEntry = sheet?.entryId ? sheetList.find((x) => x.id === sheet.entryId) : null;
  const openEntry = (e) => setSheet({ type: e.type, entryId: e.id });

  const panel = openType && (() => {
    const list = sortEntries(entriesOf(v, openType));
    const ds = list.filter(isDraft), ss = list.filter((e) => !isDraft(e));
    const { icon: Icon, cls } = TYPE_ICONS[openType];
    return (
      <section className="hub-card entry-panel" aria-label={ENTRY_TYPES[openType].plural}>
        <div className="hub-head">
          <span className={`hub-ico ${cls}`}><Icon size={19} /></span>
          <div className="tx">
            <h3>{ENTRY_TYPES[openType].plural}</h3>
            <p>{list.length ? `${ds.length ? `${plural(ds.length, "draft")} · ` : ""}${ss.length} submitted` : "No entries yet."}</p>
          </div>
          {!readOnly && <button className="btn btn-primary btn-sm" onClick={() => setSheet({ type: openType })}><Plus size={14} /> New</button>}
        </div>
        {ds.length > 0 && <div className="ep-group">{v.status === "done" ? "Drafts · never submitted" : viewer ? "Drafts · not submitted yet" : "Drafts · not sent yet"}</div>}
        {ds.map((e) => <EntryRow key={e.id} e={e} onOpen={() => openEntry(e)} />)}
        {ss.length > 0 && <div className="ep-group">Submitted · can't be edited</div>}
        {ss.map((e) => <EntryRow key={e.id} e={e} onOpen={() => openEntry(e)} />)}
        {!list.length && !readOnly && (
          <button type="button" className="ep-empty" onClick={() => setSheet({ type: openType })}>
            <Plus size={16} /> Add a {ENTRY_TYPES[openType].label.toLowerCase()}
          </button>
        )}
      </section>
    );
  })();

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 10, paddingLeft: 0 }} onClick={onBack}><ArrowLeft size={14} /> {viewer ? viewer.backLabel || "Back" : "My visits"}</button>

      <div className="page-head">
        <div>
          <p className="h-eyebrow" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <PhasePill phase={phase} /> <span className="mono">{v.id}</span>
          </p>
          <h1 className="h-title">{tripTitle(v)}</h1>
          <p className="h-desc">{reasonText(v)} · {start ? fmtDay(start) : "No date"}{dur ? ` · ${dur}` : ""}</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {!viewer && <SyncPill sync={sync} />}
          {!readOnly && onDelete && <button className="btn btn-ghost" style={{ color: "var(--danger)" }} onClick={() => setAskDelete(true)}><Trash2 size={15} /> Delete visit</button>}
          {!readOnly && <button className="btn btn-primary" onClick={() => { setSubmitReady(true); setDoneAsk(true); }}><CheckCheck size={16} /> Mark as done</button>}
        </div>
      </div>

      {viewer && (
        <div className="info-banner" style={{ marginBottom: 16 }}>
          <Lock size={17} />
          <span><b>{v.employeeName}'s visit</b>, shown read-only.{v.status !== "done" && counts.drafts ? ` Drafts are still being worked on and may change.` : ""}</span>
        </div>
      )}
      {phase === "upcoming" && start && !viewer && (
        <div className="info-banner" style={{ marginBottom: 16 }}>
          <CalendarClock size={17} />
          <span><b>Scheduled for {fmtDay(start)}</b> ({relativeDay(start)}). Entries can be added at any time and are saved automatically.</span>
        </div>
      )}
      {v.status === "done" && (
        <div className="info-banner done" style={{ marginBottom: 16 }}>
          <CheckCheck size={17} />
          <span><b>Marked as done{v.doneAt ? ` on ${fmtDay(new Date(v.doneAt))}` : ""}.</b> {viewer ? "The visit is closed." : "This visit is closed, so everything on it is read-only."}</span>
        </div>
      )}

      {/* The visit and its records sit inside one frame, so it's clear every record belongs to this visit. */}
      <div className="visit-frame">
        <div className="vf-head">
          <span className="vf-badge"><Route size={13} /> Visit record</span>
          <b>{tripTitle(v)}</b>
          <span className="vf-meta">{start ? fmtDay(start) : "No date"} · <span className="mono">{v.id}</span></span>
        </div>
      <div className="hub-grid">
        <div className="hub-col">
          {/* One summary card; Change opens the full visit form (location, schedule, purpose, accommodation). */}
          <section className="hub-card">
            <div className="hub-head">
              <span className="hub-ico ico-route"><Route size={19} /></span>
              <div className="tx"><h3>Visit details</h3><p>{(v.stops || []).length ? `${plural(v.stops.length, "office")} selected` : "No offices selected"}</p></div>
              {!readOnly && <button className="btn btn-secondary btn-sm" onClick={() => onEditDetails()}><Edit3 size={14} /> Change</button>}
            </div>
            <RouteSummary visit={v} empty="Location not set" showNone={false} />
            <div className="rs-line"><Clock size={14} /><span>{whenText(v)}</span></div>
            {stays.map((s) => (
              <div key={s.id} className="rs-line stay"><BedDouble size={14} /><span>{s.name || s.type}{stayRange(s) ? <span className="rs-muted"> · {stayRange(s)}</span> : null}</span></div>
            ))}
          </section>
        </div>

        <div className="hub-col">
          <section className="records-box" aria-label={`Records for visit ${v.id}`}>
          <div className="rb-title">
            <b>Records for this visit</b>
            <small>Action items, client interactions, observations and stories recorded during {tripTitle(v)}{start ? `, ${fmtDay(start)}` : ""}.</small>
          </div>
          <div className="etiles" role="group" aria-label="Add to this visit">
            {ENTRY_ORDER.map((t) => {
              const { icon: Icon, cls } = TYPE_ICONS[t];
              const c = counts[t];
              const on = openType === t;
              return (
                <div key={t} className={`etile ${on ? "on" : ""}`}>
                  <button type="button" className="etile-main" aria-expanded={on} onClick={() => setOpenType(on ? null : t)}>
                    <span className={`hub-ico ${cls}`}><Icon size={19} /></span>
                    <span className="etile-label">{ENTRY_TYPES[t].label}</span>
                    <span className="etile-count">{c.total ? <>{c.drafts > 0 && <b>{plural(c.drafts, "draft")} · </b>}{c.submitted} submitted</> : "None yet"}</span>
                  </button>
                  {!readOnly && (
                    <button type="button" className="etile-add" onClick={() => setSheet({ type: t })} aria-label={`New ${ENTRY_TYPES[t].label.toLowerCase()}`} title={`New ${ENTRY_TYPES[t].label.toLowerCase()}`}>
                      <Plus size={17} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {panel || <p className="etiles-hint">{readOnly ? "Select a category to view its entries." : "Select a category to view its entries, or + to add one. Each entry is submitted separately."}</p>}
          </section>

          {/* phones only: the button at the top of the page scrolls out of reach there */}
          {!readOnly && (
            <section className="hub-card done-card">
              <div className="hub-head">
                <span className="hub-ico ico-done"><CheckCheck size={19} /></span>
                <div className="tx">
                  <h3>Complete this visit</h3>
                  <p>{blocker ? `${blocker} Then mark it as done.` : `Mark the visit as done to close it.${counts.drafts ? ` ${plural(counts.drafts, "draft")} not yet submitted.` : ""}`}</p>
                </div>
              </div>
              <button className="btn btn-secondary btn-block" onClick={() => { setSubmitReady(true); setDoneAsk(true); }}><CheckCheck size={15} /> Mark as done</button>
            </section>
          )}
        </div>
      </div>
      </div>

      {sheet && (sheetEntry && !isDraft(sheetEntry) || (sheetEntry && readOnly) ? (
        <EntryView type={sheet.type} entry={sheetEntry} visit={v} onClose={() => setSheet(null)} />
      ) : !readOnly && (
        <EntrySheet
          key={`${sheet.type}-${sheet.entryId || "new"}`}
          type={sheet.type} entry={sheetEntry} visit={v} tree={tree}
          departments={departments} questions={questions} showToast={showToast}
          onSave={(entry, opts) => saveEntry(sheet.type, entry, opts)}
          onDelete={sheetEntry ? () => deleteEntry(sheet.type, sheetEntry.id) : null}
          onClose={() => setSheet(null)}
        />
      ))}

      {askDelete && (
        <ConfirmDialog title="Delete this visit?" confirmLabel="Delete visit" cancelLabel="Cancel" tone="danger"
                       onCancel={() => setAskDelete(false)} onConfirm={() => { setAskDelete(false); onDelete(); }}>
          <p style={{ margin: 0 }}>The visit and everything recorded on it will be permanently deleted. This cannot be undone.</p>
          {counts.total > 0 && (
            <div className="done-drafts">
              <b>{[counts.submitted && plural(counts.submitted, "submitted entry", "submitted entries"), counts.drafts && plural(counts.drafts, "draft")].filter(Boolean).join(" and ")} will be deleted.</b>
              {counts.complaint.submitted > 0 && <p style={{ margin: "4px 0 0" }}>This includes {plural(counts.complaint.submitted, "action item")} already sent to the admin.</p>}
            </div>
          )}
        </ConfirmDialog>
      )}

      {doneAsk && (blocker ? (
        <ConfirmDialog title="Visit dates required" confirmLabel="Add dates" cancelLabel="Cancel"
                       onCancel={() => setDoneAsk(false)} onConfirm={() => { setDoneAsk(false); onEditDetails(!v.date ? "date" : "returnDate"); }}>
          {blocker} A visit can be marked as done once its visit and return dates are entered.
        </ConfirmDialog>
      ) : (
        <ConfirmDialog title="Mark this visit as done?" confirmLabel="Mark as done" cancelLabel="Cancel"
                       onCancel={() => setDoneAsk(false)} onConfirm={markDone}>
          <p style={{ margin: 0 }}>This closes the visit. No entries can be added or changed afterwards.</p>
          {drafts.length > 0 && (
            <div className="done-drafts">
              <b>{plural(drafts.length, "draft")} not submitted yet.</b>
              {ready.length > 0 && (
                <label className="consent-row" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={submitReady} onChange={(e) => setSubmitReady(e.target.checked)} />
                  <span>Submit the {ready.length === 1 ? "draft that is" : `${ready.length} drafts that are`} ready<small>{ready.length < drafts.length ? `${drafts.length - ready.length} incomplete ${drafts.length - ready.length === 1 ? "draft stays" : "drafts stay"} unsent.` : "They are sent with the visit."}</small></span>
                </label>
              )}
              {!ready.length && <p style={{ margin: "4px 0 0" }}>They are incomplete and will remain unsubmitted.</p>}
            </div>
          )}
        </ConfirmDialog>
      ))}
    </div>
  );
}
