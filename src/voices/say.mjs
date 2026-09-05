// macOS built-in speech synthesis. Zero setup, the default on a Mac.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

export function saySpeech(voice = "Samantha") {
  return {
    name: `say:${voice}`,
    async available() {
      if (process.platform !== "darwin") return { ok: false, reason: "macOS only" };
      try {
        const list = execFileSync("say", ["-v", "?"], { stdio: ["ignore", "pipe", "ignore"] }).toString();
        if (!list.split("\n").some((l) => l.startsWith(voice + " ") || l.startsWith(voice + "\t"))) {
          return { ok: false, reason: `voice "${voice}" not installed (see \`say -v ?\`)` };
        }
        return { ok: true };
      } catch {
        return { ok: false, reason: "`say` not found" };
      }
    },
    async synth(text, outPath) {
      try {
        const aiff = outPath.replace(/\.wav$/, ".aiff");
        execFileSync("say", ["-v", voice, "-r", process.env.RIKROK_SAY_RATE || "182", "-o", aiff, text]);
        execFileSync("ffmpeg", ["-y", "-i", aiff, "-ar", "24000", "-ac", "1", outPath], { stdio: "ignore" });
        fs.unlinkSync(aiff);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
  };
}
