import React, { useState } from "react";
import { ArrowLeft, Clock, Play, CheckCircle2, Hourglass, MapPin, Route, Users, Info } from "lucide-react";
import { PersonDetails } from "../lib/PersonInfo";
import { entryPlaces, placesText, fmtDate } from "../lib/visits";
import { statusOf, statusClass, complaintTitle, firstWords, isLate, STATUS_HELP } from "../lib/complaints";
import { postAction, actionError } from "../lib/actions";
import Resolution from "../lib/Resolution";
import ConfirmDialog from "./visits/Confirm";
import PhotoUpload from "./visits/PhotoUpload";
import { VoicePlayer } from "./visits/VoiceNote";

/** A complaint at a glance: code, status, title and the first 100 words. Opens the full page. */
export function ComplaintTile({ c, draft = false, onOpen }) {
  return (
    <button type="button" className="ctile" onClick={onOpen}>
      <span className="ctile-top">
        <span className="mono">{c.id}</span>
        {draft ? <span className="pill pill-stale">Draft</span> : <span className={statusClass(c)}>{statusOf(c)}</span>}
      </span>
      <span className="ctile-title">{complaintTitle(c)}</span>
      {c.description && <span className="ctile-desc">{firstWords(c.description, 100)}</span>}
    </button>
  );
}

const Row = ({ k, children }) => (children ? <div className="meta-row"><span className="meta-k">{k}</span><span className="meta-v">{children}</span></div> : null);

/**
 * Everything about one complaint on its own page. A fixer of the unit it's assigned to can
 * start work, mark it Fixed (optional note and photo) or mark it Long Term.
 */
export default function ComplaintPage({ c, visit, me, canAct, onBack, onRefresh, onOpenVisit, showToast }) {
  const [dialog, setDialog] = useState(null); // { kind: "fixed" | "long", note, photo }
  const [busy, setBusy] = useState(false);
  const status = statusOf(c);
  const late = isLate(c);
  const places = entryPlaces(c);

  const run = async (path, body, done) => {
    setBusy(true);
    try {
      await postAction(path, { visitId: visit.id, complaintId: c.id, employeeId: me.id, ...body });
      await onRefresh();
      setDialog(null);
      showToast(done);
    } catch (err) { showToast(actionError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 10, paddingLeft: 0 }} onClick={onBack}><ArrowLeft size={14} /> Back</button>

      <div className="card card-pad cpage-head">
        <p className="h-eyebrow" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          Action item · <span className="mono">{c.id}</span>
          {c.state === "draft" ? <span className="pill pill-stale">Draft · not submitted</span> : <span className={statusClass(c)}>{status}</span>}
          {late && <span className="pill pill-never">Past deadline</span>}
        </p>
        <h1 className="h-title">{complaintTitle(c)}</h1>
        <div className="view-meta" style={{ marginTop: 10 }}>
          <span className={`urgency-badge urgency-${c.urgency}`}>{c.urgency} urgency</span>
          <span className="source-badge">{c.department}{c.unit ? ` · ${c.unit}` : ""}</span>
        </div>
        {c.state !== "draft" && <p className="field-hint" style={{ marginBottom: 0 }}>{STATUS_HELP[status]}</p>}

        {canAct && ["Assigned", "In Progress", "Long Term"].includes(status) && (
          <div className="cpage-actions">
            {status === "Assigned" && (
              <button className="btn btn-secondary" disabled={busy} onClick={() => run("start-complaint", {}, `Work started on ${c.id}.`)}><Play size={14} /> Start work</button>
            )}
            <button className="btn btn-primary" disabled={busy} onClick={() => setDialog({ kind: "fixed", note: "", photo: null })}><CheckCircle2 size={14} /> Mark fixed</button>
            {status !== "Long Term" && (
              <button className="btn btn-ghost" disabled={busy} onClick={() => setDialog({ kind: "long", note: "" })}><Hourglass size={14} /> Mark long term</button>
            )}
          </div>
        )}
      </div>

      <div className="bp-grid" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <section className="card card-pad">
            <p className="analytics-card-title">Description</p>
            {c.description ? <p className="view-text" style={{ marginTop: 6 }}>{c.description}</p> : <p className="field-hint">No written description.</p>}
            {c.voice && <VoicePlayer voice={c.voice} />}
            {c.photoUrl && <img className="view-photo" src={c.photoUrl} alt="Attached to the action item" style={{ marginTop: 10 }} />}
          </section>
          {status === "Long Term" && (
            <div className="info-banner"><Info size={16} /><span><b>Marked long term{c.longTermBy ? ` by ${c.longTermBy}` : ""}{c.longTermAt ? ` on ${new Date(c.longTermAt).toLocaleDateString()}` : ""}.</b>{c.longTermNote ? ` ${c.longTermNote}` : ""}</span></div>
          )}
          <Resolution c={c} />
          <section className="card card-pad">
            <p className="analytics-card-title">Timeline</p>
            {(c.log || []).length === 0 ? <p className="field-hint">No activity recorded yet.</p> : (
              <div className="timeline" style={{ marginTop: 8 }}>
                {c.log.map((item, i) => (
                  <div className="tl-item" key={i}>
                    <div className="tl-dot-wrap"><div className="tl-dot" />{i < c.log.length - 1 && <div className="tl-bar" />}</div>
                    <div><div className="tl-label">{item.label}</div><div className="tl-time">{item.time}</div></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <section className="card card-pad meta-box">
            <p className="analytics-card-title">Details</p>
            <Row k={<><MapPin size={13} /> Office</>}>{placesText(places) || "Not recorded"}</Row>
            <Row k={<><Route size={13} /> Visit</>}>
              <button className="link-btn" onClick={onOpenVisit}>{[visit.area || visit.region, visit.date && fmtDate(visit.date)].filter(Boolean).join(" · ") || visit.id}</button>
            </Row>
            <Row k="Filed by">{[c.filedBy || visit.employeeName, c.filedDate].filter(Boolean).join(" · ")}</Row>
            <Row k={<><Users size={13} /> Assigned to</>}>{c.assignedTo ? `${c.department} fixers: ${c.assignedTo}` : "Not yet assigned"}</Row>
            <Row k={<><Clock size={13} /> Deadline</>}>{c.deadline ? <span style={late ? { color: "var(--danger)", fontWeight: 700 } : undefined}>{new Date(c.deadline).toLocaleString()}{late ? " · past deadline" : ""}</span> : null}</Row>
            {c.startedBy && <Row k="Work started">{`${c.startedBy}${c.startedAt ? ` · ${new Date(c.startedAt).toLocaleDateString()}` : ""}`}</Row>}
          </section>
          <section className="card card-pad">
            <p className="analytics-card-title">Raised by</p>
            <PersonDetails kind={c.source} person={c.person} consent={c.consent} />
          </section>
        </div>
      </div>

      {dialog?.kind === "fixed" && (
        <ConfirmDialog title={`Mark ${c.id} as fixed?`} confirmLabel="Mark fixed" cancelLabel="Cancel" busy={busy}
                       onCancel={() => setDialog(null)} onConfirm={() => run("resolve-complaint", { note: dialog.note, photoUrl: dialog.photo }, `${c.id} marked as fixed.`)}>
          <p style={{ margin: "0 0 12px" }}>Both fields are optional, but they show everyone what was done.</p>
          <label className="field-label" htmlFor="fix-note">Action taken</label>
          <textarea id="fix-note" className="textarea" rows={3} maxLength={1000} placeholder="e.g. Replaced the faulty router; connectivity restored."
                    value={dialog.note} onChange={(e) => setDialog({ ...dialog, note: e.target.value })} />
          <div style={{ marginTop: 12 }}>
            <PhotoUpload photoUrl={dialog.photo} onChange={(photo) => setDialog((d) => ({ ...d, photo }))} hint="Photo of the fix (optional)" />
          </div>
        </ConfirmDialog>
      )}
      {dialog?.kind === "long" && (
        <ConfirmDialog title={`Mark ${c.id} as long term?`} confirmLabel="Mark long term" cancelLabel="Cancel" busy={busy}
                       onCancel={() => setDialog(null)} onConfirm={() => run("long-term-complaint", { note: dialog.note }, `${c.id} marked as long term.`)}>
          <p style={{ margin: "0 0 12px" }}>Use this when the fix needs more time than a normal deadline allows. Deadline reminders stop; it can be marked fixed later.</p>
          <label className="field-label" htmlFor="lt-note">Reason <span className="opt">(optional)</span></label>
          <textarea id="lt-note" className="textarea" rows={3} maxLength={1000} placeholder="e.g. Requires budget approval for new equipment."
                    value={dialog.note} onChange={(e) => setDialog({ ...dialog, note: e.target.value })} />
        </ConfirmDialog>
      )}
    </div>
  );
}
