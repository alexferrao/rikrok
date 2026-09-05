import React from "react";
import { Composition } from "remotion";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/spectral/400.css";
import "@fontsource/spectral/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import { Reel } from "./Reel";
import { theme, ReelProps } from "./theme";

const defaultProps: ReelProps = {
  projectName: "example-app",
  accent: "#69C9D0",
  headline: "example-app: signup form guarded and tested",
  where: "~/example-app · main",
  scoreBug: { durationMin: 42, done: 3, open: 1 },
  beats: [
    { kind: "headline", caption: "", startFrame: 0, durationFrames: 90 },
    {
      kind: "play",
      caption: "Double submit fixed",
      startFrame: 90,
      durationFrames: 120,
      visual: { type: "files", lines: ["src/components/SignupForm.tsx", "src/hooks/useSubmitGuard.ts"] },
    },
    {
      kind: "flow",
      caption: "Signup submit, guarded",
      startFrame: 210,
      durationFrames: 200,
      flow: {
        nodes: [
          { id: "btn", label: "Sign up button", kind: "ui" },
          { id: "guard", label: "submit guard", kind: "service" },
          { id: "api", label: "POST /signup", kind: "api" },
          { id: "db", label: "users table", kind: "data" },
        ],
        edges: [
          { from: "btn", to: "guard", label: "tap" },
          { from: "guard", to: "api", label: "once" },
          { from: "api", to: "db", label: "writes" },
        ],
        changed: ["guard"],
      },
    },
    {
      kind: "status",
      caption: "3 done, 1 open",
      startFrame: 410,
      durationFrames: 100,
      achieved: ["Guard on signup form", "4 tests green", "1 commit on main"],
      open: ["Checkout guard test"],
    },
    { kind: "next", caption: "Deploy to staging and verify on a phone", startFrame: 510, durationFrames: 110 },
  ],
  audioFile: "silence.wav",
  totalFrames: 620,
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Reel"
    component={Reel}
    width={theme.canvas.width}
    height={theme.canvas.height}
    fps={theme.canvas.fps}
    durationInFrames={620}
    defaultProps={defaultProps}
    calculateMetadata={({ props }) => ({ durationInFrames: props.totalFrames })}
  />
);
