// Your own voice: a 15 to 20 second reference clip plus its transcript, sent with every
// request to a local speech server that supports zero-shot cloning (oMLX with Qwen3-TTS
// today; any server that accepts ref_audio / ref_text on /v1/audio/speech).
// Set up with `rikrok voice setup`. Nothing is trained and nothing leaves the machine.
import fs from "node:fs";
import path from "node:path";
import { TTS_URL, TTS_KEY, CLONE_MODEL, CLONE_REF, CLONE_TEXT, CLONE_API, VOICE_DIR, authHeaders } from "../lib/config.mjs";

// Where a profile keeps its clip and transcript. "" = the default recorded by `voice setup`.
export function profilePaths(name = "") {
  if (!name) return { ref: CLONE_REF, text: CLONE_TEXT, dir: path.dirname(CLONE_REF) };
  const dir = path.join(VOICE_DIR, "profiles", name.replace(/[^a-zA-Z0-9_-]/g, "_"));
  return { ref: path.join(dir, "ref.wav"), text: path.join(dir, "ref.txt"), dir };
}

export function cloneVoice(profile = "") {
  const { ref: REF, text: TEXT } = profilePaths(profile);
  const refText = () => {
    try {
      return fs.readFileSync(TEXT, "utf-8").trim();
    } catch {
      return "";
    }
  };
  return {
    name: profile ? `clone:${profile}` : "clone",
    async available() {
      if (!fs.existsSync(REF)) return { ok: false, reason: `no reference clip at ${REF} (run \`rikrok voice setup\` or \`rikrok voice from-clip\`)` };
      if (!refText()) return { ok: false, reason: `no transcript at ${TEXT}` };
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
            body: JSON.stringify({ input: text, ref_audio: fs.readFileSync(REF).toString("base64"), ref_text: refText(), x_vector_only_mode: false, language: "English", response_format: "wav", speed: 1.0 }),
            signal: AbortSignal.timeout(300_000),
          });
          if (!r.ok) return { ok: false, error: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
          fs.writeFileSync(outPath, Buffer.from(await r.arrayBuffer()));
          return { ok: true };
        }
        const body = {
          model: CLONE_MODEL,
          input: text,
          ref_audio: fs.readFileSync(REF).toString("base64"),
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
