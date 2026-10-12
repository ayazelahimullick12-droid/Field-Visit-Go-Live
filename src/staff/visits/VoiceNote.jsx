import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";
import { mediaGet, mediaPut } from "../../lib/offline";
import { makeId } from "../../lib/ids";
import { mmss } from "../../lib/visits";

/* Voice notes on complaint and observation descriptions: say it now, write it
   up later (or leave it as it is). A recording is kept on the phone (IndexedDB)
   until the visit syncs; then it's uploaded to the server and the entry points
   at the file. Stored on an entry as { blobId, url, dur, mime }. */

const MAX_SECONDS = 5 * 60;

function pickMime() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

/** Plays a voice note: from the server once uploaded, otherwise from this phone. */
export function VoicePlayer({ voice }) {
  const [src, setSrc] = useState(voice?.url || null);
  useEffect(() => {
    if (voice?.url) { setSrc(voice.url); return undefined; }
    let objectUrl = null;
    let cancelled = false;
    setSrc(null);
    if (voice?.blobId) {
      mediaGet(voice.blobId).then((blob) => {
        if (blob && !cancelled) { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl); }
      });
    }
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [voice?.url, voice?.blobId]);

  if (!voice) return null;
  return (
    <span className="voice-note">
      {src ? <audio controls preload="metadata" src={src} /> : <span className="voice-len" style={{ flex: 1 }}>Saved on the phone it was recorded on</span>}
      <span className="voice-len">{mmss(voice.dur || 0)}</span>
    </span>
  );
}

/** Record a voice note for a description, or play / delete the one already recorded. */
export function VoiceNoteField({ value, onChange, onRecording, showToast }) {
  const [rec, setRec] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef(null);

  const cleanup = (r) => {
    if (!r) return;
    clearInterval(r.tick);
    r.stream?.getTracks().forEach((t) => t.stop());
  };
  useEffect(() => () => {
    const r = recRef.current;
    if (r?.mr && r.mr.state !== "inactive") { r.discard = true; try { r.mr.stop(); } catch { /* already stopped */ } }
    cleanup(r);
  }, []);
  useEffect(() => { onRecording?.(!!rec); }, [rec, onRecording]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      showToast?.("This browser can't record audio. Type the description instead.");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      showToast?.("Microphone access was blocked. Allow it in your browser settings to record a voice note.");
      return;
    }
    const mime = pickMime();
    const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const r = { mr, stream, chunks: [], startedAt: Date.now(), discard: false };
    mr.ondataavailable = (e) => { if (e.data && e.data.size) r.chunks.push(e.data); };
    mr.onstop = async () => {
      cleanup(r);
      recRef.current = null;
      setRec(null);
      if (r.discard || r.chunks.length === 0) return;
      const blob = new Blob(r.chunks, { type: mr.mimeType || mime || "audio/webm" });
      const blobId = makeId("VN");
      await mediaPut(blobId, blob);
      onChange({ blobId, url: null, dur: Math.max(1, Math.round((Date.now() - r.startedAt) / 1000)), mime: blob.type });
    };
    r.tick = setInterval(() => {
      const s = Math.round((Date.now() - r.startedAt) / 1000);
      setElapsed(s);
      if (s >= MAX_SECONDS && mr.state === "recording") mr.stop();
    }, 250);
    mr.start();
    recRef.current = r;
    setElapsed(0);
    setRec(r);
  };

  const stop = () => {
    const r = recRef.current;
    if (r?.mr && r.mr.state !== "inactive") r.mr.stop();
  };

  if (rec) {
    return (
      <div className="voice-row">
        <div className="rec-live" role="status" aria-label="Recording">
          <span className="rec-dot" />
          <span>{mmss(elapsed)}</span>
          <span className="rec-wave" aria-hidden="true">
            {Array.from({ length: 22 }, (_, i) => <i key={i} style={{ animationDelay: `-${((i * 37) % 100) / 100}s` }} />)}
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={stop}><Square size={13} /> Stop</button>
        </div>
      </div>
    );
  }
  if (value) {
    return (
      <div className="voice-row">
        <VoicePlayer voice={value} />
        <button type="button" className="icon-btn" onClick={() => onChange(null)} aria-label="Delete voice note"><Trash2 size={16} /></button>
      </div>
    );
  }
  return (
    <div className="voice-row">
      <button type="button" className="rec-btn" onClick={start}><Mic size={17} /> Record a voice note</button>
    </div>
  );
}
