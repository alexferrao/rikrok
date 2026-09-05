// Drives the feed UI at iPhone viewport in headless Chrome and screenshots it.
// Usage: node scripts/ui-check.mjs [outDir]
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import path from "node:path";

const outDir = process.argv[2] || ".";
const PORT = process.env.RIKROK_PORT || 4870;
const chrome = execSync(
  "find node_modules/.remotion -name 'chrome-headless-shell' -type f | head -1", { cwd: new URL("..", import.meta.url) },
).toString().trim();

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle2" });
await page.waitForSelector("#go", { timeout: 5000 });
await page.click("#go");
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: path.join(outDir, "ui-feed.png") });

const state = await page.evaluate(() => {
  const cells = [...document.querySelectorAll(".cell")];
  const v = document.querySelector("video");
  return {
    cells: cells.length,
    videoElements: document.querySelectorAll("video").length,
    playerInFirstCell: cells[0]?.contains(v) ?? false,
    player: v ? { paused: v.paused, muted: v.muted, currentTime: v.currentTime, src: v.src.split("/").pop() } : null,
    overlayText: cells[0]?.querySelector(".headline")?.textContent,
  };
});
console.log(JSON.stringify(state, null, 1));

// hold-to-2x
await page.mouse.move(195, 300);
await page.mouse.down();
await new Promise((r) => setTimeout(r, 600));
const rate = await page.evaluate(() => document.querySelector("video").playbackRate);
await page.mouse.up();
await new Promise((r) => setTimeout(r, 450));
const after = await page.evaluate(() => {
  const v = document.querySelector("video");
  return { rate: v.playbackRate, paused: v.paused };
});
console.log("hold rate:", rate, "after release:", JSON.stringify(after));

// swipe to second cell — the shared player must follow with a new src
await page.evaluate(() => document.getElementById("feed").scrollBy(0, window.innerHeight));
await new Promise((r) => setTimeout(r, 1500));
const s2 = await page.evaluate(() => {
  const cells = [...document.querySelectorAll(".cell")];
  const active = cells.find((c) => {
    const r = c.getBoundingClientRect();
    return r.top >= -10 && r.top < 100;
  });
  const v = document.querySelector("video");
  return {
    activeHeadline: active?.querySelector(".headline")?.textContent,
    playerMoved: active?.contains(v) ?? false,
    playing: v && !v.paused,
    src: v?.src.split("/").pop(),
  };
});
console.log(JSON.stringify(s2, null, 1));
await page.screenshot({ path: path.join(outDir, "ui-feed-2.png") });
console.log("page errors:", errors.length ? errors : "none");
await browser.close();
