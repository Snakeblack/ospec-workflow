"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { main } = require("./phase-completion-run.js");
const { readArchiveGateFacts } = require("./lib/archive-transaction.js");

const STATE = [
  "change: jwt-auth",
  "status: ready-for-verify",
  "revision: 4",
  "phases:",
  "  apply:",
  "    status: done",
  "",
].join("\n");

const VERIFY_ENVELOPE = {
  schema_version: 1,
  status: "success",
  executive_summary: "All 12 scenarios pass with evidence.",
  artifacts: ["openspec/changes/jwt-auth/verify-report.md"],
  next_recommended: "sdd-archive",
  risks: "None",
  skill_resolution: "injected",
  verify_outcome: "PASS",
};

function finalMessage(envelope) {
  return ["## Verification Report", "", "Verdict: PASS", "", "```json:result-envelope", JSON.stringify(envelope, null, 2), "```", ""].join("\n");
}

async function workspaceWithState(t, state = STATE) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "ospec-phase-run-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  const changeDir = path.join(workspace, "openspec", "changes", "jwt-auth");
  await fs.mkdir(changeDir, { recursive: true });
  const statePath = path.join(changeDir, "state.yaml");
  await fs.writeFile(statePath, state, "utf8");
  return { workspace, statePath };
}

async function run(workspace, argv) {
  const out = [];
  const err = [];
  let code = null;
  await main([...argv, "--workspace", workspace], {
    log: (line) => out.push(line),
    error: (line) => err.push(line),
    exit: (value) => {
      code = value;
    },
  });
  return { code, out: out.join("\n"), err: err.join("\n"), json: out.length ? JSON.parse(out[out.length - 1]) : null };
}

async function writeMessage(workspace, name, text) {
  const file = path.join(workspace, ".ospec", "session", "jwt-auth", name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
  return file;
}

test("[REQ-lifecycle-kernel-031] a verify result projected without SubagentStop opens the archive gate, and its replay is a noop", async (t) => {
  const { workspace, statePath } = await workspaceWithState(t);
  const file = await writeMessage(workspace, "verify-result.md", finalMessage(VERIFY_ENVELOPE));

  const first = await run(workspace, ["jwt-auth", "--phase", "verify", "--envelope-file", file]);
  assert.equal(first.code, 0, first.err);
  assert.deepEqual(first.json, { ok: true, change: "jwt-auth", phase: "verify", outcome: "advanced" });
  const projected = await fs.readFile(statePath, "utf8");
  assert.match(projected, /^status: verified$/m);
  assert.match(projected, /verdict: "PASS"/);
  const facts = readArchiveGateFacts(projected);
  assert.equal(facts.verdict, "PASS");
  assert.equal(facts.gatesSatisfied, true);

  const replay = await run(workspace, ["jwt-auth", "--phase", "sdd-verify", "--envelope-file", file]);
  assert.equal(replay.code, 0, replay.err);
  assert.equal(replay.json.outcome, "noop-replay");
  assert.equal(await fs.readFile(statePath, "utf8"), projected);
});

test("[REQ-lifecycle-kernel-031] the runner accepts the bare envelope JSON and keeps .ospec out of version control", async (t) => {
  const { workspace, statePath } = await workspaceWithState(t);
  const file = await writeMessage(workspace, "verify.json", JSON.stringify(VERIFY_ENVELOPE));

  const result = await run(workspace, ["jwt-auth", "--phase", "verify", "--envelope-file", file]);

  assert.equal(result.code, 0, result.err);
  assert.match(await fs.readFile(statePath, "utf8"), /verdict: "PASS"/);
  assert.equal(await fs.readFile(path.join(workspace, ".ospec", ".gitignore"), "utf8"), "*\n");
});

test("[REQ-lifecycle-kernel-031] an invalid or missing envelope changes nothing and exits 1", async (t) => {
  const { workspace, statePath } = await workspaceWithState(t);
  const invalid = await writeMessage(workspace, "invalid.md", finalMessage({ ...VERIFY_ENVELOPE, status: "maybe" }));
  const prose = await writeMessage(workspace, "prose.md", "I could not finish the verification.");

  const bad = await run(workspace, ["jwt-auth", "--phase", "verify", "--envelope-file", invalid]);
  assert.equal(bad.code, 1);
  assert.equal(bad.json.ok, false);
  assert.equal(bad.json.outcome, "invalid-envelope");
  assert.ok(bad.json.errors.some((error) => error.startsWith("status must be one of")), JSON.stringify(bad.json));

  const none = await run(workspace, ["jwt-auth", "--phase", "verify", "--envelope-file", prose]);
  assert.equal(none.code, 1);
  assert.equal(none.json.outcome, "no-envelope");

  assert.equal(await fs.readFile(statePath, "utf8"), STATE);
});

test("[REQ-lifecycle-kernel-031] a state the projector refuses is reported to the caller", async (t) => {
  const malformed = "change: jwt-auth\nstatus: planning\nphases:\n  verify:\n    summary: \"never closed\n";
  const { workspace, statePath } = await workspaceWithState(t, malformed);
  const file = await writeMessage(workspace, "verify-result.md", finalMessage(VERIFY_ENVELOPE));

  const result = await run(workspace, ["jwt-auth", "--phase", "verify", "--envelope-file", file]);

  assert.equal(result.code, 1);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.outcome, "malformed-state");
  assert.equal(await fs.readFile(statePath, "utf8"), malformed);
});

test("[REQ-lifecycle-kernel-031] usage errors exit 1 without touching state", async (t) => {
  const { workspace, statePath } = await workspaceWithState(t);
  const file = await writeMessage(workspace, "verify-result.md", finalMessage(VERIFY_ENVELOPE));

  for (const argv of [
    ["../jwt-auth", "--phase", "verify", "--envelope-file", file],
    ["jwt-auth", "--envelope-file", file],
    ["jwt-auth", "--phase", "verify"],
    ["jwt-auth", "--phase", "review-trust", "--envelope-file", file],
    ["jwt-auth", "--phase", "Verify Phase", "--envelope-file", file],
  ]) {
    const result = await run(workspace, argv);
    assert.equal(result.code, 1, argv.join(" "));
    assert.ok(result.err, argv.join(" "));
  }
  assert.equal(await fs.readFile(statePath, "utf8"), STATE);
});
