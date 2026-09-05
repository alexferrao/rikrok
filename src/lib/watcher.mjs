// The watcher: scans every session source (read-only), spots sessions idle for
// IDLE_MINUTES with meaningful new work, and pushes each through the pipeline one
// at a time. Retries with backoff when the LLM or voice server is down. First run
// backfills the most recent qualifying sessions so the feed is never empty.
import { ensureDirs, IDLE_MINUTES, MAX_REELS_PER_HOUR } from "./config.mjs";
import { sources } from "../sources/index.mjs";
import { loadState, saveState, sessionKey } from "./state.mjs";
import { buildReel } from "./pipeline.mjs";
import { runBackfill } from "./backfill.mjs";

const SCAN_INTERVAL_MS = 60_000;
const MAX_RETRIES = 5;
// Sessions already idle for longer than this are backlog, not news; history is
// the backfill's job, so the first scan never floods the feed with old sessions.
const BACKLOG_CUTOFF_MS = 48 * 3600_000;

export async function scanOnce(ctx) {
  if (ctx.busy) return;
  ctx.busy = true;
  try {
    const state = loadState();
    if (!state.backfillDone) {
      console.log("[watcher] first run, backfilling...");
      await runBackfill(state);
      state.backfillDone = true;
      saveState(state);
      console.log("[watcher] backfill complete");
    }

    const now = Date.now();
    const idleCutoff = now - IDLE_MINUTES * 60_000;
    for (const src of sources()) {
      for (const f of src.listSessions()) {
        if (f.mtimeMs > idleCutoff) continue; // still active
        const key = sessionKey(f);
        const st = state.sessions[key];
        if (st && st.lastMtimeMs >= f.mtimeMs) continue; // this idle period already recapped
        if (now - f.mtimeMs > BACKLOG_CUTOFF_MS) {
          state.sessions[key] = { lastMtimeMs: f.mtimeMs, lastLine: st?.lastLine || 0, backlog: true };
          saveState(state);
          continue;
        }
        const r = ctx.retryAt.get(key);
        if (r && now < r.nextTry) continue;

        const fromLine = st?.lastLine || 0;
        let act;
        try {
          act = await src.parseSession(f.path, fromLine);
        } catch (err) {
          console.error(`[watcher] parse failed ${key}: ${err.message}`);
          continue;
        }
        if (!src.qualifies(act)) {
          // Not meaningful: remember the mtime so we don't re-parse every scan,
          // but keep the line offset so a later burst of real work gets recapped.
          state.sessions[key] = { lastMtimeMs: f.mtimeMs, lastLine: fromLine, skipped: true };
          saveState(state);
          continue;
        }

        while (ctx.reelTimes.length && now - ctx.reelTimes[0] > 3600_000) ctx.reelTimes.shift();
        if (ctx.reelTimes.length >= MAX_REELS_PER_HOUR) {
          console.log(`[watcher] rate limit (${MAX_REELS_PER_HOUR}/h) reached, deferring remaining sessions`);
          return;
        }
        console.log(`[watcher] recapping ${key} (lines ${fromLine}..)`);
        ctx.reelTimes.push(now);
        try {
          const { totalLines } = await buildReel(f, fromLine);
          state.sessions[key] = { lastMtimeMs: f.mtimeMs, lastLine: totalLines, lastRecapAt: new Date().toISOString() };
          saveState(state);
          ctx.retryAt.delete(key);
        } catch (err) {
          const attempts = (r?.attempts || 0) + 1;
          const backoffMin = Math.min(60, 2 ** attempts);
          console.error(`[watcher] reel failed for ${key} (attempt ${attempts}): ${err.message}, retry in ${backoffMin}min`);
          if (attempts >= MAX_RETRIES) {
            console.error(`[watcher] giving up on ${key} this idle period`);
            state.sessions[key] = { lastMtimeMs: f.mtimeMs, lastLine: fromLine, failed: true };
            saveState(state);
            ctx.retryAt.delete(key);
          } else {
            ctx.retryAt.set(key, { attempts, nextTry: now + backoffMin * 60_000 });
          }
        }
      }
    }
  } catch (err) {
    console.error(`[watcher] scan error: ${err.message}`);
  } finally {
    ctx.busy = false;
  }
}

export function startWatcher() {
  ensureDirs();
  const ctx = { busy: false, retryAt: new Map(), reelTimes: [] };
  console.log(`[watcher] started: scanning every ${SCAN_INTERVAL_MS / 1000}s, idle bar ${IDLE_MINUTES}min, sources ${sources().map((s) => s.id).join(",")}`);
  scanOnce(ctx);
  return setInterval(() => scanOnce(ctx), SCAN_INTERVAL_MS);
}
