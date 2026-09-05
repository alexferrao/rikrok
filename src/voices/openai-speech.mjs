// Any OpenAI-compatible /v1/audio/speech server: oMLX (Qwen3-TTS presets),
// Kokoro-FastAPI, LM Studio, or OpenAI itself if you choose to send text out.
import fs from "node:fs";
import { TTS_URL, TTS_MODEL, TTS_KEY, authHeaders } from "../lib/config.mjs";

export function openaiSpeech(voice = "alloy") {
  return {
    name: `openai-speech:${voice}`,
    async available() {
      if (!TTS_URL) return { ok: false, reason: "RIKROK_TTS_URL not set" };
      try {
        const r = await fetch(`${TTS_URL}/v1/models`, { headers: authHeaders(TTS_KEY), signal: AbortSignal.timeout(5000) });
        return r.ok ? { ok: true } : { ok: false, reason: `HTTP ${r.status} from ${TTS_URL}/v1/models` };
      } catch (e) {
        return { ok: false, reason: `${TTS_URL} unreachable (${e.message})` };
      }
    },
    async synth(text, outPath) {
      try {
        const r = await fetch(`${TTS_URL}/v1/audio/speech`, {
          method: "POST",
          headers: { ...authHeaders(TTS_KEY), "Content-Type": "application/json" },
          body: JSON.stringify({ model: TTS_MODEL, input: text, voice, response_format: "wav" }),
          signal: AbortSignal.timeout(180_000),
        });
        if (!r.ok) return { ok: false, error: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
        fs.writeFileSync(outPath, Buffer.from(await r.arrayBuffer()));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
  };
}
