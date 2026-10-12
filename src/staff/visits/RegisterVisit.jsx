import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Timer, Check, Trash2, Plus, BedDouble, X } from "lucide-react";
import { REASONS, STAY_TYPES, BLCS, computeDuration, isoDate, hhmm, countsOf } from "../../lib/visits";
import { makeId } from "../../lib/ids";
import { RouteEditor } from "./Places";
import { TimeField } from "./TimePicker";

const BLC = STAY_TYPES[0];
const OTHER_BLC = "__other";
const optional = (t) => <span style={{ fontWeight: 500, color: "var(--ink-faint)" }}>{t}</span>;

/** One place to stay: a BLC (picked from the list or typed), a hotel, a guest house… */
function StayCard({ stay: s, index, onChange, onRemove }) {
  const set = (patch) => onChange({ ...s, ...patch });
  const blcPick = BLCS.includes(s.name) ? s.name : s.other ? OTHER_BLC : "";
  const namePlaceholder = { Hotel: "Name of the hotel", "Guest house": "Name of the guest house", "BRAC office": "Which office" }[s.type] || "Where you're staying";
  return (
    <div className="stay-card">
      <div className="stay-head">
        <span className="hub-ico ico-stay"><BedDouble size={17} /></span>
        <b>{s.name || (s.type === BLC ? "BRAC Learning Centre" : s.type) || `Stay ${index + 1}`}</b>
        <button type="button" className="icon-btn" onClick={onRemove} aria-label={`Remove stay ${index + 1}`}><X size={15} /></button>
      </div>
      <div className="field-row">
        <div className="field-group">
          <label className="field-label" htmlFor={`stay-type-${s.id}`}>Type of place</label>
          <select id={`stay-type-${s.id}`} className="select" value={s.type} onChange={(e) => set({ type: e.target.value, name: "", other: false })}>
            {STAY_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor={`stay-name-${s.id}`}>{s.type === BLC ? "Which BLC" : "Name"}</label>
          {s.type === BLC ? (
            <select id={`stay-name-${s.id}`} className="select" value={blcPick}
                    onChange={(e) => (e.target.value === OTHER_BLC ? set({ name: "", other: true }) : set({ name: e.target.value, other: false }))}>
              <option value="">Select BLC…</option>
              {BLCS.map((b) => <option key={b}>{b}</option>)}
              <option value={OTHER_BLC}>Another BLC (type the name)</option>
            </select>
          ) : (
            <input id={`stay-name-${s.id}`} className="input" placeholder={namePlaceholder} value={s.name} onChange={(e) => set({ name: e.target.value })} />
          )}
        </div>
      </div>
      {s.type === BLC && blcPick === OTHER_BLC && (
        <div className="field-group">
          <label className="field-label" htmlFor={`stay-other-${s.id}`}>Name of the BLC</label>
          <input id={`stay-other-${s.id}`} className="input" autoFocus placeholder="e.g. BLC Bogura" value={s.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
      )}
      <div className="field-row">
        <div className="field-group">
          <label className="field-label" htmlFor={`stay-in-${s.id}`}>Check-in</label>
          <input id={`stay-in-${s.id}`} type="date" className="input" value={s.checkIn} onChange={(e) => set({ checkIn: e.target.value, ...(s.checkOut && s.checkOut < e.target.value ? { checkOut: e.target.value } : {}) })} />
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor={`stay-out-${s.id}`}>Check-out</label>
          <input id={`stay-out-${s.id}`} type="date" className="input" value={s.checkOut} min={s.checkIn || undefined} onChange={(e) => set({ checkOut: e.target.value })} />
        </div>
      </div>
      <div className="field-group" style={{ marginBottom: 0 }}>
        <label className="field-label" htmlFor={`stay-notes-${s.id}`}>Notes {optional("(optional)")}</label>
        <input id={`stay-notes-${s.id}`} className="input" placeholder="Room number, contact person, phone…" value={s.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>
    </div>
  );
}

/**
 * Register a visit (or edit one). Only the visiting date is needed to register:
 * where you're going (Division, Region, Area and the branches and offices on your
 * route), the times, and where you're staying can all be added or changed later,
 * on the visit page too.
 */
export default function RegisterVisit({ tree, visit, prefill, focusField, onSave, onCancel, onDelete }) {
  const edit = !!visit;
  const now = useMemo(() => new Date(), []);

  const [route, setRoute] = useState(() => {
    if (visit) return { division: visit.division || "", region: visit.region || "", area: visit.area || "", stops: (visit.stops || []).map((s) => ({ ...s })) };
    if (prefill) return { division: prefill.division, region: prefill.district, area: prefill.area, stops: [{ kind: "branch", name: prefill.name, division: prefill.division, region: prefill.district, area: prefill.area }] };
    return { division: "", region: "", area: "", stops: [] };
  });
  const [reason, setReason] = useState(visit?.reason || "Monitoring");
  const [reasonOther, setReasonOther] = useState(visit?.reasonOther || "");
  const [date, setDate] = useState(visit?.date || isoDate(now));
  const [visitTime, setVisitTime] = useState(visit ? visit.visitTime || "" : hhmm(now));
  const [returnDate, setReturnDate] = useState(visit?.returnDate || "");
  const [returnTime, setReturnTime] = useState(visit?.returnTime || "");
  const [stays, setStays] = useState(() => (visit?.stays || []).map((s) => ({ ...s })));
  const [sureDelete, setSureDelete] = useState(false);

  const newStay = () => ({ id: makeId("SY"), type: BLC, name: "", checkIn: date, checkOut: returnDate || date, notes: "" });

  // Stay dates follow the visit dates until they're changed by hand.
  const changeDates = (nextDate, nextReturn) => {
    setStays((list) => list.map((s) => ({
      ...s,
      checkIn: !s.checkIn || s.checkIn === date ? nextDate : s.checkIn,
      checkOut: !s.checkOut || s.checkOut === (returnDate || date) ? nextReturn || nextDate : s.checkOut,
    })));
    setDate(nextDate);
    setReturnDate(nextReturn);
  };

  // "Add times" or "Add where you're staying" from the visit page lands straight on that field
  useEffect(() => {
    if (!focusField) return;
    if (focusField === "stay" && stays.length === 0) setStays([newStay()]);
    setTimeout(() => {
      const el = document.getElementById(`reg-${focusField}`);
      if (el) { el.scrollIntoView({ block: "center" }); el.focus({ preventScroll: true }); }
    }, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusField]);

  const allTimes = !!(date && visitTime && returnDate && returnTime);
  const duration = computeDuration(date, visitTime, returnDate, returnTime);
  const why = !date ? "Choose the visiting date."
    : reason === "Other" && !reasonOther.trim() ? "Type the reason for the visit."
    : returnDate && returnDate < date ? "The returning date is before the visiting date."
    : allTimes && !duration ? "Returning time must be after visiting time." : "";
  const later = why ? "" : edit ? "" : "Only the visiting date is needed now. The rest can be added later, even on the way back.";

  const save = () => {
    if (why) return;
    onSave({
      ...route,
      reason, reasonOther: reason === "Other" ? reasonOther.trim() : "",
      date, visitTime, returnDate, returnTime,
      stays: stays.filter((s) => s.name.trim() || s.notes.trim()).map(({ other, ...s }) => ({ ...s, name: s.name.trim(), notes: s.notes.trim() })),
    });
  };

  const counts = edit ? countsOf(visit) : null;
  const canDelete = edit && visit.status !== "done" && counts.submitted === 0 && onDelete;

  return (
    <div className="page-narrow">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 10, paddingLeft: 0 }} onClick={onCancel}>
        <ArrowLeft size={14} /> {edit ? "Back to the visit" : "Cancel"}
      </button>

      <div className="wizard-shell">
        <div className="wizard-head">
          <p className="h-eyebrow">{edit ? <>Edit visit · <span className="mono">{visit.id}</span></> : "New visit"}</p>
          <h1 className="h-title">{edit ? "Edit visit" : "Register visit"}</h1>
          <p className="h-desc">
            {edit
              ? "Change where you're going, the dates and times, the reason or where you're staying."
              : "Register on the day or days ahead. Only the visiting date is needed now; everything else can wait."}
          </p>
        </div>

        <div className="wizard-body">
          <p className="reg-sec">Where you're going {optional("· optional, can be added later")}</p>
          <RouteEditor tree={tree} value={route} onChange={setRoute} />

          <p className="reg-sec">Why</p>
          <div className="field-group">
            <label className="field-label" htmlFor="reg-reason">Reason for visit</label>
            <select id="reg-reason" className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          {reason === "Other" && (
            <div className="field-group">
              <label className="field-label" htmlFor="reg-reasonOther">Type the reason</label>
              <input id="reg-reasonOther" className="input" autoFocus={!edit || !visit.reasonOther} placeholder="What is this visit for?" value={reasonOther} onChange={(e) => setReasonOther(e.target.value)} maxLength={120} />
            </div>
          )}

          <p className="reg-sec">When</p>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label" htmlFor="reg-date">Visiting date</label>
              <input id="reg-date" type="date" className="input" value={date}
                     onChange={(e) => changeDates(e.target.value, returnDate && returnDate < e.target.value ? e.target.value : returnDate)} />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="reg-visitTime">Visiting time {optional("(can wait)")}</label>
              <TimeField id="reg-visitTime" label="Visiting time" value={visitTime} onChange={setVisitTime} />
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label" htmlFor="reg-returnDate">Returning date {optional("(can wait)")}</label>
              <input id="reg-returnDate" type="date" className="input" value={returnDate} min={date || undefined} onChange={(e) => changeDates(date, e.target.value)} />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="reg-returnTime">Returning time {optional("(can wait)")}</label>
              <TimeField id="reg-returnTime" label="Returning time" value={returnTime}
                         onChange={(t) => { setReturnTime(t); if (t && !returnDate) changeDates(date, date); }} />
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">Expected duration</label>
            <div className={`duration-display ${duration ? "filled" : allTimes ? "invalid" : ""}`}>
              <Timer size={14} />
              {duration || (allTimes ? "Returning time must be after visiting time" : "Worked out once the returning time is added")}
            </div>
          </div>

          {/* Optional, like adding a hotel to a trip request: hidden until asked for. */}
          <div className="stay-sec">
            {stays.length === 0 ? (
              <button type="button" id="reg-stay" className="add-optional" onClick={() => setStays([newStay()])}>
                <span className="hub-ico ico-stay"><BedDouble size={18} /></span>
                <span className="ao-text"><b>Add where you're staying</b><small>Optional · for overnight visits, e.g. at a BRAC Learning Centre (BLC)</small></span>
                <Plus size={18} />
              </button>
            ) : (
              <>
                <p className="reg-sec" style={{ marginTop: 0 }}>Where you're staying {optional("· optional")}</p>
                {stays.map((s, i) => (
                  <StayCard key={s.id} stay={s} index={i}
                            onChange={(next) => setStays((list) => list.map((x) => (x.id === s.id ? next : x)))}
                            onRemove={() => setStays((list) => list.filter((x) => x.id !== s.id))} />
                ))}
                <button type="button" id="reg-stay" className="link-btn" onClick={() => setStays((list) => [...list, { ...newStay(), checkIn: list[list.length - 1]?.checkOut || date }])}>
                  <Plus size={13} style={{ verticalAlign: -2 }} /> Add another place to stay
                </button>
              </>
            )}
          </div>

          {canDelete && (
            <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)", paddingLeft: 0, marginTop: 18 }} onClick={() => (sureDelete ? onDelete() : setSureDelete(true))}>
              <Trash2 size={14} /> {sureDelete ? `Tap again to delete this visit${counts.drafts ? ` and its ${counts.drafts} draft${counts.drafts === 1 ? "" : "s"}` : ""}` : "Delete this visit"}
            </button>
          )}
        </div>

        <div className="wizard-foot" style={{ position: "static", flexWrap: "wrap" }}>
          <span className="field-hint" style={{ margin: 0, flex: "1 1 220px" }}>{why || later}</span>
          <button className="btn btn-primary" onClick={save} disabled={!!why}>
            <Check size={15} /> {edit ? "Save changes" : "Register visit"}
          </button>
        </div>
      </div>
    </div>
  );
}
