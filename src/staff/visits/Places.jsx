import React, { useState } from "react";
import { X, Building2, Users, Check, Plus, MapPin } from "lucide-react";
import { VILLAGE_ORGS, voBranch, vosUnder, OFFICE_KIND_LABEL, placePath, shortName } from "../../lib/visits";
import Portal from "../../lib/Portal";

/* Where a visit goes, and which office each entry is about. The office tree is
   Division → Region → Area → Branch (from the admin's Offices list); every area
   and region also has its own office, and VOs sit under their branch. */

const emptyStop = () => ({ kind: "branch", name: "", division: "", region: "", area: "" });

/** division → region → area of a branch, from the office tree. */
export function pathOf(tree, branchName) {
  for (const [division, regions] of Object.entries(tree)) {
    for (const [region, areas] of Object.entries(regions)) {
      for (const [area, branches] of Object.entries(areas)) {
        if (branches.includes(branchName)) return { division, region, area };
      }
    }
  }
  return null;
}

/**
 * Division, Region, Area and the offices on the route (branches like stops on a
 * ride, plus area / region offices and VOs). Everything here is optional and can
 * be changed at any time. Calls onChange({ division, region, area, stops }) with
 * only the stops that have been chosen.
 */
export function RouteEditor({ tree, value, onChange, idPrefix = "reg", compact = false }) {
  const [division, setDivisionState] = useState(value.division || "");
  const [region, setRegionState] = useState(value.region || "");
  const [area, setAreaState] = useState(value.area || "");
  const [stops, setStopsState] = useState(() => (value.stops?.length ? value.stops.map((s) => ({ ...s })) : [emptyStop()]));
  const [modal, setModal] = useState(null); // { type: "area" | "regional" | "vo", choice }

  const emit = (patch) => {
    const next = { division, region, area, stops, ...patch };
    onChange({ division: next.division, region: next.region, area: next.area, stops: next.stops.filter((s) => s.name) });
  };
  const setStops = (fn) => { const next = fn(stops); setStopsState(next); emit({ stops: next }); };

  const regions = division ? Object.keys(tree[division] || {}) : [];
  const areas = division && region ? Object.keys((tree[division] || {})[region] || {}) : [];
  const areasInRegion = (tree[division] || {})[region] || {};
  const taken = stops.map((s) => s.name).filter(Boolean);

  const keepNonBranch = (list) => {
    const rest = list.filter((s) => s.kind !== "branch" && s.name);
    return rest.length ? [emptyStop(), ...rest] : [emptyStop()];
  };
  const changeDivision = (v) => {
    const next = keepNonBranch(stops);
    setDivisionState(v); setRegionState(""); setAreaState(""); setStopsState(next);
    emit({ division: v, region: "", area: "", stops: next });
  };
  const changeRegion = (v) => {
    const next = keepNonBranch(stops);
    setRegionState(v); setAreaState(""); setStopsState(next);
    emit({ region: v, area: "", stops: next });
  };
  const changeArea = (v) => { setAreaState(v); emit({ area: v }); };
  const setStop = (i, name) => {
    const p = pathOf(tree, name) || { division, region, area };
    setStops((list) => list.map((s, j) => (j === i ? { kind: "branch", name, ...p } : s)));
  };
  const removeStop = (i) => setStops((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : [emptyStop()]));

  // Area offices: only those under the selected Division / Region. Region offices: only
  // those in the selected Division. VOs: only those under the branches on the route.
  const officeOptions = (type) => {
    const divisions = division ? [division] : Object.keys(tree);
    if (type === "area") {
      return divisions.flatMap((d) => Object.entries(tree[d] || {})
        .filter(([r]) => !region || r === region)
        .flatMap(([r, as]) => Object.keys(as).map((a) => ({ kind: "office", name: `${a} Office`, division: d, region: r, area: a }))));
    }
    if (type === "regional") {
      return divisions.flatMap((d) => Object.keys(tree[d] || {})
        .filter((r) => !region || r === region)
        .map((r) => ({ kind: "office", name: `${r} Region Office`, division: d, region: r, area: "" })));
    }
    const onRoute = stops.filter((s) => s.kind === "branch" && s.name);
    return VILLAGE_ORGS
      .map((vo) => ({ vo, branch: onRoute.find((s) => s.name === voBranch(vo)) }))
      .filter((x) => x.branch)
      .map(({ vo, branch }) => ({ kind: "vo", name: vo, division: branch.division, region: branch.region, area: branch.area }));
  };
  const addOffice = () => {
    const opt = officeOptions(modal.type).find((o) => o.name === modal.choice);
    if (!opt) return;
    setStops((list) => (list.length === 1 && !list[0].name ? [opt] : [...list, opt]));
    setModal(null);
  };

  const hint = (t) => <span style={{ fontWeight: 500, color: "var(--ink-faint)" }}>{t}</span>;

  return (
    <div className={`route-editor ${compact ? "compact" : ""}`}>
      <div className="re-loc">
        <div className="field-group">
          <label className="field-label" htmlFor={`${idPrefix}-division`}>Division</label>
          <select id={`${idPrefix}-division`} className="select" value={division} onChange={(e) => changeDivision(e.target.value)}>
            <option value="">Select division…</option>
            {Object.keys(tree).map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor={`${idPrefix}-region`}>Region</label>
          <select id={`${idPrefix}-region`} className="select" value={region} disabled={!division} onChange={(e) => changeRegion(e.target.value)}>
            <option value="">{division ? "Select region…" : "Division first"}</option>
            {regions.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor={`${idPrefix}-area`}>Area</label>
          <select id={`${idPrefix}-area`} className="select" value={area} disabled={!region} onChange={(e) => changeArea(e.target.value)}>
            <option value="">{region ? "Select area…" : "Region first"}</option>
            {areas.map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">Branches {hint("(your route, in any order)")}</label>
        <div className="stop-list">
          {stops.map((s, i) => (
            <div className="stop-row" key={i}>
              <span className={`stop-dot ${s.kind !== "branch" ? "office" : ""}`}>{s.kind === "branch" ? i + 1 : s.kind === "vo" ? <Users size={14} /> : <Building2 size={14} />}</span>
              {s.kind === "branch" ? (
                <select className="select" aria-label={`Branch ${i + 1}`} value={s.name} disabled={!area} onChange={(e) => setStop(i, e.target.value)}>
                  <option value="">{area ? "Select branch…" : "Select an area first"}</option>
                  {s.name && !area && <option value={s.name}>{s.name}</option>}
                  {area && [area, ...Object.keys(areasInRegion).filter((a) => a !== area)].map((a, k) => (
                    <optgroup key={a} label={k === 0 ? `${a} (selected area)` : a}>
                      {(areasInRegion[a] || []).map((b) => {
                        const used = taken.includes(b) && b !== s.name;
                        return <option key={b} value={b} disabled={used}>{b}{used ? " · added" : ""}</option>;
                      })}
                    </optgroup>
                  ))}
                </select>
              ) : (
                <div className="stop-fixed">{s.kind === "vo" ? <Users size={16} /> : <Building2 size={16} />}<span>{s.name}</span></div>
              )}
              {stops.length > 1 || s.name ? (
                <button type="button" className="icon-btn" onClick={() => removeStop(i)} aria-label={`Remove ${s.name || `stop ${i + 1}`}`}><X size={16} /></button>
              ) : <span />}
            </div>
          ))}
          <div className="stop-row">
            <span className="stop-dot add"><Plus size={14} /></span>
            <button type="button" className="stop-add" disabled={!area} onClick={() => setStops((l) => [...l, emptyStop()])}>Add another branch</button>
            <span />
          </div>
        </div>
      </div>

      <div className="loc-office-row">
        <button type="button" className="loc-office-btn" onClick={() => setModal({ type: "area", choice: "" })}>
          <Building2 size={13} /> Visiting an Area/Region Office or Village Organisation too?
        </button>
      </div>

      {modal && (
        <Portal>
        <div className="modal-veil" onClick={() => setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 460 }} role="dialog" aria-modal="true" aria-label="Add an office or village organisation" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h1 className="h-title" style={{ fontSize: 17 }}>Add an office or VO</h1>
              <button type="button" className="modal-close" onClick={() => setModal(null)} aria-label="Close"><X size={15} /></button>
            </div>
            <div className="modal-body">
              <div className="field-group">
                <label className="field-label">Office type</label>
                <div className="seg">
                  {[["area", "Area Office"], ["regional", "Region Office"], ["vo", "Village Org"]].map(([k, label]) => (
                    <button key={k} type="button" className={`seg-btn ${modal.type === k ? "active" : ""}`} onClick={() => setModal({ type: k, choice: "" })}>{label}</button>
                  ))}
                </div>
              </div>
              {(() => {
                const options = officeOptions(modal.type);
                const branchesOnRoute = stops.filter((s) => s.kind === "branch" && s.name).map((s) => s.name);
                if (!options.length) {
                  return (
                    <p className="field-hint" style={{ fontSize: 13, marginBottom: 18 }}>
                      {modal.type === "vo"
                        ? branchesOnRoute.length
                          ? `No village organisations are listed under ${branchesOnRoute.join(", ")}.`
                          : "Add a branch to your route first. Village organisations are listed under the branches you visit."
                        : "No offices match the division and region you selected."}
                    </p>
                  );
                }
                return (
                  <div className="field-group">
                    <label className="field-label" htmlFor={`${idPrefix}-office-choice`}>{modal.type === "vo" ? "Village organisation" : "Office"}</label>
                    <select id={`${idPrefix}-office-choice`} className="select" value={modal.choice} onChange={(e) => setModal((m) => ({ ...m, choice: e.target.value }))}>
                      <option value="">Select…</option>
                      {options.map((o) => <option key={o.name} value={o.name} disabled={taken.includes(o.name)}>{o.name}{taken.includes(o.name) ? " · added" : ""}</option>)}
                    </select>
                    <p className="field-hint">
                      {modal.type === "vo" ? "Showing the VOs under the branches on your route."
                        : modal.type === "area" ? (region ? `Showing area offices in ${region}.` : division ? `Showing area offices in ${division}.` : "Choose a division and region to narrow this list.")
                        : region ? `Showing the ${region} region office.` : division ? `Showing region offices in ${division}.` : "Choose a division to narrow this list."}
                    </p>
                  </div>
                );
              })()}
              <button type="button" className="btn btn-primary btn-block" disabled={!modal.choice} onClick={addOffice}><Check size={14} /> Add to route</button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}

/** The route, read-only: the area path and one chip per planned office. */
export function RouteSummary({ visit: v, empty = "Not chosen yet", showNone = true }) {
  const path = [v.division, v.region, v.area].filter(Boolean);
  return (
    <div className="route-sum">
      <div className="rs-path">
        <MapPin size={14} />
        {path.length ? path.map((p, i) => <React.Fragment key={p}>{i > 0 && <span className="rs-sep">›</span>}<span>{p}</span></React.Fragment>) : <span className="muted">{empty}</span>}
      </div>
      {(v.stops || []).length > 0 ? (
        <div className="rs-stops">
          {v.stops.map((s, i) => (
            <span key={s.name} className={`rs-stop ${s.kind}`}>
              <span className="rs-dot">{s.kind === "branch" ? i + 1 : s.kind === "vo" ? <Users size={11} /> : <Building2 size={11} />}</span>
              {s.kind === "branch" ? shortName(s.name) : s.name}
            </span>
          ))}
        </div>
      ) : showNone ? (
        <div className="rs-none">No branches or offices planned yet</div>
      ) : null}
    </div>
  );
}

/* ---------- which office an entry is about ---------- */

const EMPTY_PLACE = { division: "", region: "", area: "", office: "", officeKind: "", branch: "" };

/**
 * Division → Region → Area → Office (the region office, the area office or a branch)
 * → optionally a VO under that branch. Starts from what the visit already has, and
 * offers the planned offices as one-tap choices.
 */
export function PlacePicker({ tree, value, onChange, suggestions = [], idPrefix = "place" }) {
  const p = { ...EMPTY_PLACE, ...(value || {}) };
  const set = (patch) => onChange({ ...p, ...patch });

  const regions = p.division ? Object.keys(tree[p.division] || {}) : [];
  const areas = p.division && p.region ? Object.keys((tree[p.division] || {})[p.region] || {}) : [];
  const branches = p.division && p.region && p.area ? ((tree[p.division] || {})[p.region] || {})[p.area] || [] : [];
  const regionOffice = p.region ? `${p.region} Region Office` : "";
  const areaOffice = p.area ? `${p.area} Office` : "";

  // the office select shows the branch while a VO under it is chosen
  const officeValue = p.officeKind === "vo" ? p.branch : p.office;
  const vos = p.branch ? vosUnder(p.branch) : [];

  const chooseOffice = (name) => {
    if (!name) return set({ office: "", officeKind: "", branch: "" });
    if (name === regionOffice) return set({ office: name, officeKind: "region", branch: "" });
    if (name === areaOffice) return set({ office: name, officeKind: "area", branch: "" });
    return set({ office: name, officeKind: "branch", branch: name });
  };
  const chooseVo = (vo) => (vo ? set({ office: vo, officeKind: "vo" }) : set({ office: p.branch, officeKind: "branch" }));
  const same = (s) => s.office === p.office;

  return (
    <div className="place-box">
      <p className="place-title"><MapPin size={15} /> Which office is this about?</p>
      {suggestions.length > 0 && (
        <div className="place-chips" role="group" aria-label="Offices on this visit">
          {suggestions.map((s) => (
            <button key={s.office} type="button" className={`chip ${same(s) ? "selected" : ""}`} onClick={() => onChange(s)}>
              {s.officeKind === "branch" ? shortName(s.office) : s.office}
            </button>
          ))}
        </div>
      )}
      <div className="place-grid">
        <div className="field-group">
          <label className="field-label" htmlFor={`${idPrefix}-division`}>Division</label>
          <select id={`${idPrefix}-division`} className="select" value={p.division} onChange={(e) => onChange({ ...EMPTY_PLACE, division: e.target.value })}>
            <option value="">Select…</option>
            {Object.keys(tree).map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor={`${idPrefix}-region`}>Region</label>
          <select id={`${idPrefix}-region`} className="select" value={p.region} disabled={!p.division} onChange={(e) => onChange({ ...EMPTY_PLACE, division: p.division, region: e.target.value })}>
            <option value="">Select…</option>
            {regions.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor={`${idPrefix}-area`}>Area</label>
          <select id={`${idPrefix}-area`} className="select" value={p.area} disabled={!p.region}
                  onChange={(e) => onChange({ ...EMPTY_PLACE, division: p.division, region: p.region, area: e.target.value,
                    ...(p.officeKind === "region" ? { office: p.office, officeKind: "region" } : {}) })}>
            <option value="">Select…</option>
            {areas.map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor={`${idPrefix}-office`}>Office</label>
          <select id={`${idPrefix}-office`} className="select" value={officeValue} disabled={!p.region} onChange={(e) => chooseOffice(e.target.value)}>
            <option value="">{p.region ? "Select office…" : "Region first"}</option>
            {regionOffice && <optgroup label="Region"><option value={regionOffice}>{regionOffice}</option></optgroup>}
            {areaOffice && <optgroup label="Area"><option value={areaOffice}>{areaOffice}</option></optgroup>}
            {branches.length > 0 && <optgroup label="Branches">{branches.map((b) => <option key={b} value={b}>{b}</option>)}</optgroup>}
            {p.office && ![regionOffice, areaOffice, ...branches].includes(officeValue) && <option value={officeValue}>{officeValue}</option>}
          </select>
        </div>
      </div>
      {p.branch && (vos.length > 0 || p.officeKind === "vo") && (
        <div className="field-group" style={{ marginBottom: 0 }}>
          <label className="field-label" htmlFor={`${idPrefix}-vo`}>Village organisation <span style={{ fontWeight: 500, color: "var(--ink-faint)" }}>(optional, under {shortName(p.branch)})</span></label>
          <select id={`${idPrefix}-vo`} className="select" value={p.officeKind === "vo" ? p.office : ""} onChange={(e) => chooseVo(e.target.value)}>
            <option value="">None, the branch itself</option>
            {[...new Set([...vos, ...(p.officeKind === "vo" ? [p.office] : [])])].map((vo) => <option key={vo} value={vo}>{vo}</option>)}
          </select>
        </div>
      )}
      <p className={`place-path ${p.office ? "" : "muted"}`}>
        {p.office ? <><b>{OFFICE_KIND_LABEL[p.officeKind] || "Office"}:</b> {[placePath(p), p.officeKind === "vo" ? `${p.branch} › ${p.office}` : p.office].filter(Boolean).join(" › ")}</>
          : placePath(p) ? <>{placePath(p)} › <i>choose the office</i></> : "Nothing chosen yet"}
      </p>
    </div>
  );
}
