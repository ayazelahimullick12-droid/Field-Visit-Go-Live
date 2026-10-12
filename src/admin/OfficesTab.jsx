import React, { useMemo, useRef, useState } from "react";
import { Plus, Edit3, Search, Download, Upload, X, MapPin, Target, Trash2, Power, Save } from "lucide-react";
import { makeId } from "../lib/ids";
import { Reveal, downloadCsv } from "../lib/ui";
import { Kpi } from "../staff/analytics/common";
import {
  DEFAULT_SETTINGS, DISTRICTS_BY_DIVISION, STATUS_META, computeCoverage, coverageSummary, officeKey,
  toShapeName, divisionLabelFromShape, districtFromShape, timeAgo,
} from "../lib/offices";
import { expandVisits, relinkOffice, visitsAtOffice } from "../lib/visits";

/* Offices master list: the single source for the visit wizard's dropdowns, the
   coverage maths and the map. Admins add / edit / retire offices here and set
   the "visited within N days" target that decides who counts as Overdue. */

const DIVISIONS = Object.keys(DISTRICTS_BY_DIVISION).map(divisionLabelFromShape);
const districtsOf = (division) => (DISTRICTS_BY_DIVISION[toShapeName(division)] || []).map(districtFromShape).sort((a, b) => a.localeCompare(b));
const ALL_DISTRICTS = DIVISIONS.flatMap((d) => districtsOf(d).map((x) => ({ division: d, district: x })));

// Bangladesh sits roughly between these bounds; anything outside is a typo.
const LAT = [20.5, 26.8], LNG = [88.0, 92.8];
const PAGE = 15;

const emptyForm = () => ({ name: "", area: "", division: "", district: "", lat: "", lng: "" });

/** Minimal RFC-4180-ish CSV reader (quotes, escaped quotes, CRLF, BOM). */
function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export default function OfficesTab({ offices, setOffices, visits, setVisits, settings, setSettings, showToast }) {
  const target = settings?.visitTargetDays || DEFAULT_SETTINGS.visitTargetDays;
  const [targetDraft, setTargetDraft] = useState(String(target));
  const [query, setQuery] = useState("");
  const [division, setDivision] = useState("All");
  const [state, setState] = useState("all"); // all | never | stale | ok | inactive
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(null); // null | "new" | office
  const fileRef = useRef(null);

  const coverage = useMemo(() => computeCoverage(offices, expandVisits(visits), target), [offices, visits, target]);
  const covByKey = useMemo(() => Object.fromEntries(coverage.map((r) => [r.key, r])), [coverage]);
  const sum = useMemo(() => coverageSummary(coverage), [coverage]);
  const inactive = offices.filter((o) => o.active === false).length;
  const districtsCovered = new Set(coverage.map((o) => o.district)).size;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return offices
      .map((o) => ({ o, cov: covByKey[officeKey(o)] }))
      .filter(({ o, cov }) => {
        if (division !== "All" && o.division !== division) return false;
        const retired = o.active === false;
        if (state === "inactive" && !retired) return false;
        if ((state === "never" || state === "stale" || state === "ok") && (retired || cov?.status !== state)) return false;
        return !q || `${o.name} ${o.area} ${o.district} ${o.division}`.toLowerCase().includes(q);
      })
      .sort((a, b) => a.o.division.localeCompare(b.o.division) || a.o.district.localeCompare(b.o.district) || a.o.name.localeCompare(b.o.name));
  }, [offices, covByKey, query, division, state]);
  const shown = showAll ? rows : rows.slice(0, PAGE);

  const saveTarget = () => {
    const n = Math.round(Number(targetDraft));
    if (!Number.isFinite(n) || n < 1 || n > 365) { showToast("Enter a number of days between 1 and 365."); return; }
    setSettings({ ...(settings || DEFAULT_SETTINGS), visitTargetDays: n });
    setTargetDraft(String(n));
    showToast(`Visit target set to ${n} days — coverage updates everywhere straight away.`);
  };

  const toggleActive = (o) => {
    setOffices((os) => os.map((x) => (x.id === o.id ? { ...x, active: x.active === false } : x)));
    showToast(o.active === false ? `${o.name} is active again.` : `${o.name} retired — it no longer counts toward coverage.`);
  };

  const exportCsv = () =>
    downloadCsv(`field-offices-${new Date().toISOString().slice(0, 10)}.csv`, [
      { label: "Branch", key: "name" }, { label: "Area", key: "area" }, { label: "District", key: "district" }, { label: "Division", key: "division" },
      { label: "Latitude", key: "lat" }, { label: "Longitude", key: "lng" }, { label: "Active", get: (o) => (o.active === false ? "no" : "yes") },
    ], offices);

  const importCsv = async (file) => {
    if (!file) return;
    try {
      const table = parseCsv(await file.text());
      if (table.length < 2) { showToast("That file has no data rows."); return; }
      const head = table[0].map((h) => h.trim().toLowerCase());
      const col = (...names) => head.findIndex((h) => names.includes(h));
      const ci = { name: col("branch", "name", "branch name"), area: col("area"), district: col("district"), division: col("division"), lat: col("latitude", "lat"), lng: col("longitude", "lng", "lon") };
      if (ci.name < 0 || ci.district < 0) { showToast("The CSV needs at least Branch and District columns."); return; }

      const have = new Set(offices.map((o) => officeKey(o).toLowerCase()));
      const fresh = [];
      let dup = 0, bad = 0;
      table.slice(1).forEach((r) => {
        const get = (i) => (i >= 0 ? (r[i] || "").trim() : "");
        const name = get(ci.name);
        // accept either spelling ("Chittagong" / "Chattogram") and resolve the division from the district
        const hit = ALL_DISTRICTS.find((x) => x.district.toLowerCase() === districtFromShape(get(ci.district)).toLowerCase());
        const district = hit?.district, div = hit?.division;
        const lat = get(ci.lat) === "" ? null : Number(get(ci.lat));
        const lng = get(ci.lng) === "" ? null : Number(get(ci.lng));
        const coordsOk = (lat == null && lng == null) || (Number.isFinite(lat) && Number.isFinite(lng) && lat >= LAT[0] && lat <= LAT[1] && lng >= LNG[0] && lng <= LNG[1]);
        if (!name || !div || !coordsOk) { bad++; return; }
        const key = `${district}::${name}`.toLowerCase();
        if (have.has(key)) { dup++; return; }
        have.add(key);
        fresh.push({ id: makeId("OFF"), name, type: "branch", division: div, district, area: get(ci.area) || `${name.replace(/ Branch$/i, "")} Area`, lat, lng, active: true });
      });
      if (fresh.length) setOffices((os) => [...os, ...fresh]);
      showToast(`Imported ${fresh.length} office${fresh.length === 1 ? "" : "s"}${dup ? ` · ${dup} already existed` : ""}${bad ? ` · ${bad} skipped (unknown district or bad data)` : ""}.`);
    } catch {
      showToast("Couldn't read that file.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="h-eyebrow">Configuration</p>
          <h1 className="h-title">Field offices</h1>
          <p className="h-desc">The master list behind the visit wizard, the coverage map and management's "never visited" tracking.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}><Download size={14} /> Export CSV</button>
          <button className="btn btn-primary btn-sm" onClick={() => setEditing("new")}><Plus size={14} strokeWidth={2.6} /> Add office</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => importCsv(e.target.files?.[0])} />
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <Reveal i={0}><Kpi icon={MapPin} tone="green" label="Active offices" value={sum.total} /></Reveal>
        <Reveal i={1}><Kpi icon={Target} label="Districts covered" value={districtsCovered} foot={<span className="pill pill-brand">of 64</span>} /></Reveal>
        <Reveal i={2}><Kpi icon={MapPin} tone="red" label="Never visited" value={sum.never} /></Reveal>
        <Reveal i={3}><Kpi icon={MapPin} tone="amber" label={`Overdue (> ${target} days)`} value={sum.stale} /></Reveal>
        <Reveal i={4}><Kpi icon={Power} tone="blue" label="Retired" value={inactive} /></Reveal>
      </div>

      <Reveal className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="target-row">
          <div>
            <p className="analytics-card-title" style={{ marginBottom: 2 }}>Visit target</p>
            <p className="analytics-card-sub" style={{ margin: 0 }}>
              An office not visited within this many days is flagged <strong>Overdue</strong> on the management dashboard and map.
            </p>
          </div>
          <div className="target-controls">
            <div className="filter-chips">
              {[30, 60, 90, 120, 180].map((n) => (
                <button key={n} className={`filter-chip ${Number(targetDraft) === n ? "active" : ""}`} onClick={() => setTargetDraft(String(n))}>{n}d</button>
              ))}
            </div>
            <input className="input" type="number" min="1" max="365" value={targetDraft} onChange={(e) => setTargetDraft(e.target.value)}
                   onKeyDown={(e) => e.key === "Enter" && saveTarget()} style={{ width: 96 }} aria-label="Visit target in days" />
            <button className="btn btn-primary btn-sm" onClick={saveTarget} disabled={Number(targetDraft) === target}><Save size={14} /> Save</button>
          </div>
        </div>
      </Reveal>

      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input className="input" placeholder="Search branch, area, district…" value={query} onChange={(e) => { setQuery(e.target.value); setShowAll(false); }} />
        </div>
        <select className="select" style={{ width: "auto", minWidth: 170 }} value={division} onChange={(e) => { setDivision(e.target.value); setShowAll(false); }} aria-label="Division">
          <option value="All">All divisions</option>
          {DIVISIONS.map((d) => <option key={d}>{d}</option>)}
        </select>
        <div className="filter-chips">
          {[["all", "All"], ["never", "Never visited"], ["stale", "Overdue"], ["ok", "On track"], ["inactive", "Retired"]].map(([k, label]) => (
            <button key={k} className={`filter-chip ${state === k ? "active" : ""}`} onClick={() => { setState(k); setShowAll(false); }}>{label}</button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card empty-state">No offices match.</div>
      ) : (
        <div className="ctable-wrap">
          <table className="ctable stack">
            <thead>
              <tr><th>Branch</th><th>Location</th><th>Status</th><th>Last visit</th><th>Visits</th><th>Map pin</th><th style={{ textAlign: "right" }}>Action</th></tr>
            </thead>
            <tbody>
              {shown.map(({ o, cov }) => {
                const retired = o.active === false;
                const meta = cov ? STATUS_META[cov.status] : null;
                return (
                  <tr key={o.id} style={retired ? { opacity: 0.6 } : undefined}>
                    <td data-label="Branch"><div className="cell-main">{o.name}</div><div className="cell-sub mono">{o.id}</div></td>
                    <td data-label="Location"><div className="cell-main">{o.area}</div><div className="cell-sub">{o.district} · {o.division}</div></td>
                    <td data-label="Status">{retired ? <span className="pill pill-brand">Retired</span> : meta && <span className={`pill ${meta.pill}`}>{meta.short}</span>}</td>
                    <td data-label="Last visit">{cov?.lastDate ? <><div className="cell-main">{timeAgo(cov.daysSince)}</div><div className="cell-sub">{cov.lastDate}</div></> : <span style={{ color: "var(--ink-faint)" }}>—</span>}</td>
                    <td data-label="Visits">{cov ? cov.visitCount : "—"}</td>
                    <td data-label="Map pin" className="mono" style={{ fontSize: 11.5 }}>
                      {Number.isFinite(o.lat) && Number.isFinite(o.lng) ? `${o.lat.toFixed(3)}, ${o.lng.toFixed(3)}` : <span style={{ color: "var(--ink-faint)" }}>approximate</span>}
                    </td>
                    <td data-label="" style={{ textAlign: "right" }}>
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(o)}><Edit3 size={12} /> Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(o)} title={retired ? "Reactivate" : "Retire"}><Power size={13} /> {retired ? "Reactivate" : "Retire"}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > PAGE && (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAll((s) => !s)}>{showAll ? "Show fewer" : `Show all ${rows.length}`}</button>
        </div>
      )}

      {editing && (
        <OfficeModal
          office={editing === "new" ? null : editing} offices={offices} visits={visits}
          onClose={() => setEditing(null)}
          onSave={(form, existing) => {
            if (existing) {
              const changed = existing.name !== form.name || existing.district !== form.district || existing.area !== form.area || existing.division !== form.division;
              setOffices((os) => os.map((x) => (x.id === existing.id ? { ...x, ...form } : x)));
              if (changed) setVisits((vs) => relinkOffice(vs, existing, form));
              showToast(`${form.name} updated${changed ? " — its past visits were relinked." : "."}`);
            } else {
              setOffices((os) => [...os, { id: makeId("OFF"), type: "branch", active: true, ...form }]);
              showToast(`${form.name} added — it's now selectable in the visit wizard and on the map.`);
            }
            setEditing(null);
          }}
          onDelete={(existing) => {
            setOffices((os) => os.filter((x) => x.id !== existing.id));
            showToast(`${existing.name} deleted.`);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function OfficeModal({ office, offices, visits, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(() => office
    ? { name: office.name, area: office.area, division: office.division, district: office.district, lat: office.lat ?? "", lng: office.lng ?? "" }
    : emptyForm());
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const districts = districtsOf(form.division);
  const areaHints = [...new Set(offices.filter((o) => o.district === form.district).map((o) => o.area))];
  const visitCount = office ? visitsAtOffice(visits, office) : 0;
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setError(""); };

  const submit = () => {
    const name = form.name.trim(), area = form.area.trim();
    if (!name) return setError("Branch name is required.");
    if (!form.division || !form.district) return setError("Choose a division and a district.");
    if (!area) return setError("Area is required — it groups branches under one area office.");
    const lat = form.lat === "" ? null : Number(form.lat), lng = form.lng === "" ? null : Number(form.lng);
    if ((lat == null) !== (lng == null)) return setError("Give both latitude and longitude, or leave both empty.");
    if (lat != null && !(Number.isFinite(lat) && Number.isFinite(lng) && lat >= LAT[0] && lat <= LAT[1] && lng >= LNG[0] && lng <= LNG[1])) {
      return setError(`Those coordinates fall outside Bangladesh (latitude ${LAT[0]}–${LAT[1]}, longitude ${LNG[0]}–${LNG[1]}).`);
    }
    const clash = offices.some((o) => o.id !== office?.id && o.district === form.district && o.name.toLowerCase() === name.toLowerCase());
    if (clash) return setError(`${form.district} already has a branch called "${name}".`);
    onSave({ name, area, division: form.division, district: form.district, lat, lng }, office);
  };

  return (
    <div className="modal-veil" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="mono" style={{ fontSize: 12, color: "var(--ink-faint)" }}>{office ? office.id : "New office"}</span>
            <h1 className="h-title" style={{ fontSize: 19, marginTop: 2 }}>{office ? "Edit office" : "Add a field office"}</h1>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>

        <div className="modal-body">
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Division</label>
              <select className="select" value={form.division} onChange={(e) => set({ division: e.target.value, district: "" })}>
                <option value="">Select division…</option>
                {DIVISIONS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">District</label>
              <select className="select" value={form.district} onChange={(e) => set({ district: e.target.value })} disabled={!form.division}>
                <option value="">Select district…</option>
                {districts.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Area office</label>
              <input className="input" list="area-hints" placeholder="e.g. Savar Area" value={form.area} onChange={(e) => set({ area: e.target.value })} />
              <datalist id="area-hints">{areaHints.map((a) => <option key={a} value={a} />)}</datalist>
            </div>
            <div className="field-group">
              <label className="field-label">Branch name</label>
              <input className="input" placeholder="e.g. Savar Branch" value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Latitude <span style={{ fontWeight: 500, color: "var(--ink-faint)" }}>(optional)</span></label>
              <input className="input" inputMode="decimal" placeholder="23.8103" value={form.lat} onChange={(e) => set({ lat: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">Longitude <span style={{ fontWeight: 500, color: "var(--ink-faint)" }}>(optional)</span></label>
              <input className="input" inputMode="decimal" placeholder="90.4125" value={form.lng} onChange={(e) => set({ lng: e.target.value })} />
            </div>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--ink-faint)", margin: "-4px 0 14px" }}>
            Coordinates place the pin exactly on the map. Without them the pin is drawn approximately inside its district.
          </p>

          {office && (office.name !== form.name.trim() || office.district !== form.district) && visitCount > 0 && (
            <div className="auto-assign-box" style={{ marginBottom: 14 }}>
              This office has {visitCount} past visit{visitCount === 1 ? "" : "s"} — they'll be relinked to the new name / district when you save.
            </div>
          )}
          {error && <div className="form-error" role="alert">{error}</div>}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn-primary" onClick={submit}>{office ? "Save changes" : "Add office"}</button>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            {office && visitCount === 0 && (
              <button className={`btn ${confirmDelete ? "btn-danger" : "btn-ghost"}`} style={{ marginLeft: "auto" }}
                      onClick={() => (confirmDelete ? onDelete(office) : setConfirmDelete(true))}>
                <Trash2 size={14} /> {confirmDelete ? "Click again to delete" : "Delete"}
              </button>
            )}
          </div>
          {office && visitCount > 0 && (
            <p style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 12 }}>
              Offices with visit history can't be deleted — use <strong>Retire</strong> instead so the records stay intact.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
