import test from "node:test";
import assert from "node:assert/strict";
import { buildProps, buildBeats, narrationTextsFor, FPS, MIN_BEAT_SEC, shortPath } from "../src/lib/pipeline.mjs";
import { fallbackScript } from "../src/lib/llm.mjs";
import os from "node:os";

const script = fallbackScript({ duration_minutes: 20, assistant_turns: 12, tool_uses: 9, git_commits: ["abc Fix"], files_touched: ["a.ts", "b.ts"], commands_run: ["npm test"], todos: [{ content: "Deploy", status: "pending" }] }, "demo");

test("buildProps returns the ReelProps shape with contiguous beats", () => {
  const texts = narrationTextsFor(script);
  const beatTimes = texts.map((_, i) => ({ start: i * 3, duration: 3 }));
  const props = buildProps({ script, projectName: "demo", accent: "#69C9D0", where: "~/demo · main", durationMin: 20, beatTimes, totalDuration: texts.length * 3 });
  assert.equal(props.projectName, "demo");
  assert.equal(props.beats.length, texts.length);
  assert.equal(props.beats[0].kind, "headline");
  assert.equal(props.beats.at(-1).kind, "next");
  for (let i = 1; i < props.beats.length; i++) assert.equal(props.beats[i].startFrame, props.beats[i - 1].startFrame + props.beats[i - 1].durationFrames);
  assert.equal(props.totalFrames, props.beats.at(-1).startFrame + props.beats.at(-1).durationFrames);
  assert.deepEqual(props.scoreBug, { durationMin: 20, done: script.done_count, open: script.open_count });
});

test("short beats are padded to the readable minimum", () => {
  const defs = [{ kind: "headline", caption: "h" }, { kind: "next", caption: "n" }];
  const { beats } = buildBeats(defs, [{ start: 0 }, { start: 0.5 }], 1);
  assert.ok(beats[0].durationFrames >= MIN_BEAT_SEC * FPS);
});

test("shortPath swaps the home dir for ~", () => {
  assert.equal(shortPath(os.homedir() + "/x/y"), "~/x/y");
  assert.equal(shortPath("/srv/app"), "/srv/app");
  assert.equal(shortPath(null), null);
});
