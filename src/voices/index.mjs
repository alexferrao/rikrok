// Voice backends. Spec strings (RIKROK_VOICE):
//   clone                   your own voice from a reference clip (rikrok voice setup)
//   say:<Voice>             macOS `say` (default on a Mac)
//   openai-speech:<voice>   any OpenAI-compatible /v1/audio/speech server
//   module:<path>           your own module (private voice clones live here)
//   none                    silent reel, captions only
import { VOICE } from "../lib/config.mjs";
import { saySpeech } from "./say.mjs";
import { openaiSpeech } from "./openai-speech.mjs";
import { moduleVoice } from "./module.mjs";
import { silentVoice } from "./none.mjs";
import { cloneVoice } from "./clone.mjs";

export const VOICE_SPECS = ["clone", "say:<Voice>", "openai-speech:<voice>", "module:<path>", "none"];

export async function loadVoice(spec = VOICE) {
  if (spec === "none") return silentVoice();
  if (spec === "clone") return cloneVoice();
  if (spec === "say") return saySpeech();
  if (spec.startsWith("say:")) return saySpeech(spec.slice(4));
  if (spec === "openai-speech") return openaiSpeech();
  if (spec.startsWith("openai-speech:")) return openaiSpeech(spec.slice("openai-speech:".length));
  if (spec.startsWith("module:")) return moduleVoice(spec.slice(7));
  throw new Error(`unknown voice "${spec}" (use one of: ${VOICE_SPECS.join(", ")})`);
}

// Configured voice, else macOS say, else silence. Never throws.
export async function resolveVoice(spec = VOICE, log = console.log) {
  const chain = [spec];
  if (process.platform === "darwin" && !spec.startsWith("say") && spec !== "none") chain.push("say:Samantha");
  if (spec !== "none") chain.push("none");
  for (const s of chain) {
    try {
      const v = await loadVoice(s);
      const a = await v.available();
      if (a.ok) {
        if (s !== spec) log(`[voice] ${spec} unavailable, using ${s}`);
        return v;
      }
      log(`[voice] ${s} unavailable: ${a.reason}`);
    } catch (e) {
      log(`[voice] ${s} failed to load: ${e.message}`);
    }
  }
  return silentVoice();
}
