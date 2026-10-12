import { useCallback, useEffect, useRef, useState } from "react";
import { kvGet, kvSet, mediaGet } from "./offline";

const API = "/api";
const CACHE_KEY = "visits";          // last known list of visits, for opening the app offline
const OUTBOX_KEY = "visits-outbox";  // { [visitId]: { op: "put" | "delete", visit?, rev } } not yet on the server
const UPLOADED_KEY = "voice-uploaded"; // { [blobId]: url } voice notes already uploaded

/**
 * The staff app's visits, usable without signal.
 *
 * - Opens from the copy kept on the phone, then refreshes from the server.
 * - saveVisit() updates the screen at once, keeps the change on the phone and
 *   sends it when there is a connection (on save, when the phone comes back
 *   online, and every 20 seconds while anything is waiting).
 * - Each visit is sent on its own (PUT /api/visits/:id), so a phone that syncs
 *   late never overwrites other people's visits.
 * - Voice notes recorded offline are uploaded first, then the visit is sent
 *   pointing at the uploaded file.
 */
export function useVisitStore() {
  const [visits, setVisits] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [syncing, setSyncing] = useState(false);

  const listRef = useRef([]);
  const outbox = useRef({});
  const uploaded = useRef({});
  const flushing = useRef(false);

  const commit = useCallback((next) => {
    listRef.current = next;
    setVisits(next);
    kvSet(CACHE_KEY, next);
  }, []);
  const saveOutbox = useCallback(() => {
    kvSet(OUTBOX_KEY, outbox.current);
    setPending(Object.keys(outbox.current).length);
  }, []);

  // A visit as the server sent it, unless there's a newer unsent local version.
  const applyServer = useCallback((visit) => {
    if (outbox.current[visit.id]) return;
    const list = listRef.current;
    const i = list.findIndex((v) => v.id === visit.id);
    commit(i >= 0 ? list.map((v) => (v.id === visit.id ? visit : v)) : [visit, ...list]);
  }, [commit]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API}/visits`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const server = await res.json();
      const box = outbox.current;
      const merged = server
        .filter((v) => box[v.id]?.op !== "delete")
        .map((v) => (box[v.id]?.op === "put" ? box[v.id].visit : v));
      Object.values(box).forEach((e) => {
        if (e.op === "put" && !merged.some((v) => v.id === e.visit.id)) merged.unshift(e.visit);
      });
      commit(merged);
      setOnline(true);
      return true;
    } catch {
      return false;
    }
  }, [commit]);

  // Uploads any voice note still only on this phone; returns the visit pointing at the uploaded files.
  const withUploadedVoice = useCallback(async (visit) => {
    const fix = async (e) => {
      const vn = e.voice;
      if (!vn || vn.url || !vn.blobId) return e;
      let url = uploaded.current[vn.blobId];
      if (!url) {
        const blob = await mediaGet(vn.blobId);
        if (!blob) return e; // recording lost from this phone; keep the entry without audio
        const res = await fetch(`${API}/uploads`, { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
        if (!res.ok) throw new Error("upload failed");
        url = (await res.json()).url;
        uploaded.current = { ...uploaded.current, [vn.blobId]: url };
        kvSet(UPLOADED_KEY, uploaded.current);
      }
      return { ...e, voice: { ...vn, url } };
    };
    return {
      ...visit,
      complaints: await Promise.all((visit.complaints || []).map(fix)),
      interactions: await Promise.all((visit.interactions || []).map(fix)),
      observations: await Promise.all((visit.observations || []).map(fix)),
    };
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current || Object.keys(outbox.current).length === 0) return;
    flushing.current = true;
    setSyncing(true);
    try {
      for (const id of Object.keys(outbox.current)) {
        const entry = outbox.current[id];
        if (!entry) continue;
        if (entry.op === "delete") {
          const res = await fetch(`${API}/visits/${encodeURIComponent(id)}`, { method: "DELETE" });
          if (!res.ok && res.status !== 409) throw new Error(`HTTP ${res.status}`);
        } else {
          const body = await withUploadedVoice(entry.visit);
          const res = await fetch(`${API}/visits/${encodeURIComponent(id)}`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
          });
          if (res.status === 409) {
            // already marked done (from another phone, say): the server's copy wins
            const json = await res.json().catch(() => ({}));
            if (outbox.current[id]?.rev === entry.rev) { const { [id]: _, ...rest } = outbox.current; outbox.current = rest; saveOutbox(); }
            if (json.visit) applyServer(json.visit);
            continue;
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const saved = await res.json();
          if (outbox.current[id]?.rev === entry.rev) {
            const { [id]: _, ...rest } = outbox.current;
            outbox.current = rest;
            saveOutbox();
            applyServer(saved);
          }
          continue;
        }
        if (outbox.current[id]?.rev === entry.rev) { const { [id]: _, ...rest } = outbox.current; outbox.current = rest; saveOutbox(); }
      }
      setOnline(true);
    } catch {
      setOnline(false); // try again later
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
  }, [applyServer, saveOutbox, withUploadedVoice]);

  const queue = useCallback((id, entry) => {
    outbox.current = { ...outbox.current, [id]: { ...entry, rev: (outbox.current[id]?.rev || 0) + 1 } };
    saveOutbox();
    flush();
  }, [flush, saveOutbox]);

  /** Save a visit (new or changed). The screen updates at once; the server follows when it can. */
  const saveVisit = useCallback((visit) => {
    const v = { ...visit, updatedAt: new Date().toISOString() };
    const list = listRef.current;
    const i = list.findIndex((x) => x.id === v.id);
    commit(i >= 0 ? list.map((x) => (x.id === v.id ? v : x)) : [v, ...list]);
    queue(v.id, { op: "put", visit: v });
    return v;
  }, [commit, queue]);

  /** Delete a visit that isn't done and has nothing submitted. */
  const deleteVisit = useCallback((id) => {
    commit(listRef.current.filter((v) => v.id !== id));
    queue(id, { op: "delete" });
  }, [commit, queue]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cached, box, up] = await Promise.all([kvGet(CACHE_KEY), kvGet(OUTBOX_KEY), kvGet(UPLOADED_KEY)]);
      if (cancelled) return;
      outbox.current = box || {};
      uploaded.current = up || {};
      setPending(Object.keys(outbox.current).length);
      if (Array.isArray(cached)) { listRef.current = cached; setVisits(cached); setLoaded(true); }
      await refresh();
      if (cancelled) return;
      setLoaded(true);
      flush();
    })();

    const goOnline = () => { setOnline(true); flush().then(refresh); };
    const goOffline = () => setOnline(false);
    const onVisible = () => { if (document.visibilityState === "visible") { flush(); refresh(); } };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => { if (Object.keys(outbox.current).length) flush(); }, 20000);
    return () => {
      cancelled = true;
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { visits, loaded, saveVisit, deleteVisit, refresh, pending, online, syncing };
}
