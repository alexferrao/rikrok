import { execFileSync } from "node:child_process";
import fs from "node:fs";

// Commits in the project repo within the session window. Read-only.
export function gitCommitsFor(cwd, sinceTs, untilTs) {
  if (!cwd || !fs.existsSync(cwd)) return [];
  try {
    const args = [
      "-C", cwd, "log", "--oneline", "--no-decorate",
      `--since=${new Date(sinceTs - 60000).toISOString()}`,
    ];
    if (untilTs) args.push(`--until=${new Date(untilTs + 300000).toISOString()}`);
    const out = execFileSync("git", args, { encoding: "utf-8", timeout: 10000 });
    return out.split("\n").filter(Boolean).slice(0, 20);
  } catch {
    return [];
  }
}

export function gitDiffStat(cwd, sinceTs) {
  if (!cwd || !fs.existsSync(cwd)) return null;
  try {
    const range = execFileSync(
      "git",
      ["-C", cwd, "log", "--format=%H", `--since=${new Date(sinceTs - 60000).toISOString()}`],
      { encoding: "utf-8", timeout: 10000 },
    )
      .split("\n")
      .filter(Boolean);
    if (range.length === 0) return null;
    const out = execFileSync(
      "git",
      ["-C", cwd, "diff", "--shortstat", `${range[range.length - 1]}~1..${range[0]}`],
      { encoding: "utf-8", timeout: 10000, stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}
