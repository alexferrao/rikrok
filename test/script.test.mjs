import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as claude from "../src/sources/claude.mjs";
import { condense } from "../src/lib/evidence.mjs";
import { fallbackScript, validateScript, extractJson, stripThinking, normalise, unspeakUrl } from "../src/lib/llm.mjs";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "claude-session.jsonl");

test("template script from the fixture passes validation without an LLM", async () => {
  const act = await claude.parseSession(fixture, 0);
  const ev = condense(act, ["abc1234 Guard signup form against double submit"]);
  const s = fallbackScript(ev, "example-app");
  assert.deepEqual(validateScript(s), { ok: true });
  assert.ok(s.plays.length >= 1 && s.plays.length <= 4);
  assert.match(s.next_step.caption, /checkout|staging/i);
  assert.ok(s.status.achieved.some((a) => /commit/i.test(a)));
});

test("thinking blocks and prose around JSON are stripped", () => {
  const raw = '<think>let me think</think>Sure, here it is:\n{"headline":"x"}\nHope that helps';
  assert.deepEqual(extractJson(stripThinking(raw)), { headline: "x" });
});

test("normalise clamps lengths and prefixes the project name", () => {
  const s = normalise(
    { headline: "Shipped it", plays: [{ caption: "a".repeat(80), narration: "n", visual: { type: "bogus", lines: ["l"] } }], status: {}, next_step: { caption: "c", narration: "n" }, headline_narration: "h" },
    "my-app",
  );
  assert.equal(s.headline, "my-app: Shipped it");
  assert.equal(s.plays[0].caption.length, 60);
  assert.equal(s.plays[0].visual.type, "text");
});

test("spoken URLs in on-screen text are written back as URLs", () => {
  assert.equal(unspeakUrl("Preview live at staging dot example dot com slash signup"), "Preview live at staging.example.com/signup");
  assert.equal(unspeakUrl("Nothing to see here"), "Nothing to see here");
});
