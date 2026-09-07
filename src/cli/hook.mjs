// rikrok hook install | uninstall | run
// A Claude Code SessionEnd hook that recaps the session you just left. `run` reads the hook's
// JSON from stdin, starts `rikrok recap` detached, and returns within the hook's time budget.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { BIN, LOG_DIR, RIKROK_HOME, ensureDirs } from "../lib/config.mjs";

const SETTINGS = path.join(os.homedir(), ".claude", "settings.json");
const isOurs = (entry) => Array.isArray(entry?.hooks) && entry.hooks.some((h) => /rikrok(\.mjs)?"? hook run/.test(String(h.command || "")));

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS, "utf-8"));
  } catch {
    return {};
  }
}

export function install() {
  const s = readSettings();
  s.hooks = s.hooks || {};
  const list = (s.hooks.SessionEnd = s.hooks.SessionEnd || []);
  if (list.some(isOurs)) {
    console.log("already installed");
    return 0;
  }
  const command = `RIKROK_HOME=${JSON.stringify(RIKROK_HOME)} ${JSON.stringify(process.execPath)} ${JSON.stringify(BIN)} hook run`;
  list.push({ matcher: "clear|logout|prompt_input_exit|other", hooks: [{ type: "command", command, timeout: 5 }] });
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + "\n");
  console.log(`installed a SessionEnd hook in ${SETTINGS}\nWhen you leave a Claude Code session with real work in it, a reel is built in the background.`);
  return 0;
}

export function uninstall() {
  const s = readSettings();
  const list = s.hooks?.SessionEnd;
  if (!Array.isArray(list)) return 0;
  const kept = list.filter((e) => !isOurs(e));
  if (kept.length) s.hooks.SessionEnd = kept;
  else delete s.hooks.SessionEnd;
  if (!Object.keys(s.hooks).length) delete s.hooks;
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + "\n");
  console.log("removed");
  return 0;
}

export async function runHook() {
  if (process.env.RIKROK_HOOK_SKIP) return 0; // a session Rik Rok itself started (script writing)
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  let j = {};
  try {
    j = JSON.parse(input);
  } catch {}
  if (!j.transcript_path || j.reason === "resume") return 0;
  ensureDirs();
  const out = fs.openSync(path.join(LOG_DIR, "recap.log"), "a");
  const child = spawn(process.execPath, [BIN, "recap", "--transcript", j.transcript_path, "--session", j.session_id || ""], {
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env, RIKROK_HOOK_SKIP: "" },
  });
  child.unref();
  return 0;
}

export async function run(args) {
  const sub = args._[0];
  if (sub === "install") return install();
  if (sub === "uninstall") return uninstall();
  if (sub === "run") return runHook();
  console.log("usage: rikrok hook install | uninstall | run");
  return 1;
}
