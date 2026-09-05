// Rik Rok look: black canvas, white type, cyan for what shipped, red for what is
// still open, and a cyan/red offset ghost on the headline. Colour is semantic,
// one idea per beat, motion only through interpolate/spring with named curves.
export const theme = {
  colors: {
    bg: "#000000",
    text: "#ffffff",
    textDim: "#9a9a9a",
    cyan: "#69C9D0", // done, the good state
    red: "#EE1D52", // open, the costly state
    line: "rgba(255, 255, 255, 0.18)",
    panel: "rgba(255, 255, 255, 0.06)",
  },
  fonts: {
    display: "'Bricolage Grotesque Variable', 'Helvetica Neue', sans-serif",
    serif: "'Spectral', Georgia, serif",
    mono: "'IBM Plex Mono', ui-monospace, monospace",
  },
  canvas: { width: 1080, height: 1920, fps: 30 },
  bezier: {
    enter: [0.16, 1, 0.3, 1] as const,
    exit: [0.7, 0, 0.84, 0] as const,
  },
  safe: { top: 140, bottom: 220, x: 84 },
};

export type FlowNode = { id: string; label: string; kind: "ui" | "api" | "data" | "service" | "job" | "external" };
export type FlowEdge = { from: string; to: string; label: string };
export type Flow = { nodes: FlowNode[]; edges: FlowEdge[]; changed: string[] };

export type Beat = {
  kind: "headline" | "play" | "flow" | "status" | "next";
  caption: string;
  startFrame: number;
  durationFrames: number;
  visual?: { type: string; lines: string[] };
  achieved?: string[];
  open?: string[];
  flow?: Flow;
};

export type ReelProps = {
  projectName: string;
  accent: string;
  headline: string;
  where?: string; // "~/my-app · main": repo path + branch
  handle?: string; // optional handle shown under the score bug
  scoreBug: { durationMin: number; done: number; open: number };
  beats: Beat[];
  audioFile: string;
  totalFrames: number;
};
