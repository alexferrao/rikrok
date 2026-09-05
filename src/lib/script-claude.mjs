// Script writer that uses your Claude Code subscription: a headless `claude -p` call with
// the same system prompt and evidence the local-model path uses. No local model needed.
// RIKROK_HOOK_SKIP=1 rides along in the environment so the SessionEnd hook ignores this session
// and a recap can never trigger another recap.
import { spawn } from "node:child_process";
import { CLAUDE_BIN, CLAUDE_MODEL } from "./config.mjs";

export function claudeAvailable() {
  return new Promise((resolve) => {
    const p = spawn(CLAUDE_BIN, ["--version"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("close", (code) => resolve(code === 0));
  });
}

// messages: [{role:"system"|"user", content}] -> assistant text
export function claudeChat(messages, { timeoutMs = 240_000 } = {}) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const user = messages.filter((m) => m.role !== "system").map((m) => m.content).join("\n\n");
  const args = ["-p", "--no-session-persistence", "--output-format", "json", "--model", CLAUDE_MODEL];
  if (system) args.push("--append-system-prompt", system);
  return new Promise((resolve, reject) => {
    const p = spawn(CLAUDE_BIN, args, { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, RIKROK_HOOK_SKIP: "1" } });
    let out = "", err = "";
    const t = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`claude -p timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => {
      clearTimeout(t);
      reject(new Error(`cannot run ${CLAUDE_BIN}: ${e.message}`));
    });
    p.on("close", (code) => {
      clearTimeout(t);
      if (code !== 0) return reject(new Error(`claude -p exited ${code}: ${(err || out).slice(0, 200)}`));
      try {
        const j = JSON.parse(out);
        if (j.is_error) return reject(new Error(`claude: ${String(j.result).slice(0, 200)}`));
        resolve(String(j.result ?? ""));
      } catch {
        resolve(out); // text fallback
      }
    });
    p.stdin.end(user);
  });
}
