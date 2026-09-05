// Session sources. Each module exports:
//   id            "claude" | "codex" | ...
//   listSessions()               -> [{ source, path, sessionId, projectDir, mtimeMs, size }]
//   parseSession(path, fromLine) -> Activity (see claude.mjs for the shape)
//   qualifies(act)               -> boolean
//   projectName(act, projectDir) -> string
//   resumeHint(sessionId)        -> string shown to humans and comment hooks
// Enable with RIKROK_SOURCES=claude,codex (default: claude).
import { SOURCES } from "../lib/config.mjs";
import * as claude from "./claude.mjs";

const REGISTRY = { claude };

export function sourceById(id) {
  const s = REGISTRY[id];
  if (!s) throw new Error(`unknown session source "${id}" (known: ${Object.keys(REGISTRY).join(", ")})`);
  return s;
}

export function sources() {
  return SOURCES.map(sourceById);
}

export function listAllSessions() {
  return sources().flatMap((s) => s.listSessions());
}
