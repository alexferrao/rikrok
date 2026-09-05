// rikrok setup: the guided path. Finds a local LLM (or installs Ollama), records your
// voice, writes ~/.rikrok/config.json, renders the demo, and offers to start the feed.
import fs from "node:fs";
import readline from "node:readline/promises";
import { execFileSync, spawnSync } from "node:child_process";
import * as c from "../lib/config.mjs";
import { setup as voiceSetup, saveConfig } from "./voice.mjs";

const has = (bin) => spawnSync("which", [bin]).status === 0;

async function models(url) {
  try {
    const r = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.data || []).map((m) => m.id);
  } catch {
    return null;
  }
}

export async function run(args) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q, d) => {
    const a = (await rl.question(`${q}${d !== undefined ? ` [${d}]` : ""} `)).trim();
    return a === "" ? d : a;
  };
  const yes = async (q, d = "y") => /^y/i.test(await ask(`${q} (y/n)`, d));
  const cfg = {};
  try {
    console.log(`\nRik Rok setup. Everything stays on this machine. Ctrl-C any time.\n`);

    // 1. LLM
    const candidates = [
      ["Ollama", "http://127.0.0.1:11434"],
      ["LM Studio", "http://127.0.0.1:1234"],
      ["oMLX", "http://127.0.0.1:8800"],
      ["current setting", c.LLM_URL],
    ];
    let llmUrl = null, list = null, name = null;
    for (const [n, url] of candidates) {
      const m = await models(url);
      if (m) {
        llmUrl = url;
        list = m;
        name = n;
        break;
      }
    }
    if (!llmUrl) {
      console.log("No local LLM server found (looked for Ollama, LM Studio, oMLX).");
      if (process.platform === "darwin" && has("brew") && (await yes("Install Ollama with Homebrew and start it?"))) {
        execFileSync("brew", ["install", "ollama"], { stdio: "inherit" });
        spawnSync("brew", ["services", "start", "ollama"], { stdio: "inherit" });
        await new Promise((r) => setTimeout(r, 3000));
        list = await models("http://127.0.0.1:11434");
        if (list) {
          llmUrl = "http://127.0.0.1:11434";
          name = "Ollama";
        }
      }
    }
    if (llmUrl) {
      console.log(`Found ${name} at ${llmUrl}${list.length ? ` with ${list.length} model(s)` : ""}.`);
      let model = c.LLM_MODEL && list.includes(c.LLM_MODEL) ? c.LLM_MODEL : list[0] || "";
      if (name === "Ollama" && !list.length) {
        if (await yes("No models yet. Pull qwen3:8b (about 5 GB)?")) {
          execFileSync("ollama", ["pull", "qwen3:8b"], { stdio: "inherit" });
          model = "qwen3:8b";
        }
      } else if (list.length > 1) {
        list.slice(0, 15).forEach((m, i) => console.log(`  ${i + 1}  ${m}`));
        const pick = await ask("Which model for scripts? (number or name)", model);
        model = /^\d+$/.test(pick) ? list[Number(pick) - 1] || model : pick;
      }
      cfg.RIKROK_LLM_URL = llmUrl;
      cfg.RIKROK_LLM_MODEL = model;
      if (name === "Ollama") cfg.RIKROK_LLM_EXTRA = { think: false };
      if (name === "oMLX") cfg.RIKROK_LLM_EXTRA = { chat_template_kwargs: { enable_thinking: false } };
      if (name === "oMLX") {
        cfg.RIKROK_TTS_URL = llmUrl;
        cfg.RIKROK_STT_URL = llmUrl;
        cfg.RIKROK_STT_MODEL = "whisper-large-v3-turbo";
      }
    } else {
      console.log("Skipping the LLM for now: reels will use the template script until you set RIKROK_LLM_MODEL.");
    }
    saveConfig(cfg);

    // 2. Voice
    console.log("\nVoice. Reels can be narrated in your own voice from a 20-second recording.");
    if (await yes("Record your voice now?")) {
      await voiceSetup({}, rl);
    } else if (process.platform === "darwin") {
      saveConfig({ RIKROK_VOICE: "say:Samantha" });
      console.log("Using the built-in macOS voice for now. `rikrok voice setup` whenever you like.");
    } else {
      saveConfig({ RIKROK_VOICE: "none" });
      console.log("Silent reels for now (captions carry the story). `rikrok voice setup` when you have a speech server.");
    }

    // 3. Check and demo
    console.log("\nChecking everything...");
    spawnSync(process.execPath, [c.BIN, "doctor"], { stdio: "inherit" });
    if (await yes("Render the demo reel now? (first run downloads a headless Chrome)")) {
      spawnSync(process.execPath, [c.BIN, "demo"], { stdio: "inherit" });
    }
    if (await yes("Recap your 3 most recent sessions now?")) {
      spawnSync(process.execPath, [c.BIN, "backfill", "--limit", "3"], { stdio: "inherit" });
    }
    if (process.platform === "darwin" && (await yes("Keep the watcher and feed running at login?"))) {
      spawnSync(process.execPath, [c.BIN, "install"], { stdio: "inherit" });
      console.log(`\nFeed: http://127.0.0.1:${c.FEED_PORT}  (see README "On your phone" to reach it from your phone)`);
    } else {
      console.log(`\nStart the feed any time: rikrok feed   (then http://127.0.0.1:${c.FEED_PORT})\nWatch for new sessions: rikrok watch`);
    }
    console.log(`\nSettings saved to ${c.CONFIG_FILE}.`);
    return 0;
  } finally {
    rl.close();
  }
}
