// Where Rik Rok keeps its data (reels, state, render bundle, logs).
// Default ~/.rikrok, override with RIKROK_HOME. Package-relative dirs resolve from this file.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PKG = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf-8"));
export const PKG_VERSION = PKG.version;
export const REMOTION_DIR = path.join(PKG_ROOT, "remotion");
export const PUBLIC_DIR = path.join(PKG_ROOT, "server", "public");
export const BIN = path.join(PKG_ROOT, "bin", "rikrok.mjs");

export function expandHome(p) {
  return String(p).replace(/^~(?=$|\/)/, os.homedir());
}

export const RIKROK_HOME = path.resolve(expandHome(process.env.RIKROK_HOME || "~/.rikrok"));
export const REELS_DIR = path.join(RIKROK_HOME, "reels");
export const WORK_DIR = path.join(RIKROK_HOME, "work");
export const BUNDLE_DIR = path.join(RIKROK_HOME, "bundle");
export const LOG_DIR = path.join(RIKROK_HOME, "logs");
export const STATE_FILE = path.join(RIKROK_HOME, "state.json");
export const CONFIG_FILE = path.join(RIKROK_HOME, "config.json");

export function ensureDirs() {
  for (const d of [RIKROK_HOME, REELS_DIR, WORK_DIR, LOG_DIR]) fs.mkdirSync(d, { recursive: true });
}
