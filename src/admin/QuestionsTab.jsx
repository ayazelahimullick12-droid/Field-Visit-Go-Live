import React, { useMemo, useState } from "react";
import { Star, ChevronUp, ChevronDown, Trash2, Lock, Plus, Check } from "lucide-react";
import { makeId } from "../lib/ids";

/* Admin → Client questions: what clients are asked to rate when field staff record
   a client interaction. Each switched-on question gets 1–5 stars; a client's overall
   rating is the average. Observations never use stars. Each answer keeps the
   wording it was given with, so rewording a question doesn't change old answers. */

function QuestionRow({ q, index, total, uses, onMove, onSave, onToggle, onDelete }) {
  const [text, setText] = useState(q.text);
  const changed = text.trim() !== q.text && text.trim() !== "";
  return (
    <div className="unit-row" style={{ alignItems: "flex-start", paddingTop: 8, paddingBottom: 8, opacity: q.active === false ? 0.65 : 1 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <button className="icon-btn" style={{ width: 30, height: 26 }} disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up"><ChevronUp size={15} /></button>
        <button className="icon-btn" style={{ width: 30, height: 26 }} disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Move down"><ChevronDown size={15} /></button>
      </div>
      <div style={{ flex: 1, minWidth: 180 }}>
        <input className="input" value={text} aria-label={`Question ${index + 1}`} onChange={(e) => setText(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && changed && onSave(text.trim())} />
        <div className="unit-count" style={{ marginTop: 6 }}>
          {uses > 0 ? `${uses} answer${uses === 1 ? "" : "s"} so far. Switch it off to stop asking it.` : "No answers yet, so it can still be deleted."}
        </div>
      </div>
      {changed && <button className="btn btn-primary btn-sm" onClick={() => onSave(text.trim())}><Check size={13} /> Save</button>}
      <label className="checkbox-row" style={{ margin: 0 }}>
        <label style={{ padding: "7px 12px" }}><input type="checkbox" checked={q.active !== false} onChange={onToggle} /> {q.active !== false ? "On" : "Off"}</label>
      </label>
      {uses > 0
        ? <span className="icon-btn" title="Has answers, so it can only be switched off" style={{ cursor: "default" }}><Lock size={15} /></span>
        : <button className="icon-btn" onClick={onDelete} aria-label="Delete question"><Trash2 size={15} /></button>}
    </div>
  );
}

export default function QuestionsTab({ settings, setSettings, visits, showToast }) {
  const questions = settings?.clientRatingQuestions || [];
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState({});

  const uses = useMemo(() => {
    const m = {};
    (visits || []).forEach((v) => (v.interactions || []).forEach((o) => (o.ratings || []).forEach((r) => { m[r.questionId] = (m[r.questionId] || 0) + 1; })));
    return m;
  }, [visits]);

  const save = (next) => setSettings((s) => ({ ...(s || {}), clientRatingQuestions: next }));
  const move = (i, d) => { const a = questions.slice(); const [x] = a.splice(i, 1); a.splice(i + d, 0, x); save(a); };
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    save([...questions, { id: makeId("RQ"), text, active: true }]);
    setDraft("");
    showToast("Question added — field staff see it the next time they record a client interaction.");
  };
  const active = questions.filter((q) => q.active !== false);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="h-eyebrow">Settings</p>
          <h1 className="h-title">Client questions</h1>
          <p className="h-desc">What clients are asked to rate when field staff record a client interaction. Each switched-on question gets 1 to 5 stars, and the overall rating is the average. Observations don't use stars.</p>
        </div>
      </div>

      <div className="bp-grid">
        <div className="card card-pad" style={{ minWidth: 0 }}>
          <p className="analytics-card-title">Questions</p>
          <p className="analytics-card-sub">{active.length} on · {questions.length} in total. A question that already has answers can only be switched off, so old ratings keep their meaning.</p>
          <div className="unit-list">
            {questions.map((q, i) => (
              <QuestionRow
                key={q.id} q={q} index={i} total={questions.length} uses={uses[q.id] || 0}
                onMove={(d) => move(i, d)}
                onSave={(text) => { save(questions.map((x) => (x.id === q.id ? { ...x, text } : x))); showToast("Question updated. Earlier answers keep the old wording."); }}
                onToggle={() => save(questions.map((x) => (x.id === q.id ? { ...x, active: x.active === false } : x)))}
                onDelete={() => { save(questions.filter((x) => x.id !== q.id)); showToast("Question deleted."); }}
              />
            ))}
            {questions.length === 0 && <div className="empty-state" style={{ padding: 20 }}>No questions yet. Add the first one below.</div>}
          </div>
          <div className="unit-add" style={{ maxWidth: "none" }}>
            <input className="input" placeholder="New question, e.g. How easy is it to reach the branch?" value={draft}
                   onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <button className="btn btn-primary" onClick={add} disabled={!draft.trim()}><Plus size={14} /> Add</button>
          </div>
        </div>

        <div className="card card-pad" style={{ minWidth: 0 }}>
          <p className="analytics-card-title">What field staff see</p>
          <p className="analytics-card-sub">Live preview of the client rating in the client interaction form.</p>
          {active.length === 0 ? (
            <div className="viz-empty">Switch on at least one question, or clients can't be rated.</div>
          ) : (
            <div className="rating-list">
              {active.map((q) => {
                const val = preview[q.id] || 0;
                return (
                  <div className="rating-q" key={q.id}>
                    <b>{q.text}</b>
                    <div className="stars">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" className="star-btn" aria-label={`${n} of 5`} onClick={() => setPreview((p) => ({ ...p, [q.id]: val === n ? 0 : n }))}>
                          <Star size={22} fill={n <= val ? "var(--brand)" : "none"} color={n <= val ? "var(--brand)" : "var(--ink-faint)"} />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
