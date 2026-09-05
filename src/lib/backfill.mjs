// Backfill: reels for the most recently modified qualifying sessions, generated
// oldest to newest so the feed fills up in order.
import { sources } from "../sources/index.mjs";
import { saveState, sessionKey } from "./state.mjs";
import { buildReel } from "./pipeline.mjs";

export async function runBackfill(state, { limit = 10 } = {}) {
  const picked = [];
  for (const src of sources()) {
    const files = src.listSessions().sort((a, b) => b.mtimeMs - a.mtimeMs);
    let n = 0;
    for (const f of files) {
      if (n >= limit) break;
      if (state.sessions[sessionKey(f)]?.lastRecapAt) continue;
      let act;
      try {
        act = await src.parseSession(f.path, 0);
      } catch {
        continue;
      }
      if (src.qualifies(act)) {
        picked.push(f);
        n++;
      }
    }
  }
  picked.sort((a, b) => a.mtimeMs - b.mtimeMs); // oldest first
  console.log(`[backfill] ${picked.length} qualifying session(s)`);
  for (const f of picked) {
    try {
      console.log(`[backfill] ${f.source}:${f.projectDir}/${f.sessionId.slice(0, 8)}`);
      const { totalLines } = await buildReel(f, 0);
      state.sessions[sessionKey(f)] = { lastMtimeMs: f.mtimeMs, lastLine: totalLines, lastRecapAt: new Date().toISOString() };
      saveState(state);
    } catch (err) {
      console.error(`[backfill] failed ${f.sessionId}: ${err.message}`);
    }
  }
  return picked.length;
}
