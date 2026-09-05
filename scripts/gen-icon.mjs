// The Rik Rok mark: an eighth rest whose stroke becomes the back of a Baskerville Bold
// Italic R, flattened to outline paths so no font is needed at render time. Cyan and
// red copies offset and screen-blended, white on top, on black.
// Geometry was measured from rendered pixels (stem back edge, rest stroke) and tuned by eye.
// Needs macOS for Baskerville (outline only; the font itself is never shipped).
// Usage: node scripts/gen-icon.mjs
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as fkmod from "fontkit";

const fk = fkmod.default ?? fkmod;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CY = "#25F4EE", RD = "#FE2C55";

// Outlines
const bask = fk.openSync("/System/Library/Fonts/Supplemental/Baskerville.ttc").fonts.find((f) => f.postscriptName === "Baskerville-BoldItalic");
const noto = fk.openSync(path.join(root, "node_modules/@fontsource/noto-music/files/noto-music-music-400-normal.woff2"));
const rGlyph = bask.glyphForCodePoint("R".codePointAt(0));
const eGlyph = noto.glyphForCodePoint(0x1d13e);
const SIZE = 300, BASE = 450, X = 200; // the working canvas the measurements were taken on
const glyphT = (font) => `translate(${X} ${BASE}) scale(${SIZE / font.unitsPerEm} ${-SIZE / font.unitsPerEm})`;

// Measured on that canvas: R ink box, stem back edge (two points), rest ink box, rest stroke edge.
const rb = { x0: 197, y0: 251, x1: 423, y1: 449 };
const stem = { xa: 260, ya: 310, xb: 232, yb: 400 };
const eb = { x0: 215, y0: 231, x1: 292, y1: 368 };
const stroke = { xa: 264, ya: 306, xb: 251, yb: 354 };
const ang = (p) => Math.atan2(p.xb - p.xa, p.yb - p.ya);
const rot = ((ang(stem) - ang(stroke)) * 180) / Math.PI;
const xAt = (p, y) => p.xa + ((y - p.ya) * (p.xb - p.xa)) / (p.yb - p.ya);
const capH = BASE - rb.y0;

// Tuned: rest 1.12x the cap, tucked 8px into the stem, cut above the foot, R's top-left serif hidden, rest thickened +4.
const K = 1.12, TUCK = 8, THICK = 4;
const s = (capH * K) / (eb.y1 - eb.y0);
const ex = xAt(stroke, eb.y1), ey = eb.y1;
const tx = xAt(stem, BASE) + TUCK, ty = BASE;
const restT = `translate(${tx} ${ty}) rotate(${rot.toFixed(3)}) scale(${s.toFixed(4)}) translate(${-ex} ${-ey})`;
const cutY = BASE - capH * 0.12;
const midY = BASE - capH * 0.45;
const rClip = `M${xAt(stem, rb.y0 - 40) - 1} ${rb.y0 - 40} L800 ${rb.y0 - 40} L800 ${BASE + 40} L0 ${BASE + 40} L0 ${midY} L${xAt(stem, midY) - 1} ${midY} Z`;
const restStroke = (THICK / s) * (noto.unitsPerEm / SIZE); // in the rest's font units

const ux0 = Math.min(rb.x0, tx - 40 * s), ux1 = Math.max(rb.x1, tx + (eb.x1 - eb.x0) * s), uy0 = Math.min(rb.y0, ty - (eb.y1 - eb.y0) * s), uy1 = rb.y1;
const w = ux1 - ux0, h = uy1 - uy0;

const body = (fill, id) => `<g fill="${fill}"><g clip-path="url(#${id}r)"><path transform="${glyphT(bask)}" d="${rGlyph.path.toSVG()}"/></g><g clip-path="url(#${id}c)"><g transform="${restT}"><path transform="${glyphT(noto)}" d="${eGlyph.path.toSVG()}" stroke="${fill}" stroke-width="${restStroke.toFixed(2)}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/></g></g></g>`;
const defs = (id) => `<defs><clipPath id="${id}c"><rect x="0" y="0" width="800" height="${cutY}"/></clipPath><clipPath id="${id}r"><path d="${rClip}"/></clipPath></defs>`;

// The mark, fitted into a square of `size` with `fill` fraction, optional rounded background.
export function mark({ size = 512, fill = 0.8, pad = 96, bg = true, id = "m" } = {}) {
  const f = Math.min((size * fill) / w, (size * fill) / h);
  const fit = `translate(${size / 2} ${size / 2}) scale(${f.toFixed(5)}) translate(${-(ux0 + w / 2)} ${-(uy0 + h / 2)})`;
  const off = (size / 512) * 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${defs(id)}${bg ? `<rect width="${size}" height="${size}" rx="${pad}" fill="#000"/>` : ""}<g transform="${fit}"><g style="mix-blend-mode:screen" transform="translate(${(-off / f).toFixed(3)} ${(-off * 0.7 / f).toFixed(3)})">${body(CY, id)}</g><g style="mix-blend-mode:screen" transform="translate(${(off / f).toFixed(3)} ${(off * 0.7 / f).toFixed(3)})">${body(RD, id)}</g>${body("#fff", id)}</g></svg>`;
}

// Wordmark: "Rik Rok" set entirely in Baskerville Bold Italic outlines, where each R is the
// mark (rest + R). Letters are advanced by the font's own widths in the mark's coordinate
// system (font-size 300 at x=200, baseline 450), then the whole line is fitted.
const upem = bask.unitsPerEm, u = SIZE / upem;
const adv = (ch) => bask.glyphForCodePoint(ch.codePointAt(0)).advanceWidth * u;
const glyphPath = (ch) => bask.glyphForCodePoint(ch.codePointAt(0)).path.toSVG();
const KERN = -0.02 * SIZE; // a touch tighter than the font's default fit
const letters = [];
let x = 0;
for (const ch of "Rik Rok") {
  letters.push({ ch, x });
  x += (ch === " " ? adv(" ") * 1.15 : adv(ch)) + (ch === " " ? 0 : KERN);
}
const lineW = x - KERN;
const lineBody = (fill, id) =>
  letters
    .map(({ ch, x }, i) => {
      if (ch === " ") return "";
      if (ch === "R") return `<g transform="translate(${x.toFixed(2)} 0)">${body(fill, `${id}${i}`)}</g>`;
      return `<path transform="translate(${x.toFixed(2)} 0) ${glyphT(bask)}" fill="${fill}" d="${glyphPath(ch)}"/>`;
    })
    .join("");
const lineDefs = () => ["wc", "wr", "ww"].map((id) => letters.map((l, i) => (l.ch === "R" ? defs(`${id}${i}`) : "")).join("")).join("");
// bounds of the line: from the first mark's left ink to the last k's right edge; height = mark's box
const lx0 = ux0, lx1 = letters[letters.length - 1].x + adv("k") + X, ly0 = uy0, ly1 = uy1;
const LW = lx1 - lx0, LH = ly1 - ly0;
const WM_H = 160, WM_PAD = 28;
const fw = (WM_H - WM_PAD * 2) / LH;
const WM_W = Math.round(LW * fw + WM_PAD * 2);
const wfit = `translate(${WM_PAD} ${WM_PAD}) scale(${fw.toFixed(5)}) translate(${-lx0} ${-ly0})`;
const woff = 5 / fw;
const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WM_W} ${WM_H}" width="${WM_W}" height="${WM_H}">${lineDefs()}<rect width="${WM_W}" height="${WM_H}" rx="24" fill="#000"/><g transform="${wfit}"><g style="mix-blend-mode:screen" transform="translate(${-woff} ${-woff * 0.7})">${lineBody(CY, "wc")}</g><g style="mix-blend-mode:screen" transform="translate(${woff} ${woff * 0.7})">${lineBody(RD, "wr")}</g>${lineBody("#fff", "ww")}</g></svg>`;

fs.mkdirSync(path.join(root, "assets"), { recursive: true });
fs.writeFileSync(path.join(root, "assets", "icon.svg"), mark());
fs.writeFileSync(path.join(root, "server", "public", "icon.svg"), mark());
fs.writeFileSync(path.join(root, "assets", "wordmark.svg"), wordmark);
console.log("wrote assets/icon.svg, assets/wordmark.svg, server/public/icon.svg");

let chrome = process.env.RIKROK_BROWSER || "";
if (!chrome) { try { chrome = execSync("find node_modules/.remotion -name 'chrome-headless-shell' -type f | head -1", { cwd: root }).toString().trim(); } catch {} }
if (!chrome) { console.log("no headless Chrome yet; PNG icons skipped"); process.exit(0); }
const puppeteer = (await import("puppeteer-core")).default;
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
for (const size of [180, 512]) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:#000">${mark({ size, pad: size === 180 ? 0 : 96 })}</body></html>`);
  await page.screenshot({ path: path.join(root, "server", "public", `icon-${size}.png`), clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`wrote server/public/icon-${size}.png`);
}
const wmW = Number(wordmark.match(/width="(\d+)"/)[1]);
await page.setViewport({ width: wmW, height: 160, deviceScaleFactor: 2 });
await page.setContent(`<html><body style="margin:0;background:#000">${wordmark}</body></html>`);
await page.evaluateHandle("document.fonts.ready");
await page.screenshot({ path: path.join(root, "assets", "wordmark.png"), clip: { x: 0, y: 0, width: wmW, height: 160 } });
console.log("wrote assets/wordmark.png");
await browser.close();
