"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  EVENT_RELATIVE_PATH,
  findResolutionInInput,
  findTextResolution,
  isDegradedResolution,
  runSubagentStop,
} = require("./subagent-stop.js");

async function createWorkspace(t) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "subagent-stop-"));

  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  return workspace;
}

async function readEvents(workspace) {
  const content = await fs.readFile(
    path.join(workspace, ...EVENT_RELATIVE_PATH.split("/")),
    "utf8",
  );

  return content
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
}

test("records fallback resolution from a structured result", async (t) => {
  const workspace = await createWorkspace(t);

  const result = await runSubagentStop({
    input: {
      cwd: workspace,
      timestamp: "2026-06-10T10:35:00+02:00",
      agent_id: "subagent-456",
      agent_type: "sdd-apply",
      result: {
        status: "success",
        skill_resolution: "fallback-registry",
      },
    },
  });

  assert.equal(result.status, "warning-recorded");
  assert.deepEqual(await readEvents(workspace), [
    {
      timestamp: "2026-06-10T10:35:00+02:00",
      agent: "sdd-apply",
      skill_resolution: "fallback-registry",
      action: "refresh-registry-next-delegation",
    },
  ]);
});

test("extracts fallback or none from textual and JSON results", () => {
  assert.equal(
    findTextResolution(
      'Completed work.\n{"status":"partial","skill_resolution":"fallback-path"}',
    ),
    "fallback-path",
  );
  assert.equal(
    findResolutionInInput({
      output: "status: blocked\nskill_resolution: none\n",
    }),
    "none",
  );
  assert.equal(isDegradedResolution("fallback-future-source"), true);
});

test("uses the latest structured resolution from a transcript", async (t) => {
  const workspace = await createWorkspace(t);
  const transcriptPath = path.join(workspace, "transcript.jsonl");

  await fs.writeFile(
    transcriptPath,
    [
      JSON.stringify({
        role: "system",
        content: "Agents must report skill_resolution: injected.",
      }),
      JSON.stringify({
        role: "assistant",
        result: {
          status: "success",
          skill_resolution: "fallback-registry",
        },
      }),
      "",
    ].join("\n"),
  );

  const result = await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-verify",
      transcript_path: transcriptPath,
    },
    now: () => new Date("2026-06-10T08:35:00.000Z"),
  });

  assert.equal(result.status, "warning-recorded");
  assert.deepEqual(await readEvents(workspace), [
    {
      timestamp: "2026-06-10T08:35:00.000Z",
      agent: "sdd-verify",
      skill_resolution: "fallback-registry",
      action: "refresh-registry-next-delegation",
    },
  ]);
});

test("does not write events for injected resolution", async (t) => {
  const workspace = await createWorkspace(t);

  const result = await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-design",
      result: '{"skill_resolution":"injected"}',
    },
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "healthy-resolution",
  });
  await assert.rejects(
    fs.stat(path.join(workspace, ".ospec")),
    (error) => error.code === "ENOENT",
  );
});

test("does not invent a warning when resolution is unavailable", async (t) => {
  const workspace = await createWorkspace(t);

  const result = await runSubagentStop({
    input: {
      cwd: workspace,
      agent_id: "subagent-123",
      agent_type: "Plan",
    },
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "resolution-unavailable",
  });
});

test("appends one valid JSON object per degraded event", async (t) => {
  const workspace = await createWorkspace(t);

  await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-apply",
      result: { skill_resolution: "none" },
    },
    now: () => new Date("2026-06-10T08:35:00.000Z"),
  });
  await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-spec",
      result: { skill_resolution: "fallback-path" },
    },
    now: () => new Date("2026-06-10T08:36:00.000Z"),
  });

  const events = await readEvents(workspace);

  assert.equal(events.length, 2);
  assert.equal(events[0].skill_resolution, "none");
  assert.equal(events[1].skill_resolution, "fallback-path");
});
