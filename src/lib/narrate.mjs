// Narration: one WAV per beat through the configured voice, loudness-normalised,
// optionally transcribed back and re-taken when words go missing (RIKROK_STT_URL),
// then joined with breath gaps. Measured durations drive the render timing.
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { VOICE_FX } from "./config.mjs";
import { transcribeWords, sttEnabled } from "./stt.mjs";
import { resolveVoice } from "../voices/index.mjs";
import { silentVoice } from "../voices/none.mjs";
import { applyFx } from "../voices/fx.mjs";

const GAP_SECONDS = 0.35; // breath between beats
const TAIL_PAD = 0.25; // silence after each beat so the last phoneme is never clipped
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function wavDuration(p) {
  const out = execFileSync("ffprobe", ["-i", p, "-show_entries", "format=duration", "-v", "quiet", "-of", "csv=p=0"]).toString().trim();
  return parseFloat(out) || 0;
}

export function normalizeVolume(p) {
  const out = p.replace(/\.wav$/, "_norm.wav");
  execFileSync("ffmpeg", ["-y", "-i", p, "-af", "loudnorm=I=-23:TP=-1.5:LRA=11", "-ar", "24000", "-ac", "1", out], { stdio: "ignore" });
  fs.renameSync(out, p);
}

const norm = (w) => String(w).toLowerCase().replace(/[^a-z0-9']/g, "");
const SPELL = { 0: "zero", 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "eleven", 12: "twelve", 13: "thirteen", 14: "fourteen", 15: "fifteen", 16: "sixteen", 17: "seventeen", 18: "eighteen", 19: "nineteen", 20: "twenty", 30: "thirty", 40: "forty", 50: "fifty", 60: "sixty", 70: "seventy", 80: "eighty", 90: "ninety", 100: "hundred" };
const UNSPELL = Object.fromEntries(Object.entries(SPELL).map(([k, v]) => [v, k]));

// Compare script words to heard words. Returns {coverage, tailOk, missing}.
export function compareWords(text, heard) {
  const want = text.split(/\s+/).map(norm).filter(Boolean);
  const got = new Set(heard.map((w) => norm(w.w)).filter(Boolean));
  const ok = (w) => got.has(w) || (SPELL[+w] && got.has(SPELL[+w])) || (UNSPELL[w] && got.has(UNSPELL[w])) || [...got].some((g) => g.length > 3 && (g.startsWith(w) || w.startsWith(g)));
  const hits = want.filter(ok).length;
  const coverage = want.length ? hits / want.length : 1;
  const tail = want.slice(-3);
  const tailOk = tail.filter(ok).length >= Math.min(2, tail.length);
  return { coverage, tailOk, missing: want.filter((w) => !ok(w)) };
}

async function synthOnce(voice, text, outPath, attempt) {
  // Deterministic engines give identical (bad) audio for identical text; nudge it per attempt.
  const variants = [text, text.replace(/\s+$/, "") + " ", text.replace(/[.!?]$/, "") + "."];
  const t = variants[Math.min(attempt, variants.length - 1)];
  let res;
  for (let wait = 0; wait < 8; wait++) {
    res = await voice.synth(t, outPath);
    // A shared local inference box under memory pressure answers 500; wait it out.
    if (res.ok || !/memory ceiling|Cannot load|exceed/i.test(res.error || "")) break;
    console.log(`[narrate] voice backend under memory pressure, waiting 60s (${wait + 1}/8)`);
    await sleep(60_000);
  }
  if (res.ok && !res.silent) {
    normalizeVolume(outPath);
    applyFx(outPath, VOICE_FX);
  }
  return res;
}

async function qaLoop(voice, text, p, i, qa) {
  let best = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      const r = await synthOnce(voice, text, p, attempt);
      if (!r.ok) break;
    }
    let heard = [];
    for (let t = 0; t < 3 && heard.length === 0; t++) {
      heard = await transcribeWords(p);
      if (heard.length === 0) await sleep(5000);
    }
    if (heard.length === 0) {
      console.log(`[narrate] beat ${i}: transcriber returned nothing, keeping audio unverified`);
      qa.push({ beat: i, unverified: true, attempts: attempt + 1 });
      best = null;
      break;
    }
    const r = compareWords(text, heard);
    const score = r.coverage + (r.tailOk ? 0.5 : 0);
    if (!best || score > best.score) {
      best = { ...r, attempt, score };
      fs.copyFileSync(p, p + ".best");
    }
    if (r.coverage >= 0.92 && r.tailOk) break;
    console.log(`[narrate] beat ${i} attempt ${attempt + 1}: coverage ${(r.coverage * 100).toFixed(0)}% tail=${r.tailOk} missing=[${r.missing.slice(0, 6).join(",")}], retaking`);
  }
  if (best) {
    fs.copyFileSync(p + ".best", p);
    fs.unlinkSync(p + ".best");
    qa.push({ beat: i, coverage: +best.coverage.toFixed(2), tailOk: best.tailOk, attempts: best.attempt + 1, missing: best.missing.slice(0, 8) });
  } else {
    try {
      fs.unlinkSync(p + ".best");
    } catch {}
  }
}

// texts: one narration string per beat.
// Returns { audioPath, beats: [{start, duration}], totalDuration, qa, voice, silent }.
export async function narrateBeats(texts, workDir, opts = {}) {
  const voice = opts.voice || (await resolveVoice());
  const silent = voice.name === "none";
  const qaOn = sttEnabled() && !silent;
  const parts = [];
  const qa = [];
  let anySilent = silent;
  for (let i = 0; i < texts.length; i++) {
    const p = path.join(workDir, `beat-${i}.wav`);
    let res = await synthOnce(voice, texts[i], p, 0);
    if (!res.ok) {
      console.error(`[narrate] beat ${i}: ${voice.name} failed (${res.error}); using silence for this beat`);
      res = await silentVoice().synth(texts[i], p);
      if (!res.ok) throw new Error(`narration failed: ${res.error}`);
      qa.push({ beat: i, silent: true });
      anySilent = true;
    } else if (qaOn) {
      await qaLoop(voice, texts[i], p, i, qa);
    }
    parts.push({ path: p, duration: wavDuration(p) + TAIL_PAD });
  }

  // Concat: resample, pad each beat (tail pad + breath gap), join.
  const audioPath = path.join(workDir, "narration.wav");
  const inputs = [];
  const filters = [];
  for (let i = 0; i < parts.length; i++) {
    inputs.push("-i", parts[i].path);
    filters.push(`[${i}:a]aresample=24000,aformat=channel_layouts=mono[a${i}]`);
  }
  const padded = parts.map((_, i) => `[a${i}]apad=pad_dur=${(TAIL_PAD + (i < parts.length - 1 ? GAP_SECONDS : 0)).toFixed(2)}[p${i}]`).join(";");
  const concatIn = parts.map((_, i) => `[p${i}]`).join("");
  const filter = `${filters.join(";")};${padded};${concatIn}concat=n=${parts.length}:v=0:a=1[out]`;
  execFileSync("ffmpeg", ["-y", ...inputs, "-filter_complex", filter, "-map", "[out]", audioPath], { stdio: "ignore" });

  const beats = [];
  let t = 0;
  for (let i = 0; i < parts.length; i++) {
    const gap = i < parts.length - 1 ? GAP_SECONDS : 0;
    beats.push({ start: t, duration: parts[i].duration + gap });
    t += parts[i].duration + gap;
  }
  const totalDuration = wavDuration(audioPath);
  for (const p of parts) fs.unlinkSync(p.path);
  return { audioPath, beats, totalDuration, qa, voice: voice.name, silent: anySilent };
}
