import React, { useEffect, useState } from "react";
import { Heart, MessageCircle, Share2, MapPin, Camera, X, Send } from "lucide-react";
import { isDraft } from "../lib/visits";
import { firstWords } from "../lib/complaints";
import { postAction, actionError } from "../lib/actions";
import Portal from "../lib/Portal";

/* The story feed: every submitted story, with likes (one per person), comments and a WhatsApp
   share link. The link opens the story inside the app, so only signed-in staff can read it. */

const GRADIENTS = [
  "linear-gradient(135deg,#EC008C 0%,#7A1FA2 100%)", "linear-gradient(135deg,#2F6FED 0%,#1D1E22 100%)",
  "linear-gradient(135deg,#1C8A54 0%,#0D3B24 100%)", "linear-gradient(135deg,#B7791F 0%,#5C3A0A 100%)",
];
const initials = (name) => (name || "?").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
export const STORY_LINK_KEY = "fvt-open-story";

/** Every submitted story, newest first, with who posted it and when. */
export function allStories(visits) {
  return visits
    .flatMap((v) => (v.stories || []).filter((s) => !isDraft(s)).map((s) => ({
      ...s, visitId: v.id, staffName: v.employeeName, employeeId: v.employeeId,
      date: (s.submittedAt || "").slice(0, 10) || v.date,
      where: s.locationText || s.place?.office || [v.area, v.region].filter(Boolean).join(", "),
      comments: Array.isArray(s.comments) ? s.comments : [],
    })))
    .sort((a, b) => (b.submittedAt || b.date || "").localeCompare(a.submittedAt || a.date || ""));
}

export const storyLink = (s) => `${window.location.origin}/staff.html#story=${s.visitId}.${s.id}`;
export function shareOnWhatsApp(s) {
  const text = `${s.title || "Field story"}\n${storyLink(s)}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

/** `#story=<visitId>.<storyId>` in the address: remembered so it survives the sign-in page. */
export function captureStoryLink() {
  const m = /story=([^.&]+)\.([^&]+)/.exec(window.location.hash || "");
  if (!m) return;
  try { sessionStorage.setItem(STORY_LINK_KEY, `${m[1]}.${m[2]}`); } catch { /* ignore */ }
  window.history.replaceState(null, "", window.location.pathname);
}
export function takeStoryLink() {
  try {
    const v = sessionStorage.getItem(STORY_LINK_KEY);
    sessionStorage.removeItem(STORY_LINK_KEY);
    if (!v) return null;
    const [visitId, id] = v.split(".");
    return { visitId, id };
  } catch { return null; }
}

export function useStoryActions(me, onRefresh, showToast) {
  const like = async (s) => {
    try { await postAction("toggle-story-like", { visitId: s.visitId, storyId: s.id, employeeId: me.id }); await onRefresh(); }
    catch (err) { showToast(actionError(err)); }
  };
  const comment = async (s, text) => {
    try { await postAction("add-story-comment", { visitId: s.visitId, storyId: s.id, employeeId: me.id, text }); await onRefresh(); return true; }
    catch (err) { showToast(actionError(err)); return false; }
  };
  return { like, comment };
}

const likedByMe = (s, me) => (s.likedBy || []).includes(me.id);

export function StoryCard({ s, i = 0, me, onOpen, onLike }) {
  return (
    <div className="story-card">
      <button type="button" className="story-photo" onClick={onOpen} style={s.photoUrl ? undefined : { background: s.gradient || GRADIENTS[i % GRADIENTS.length] }} aria-label={`Open story: ${s.title || "story"}`}>
        {s.photoUrl ? <img src={s.photoUrl} alt="" /> : <Camera size={28} color="rgba(255,255,255,0.85)" />}
        {s.where && <span className="story-photo-tag"><MapPin size={11} /> {s.where}</span>}
      </button>
      <div className="story-head">
        <div className="avatar">{initials(s.staffName)}</div>
        <div>
          <div className="story-name">{s.staffName}</div>
          <div className="story-loc">{s.date}</div>
        </div>
      </div>
      <button type="button" className="story-text" onClick={onOpen}>
        {s.title && <b>{s.title}</b>}
        <span>{firstWords(s.caption, 30)}</span>
      </button>
      <div className="story-actions">
        <button className={`story-action ${likedByMe(s, me) ? "liked" : ""}`} onClick={() => onLike(s)} aria-pressed={likedByMe(s, me)}>
          <Heart size={17} fill={likedByMe(s, me) ? "var(--brand)" : "none"} /> {s.likes || 0}
        </button>
        <button className="story-action" onClick={onOpen}><MessageCircle size={17} /> {s.comments.length}</button>
        <button className="story-action" style={{ marginLeft: "auto" }} onClick={() => shareOnWhatsApp(s)} title="Share on WhatsApp"><Share2 size={17} /> Share</button>
      </div>
    </div>
  );
}

/** One story in full, with its comments. */
export function StorySheet({ s, me, onClose, onLike, onComment }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const post = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    if (await onComment(s, text.trim())) setText("");
    setBusy(false);
  };
  return (
    <Portal>
      <div className="modal-veil" onClick={onClose}>
        <div className="modal-box story-sheet" role="dialog" aria-modal="true" aria-label={s.title || "Story"} onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <div>
              <p className="h-eyebrow" style={{ marginBottom: 2 }}>Story · {s.staffName} · {s.date}</p>
              <h1 className="h-title" style={{ fontSize: 19 }}>{s.title || "Story"}</h1>
            </div>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><X size={15} /></button>
          </div>
          <div className="modal-body entry-body">
            {s.photoUrl ? <img className="view-photo" src={s.photoUrl} alt="" /> : <div className="view-photo" style={{ background: s.gradient || GRADIENTS[0] }} />}
            {s.where && <div className="view-place"><MapPin size={16} /><span><b>{s.where}</b></span></div>}
            <p className="view-text">{s.caption}</p>
            <div className="story-actions" style={{ padding: 0 }}>
              <button className={`story-action ${likedByMe(s, me) ? "liked" : ""}`} onClick={() => onLike(s)} aria-pressed={likedByMe(s, me)}>
                <Heart size={17} fill={likedByMe(s, me) ? "var(--brand)" : "none"} /> {s.likes || 0} {s.likes === 1 ? "like" : "likes"}
              </button>
              <button className="story-action" style={{ marginLeft: "auto" }} onClick={() => shareOnWhatsApp(s)}><Share2 size={17} /> Share on WhatsApp</button>
            </div>
            <div className="comments">
              <p className="field-label" style={{ margin: 0 }}>Comments ({s.comments.length})</p>
              {s.comments.length === 0 && <p className="field-hint" style={{ margin: 0 }}>No comments yet.</p>}
              {s.comments.map((c) => (
                <div key={c.id} className="comment">
                  <div className="avatar sm">{initials(c.by)}</div>
                  <div><b>{c.by}</b> <span className="cm-time">{new Date(c.time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span><p>{c.text}</p></div>
                </div>
              ))}
              <div className="comment-new">
                <input className="input" placeholder="Write a comment" maxLength={600} value={text} onChange={(e) => setText(e.target.value)}
                       onKeyDown={(e) => { if (e.key === "Enter") post(); }} />
                <button className="btn btn-primary" onClick={post} disabled={!text.trim() || busy}><Send size={14} /> Post</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
