import { ensureDirs } from "../lib/config.mjs";
import { loadState, saveState } from "../lib/state.mjs";
import { runBackfill } from "../lib/backfill.mjs";
export async function run(args) {
  ensureDirs();
  const state = loadState();
  const limit = args.limit ? Number(args.limit) : 10;
  const n = await runBackfill(state, { limit });
  state.backfillDone = true;
  saveState(state);
  console.log(`[backfill] done (${n} reel(s))`);
  return 0;
}
