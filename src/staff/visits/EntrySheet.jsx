import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Star, MapPin, ChevronDown, ChevronUp, Info, Check, Trash2, Send, Lock, Heart } from "lucide-react";
import { PersonFields, PersonDetails, compactPerson, hasPerson, PERSON_FIELDS } from "../../lib/PersonInfo";
import { makeId } from "../../lib/ids";
import { TERMS, lower } from "../../lib/terms";
import { UNDEFINED_UNIT, ENTRY_TYPES, OFFICE_KIND_LABEL, placePath, placeOfStop, shortName, fmtDay, fmtClock } from "../../lib/visits";
import PhotoUpload from "./PhotoUpload";
import { VoiceNoteField, VoicePlayer } from "./VoiceNote";
import { PlacePicker } from "./Places";
import ConfirmDialog from "./Confirm";
import Portal from "../../lib/Portal";

const STORY_GRADIENTS = [
  "linear-gradient(135deg,#EC008C 0%,#7A1FA2 100%)",
  "linear-gradient(135deg,#2F6FED 0%,#1D1E22 100%)",
  "linear-gradient(135deg,#1C8A54 0%,#0D3B24 100%)",
  "linear-gradient(135deg,#B7791F 0%,#5C3A0A 100%)",
];

const label = (type) => ENTRY_TYPES[type].label;
const optional = (t = "(optional)") => <span style={{ fontWeight: 500, color: "var(--ink-faint)" }}>{t}</span>;

/** The office a new entry starts at: the last one used on this visit, the only planned one, or just the visit's area. */
export function defaultPlace(v) {
  if (v.lastPlace?.office) return v.lastPlace;
  if ((v.stops || []).length === 1) return placeOfStop(v.stops[0], v);
  return { division: v.division || "", region: v.region || "", area: v.area || "", office: "", officeKind: "", branch: "" };
}

/** The form's starting values: an existing draft, or an empty entry. */
function draftFrom(type, e, place) {
  const base = { place: e?.place || place, photoUrl: e?.photoUrl || null };
  if (type === "complaint") {
    return {
      ...base, description: e?.description || "", voice: e?.voice || null,
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
  return { ...base, caption: e?.caption || "" };
}

/** Anything typed, recorded, rated or attached? (The office alone doesn't make a draft.) */
function isEmpty(type, d) {
  const text = (d.description || d.caption || "").trim();
  return !text && !d.voice && !d.photoUrl
    && !(type === "interaction" && (Object.values(d.ratings).some((n) => n > 0) || hasPerson(d.person)))
    && !(type === "complaint" && (d.department || hasPerson(d.person)))
    && !(type === "observation" && hasPerson(d.staff));
}

/** What still stops the entry from being submitted ("" = ready). A voice note counts as a description. */
export function whyNotReady(type, d, departments) {
  const said = (d.description || "").trim() || d.voice;
  if (type === "story") { if (!d.photoUrl && !d.caption.trim()) return "Add a photo or a caption."; }
  else if (type === "observation") { if (!said && !d.photoUrl) return "Add a description, a voice note or a photo."; }
  else if (type === "interaction") {
    if (!said && !Object.values(d.ratings).some((n) => n > 0)) return "Write what the client said, record it, or rate at least one question.";
  } else {
    if (!said) return "Type a description or record a voice note.";
    if (!d.department) return `Choose a ${lower(TERMS.unit)}. Pick ${UNDEFINED_UNIT} if you're not sure.`;
    const teams = (departments.find((x) => x.name === d.department)?.units) || [];
    if (teams.length && !d.unit) return `Choose a ${lower(TERMS.team)} in ${d.department}.`;
  }
  if (!d.place?.office) return "Choose the office this is about.";
  return "";
}

/** Readiness of a stored draft (used by "Mark as done"). */
export function draftReady(type, entry, departments) {
  return !whyNotReady(type, draftFrom(type, entry, entry.place), departments);
}

const personSummary = (kind, person) => {
  const p = compactPerson(person);
  const labels = PERSON_FIELDS[kind === "member" ? "member" : "staff"].filter((f) => p[f.key]).map((f) => f.label);
  return labels.length ? labels.join(", ") : "Not mention";
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

/**
 * A new entry or a draft: a complaint, a client interaction, an observation or a story.
 * The description comes first, the office it is about last. Closing keeps it as a
 * draft; Submit (after "Are you sure?") sends it and locks it.
 */
export default function EntrySheet({ type, entry, visit, tree, departments, questions, onSave, onDelete, onClose, showToast }) {
  const start = useMemo(() => draftFrom(type, entry, defaultPlace(visit)), []); // eslint-disable-line react-hooks/exhaustive-deps
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
  const suggestions = (visit.stops || []).map((s) => placeOfStop(s, visit));

  const build = (state) => {
    const now = new Date().toISOString();
    const common = { ...(entry || {}), id: entry?.id || makeId(ENTRY_TYPES[type].prefix), place: d.place, photoUrl: d.photoUrl, time: entry?.time || now, updatedAt: now, state };
    if (state === "submitted") common.submittedAt = now;
    if (type === "complaint") {
      const person = compactPerson(d.person);
      return { ...common, description: d.description.trim(), voice: d.voice, urgency: d.urgency, department: d.department, unit: d.unit || null,
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
    return { ...common, caption: d.caption.trim(),
      gradient: d.photoUrl ? null : (entry?.gradient || STORY_GRADIENTS[Math.floor(Math.random() * STORY_GRADIENTS.length)]),
      likes: entry?.likes || 0, comments: entry?.comments || 0, liked: !!entry?.liked };
  };

  // Anything not submitted is kept as a draft, including when the sheet is just closed.
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

  const description = (text, placeholder) => (
    <div className="field-group">
      <label className="field-label" htmlFor="entry-desc">{text}</label>
      <textarea id="entry-desc" className="textarea" placeholder={placeholder} value={d.description} onChange={(e) => set({ description: e.target.value })} />
      <VoiceNoteField value={d.voice} onChange={setVoice} onRecording={setRecording} showToast={showToast} />
      <p className="field-hint">{d.voice ? "The voice note is saved with this entry. Listen to it later and type it up, or leave it as it is." : "Type it, or record a voice note now and write it up later."}</p>
    </div>
  );
  const photo = (title = <>Photo {optional()}</>) => (
    <div className="field-group">
      <label className="field-label">{title}</label>
      <PhotoUpload photoUrl={d.photoUrl} onChange={(url) => set({ photoUrl: url })} />
    </div>
  );

  let body;
  if (type === "complaint") {
    const personKind = d.source;
    body = (
      <>
        {description("What happened?", "Describe the problem")}
        <div className="field-group">
          <label className="field-label">Urgency</label>
          <div className="seg">
            {["Low", "Medium", "High"].map((u) => (
              <button key={u} type="button" className={`seg-btn ${d.urgency === u ? "active" : ""}`} onClick={() => set({ urgency: u })}>{u}</button>
            ))}
          </div>
        </div>
        {photo()}
        <div className="assign-box" style={{ marginBottom: 0 }}>
          <p className="assign-title">Assign to</p>
          <div className="field-row">
            <div className="field-group" style={{ marginBottom: 12 }}>
              <label className="field-label" htmlFor="entry-unit">{TERMS.unit}</label>
              <select id="entry-unit" className="select" value={d.department} onChange={(e) => set({ department: e.target.value, unit: "" })}>
                <option value="">{`Choose ${lower(TERMS.unit)}…`}</option>
                {departments.map((x) => <option key={x.id}>{x.name}</option>)}
                <option>{UNDEFINED_UNIT}</option>
              </select>
            </div>
            <div className="field-group" style={{ marginBottom: 12 }}>
              <label className="field-label" htmlFor="entry-team">{TERMS.team}</label>
              <select id="entry-team" className="select" value={d.unit} disabled={teams.length === 0} onChange={(e) => set({ unit: e.target.value })}>
                <option value="">{!d.department ? `Choose ${lower(TERMS.unit)} first…` : teams.length ? `Choose ${lower(TERMS.team)}…` : `No ${lower(TERMS.teams)}, the admin routes it`}</option>
                {teams.map((u) => <option key={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <p className="field-hint" style={{ marginTop: -4, marginBottom: 12 }}>Not sure which {lower(TERMS.unit)}? Choose <b>{UNDEFINED_UNIT}</b> and the admin will route it.</p>
        </div>
        <div>
          <button type="button" className="who-toggle" aria-expanded={whoOpen} onClick={() => setWhoOpen((o) => !o)}>
            <span className="tx">Who is it from? {optional("optional")}<small>{personSummary(personKind, d.person)}</small></span>
            {whoOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
          {whoOpen && (
            <div style={{ marginTop: 10 }}>
              <div className="seg" style={{ marginBottom: 12 }}>
                <button type="button" className={`seg-btn ${d.source === "staff" ? "active" : ""}`} onClick={() => set({ source: "staff", person: {} })}>Staff</button>
                <button type="button" className={`seg-btn ${d.source === "member" ? "active" : ""}`} onClick={() => set({ source: "member", person: {} })}>Client</button>
              </div>
              <PersonFields kind={personKind} title={personKind === "member" ? "Client's details" : "Staff member's details"}
                            value={d.person || {}} onChange={(p) => set({ person: p })} departments={departments} />
              <p className="field-hint" style={{ marginTop: -8 }}>Anything left empty is saved as "Not mention".</p>
            </div>
          )}
        </div>
        <label className="consent-row">
          <input type="checkbox" checked={d.consent} onChange={(e) => set({ consent: e.target.checked })} />
          <span>OK to contact them for follow-up<small>Only used for this complaint.</small></span>
        </label>
        <div className="info-banner"><Info size={16} /><span>A complaint goes to the admin as soon as you submit it. Until then it's a draft only you can see.</span></div>
      </>
    );
  } else if (type === "interaction") {
    body = (
      <>
        {description("What did the client say?", "The client's words, in short")}
        <div className="field-group">
          <label className="field-label">Rate each question {optional("(set by your admin; skip any)")}</label>
          {activeQuestions.length === 0 ? (
            <p className="field-hint">No rating questions are switched on yet. An admin adds them under Client questions.</p>
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
        <PersonFields kind="member" title="Client information" value={d.person || {}} onChange={(p) => set({ person: p })} />
        {photo()}
      </>
    );
  } else if (type === "observation") {
    body = (
      <>
        {description("What did you observe?", "Describe what you saw or heard")}
        {photo()}
        <label className="consent-row">
          <input type="checkbox" checked={d.fromStaff} onChange={(e) => set({ fromStaff: e.target.checked })} />
          <span>Was this observation from staff?<small>Tick if a staff member told you or showed you this.</small></span>
        </label>
        {d.fromStaff && (
          <PersonFields kind="staff" title="Staff information" value={d.staff || {}} onChange={(p) => set({ staff: p })} departments={departments} />
        )}
      </>
    );
  } else {
    body = (
      <>
        {photo("Photo")}
        <div className="field-group">
          <label className="field-label" htmlFor="entry-caption">Caption {optional()}</label>
          <textarea id="entry-caption" className="textarea" placeholder="A few words about the picture" value={d.caption} onChange={(e) => set({ caption: e.target.value })} />
        </div>
      </>
    );
  }

  const office = d.place?.office;
  return (
    <Portal>
    <div className="modal-veil" onClick={close}>
      <div className="modal-box entry-sheet" role="dialog" aria-modal="true" aria-label={`${entry ? "Edit draft" : "New"} ${lower(label(type))}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="h-eyebrow" style={{ marginBottom: 2 }}>{entry ? "Draft" : "New"} · <span className="mono">{visit.id}</span></p>
            <h1 className="h-title" style={{ fontSize: 19 }}>{label(type)}</h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {entry && onDelete && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }}
                      onClick={() => (sureDelete ? onDelete() : setSureDelete(true))}>
                <Trash2 size={14} /> {sureDelete ? "Tap again to delete" : "Delete draft"}
              </button>
            )}
            <button type="button" className="modal-close" onClick={close} disabled={recording} aria-label="Close and keep as draft"><X size={15} /></button>
          </div>
        </div>

        <div className="modal-body entry-body">
          {body}
          <div ref={placeRef}>
            <PlacePicker tree={tree} value={d.place} onChange={(place) => set({ place })} suggestions={suggestions} idPrefix="entry-place" />
          </div>
        </div>

        <div className="sheet-foot">
          <button type="button" className={`place-line ${office ? "" : "missing"}`} onClick={() => placeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>
            <MapPin size={15} />
            <span>{office ? <><b>{d.place.officeKind === "branch" ? shortName(office) : office}</b>{placePath(d.place) ? ` · ${placePath(d.place)}` : ""}</> : "No office chosen yet"}</span>
            <span className="pl-change">{office ? "Change" : "Choose"}</span>
          </button>
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
            title="Are you sure you want to submit?"
            confirmLabel="Yes, submit" cancelLabel="Not yet"
            onCancel={() => setConfirm(false)}
            onConfirm={() => { setConfirm(false); onSave(build("submitted"), { submitted: true }); }}
          >
            {type === "complaint"
              ? "It goes to the admin straight away, and you won't be able to edit it after this."
              : "You won't be able to edit it after this."}
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
  const p = e.place || {};
  const draft = e.state === "draft";
  const sent = e.submittedAt ? new Date(e.submittedAt) : null;
  const text = type === "story" ? e.caption : e.description;
  const rated = (e.ratings || []).filter((r) => r.stars > 0);
  return (
    <Portal>
    <div className="modal-veil" onClick={onClose}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-label={label(type)} onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="h-eyebrow" style={{ marginBottom: 2, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {draft ? <span className="pill pill-stale">Draft · never submitted</span> : <span className="pill pill-ok"><Lock size={11} /> Submitted</span>}
              {sent && !draft && <span>{fmtDay(sent)}, {fmtClock(sent)}</span>}
            </p>
            <h1 className="h-title" style={{ fontSize: 19 }}>{label(type)}</h1>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        <div className="modal-body entry-body">
          <div className="view-place">
            <MapPin size={16} />
            <span><b>{p.office || "No office"}</b>{p.officeKind && <small>{OFFICE_KIND_LABEL[p.officeKind]}{placePath(p) ? ` · ${placePath(p)}` : ""}{p.officeKind === "vo" && p.branch ? ` › ${p.branch}` : ""}</small>}</span>
          </div>
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
              {e.status && <span className={`status-pill status-${e.status.replace(/\s/g, "")}`}>{e.status}</span>}
              {e.assignedTo && <span>Assigned to <b>{e.assignedTo}</b>{e.deadline ? ` · due ${new Date(e.deadline).toLocaleDateString()}` : ""}</span>}
            </div>
          )}
          {type === "complaint" && <PersonDetails kind={e.source} person={e.person} consent={e.consent} />}
          {type === "interaction" && <PersonDetails kind="member" person={e.person} />}
          {type === "observation" && (e.fromStaff
            ? <PersonDetails kind="staff" person={e.staff} />
            : <p className="field-hint" style={{ margin: 0 }}>Not from a staff member.</p>)}
          {type === "story" && <p className="field-hint" style={{ margin: 0 }}><Heart size={12} style={{ verticalAlign: -2 }} /> {e.likes || 0} likes on the story feed</p>}
          <p className="field-hint" style={{ margin: 0 }}>{draft ? "This visit is done, so this draft can no longer be sent." : "Submitted entries can't be edited."} <span className="mono">{e.id}</span> · visit <span className="mono">{visit.id}</span></p>
        </div>
      </div>
    </div>
    </Portal>
  );
}

