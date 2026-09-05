import * as c from "../lib/config.mjs";
export async function run() {
  const rows = {
    RIKROK_HOME: c.RIKROK_HOME,
    RIKROK_CLAUDE_DIR: c.CLAUDE_PROJECTS,
    RIKROK_SOURCES: c.SOURCES.join(","),
    RIKROK_PORT: c.FEED_PORT,
    RIKROK_BIND: c.FEED_BIND,
    RIKROK_IDLE_MINUTES: c.IDLE_MINUTES,
    RIKROK_MIN_TURNS: c.MIN_ASSISTANT_TURNS,
    RIKROK_MIN_TOOLS: c.MIN_TOOL_USES,
    RIKROK_MAX_PER_HOUR: c.MAX_REELS_PER_HOUR,
    RIKROK_LLM_URL: c.LLM_URL,
    RIKROK_LLM_MODEL: c.LLM_MODEL || "(unset: template scripts only)",
    RIKROK_LLM_KEY: c.LLM_KEY ? "(set)" : "",
    RIKROK_LLM_EXTRA: JSON.stringify(c.LLM_EXTRA),
    RIKROK_VOICE: c.VOICE,
    RIKROK_VOICE_FX: c.VOICE_FX,
    RIKROK_TTS_URL: c.TTS_URL,
    RIKROK_TTS_MODEL: c.TTS_MODEL,
    RIKROK_STT_URL: c.STT_URL || "(off)",
    RIKROK_STT_MODEL: c.STT_MODEL,
    RIKROK_COMMENT_HOOK: c.COMMENT_HOOK || "(none)",
    RIKROK_HANDLE: c.HANDLE || "(none)",
    RIKROK_PROJECT_NAME_RE: c.PROJECT_NAME_RE || "(none)",
  };
  for (const [k, v] of Object.entries(rows)) console.log(`${k.padEnd(24)} ${v}`);
  return 0;
}
