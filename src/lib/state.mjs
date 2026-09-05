import fs from "node:fs";
import { STATE_FILE } from "./config.mjs";

export function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return { backfillDone: false, sessions: {} };
  }
}

export function saveState(state) {
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

// State is keyed per source so two agents' session ids can never collide.
export const sessionKey = (f) => `${f.source}:${f.sessionId}`;
