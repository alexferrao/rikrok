// Comment routing. A comment on a reel is always saved to its sidecar. If
// RIKROK_COMMENT_HOOK is set, that shell command also runs with a JSON payload on
// stdin, so a reply to a recap can become an instruction for the project's agent
// (an issue tracker, a message queue, `claude --resume`, whatever you wire up).
import { spawn } from "node:child_process";
import { COMMENT_HOOK } from "../lib/config.mjs";

export const hookConfigured = () => Boolean(COMMENT_HOOK);

export function routeComment(payload) {
  if (!COMMENT_HOOK) return null;
  try {
    const proc = spawn("sh", ["-c", COMMENT_HOOK], { stdio: ["pipe", "inherit", "inherit"], timeout: 10_000 });
    proc.on("error", (err) => console.error(`[feed] comment hook failed: ${err.message}`));
    proc.on("close", (code) => code !== 0 && console.error(`[feed] comment hook exited ${code}`));
    proc.stdin.end(JSON.stringify(payload));
  } catch (err) {
    console.error(`[feed] comment hook failed: ${err.message}`);
  }
  return COMMENT_HOOK;
}
