// Renders one reel from the bundled fixture session, so you can see the output
// before pointing Rik Rok at your own sessions. LLM optional (template script otherwise).
import path from "node:path";
import { PKG_ROOT, ensureDirs } from "../lib/config.mjs";
import { buildReel } from "../lib/pipeline.mjs";

export async function run(args) {
  ensureDirs();
  const fixture = path.join(PKG_ROOT, "test", "fixtures", "claude-session.jsonl");
  const outPath = path.resolve(typeof args.out === "string" ? args.out : path.join(PKG_ROOT, "assets", "demo.mp4"));
  const { sidecar } = await buildReel({ source: "claude", path: fixture, sessionId: "demo-session", projectDir: "example-app" }, 0, { outPath, projectName: "example-app" });
  console.log(`\ndemo reel: ${outPath}\nscript: ${sidecar.scriptSource}, voice: ${sidecar.voice}${sidecar.silent ? " (silent)" : ""}, ${sidecar.durationSec}s`);
  return 0;
}
