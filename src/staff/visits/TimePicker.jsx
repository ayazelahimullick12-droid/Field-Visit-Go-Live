import React, { useEffect, useRef, useState } from "react";
import { Clock, Keyboard, X } from "lucide-react";
import { fmtTime, pad2 } from "../../lib/visits";
import Portal from "../../lib/Portal";

/*
 * Time input on a clock face, the way Material Design's time picker works
 * (the pattern Android and Google apps use): tap or drag on the dial to pick the
 * hour, it moves on to the minutes, AM/PM on the side, and a keyboard button to
 * type the time instead. Values are "HH:MM", 24-hour, like <input type="time">.
 */

const SIZE = 256;
const C = SIZE / 2;
const R_NUM = 100; // where the numbers sit
const R_KNOB = 22;

const parse = (value) => {
  const d = new Date();
  let h = d.getHours(), m = Math.round(d.getMinutes() / 5) * 5;
  if (m === 60) { m = 0; h = (h + 1) % 24; }
  if (/^\d{1,2}:\d{2}$/.test(value || "")) [h, m] = value.split(":").map(Number);
  return { h12: ((h + 11) % 12) + 1, m, pm: h >= 12 };
};
const to24 = (h12, m, pm) => `${pad2((h12 % 12) + (pm ? 12 : 0))}:${pad2(m)}`;
const at = (deg, r) => ({ x: C + r * Math.sin((deg * Math.PI) / 180), y: C - r * Math.cos((deg * Math.PI) / 180) });

function ClockDialog({ title, value, onCancel, onOk, onClear }) {
  const start = parse(value);
  const [h12, setH12] = useState(start.h12);
  const [m, setM] = useState(start.m);
  const [pm, setPm] = useState(start.pm);
  const [mode, setMode] = useState("hour");
  const [typing, setTyping] = useState(false);
  const [hText, setHText] = useState(String(start.h12));
  const [mText, setMText] = useState(pad2(start.m));
  const dragging = useRef(null); // where the pointer went down, while it is down
  const svgRef = useRef(null);
  const okRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  // A tap on the minutes lands on the nearest 5 (the numbers shown); dragging picks any minute.
  const pick = (e, tap) => {
    const box = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * SIZE - C;
    const y = ((e.clientY - box.top) / box.height) * SIZE - C;
    const deg = (Math.atan2(x, -y) * 180) / Math.PI + 360;
    if (mode === "hour") setH12(Math.round(deg / 30) % 12 || 12);
    else setM(tap ? (Math.round(deg / 30) * 5) % 60 : Math.round(deg / 6) % 60);
  };
  const down = (e) => { dragging.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture?.(e.pointerId); pick(e, true); };
  const move = (e) => {
    const s0 = dragging.current;
    if (s0 && Math.hypot(e.clientX - s0.x, e.clientY - s0.y) > 6) pick(e, false);
  };
  const up = () => {
    if (!dragging.current) return;
    dragging.current = null;
    if (mode === "hour") setTimeout(() => setMode("minute"), 180);
  };
  const dialKey = (e) => {
    const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
    if (step) {
      e.preventDefault();
      if (mode === "hour") setH12((h) => ((h - 1 + step + 12) % 12) + 1);
      else setM((x) => (x + step + 60) % 60);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (mode === "hour") setMode("minute"); else okRef.current?.focus();
    }
  };

  // typing mode
  const hNum = Number(hText), mNum = Number(mText);
  const hOk = /^\d{1,2}$/.test(hText) && hNum >= 1 && hNum <= 12;
  const mOk = /^\d{1,2}$/.test(mText) && mNum >= 0 && mNum <= 59;
  const switchMode = () => {
    if (typing) { if (hOk) setH12(hNum); if (mOk) setM(mNum); }
    else { setHText(String(h12)); setMText(pad2(m)); }
    setTyping((t) => !t);
  };
  const result = typing ? (hOk && mOk ? to24(hNum, mNum, pm) : null) : to24(h12, m, pm);

  const numbers = mode === "hour"
    ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => ({ n, label: String(n), deg: (n % 12) * 30, on: n === h12 }))
    : Array.from({ length: 12 }, (_, i) => ({ n: i * 5, label: pad2(i * 5), deg: i * 30, on: i * 5 === m }));
  const handDeg = mode === "hour" ? (h12 % 12) * 30 : m * 6;
  const knob = at(handDeg, R_NUM);

  return (
    <Portal>
    <div className="tp-veil" onClick={onCancel}>
      <div className="tp-box" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <p className="tp-title">{typing ? "Enter time" : "Select time"}<span>{title}</span></p>

        <div className="tp-display">
          {typing ? (
            <>
              <label className="tp-in">
                <input autoFocus inputMode="numeric" maxLength={2} value={hText} aria-label="Hour" aria-invalid={!hOk}
                       onChange={(e) => setHText(e.target.value.replace(/\D/g, ""))} onFocus={(e) => e.target.select()} />
                <small>Hour</small>
              </label>
              <span className="tp-colon">:</span>
              <label className="tp-in">
                <input inputMode="numeric" maxLength={2} value={mText} aria-label="Minute" aria-invalid={!mOk}
                       onChange={(e) => setMText(e.target.value.replace(/\D/g, ""))} onFocus={(e) => e.target.select()}
                       onBlur={() => { if (/^\d$/.test(mText)) setMText(pad2(mText)); }} />
                <small>Minute</small>
              </label>
            </>
          ) : (
            <>
              <button type="button" className={`tp-seg ${mode === "hour" ? "on" : ""}`} onClick={() => setMode("hour")} aria-label={`Hour ${h12}`}>{pad2(h12)}</button>
              <span className="tp-colon">:</span>
              <button type="button" className={`tp-seg ${mode === "minute" ? "on" : ""}`} onClick={() => setMode("minute")} aria-label={`Minute ${pad2(m)}`}>{pad2(m)}</button>
            </>
          )}
          <div className="tp-ampm" role="radiogroup" aria-label="AM or PM">
            <button type="button" role="radio" aria-checked={!pm} className={!pm ? "on" : ""} onClick={() => setPm(false)}>AM</button>
            <button type="button" role="radio" aria-checked={pm} className={pm ? "on" : ""} onClick={() => setPm(true)}>PM</button>
          </div>
        </div>

        {typing ? (
          <p className="tp-hint">{!hOk ? "Hour is 1 to 12." : !mOk ? "Minute is 0 to 59." : `${fmtTime(result)}`}</p>
        ) : (
          <svg ref={svgRef} className="tp-dial" viewBox={`0 0 ${SIZE} ${SIZE}`} tabIndex={0} role="slider"
               aria-label={mode === "hour" ? "Hour" : "Minute"} aria-valuetext={mode === "hour" ? `${h12} o'clock` : `${m} minutes`}
               aria-valuemin={mode === "hour" ? 1 : 0} aria-valuemax={mode === "hour" ? 12 : 59} aria-valuenow={mode === "hour" ? h12 : m}
               onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={dialKey}>
            <circle cx={C} cy={C} r={C} className="tp-face" />
            <line x1={C} y1={C} x2={knob.x} y2={knob.y} className="tp-hand" />
            <circle cx={C} cy={C} r={4} className="tp-pivot" />
            <circle cx={knob.x} cy={knob.y} r={R_KNOB} className="tp-knob" />
            {mode === "minute" && m % 5 !== 0 && <circle cx={knob.x} cy={knob.y} r={3} className="tp-knob-dot" />}
            {numbers.map(({ n, label, deg, on }) => {
              const p = at(deg, R_NUM);
              return <text key={n} x={p.x} y={p.y} className={`tp-num ${on ? "on" : ""}`} dominantBaseline="central" textAnchor="middle">{label}</text>;
            })}
          </svg>
        )}

        <div className="tp-foot">
          <button type="button" className="icon-btn" onClick={switchMode} aria-label={typing ? "Pick on the clock" : "Type the time"} title={typing ? "Pick on the clock" : "Type the time"}>
            {typing ? <Clock size={18} /> : <Keyboard size={18} />}
          </button>
          {onClear && <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>Clear</button>}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button ref={okRef} type="button" className="btn btn-primary btn-sm" disabled={!result} onClick={() => onOk(result)}>OK</button>
        </div>
      </div>
    </div>
    </Portal>
  );
}

/** Looks like a form field; opens the clock. `value` is "HH:MM" or "". */
export function TimeField({ id, label, value, onChange, placeholder = "Set time" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="time-field">
        <button type="button" id={id} className={`input time-btn ${value ? "" : "empty"}`} onClick={() => setOpen(true)} aria-label={`${label}: ${value ? fmtTime(value) : "not set"}`}>
          <Clock size={16} /> <span>{value ? fmtTime(value) : placeholder}</span>
        </button>
        {value && <button type="button" className="time-clear" onClick={() => onChange("")} aria-label={`Clear ${label}`}><X size={14} /></button>}
      </div>
      {open && (
        <ClockDialog
          title={label} value={value}
          onCancel={() => setOpen(false)}
          onClear={value ? () => { onChange(""); setOpen(false); } : null}
          onOk={(v) => { onChange(v); setOpen(false); }}
        />
      )}
    </>
  );
}
