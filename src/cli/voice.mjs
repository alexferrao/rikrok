// rikrok voice setup | test | devices
// Records a short reference clip in your voice, saves it with its transcript, checks it
// against your speech server, and switches RIKROK_VOICE to clone. No training, no upload.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { RIKROK_HOME, VOICE_DIR, CLONE_REF, CLONE_TEXT, CONFIG_FILE, TTS_URL, VOICE_SERVER_DIR, VOICE_SERVER_PORT, ensureDirs } from "../lib/config.mjs";
import { cloneVoice } from "../voices/clone.mjs";

// Short, neutral, covers most English sounds, easy to read in one breath per line.
export const SCRIPT = [
  "Here is the recap for today. The signup form is fixed, all four tests pass, and the change is live.",
  "Three things shipped, two are still open, and the next step is to check it on a phone before the demo.",
];

export function listDevices() {
  if (process.platform !== "darwin") return [];
  const out = spawnSync("ffmpeg", ["-f", "avfoundation", "-list_devices", "true", "-i", ""], { encoding: "utf-8" });
  const text = (out.stderr || "") + (out.stdout || "");
  const audio = text.split("audio devices:")[1] || "";
  return [...audio.matchAll(/\[(\d+)\]\s+(.+)$/gm)].map((m) => ({ index: Number(m[1]), name: m[2].trim() }));
}

function record(outPath, seconds, device) {
  const args = process.platform === "darwin"
    ? ["-y", "-f", "avfoundation", "-i", `:${device}`, "-t", String(seconds), "-ar", "24000", "-ac", "1", outPath]
    : ["-y", "-f", "pulse", "-i", "default", "-t", String(seconds), "-ar", "24000", "-ac", "1", outPath];
  execFileSync("ffmpeg", args, { stdio: ["ignore", "ignore", "inherit"] });
}

function trimSilence(p) {
  const out = p.replace(/\.wav$/, "_trim.wav");
  execFileSync("ffmpeg", ["-y", "-i", p, "-af", "silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.2,areverse,silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.3,areverse,loudnorm=I=-20:TP=-1.5:LRA=9", "-ar", "24000", "-ac", "1", out], { stdio: "ignore" });
  fs.renameSync(out, p);
}

function play(p) {
  try {
    if (process.platform === "darwin") execFileSync("afplay", [p]);
    else execFileSync("ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", p]);
  } catch {}
}

export function saveConfig(patch) {
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {}
  Object.assign(cfg, patch);
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n");
  try {
    fs.chmodSync(CONFIG_FILE, 0o600);
  } catch {}
}

export async function setup(args, rl) {
  ensureDirs();
  fs.mkdirSync(VOICE_DIR, { recursive: true });
  const own = rl || readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q, d) => {
    const a = (await own.question(`${q}${d !== undefined ? ` [${d}]` : ""} `)).trim();
    return a === "" ? d : a;
  };
  try {
    if (args.file) {
      // Bring your own clip: 10 to 25 seconds of you talking, plus what you said.
      const src = path.resolve(String(args.file));
      if (!fs.existsSync(src)) throw new Error(`no such file: ${src}`);
      execFileSync("ffmpeg", ["-y", "-i", src, "-ar", "24000", "-ac", "1", CLONE_REF], { stdio: "ignore" });
      let text = typeof args.text === "string" ? args.text : "";
      if (!text && typeof args["text-file"] === "string") text = fs.readFileSync(args["text-file"], "utf-8");
      if (!text) text = await ask("Type exactly what is said in the clip:");
      fs.writeFileSync(CLONE_TEXT, text.trim() + "\n");
    } else {
      const devices = listDevices();
      let device = args.device !== undefined ? Number(args.device) : 0;
      if (devices.length > 1 && args.device === undefined) {
        console.log("\nMicrophones:");
        devices.forEach((d) => console.log(`  ${d.index}  ${d.name}`));
        device = Number(await ask("Which one?", devices[0].index));
      }
      const seconds = Number(args.seconds || 22);
      console.log(`\nRead this in your normal voice. Recording starts when you press Enter and runs ${seconds} seconds.\n`);
      for (const line of SCRIPT) console.log(`    ${line}`);
      console.log();
      await ask("Press Enter to start recording");
      console.log("Recording...");
      record(CLONE_REF, seconds, device);
      trimSilence(CLONE_REF);
      fs.writeFileSync(CLONE_TEXT, SCRIPT.join(" ") + "\n");
      console.log("Done. Playing it back.");
      play(CLONE_REF);
      const again = await ask("Keep it? (y = keep, n = record again)", "y");
      if (/^n/i.test(again)) return setup({ ...args, device }, own);
    }
    // Try it against the speech server.
    const v = cloneVoice();
    const a = await v.available();
    if (!a.ok) {
      console.log(`\nSaved the clip and transcript in ${VOICE_DIR}.\nCould not reach a cloning server: ${a.reason}\nPoint RIKROK_TTS_URL at one (oMLX with Qwen3-TTS works) and run \`rikrok voice test\`.`);
      saveConfig({ RIKROK_VOICE: "clone" });
      return 0;
    }
    const testPath = path.join(VOICE_DIR, "test.wav");
    console.log(`\nAsking ${TTS_URL} to say a line in your voice...`);
    const r = await v.synth("This is your recap, in your own voice. Nothing left the machine.", testPath);
    if (!r.ok) {
      console.log(`The server did not like it: ${r.error}\nThe clip is saved; fix the server and run \`rikrok voice test\`.`);
      saveConfig({ RIKROK_VOICE: "clone" });
      return 1;
    }
    play(testPath);
    saveConfig({ RIKROK_VOICE: "clone" });
    console.log(`\nYour voice is set. RIKROK_VOICE=clone is saved in ${CONFIG_FILE}.\nNext: rikrok demo`);
    return 0;
  } finally {
    if (!rl) own.close();
  }
}


// ---- rikrok voice serve: a local cloning server, installed on first use ----
// Runs the Qwen3-TTS OpenAI-compatible FastAPI server (Apache-2.0) in its own uv-managed
// Python environment under ~/.rikrok/voice-server. MLX on Apple Silicon, PyTorch elsewhere.
// The model (about 4.5 GB for the 1.7B Base) downloads from Hugging Face on first start.
const SERVER_REPO = "https://github.com/groxaxo/Qwen3-TTS-Openai-Fastapi.git";
const APPLE = process.platform === "darwin" && process.arch === "arm64";
const MODELS = {
  mlx: { full: "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16", fast: "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16" },
  torch: { full: "Qwen/Qwen3-TTS-12Hz-1.7B-Base", fast: "Qwen/Qwen3-TTS-12Hz-0.6B-Base" },
};
const srcDir = () => path.join(VOICE_SERVER_DIR, "src");
const venvPy = () => path.join(srcDir(), ".venv", "bin", process.platform === "win32" ? "python.exe" : "python");

function haveUv() {
  return spawnSync("uv", ["--version"], { stdio: "ignore" }).status === 0;
}

export function installServer({ log = console.log } = {}) {
  if (!haveUv()) {
    log("This needs uv (the Python tool manager). Install it with:\n  curl -LsSf https://astral.sh/uv/install.sh | sh\nthen run `rikrok voice serve` again.");
    return false;
  }
  fs.mkdirSync(VOICE_SERVER_DIR, { recursive: true });
  if (!fs.existsSync(path.join(srcDir(), "pyproject.toml"))) {
    log(`Fetching the speech server into ${srcDir()} ...`);
    execFileSync("git", ["clone", "--depth", "1", SERVER_REPO, srcDir()], { stdio: "inherit" });
  }
  if (!fs.existsSync(venvPy())) {
    log("Creating its Python environment (uv, Python 3.12) ...");
    execFileSync("uv", ["venv", "--python", "3.12", path.join(srcDir(), ".venv")], { stdio: "inherit", cwd: srcDir() });
    const extras = APPLE ? ".[api,mlx]" : ".[api]";
    log(`Installing the server${APPLE ? " with MLX" : ""} (a few minutes the first time) ...`);
    execFileSync("uv", ["pip", "install", "--python", venvPy(), "-e", extras], { stdio: "inherit", cwd: srcDir() });
  }
  return true;
}

export async function serve(args) {
  if (!installServer()) return 1;
  const fast = Boolean(args.fast);
  const backend = APPLE ? "mlx" : "pytorch";
  const model = APPLE ? MODELS.mlx[fast ? "fast" : "full"] : MODELS.torch[fast ? "fast" : "full"];
  const port = Number(args.port || VOICE_SERVER_PORT);
  const lib = path.join(VOICE_DIR, "library");
  fs.mkdirSync(lib, { recursive: true });
  const env = { ...process.env, PORT: String(port), HOST: "127.0.0.1", TTS_BACKEND: backend, VOICE_LIBRARY_DIR: lib };
  if (APPLE) env.MLX_MODEL_ID = model;
  else {
    env.TTS_MODEL_NAME = model;
    if (!process.env.TTS_DEVICE) env.TTS_DEVICE = "cpu";
  }
  // Point Rik Rok at it, and at the dedicated clone endpoint.
  saveConfig({ RIKROK_TTS_URL: `http://127.0.0.1:${port}`, RIKROK_CLONE_API: "voice-clone", RIKROK_VOICE: "clone" });
  console.log(`Speech server: ${backend} backend, model ${model}, http://127.0.0.1:${port}\nFirst start downloads the model from Hugging Face (about ${fast ? "1.5" : "4.5"} GB). Ctrl-C to stop.\n`);
  const child = spawnSync(venvPy(), ["-m", "api.main"], { cwd: srcDir(), env, stdio: "inherit" });
  return child.status ?? 0;
}

export async function test() {
  const v = cloneVoice();
  const a = await v.available();
  if (!a.ok) {
    console.log(`clone voice not ready: ${a.reason}`);
    return 1;
  }
  const testPath = path.join(VOICE_DIR, "test.wav");
  const r = await v.synth("This is your recap, in your own voice. Nothing left the machine.", testPath);
  if (!r.ok) {
    console.log(`synthesis failed: ${r.error}`);
    return 1;
  }
  console.log(`ok, wrote ${testPath}`);
  play(testPath);
  return 0;
}

export async function run(args) {
  const sub = args._[0] || "help";
  if (sub === "setup") return setup(args);
  if (sub === "test") return test();
  if (sub === "serve") return serve(args);
  if (sub === "install-server") return installServer() ? 0 : 1;
  if (sub === "devices") {
    const d = listDevices();
    if (!d.length) console.log(process.platform === "darwin" ? "no input devices found" : "device listing is macOS only; recording uses the default pulse input");
    d.forEach((x) => console.log(`${x.index}  ${x.name}`));
    return 0;
  }
  console.log("usage: rikrok voice setup [--file clip.wav --text \"what is said\"] [--device N] [--seconds 22] | test | devices | serve [--fast] [--port N] | install-server");
  return 1;
}
