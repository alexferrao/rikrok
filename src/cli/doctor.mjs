// rikrok doctor: every dependency, one line each, with the fix when it fails.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as c from "../lib/config.mjs";
import { sources } from "../sources/index.mjs";
import { loadVoice } from "../voices/index.mjs";
import { chat, stripThinking, extractJson } from "../lib/llm.mjs";
import { sttEnabled, transcribeWords } from "../lib/stt.mjs";

const ok = (label, detail = "") => console.log(`  ok    ${label}${detail ? `  (${detail})` : ""}`);
const warn = (label, fix = "") => console.log(`  warn  ${label}${fix ? `\n        ${fix}` : ""}`);
const fail = (label, fix = "") => console.log(`  FAIL  ${label}${fix ? `\n        ${fix}` : ""}`);

function has(bin) {
  try {
    execFileSync(bin, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    try {
      execFileSync(bin, ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
}

function findChrome() {
  const roots = [path.join(c.PKG_ROOT, "node_modules", ".remotion"), path.join(c.PKG_ROOT, "..", ".remotion")];
  const walk = (dir, depth) => {
    if (depth > 6) return null;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile() && /^chrome-headless-shell(\.exe)?$/.test(e.name)) return full;
      if (e.isDirectory()) {
        const hit = walk(full, depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  };
  for (const r of roots) {
    const hit = walk(r, 0);
    if (hit) return hit;
  }
  return null;
}

function portFree(port, host) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(port, host, () => s.close(() => resolve(true)));
  });
}

export async function run(args) {
  let failures = 0;
  console.log(`rikrok ${c.PKG_VERSION} doctor  (home: ${c.RIKROK_HOME})\n`);

  ok(`node ${process.versions.node}`);
  for (const b of ["ffmpeg", "ffprobe", "git"]) {
    if (has(b)) ok(b);
    else {
      fail(`${b} not found`, b === "git" ? "install git" : "install ffmpeg (brew install ffmpeg / apt install ffmpeg)");
      failures++;
    }
  }

  for (const src of sources()) {
    let n = 0;
    try {
      n = src.listSessions().length;
    } catch {}
    if (n > 0) ok(`${src.id} sessions`, `${n} file(s)`);
    else if (src.id === "claude") {
      warn(`no Claude Code sessions under ${c.CLAUDE_PROJECTS}`, "run a Claude Code session first, or set RIKROK_CLAUDE_DIR");
    } else warn(`no ${src.id} sessions found`);
  }

  if (!c.LLM_MODEL) {
    warn("RIKROK_LLM_MODEL not set: scripts fall back to the plain template", "set RIKROK_LLM_URL (default Ollama at :11434) and RIKROK_LLM_MODEL, e.g. qwen3:8b");
  } else {
    const t0 = Date.now();
    try {
      const text = await chat([{ role: "user", content: 'Reply with exactly this JSON and nothing else: {"ok":true}' }], { temperature: 0, max_tokens: 64, timeoutMs: 60_000 });
      const j = extractJson(stripThinking(text));
      if (j && j.ok === true) ok(`LLM ${c.LLM_MODEL} at ${c.LLM_URL}`, `${Date.now() - t0} ms, JSON parsed`);
      else {
        warn(`LLM answered but not with clean JSON: ${JSON.stringify(text).slice(0, 80)}`, 'if this is a thinking model, try RIKROK_LLM_EXTRA=\'{"chat_template_kwargs":{"enable_thinking":false}}\' (oMLX/vLLM) or \'{"think":false}\' (Ollama)');
      }
    } catch (err) {
      fail(`LLM ${c.LLM_MODEL} at ${c.LLM_URL}: ${err.message}`, "is the server running? Ollama: `ollama serve` then `ollama pull <model>`; the template script ships until it works");
      failures++;
    }
  }

  try {
    const v = await loadVoice(c.VOICE);
    const a = await v.available();
    if (a.ok) ok(`voice ${v.name}`);
    else {
      warn(`voice ${c.VOICE} unavailable: ${a.reason}`, c.VOICE === "clone" ? "run `rikrok voice setup`, and point RIKROK_TTS_URL at a server that accepts a reference clip" : process.platform === "darwin" ? "falls back to say:Samantha, then silent captions" : "falls back to silent captions (rikrok voice setup for your own voice, or RIKROK_VOICE=openai-speech:<voice>)");
    }
  } catch (err) {
    warn(`voice ${c.VOICE}: ${err.message}`);
  }

  if (sttEnabled()) {
    try {
      const r = await fetch(`${c.STT_URL}/v1/models`, { headers: c.authHeaders(c.STT_KEY), signal: AbortSignal.timeout(5000) });
      if (r.ok) ok(`narration QA via ${c.STT_URL} (${c.STT_MODEL})`);
      else warn(`STT server at ${c.STT_URL} answered HTTP ${r.status}; QA will be skipped per beat`);
    } catch (err) {
      warn(`STT server at ${c.STT_URL} unreachable (${err.message})`);
    }
  } else ok("narration QA off", "set RIKROK_STT_URL to enable transcribe-back checks");

  const chrome = process.env.RIKROK_BROWSER || findChrome();
  if (chrome) ok("render browser (headless Chrome)", path.basename(path.dirname(chrome)));
  else warn("no headless Chrome yet: Remotion downloads one on the first render (a few hundred MB, one-off)", "run `rikrok demo` now to get that out of the way, or set RIKROK_BROWSER=/path/to/chrome");

  if (await portFree(c.FEED_PORT, c.FEED_BIND)) ok(`feed port ${c.FEED_BIND}:${c.FEED_PORT} free`);
  else warn(`feed port ${c.FEED_BIND}:${c.FEED_PORT} is in use`, "set RIKROK_PORT, or this is your own feed already running");

  fs.mkdirSync(c.RIKROK_HOME, { recursive: true });
  ok(`data dir ${c.RIKROK_HOME}`);

  console.log(failures ? `\n${failures} problem(s) to fix.` : "\nAll good. Try: rikrok backfill --limit 2 && rikrok feed");
  return failures ? 1 : 0;
}
