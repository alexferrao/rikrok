// Runtime settings. Precedence: environment > ~/.rikrok/config.json > defaults.
// Every knob is a RIKROK_* variable; see README "Configuration".
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONFIG_FILE, RIKROK_HOME, expandHome } from "./paths.mjs";
export * from "./paths.mjs";

// config.json keys (RIKROK_*) fill in anything the environment did not set.
try {
  const j = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  for (const [k, v] of Object.entries(j)) {
    if (!/^RIKROK_/.test(k) || process.env[k] !== undefined || v == null) continue;
    process.env[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
} catch {}

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== "" ? process.env[k] : d);
const num = (k, d) => {
  const n = Number(env(k, d));
  return Number.isFinite(n) ? n : d;
};
const base = (u) => String(u).replace(/\/+$/, "").replace(/\/v1$/, "");

// Sessions
export const CLAUDE_PROJECTS = path.resolve(expandHome(env("RIKROK_CLAUDE_DIR", path.join(os.homedir(), ".claude", "projects"))));
export const SOURCES = env("RIKROK_SOURCES", "claude").split(",").map((s) => s.trim()).filter(Boolean);
export const IDLE_MINUTES = num("RIKROK_IDLE_MINUTES", 15);
export const MIN_ASSISTANT_TURNS = num("RIKROK_MIN_TURNS", 10);
export const MIN_TOOL_USES = num("RIKROK_MIN_TOOLS", 3);
export const MAX_REELS_PER_HOUR = num("RIKROK_MAX_PER_HOUR", 4);
export const PROJECT_NAME_RE = env("RIKROK_PROJECT_NAME_RE", "");

// Feed
export const FEED_PORT = num("RIKROK_PORT", 4870);
export const FEED_BIND = env("RIKROK_BIND", "127.0.0.1");
export const COMMENT_HOOK = env("RIKROK_COMMENT_HOOK", "");
export const HANDLE = env("RIKROK_HANDLE", "");
export const FLOW_BEAT = env("RIKROK_FLOW", "on") !== "off";

// Who writes the script: "claude" (headless `claude -p`, your subscription), "local" (an
// OpenAI-compatible server), or "auto" (claude when no local model is configured and the CLI exists)
export const SCRIPT_BACKEND = env("RIKROK_SCRIPT", "auto");
export const CLAUDE_BIN = env("RIKROK_CLAUDE_BIN", "claude");
export const CLAUDE_MODEL = env("RIKROK_CLAUDE_MODEL", "sonnet");

// Script LLM: any OpenAI-compatible chat endpoint (Ollama, LM Studio, oMLX, ...)
export const LLM_URL = base(env("RIKROK_LLM_URL", "http://127.0.0.1:11434"));
export const LLM_MODEL = env("RIKROK_LLM_MODEL", "");
export const LLM_KEY = env("RIKROK_LLM_KEY", "");
export const LLM_EXTRA = (() => {
  try {
    return JSON.parse(env("RIKROK_LLM_EXTRA", "{}"));
  } catch {
    console.error("[config] RIKROK_LLM_EXTRA is not valid JSON, ignoring it");
    return {};
  }
})();

// Voice: say:<Voice> | openai-speech:<voice> | module:<path> | none
export const VOICE = env("RIKROK_VOICE", process.platform === "darwin" ? "say:Samantha" : "none");
export const VOICE_FX = env("RIKROK_VOICE_FX", "none");
export const TTS_URL = base(env("RIKROK_TTS_URL", LLM_URL));
export const TTS_MODEL = env("RIKROK_TTS_MODEL", "tts-1");
export const TTS_KEY = env("RIKROK_TTS_KEY", LLM_KEY);
// Own voice (RIKROK_VOICE=clone): reference clip + transcript, recorded by `rikrok voice setup`
export const VOICE_DIR = path.join(RIKROK_HOME, "voice");
export const CLONE_REF = path.resolve(expandHome(env("RIKROK_CLONE_REF", path.join(VOICE_DIR, "ref.wav"))));
export const CLONE_TEXT = path.resolve(expandHome(env("RIKROK_CLONE_TEXT", path.join(VOICE_DIR, "ref.txt"))));
export const CLONE_MODEL = env("RIKROK_CLONE_MODEL", "Qwen3-TTS-12Hz-1.7B-Base-bf16");
// How the speech server takes the reference clip: "speech" = ref_audio on /v1/audio/speech (oMLX),
// "voice-clone" = the dedicated /v1/audio/voice-clone endpoint (the server `rikrok voice serve` runs)
export const CLONE_API = env("RIKROK_CLONE_API", "speech");
export const VOICE_SERVER_DIR = path.join(RIKROK_HOME, "voice-server");
export const VOICE_SERVER_PORT = num("RIKROK_VOICE_PORT", 4873);
// Vocal isolation for `voice from-clip --vocals`: an HTTP stem service or a shell template
export const STEMS_URL = env("RIKROK_STEMS_URL", "");
export const STEMS_CMD = env("RIKROK_STEMS_CMD", "");

// Optional transcribe-back QA of narration (off unless RIKROK_STT_URL is set)
export const STT_URL = env("RIKROK_STT_URL", "") ? base(env("RIKROK_STT_URL")) : "";
export const STT_MODEL = env("RIKROK_STT_MODEL", "whisper-1");
export const STT_KEY = env("RIKROK_STT_KEY", LLM_KEY);

export function authHeaders(key) {
  return key ? { Authorization: `Bearer ${key}` } : {};
}

// Every RIKROK_* variable currently in effect (for doctor and install).
export function effectiveEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("RIKROK_")).sort());
}
