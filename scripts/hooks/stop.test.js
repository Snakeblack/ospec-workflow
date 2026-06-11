"use strict";

const assert = require("node:assert/strict");
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
