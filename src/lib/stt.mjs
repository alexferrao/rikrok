// Optional transcribe-back QA for narration via an OpenAI-compatible
// /v1/audio/transcriptions endpoint with word timestamps. Off unless RIKROK_STT_URL is set.
import fs from "node:fs";
import { STT_URL, STT_MODEL, STT_KEY, authHeaders } from "./config.mjs";

export const sttEnabled = () => Boolean(STT_URL);

export async function transcribeWords(wavPath) {
  if (!STT_URL) return [];
  const fd = new FormData();
  fd.append("file", new Blob([fs.readFileSync(wavPath)]), "audio.wav");
  fd.append("model", STT_MODEL);
  fd.append("response_format", "verbose_json");
  fd.append("word_timestamps", "true");
  try {
    const resp = await fetch(`${STT_URL}/v1/audio/transcriptions`, { method: "POST", headers: authHeaders(STT_KEY), body: fd, signal: AbortSignal.timeout(120_000) });
    if (!resp.ok) return [];
    const j = await resp.json();
    const words = [];
    for (const seg of j.segments ?? []) for (const w of seg.words ?? []) words.push({ w: String(w.word).trim(), s: +w.start, e: +w.end });
    for (const w of j.words ?? []) words.push({ w: String(w.word).trim(), s: +w.start, e: +w.end });
    return words.filter((x) => x.w && Number.isFinite(x.s));
  } catch {
    return [];
  }
}
