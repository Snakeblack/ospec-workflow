"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { LATEST_RELATIVE_PATH, runStop } = require("./stop.js");

async function createWorkspace(t) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "stop-hook-"));

  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, "openspec", "changes"), {
    recursive: true,
  });

  return workspace;
}

async function createChange(workspace, name, state, artifacts = {}) {
  const changeDirectory = path.join(workspace, "openspec", "changes", name);

  await fs.mkdir(changeDirectory, { recursive: true });
  await fs.writeFile(path.join(changeDirectory, "state.yaml"), state);

  for (const [relativePath, content] of Object.entries(artifacts)) {
    const artifactPath = path.join(changeDirectory, relativePath);
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.writeFile(artifactPath, content);
  }

  return changeDirectory;
}

async function readLatest(workspace) {
  return fs.readFile(
    path.join(workspace, ...LATEST_RELATIVE_PATH.split("/")),
    "utf8",
  );
}

async function createMemberChange(workspace, memberDir, name, state) {
  const changeDirectory = path.join(
    workspace,
    memberDir,
    "openspec",
    "changes",
    name,
  );

  await fs.mkdir(changeDirectory, { recursive: true });
  await fs.writeFile(path.join(changeDirectory, "state.yaml"), state);
}

test("selects the federated backend and traces a member change", async (t) => {
  const workspace = await createWorkspace(t);

  await fs.writeFile(
    path.join(workspace, "openspec", "config.yaml"),
    "artifact_store:\n  backend: workspace-federated\n",
  );
  await fs.writeFile(
    path.join(workspace, "openspec", "workspace.yaml"),
    ["members:", "  - id: api", "    path: member-api"].join("\n"),
  );
  await createMemberChange(
    workspace,
    "member-api",
    "add-endpoint",
    "change:\n  status: applying\n",
  );

  const result = await runStop({ input: { cwd: workspace } });
  const latest = await readLatest(workspace);

  assert.equal(result.activeChange, "add-endpoint");
  assert.match(latest, /add-endpoint/);
});

test("writes a short trace for the active change", async (t) => {
  const workspace = await createWorkspace(t);
  const changeDirectory = await createChange(
    workspace,
    "add-export-csv",
    [
      "change:",
      "  name: add-export-csv",
      "  status: blocked",
      "  current_phase: apply",
      "next_recommended: sdd-apply",
      "",
    ].join("\n"),
    {
      "specs/export/spec.md": "spec remains unchanged\n",
      "design.md": "design remains unchanged\n",
      "tasks.md": "tasks remain unchanged\n",
    },
  );
  const summaryPath = path.join(
    workspace,
    ".ospec",
    "session",
    "add-export-csv",
    "session-summary.md",
  );

  await fs.mkdir(path.dirname(summaryPath), { recursive: true });
  await fs.writeFile(summaryPath, "# Session Summary\n");

  const protectedPaths = [
    path.join(changeDirectory, "state.yaml"),
    path.join(changeDirectory, "specs", "export", "spec.md"),
    path.join(changeDirectory, "design.md"),
    path.join(changeDirectory, "tasks.md"),
  ];
  const before = await Promise.all(
    protectedPaths.map((filePath) => fs.readFile(filePath, "utf8")),
  );
  const result = await runStop({
    input: {
      cwd: workspace,
      timestamp: "2026-06-10T10:40:00+02:00",
      sessionId: "session-123",
      stop_hook_active: false,
    },
  });
  const latest = await readLatest(workspace);

  assert.deepEqual(result, {
    status: "written",
    path: ".ospec/session/latest.md",
    activeChange: "add-export-csv",
  });
  assert.match(latest, /- Ended at: `2026-06-10T10:40:00\+02:00`/);
  assert.match(latest, /- Session: `session-123`/);
  assert.match(latest, /- Active change: `add-export-csv`/);
  assert.match(latest, /- Current phase: `apply`/);
  assert.match(latest, /- Change status: `blocked`/);
  assert.match(
    latest,
    /- Detailed summary: `\.ospec\/session\/add-export-csv\/session-summary\.md`/,
  );
  assert.match(
    latest,
    /## Next recommended action\nRun `sdd-apply add-export-csv`\./,
  );

  const after = await Promise.all(
    protectedPaths.map((filePath) => fs.readFile(filePath, "utf8")),
  );
  assert.deepEqual(after, before);
});

test("writes a trace even when no active change exists", async (t) => {
  const workspace = await createWorkspace(t);

  const result = await runStop({
    input: {
      cwd: workspace,
      session_id: "session-empty",
    },
    now: () => new Date("2026-06-10T08:40:00.000Z"),
  });
  const latest = await readLatest(workspace);

  assert.equal(result.activeChange, null);
  assert.match(latest, /- Active change: `None`/);
  assert.match(latest, /- Current phase: `None`/);
  assert.match(latest, /- Detailed summary: `None`/);
  assert.match(
    latest,
    /## Next recommended action\nStart a new session when more work is needed\./,
  );
});

// The trace changes on every turn: in a repository whose .gitignore does not
// mention .ospec/, `git add -A` used to track it and every later turn left the
// tree dirty (the idd-5 bench run).
test("the trace stays out of git in a repository that does not ignore .ospec/", async (t) => {
  const workspace = await createWorkspace(t);
  const git = (...args) => execFileSync("git", args, { cwd: workspace, encoding: "utf8" });
  git("init", "-q");

  await runStop({ input: { cwd: workspace, sessionId: "first" } });

  assert.equal(git("status", "--porcelain", "--untracked-files=all"), "");
  assert.equal(await fs.readFile(path.join(workspace, ".ospec", ".gitignore"), "utf8"), "*\n");
});

test("replaces the latest trace on each session end", async (t) => {
  const workspace = await createWorkspace(t);

  await runStop({
    input: {
      cwd: workspace,
      timestamp: "2026-06-10T10:40:00+02:00",
      sessionId: "first",
    },
  });
  await runStop({
    input: {
      cwd: workspace,
      timestamp: "2026-06-10T10:45:00+02:00",
      sessionId: "second",
    },
  });

  const latest = await readLatest(workspace);

  assert.doesNotMatch(latest, /`first`/);
  assert.match(latest, /- Session: `second`/);
  assert.match(latest, /- Ended at: `2026-06-10T10:45:00\+02:00`/);
});

test("ignores terminal changes when creating the latest trace", async (t) => {
  const workspace = await createWorkspace(t);

  await createChange(
    workspace,
    "already-done",
    "status: completed\ncurrent_phase: archive\n",
  );

  const result = await runStop({
    input: { cwd: workspace, sessionId: "session-done" },
  });

  assert.equal(result.activeChange, null);
});

// E1.49: the hook process counts each turn end in .ospec/turns, which the CLI
// reads to fence the gates.
function runStopProcess(input, cwd) {
  return execFileSync(process.execPath, [path.join(__dirname, "stop.js")], { input: JSON.stringify(input), encoding: "utf8", cwd });
}

test("each turn end adds one to the turn count, out of git", async (t) => {
  const workspace = await createWorkspace(t);
  const git = (...args) => execFileSync("git", args, { cwd: workspace, encoding: "utf8" });
  git("init", "-q");

  assert.equal(runStopProcess({ cwd: workspace, sessionId: "first" }), '{"continue":true}\n');
  runStopProcess({ cwd: workspace, sessionId: "second" });

  assert.equal(await fs.readFile(path.join(workspace, ".ospec", "turns"), "utf8"), "2\n");
  assert.equal(git("status", "--porcelain", "--untracked-files=all"), "");
});

test("an unreadable turn count starts again at one", async (t) => {
  const workspace = await createWorkspace(t);
  await fs.mkdir(path.join(workspace, ".ospec"), { recursive: true });
  await fs.writeFile(path.join(workspace, ".ospec", "turns"), "seven\n");

  runStopProcess({ cwd: workspace });

  assert.equal(await fs.readFile(path.join(workspace, ".ospec", "turns"), "utf8"), "1\n");
});

test("a turn count that cannot be written still writes the trace and says why", async (t) => {
  const workspace = await createWorkspace(t);
  await fs.mkdir(path.join(workspace, ".ospec", "turns"), { recursive: true });

  const output = JSON.parse(runStopProcess({ cwd: workspace, sessionId: "blocked" }));

  assert.equal(output.continue, true);
  assert.match(output.systemMessage, /^Stop hook could not count the turn end: /);
  assert.match(await readLatest(workspace), /blocked/);
});

// The count needs four small modules and the trace the rest of the hook's
// graph: on a loaded Windows host loading that graph first used up the
// launcher's deadline before the turn was counted. A trace module that cannot
// load still counts the turn and says why.
test("a trace module that cannot load still counts the turn end and says why", async (t) => {
  const workspace = await createWorkspace(t);
  const preload = path.join(workspace, "broken-module.js");
  await fs.writeFile(preload, [
    '"use strict";',
    'const Module = require("node:module");',
    'const path = require("node:path");',
    "const load = Module._load;",
    "Module._load = function (request, ...rest) {",
    "  if (path.basename(request) === process.env.OSPEC_TEST_BROKEN_MODULE) throw new Error(`cannot load ${request}`);",
    "  return load.call(this, request, ...rest);",
    "};",
    "",
  ].join("\n"));

  for (const broken of ["pre-compact.js", "artifact-store.js", "idd-session.js"]) {
    await fs.rm(path.join(workspace, ".ospec"), { recursive: true, force: true });
    const stdout = execFileSync(process.execPath, ["--require", preload, path.join(__dirname, "stop.js")], {
      input: JSON.stringify({ cwd: workspace }),
      encoding: "utf8",
      env: { ...process.env, OSPEC_TEST_BROKEN_MODULE: broken },
    });

    const output = JSON.parse(stdout);
    assert.equal(output.continue, true, broken);
    assert.match(output.systemMessage, new RegExp(`^Stop hook could not write the session trace: cannot load .*${broken.replace(".", "\\.")}$`), broken);
    assert.equal(await fs.readFile(path.join(workspace, ".ospec", "turns"), "utf8"), "1\n", broken);
  }
});

// A Stop the launcher's deadline stops while the trace loads gives its host no
// answer, so the turn ends: the count is written before the trace loads.
test("a Stop stopped by the deadline while the trace loads has already counted the turn end", async (t) => {
  const workspace = await createWorkspace(t);
  const preload = path.join(workspace, "slow-module.js");
  await fs.writeFile(preload, [
    '"use strict";',
    'const Module = require("node:module");',
    'const path = require("node:path");',
    "const load = Module._load;",
    "Module._load = function (request, ...rest) {",
    '  if (path.basename(request) === "pre-compact.js") Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000);',
    "  return load.call(this, request, ...rest);",
    "};",
    "",
  ].join("\n"));
  const result = spawnSync(process.execPath, ["--require", preload, path.join(__dirname, "stop.js")], {
    input: JSON.stringify({ cwd: workspace }),
    encoding: "utf8",
    timeout: 3000,
    killSignal: "SIGKILL",
  });
  assert.equal(result.signal, "SIGKILL", "the deadline stopped the hook");
  assert.equal(await fs.readFile(path.join(workspace, ".ospec", "turns"), "utf8"), "1\n");
});

// The CLI reads the count at the root of the project, so a session whose cwd
// is a subdirectory counts there: the first directory up holding .git, a
// directory or a worktree's file.
test("a turn end in a subdirectory of a repository is counted at its root", async (t) => {
  const workspace = await createWorkspace(t);
  for (const marker of ["directory", "file"]) {
    const repo = path.join(workspace, marker);
    const deep = path.join(repo, "src", "deep");
    await fs.mkdir(deep, { recursive: true });
    if (marker === "directory") await fs.mkdir(path.join(repo, ".git"));
    else await fs.writeFile(path.join(repo, ".git"), "gitdir: /elsewhere/.git/worktrees/x\n");

    runStopProcess({ cwd: deep, sessionId: marker });

    assert.equal(await fs.readFile(path.join(repo, ".ospec", "turns"), "utf8"), "1\n", marker);
    await assert.rejects(fs.access(path.join(deep, ".ospec", "turns")), marker);
  }
});

// Like the native hook, a cwd that is not a directory counts in the hook's
// own directory and creates nothing.
test("a turn end with a cwd that does not exist is counted in the hook's directory", async (t) => {
  const workspace = await createWorkspace(t);
  const ghost = path.join(workspace, "ghost", "deep");

  runStopProcess({ cwd: ghost }, workspace);

  assert.equal(await fs.readFile(path.join(workspace, ".ospec", "turns"), "utf8"), "1\n");
  await assert.rejects(fs.access(path.join(workspace, "ghost")));
});

// E1.51: a real IDD change, opened by the CLI in a git repository.
function iddProject(t) {
  const root = require("node:fs").mkdtempSync(path.join(os.tmpdir(), "stop-nudge-"));
  t.after(() => require("node:fs").rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["-C", root, "init", "-q", "-b", "main"]);
  const ospec = (...args) => execFileSync(process.execPath, [path.join(__dirname, "..", "ospec.js"), ...args, "--root", root], { encoding: "utf8" });
  ospec("record", "intent", "--change", "fix-a", "--kind", "bug", "--summary", "Fix a.", "--acceptance", "a works.", "--no-open-facts", "--basis", "a one-line fix");
  return { root, ospec };
}

test("Stop asks once to continue an open IDD change the session moved", async (t) => {
  const { root } = iddProject(t);
  execFileSync(process.execPath, [path.join(__dirname, "session-start.js")], { input: JSON.stringify({ cwd: root, session_id: "s1" }), encoding: "utf8" });
  assert.equal(runStopProcess({ cwd: root, session_id: "s1" }), '{"continue":true}\n', "nothing moved yet");
  await fs.writeFile(path.join(root, "a.js"), "module.exports = 1;\n");
  const asked = JSON.parse(runStopProcess({ cwd: root, session_id: "s1" }));
  assert.deepEqual(Object.keys(asked), ["decision", "reason"]);
  assert.equal(asked.decision, "block");
  assert.match(asked.reason, /- `fix-a`: Declare the plan: `ospec signals --change fix-a/);
  assert.equal(runStopProcess({ cwd: root, session_id: "s1" }), '{"continue":true}\n', "never twice for the same tree");
});

// A Stop that asks to continue ends no turn, so an answer recorded in that
// continuation is still fenced: the turn fence sees no turn end since the
// signal was recorded (E1.49).
test("a Stop that asks to continue counts no turn end, so a retraction in its continuation stays user-unverified", async (t) => {
  const { root, ospec } = iddProject(t);
  execFileSync(process.execPath, [path.join(__dirname, "session-start.js")], { input: JSON.stringify({ cwd: root, session_id: "s1" }), encoding: "utf8" });
  assert.equal(runStopProcess({ cwd: root, session_id: "s1" }), '{"continue":true}\n');
  assert.equal(await fs.readFile(path.join(root, ".ospec", "turns"), "utf8"), "1\n");
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(path.join(root, "src", "a.js"), "module.exports = (formula) => eval(formula);\n");
  ospec("check", "--change", "fix-a");
  const state = () => JSON.parse(require("node:fs").readFileSync(path.join(root, "idd", "fix-a", "state.yaml"), "utf8"));
  assert.equal(state().signals.find((signal) => signal.id === "security-boundary").recorded_turn, 1);

  assert.equal(JSON.parse(runStopProcess({ cwd: root, session_id: "s1" })).decision, "block");
  assert.equal(await fs.readFile(path.join(root, ".ospec", "turns"), "utf8"), "1\n", "the agent goes on: no turn ended");
  const retracted = JSON.parse(ospec("record", "retract", "--change", "fix-a", "--signal", "security-boundary", "--reason", "a constant", "--answer", "It is a constant.", "--source", "user", "--json"));
  assert.match(retracted.warnings[0], /^retract security-boundary recorded user-unverified: no turn ended between the signal's record and the answer;/);
  assert.equal(state().retracted.at(-1).answer_source, "user-unverified");

  // The Stop of the continuation lets the turn end, and counts it.
  assert.equal(runStopProcess({ cwd: root, session_id: "s1", stop_hook_active: true }), '{"continue":true}\n');
  assert.equal(await fs.readFile(path.join(root, ".ospec", "turns"), "utf8"), "2\n");
});

// A count that fails after its rename has landed, so a Stop whose count
// failed lets the turn end: it never asks to continue with the count one turn
// ahead.
test("a Stop whose count failed lets the turn end instead of asking to continue", async (t) => {
  const { root } = iddProject(t);
  execFileSync(process.execPath, [path.join(__dirname, "session-start.js")], { input: JSON.stringify({ cwd: root, session_id: "s1" }), encoding: "utf8" });
  await fs.writeFile(path.join(root, "a.js"), "module.exports = 1;\n");
  const preload = path.join(root, "landed-rename.js");
  await fs.writeFile(preload, [
    '"use strict";',
    'const fsp = require("node:fs/promises");',
    'const path = require("node:path");',
    "const rename = fsp.rename;",
    "fsp.rename = async function (from, to) {",
    "  const result = await rename.call(this, from, to);",
    '  if (path.basename(String(to)) === "turns") throw Object.assign(new Error("sync refused"), { code: "EIO" });',
    "  return result;",
    "};",
    "",
  ].join("\n"));
  const stdout = execFileSync(process.execPath, ["--require", preload, path.join(__dirname, "stop.js")], { input: JSON.stringify({ cwd: root, session_id: "s1" }), encoding: "utf8" });
  assert.deepEqual(JSON.parse(stdout), { continue: true, systemMessage: "Stop hook could not count the turn end: sync refused" });
  assert.equal(await fs.readFile(path.join(root, ".ospec", "turns"), "utf8"), "1\n", "the turn end landed and stays counted");
});

// A Stop that cannot take back the turn end it counted lets the turn end: it
// never asks to continue with the count one turn ahead.
test("a Stop that cannot take back its turn end lets the turn end instead of asking to continue", async (t) => {
  const { root } = iddProject(t);
  execFileSync(process.execPath, [path.join(__dirname, "session-start.js")], { input: JSON.stringify({ cwd: root, session_id: "s1" }), encoding: "utf8" });
  await fs.writeFile(path.join(root, "a.js"), "module.exports = 1;\n");
  const preload = path.join(root, "refused-rename.js");
  await fs.writeFile(preload, [
    '"use strict";',
    'const fsp = require("node:fs/promises");',
    'const path = require("node:path");',
    "const rename = fsp.rename;",
    "let turns = 0;",
    "fsp.rename = async function (from, to) {",
    '  if (path.basename(String(to)) === "turns" && ++turns === 2) throw Object.assign(new Error("rename refused"), { code: "EIO" });',
    "  return rename.call(this, from, to);",
    "};",
    "",
  ].join("\n"));
  const stdout = execFileSync(process.execPath, ["--require", preload, path.join(__dirname, "stop.js")], { input: JSON.stringify({ cwd: root, session_id: "s1" }), encoding: "utf8" });
  assert.deepEqual(JSON.parse(stdout), { continue: true, systemMessage: "Stop hook could not take back the turn end: rename refused" });
  assert.equal(await fs.readFile(path.join(root, ".ospec", "turns"), "utf8"), "1\n", "the turn end stays counted");
});

test("Stop asks nothing while a gate of an open IDD change waits for the user", async (t) => {
  const { root, ospec } = iddProject(t);
  ospec("record", "gate", "--change", "fix-a", "--gate", "irreversible-operation", "--open", "--reason", "drop the table");
  execFileSync(process.execPath, [path.join(__dirname, "session-start.js")], { input: JSON.stringify({ cwd: root, session_id: "s1" }), encoding: "utf8" });
  await fs.writeFile(path.join(root, "a.js"), "module.exports = 1;\n");
  assert.equal(runStopProcess({ cwd: root, session_id: "s1" }), '{"continue":true}\n');
});

test("the Stop answer carries the request, the failures and the warnings", () => {
  const { stopOutput } = require("./stop.js");
  assert.deepEqual(stopOutput(), { continue: true });
  assert.deepEqual(stopOutput({ nudge: { reason: "go on" } }), { decision: "block", reason: "go on" });
  assert.deepEqual(stopOutput({ nudge: { reason: "go on", warning: "slow tree" } }), { decision: "block", reason: "go on", systemMessage: "slow tree" });
  assert.deepEqual(stopOutput({ failure: "count failed", nudge: { warning: "no tree" } }), { continue: true, systemMessage: "count failed\nno tree" });
});
