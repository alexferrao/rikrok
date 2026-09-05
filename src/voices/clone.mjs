// Your own voice: a 15 to 20 second reference clip plus its transcript, sent with every
// request to a local speech server that supports zero-shot cloning (oMLX with Qwen3-TTS
// today; any server that accepts ref_audio / ref_text on /v1/audio/speech).
// Set up with `rikrok voice setup`. Nothing is trained and nothing leaves the machine.
import fs from "node:fs";
import { TTS_URL, TTS_KEY, CLONE_MODEL, CLONE_REF, CLONE_TEXT, CLONE_API, authHeaders } from "../lib/config.mjs";

export function cloneVoice() {
  const refText = () => {
    try {
      return fs.readFileSync(CLONE_TEXT, "utf-8").trim();
    } catch {
      return "";
    }
  };
  return {
    name: "clone",
    async available() {
      if (!fs.existsSync(CLONE_REF)) return { ok: false, reason: `no reference clip at ${CLONE_REF} (run \`rikrok voice setup\`)` };
      if (!refText()) return { ok: false, reason: `no transcript at ${CLONE_TEXT} (run \`rikrok voice setup\`)` };
      try {
        const r = await fetch(`${TTS_URL}/v1/models`, { headers: authHeaders(TTS_KEY), signal: AbortSignal.timeout(5000) });
        if (!r.ok) return { ok: false, reason: `HTTP ${r.status} from ${TTS_URL}/v1/models` };
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: `${TTS_URL} unreachable (${e.message})` };
      }
    },
    async synth(text, outPath) {
      try {
        if (CLONE_API === "voice-clone") {
          // Qwen3-TTS OpenAI FastAPI server (what `rikrok voice serve` runs): dedicated endpoint.
          const r = await fetch(`${TTS_URL}/v1/audio/voice-clone`, {
            method: "POST",
            headers: { ...authHeaders(TTS_KEY), "Content-Type": "application/json" },
            body: JSON.stringify({ input: text, ref_audio: fs.readFileSync(CLONE_REF).toString("base64"), ref_text: refText(), x_vector_only_mode: false, language: "English", response_format: "wav", speed: 1.0 }),
            signal: AbortSignal.timeout(300_000),
          });
          if (!r.ok) return { ok: false, error: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
          fs.writeFileSync(outPath, Buffer.from(await r.arrayBuffer()));
          return { ok: true };
        }
        const body = {
          model: CLONE_MODEL,
          input: text,
          ref_audio: fs.readFileSync(CLONE_REF).toString("base64"),
          ref_text: refText(),
          temperature: 0.3,
          top_p: 0.85,
          response_format: "wav",
        };
        const r = await fetch(`${TTS_URL}/v1/audio/speech`, {
          method: "POST",
          headers: { ...authHeaders(TTS_KEY), "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
