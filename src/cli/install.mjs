// macOS: install launchd agents so the watcher and feed run at login.
// RIKROK_* variables in your environment at install time are baked into the plists.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PKG_ROOT, BIN, LOG_DIR, RIKROK_HOME, ensureDirs, effectiveEnv } from "../lib/config.mjs";

const AGENTS = { watch: "com.rikrok.watch", feed: "com.rikrok.feed" };
const dir = path.join(os.homedir(), "Library", "LaunchAgents");
const uid = process.getuid?.() ?? 501;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function bootout(label) {
  try {
    execFileSync("launchctl", ["bootout", `gui/${uid}/${label}`], { stdio: "ignore" });
  } catch {}
}

export async function run(args) {
  if (process.platform !== "darwin") {
    console.log(`No launchd here. Run the two processes under your service manager, for example systemd user units:\n`);
    for (const cmd of ["watch", "feed"]) {
      console.log(`# ~/.config/systemd/user/rikrok-${cmd}.service\n[Unit]\nDescription=Rik Rok ${cmd}\n[Service]\nExecStart=${process.execPath} ${BIN} ${cmd}\nRestart=always\nEnvironment=RIKROK_HOME=${RIKROK_HOME}\n[Install]\nWantedBy=default.target\n`);
    }
    console.log("then: systemctl --user daemon-reload && systemctl --user enable --now rikrok-watch rikrok-feed");
    return 0;
  }
  if (args.uninstall) {
    for (const label of Object.values(AGENTS)) {
      bootout(label);
      fs.rmSync(path.join(dir, `${label}.plist`), { force: true });
      console.log(`removed ${label}`);
    }
    return 0;
  }
  ensureDirs();
  fs.mkdirSync(dir, { recursive: true });
  const tmpl = fs.readFileSync(path.join(PKG_ROOT, "launchd", "com.rikrok.plist.tmpl"), "utf-8");
  const envVars = { RIKROK_HOME, ...effectiveEnv() };
  const envXml = Object.entries(envVars).map(([k, v]) => `    <key>${esc(k)}</key><string>${esc(v)}</string>`).join("\n");
  const PATH = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin", path.dirname(process.execPath)].filter((p, i, a) => a.indexOf(p) === i).join(":");
  for (const [cmd, label] of Object.entries(AGENTS)) {
    const plist = tmpl
      .replaceAll("{{LABEL}}", label)
      .replaceAll("{{NODE}}", esc(process.execPath))
      .replaceAll("{{BIN}}", esc(BIN))
      .replaceAll("{{CMD}}", cmd)
      .replaceAll("{{WORKDIR}}", esc(PKG_ROOT))
      .replaceAll("{{LOG}}", esc(path.join(LOG_DIR, `${cmd}.log`)))
      .replaceAll("{{ERRLOG}}", esc(path.join(LOG_DIR, `${cmd}.err.log`)))
      .replaceAll("{{PATH}}", esc(PATH))
      .replaceAll("{{ENV}}", envXml);
    const file = path.join(dir, `${label}.plist`);
    bootout(label);
    fs.writeFileSync(file, plist);
    execFileSync("launchctl", ["bootstrap", `gui/${uid}`, file]);
    console.log(`installed ${label} -> ${file}`);
  }
  console.log(`\nlogs: ${LOG_DIR}\nrestart: launchctl kickstart -k gui/${uid}/${AGENTS.watch}\nremove:  rikrok install --uninstall`);
  return 0;
}
