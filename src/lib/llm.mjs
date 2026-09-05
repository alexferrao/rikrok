// Script generation through any OpenAI-compatible chat endpoint (Ollama, LM Studio, oMLX, ...).
// Strict JSON out; one retry; deterministic fallback so a reel ALWAYS ships.
import { LLM_URL, LLM_MODEL, LLM_KEY, LLM_EXTRA, authHeaders } from "./config.mjs";

const SYSTEM = `You write scripts for 30-45 second vertical recap reels about finished coding sessions.
Fixed daily-news / sports-recap grammar. Brisk, neutral news-anchor tone. No hooks, no teasing, no hype words.
State the outcome up front. Keep total narration 75-110 words.
Respond with ONLY a JSON object, no markdown fences, matching exactly:
{
  "headline": "ProjectName: one-line outcome (max 60 chars)",
  "done_count": <int, meaningful things completed>,
  "open_count": <int, things still open>,
  "plays": [
    { "caption": "short declarative caption, max 52 chars",
      "narration": "1-2 spoken sentences for this beat",
      "visual": { "type": "files" | "commits" | "commands" | "text", "lines": ["up to 4 short lines of supporting evidence"] } }
  ],
  "status": { "caption": "outcome summary, max 52 chars", "narration": "1-2 spoken sentences stating concretely WHAT was achieved and WHERE it now lives (deployed, committed, live URL, file)", "achieved": ["max 4 concrete artifacts: things that now exist/work, each naming the thing (e.g. 'Feed live at app.example.com', '7 commits on build branch')"], "open": ["max 3 short items still unresolved"] },
  "next_step": { "caption": "THE single next action, max 60 chars", "narration": "1 spoken sentence stating the next step" },
  "headline_narration": "1-2 spoken sentences opening the reel with the outcome",
  "flow": null | {
    "title": "what moves, max 44 chars (e.g. 'Signup submit, guarded')",
    "narration": "1-2 spoken sentences walking the viewer along the arrows in order",
    "nodes": [ { "id": "a", "label": "max 24 chars, a noun (Sign up button, POST /signup, users table)", "kind": "ui" | "api" | "data" | "service" | "job" | "external" } ],
    "edges": [ { "from": "a", "to": "b", "label": "verb, max 16 chars (submits, writes, calls, returns)" } ],
    "changed": ["ids of the 1 or 2 nodes this session actually added or altered; the rest are context"]
  }
}
Rules: 2-4 plays, each about one real thing that happened (feature built, bug fixed, decision made).
Evidence lines must come from the provided session data (file names, commit lines, commands, urls_mentioned) — never invent.
Be informative over punchy: the viewer wants to know WHAT was achieved and WHERE it is.
If urls_mentioned contains a live/deployed URL, it belongs in status.achieved.
flow: include it whenever the session built or changed how something moves: a user action (tap, submit, click) reaching a handler, hook, API route, database, queue, cron, webhook or redirect. Most sessions that edited a component, handler, route or model have one; prefer a small 2-4 node flow over null. Nodes and edges in the order things happen, starting from the user's action when there is one, each backed by the session evidence. Only when nothing moved (pure docs, config, research) is flow null.
If previous_next_step is present, say early in headline_narration or status.narration whether that step was done this session, still open, or replaced.
Captions, achieved items and evidence lines are ON-SCREEN TEXT: write URLs and paths literally (e.g. "app.example.com").
Narration is SPOKEN: no file paths or code symbols; a domain may be spoken with the dots said aloud ("app dot example dot com").`;

function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" ? deepMerge(out[k], v) : v;
  }
  return out;
}

// Reasoning models that ignore RIKROK_LLM_EXTRA (Ollama drops chat_template_kwargs) leak
// their thinking into the content; strip it before looking for JSON.
export function stripThinking(t) {
  return String(t).replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*?<\/think>/, "").trim();
}

// One chat completion. RIKROK_LLM_EXTRA is deep-merged into the request body so
// server-specific fields (chat_template_kwargs, think, reasoning_effort) stay possible.
export async function chat(messages, { temperature = 0.4, max_tokens = 1600, timeoutMs = 180_000 } = {}) {
  if (!LLM_MODEL) throw new Error("RIKROK_LLM_MODEL is not set");
  const body = deepMerge({ model: LLM_MODEL, messages, temperature, max_tokens }, LLM_EXTRA);
  const resp = await fetch(`${LLM_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { ...authHeaders(LLM_KEY), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) throw new Error(`LLM HTTP ${resp.status} from ${LLM_URL}`);
  const j = await resp.json();
  return stripThinking(j.choices?.[0]?.message?.content || "");
}

let warnedNoModel = false;
export async function generateScript(evidence, projectName) {
  if (!LLM_MODEL) {
    if (!warnedNoModel) console.error("[llm] RIKROK_LLM_MODEL not set: reels use the template script (run `rikrok doctor`)");
    warnedNoModel = true;
    return { script: fallbackScript(evidence, projectName), source: "fallback" };
  }
  const user = `Project: ${projectName}\nSession evidence (JSON):\n${JSON.stringify(evidence, null, 1)}\n\nWrite the reel script JSON now.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await chat([{ role: "system", content: SYSTEM }, { role: "user", content: user }], { temperature: attempt === 0 ? 0.4 : 0.1 });
      const script = extractJson(text);
      const valid = validateScript(script);
      if (valid.ok) return { script: normalise(script, projectName), source: "llm" };
      console.error(`[llm] attempt ${attempt + 1} invalid: ${valid.error}`);
    } catch (err) {
      console.error(`[llm] attempt ${attempt + 1} failed: ${err.message}`);
    }
  }
  return { script: fallbackScript(evidence, projectName), source: "fallback" };
}

export function extractJson(text) {
  text = text.replace(/^[\s\S]*?(?=\{)/, "").trim();
  // trim trailing junk after the last closing brace
  const last = text.lastIndexOf("}");
  if (last >= 0) text = text.slice(0, last + 1);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function validateScript(s) {
  if (!s || typeof s !== "object") return { ok: false, error: "not an object" };
  if (typeof s.headline !== "string" || !s.headline) return { ok: false, error: "headline" };
  if (!Array.isArray(s.plays) || s.plays.length < 1 || s.plays.length > 6)
    return { ok: false, error: "plays" };
  for (const p of s.plays) {
    if (typeof p.caption !== "string" || typeof p.narration !== "string")
      return { ok: false, error: "play fields" };
    if (!p.visual || !Array.isArray(p.visual.lines)) return { ok: false, error: "play visual" };
  }
  if (!s.status || typeof s.status.narration !== "string") return { ok: false, error: "status" };
  if (!s.next_step || typeof s.next_step.caption !== "string" || typeof s.next_step.narration !== "string")
    return { ok: false, error: "next_step" };
  if (typeof s.headline_narration !== "string") return { ok: false, error: "headline_narration" };
  if (s.flow != null) {
    const v = validateFlow(s.flow);
    if (!v.ok) {
      console.error(`[llm] flow dropped: ${v.error}`);
      s.flow = null;
    }
  }
  return { ok: true };
}

const FLOW_KINDS = ["ui", "api", "data", "service", "job", "external"];
export function validateFlow(f) {
  if (!f || typeof f !== "object") return { ok: false, error: "not an object" };
  if (!Array.isArray(f.nodes) || f.nodes.length < 2 || f.nodes.length > 6) return { ok: false, error: "nodes" };
  if (!Array.isArray(f.edges) || f.edges.length < 1 || f.edges.length > 7) return { ok: false, error: "edges" };
  const ids = new Set();
  for (const n of f.nodes) {
    if (!n || typeof n.id !== "string" || typeof n.label !== "string" || ids.has(n.id)) return { ok: false, error: "node" };
    ids.add(n.id);
  }
  for (const e of f.edges) if (!e || !ids.has(e.from) || !ids.has(e.to) || e.from === e.to) return { ok: false, error: "edge" };
  if (typeof f.narration !== "string" || !f.narration.trim()) return { ok: false, error: "narration" };
  return { ok: true };
}

// Models sometimes write the spoken form of a URL into on-screen text. Undo it.
export function unspeakUrl(x) {
  const t = String(x);
  if (!/\s(dot|slash)\s/i.test(t)) return t;
  return t.replace(/\s+dot\s+/gi, ".").replace(/\s+slash\s+/gi, "/").replace(/\s+colon\s+/gi, ":");
}

export function normalise(s, projectName) {
  // Prepend the project name unless the headline already leads with it
  // (compare ignoring case and punctuation: "My App" matches "my-app").
  const canon = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (projectName && !canon(s.headline).startsWith(canon(projectName))) {
    s.headline = `${projectName}: ${s.headline}`;
  }
  s.plays = s.plays.slice(0, 4).map((p) => ({
    caption: String(p.caption).slice(0, 60),
    narration: String(p.narration),
    visual: {
      type: ["files", "commits", "commands", "text"].includes(p.visual?.type) ? p.visual.type : "text",
      lines: (p.visual?.lines || []).slice(0, 4).map((l) => unspeakUrl(l).slice(0, 70)),
    },
  }));
  s.headline = String(s.headline).slice(0, 70);
  s.done_count = Number.isFinite(+s.done_count) ? Math.max(0, Math.round(+s.done_count)) : s.plays.length;
  s.open_count = Number.isFinite(+s.open_count) ? Math.max(0, Math.round(+s.open_count)) : 0;
  s.status.achieved = (s.status.achieved || s.status.done || []).slice(0, 4).map((x) => unspeakUrl(x).slice(0, 60));
  s.status.open = (s.status.open || []).slice(0, 3).map((x) => unspeakUrl(x).slice(0, 55));
  s.status.caption = String(s.status.caption || "Where it stands").slice(0, 60);
  s.next_step.caption = String(s.next_step.caption).slice(0, 70);
  if (s.flow) {
    const f = s.flow;
    s.flow = {
      title: String(f.title || "How it moves").slice(0, 44),
      narration: String(f.narration),
      nodes: f.nodes.slice(0, 6).map((n) => ({ id: String(n.id), label: String(n.label).slice(0, 24), kind: FLOW_KINDS.includes(n.kind) ? n.kind : "service" })),
      edges: f.edges.slice(0, 7).map((e) => ({ from: String(e.from), to: String(e.to), label: String(e.label || "").slice(0, 16) })),
      changed: (Array.isArray(f.changed) ? f.changed : []).map(String).filter((id) => f.nodes.some((n) => String(n.id) === id)),
    };
  } else s.flow = null;
  return s;
}

// Deterministic template from raw metadata — used when the LLM is down or invalid twice.
export function fallbackScript(ev, projectName) {
  const commits = ev.git_commits || [];
  const files = ev.files_touched || [];
  const doneTodos = (ev.todos || []).filter((t) => t.status === "completed");
  const openTodos = (ev.todos || []).filter((t) => t.status !== "completed");
  const mins = ev.duration_minutes || 0;

  const plays = [];
  if (commits.length) {
    plays.push({
      caption: `${commits.length} commit${commits.length > 1 ? "s" : ""} landed`,
      narration: `The session landed ${commits.length} ${commits.length > 1 ? "commits" : "commit"}.`,
      visual: { type: "commits", lines: commits.slice(0, 4).map((c) => c.slice(0, 70)) },
    });
  }
  if (files.length) {
    plays.push({
      caption: `${files.length} file${files.length > 1 ? "s" : ""} changed`,
      narration: `Work touched ${files.length} ${files.length > 1 ? "files" : "file"} across the project.`,
      visual: { type: "files", lines: files.slice(0, 4).map((f) => f.split("/").slice(-2).join("/")) },
    });
  }
  if (ev.commands_run?.length) {
    plays.push({
      caption: `${ev.tool_uses} tool calls this session`,
      narration: `${ev.tool_uses} tool calls ran, including builds and checks.`,
      visual: { type: "commands", lines: ev.commands_run.slice(-4).map((c) => String(c).slice(0, 70)) },
    });
  }
  if (plays.length === 0) {
    plays.push({
      caption: `${ev.assistant_turns} working turns`,
      narration: `The assistant worked through ${ev.assistant_turns} turns this session.`,
      visual: { type: "text", lines: (ev.user_prompts || []).slice(0, 3).map((p) => p.slice(0, 70)) },
    });
  }

  const openLine = openTodos[0]?.content || "Review the session output";
  const achieved = [
    ...doneTodos.slice(0, 2).map((t) => t.content.slice(0, 60)),
    ...(commits.length ? [`${commits.length} commit${commits.length > 1 ? "s" : ""} landed`] : []),
    ...(ev.urls_mentioned || []).slice(0, 1).map((u) => `Live: ${u.replace(/^https?:\/\//, "").slice(0, 50)}`),
  ].slice(0, 4);
  return {
    headline: `${projectName}: session recap`,
    done_count: doneTodos.length || commits.length || plays.length,
    open_count: openTodos.length,
    plays: plays.slice(0, 4),
    status: {
      caption: `${doneTodos.length || commits.length} done, ${openTodos.length} open`,
      narration: `Overall, ${doneTodos.length || commits.length} items are done and ${openTodos.length} remain open.`,
      achieved,
      open: openTodos.slice(0, 3).map((t) => t.content.slice(0, 55)),
    },
    next_step: {
      caption: openLine.slice(0, 70),
      narration: `Next step: ${openLine}.`,
    },
    headline_narration: `${projectName}. A ${mins || "short"}-minute session wrapped up. Here's the recap.`,
    flow: null,
  };
}
