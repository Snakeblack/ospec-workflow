"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runPreCompact } = require("./pre-compact.js");

async function createWorkspace(t) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "pre-compact-"));

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

test("writes the minimal session summary for the active change", async (t) => {
  const workspace = await createWorkspace(t);
  const changeDirectory = await createChange(
    workspace,
    "add-export-csv",
    [
      "change:",
      "  name: add-export-csv",
      "  status: active",
      "  current_phase: apply",
      "approvals:",
      "  - id: delivery-strategy-001",
      "    gate: delivery-strategy",
      "    decision: ask-on-risk",
      "    source: vscode/askQuestions",
      "    applies_to:",
      "      - sdd-apply",
      "",
    ].join("\n"),
    {
      "proposal.md": "proposal remains unchanged\n",
      "design.md": "design remains unchanged\n",
      "tasks.md": "tasks remain unchanged\n",
    },
  );
  const protectedFiles = ["proposal.md", "design.md", "tasks.md"];
  const before = await Promise.all(
    protectedFiles.map((file) =>
      fs.readFile(path.join(changeDirectory, file), "utf8"),
    ),
  );

  const result = await runPreCompact({ input: { cwd: workspace } });
  const summary = await fs.readFile(
    path.join(
      workspace,
      ".ospec",
      "session",
      "add-export-csv",
      "session-summary.md",
    ),
    "utf8",
  );

  assert.deepEqual(result, {
    status: "written",
    change: "add-export-csv",
    path: ".ospec/session/add-export-csv/session-summary.md",
  });
  assert.match(summary, /## Active change\n`add-export-csv`/);
  assert.match(summary, /## Current phase\n`apply`/);
  assert.match(
    summary,
    /## Last completed artifact\n`openspec\/changes\/add-export-csv\/tasks\.md`/,
  );
  assert.match(summary, /## Blocking decisions\n- None/);
  assert.match(summary, /## Approvals\n- delivery-strategy: ask-on-risk/);
  assert.doesNotMatch(summary, /- sdd-apply/);
  assert.match(
    summary,
    /## Next recommended action\nRun `sdd-continue add-export-csv`\./,
  );

  const after = await Promise.all(
    protectedFiles.map((file) =>
      fs.readFile(path.join(changeDirectory, file), "utf8"),
    ),
  );
  assert.deepEqual(after, before);
});

test("records blockers, approvals, explicit artifact, and next action", async (t) => {
  const workspace = await createWorkspace(t);

  await createChange(
    workspace,
    "secure-release",
    [
      "change:",
      "  name: secure-release",
      "  current_phase: verify",
      "blocking_questions:",
      "  - id: deployment-target",
      "    question: Choose the deployment target",
      "approvals:",
      "  - gate: review-workload",
      "    decision: chained-prs",
      "runtime:",
      "  last_completed_artifact: openspec/changes/secure-release/apply-progress.md",
      "next_recommended: sdd-verify",
      "",
    ].join("\n"),
  );

  await runPreCompact({ input: { cwd: workspace } });
  const summary = await fs.readFile(
    path.join(
      workspace,
      ".ospec",
      "session",
      "secure-release",
      "session-summary.md",
    ),
    "utf8",
  );

  assert.match(
    summary,
    /## Blocking decisions\n- Choose the deployment target/,
  );
  assert.match(summary, /## Approvals\n- review-workload: chained-prs/);
  assert.match(
    summary,
    /`openspec\/changes\/secure-release\/apply-progress\.md`/,
  );
  assert.match(
    summary,
    /## Next recommended action\nRun `sdd-verify secure-release`\./,
  );
});

test("selects the most recently updated non-terminal change", async (t) => {
  const workspace = await createWorkspace(t);
  const oldChange = await createChange(
    workspace,
    "older-active",
    "status: active\ncurrent_phase: proposal\n",
  );
  const completedChange = await createChange(
    workspace,
    "completed",
    "status: completed\ncurrent_phase: archive\n",
  );
  const newChange = await createChange(
    workspace,
    "newer-active",
    "status: blocked\ncurrent_phase: design\n",
  );
  const oldTime = new Date("2026-06-10T08:00:00.000Z");
  const newTime = new Date("2026-06-10T10:00:00.000Z");

  await fs.utimes(path.join(oldChange, "state.yaml"), oldTime, oldTime);
  await fs.utimes(
    path.join(completedChange, "state.yaml"),
    new Date("2026-06-10T11:00:00.000Z"),
    new Date("2026-06-10T11:00:00.000Z"),
  );
  await fs.utimes(path.join(newChange, "state.yaml"), newTime, newTime);

  const result = await runPreCompact({ input: { cwd: workspace } });

  assert.equal(result.change, "newer-active");
  await assert.rejects(
    fs.stat(
      path.join(
        workspace,
        ".ospec",
        "session",
        "completed",
        "session-summary.md",
      ),
    ),
    (error) => error.code === "ENOENT",
  );
});

test("does not rewrite an unchanged summary", async (t) => {
  const workspace = await createWorkspace(t);

  await createChange(
    workspace,
    "stable",
    "change:\n  name: stable\n  current_phase: tasks\n",
    { "design.md": "design\n" },
  );

  const first = await runPreCompact({ input: { cwd: workspace } });
  const second = await runPreCompact({ input: { cwd: workspace } });

  assert.equal(first.status, "written");
  assert.equal(second.status, "fresh");
});

test("skips cleanly when no active change exists", async (t) => {
  const workspace = await createWorkspace(t);

  const result = await runPreCompact({ input: { cwd: workspace } });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "no-active-change",
  });
  await assert.rejects(
    fs.stat(path.join(workspace, ".ospec")),
    (error) => error.code === "ENOENT",
  );
});
