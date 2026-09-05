import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { theme, Beat, Flow, ReelProps } from "./theme";

const { colors, fonts, bezier, safe } = theme;

const easeEnter = Easing.bezier(...bezier.enter);
const easeExit = Easing.bezier(...bezier.exit);

// Shared in/out motion per beat: rise + fade in, settle, fade out (build up, tear down).
function useBeatMotion(durationFrames: number) {
  const frame = useCurrentFrame();
  const inF = Math.min(14, durationFrames / 3);
  const outF = Math.min(10, durationFrames / 4);
  const enter = interpolate(frame, [0, inF], [0, 1], {
    extrapolateRight: "clamp",
    easing: easeEnter,
  });
  const exit = interpolate(frame, [durationFrames - outF, durationFrames], [1, 0], {
    extrapolateLeft: "clamp",
    easing: easeExit,
  });
  return { opacity: Math.min(enter, exit), rise: (1 - enter) * 46 };
}

const ScoreBug: React.FC<{
  projectName: string;
  accent: string;
  scoreBug: ReelProps["scoreBug"];
  handle?: string;
}> = ({ projectName, accent, scoreBug, handle }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [8, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeEnter,
  });
  return (
    <div
      style={{
        position: "absolute",
        top: safe.top,
        left: safe.x,
        right: safe.x,
        display: "flex",
        alignItems: "center",
        gap: 22,
        opacity,
        fontFamily: fonts.mono,
        fontSize: 26,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 3,
          background: accent,
          flexShrink: 0,
        }}
      />
      <div style={{ color: accent, fontWeight: 600, whiteSpace: "nowrap" }}>{projectName}</div>
      <div style={{ flex: 1, height: 1, background: colors.line }} />
      <div style={{ color: colors.textDim, whiteSpace: "nowrap" }}>
        {scoreBug.durationMin >= 100
          ? `${Math.floor(scoreBug.durationMin / 60)}h${scoreBug.durationMin % 60 ? ` ${scoreBug.durationMin % 60}m` : ""}`
          : `${scoreBug.durationMin}min`}
      </div>
      <div style={{ color: colors.cyan, whiteSpace: "nowrap" }}>{scoreBug.done} done</div>
      <div style={{ color: colors.red, whiteSpace: "nowrap" }}>{scoreBug.open} open</div>
      {handle && <div style={{ position: "absolute", top: 44, right: 0, color: colors.textDim, fontSize: 22, letterSpacing: "0.08em", textTransform: "none" }}>{handle}</div>}
    </div>
  );
};


const HeadlineCard: React.FC<{
  headline: string;
  accent: string;
  durationFrames: number;
  where?: string;
}> = ({ headline, accent, durationFrames, where }) => {
  const { opacity, rise } = useBeatMotion(durationFrames);
  const frame = useCurrentFrame();
  const rule = interpolate(frame, [4, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeEnter,
  });
  const [project, ...rest] = headline.split(":");
  const outcome = rest.join(":").trim();
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: `0 ${safe.x}px`, opacity }}>
      <div style={{ transform: `translateY(${rise}px)` }}>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 30,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: accent,
            marginBottom: 34,
          }}
        >
          Session Recap
        </div>
        <div
          style={{
            fontFamily: fonts.display,
            fontWeight: 700,
            fontSize: outcome.length > 34 ? 88 : 104,
            lineHeight: 1.04,
            color: colors.text,
          }}
        >
          {outcome ? (
            <>
              <span style={{ color: accent }}>{project.trim()}.</span> {outcome}
            </>
          ) : (
            headline
          )}
        </div>
        <div
          style={{
            marginTop: 44,
            height: 6,
            width: `${rule * 38}%`,
            background: accent,
            borderRadius: 3,
          }}
        />
        {where && (
          <div
            style={{
              marginTop: 30,
              fontFamily: fonts.mono,
              fontSize: 28,
              letterSpacing: "0.06em",
              color: colors.textDim,
            }}
          >
            {where}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

const visualLabel: Record<string, string> = {
  files: "Files touched",
  commits: "Git log",
  commands: "Commands",
  text: "From the session",
};

const PlayBeat: React.FC<{ beat: Beat; accent: string; index: number }> = ({
  beat,
  accent,
  index,
}) => {
  const { opacity, rise } = useBeatMotion(beat.durationFrames);
  const frame = useCurrentFrame();
  const lines = beat.visual?.lines ?? [];
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: `0 ${safe.x}px`, opacity }}>
      <div style={{ transform: `translateY(${rise}px)` }}>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 28,
            letterSpacing: "0.16em",
            color: accent,
            marginBottom: 26,
          }}
        >
          PLAY {index}
        </div>
        <div
          style={{
            fontFamily: fonts.display,
            fontWeight: 650,
            fontSize: 74,
            lineHeight: 1.08,
            color: colors.text,
            marginBottom: lines.length ? 54 : 0,
          }}
        >
          {beat.caption}
        </div>
        {lines.length > 0 && (
          <div
            style={{
              borderLeft: `5px solid ${accent}`,
              background: colors.panel,
              borderRadius: "0 14px 14px 0",
              padding: "34px 38px",
            }}
          >
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 24,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: colors.textDim,
                marginBottom: 20,
              }}
            >
              {visualLabel[beat.visual?.type ?? "text"] ?? "Evidence"}
            </div>
            {lines.map((l, i) => {
              const lineIn = interpolate(frame, [10 + i * 5, 20 + i * 5], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: easeEnter,
              });
              return (
                <div
                  key={i}
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 30,
                    lineHeight: 1.7,
                    color: colors.text,
                    opacity: lineIn,
                    transform: `translateX(${(1 - lineIn) * 20}px)`,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {l}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};


// Flow beat: what moves. Nodes laid out in the order things happen, edges drawn in one
// after another as the narration reaches them, a dot travelling along each edge, and the
// nodes this session changed lit in the accent.
const KIND_LABEL: Record<string, string> = { ui: "UI", api: "API", data: "DATA", service: "SERVICE", job: "JOB", external: "EXTERNAL" };

function layoutFlow(flow: Flow) {
  // Order: follow edges from nodes that nothing points at; fall back to given order.
  const incoming = new Map(flow.nodes.map((n) => [n.id, 0]));
  for (const e of flow.edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    order.push(id);
    for (const e of flow.edges) if (e.from === id) visit(e.to);
  };
  for (const n of flow.nodes) if ((incoming.get(n.id) ?? 0) === 0) visit(n.id);
  for (const n of flow.nodes) visit(n.id);
  // One column, top to bottom: the natural reading order on a 9:16 canvas.
  const n = order.length;
  const boxW = theme.canvas.width - safe.x * 2;
  const boxH = n <= 4 ? 128 : 108;
  const gap = n <= 4 ? 96 : 76;
  const pos = new Map<string, { x: number; y: number }>();
  order.forEach((id, i) => pos.set(id, { x: 0, y: i * (boxH + gap) }));
  return { order, pos, boxW, boxH, totalH: n * boxH + (n - 1) * gap };
}

const FlowBeat: React.FC<{ beat: Beat; accent: string }> = ({ beat, accent }) => {
  const { opacity, rise } = useBeatMotion(beat.durationFrames);
  const frame = useCurrentFrame();
  const flow = beat.flow ?? { nodes: [], edges: [], changed: [] };
  const { pos, boxW, boxH, totalH } = layoutFlow(flow);
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const changed = new Set(flow.changed);
  // edges appear across the middle 70% of the beat, evenly spaced
  const edgeCount = Math.max(1, flow.edges.length);
  const span = beat.durationFrames * 0.7;
  const perEdge = span / edgeCount;
  const edgeProgress = (i: number) => interpolate(frame, [12 + i * perEdge, 12 + (i + 1) * perEdge], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeEnter });
  const W = theme.canvas.width - safe.x * 2;
  const H = totalH + 40;
  const center = (id: string) => {
    const p = pos.get(id) ?? { x: 0, y: 0 };
    return { x: p.x + boxW / 2, y: p.y + boxH / 2 };
  };
  const edgePath = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    // vertical column: leave the bottom of one box, enter the top of the next; arrows that
    // go back up run along the right edge instead
    const down = b.y > a.y;
    if (down) return { sx: a.x, sy: a.y + boxH / 2, ex: b.x, ey: b.y - boxH / 2 };
    return { sx: a.x + boxW / 2 - 40, sy: a.y - boxH / 2, ex: b.x + boxW / 2 - 40, ey: b.y + boxH / 2 };
  };
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: `0 ${safe.x}px`, opacity }}>
      <div style={{ transform: `translateY(${rise}px)` }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 28, letterSpacing: "0.16em", color: accent, marginBottom: 26 }}>HOW IT MOVES</div>
        <div style={{ fontFamily: fonts.display, fontWeight: 650, fontSize: 60, lineHeight: 1.1, color: colors.text, marginBottom: 44 }}>{beat.caption}</div>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
          <defs>
            <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0L10 5L0 10z" fill={colors.textDim} />
            </marker>
          </defs>
          {flow.edges.map((e, i) => {
            const t = edgeProgress(i);
            if (t <= 0) return null;
            const { sx, sy, ex, ey } = edgePath(center(e.from), center(e.to));
            const x = sx + (ex - sx) * t, y = sy + (ey - sy) * t;
            const mx = (sx + ex) / 2, my = (sy + ey) / 2;
            return (
              <g key={i}>
                <line x1={sx} y1={sy} x2={x} y2={y} stroke={colors.textDim} strokeWidth={5} strokeLinecap="round" markerEnd={t >= 0.98 ? "url(#flow-arrow)" : undefined} />
                <circle cx={x} cy={y} r={11} fill={accent} />
                {e.label && t >= 0.98 && (
                  <text x={mx + 28} y={my + 8} textAnchor="start" fontFamily={fonts.mono} fontSize={24} fill={colors.textDim} letterSpacing="0.1em">
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
          {flow.nodes.map((n, i) => {
            const p = pos.get(n.id) ?? { x: 0, y: 0 };
            const lit = changed.has(n.id);
            const nodeIn = interpolate(frame, [4 + i * 4, 16 + i * 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeEnter });
            return (
              <g key={n.id} transform={`translate(${p.x} ${p.y})`} opacity={nodeIn}>
                <rect width={boxW} height={boxH} rx={18} fill={lit ? accent : colors.panel} stroke={lit ? accent : colors.line} strokeWidth={3} />
                <text x={28} y={38} fontFamily={fonts.mono} fontSize={22} letterSpacing="0.14em" fill={lit ? "rgba(0,0,0,0.6)" : colors.textDim}>
                  {KIND_LABEL[n.kind] ?? "SERVICE"}
                </text>
                <text x={28} y={boxH - 34} fontFamily={fonts.display} fontWeight={650} fontSize={boxH > 110 ? 44 : 38} fill={lit ? "#000" : colors.text}>
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </AbsoluteFill>
  );
};

const StatusBeat: React.FC<{ beat: Beat; accent: string }> = ({ beat, accent }) => {
  const { opacity, rise } = useBeatMotion(beat.durationFrames);
  const col = (
    label: string,
    items: string[],
    color: string,
    mark: string,
  ) => (
    <div style={{ flex: 1 }}>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 26,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color,
          marginBottom: 24,
        }}
      >
        {label}
      </div>
      {(items.length ? items : ["—"]).map((it, i) => (
        <div
          key={i}
          style={{
            fontFamily: fonts.serif,
            fontSize: 34,
            lineHeight: 1.5,
            color: colors.text,
            marginBottom: 14,
            display: "flex",
            gap: 14,
          }}
        >
          <span style={{ color, flexShrink: 0 }}>{mark}</span>
          <span>{it}</span>
        </div>
      ))}
    </div>
  );
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: `0 ${safe.x}px`, opacity }}>
      <div style={{ transform: `translateY(${rise}px)` }}>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 28,
            letterSpacing: "0.16em",
            color: accent,
            marginBottom: 26,
          }}
        >
          STATUS
        </div>
        <div
          style={{
            fontFamily: fonts.display,
            fontWeight: 650,
            fontSize: 66,
            lineHeight: 1.1,
            color: colors.text,
            marginBottom: 56,
          }}
        >
          {beat.caption}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 44 }}>
          {col("Shipped", beat.achieved ?? [], colors.cyan, "✓")}
          {col("Open", beat.open ?? [], colors.red, "○")}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const NextStepCard: React.FC<{ beat: Beat; accent: string }> = ({ beat, accent }) => {
  const { opacity, rise } = useBeatMotion(beat.durationFrames);
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: `0 ${safe.x}px`, opacity }}>
      <div style={{ transform: `translateY(${rise}px)` }}>
        <div
          style={{
            background: accent,
            borderRadius: 22,
            padding: "64px 56px",
            boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
          }}
        >
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 28,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(0, 0, 0, 0.72)",
              marginBottom: 28,
            }}
          >
            Next step
          </div>
          <div
            style={{
              fontFamily: fonts.display,
              fontWeight: 700,
              fontSize: 68,
              lineHeight: 1.12,
              color: colors.bg,
            }}
          >
            {beat.caption}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Reel: React.FC<ReelProps> = (props) => {
  let playIdx = 0;
  return (
    <AbsoluteFill style={{ background: colors.bg }}>
      <Audio src={staticFile(props.audioFile)} />
      {props.beats.map((beat, i) => {
        let content: React.ReactNode = null;
        if (beat.kind === "headline") {
          content = (
            <HeadlineCard
              headline={props.headline}
              accent={props.accent}
              durationFrames={beat.durationFrames}
              where={props.where}
            />
          );
        } else if (beat.kind === "play") {
          playIdx++;
          content = <PlayBeat beat={beat} accent={props.accent} index={playIdx} />;
        } else if (beat.kind === "flow") {
          content = <FlowBeat beat={beat} accent={props.accent} />;
        } else if (beat.kind === "status") {
          content = <StatusBeat beat={beat} accent={props.accent} />;
        } else {
          content = <NextStepCard beat={beat} accent={props.accent} />;
        }
        return (
          <Sequence key={i} from={beat.startFrame} durationInFrames={beat.durationFrames}>
            {content}
          </Sequence>
        );
      })}
      <ScoreBug projectName={props.projectName} accent={props.accent} scoreBug={props.scoreBug} handle={props.handle} />
    </AbsoluteFill>
  );
};
