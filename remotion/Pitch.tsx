import React from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "./theme";

const { colors, fonts, safe } = theme;
const easeEnter = Easing.bezier(0.16, 1, 0.3, 1);

export type PitchKind = "pain" | "idea" | "voice" | "proof" | "cta";
export type Word = { text: string; start: number; end: number }; // frames
export type PitchProps = {
  kind: PitchKind;
  words?: Word[]; // narration, word-timed, for captions
  label: string; // small mono label, top
  lines: string[]; // the statement, one array item per line, "*word*" highlights in cyan
  sub?: string; // smaller line under the statement
  audioFile: string;
  totalFrames: number;
  accent?: string;
};

const useIn = (from: number, len = 14) => {
  const f = useCurrentFrame();
  return interpolate(f, [from, from + len], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeEnter });
};

// "*word*" -> highlighted span
const Rich: React.FC<{ text: string; accent: string }> = ({ text, accent }) => (
  <>
    {text.split(/(\*[^*]+\*)/).map((part, i) =>
      part.startsWith("*") ? (
        <span key={i} style={{ color: accent }}>
          {part.slice(1, -1)}
        </span>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      ),
    )}
  </>
);

const Statement: React.FC<{ lines: string[]; accent: string; size?: number; from?: number }> = ({ lines, accent, size = 96, from = 6 }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: size, lineHeight: 1.02, color: colors.text, letterSpacing: "-0.02em" }}>
      {lines.map((l, i) => {
        const t = interpolate(f, [from + i * 6, from + i * 6 + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeEnter });
        return (
          <div key={i} style={{ opacity: t, transform: `translateY(${(1 - t) * 30}px)`, textWrap: "balance" as never }}>
            <Rich text={l} accent={accent} />
          </div>
        );
      })}
    </div>
  );
};

const Label: React.FC<{ text: string; accent: string }> = ({ text, accent }) => {
  const t = useIn(0, 10);
  return <div style={{ fontFamily: fonts.mono, fontSize: 28, letterSpacing: "0.18em", textTransform: "uppercase", color: accent, marginBottom: 34, opacity: t }}>{text}</div>;
};

// Pain: six session cards stacking up, cursors blinking, then they dim to grey.
const SessionPile: React.FC<{ accent: string }> = ({ accent }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const names = ["billing-api", "mobile-app", "cura-svelte", "infra", "docs-site", "ml-notebooks"];
  return (
    <div style={{ position: "relative", height: 620, marginTop: 40 }}>
      {names.map((n, i) => {
        const s = spring({ frame: f - 8 - i * 9, fps, config: { damping: 16, stiffness: 140 } });
        const fade = interpolate(f, [110 + i * 4, 140 + i * 4], [1, 0.35], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const blink = Math.floor(f / 12 + i) % 2 === 0;
        return (
          <div
            key={n}
            style={{
              position: "absolute",
              left: (i % 2) * 24,
              top: i * 92,
              width: 880,
              height: 110,
              borderRadius: 16,
              background: colors.panel,
              border: `2px solid ${colors.line}`,
              opacity: s * fade,
              transform: `translateY(${(1 - s) * 80}px) rotate(${(i % 2 ? 1 : -1) * 0.8}deg)`,
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "0 30px",
              fontFamily: fonts.mono,
              fontSize: 30,
              color: colors.text,
            }}
          >
            <span style={{ color: accent }}>❯</span>
            <span>claude</span>
            <span style={{ color: colors.textDim }}>~/{n}</span>
            <span style={{ marginLeft: "auto", width: 18, height: 40, background: blink ? colors.text : "transparent" }} />
          </div>
        );
      })}
    </div>
  );
};

// Idea: a phone with reel cards snapping upward, one every ~1.2 s.
const PhoneFeed: React.FC<{ accent: string }> = ({ accent }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cards = [
    ["billing-api", "Refunds endpoint live, 2 open", "Add retry on webhook"],
    ["mobile-app", "Onboarding flow rebuilt", "Test on a slow phone"],
    ["infra", "Staging DB moved", "Run the migration"],
    ["docs-site", "Search shipped, 41 pages", "Ship it"],
  ];
  const step = 36, start = 24;
  const W = 520, H = 920;
  const k = Math.max(0, f - start);
  const idx = Math.min(cards.length - 1, Math.floor(k / step));
  const t = idx < cards.length - 1 ? spring({ frame: k - idx * step - 20, fps, config: { damping: 18, stiffness: 170 } }) : 0;
  const card = ([p, h, n]: string[], y: number) => (
    <div key={p} style={{ position: "absolute", inset: 0, transform: `translateY(${y}px)`, padding: 40, background: "#000", display: "flex", flexDirection: "column" }}>
      <div style={{ fontFamily: fonts.mono, fontSize: 20, letterSpacing: "0.14em", color: accent }}>■ {p.toUpperCase()}</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
        <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 52, lineHeight: 1.06, color: colors.text }}>{h}</div>
      </div>
      <div style={{ fontFamily: fonts.mono, fontSize: 20, color: colors.red }}>Next: {n}</div>
    </div>
  );
  return (
    <div style={{ position: "relative", width: W, height: H, margin: "40px auto 0", borderRadius: 60, border: `6px solid ${colors.line}`, overflow: "hidden", background: "#000" }}>
      {card(cards[idx], -t * H)}
      {idx < cards.length - 1 && card(cards[idx + 1], H - t * H)}
    </div>
  );
};

// Voice: a waveform in the accent that never leaves a box labelled 127.0.0.1
const Waveform: React.FC<{ accent: string }> = ({ accent }) => {
  const f = useCurrentFrame();
  const bars = 42;
  const inT = useIn(10, 20);
  return (
    <div style={{ marginTop: 60, padding: "50px 40px", borderRadius: 24, border: `2px solid ${colors.line}`, background: colors.panel, opacity: inT }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 220 }}>
        {Array.from({ length: bars }).map((_, i) => {
          const h = 30 + Math.abs(Math.sin(f / 5 + i * 0.7) * Math.cos(f / 9 + i * 0.3)) * 180;
          return <div key={i} style={{ flex: 1, height: h, borderRadius: 6, background: i % 7 === 3 ? colors.red : accent }} />;
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 34, fontFamily: fonts.mono, fontSize: 26, letterSpacing: "0.12em", color: colors.textDim }}>
        <span>127.0.0.1</span>
        <span style={{ color: accent }}>NO CLOUD · NO UPLOAD</span>
      </div>
    </div>
  );
};

// Proof: the flow card, compressed.
const MiniFlow: React.FC<{ accent: string }> = ({ accent }) => {
  const f = useCurrentFrame();
  const nodes = [["UI", "Sign up button"], ["SERVICE", "submit guard"], ["API", "POST /signup"]];
  return (
    <div style={{ marginTop: 50, display: "flex", flexDirection: "column", gap: 0 }}>
      {nodes.map(([k, l], i) => {
        const t = interpolate(f, [12 + i * 16, 26 + i * 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeEnter });
        const lit = i === 1;
        return (
          <React.Fragment key={l}>
            {i > 0 && <div style={{ width: 5, height: 60, marginLeft: 60, background: colors.textDim, opacity: t }} />}
            <div style={{ opacity: t, transform: `translateY(${(1 - t) * 20}px)`, borderRadius: 18, padding: "22px 30px", background: lit ? accent : colors.panel, border: `3px solid ${lit ? accent : colors.line}` }}>
              <div style={{ fontFamily: fonts.mono, fontSize: 22, letterSpacing: "0.14em", color: lit ? "rgba(0,0,0,0.6)" : colors.textDim }}>{k}</div>
              <div style={{ fontFamily: fonts.display, fontWeight: 650, fontSize: 40, color: lit ? "#000" : colors.text }}>{l}</div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  // 1. the mark alone, springs in
  const markIn = spring({ frame: f - 4, fps, config: { damping: 14, stiffness: 120 } });
  // 2. at ~1.3 s the mark fades and shrinks while the wordmark grows out of the same spot
  const swap = interpolate(f, [38, 66], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeEnter });
  const markOpacity = 1 - swap;
  const markScale = markIn * (1 - swap * 0.35);
  const wordScale = 0.55 + swap * 0.45;
  // 3. the install line after the wordmark settles
  const t3 = useIn(74, 16);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 120 }}>
      <div style={{ position: "relative", width: 900, height: 420, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Img src={staticFile("mark.png")} style={{ position: "absolute", width: 380, height: 380, borderRadius: 74, opacity: markOpacity, transform: `scale(${markScale})` }} />
        <Img src={staticFile("wordmark.png")} style={{ position: "absolute", width: 900, opacity: swap, transform: `scale(${wordScale})` }} />
      </div>
      <div style={{ marginTop: 40, opacity: t3, transform: `translateY(${(1 - t3) * 20}px)`, fontFamily: fonts.mono, fontSize: 40, color: colors.text, background: colors.panel, border: `2px solid ${colors.line}`, borderRadius: 16, padding: "22px 40px" }}>
        $ npm install -g rikrok
      </div>
      <div style={{ marginTop: 34, opacity: t3, fontFamily: fonts.mono, fontSize: 26, letterSpacing: "0.14em", color: colors.textDim }}>OPEN SOURCE · MIT · LOCAL-FIRST</div>
    </div>
  );
};

// Captions: the current phrase (5 to 7 words) at the bottom, the spoken word lit.
const Captions: React.FC<{ words: Word[]; accent: string }> = ({ words, accent }) => {
  const f = useCurrentFrame();
  if (!words.length) return null;
  // phrases: cut every 6 words, or at sentence punctuation
  const phrases: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= 6 || /[.!?]$/.test(w.text)) {
      phrases.push(cur);
      cur = [];
    }
  }
  if (cur.length) phrases.push(cur);
  const phrase = phrases.find((p) => f >= p[0].start - 4 && f <= p[p.length - 1].end + 8) ?? (f < words[0].start ? null : null);
  if (!phrase) return null;
  const inT = interpolate(f, [phrase[0].start - 4, phrase[0].start + 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: safe.x, right: safe.x, bottom: safe.bottom + 40, textAlign: "center", opacity: inT }}>
      <div style={{ display: "inline-block", padding: "18px 30px", borderRadius: 18, background: "rgba(0,0,0,0.72)", fontFamily: fonts.display, fontWeight: 700, fontSize: 46, lineHeight: 1.25, color: colors.text, textWrap: "balance" as never }}>
        {phrase.map((w, i) => {
          const on = f >= w.start && f < w.end + 2;
          const done = f >= w.end + 2;
          return (
            <span key={i} style={{ color: on ? accent : done ? colors.text : colors.textDim, transition: "none" }}>
              {w.text}
              {i < phrase.length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export const Pitch: React.FC<PitchProps> = (props) => {
  const accent = props.accent ?? colors.cyan;
  const f = useCurrentFrame();
  const out = interpolate(f, [props.totalFrames - 12, props.totalFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const top = props.kind === "pain" || props.kind === "idea" ? 180 : props.kind === "cta" ? 300 : 360;
  const subIn = useIn(40, 16);
  return (
    <AbsoluteFill style={{ background: colors.bg, opacity: out }}>
      <Audio src={staticFile(props.audioFile)} />
      {props.kind !== "cta" && <div style={{ position: "absolute", top: safe.top - 20, left: safe.x, right: safe.x, display: "flex", alignItems: "center", gap: 18, fontFamily: fonts.mono, fontSize: 24, letterSpacing: "0.14em", color: colors.textDim }}>
        <Img src={staticFile("mark.png")} style={{ width: 44, height: 44, borderRadius: 10 }} />
        <span>RIK ROK</span>
      </div>}
      <div style={{ position: "absolute", top, left: safe.x, right: safe.x }}>
        {props.kind !== "cta" && <Label text={props.label} accent={accent} />}
        {props.kind !== "cta" && <Statement lines={props.lines} accent={accent} size={props.kind === "voice" ? 92 : 96} />}
        {props.sub && (
          <div style={{ marginTop: 30, fontFamily: fonts.serif, fontSize: 40, lineHeight: 1.35, color: colors.textDim, opacity: subIn }}>{props.sub}</div>
        )}
        {props.kind === "pain" && <SessionPile accent={accent} />}
        {props.kind === "idea" && <PhoneFeed accent={accent} />}
        {props.kind === "voice" && <Waveform accent={accent} />}
        {props.kind === "proof" && <MiniFlow accent={accent} />}
        {props.kind === "cta" && <Cta />}
      </div>
      <Captions words={props.words ?? []} accent={accent} />
    </AbsoluteFill>
  );
};
