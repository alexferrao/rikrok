// Silent narration: captions carry the reel, timing comes from word count.
// Last link of the fallback chain so a reel always ships.
import { execFileSync } from "node:child_process";

export const WORDS_PER_SECOND = 2.7;

export function silentVoice() {
  return {
    name: "none",
    async available() {
      return { ok: true };
    },
    async synth(text, outPath) {
      const secs = Math.max(1.2, String(text).split(/\s+/).filter(Boolean).length / WORDS_PER_SECOND);
      try {
        execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", secs.toFixed(2), outPath], { stdio: "ignore" });
        return { ok: true, silent: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
  };
}
