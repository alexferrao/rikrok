// rikrok recap --transcript <path> [--session <id>] [--cwd <dir>] [--force]
// Recap one session now (what the SessionEnd hook calls). Covers only the lines since the
// last recap of that session, respects the same "real work" bar as the watcher, and takes a
// lock so two recaps never render at once.
import fs from "node:fs";
import path from "node:path";
import { RIKROK_HOME, ensureDirs } from "../lib/config.mjs";
import * as claude from "../sources/claude.mjs";
import { loadState, saveState, sessionKey } from "../lib/state.mjs";
import { buildReel } from "../lib/pipeline.mjs";

const LOCK = () => path.join(RIKROK_HOME, "recap.lock");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withLock(fn) {
  const lock = LOCK();
  for (let i = 0; i < 120; i++) {
    try {
      const st = fs.statSync(lock);
      if (Date.now() - st.mtimeMs > 30 * 60_000) fs.rmSync(lock, { force: true }); // stale
      else {
        await sleep(15_000);
        continue;
      }
    } catch {}
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: "wx" });
      break;
    } catch {}
  }
  try {
    return await fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

export async function run(args) {
  ensureDirs();
  const transcript = typeof args.transcript === "string" ? path.resolve(args.transcript) : null;
  if (!transcript || !fs.existsSync(transcript)) {
    console.error("usage: rikrok recap --transcript <session.jsonl> [--session <id>] [--force]");
    return 1;
  }
  const sessionId = typeof args.session === "string" ? args.session : path.basename(transcript, ".jsonl");
  const f = { source: "claude", path: transcript, sessionId, projectDir: path.basename(path.dirname(transcript)), mtimeMs: fs.statSync(transcript).mtimeMs };
  return withLock(async () => {
    const state = loadState();
    const key = sessionKey(f);
    const st = state.sessions[key];
    const fromLine = args.force ? 0 : st?.lastLine || 0;
    const act = await claude.parseSession(transcript, fromLine);
    if (!args.force && !claude.qualifies(act)) {
      console.log(`[recap] ${sessionId.slice(0, 8)}: not enough new work since line ${fromLine} (${act.assistantTurns} turns, ${act.toolUses} tool calls); skipped`);
      state.sessions[key] = { lastMtimeMs: f.mtimeMs, lastLine: fromLine, skipped: true };
      saveState(state);
      return 0;
    }
    console.log(`[recap] ${sessionId.slice(0, 8)}: lines ${fromLine}..${act.totalLines}`);
    const { totalLines, outPath } = await buildReel(f, fromLine);
    state.sessions[key] = { lastMtimeMs: f.mtimeMs, lastLine: totalLines, lastRecapAt: new Date().toISOString() };
    saveState(state);
    console.log(`[recap] done: ${outPath}`);
    return 0;
  });
}
