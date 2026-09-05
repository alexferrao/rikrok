// Optional robot post-processing, in place. RIKROK_VOICE_FX = none | light | strong.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

export function applyFx(wavPath, level = "none") {
  if (!level || level === "none") return;
  const out = wavPath.replace(/\.wav$/, "_fx.wav");
  const chain =
    level === "strong"
      ? [
          "atempo=1.04",
          "acompressor=threshold=-20dB:ratio=4:attack=5:release=90:makeup=4",
          "asplit[a][b];[b]tremolo=f=70:d=1,volume=0.35[m];[a][m]amix=inputs=2:normalize=0",
          "highpass=f=120",
          "lowpass=f=6500",
          "aecho=0.7:0.25:12:0.12",
          "loudnorm=I=-20:TP=-1.5:LRA=8",
        ]
      : ["atempo=1.03", "acompressor=threshold=-18dB:ratio=3:attack=8:release=120:makeup=3", "tremolo=f=40:d=0.05", "highpass=f=100", "lowpass=f=8500", "loudnorm=I=-20:TP=-1.5:LRA=9"];
  execFileSync("ffmpeg", ["-y", "-i", wavPath, "-af", chain.join(","), "-ar", "24000", "-ac", "1", out], { stdio: "ignore" });
  fs.renameSync(out, wavPath);
}
