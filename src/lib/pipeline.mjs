// One session slice -> one reel. Steps: parse -> evidence -> script -> narration -> render -> sidecar.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { REELS_DIR, WORK_DIR, PKG_ROOT, HANDLE, FLOW_BEAT } from "./config.mjs";
import { sourceById } from "../sources/index.mjs";
import { condense } from "./evidence.mjs";
import { gitCommitsFor, gitDiffStat } from "./gitinfo.mjs";
import { generateScript } from "./llm.mjs";
import { narrateBeats } from "./narrate.mjs";
import { accentFor } from "./palette.mjs";

export const FPS = 30;
export const MIN_BEAT_SEC = 2.2; // a card must be readable even if its narration is short
export const TAIL_SEC = 1.2; // final card holds past the end of audio

export function shortPath(cwd) {
  if (!cwd) return null;
  const h = os.homedir();
  return cwd === h || cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

// Beat order is the fixed grammar: headline -> plays -> (flow) -> status -> next step.
export const hasFlow = (script) => Boolean(FLOW_BEAT && script.flow);

export function beatDefsFor(script) {
  return [
    { kind: "headline", caption: script.headline },
    ...script.plays.map((p) => ({ kind: "play", caption: p.caption, visual: p.visual })),
    ...(hasFlow(script) ? [{ kind: "flow", caption: script.flow.title, flow: { nodes: script.flow.nodes, edges: script.flow.edges, changed: script.flow.changed } }] : []),
    { kind: "status", caption: script.status.caption, achieved: script.status.achieved, open: script.status.open },
    { kind: "next", caption: script.next_step.caption },
  ];
}

export function narrationTextsFor(script) {
  return [script.headline_narration, ...script.plays.map((p) => p.narration), ...(hasFlow(script) ? [script.flow.narration] : []), script.status.narration, script.next_step.narration];
}

// The most recent earlier reel for the same session (or, failing that, the same project),
// so the script can say whether last time's next step happened.
export function previousRecap(sessionId, projectName, reelsDir = REELS_DIR) {
  let best = null;
  try {
    for (const f of fs.readdirSync(reelsDir)) {
      if (!f.endsWith(".json")) continue;
      let d;
      try {
        d = JSON.parse(fs.readFileSync(path.join(reelsDir, f), "utf-8"));
      } catch {
        continue;
      }
      if (!d.next_step || !d.createdAt) continue;
      const sameSession = d.sessionId === sessionId, sameProject = d.project === projectName;
      if (!sameSession && !sameProject) continue;
      const rank = sameSession ? 2 : 1;
      if (!best || rank > best.rank || (rank === best.rank && d.createdAt > best.createdAt)) best = { rank, createdAt: d.createdAt, next_step: d.next_step, headline: d.headline };
    }
  } catch {}
  return best;
}

// Distribute frames per measured narration timing; pad short beats to stay readable,
// and let the final card hold to the end of audio plus a settle tail. Pure.
export function buildBeats(beatDefs, beatTimes, totalDuration) {
  const beats = beatDefs.map((b, i) => {
    const start = Math.round(beatTimes[i].start * FPS);
    let end = i < beatDefs.length - 1 ? Math.round((beatTimes[i + 1]?.start ?? totalDuration) * FPS) : Math.round((totalDuration + TAIL_SEC) * FPS);
    if (end - start < MIN_BEAT_SEC * FPS) end = start + Math.round(MIN_BEAT_SEC * FPS);
    return { ...b, startFrame: start, durationFrames: end - start };
  });
  for (let i = 0; i < beats.length - 1; i++) {
    beats[i].durationFrames = Math.max(Math.round(MIN_BEAT_SEC * FPS), beats[i + 1].startFrame - beats[i].startFrame);
  }
  const last = beats[beats.length - 1];
  return { beats, totalFrames: last.startFrame + last.durationFrames };
}

// Remotion input props for a reel. Pure, so tests can check the shape without rendering.
export function buildProps({ script, projectName, accent, where, durationMin, beatTimes, totalDuration }) {
  const { beats, totalFrames } = buildBeats(beatDefsFor(script), beatTimes, totalDuration);
  const props = {
    projectName,
    accent,
    headline: script.headline,
    where,
    scoreBug: { durationMin, done: script.done_count, open: script.open_count },
    beats,
    totalFrames,
  };
  if (HANDLE) props.handle = HANDLE;
  return props;
}

// sessionFile: { source, path, sessionId, projectDir }. opts: { outPath, projectName, voice }.
export async function buildReel(sessionFile, fromLine = 0, opts = {}) {
  const src = sourceById(sessionFile.source || "claude");
  const { path: filePath, sessionId, projectDir } = sessionFile;
  const act = await src.parseSession(filePath, fromLine);
  const projectName = opts.projectName || src.projectName(act, projectDir);
  const accent = accentFor(projectName);

  const gitCommits = act.firstTs ? gitCommitsFor(act.cwd, act.firstTs, act.lastTs) : [];
  const evidence = condense(act, gitCommits);
  const shortstat = act.firstTs ? gitDiffStat(act.cwd, act.firstTs) : null;
  if (shortstat) evidence.diff_shortstat = shortstat;
  const prev = previousRecap(sessionId, projectName);
  if (prev) evidence.previous_next_step = prev.next_step;

  console.log(`[pipeline] ${projectName}/${sessionId.slice(0, 8)}: generating script...`);
  const { script, source } = await generateScript(evidence, projectName);
  console.log(`[pipeline] script source: ${source}${hasFlow(script) ? `, flow: ${script.flow.nodes.map((n) => n.label).join(" > ")}` : ", no flow"}`);

  const id = `${Date.now()}-${projectName.replace(/[^a-zA-Z0-9_-]/g, "_")}-${sessionId.slice(0, 8)}`;
  const workDir = path.join(WORK_DIR, id);
  fs.mkdirSync(workDir, { recursive: true });

  const texts = narrationTextsFor(script);
  console.log(`[pipeline] narrating ${texts.length} beats...`);
  const narration = await narrateBeats(texts, workDir, { voice: opts.voice });

  const branch = act.gitBranch && act.gitBranch !== "HEAD" ? act.gitBranch : null;
  const cwdShort = shortPath(act.cwd);
  const where = cwdShort ? `${cwdShort}${branch ? ` · ${branch}` : ""}` : null;
  const durationMin = Math.max(1, Math.round(act.activeMs / 60000));
  const props = buildProps({ script, projectName, accent, where, durationMin, beatTimes: narration.beats, totalDuration: narration.totalDuration });

  const outPath = opts.outPath || path.join(REELS_DIR, `${id}.mp4`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(path.join(workDir, "job.json"), JSON.stringify({ id, props, audioPath: narration.audioPath, outPath }, null, 2));

  console.log(`[pipeline] rendering...`);
  await runRender(workDir);

  const sidecar = {
    id,
    source: src.id,
    project: projectName,
    sessionId,
    createdAt: new Date().toISOString(),
    durationSec: Math.round(props.totalFrames / FPS),
    headline: script.headline,
    next_step: script.next_step.caption,
    accentColor: accent,
    watched: false,
    sourcePath: act.cwd || null,
    where,
    achieved: script.status.achieved || [],
    open: script.status.open || [],
    commits: gitCommits.slice(0, 8),
    urls: act.urls.slice(0, 5),
    scriptSource: source,
    voice: narration.voice,
    silent: narration.silent,
    audioQA: narration.qa,
    sessionFile: filePath,
    resumeHint: src.resumeHint(sessionId),
    flow: hasFlow(script) ? script.flow : null,
    previousNextStep: prev ? prev.next_step : null,
    coveredLines: { from: fromLine, to: act.totalLines },
  };
  fs.writeFileSync(outPath.replace(/\.mp4$/, ".json"), JSON.stringify(sidecar, null, 2));
  fs.rmSync(workDir, { recursive: true, force: true });
  console.log(`[pipeline] done: ${outPath}`);
  return { id, totalLines: act.totalLines, outPath, sidecar };
}

// Render in a child process at low priority so a render never starves live work.
function runRender(workDir) {
  const job = path.join(PKG_ROOT, "src", "lib", "render-job.mjs");
  const useNice = process.platform !== "win32";
  return new Promise((resolve, reject) => {
    const proc = useNice
      ? spawn("nice", ["-n", "19", process.execPath, job, workDir], { stdio: ["ignore", "inherit", "inherit"] })
      : spawn(process.execPath, [job, workDir], { stdio: ["ignore", "inherit", "inherit"] });
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`render exited ${code}`))));
    proc.on("error", reject);
  });
}
