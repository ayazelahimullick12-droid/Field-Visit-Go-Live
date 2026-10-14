import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { assignComplaint, extendDeadline, resolveComplaint, startComplaint, markLongTerm, runDeadlineCheck, mergeVisit, hasSubmitted, toggleStoryLike, addStoryComment } from "./logic.js";
import { migrateDb } from "./migrate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "db.json");
const DIST_PATH = path.join(__dirname, "../dist");
// Voice notes are stored as files here rather than inside db.json.
const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors());
// Large enough for a visit with several downscaled photos, or the admin's
// whole-collection saves.
app.use(express.json({ limit: "20mb" }));

function readDb() {
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw);
}

function writeDb(db) {
  // Pretty-printed so db.json stays readable/diffable if you peek at it.
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

// Bring an older db.json up to the current visit shape before serving
// anything. The file as it was before the upgrade is kept once, named after its
// visit schema (db.backup-v1.json, db.backup-v2.json).
try {
  const db = readDb();
  const before = Math.max(1, ...(db.visits || []).map((v) => v.schema || 1));
  if (migrateDb(db)) {
    const backup = path.join(__dirname, `db.backup-v${before}.json`);
    if (!fs.existsSync(backup)) fs.copyFileSync(DB_PATH, backup);
    writeDb(db);
    console.log(`[migrate] db.json upgraded to the current visit shape (the previous file is kept as ${path.basename(backup)})`);
  }
} catch (err) {
  console.error("[migrate] failed:", err);
}

// --- Visits, one at a time -------------------------------------------------
// The staff app saves each visit on its own, and queues the save while the
// phone is offline, so a phone that syncs late only ever replaces its own
// visit, never anyone else's. Each entry is submitted on its own and is then
// locked (see mergeVisit in logic.js); once a visit is marked done, the whole
// visit is locked.

app.put("/api/visits/:id", (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || !Array.isArray(body.stops)) {
      return res.status(400).json({ error: "A visit needs a list of stops." });
    }
    const db = readDb();
    db.visits = db.visits || [];
    const i = db.visits.findIndex((v) => v.id === req.params.id);
    const prev = i >= 0 ? db.visits[i] : null;
    if (prev && prev.status === "done") {
      return res.status(409).json({ error: "This visit was already marked as done and can no longer change.", visit: prev });
    }
    const next = mergeVisit(prev, body, req.params.id);
    if (i >= 0) db.visits[i] = next; else db.visits.unshift(next);
    writeDb(db);
    res.json(next);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save the visit" });
  }
});

app.delete("/api/visits/:id", (req, res) => {
  try {
    const db = readDb();
    const v = (db.visits || []).find((x) => x.id === req.params.id);
    if (!v) return res.json({ deleted: false });
    // a visit can be deleted at any point until it is marked done, together with everything recorded on it
    if (v.status === "done") return res.status(409).json({ error: "A visit marked as done can't be deleted.", visit: v });
    db.visits = db.visits.filter((x) => x.id !== req.params.id);
    writeDb(db);
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete the visit" });
  }
});

// --- Voice notes -------------------------------------------------------------
const AUDIO_EXT = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/aac": "aac", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav" };

app.post("/api/uploads", express.raw({ type: ["audio/*", "application/octet-stream"], limit: "25mb" }), (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "The recording was empty." });
    const type = String(req.headers["content-type"] || "").split(";")[0].trim();
    const ext = AUDIO_EXT[type] || "bin";
    const name = `VN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), req.body);
    res.json({ url: `/uploads/${name}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to store the recording" });
  }
});
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "30d", immutable: true }));

// --- Actions that change one field of a submitted entry (submitted entries are otherwise read-only)
const action = (fn) => (req, res) => {
  try {
    const db = readDb();
    const out = fn(db, req.body || {});
    writeDb(db);
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
app.post("/api/actions/toggle-story-like", action(toggleStoryLike));
app.post("/api/actions/add-story-comment", action(addStoryComment));
app.post("/api/actions/start-complaint", action(startComplaint));
app.post("/api/actions/long-term-complaint", action(markLongTerm));

// GET /api/:collection -> returns that array/object from db.json
app.get("/api/:collection", (req, res) => {
  try {
    const db = readDb();
    const { collection } = req.params;
    if (!(collection in db)) {
      return res.status(404).json({ error: `Unknown collection "${collection}"` });
    }
    res.json(db[collection]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to read database" });
  }
});

// PUT /api/:collection -> replaces that collection entirely with req.body
// and persists it to db.json. This matches how the frontend keeps each
// piece of state as a single array (visits, complaints, stories, etc.),
// so the whole array is sent back on every change.
app.put("/api/:collection", (req, res) => {
  try {
    const db = readDb();
    const { collection } = req.params;
    db[collection] = req.body;
    writeDb(db);
    res.json(db[collection]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to write database" });
  }
});

// --- Complaint workflow actions -------------------------------------------
// These are the only endpoints with real business logic; everything else is
// the generic collection GET/PUT above. Each one reads the whole db, mutates
// it via server/logic.js, writes it back, and returns what changed.

app.post("/api/actions/assign-complaint", (req, res) => {
  try {
    const db = readDb();
    const { complaint, email } = assignComplaint(db, req.body);
    writeDb(db);
    res.json({ complaint, email });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/actions/extend-deadline", (req, res) => {
  try {
    const db = readDb();
    const { complaint, email } = extendDeadline(db, req.body);
    writeDb(db);
    res.json({ complaint, email });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/actions/resolve-complaint", (req, res) => {
  try {
    const db = readDb();
    const { complaint } = resolveComplaint(db, req.body);
    writeDb(db);
    res.json({ complaint });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/actions/run-deadline-check", (req, res) => {
  try {
    const db = readDb();
    const generated = runDeadlineCheck(db);
    writeDb(db);
    res.json({ emailsGenerated: generated.length, emails: generated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Serve the built frontend (Vite's multi-page output) ---
// This must come AFTER the /api routes above, so API calls are never
// swallowed by the static file handler.
app.use(express.static(DIST_PATH));

// Fallback: if someone hits a route that isn't a static file or an API
// route (e.g. a bare "/"), send the landing page. staff.html and
// admin.html are served directly by express.static above since they
// exist as real files in dist/.
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(DIST_PATH, "index.html"));
});

// Render (and most hosts) assign the port via this env var at runtime.
// Hardcoding 4000 works locally but breaks deployment.
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Field Visit Tracker API server running at http://localhost:${PORT}`);
  console.log(`Reading/writing: ${DB_PATH}`);
  console.log(`Serving frontend from: ${DIST_PATH}`);
});

// Automatic reminder/escalation sweep. Runs every 5 minutes while the
// service is awake. On free-tier hosts (e.g. Render's free plan) the
// service can sleep after inactivity, in which case this simply won't run
// until something wakes it back up — use the "Run deadline check now"
// button in the admin console to trigger it on demand for a demo.
const DEADLINE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  try {
    const db = readDb();
    const generated = runDeadlineCheck(db);
    if (generated.length > 0) {
      writeDb(db);
      console.log(`[deadline-check] generated ${generated.length} email(s)`);
    }
  } catch (err) {
    console.error("[deadline-check] failed:", err);
  }
}, DEADLINE_CHECK_INTERVAL_MS);