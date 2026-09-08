import test from "node:test";
import assert from "node:assert/strict";
import { loadVoice, VOICE_SPECS } from "../src/voices/index.mjs";
import { SCRIPT } from "../src/cli/voice.mjs";

test("clone is a first-class voice spec", async () => {
  assert.ok(VOICE_SPECS.includes("clone"));
  const v = await loadVoice("clone");
  assert.equal(v.name, "clone");
  assert.equal(typeof v.synth, "function");
});

test("unknown voice specs fail loudly", async () => {
  await assert.rejects(() => loadVoice("robot:9000"), /unknown voice/);
});

test("the recording script is short enough to read in one go", () => {
  const words = SCRIPT.join(" ").split(/\s+/).length;
  assert.ok(words >= 30 && words <= 60, `${words} words`);
});

test("clone:<profile> resolves to its own folder", async () => {
  const { profilePaths } = await import("../src/voices/clone.mjs");
  const p = profilePaths("singing");
  assert.match(p.ref, /voice\/profiles\/singing\/ref\.wav$/);
  assert.match(profilePaths("../evil").dir, /profiles\/\.\._evil$/);
  const v = await loadVoice("clone:singing");
  assert.equal(v.name, "clone:singing");
});
