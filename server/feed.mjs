// Rik Rok feed server: the vertical swipe feed plus reel MP4s.
// Binds 127.0.0.1 by default; set RIKROK_BIND=0.0.0.0 to reach it from your phone
// over Tailscale or your LAN (there is no auth, so keep it on a private network).
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { REELS_DIR, PUBLIC_DIR, FEED_PORT, FEED_BIND, ensureDirs } from "../src/lib/config.mjs";
import { routeComment, hookConfigured } from "../src/hooks/comment.mjs";

export function createApp() {
ensureDirs();
const app = express();
app.use(express.json());

function allSidecars() {
  try {
    return fs
      .readdirSync(REELS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try { return JSON.parse(fs.readFileSync(path.join(REELS_DIR, f), "utf-8")); } catch { return null; }
      })
      .filter(Boolean);
  } catch { return []; }
}

function readSidecar(id) {
  const clean = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const p = path.join(REELS_DIR, `${clean}.json`);
  if (!fs.existsSync(p)) return null;
  return { path: p, data: JSON.parse(fs.readFileSync(p, "utf-8")) };
}

app.get("/api/feed", (req, res) => {
  let items = [];
  try {
    items = fs
      .readdirSync(REELS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          const d = JSON.parse(fs.readFileSync(path.join(REELS_DIR, f), "utf-8"));
          if (!fs.existsSync(path.join(REELS_DIR, `${d.id}.mp4`))) return null;
          return d;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    // Auto-tidy: keep at most 3 unwatched reels per project; older unwatched
    // ones are archived (recoverable via ?archived=1 or the sidecar flag).
    const byProj = {};
    for (const d of items) {
      if (!d.archived && !d.watched) (byProj[d.project] = byProj[d.project] || []).push(d);
    }
    for (const arr of Object.values(byProj)) {
      arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      for (const d of arr.slice(3)) {
        d.archived = true;
        fs.writeFileSync(path.join(REELS_DIR, `${d.id}.json`), JSON.stringify(d, null, 2));
      }
    }
    items = items.filter((d) => !d.archived || req.query.archived === "1");
  } catch {}
  // Session chains: tell each reel whether a newer recap of its session exists.
  const latestBySession = {};
  for (const d of items) {
    if (!latestBySession[d.sessionId] || d.createdAt > latestBySession[d.sessionId].createdAt) latestBySession[d.sessionId] = d;
  }
  for (const d of items) {
    const latest = latestBySession[d.sessionId];
    d.newerId = latest && latest.id !== d.id ? latest.id : null;
    d.chainCount = items.filter((x) => x.sessionId === d.sessionId).length;
  }
  // Unwatched first, newest first within each group.
  items.sort((a, b) => {
    if (a.watched !== b.watched) return a.watched ? 1 : -1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  res.json(items);
});

app.post("/api/watched/:id", (req, res) => {
  const id = req.params.id.replace(/[^a-zA-Z0-9_-]/g, "");
  const p = path.join(REELS_DIR, `${id}.json`);
  if (!fs.existsSync(p)) return res.status(404).json({ error: "not found" });
  try {
    const d = JSON.parse(fs.readFileSync(p, "utf-8"));
    d.watched = req.body?.watched !== false;
    fs.writeFileSync(p, JSON.stringify(d, null, 2));
    res.json({ ok: true, watched: d.watched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/archive/:id", (req, res) => {
  const sc = readSidecar(req.params.id);
  if (!sc) return res.status(404).json({ error: "not found" });
  sc.data.archived = req.body?.archived !== false;
  fs.writeFileSync(sc.path, JSON.stringify(sc.data, null, 2));
  res.json({ ok: true, archived: sc.data.archived });
});

app.post("/api/comment/:id", (req, res) => {
  const sc = readSidecar(req.params.id);
  if (!sc) return res.status(404).json({ error: "not found" });
  const text = String(req.body?.text || "").trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: "empty" });
  const comment = { text, at: new Date().toISOString() };
  sc.data.comments = [...(sc.data.comments || []), comment];
  // Hand the comment to RIKROK_COMMENT_HOOK (if set) with enough context to act on:
  // which slice this reel covered, and whether newer recaps of the same session exist.
  let routedTo = null;
  if (hookConfigured()) {
    const newer = allSidecars()
      .filter((d) => d.sessionId === sc.data.sessionId && d.id !== sc.data.id && d.createdAt > sc.data.createdAt)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    routedTo = routeComment({
      reelId: sc.data.id,
      source: sc.data.source || "claude",
      sessionId: sc.data.sessionId,
      project: sc.data.project,
      cwd: sc.data.sourcePath || null,
      headline: sc.data.headline,
      coveredLines: sc.data.coveredLines || null,
      newerRecaps: newer.map((d) => ({ id: d.id, headline: d.headline, createdAt: d.createdAt })),
      resumeHint: sc.data.resumeHint || null,
      comment: text,
      at: comment.at,
    });
    if (routedTo) comment.routedTo = routedTo;
  }
  fs.writeFileSync(sc.path, JSON.stringify(sc.data, null, 2));
  res.json({ ok: true, routed: Boolean(routedTo), count: sc.data.comments.length });
});

// MP4s (express.static handles HTTP Range for video seeking/instant playback)
app.use("/reels", express.static(REELS_DIR, { setHeaders: (r) => r.setHeader("Cache-Control", "public, max-age=31536000, immutable") }));
app.use(express.static(PUBLIC_DIR));
return app;
}

export function startFeed({ port = FEED_PORT, bind = FEED_BIND } = {}) {
  const app = createApp();
  return new Promise((resolve, reject) => {
    const server = app.listen(port, bind, () => {
      console.log(`[feed] Rik Rok feed on http://${bind}:${port}`);
      resolve(server);
    });
    server.on("error", reject);
  });
}
