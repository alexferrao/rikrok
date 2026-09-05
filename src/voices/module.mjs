// Bring your own voice: RIKROK_VOICE=module:/path/to/voice.mjs
// The module's default export is { name?, available?(), synth(text, outWavPath) -> {ok, error?} }.
// Keeps private engines (a personal voice clone, say) out of this repo entirely.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expandHome } from "../lib/paths.mjs";

export async function moduleVoice(spec) {
  const p = path.resolve(expandHome(spec));
  const m = await import(pathToFileURL(p).href);
  const v = m.default ?? m.voice ?? m;
  if (typeof v.synth !== "function") throw new Error(`voice module ${p} must export default { synth(text, outPath) }`);
  return {
    name: v.name || `module:${path.basename(p)}`,
    available: typeof v.available === "function" ? () => v.available() : async () => ({ ok: true }),
    synth: (text, out) => v.synth(text, out),
  };
}
