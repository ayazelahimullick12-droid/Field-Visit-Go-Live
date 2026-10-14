import React, { useEffect, useRef, useState } from "react";
import { X, Building2, Users, Check, MapPin, ChevronDown } from "lucide-react";
import { voName, voBranch, placeOfStop, shortName } from "../../lib/visits";

/* Where a visit goes, and which offices each entry is about.
   A visit is registered for one Division → District → Area (from the admin's Offices list).
   Within it, the offices are picked from three lists — Regional Offices (all in the division),
   Area Offices (all in the district) and Branch Offices (all in the area) — several of each,
   and village organisations (VOs) are typed in as codes under a chosen branch. */

export const regionOfficeName = (district) => `${district} Region Office`;
export const areaOfficeName = (area) => `${area} Office`;
export const KIND_TITLE = { region: "Regional Office", area: "Area Office", branch: "Branch Office" };

/** The three lists of offices that can be picked for a visit's division / district / area. */
export function officeOptions(tree, division, region, area) {
  const districts = tree[division] || {};
  const areas = districts[region] || {};
  return {
    region: Object.keys(districts).map((r) => ({ division, region: r, area: "", office: regionOfficeName(r), officeKind: "region", branch: "" })),
    area: Object.keys(areas).map((a) => ({ division, region, area: a, office: areaOfficeName(a), officeKind: "area", branch: "" })),
    branch: (areas[area] || []).map((b) => ({ division, region, area, office: b, officeKind: "branch", branch: b })),
  };
}

/** A visit's planned stops <-> the place objects the office selector works with. */
export const stopsToPlaces = (v) => (v.stops || []).map((s) => placeOfStop(s, v));
export const placesToStops = (places) => places.map((p) => ({
  kind: p.officeKind === "branch" ? "branch" : p.officeKind === "vo" ? "vo" : "office",
  name: p.office, division: p.division, region: p.region, area: p.area,
}));

/* ------------------------------ Division → District → Area ------------------------------ */

export function AreaPicker({ tree, value, onChange, idPrefix = "loc" }) {
  const { division = "", region = "", area = "" } = value;
  const districts = division ? Object.keys(tree[division] || {}) : [];
  const areas = division && region ? Object.keys((tree[division] || {})[region] || {}) : [];
  return (
    <div className="area-grid">
      <div className="field-group">
        <label className="field-label" htmlFor={`${idPrefix}-division`}>Division <span className="req">*</span></label>
        <select id={`${idPrefix}-division`} className="select" value={division} onChange={(e) => onChange({ division: e.target.value, region: "", area: "" })}>
          <option value="">Select division</option>
          {Object.keys(tree).map((d) => <option key={d}>{d}</option>)}
        </select>
      </div>
      <div className="field-group">
        <label className="field-label" htmlFor={`${idPrefix}-region`}>District <span className="req">*</span></label>
        <select id={`${idPrefix}-region`} className="select" value={region} disabled={!division} onChange={(e) => onChange({ division, region: e.target.value, area: "" })}>
          <option value="">{division ? "Select district" : "Select a division first"}</option>
          {districts.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>
      <div className="field-group">
        <label className="field-label" htmlFor={`${idPrefix}-area`}>Area <span className="req">*</span></label>
        <select id={`${idPrefix}-area`} className="select" value={area} disabled={!region} onChange={(e) => onChange({ division, region, area: e.target.value })}>
          <option value="">{region ? "Select area" : "Select a district first"}</option>
          {areas.map((a) => <option key={a}>{a}</option>)}
        </select>
      </div>
    </div>
  );
}

/* ------------------------------ a dropdown with checkboxes ------------------------------ */

function MultiSelect({ id, label, options, selected, onToggle, disabled, placeholder, emptyText, single = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [open]);
  const chosen = options.filter((o) => selected.includes(o.office));
  const text = chosen.length === 0 ? placeholder : chosen.length === 1 ? chosen[0].office : `${chosen.length} selected`;
  return (
    <div className="field-group ms" ref={ref}>
      <label className="field-label" htmlFor={id}>{label}</label>
      <button type="button" id={id} className={`select ms-trigger ${chosen.length ? "has" : ""}`} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="ms-text">{text}</span><ChevronDown size={15} />
      </button>
      {open && (
        <div className="ms-pop" role="listbox" aria-multiselectable="true" aria-label={label}>
          {options.length === 0 ? <div className="ms-empty">{emptyText}</div> : options.map((o) => {
            const on = selected.includes(o.office);
            return (
              <button type="button" key={o.office} role="option" aria-selected={on} className={`ms-opt ${on ? "on" : ""}`} onClick={() => { onToggle(o); if (single) setOpen(false); }}>
                <span className={`ms-check ${single ? "radio" : ""}`}>{on && <Check size={12} strokeWidth={3} />}</span>
                <span>{o.office}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ VO codes under a branch ------------------------------ */

const normCode = (raw) => raw.trim().toUpperCase().replace(/\s+/g, "-");

function VoCodes({ branch, codes, onAdd, onRemove, idPrefix, max = Infinity }) {
  const [text, setText] = useState("");
  const add = () => {
    const parts = text.split(/[,;\n]/).map(normCode).filter(Boolean);
    parts.slice(0, Math.max(0, max - codes.length)).forEach((c) => { if (!codes.includes(c)) onAdd(c); });
    setText("");
  };
  return (
    <div className="vo-row">
      <label className="field-label" htmlFor={`${idPrefix}-vo-${branch}`}>{max === 1 ? "VO code" : "VO codes"} · {shortName(branch)} <span className="opt">(optional)</span></label>
      <div className="tag-input">
        {codes.map((c) => (
          <span key={c} className="tag-chip"><Users size={11} /> {c}
            <button type="button" onClick={() => onRemove(c)} aria-label={`Remove VO ${c}`}><X size={11} /></button>
          </span>
        ))}
        {codes.length < max && <input id={`${idPrefix}-vo-${branch}`} value={text} placeholder={codes.length ? "Add another code" : "Enter a VO code, e.g. VO-142"}
               onChange={(e) => setText(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } else if (e.key === "Backspace" && !text && codes.length) onRemove(codes[codes.length - 1]); }}
               onBlur={add} />}
      </div>
    </div>
  );
}

/* ------------------------------ the office selector ------------------------------ */

/**
 * Regional, Area and Branch Offices side by side (several of each), then VO codes under each
 * chosen branch. `kinds` limits which lists show (client interactions: branches and VOs only).
 * `single`: exactly one office (regional, area or branch), plus at most one VO under a branch.
 * `value` / onChange: an array of places { division, region, area, office, officeKind, branch }.
 */
export function OfficeSelector({ tree, division, region, area, value, onChange, kinds = ["region", "area", "branch"], idPrefix = "ofc", single = false }) {
  const opts = officeOptions(tree, division, region, area);
  const names = value.map((p) => p.office);
  const toggle = (o) => {
    if (names.includes(o.office)) {
      // removing a branch also removes the VOs under it
      onChange(value.filter((p) => p.office !== o.office && !(o.officeKind === "branch" && p.officeKind === "vo" && p.branch === o.office)));
    } else onChange(single ? [o] : [...value, o]);
  };
  const branches = value.filter((p) => p.officeKind === "branch");
  const vosOf = (b) => value.filter((p) => p.officeKind === "vo" && p.branch === b).map((p) => p.office.split(" · ")[0]);
  const addVo = (b, code) => {
    const base = branches.find((p) => p.office === b) || {};
    const kept = single ? value.filter((p) => p.officeKind !== "vo") : value;
    onChange([...kept, { division: base.division, region: base.region, area: base.area, office: voName(code, b), officeKind: "vo", branch: b }]);
  };
  const removeVo = (b, code) => onChange(value.filter((p) => p.office !== voName(code, b)));
  // offices chosen earlier that aren't in today's lists (e.g. the visit's area was changed) stay visible and removable
  const listed = new Set([...opts.region, ...opts.area, ...opts.branch].map((o) => o.office));
  const stray = value.filter((p) => p.officeKind !== "vo" ? !listed.has(p.office) : !names.includes(voBranch(p.office)));

  if (!area) return <p className="field-hint" style={{ margin: 0 }}>Select the visit's division, district and area first.</p>;
  const shown = kinds.filter((k) => ["region", "area", "branch"].includes(k));
  return (
    <div className="office-sel">
      <div className={`office-grid cols-${shown.length}`}>
        {shown.includes("region") && <MultiSelect id={`${idPrefix}-ro`} label={KIND_TITLE.region} options={opts.region} selected={names} onToggle={toggle} placeholder={single ? "Select regional office" : "Select regional offices"} single={single} emptyText="No regional offices in this division." />}
        {shown.includes("area") && <MultiSelect id={`${idPrefix}-ao`} label={KIND_TITLE.area} options={opts.area} selected={names} onToggle={toggle} placeholder={single ? "Select area office" : "Select area offices"} single={single} emptyText="No area offices in this district." />}
        {shown.includes("branch") && <MultiSelect id={`${idPrefix}-bo`} label={KIND_TITLE.branch} options={opts.branch} selected={names} onToggle={toggle} placeholder={single ? "Select branch office" : "Select branch offices"} single={single} emptyText="No branch offices in this area." />}
      </div>
      {branches.length > 0 && (
        <div className="vo-box">
          {branches.map((b) => <VoCodes key={b.office} idPrefix={idPrefix} branch={b.office} max={single ? 1 : Infinity} codes={vosOf(b.office)} onAdd={(c) => addVo(b.office, c)} onRemove={(c) => removeVo(b.office, c)} />)}
        </div>
      )}
      {value.length > 0 && (
        <div className="sel-chips" aria-label="Selected offices">
          {value.map((p) => (
            <span key={p.office} className={`sel-chip ${p.officeKind}`}>
              {p.officeKind === "vo" ? <Users size={12} /> : <Building2 size={12} />}
              {p.officeKind === "branch" ? shortName(p.office) : p.office}
              {stray.includes(p) && <em> · outside this area</em>}
              <button type="button" aria-label={`Remove ${p.office}`} onClick={() => toggle(p)}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ read-only summary ------------------------------ */

/** The visit's area and one chip per planned office. */
export function RouteSummary({ visit: v, empty = "Location not set", showNone = true }) {
  const path = [v.division, v.region, v.area].filter(Boolean);
  return (
    <div className="route-sum">
      <div className="rs-path">
        <MapPin size={14} />
        {path.length ? path.map((p, i) => <React.Fragment key={p}>{i > 0 && <span className="rs-sep">›</span>}<span>{p}</span></React.Fragment>) : <span className="muted">{empty}</span>}
      </div>
      {(v.stops || []).length > 0 ? (
        <div className="rs-stops">
          {v.stops.map((s) => (
            <span key={s.name} className={`rs-stop ${s.kind}`}>
              <span className="rs-dot">{s.kind === "vo" ? <Users size={11} /> : <Building2 size={11} />}</span>
              {s.kind === "branch" ? shortName(s.name) : s.name}
            </span>
          ))}
        </div>
      ) : showNone ? (
        <div className="rs-none">No offices selected yet</div>
      ) : null}
    </div>
  );
}
