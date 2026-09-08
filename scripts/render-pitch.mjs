// Renders the five pitch reels (pain, idea, voice, proof, cta), narrated with the configured
// voice, into a directory, with sidecars so they can sit in a feed.
// Usage: RIKROK_HOME=... node scripts/render-pitch.mjs <outDir>
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, ensureBrowser } from "@remotion/renderer";
import { REMOTION_DIR, BUNDLE_DIR, WORK_DIR, ensureDirs } from "../src/lib/config.mjs";
import { narrateBeats } from "../src/lib/narrate.mjs";

const outDir = path.resolve(process.argv[2] || "assets/pitch");
const only = process.argv[3] ? process.argv[3].split(",") : null; // e.g. "cta" or "pain,cta"
fs.mkdirSync(outDir, { recursive: true });
ensureDirs();
const FPS = 30;

const CLIPS = [
  { id: "pitch-1-pain", kind: "pain", label: "The problem", lines: ["Six sessions.", "No idea what", "*any* of them did."], narration: "You've got six Claude Code sessions open. Two are done, one is stuck, and you can't remember what the other three did. So you go back through every one, just to put yourself back in the loop.", minSec: 11 },
  { id: "pitch-2-idea", kind: "idea", label: "The idea", lines: ["What if your recaps", "came at you the way", "you *doomscroll*?"], narration: "What if your recaps came at you the way you doomscroll? Thirty seconds a session. What happened, where it stands, and the one next step. Swipe.", minSec: 10 },
  { id: "pitch-3-voice", kind: "voice", label: "The difference", lines: ["Narrated in", "*your own voice*.", "And it never leaves", "your machine."], narration: "Narrated in your own voice, from twenty seconds of you. No cloud, no upload. The voice, the script, the render: all on your machine. This is my voice, by the way.", minSec: 11 },
  { id: "pitch-4-proof", kind: "proof", label: "The proof", lines: ["A real recap.", "Not a summary.", "*How it moves.*"], narration: "Every reel ends with what changed and how it moves: the button, the guard, the API. Real files, real commits, nothing invented.", minSec: 10 },
  { id: "pitch-5-cta", kind: "cta", label: "", lines: [], narration: "Rik Rok. Open source, MIT, local-first. npm install rikrok, run setup, and your next session recaps itself.", minSec: 9 },
];

const PITCH_BUNDLE = path.join(BUNDLE_DIR, "pitch");
const serveUrl = await ensureBundle();
for (const c of CLIPS) {
  if (only && !only.includes(c.kind)) continue;
  const work = path.join(WORK_DIR, c.id);
  fs.mkdirSync(work, { recursive: true });
  console.log(`[pitch] ${c.id}: narrating`);
  const n = await narrateBeats([c.narration], work);
  const totalFrames = Math.round(Math.max(c.minSec, n.totalDuration + 1.2) * FPS);
  const audioFile = `narration-${c.id}.wav`;
  fs.mkdirSync(path.join(PITCH_BUNDLE, "public"), { recursive: true });
  fs.copyFileSync(n.audioPath, path.join(PITCH_BUNDLE, "public", audioFile));
  const inputProps = { kind: c.kind, label: c.label, lines: c.lines, audioFile, totalFrames };
  const composition = await selectComposition({ serveUrl, id: "Pitch", inputProps, browserExecutable: process.env.RIKROK_BROWSER || null });
  const outPath = path.join(outDir, `${c.id}.mp4`);
  console.log(`[pitch] ${c.id}: rendering ${totalFrames} frames`);
  await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: outPath, inputProps, concurrency: 4, audioCodec: "aac", browserExecutable: process.env.RIKROK_BROWSER || null });
  fs.rmSync(path.join(PITCH_BUNDLE, "public", audioFile), { force: true });
  fs.writeFileSync(outPath.replace(/\.mp4$/, ".json"), JSON.stringify({ id: c.id, source: "pitch", project: "Rik Rok", sessionId: c.id, createdAt: new Date(Date.now() - (5 - CLIPS.indexOf(c)) * 60_000).toISOString(), durationSec: Math.round(totalFrames / FPS), headline: `Rik Rok: ${c.label || "install"}`, next_step: c.kind === "cta" ? "npm install -g rikrok" : c.lines.join(" ").replace(/\*/g, ""), accentColor: "#69C9D0", watched: false, sourcePath: null, where: "pitch", achieved: [], open: [], commits: [], urls: ["https://github.com/alexferrao/rikrok"], scriptSource: "hand", voice: n.voice, silent: n.silent, sessionFile: null, resumeHint: null, coveredLines: null }, null, 2));
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`[pitch] done ${outPath} (${Math.round(totalFrames / FPS)}s)`);
}

async function ensureBundle() {
  await ensureBrowser({ browserExecutable: process.env.RIKROK_BROWSER || null });
  return bundle({ entryPoint: path.join(REMOTION_DIR, "index.ts"), outDir: PITCH_BUNDLE, publicDir: path.join(REMOTION_DIR, "public") });
}
