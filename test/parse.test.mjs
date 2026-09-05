import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as claude from "../src/sources/claude.mjs";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "claude-session.jsonl");

test("fixture session parses into the Activity shape and qualifies", async () => {
  const act = await claude.parseSession(fixture, 0);
  assert.equal(act.cwd, "/home/dev/example-app");
  assert.equal(act.gitBranch, "main");
  assert.ok(act.assistantTurns >= 10, `assistantTurns=${act.assistantTurns}`);
  assert.ok(act.toolUses >= 3, `toolUses=${act.toolUses}`);
  assert.ok(act.filesTouched.includes("/home/dev/example-app/src/components/SignupForm.tsx"));
  assert.ok(act.commands.length >= 3);
  assert.deepEqual(act.urls, ["https://staging.example.com/signup"]);
  assert.equal(act.todoSnapshots.length, 3);
  assert.ok(act.activeMs > 10 * 60_000);
  assert.ok(claude.qualifies(act));
});

test("parsing from a line offset only counts the new activity", async () => {
  const full = await claude.parseSession(fixture, 0);
  const tail = await claude.parseSession(fixture, full.totalLines - 4);
  assert.equal(tail.totalLines, full.totalLines);
  assert.ok(tail.assistantTurns < full.assistantTurns);
  assert.ok(!claude.qualifies(tail));
});

test("project name comes from the cwd, or a capture group when configured", async () => {
  const act = await claude.parseSession(fixture, 0);
  assert.equal(claude.projectName(act, "-home-dev-example-app"), "example-app");
  assert.equal(claude.projectName({ cwd: null }, "whatever-dir"), "whatever-dir");
});
