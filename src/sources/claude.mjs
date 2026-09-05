// Claude Code sessions: ~/.claude/projects/<encoded cwd>/<session>.jsonl, read-only.
// Never writes anything under that directory.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { CLAUDE_PROJECTS, MIN_ASSISTANT_TURNS, MIN_TOOL_USES, PROJECT_NAME_RE } from "../lib/config.mjs";

export const id = "claude";

export function listSessions() {
  const out = [];
  let dirs = [];
  try {
    dirs = fs.readdirSync(CLAUDE_PROJECTS);
  } catch {
    return out;
  }
  for (const d of dirs) {
    const full = path.join(CLAUDE_PROJECTS, d);
    let files;
    try {
      files = fs.readdirSync(full);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const p = path.join(full, f);
      let st;
      try {
        st = fs.statSync(p);
      } catch {
        continue;
      }
      out.push({ source: id, path: p, sessionId: f.replace(/\.jsonl$/, ""), projectDir: d, mtimeMs: st.mtimeMs, size: st.size });
    }
  }
  return out;
}

// Parse a session file from a given line offset into the shared Activity shape.
export async function parseSession(filePath, fromLine = 0) {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath, { encoding: "utf-8" }), crlfDelay: Infinity });

  const act = {
    totalLines: 0,
    fromLine,
    assistantTurns: 0,
    toolUses: 0,
    firstTs: null,
    lastTs: null,
    activeMs: 0, // sum of inter-event gaps capped at 5 min: honest working time
    cwd: null,
    gitBranch: null,
    userPrompts: [], // {ts, text}
    assistantTexts: [], // {ts, text}
    tools: [], // {ts, name, detail}
    filesTouched: new Set(),
    commands: [], // {ts, command, desc}
    urls: new Set(), // URLs surfaced in assistant text (deploy targets, live endpoints)
    todoSnapshots: [], // last TodoWrite payload wins
  };

  let lineNo = -1;
  for await (const line of rl) {
    lineNo++;
    act.totalLines = lineNo + 1;
    if (lineNo < fromLine) continue;
    if (!line.trim()) continue;
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = d.timestamp ? Date.parse(d.timestamp) : null;
    if (ts) {
      if (!act.firstTs) act.firstTs = ts;
      if (act.lastTs && ts > act.lastTs) act.activeMs += Math.min(ts - act.lastTs, 5 * 60_000);
      act.lastTs = ts;
    }
    if (d.cwd) act.cwd = d.cwd;
    if (d.gitBranch) act.gitBranch = d.gitBranch;
    if (d.isSidechain) continue; // subagent traffic is not the story

    if (d.type === "user" && d.message) {
      const content = d.message.content;
      let text = null;
      if (typeof content === "string") text = content;
      else if (Array.isArray(content)) {
        const t = content.find((c) => c.type === "text");
        if (t) text = t.text;
      }
      // Skip tool results and injected system-ish content
      if (text && !text.startsWith("<") && d.userType !== "internal") act.userPrompts.push({ ts, text: text.slice(0, 400) });
    } else if (d.type === "assistant" && d.message) {
      const content = d.message.content;
      if (!Array.isArray(content)) continue;
      let counted = false;
      for (const c of content) {
        if (c.type === "text" && c.text && c.text.trim()) {
          if (!counted) {
            act.assistantTurns++;
            counted = true;
          }
          act.assistantTexts.push({ ts, text: c.text.slice(0, 700) });
          for (const m of c.text.matchAll(/https?:\/\/[^\s)\]>"'`]+/g)) {
            const u = m[0].replace(/[.,;:*`]+$/, "");
            if (!/localhost|127\.0\.0\.1|github\.com\/anthropics|docs\./.test(u)) act.urls.add(u);
          }
        } else if (c.type === "tool_use") {
          if (!counted) {
            act.assistantTurns++;
            counted = true;
          }
          act.toolUses++;
          const name = c.name || "tool";
          const input = c.input || {};
          let detail = "";
          if (input.file_path) {
            detail = input.file_path;
            if (["Edit", "Write", "NotebookEdit", "MultiEdit"].includes(name)) act.filesTouched.add(input.file_path);
          } else if (input.command) {
            detail = String(input.command).slice(0, 120);
            act.commands.push({ ts, command: detail, desc: input.description || "" });
          } else if (input.prompt) {
            detail = String(input.prompt).slice(0, 120);
          } else if (Array.isArray(input.todos)) {
            act.todoSnapshots = input.todos;
          } else if (input.pattern) {
            detail = input.pattern;
          } else if (input.url) {
            detail = input.url;
          }
          act.tools.push({ ts, name, detail });
        }
      }
    }
  }
  act.filesTouched = [...act.filesTouched];
  act.urls = [...act.urls];
  return act;
}

export function qualifies(act) {
  return act.assistantTurns >= MIN_ASSISTANT_TURNS && act.toolUses >= MIN_TOOL_USES;
}

// Human project name: RIKROK_PROJECT_NAME_RE capture group on the cwd if set
// (e.g. "workspaces/([^/]+)/" for worktree layouts), else the cwd's last segment.
export function projectName(act, projectDir) {
  if (act.cwd) {
    if (PROJECT_NAME_RE) {
      try {
        const m = act.cwd.match(new RegExp(PROJECT_NAME_RE));
        if (m && m[1]) return m[1];
      } catch {}
    }
    const parts = act.cwd.split("/").filter(Boolean);
    return parts[parts.length - 1] || projectDir;
  }
  // Encoded dir name: "/" became "-". Best effort: drop the home prefix.
  const homeEnc = os.homedir().replace(/\//g, "-");
  return projectDir.startsWith(homeEnc) ? projectDir.slice(homeEnc.length).replace(/^-/, "") || projectDir : projectDir;
}

export const resumeHint = (sessionId) => `claude --resume ${sessionId}`;
