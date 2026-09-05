// Renders one reel. Run as a child process (under `nice -n 19` where available).
// Usage: node src/lib/render-job.mjs <workDir>
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";
import { BUNDLE_DIR, REMOTION_DIR, PKG_VERSION } from "./config.mjs";

const workDir = process.argv[2];
if (!workDir) {
  console.error("usage: node src/lib/render-job.mjs <workDir>");
  process.exit(2);
}
const job = JSON.parse(fs.readFileSync(path.join(workDir, "job.json"), "utf-8"));
fs.mkdirSync(path.dirname(job.outPath), { recursive: true });

// Re-bundle only when the composition sources or the package version change.
function sourceFingerprint() {
  const out = [`version:${PKG_VERSION}`];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        if (f !== "public") walk(full);
      } else if (/\.(tsx?|css)$/.test(f)) out.push(`${path.relative(REMOTION_DIR, full)}:${st.mtimeMs}`);
    }
  };
  walk(REMOTION_DIR);
  return out.sort().join("|");
}

async function ensureBundle() {
  const marker = path.join(BUNDLE_DIR, ".fingerprint");
  const fp = sourceFingerprint();
  if (fs.existsSync(marker) && fs.readFileSync(marker, "utf-8") === fp) return BUNDLE_DIR;
  fs.rmSync(BUNDLE_DIR, { recursive: true, force: true });
  const out = await bundle({ entryPoint: path.join(REMOTION_DIR, "index.ts"), outDir: BUNDLE_DIR, publicDir: path.join(REMOTION_DIR, "public") });
  fs.writeFileSync(marker, fp);
  return out;
}

// Headless Chrome: RIKROK_BROWSER points at your own binary, otherwise Remotion's
// managed download (a few hundred MB, once) with progress on stderr.
const browserExecutable = process.env.RIKROK_BROWSER || null;
let lastPct = -1;
await ensureBrowser({
  browserExecutable,
  onBrowserDownload: () => {
    console.error("[render] downloading headless Chrome for rendering (one-off)...");
    return {
      version: null,
      onProgress: ({ percent }) => {
        const pct = Math.floor((percent || 0) * 10) * 10;
        if (pct !== lastPct) {
          lastPct = pct;
          console.error(`[render] chrome download ${pct}%`);
        }
      },
    };
  },
});

const serveUrl = await ensureBundle();

// Drop the narration into the served public dir so staticFile() finds it.
const audioFile = `narration-${job.id}.wav`;
fs.mkdirSync(path.join(BUNDLE_DIR, "public"), { recursive: true });
fs.copyFileSync(job.audioPath, path.join(BUNDLE_DIR, "public", audioFile));

const inputProps = { ...job.props, audioFile };
const composition = await selectComposition({ serveUrl, id: job.composition || "Reel", inputProps, browserExecutable });
await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: job.outPath, inputProps, concurrency: 4, audioCodec: "aac", browserExecutable });

fs.rmSync(path.join(BUNDLE_DIR, "public", audioFile), { force: true });
console.log(`rendered ${job.outPath}`);
