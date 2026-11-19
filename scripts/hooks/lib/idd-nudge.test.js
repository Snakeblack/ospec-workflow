"use strict";

// E1.51 open-change-nudge: when Stop asks the agent to continue an open IDD
// change and what SessionStart tells the model about the open changes.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { execFileSync } = require("node:child_process");

const {
  NUDGE_FILE,
  continuationActive,
  nudgeFingerprint,
  readRecord,
  sessionKey,
  sessionStartNudge,
  stopNudge,
} = require("./idd-nudge.js");

const ENV = {};

function repo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "idd-nudge-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["-C", root, "init", "-q", "-b", "main"]);
  fs.mkdirSync(path.join(root, "idd"));
  return root;
}

function entry(change, action = "satisfy-obligation", gateOpen = false) {
  return { change, action, gateOpen, nextAction: `Next step of \`${change}\`.` };
}

async function stop(root, entries, input = {}, env = ENV) {
  return stopNudge({ workspace: root, input: { session_id: "s1", ...input }, entries, env });
}

async function start(root, entries, input = {}, target = undefined, env = ENV) {
  return sessionStartNudge({ workspace: root, input: { session_id: "s1", ...input }, entries, target, env });
}

test("Stop asks once to continue a change the session moved, never twice for the same tree", async (t) => {
  const root = repo(t);
  const entries = [entry("fix-a")];
  assert.ok(await start(root, entries), "the session starts with the open change");
  fs.writeFileSync(path.join(root, "a.txt"), "before the resume\n");
  assert.ok(await start(root, entries, { source: "resume" }), "a resume gets the context again");
  fs.writeFileSync(path.join(root, "a.txt"), "edit\n");
  const asked = await stop(root, entries);
  assert.match(asked.reason, /^ospec: these open IDD changes have a next step to take:\n- `fix-a`: Next step of `fix-a`\.\n/);
  assert.match(asked.reason, /end your turn again/);
  assert.match(asked.reason, /ospec abandon --change <id>/);
  assert.equal(await stop(root, entries), null, "the same tree asks nothing");
  fs.writeFileSync(path.join(root, "a.txt"), "edit again\n");
  assert.ok((await stop(root, entries)).reason, "a new tree asks again");
});

test("a session that did not move the tree or the changes asks nothing", async (t) => {
  const root = repo(t);
  const entries = [entry("fix-a")];
  await start(root, entries);
  assert.equal(await stop(root, entries), null);
});

test("resolving a gate or recording evidence moves the fingerprint", async (t) => {
  const root = repo(t);
  fs.mkdirSync(path.join(root, "idd", "fix-a"));
  fs.writeFileSync(path.join(root, "idd", "fix-a", "state.yaml"), '{"gates":"open"}\n');
  const before = nudgeFingerprint(root, ["fix-a"]);
  fs.writeFileSync(path.join(root, "idd", "fix-a", "state.yaml"), '{"gates":"resolved"}\n');
  assert.notEqual(nudgeFingerprint(root, ["fix-a"]), before);
});

test("the fingerprint covers untracked content and leaves out .ospec/ and the files of a change", async (t) => {
  const root = repo(t);
  const clean = nudgeFingerprint(root, []);
  assert.equal(nudgeFingerprint(root, []), clean, "stable for the same tree");
  fs.mkdirSync(path.join(root, ".ospec"));
  fs.writeFileSync(path.join(root, ".ospec", "session.md"), "trace\n");
  fs.mkdirSync(path.join(root, "idd", "fix-a"));
  fs.writeFileSync(path.join(root, "idd", "fix-a", "change.md"), "# fix-a\n");
  assert.equal(nudgeFingerprint(root, []), clean, "ospec's own files do not move it");
  fs.writeFileSync(path.join(root, "idd", "config.yaml"), "checks:\n  test: npm test\n");
  const configured = nudgeFingerprint(root, []);
  assert.notEqual(configured, clean, "idd/config.yaml is the project's");
  fs.writeFileSync(path.join(root, "b.txt"), "one\n");
  const one = nudgeFingerprint(root, []);
  fs.writeFileSync(path.join(root, "b.txt"), "two\n");
  assert.notEqual(nudgeFingerprint(root, []), one, "the content of an untracked file counts");
});

test("an open gate anywhere is a legitimate stop", async (t) => {
  const root = repo(t);
  const entries = [entry("a-docs"), entry("b-fix", "resolve-gate", true)];
  await start(root, entries);
  fs.writeFileSync(path.join(root, "a.txt"), "edit\n");
  assert.equal(await stop(root, entries), null);
});

test("only the steps that need no answer ask, and one request names every change", async (t) => {
  const root = repo(t);
  const entries = [
    entry("a-plan", "declare-plan"),
    entry("b-checks", "configure-checks"),
    entry("c-close", "close"),
    entry("d-test", "satisfy-obligation"),
  ];
  await start(root, entries);
  fs.writeFileSync(path.join(root, "a.txt"), "edit\n");
  const { reason } = await stop(root, entries);
  assert.match(reason, /- `a-plan`: .*\n- `c-close`: .*\n- `d-test`: /);
  assert.doesNotMatch(reason, /b-checks/);
  const record = readRecord(root);
  assert.deepEqual(record.asked.map(({ change }) => change), ["a-plan", "c-close", "d-test"]);
});

test("configure-checks alone asks nothing", async (t) => {
  const root = repo(t);
  const entries = [entry("b-checks", "configure-checks")];
  await start(root, entries);
  fs.writeFileSync(path.join(root, "a.txt"), "edit\n");
  assert.equal(await stop(root, entries), null);
});

test("a turn that already continues one a hook asked for asks nothing", async (t) => {
  const root = repo(t);
  const entries = [entry("fix-a")];
  await start(root, entries);
  fs.writeFileSync(path.join(root, "a.txt"), "edit\n");
  for (const input of [{ stop_hook_active: true }, { continuationActive: true }, { continuation_active: true }, { loop_count: 1 }]) {
    assert.equal(await stop(root, entries, input), null, JSON.stringify(input));
  }
  assert.ok((await stop(root, entries, { stop_hook_active: false, loop_count: 0 })).reason);
  assert.equal(continuationActive({ loop_count: "1" }), false);
});

test("without the base of the session the first Stop records it and asks nothing", async (t) => {
  const root = repo(t);
  const entries = [entry("fix-a")];
  fs.writeFileSync(path.join(root, "a.txt"), "edit\n");
  assert.equal(await stop(root, entries), null);
  assert.deepEqual(readRecord(root).sessions.map(({ id }) => id), ["s1"]);
  fs.writeFileSync(path.join(root, "a.txt"), "edit again\n");
  assert.ok((await stop(root, entries)).reason);
});

test("a record that is missing or corrupt starts again", async (t) => {
  const root = repo(t);
  const entries = [entry("fix-a")];
  fs.mkdirSync(path.join(root, ".ospec"));
  fs.writeFileSync(path.join(root, ...NUDGE_FILE.split("/")), "{not json");
  assert.deepEqual(readRecord(root), { sessions: [], asked: [] });
  fs.writeFileSync(path.join(root, ...NUDGE_FILE.split("/")), JSON.stringify({ sessions: [{ id: "s1" }, { id: "s2", base: "x" }], asked: "no" }));
  assert.deepEqual(readRecord(root), { sessions: [{ id: "s2", base: "x" }], asked: [] }, "entries that are not well formed are dropped");
  await start(root, entries);
  fs.writeFileSync(path.join(root, "a.txt"), "edit\n");
  assert.ok((await stop(root, entries)).reason);
});

test("the record keeps the most recent sessions and fingerprints", async (t) => {
  const root = repo(t);
  for (let index = 0; index < 40; index += 1) {
    await start(root, [], { session_id: `s${index}` });
  }
  const { sessions } = readRecord(root);
  assert.equal(sessions.length, 32);
  assert.equal(sessions[0].id, "s8");
  assert.equal(sessions[31].id, "s39");
});

test("DISABLE_IDD_NUDGE=true turns off the request and the context", async (t) => {
  const root = repo(t);
  const entries = [entry("fix-a")];
  const off = { DISABLE_IDD_NUDGE: "true" };
  assert.equal(await start(root, entries, {}, undefined, off), null);
  fs.writeFileSync(path.join(root, "a.txt"), "edit\n");
  assert.equal(await stop(root, entries, {}, off), null);
  assert.equal(fs.existsSync(path.join(root, ...NUDGE_FILE.split("/"))), false);
});

test("a tree git cannot read asks nothing and says why", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "idd-nudge-plain-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "idd"));
  const result = await stopNudge({
    workspace: root,
    input: { session_id: "s1" },
    entries: [entry("fix-a")],
    env: ENV,
    run: () => {
      throw Object.assign(new Error("Command failed"), { stderr: Buffer.from("fatal: not a git repository\n") });
    },
  });
  assert.deepEqual(result, { warning: "ospec did not ask to continue the open IDD changes: it could not read the work tree (fatal: not a git repository)" });
});

test("SessionStart gives the model each open change and the user one line", async (t) => {
  const root = repo(t);
  const result = await start(root, [entry("a-docs"), entry("b-fix")]);
  assert.deepEqual(result, {
    additionalContext: [
      "ospec: these IDD changes are open; their state is on disk and `ospec next --change <id>` gives each one's full next step:",
      "- `a-docs`: Next step of `a-docs`.",
      "- `b-fix`: Next step of `b-fix`.",
      "A change is done only after `ospec close`.",
    ].join("\n"),
    systemMessage: "ospec: open IDD changes: `a-docs`, `b-fix`.",
  });
  assert.ok(await start(root, [entry("a-docs")], { source: "compact" }), "a resumed or compacted session gets them again");
});

test("SessionStart records the base even without open changes, outside an IDD project does nothing", async (t) => {
  const root = repo(t);
  assert.equal(await start(root, []), null);
  assert.deepEqual(readRecord(root).sessions.map(({ id }) => id), ["s1"]);
  fs.writeFileSync(path.join(root, "a.txt"), "edit\n");
  assert.ok((await stop(root, [entry("fix-a")])).reason, "a change opened in the session asks at its first Stop");
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), "idd-nudge-noidd-"));
  t.after(() => fs.rmSync(plain, { recursive: true, force: true }));
  assert.equal(await start(plain, []), null);
  assert.equal(fs.existsSync(path.join(plain, ".ospec")), false);
});

test("on Cursor only the first prompt of a conversation gets the open changes", async (t) => {
  const root = repo(t);
  const prompt = (conversation) => sessionStartNudge({ workspace: root, input: { conversation_id: conversation }, entries: [entry("fix-a")], target: "cursor", env: ENV });
  assert.ok(await prompt("c1"));
  assert.equal(await prompt("c1"), null);
  assert.ok(await prompt("c2"));
});

test("the session is sessionId, session_id or Cursor's conversation_id", () => {
  assert.equal(sessionKey({ sessionId: " a ", session_id: "b" }), "a");
  assert.equal(sessionKey({ session_id: "b", conversation_id: "c" }), "b");
  assert.equal(sessionKey({ conversation_id: "c" }), "c");
  assert.equal(sessionKey({ session_id: "  " }), "unknown");
});
