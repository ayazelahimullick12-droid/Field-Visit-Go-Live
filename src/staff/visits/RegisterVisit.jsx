import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Timer, Check, Trash2, Plus, BedDouble, X } from "lucide-react";
import { REASONS, STAY_TYPES, BLCS, computeDuration, isoDate, countsOf } from "../../lib/visits";
import { makeId } from "../../lib/ids";
import { AreaPicker, OfficeSelector, stopsToPlaces, placesToStops } from "./Places";
import { TimeField } from "./TimePicker";

const BLC = STAY_TYPES[0];
const OTHER_BLC = "__other";
const optional = (t = "(optional)") => <span className="opt">{t}</span>;

/** One accommodation: a BLC (picked from the list or typed), a hotel, a guest house… */
function StayCard({ stay: s, index, onChange, onRemove }) {
  const set = (patch) => onChange({ ...s, ...patch });
  const blcPick = BLCS.includes(s.name) ? s.name : s.other ? OTHER_BLC : "";
  const namePlaceholder = { Hotel: "Hotel name", "Guest house": "Guest house name", "BRAC office": "Office name" }[s.type] || "Accommodation name";
  return (
    <div className="stay-card">
      <div className="stay-head">
        <span className="hub-ico ico-stay"><BedDouble size={17} /></span>
        <b>{s.name || (s.type === BLC ? "BRAC Learning Centre" : s.type) || `Accommodation ${index + 1}`}</b>
        <button type="button" className="icon-btn" onClick={onRemove} aria-label={`Remove accommodation ${index + 1}`}><X size={15} /></button>
      </div>
      <div className="field-row">
        <div className="field-group">
          <label className="field-label" htmlFor={`stay-type-${s.id}`}>Accommodation type</label>
          <select id={`stay-type-${s.id}`} className="select" value={s.type} onChange={(e) => set({ type: e.target.value, name: "", other: false })}>
            {STAY_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor={`stay-name-${s.id}`}>{s.type === BLC ? "BLC" : "Name"}</label>
          {s.type === BLC ? (
            <select id={`stay-name-${s.id}`} className="select" value={blcPick}
                    onChange={(e) => (e.target.value === OTHER_BLC ? set({ name: "", other: true }) : set({ name: e.target.value, other: false }))}>
              <option value="">Select BLC</option>
              {BLCS.map((b) => <option key={b}>{b}</option>)}
              <option value={OTHER_BLC}>Other BLC (enter name)</option>
            </select>
          ) : (
            <input id={`stay-name-${s.id}`} className="input" placeholder={namePlaceholder} value={s.name} onChange={(e) => set({ name: e.target.value })} />
          )}
        </div>
      </div>
      {s.type === BLC && blcPick === OTHER_BLC && (
        <div className="field-group">
          <label className="field-label" htmlFor={`stay-other-${s.id}`}>BLC name</label>
          <input id={`stay-other-${s.id}`} className="input" autoFocus placeholder="e.g. BLC Bogura" value={s.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
      )}
      <div className="field-row">
        <div className="field-group">
          <label className="field-label" htmlFor={`stay-in-${s.id}`}>Check-in date</label>
          <input id={`stay-in-${s.id}`} type="date" className="input" value={s.checkIn} onChange={(e) => set({ checkIn: e.target.value, ...(s.checkOut && s.checkOut < e.target.value ? { checkOut: e.target.value } : {}) })} />
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor={`stay-out-${s.id}`}>Check-out date</label>
          <input id={`stay-out-${s.id}`} type="date" className="input" value={s.checkOut} min={s.checkIn || undefined} onChange={(e) => set({ checkOut: e.target.value })} />
        </div>
      </div>
      <div className="field-group" style={{ marginBottom: 0 }}>
        <label className="field-label" htmlFor={`stay-notes-${s.id}`}>Remarks {optional()}</label>
        <input id={`stay-notes-${s.id}`} className="input" placeholder="Room number, contact person, phone number" value={s.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>
    </div>
  );
}

/**
 * Register a visit (or edit one). Required: the visit area (Division → District → Area) and the
 * visit date. The offices to be visited, times and accommodation are optional and can be added
 * or changed later from the visit page.
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
  const [visitTime, setVisitTime] = useState(visit?.visitTime || "");
  const [returnDate, setReturnDate] = useState(visit?.returnDate || "");
  const [returnTime, setReturnTime] = useState(visit?.returnTime || "");
  const [stays, setStays] = useState(() => (visit?.stays || []).map((s) => ({ ...s })));
  const [sureDelete, setSureDelete] = useState(false);

  const newStay = () => ({ id: makeId("SY"), type: BLC, name: "", checkIn: date, checkOut: returnDate || date, notes: "" });

  // A new area keeps only the offices that still belong to it: regional offices stay within the
  // division, area offices within the district, branches and VOs within the area.
  const changeArea = (next) => {
    const keep = (s) => {
      if (next.division !== route.division) return false;
      if (s.kind === "office" && / Region Office$/.test(s.name)) return true;
      if (s.kind === "office") return next.region === route.region;
      return next.region === route.region && next.area === route.area;
    };
    setRoute({ ...next, stops: route.stops.filter(keep) });
  };

  // Accommodation dates follow the visit dates until they're changed by hand.
  const changeDates = (nextDate, nextReturn) => {
    setStays((list) => list.map((s) => ({
      ...s,
      checkIn: !s.checkIn || s.checkIn === date ? nextDate : s.checkIn,
      checkOut: !s.checkOut || s.checkOut === (returnDate || date) ? nextReturn || nextDate : s.checkOut,
    })));
    setDate(nextDate);
    setReturnDate(nextReturn);
  };

  // "Add times" or "Add accommodation" from the visit page lands straight on that field
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
  const why = !route.division || !route.region || !route.area ? "Select the division, district and area of the visit."
    : !date ? "Select the visit date."
    : reason === "Other" && !reasonOther.trim() ? "Specify the purpose of the visit."
    : returnDate && returnDate < date ? "The return date cannot be before the visit date."
    : allTimes && !duration ? "The return time must be after the start time." : "";
  const later = why ? "" : edit ? "" : "Offices, times and accommodation can be added or updated later from the visit page.";

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
  const canDelete = edit && visit.status !== "done" && onDelete;
  const lost = edit ? [counts.submitted && `${counts.submitted} submitted ${counts.submitted === 1 ? "entry" : "entries"}`, counts.drafts && `${counts.drafts} draft${counts.drafts === 1 ? "" : "s"}`].filter(Boolean).join(" and ") : "";

  return (
    <div className="page-narrow">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 10, paddingLeft: 0 }} onClick={onCancel}>
        <ArrowLeft size={14} /> {edit ? "Back to visit" : "Cancel"}
      </button>

      <div className="wizard-shell">
        <div className="wizard-head">
          <p className="h-eyebrow">{edit ? <>Visit details · <span className="mono">{visit.id}</span></> : "New visit"}</p>
          <h1 className="h-title">{edit ? "Update visit details" : "Register a visit"}</h1>
          <p className="h-desc">
            {edit
              ? "Update the visit location, offices, schedule, purpose or accommodation."
              : "Register a visit on the day or in advance. The visit area and date are required; other details can be added later."}
          </p>
        </div>

        <div className="wizard-body">
          <fieldset className="form-sec">
            <legend>Visit location</legend>
            <AreaPicker tree={tree} value={route} onChange={changeArea} idPrefix="reg" />
          </fieldset>

          <fieldset className="form-sec">
            <legend>Offices to be visited {optional()}</legend>
            <OfficeSelector tree={tree} division={route.division} region={route.region} area={route.area}
                            value={stopsToPlaces(route)} onChange={(places) => setRoute({ ...route, stops: placesToStops(places) })} idPrefix="reg" />
          </fieldset>

          <fieldset className="form-sec">
            <legend>Purpose of visit</legend>
            <div className="field-group">
              <label className="field-label" htmlFor="reg-reason">Purpose <span className="req">*</span></label>
              <select id="reg-reason" className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            {reason === "Other" && (
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label className="field-label" htmlFor="reg-reasonOther">Specify purpose <span className="req">*</span></label>
                <input id="reg-reasonOther" className="input" autoFocus={!edit || !visit.reasonOther} placeholder="Purpose of the visit" value={reasonOther} onChange={(e) => setReasonOther(e.target.value)} maxLength={120} />
              </div>
            )}
          </fieldset>

          <fieldset className="form-sec">
            <legend>Schedule</legend>
            <div className="field-row">
              <div className="field-group">
                <label className="field-label" htmlFor="reg-date">Visit date <span className="req">*</span></label>
                <input id="reg-date" type="date" className="input" value={date}
                       onChange={(e) => changeDates(e.target.value, returnDate && returnDate < e.target.value ? e.target.value : returnDate)} />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="reg-visitTime">Start time {optional()}</label>
                <TimeField id="reg-visitTime" label="Start time" value={visitTime} onChange={setVisitTime} />
              </div>
            </div>
            <div className="field-row">
              <div className="field-group">
                <label className="field-label" htmlFor="reg-returnDate">Return date {optional()}</label>
                <input id="reg-returnDate" type="date" className="input" value={returnDate} min={date || undefined} onChange={(e) => changeDates(date, e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="reg-returnTime">Return time {optional()}</label>
                <TimeField id="reg-returnTime" label="Return time" value={returnTime}
                           onChange={(t) => { setReturnTime(t); if (t && !returnDate) changeDates(date, date); }} />
              </div>
            </div>
            <div className="field-group" style={{ marginBottom: 0 }}>
              <label className="field-label">Duration</label>
              <div className={`duration-display ${duration ? "filled" : allTimes ? "invalid" : ""}`}>
                <Timer size={14} />
                {duration || (allTimes ? "The return time must be after the start time" : "Calculated when start and return times are entered")}
              </div>
            </div>
          </fieldset>

          {/* Optional: hidden until asked for. */}
          <div className="stay-sec">
            {stays.length === 0 ? (
              <button type="button" id="reg-stay" className="add-optional" onClick={() => setStays([newStay()])}>
                <span className="hub-ico ico-stay"><BedDouble size={18} /></span>
                <span className="ao-text"><b>Add accommodation</b><small>Optional · for overnight visits, e.g. a BRAC Learning Centre (BLC)</small></span>
                <Plus size={18} />
              </button>
            ) : (
              <fieldset className="form-sec">
                <legend>Accommodation {optional()}</legend>
                {stays.map((s, i) => (
                  <StayCard key={s.id} stay={s} index={i}
                            onChange={(next) => setStays((list) => list.map((x) => (x.id === s.id ? next : x)))}
                            onRemove={() => setStays((list) => list.filter((x) => x.id !== s.id))} />
                ))}
                <button type="button" id="reg-stay" className="link-btn" onClick={() => setStays((list) => [...list, { ...newStay(), checkIn: list[list.length - 1]?.checkOut || date }])}>
                  <Plus size={13} style={{ verticalAlign: -2 }} /> Add another accommodation
                </button>
              </fieldset>
            )}
          </div>

          {canDelete && (
            <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)", paddingLeft: 0, marginTop: 18 }} onClick={() => (sureDelete ? onDelete() : setSureDelete(true))}>
              <Trash2 size={14} /> {sureDelete ? `Select again to delete this visit${lost ? ` and its ${lost}` : ""}. This cannot be undone.` : "Delete visit"}
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
