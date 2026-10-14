import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Star, MapPin, ChevronDown, ChevronUp, Info, Trash2, Send, Lock, Heart, MessageCircle, Route } from "lucide-react";
import { PersonFields, PersonDetails, compactPerson, hasPerson, PERSON_FIELDS } from "../../lib/PersonInfo";
import { makeId } from "../../lib/ids";
import { TERMS, lower } from "../../lib/terms";
import { UNDEFINED_UNIT, ENTRY_TYPES, OFFICE_KIND_LABEL, placePath, placeOfStop, entryPlaces, placesText, tripTitle, tripPath, fmtDate, fmtDay, fmtClock } from "../../lib/visits";
import { statusOf, statusClass, complaintTitle } from "../../lib/complaints";
import PhotoUpload from "./PhotoUpload";
import { VoiceNoteField, VoicePlayer } from "./VoiceNote";
import { OfficeSelector } from "./Places";
import ConfirmDialog from "./Confirm";
import Portal from "../../lib/Portal";
import Resolution from "../../lib/Resolution";

const STORY_GRADIENTS = [
  "linear-gradient(135deg,#EC008C 0%,#7A1FA2 100%)",
  "linear-gradient(135deg,#2F6FED 0%,#1D1E22 100%)",
  "linear-gradient(135deg,#1C8A54 0%,#0D3B24 100%)",
  "linear-gradient(135deg,#B7791F 0%,#5C3A0A 100%)",
];

const label = (type) => ENTRY_TYPES[type].label;
const optional = (t = "(optional)") => <span className="opt">{t}</span>;
const req = <span className="req">*</span>;

/** Which office lists each entry type offers (stories take a typed location instead). */
export const ENTRY_KINDS = {
  complaint: ["region", "area", "branch"],
  observation: ["region", "area", "branch"],
  interaction: ["branch"],
  story: [],
};
const allowedPlace = (type, p) => (ENTRY_KINDS[type].includes(p.officeKind) || (p.officeKind === "vo" && ENTRY_KINDS[type].includes("branch")));

/** The offices a new entry starts with: the last ones used on this visit, or its only planned office. */
export function defaultPlaces(v, type) {
  const last = (v.lastPlaces || (v.lastPlace?.office ? [v.lastPlace] : [])).filter((p) => allowedPlace(type, p));
  if (last.length) return last;
  const planned = (v.stops || []).map((s) => placeOfStop(s, v)).filter((p) => allowedPlace(type, p));
  return planned.length === 1 ? planned : [];
}

/** The form's starting values: an existing draft, or an empty entry. */
function draftFrom(type, e, places) {
  const base = { places: e ? entryPlaces(e) : places, photoUrl: e?.photoUrl || null };
  if (type === "complaint") {
    return {
      ...base, title: e?.title || "", description: e?.description || "", voice: e?.voice || null,
      urgency: e?.urgency || "Medium", department: e?.department || "", unit: e?.unit || "",
      source: e?.source || "staff", person: e?.person || {}, consent: e ? e.consent !== false : true,
    };
  }
  if (type === "interaction") {
    const ratings = {};
    (e?.ratings || []).forEach((r) => { ratings[r.questionId] = r.stars; });
    return { ...base, description: e?.description || "", voice: e?.voice || null, ratings, person: e?.person || {} };
  }
  if (type === "observation") {
    return { ...base, description: e?.description || "", voice: e?.voice || null, fromStaff: !!e?.fromStaff, staff: e?.staff || {} };
  }
  return { ...base, places: [], title: e?.title || "", caption: e?.caption || "", locationText: e?.locationText || "" };
}

/** Anything typed, recorded, rated or attached? (Offices alone don't make a draft.) */
function isEmpty(type, d) {
  const text = (d.title || "") + (d.description || "") + (d.caption || "") + (d.locationText || "");
  return !text.trim() && !d.voice && !d.photoUrl
    && !(type === "interaction" && (Object.values(d.ratings).some((n) => n > 0) || hasPerson(d.person)))
    && !(type === "complaint" && (d.department || hasPerson(d.person)))
    && !(type === "observation" && hasPerson(d.staff));
}

/** What still stops the entry from being submitted ("" = ready). A voice note counts as a description. */
export function whyNotReady(type, d, departments) {
  const said = (d.description || "").trim() || d.voice;
  if (type === "story") {
    if (!d.title.trim()) return "Enter a title for the story.";
    if (!d.caption.trim()) return "Enter a description for the story.";
    return "";
  }
  if (type === "observation") { if (!said && !d.photoUrl) return "Add a description, a voice note or a photo."; }
  else if (type === "interaction") {
    if (!said && !Object.values(d.ratings).some((n) => n > 0)) return "Record the client's feedback or rate at least one question.";
  } else {
    if (!(d.title || "").trim()) return "Enter a title for the action item.";
    if (!said) return "Enter a description or record a voice note.";
    if (!d.department) return `Select a ${lower(TERMS.unit)}. Choose ${UNDEFINED_UNIT} if unsure.`;
    // an action item is about exactly one office (regional, area or branch), optionally a VO under its branch
    if ((d.places || []).filter((p) => p.officeKind !== "vo").length > 1) return "Select only one office.";
  }
  if (!(d.places || []).length) return type === "interaction" ? "Select the branch office or VO." : type === "complaint" ? "Select the office." : "Select at least one office.";
  return "";
}

/** Readiness of a stored draft (used by "Mark as done"). */
export function draftReady(type, entry, departments) {
  return !whyNotReady(type, draftFrom(type, entry, entryPlaces(entry)), departments);
}

const personSummary = (kind, person) => {
  const p = compactPerson(person);
  const labels = PERSON_FIELDS[kind === "member" ? "member" : "staff"].filter((f) => p[f.key]).map((f) => f.label);
  return labels.length ? labels.join(", ") : "Not provided";
};

function Stars({ value, onChange, labelText }) {
  return (
    <div className="stars" role="radiogroup" aria-label={labelText}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className="star-btn" role="radio" aria-checked={value === n} aria-label={`${n} of 5`} disabled={!onChange}
                onClick={() => onChange && onChange(value === n ? 0 : n)}>
          <Star size={onChange ? 24 : 18} fill={n <= value ? "var(--brand)" : "none"} color={n <= value ? "var(--brand)" : "var(--ink-faint)"} />
        </button>
      ))}
    </div>
  );
}

/** Which visit this entry belongs to, shown at the top of every entry form and view. */
export function VisitContext({ visit }) {
  return (
    <div className="visit-ctx">
      <Route size={15} />
      <span>For visit <b>{tripTitle(visit)}</b>{visit.date ? ` · ${fmtDate(visit.date)}` : ""}{tripPath(visit) ? <small>{tripPath(visit)}</small> : null}</span>
      <span className="mono">{visit.id}</span>
    </div>
  );
}

/**
 * A new entry or a draft: a complaint, a client interaction, an observation or a story, recorded
 * against one visit. Closing keeps it as a draft; Submit (after confirmation) sends it and locks it.
 */
export default function EntrySheet({ type, entry, visit, tree, departments, questions, onSave, onDelete, onClose, showToast }) {
  const start = useMemo(() => draftFrom(type, entry, defaultPlaces(visit, type)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [d, setD] = useState(start);
  const [whoOpen, setWhoOpen] = useState(() => hasPerson(entry?.person));
  const [recording, setRecording] = useState(false);
  const [sureDelete, setSureDelete] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const placeRef = useRef(null);
  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  const setVoice = (voice) => setD((x) => ({ ...x, voice }));

  const why = whyNotReady(type, d, departments);
  const empty = isEmpty(type, d);
  const changed = JSON.stringify(d) !== JSON.stringify(start);
  const teams = (departments.find((x) => x.name === d.department)?.units) || [];
  const activeQuestions = (questions || []).filter((q) => q.active !== false);

  const build = (state) => {
    const now = new Date().toISOString();
    const places = d.places || [];
    const common = { ...(entry || {}), id: entry?.id || makeId(ENTRY_TYPES[type].prefix), places, place: places[0] || null, photoUrl: d.photoUrl, time: entry?.time || now, updatedAt: now, state };
    if (state === "submitted") common.submittedAt = now;
    if (type === "complaint") {
      const person = compactPerson(d.person);
      return { ...common, place: places.find((p) => p.officeKind === "vo") || places[0] || null, title: d.title.trim(), description: d.description.trim(), voice: d.voice, urgency: d.urgency, department: d.department, unit: d.unit || null,
        source: d.source, person: hasPerson(person) ? person : null, consent: d.consent };
    }
    if (type === "interaction") {
      // each answer keeps the question's wording at the time, so later edits to the question don't rewrite it
      const kept = (entry?.ratings || []).filter((r) => !activeQuestions.some((q) => q.id === r.questionId));
      const asked = activeQuestions.filter((q) => d.ratings[q.id] > 0).map((q) => {
        const before = (entry?.ratings || []).find((r) => r.questionId === q.id);
        return { questionId: q.id, question: before?.question || q.text, stars: d.ratings[q.id] };
      });
      const person = compactPerson(d.person);
      return { ...common, description: d.description.trim(), voice: d.voice, ratings: [...kept, ...asked], person: hasPerson(person) ? person : null };
    }
    if (type === "observation") {
      const staff = compactPerson(d.staff);
      return { ...common, description: d.description.trim(), voice: d.voice, fromStaff: d.fromStaff, staff: d.fromStaff && hasPerson(staff) ? staff : null };
    }
    return { ...common, places: [], place: null, title: d.title.trim(), caption: d.caption.trim(), locationText: d.locationText.trim(),
      gradient: d.photoUrl ? null : (entry?.gradient || STORY_GRADIENTS[Math.floor(Math.random() * STORY_GRADIENTS.length)]),
      likes: entry?.likes || 0, likedBy: entry?.likedBy || [], comments: Array.isArray(entry?.comments) ? entry.comments : [] };
  };

  // Anything not submitted is kept as a draft, including when the form is just closed.
  const close = () => {
    if (recording) return;
    if (changed && !empty) onSave(build("draft"), { auto: true });
    else onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !confirm) closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirm]);

  const description = (text, placeholder, required = true) => (
    <div className="field-group">
      <label className="field-label" htmlFor="entry-desc">{text} {required ? req : optional()}</label>
      <textarea id="entry-desc" className="textarea" placeholder={placeholder} value={d.description} onChange={(e) => set({ description: e.target.value })} />
      <VoiceNoteField value={d.voice} onChange={setVoice} onRecording={setRecording} showToast={showToast} />
      <p className="field-hint">{d.voice ? "The voice note is saved with this entry and can be transcribed later." : "Type the details, or record a voice note and transcribe it later."}</p>
    </div>
  );
  const photo = (title = "Photo") => (
    <div className="field-group" style={{ marginBottom: 0 }}>
      <label className="field-label">{title} {optional()}</label>
      <PhotoUpload photoUrl={d.photoUrl} onChange={(url) => set({ photoUrl: url })} />
    </div>
  );
  const location = (
    <fieldset className="form-sec" ref={placeRef}>
      <legend><MapPin size={14} /> {type === "interaction" ? "Branch office / VO" : type === "complaint" ? "Office" : "Office(s)"} {req}</legend>
      <OfficeSelector tree={tree} division={visit.division} region={visit.region} area={visit.area}
                      value={d.places} onChange={(places) => set({ places })} kinds={ENTRY_KINDS[type]} single={type === "complaint"} idPrefix="entry" />
      <p className="field-hint" style={{ marginBottom: 0 }}>{type === "complaint" ? "Select one office: a regional, area or branch office. A VO can be added under a branch office. " : ""}Offices are listed for the visit area ({[visit.region, visit.area].filter(Boolean).join(" · ") || "not set"}). To change the area, use <b>Change</b> on the visit details.</p>
    </fieldset>
  );

  let body;
  let info = null;
  if (type === "complaint") {
    const personKind = d.source;
    body = (
      <>
        <fieldset className="form-sec">
          <legend>Action item details</legend>
          <div className="field-group">
            <label className="field-label" htmlFor="entry-title">Title {req}</label>
            <input id="entry-title" className="input" maxLength={120} placeholder="Short summary, e.g. Loan disbursement delayed" value={d.title} onChange={(e) => set({ title: e.target.value })} />
          </div>
          {description("Description", "Describe the issue in detail")}
          <div className="field-group">
            <label className="field-label">Urgency</label>
            <div className="seg">
              {["Low", "Medium", "High"].map((u) => (
                <button key={u} type="button" className={`seg-btn ${d.urgency === u ? "active" : ""}`} onClick={() => set({ urgency: u })}>{u}</button>
              ))}
            </div>
          </div>
          {photo()}
        </fieldset>

        <fieldset className="form-sec">
          <legend>Routing</legend>
          <div className="field-row">
            <div className="field-group" style={{ marginBottom: 0 }}>
              <label className="field-label" htmlFor="entry-unit">{TERMS.unit} {req}</label>
              <select id="entry-unit" className="select" value={d.department} onChange={(e) => set({ department: e.target.value, unit: "" })}>
                <option value="">{`Select ${lower(TERMS.unit)}`}</option>
                {departments.map((x) => <option key={x.id}>{x.name}</option>)}
                <option>{UNDEFINED_UNIT}</option>
              </select>
            </div>
            <div className="field-group" style={{ marginBottom: 0 }}>
              <label className="field-label" htmlFor="entry-team">{TERMS.team} {optional()}</label>
              <select id="entry-team" className="select" value={d.unit} disabled={teams.length === 0} onChange={(e) => set({ unit: e.target.value })}>
                <option value="">{!d.department ? `Select a ${lower(TERMS.unit)} first` : teams.length ? `Select ${lower(TERMS.team)}` : `No ${lower(TERMS.teams)} in this ${lower(TERMS.unit)}`}</option>
                {teams.map((u) => <option key={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <p className="field-hint" style={{ marginBottom: 0 }}>If unsure of the {lower(TERMS.unit)}, select <b>{UNDEFINED_UNIT}</b> and the admin will route it.</p>
        </fieldset>

        <fieldset className="form-sec">
          <legend>Raised by {optional()}</legend>
          <button type="button" className="who-toggle" aria-expanded={whoOpen} onClick={() => setWhoOpen((o) => !o)}>
            <span className="tx">Raised by<small>{personSummary(personKind, d.person)}</small></span>
            {whoOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
          {whoOpen && (
            <div style={{ marginTop: 10 }}>
              <div className="seg" style={{ marginBottom: 12 }}>
                <button type="button" className={`seg-btn ${d.source === "staff" ? "active" : ""}`} onClick={() => set({ source: "staff", person: {} })}>BRAC staff</button>
                <button type="button" className={`seg-btn ${d.source === "member" ? "active" : ""}`} onClick={() => set({ source: "member", person: {} })}>Client</button>
              </div>
              <PersonFields kind={personKind} title={personKind === "member" ? "Client details" : "Staff details"}
                            value={d.person || {}} onChange={(p) => set({ person: p })} departments={departments} />
              <p className="field-hint" style={{ marginTop: -8 }}>Fields left blank are recorded as "Not provided".</p>
            </div>
          )}
          <label className="consent-row" style={{ marginBottom: 0 }}>
            <input type="checkbox" checked={d.consent} onChange={(e) => set({ consent: e.target.checked })} />
            <span>Consent to follow-up contact<small>Used only for this action item.</small></span>
          </label>
        </fieldset>
      </>
    );
    info = "An action item is sent to the admin as soon as it is submitted. Until then it is a draft visible only to you.";
  } else if (type === "interaction") {
    body = (
      <>
        <fieldset className="form-sec">
          <legend>Client feedback</legend>
          {description("Feedback", "Summary of the client's feedback", false)}
          <div className="field-group" style={{ marginBottom: 0 }}>
            <label className="field-label">Ratings {optional("(set by the admin; skip any)")}</label>
            {activeQuestions.length === 0 ? (
              <p className="field-hint">No rating questions are active. The admin manages them under Client questions.</p>
            ) : (
              <div className="rating-list">
                {activeQuestions.map((q) => (
                  <div className="rating-q" key={q.id}>
                    <b>{q.text}</b>
                    <Stars value={d.ratings[q.id] || 0} labelText={q.text} onChange={(n) => set({ ratings: { ...d.ratings, [q.id]: n } })} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ marginTop: 14 }}>{photo()}</div>
        </fieldset>
        <fieldset className="form-sec">
          <legend>Client information {optional()}</legend>
          <PersonFields kind="member" title="" value={d.person || {}} onChange={(p) => set({ person: p })} />
        </fieldset>
      </>
    );
  } else if (type === "observation") {
    body = (
      <>
        <fieldset className="form-sec">
          <legend>Observation</legend>
          {description("Observation", "Describe what was observed")}
          {photo()}
        </fieldset>
        <fieldset className="form-sec">
          <legend>Source</legend>
          <label className="consent-row" style={{ marginBottom: d.fromStaff ? 12 : 0 }}>
            <input type="checkbox" checked={d.fromStaff} onChange={(e) => set({ fromStaff: e.target.checked })} />
            <span>Referred by BRAC staff<small>Select if a BRAC staff member reported or showed this.</small></span>
          </label>
          {d.fromStaff && (
            <PersonFields kind="staff" title="Staff details" value={d.staff || {}} onChange={(p) => set({ staff: p })} departments={departments} />
          )}
        </fieldset>
      </>
    );
  } else {
    body = (
      <fieldset className="form-sec">
        <legend>Story</legend>
        <div className="field-group">
          <label className="field-label" htmlFor="entry-title">Title {req}</label>
          <input id="entry-title" className="input" maxLength={120} placeholder="Story title" value={d.title} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="entry-caption">Description {req}</label>
          <textarea id="entry-caption" className="textarea" placeholder="Tell the story" value={d.caption} onChange={(e) => set({ caption: e.target.value })} />
        </div>
        <div className="field-group">
          <label className="field-label">Picture {optional()}</label>
          <PhotoUpload photoUrl={d.photoUrl} onChange={(url) => set({ photoUrl: url })} />
        </div>
        <div className="field-group" style={{ marginBottom: 0 }}>
          <label className="field-label" htmlFor="entry-location">Location {optional()}</label>
          <input id="entry-location" className="input" maxLength={160} placeholder="e.g. Mirpur Branch, VO-142" value={d.locationText} onChange={(e) => set({ locationText: e.target.value })} />
        </div>
      </fieldset>
    );
  }

  const chosen = placesText(d.places);
  return (
    <Portal>
    <div className="modal-veil" onClick={close}>
      <div className="modal-box entry-sheet" role="dialog" aria-modal="true" aria-label={`${entry ? "Edit draft" : "New"} ${lower(label(type))}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="h-eyebrow" style={{ marginBottom: 2 }}>{entry ? "Draft" : "New entry"}</p>
            <h1 className="h-title" style={{ fontSize: 19 }}>{label(type)}</h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {entry && onDelete && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }}
                      onClick={() => (sureDelete ? onDelete() : setSureDelete(true))}>
                <Trash2 size={14} /> {sureDelete ? "Select again to confirm deletion" : "Delete draft"}
              </button>
            )}
            <button type="button" className="modal-close" onClick={close} disabled={recording} aria-label="Close and keep as draft"><X size={15} /></button>
          </div>
        </div>

        <div className="modal-body entry-body">
          <VisitContext visit={visit} />
          {body}
          {type !== "story" && location}
          {info && <div className="info-banner"><Info size={16} /><span>{info}</span></div>}
        </div>

        <div className="sheet-foot">
          {type !== "story" && (
            <button type="button" className={`place-line ${chosen ? "" : "missing"}`} onClick={() => placeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>
              <MapPin size={15} />
              <span>{chosen ? <b>{chosen}</b> : "No office selected"}</span>
              <span className="pl-change">{chosen ? "Change" : "Select"}</span>
            </button>
          )}
          {(why || recording) && <p className="sheet-why">{recording ? "Stop the recording first." : why}</p>}
          <div className="row">
            <button type="button" className="btn btn-secondary" onClick={() => onSave(build("draft"))} disabled={recording || empty}>Save draft</button>
            <button type="button" className="btn btn-primary" onClick={() => setConfirm(true)} disabled={!!why || recording}><Send size={15} /> Submit</button>
          </div>
        </div>
      </div>

      {confirm && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title={`Submit this ${lower(label(type))}?`}
            confirmLabel="Submit" cancelLabel="Cancel"
            onCancel={() => setConfirm(false)}
            onConfirm={() => { setConfirm(false); onSave(build("submitted"), { submitted: true }); }}
          >
            {type === "complaint"
              ? "It will be sent to the admin immediately and can no longer be edited."
              : "Once submitted, it can no longer be edited."}
          </ConfirmDialog>
        </div>
      )}
    </div>
    </Portal>
  );
}

/** A submitted entry: everything that was sent, read-only. */
export function EntryView({ type, entry: e, visit, onClose }) {
  useEffect(() => {
    const onKey = (ev) => { if (ev.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const places = entryPlaces(e);
  const draft = e.state === "draft";
  const sent = e.submittedAt ? new Date(e.submittedAt) : null;
  const text = type === "story" ? e.caption : e.description;
  const rated = (e.ratings || []).filter((r) => r.stars > 0);
  const title = type === "complaint" ? complaintTitle(e) : type === "story" ? e.title || "" : "";
  const comments = Array.isArray(e.comments) ? e.comments : [];
  return (
    <Portal>
    <div className="modal-veil" onClick={onClose}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-label={label(type)} onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="h-eyebrow" style={{ marginBottom: 2, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {label(type)} · {draft ? <span className="pill pill-stale">Draft · not submitted</span> : <span className="pill pill-ok"><Lock size={11} /> Submitted</span>}
              {sent && !draft && <span>{fmtDay(sent)}, {fmtClock(sent)}</span>}
            </p>
            <h1 className="h-title" style={{ fontSize: 19 }}>{title || label(type)}</h1>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        <div className="modal-body entry-body">
          <VisitContext visit={visit} />
          {type === "story" ? (
            e.locationText && <div className="view-place"><MapPin size={16} /><span><b>{e.locationText}</b></span></div>
          ) : (
            <div className="view-place">
              <MapPin size={16} />
              <span>
                {places.length ? places.map((p) => (
                  <span key={p.office} style={{ display: "block" }}><b>{p.office}</b><small>{OFFICE_KIND_LABEL[p.officeKind] || "Office"}{placePath(p) ? ` · ${placePath(p)}` : ""}</small></span>
                )) : <b>No office recorded</b>}
              </span>
            </div>
          )}
          {type === "story" && (e.photoUrl
            ? <img className="view-photo" src={e.photoUrl} alt="" />
            : <div className="view-photo" style={{ background: e.gradient || STORY_GRADIENTS[0] }} />)}
          {text ? <p className="view-text">{text}</p> : !e.voice && type !== "story" && <p className="view-text muted">No description.</p>}
          {e.voice && <VoicePlayer voice={e.voice} />}
          {type !== "story" && e.photoUrl && <img className="view-photo" src={e.photoUrl} alt="" />}
          {type === "interaction" && rated.length > 0 && (
            <div className="rating-list">
              {rated.map((r) => <div className="rating-q" key={r.questionId}><b>{r.question}</b><Stars value={r.stars} labelText={r.question} /></div>)}
            </div>
          )}
          {type === "complaint" && (
            <div className="view-meta">
              <span className={`urgency-badge urgency-${e.urgency}`}>{e.urgency}</span>
              <span className="source-badge">{e.department}{e.unit ? ` · ${e.unit}` : ""}</span>
              {e.status && <span className={statusClass(e)}>{statusOf(e)}</span>}
              {e.assignedTo && <span>Assigned to <b>{e.assignedTo}</b>{e.deadline ? ` · due ${new Date(e.deadline).toLocaleDateString()}` : ""}</span>}
            </div>
          )}
          {type === "complaint" && e.longTermNote && statusOf(e) === "Long Term" && <div className="info-banner"><Info size={16} /><span><b>Long term:</b> {e.longTermNote}</span></div>}
          {type === "complaint" && <PersonDetails kind={e.source} person={e.person} consent={e.consent} />}
          {type === "complaint" && <Resolution c={e} style={{ marginTop: 10 }} />}
          {type === "interaction" && <PersonDetails kind="member" person={e.person} />}
          {type === "observation" && (e.fromStaff
            ? <><p className="field-label" style={{ margin: 0 }}>Referred by BRAC staff</p><PersonDetails kind="staff" person={e.staff} /></>
            : <p className="field-hint" style={{ margin: 0 }}>Not referred by BRAC staff.</p>)}
          {type === "story" && <p className="field-hint" style={{ margin: 0 }}><Heart size={12} style={{ verticalAlign: -2 }} /> {e.likes || 0} likes · <MessageCircle size={12} style={{ verticalAlign: -2 }} /> {comments.length} comments</p>}
          <p className="field-hint" style={{ margin: 0 }}>{draft ? "This draft has not been submitted." : "Submitted entries cannot be edited."} <span className="mono">{e.id}</span></p>
        </div>
      </div>
    </div>
    </Portal>
  );
}
