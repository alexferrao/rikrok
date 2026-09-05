#!/usr/bin/env node
// Rik Rok CLI. Your coding-agent sessions, recapped as reels you can doomscroll.
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 19)) {
  console.error(`rikrok needs Node 20.19 or newer (you have ${process.versions.node})`);
  process.exit(1);
}

const COMMANDS = {
  setup: "Guided setup: local LLM, your voice, first reel, feed",
  voice: "Your own voice: setup (record a clip) | test | devices | serve (local cloning server)",
  watch: "Run the watcher: recap sessions as they go idle (foreground)",
  feed: "Serve the swipe feed",
  backfill: "Recap the most recent qualifying sessions now (--limit N)",
  doctor: "Check node, ffmpeg, sessions, LLM, voice, browser, port",
  demo: "Render a demo reel from the bundled fixture session (--out path)",
  install: "Install launchd agents for watch + feed on macOS (--uninstall to remove)",
  config: "Print the settings in effect",
};

const [cmd, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
  console.log(`rikrok <command> [options]\n`);
  for (const [k, v] of Object.entries(COMMANDS)) console.log(`  ${k.padEnd(10)} ${v}`);
  console.log(`\nSettings are RIKROK_* environment variables or ~/.rikrok/config.json (see README).`);
  process.exit(0);
}
if (cmd === "version" || cmd === "--version" || cmd === "-v") {
  const { PKG_VERSION } = await import("../src/lib/paths.mjs");
  console.log(PKG_VERSION);
  process.exit(0);
}
if (!COMMANDS[cmd]) {
  console.error(`unknown command "${cmd}" (try: rikrok help)`);
  process.exit(1);
}

const mod = await import(`../src/cli/${cmd}.mjs`);
try {
  const code = await mod.run(args);
  if (typeof code === "number") process.exit(code);
} catch (err) {
  console.error(`rikrok ${cmd}: ${err.message}`);
  process.exit(1);
}

function parseArgs(list) {
  const out = { _: [] };
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) out[k] = v;
      else if (list[i + 1] !== undefined && !list[i + 1].startsWith("--")) out[k] = list[++i];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}
