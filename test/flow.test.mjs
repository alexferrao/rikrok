import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateScript, validateFlow, normalise, fallbackScript } from "../src/lib/llm.mjs";
import { beatDefsFor, narrationTextsFor, previousRecap } from "../src/lib/pipeline.mjs";

const base = () => ({ headline: "x", plays: [{ caption: "c", narration: "n", visual: { type: "text", lines: [] } }], status: { narration: "s" }, next_step: { caption: "c", narration: "n" }, headline_narration: "h" });
const flow = () => ({ title: "Signup submit, guarded", narration: "Tap goes through the guard once to the API.", nodes: [{ id: "btn", label: "Sign up button", kind: "ui" }, { id: "api", label: "POST /signup", kind: "api" }], edges: [{ from: "btn", to: "api", label: "submits" }], changed: ["btn"] });

test("a valid flow survives validation and adds a beat between plays and status", () => {
  const s = { ...base(), flow: flow() };
  assert.deepEqual(validateScript(s), { ok: true });
  const n = normalise(s, "demo");
  assert.equal(n.flow.nodes.length, 2);
  const kinds = beatDefsFor(n).map((b) => b.kind);
  assert.deepEqual(kinds, ["headline", "play", "flow", "status", "next"]);
  assert.equal(narrationTextsFor(n).length, kinds.length);
});

test("a broken flow is dropped, not fatal", () => {
  const bad = { ...base(), flow: { ...flow(), edges: [{ from: "btn", to: "nope" }] } };
  assert.deepEqual(validateScript(bad), { ok: true });
  assert.equal(bad.flow, null);
  assert.equal(validateFlow({ nodes: [{ id: "a", label: "a" }], edges: [], narration: "x" }).ok, false);
  assert.equal(fallbackScript({}, "p").flow, null);
});

test("previousRecap prefers the same session, then the same project", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rikrok-"));
  const w = (id, d) => fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(d));
  w("a", { sessionId: "s1", project: "p", createdAt: "2026-01-01", next_step: "old project step", headline: "h" });
  w("b", { sessionId: "s2", project: "p", createdAt: "2026-02-01", next_step: "newer project step", headline: "h" });
  w("c", { sessionId: "s1", project: "p", createdAt: "2026-01-15", next_step: "session step", headline: "h" });
  assert.equal(previousRecap("s1", "p", dir).next_step, "session step");
  assert.equal(previousRecap("s9", "p", dir).next_step, "newer project step");
  assert.equal(previousRecap("s9", "other", dir), null);
});
