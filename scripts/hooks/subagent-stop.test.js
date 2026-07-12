"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  EVENT_RELATIVE_PATH,
  estimateResultTokens,
  findResolutionInInput,
  findTextResolution,
  isDegradedResolution,
  persistPhaseCost,
  resolveDispatchStatus,
  runSubagentStop,
} = require("./subagent-stop.js");
const {
  PHASE_COST_FILE_NAME,
  appendPhaseCost,
} = require("../lib/ospec-state.js");

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

test("records fallback-registry resolution from a structured result", async (t) => {
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

test("extracts degraded or none resolution from textual and JSON results", () => {
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
  assert.equal(isDegradedResolution("fallback-registry"), true);
  assert.equal(isDegradedResolution("fallback-path"), true);
  assert.equal(isDegradedResolution("injected"), false);
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

// REQ-hooks-006: on the codex target, the host names the transcript field
// `agent_transcript_path` instead of `transcript_path`. SubagentStop must
// accept it as an alias/fallback source for the same §5.2 step-3 JSONL
// resolution logic, with no other behavior change.
test("resolves skill_resolution from input.agent_transcript_path (codex alias)", async (t) => {
  const workspace = await createWorkspace(t);
  const transcriptPath = path.join(workspace, "transcript.jsonl");

  await fs.writeFile(
    transcriptPath,
    [
      JSON.stringify({
        role: "assistant",
        result: {
          status: "success",
          skill_resolution: "fallback-path",
        },
      }),
      "",
    ].join("\n"),
  );

  const result = await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-verify",
      agent_transcript_path: transcriptPath,
    },
    now: () => new Date("2026-06-10T08:40:00.000Z"),
  });

  assert.equal(result.status, "warning-recorded");
  assert.deepEqual(await readEvents(workspace), [
    {
      timestamp: "2026-06-10T08:40:00.000Z",
      agent: "sdd-verify",
      skill_resolution: "fallback-path",
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

// --- Result Envelope extraction/validation/persistence (C5) -----------------

const STATE_WITH_EMPTY_DESIGN_SUMMARY = [
  "change: strict-result-envelope",
  "status: applying",
  "phases:",
  "  design:",
  "    status: done",
  '    artifact: "openspec/changes/strict-result-envelope/design.md"',
  '    summary: ""',
  "",
].join("\n");

const STATE_WITH_NON_EMPTY_DESIGN_SUMMARY = [
  "change: strict-result-envelope",
  "status: applying",
  "phases:",
  "  design:",
  "    status: done",
  '    artifact: "openspec/changes/strict-result-envelope/design.md"',
  '    summary: "Already written by the agent."',
  "",
].join("\n");

function buildFenceText(envelope) {
  return [
    "Some prose the agent wrote.",
    "",
    "```json:result-envelope",
    JSON.stringify(envelope),
    "```",
    "",
  ].join("\n");
}

async function createChangeWorkspace(t, stateContent) {
  const workspace = await createWorkspace(t);
  const changeDir = path.join(
    workspace,
    "openspec",
    "changes",
    "strict-result-envelope",
  );

  await fs.mkdir(changeDir, { recursive: true });
  const statePath = path.join(changeDir, "state.yaml");
  await fs.writeFile(statePath, stateContent, "utf8");

  return { workspace, statePath };
}

const VALID_ENVELOPE = {
  status: "success",
  executive_summary: "Diseñó el flujo de persistencia del envelope.",
  artifacts: ["openspec/changes/strict-result-envelope/design.md"],
  next_recommended: "sdd-tasks",
  risks: "None",
  skill_resolution: "injected",
  key_decisions: ["Fill-gap merge sobre last-writer-wins"],
};

test("valid envelope fence is persisted into the active change's state.yaml", async (t) => {
  const { workspace, statePath } = await createChangeWorkspace(
    t,
    STATE_WITH_EMPTY_DESIGN_SUMMARY,
  );

  await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-design",
      result: buildFenceText(VALID_ENVELOPE),
    },
  });

  const updatedState = await fs.readFile(statePath, "utf8");
  assert.match(
    updatedState,
    /summary: "Diseñó el flujo de persistencia del envelope\."/,
  );
  assert.match(
    updatedState,
    /key_decisions:\s*\n\s*- "Fill-gap merge sobre last-writer-wins"/,
  );
});

test("missing fence — no state.yaml write, stdout/return unaffected", async (t) => {
  const { workspace, statePath } = await createChangeWorkspace(
    t,
    STATE_WITH_EMPTY_DESIGN_SUMMARY,
  );

  const result = await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-design",
      result: "Just prose, no fence at all. skill_resolution: injected.",
    },
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "healthy-resolution",
  });
  const untouchedState = await fs.readFile(statePath, "utf8");
  assert.equal(untouchedState, STATE_WITH_EMPTY_DESIGN_SUMMARY);
});

test("malformed fence (invalid JSON) — validation fails safely, no write", async (t) => {
  const { workspace, statePath } = await createChangeWorkspace(
    t,
    STATE_WITH_EMPTY_DESIGN_SUMMARY,
  );

  await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-design",
      result: "```json:result-envelope\n{ not valid json\n```",
    },
  });

  const untouchedState = await fs.readFile(statePath, "utf8");
  assert.equal(untouchedState, STATE_WITH_EMPTY_DESIGN_SUMMARY);
});

test("fence missing a required field — validation fails safely, no write", async (t) => {
  const { workspace, statePath } = await createChangeWorkspace(
    t,
    STATE_WITH_EMPTY_DESIGN_SUMMARY,
  );
  const incomplete = { ...VALID_ENVELOPE };
  delete incomplete.status;

  await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-design",
      result: buildFenceText(incomplete),
    },
  });

  const untouchedState = await fs.readFile(statePath, "utf8");
  assert.equal(untouchedState, STATE_WITH_EMPTY_DESIGN_SUMMARY);
});

test("agent's own non-empty summary is not overwritten by the hook", async (t) => {
  const { workspace, statePath } = await createChangeWorkspace(
    t,
    STATE_WITH_NON_EMPTY_DESIGN_SUMMARY,
  );

  await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-design",
      result: buildFenceText(VALID_ENVELOPE),
    },
  });

  const untouchedState = await fs.readFile(statePath, "utf8");
  assert.equal(untouchedState, STATE_WITH_NON_EMPTY_DESIGN_SUMMARY);
});

test("no active change resolvable — envelope persistence is a safe no-op", async (t) => {
  const workspace = await createWorkspace(t);

  const result = await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-design",
      result: buildFenceText(VALID_ENVELOPE),
    },
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "healthy-resolution",
  });
  await assert.rejects(
    fs.stat(path.join(workspace, "openspec")),
    (error) => error.code === "ENOENT",
  );
});

test("persistResultEnvelope recovers an orphaned state.yaml.bak before its fresh re-read (CRITICAL remediation)", async (t) => {
  const workspace = await createWorkspace(t);
  const changeDir = path.join(
    workspace,
    "openspec",
    "changes",
    "strict-result-envelope",
  );
  await fs.mkdir(changeDir, { recursive: true });
  // Simulate a crash right after the rename-fallback's backup step: only the
  // .bak sibling survives, state.yaml itself is missing.
  const bakPath = path.join(changeDir, "state.yaml.bak");
  const statePath = path.join(changeDir, "state.yaml");
  await fs.writeFile(bakPath, STATE_WITH_EMPTY_DESIGN_SUMMARY, "utf8");

  await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-design",
      result: buildFenceText(VALID_ENVELOPE),
    },
  });

  const recovered = await fs.readFile(statePath, "utf8");
  assert.match(
    recovered,
    /summary: "Diseñó el flujo de persistencia del envelope\."/,
  );
  await assert.rejects(fs.stat(bakPath), { code: "ENOENT" });
});

test("non-sdd agent_type is ignored — state.yaml is left byte-for-byte intact", async (t) => {
  const { workspace, statePath } = await createChangeWorkspace(
    t,
    STATE_WITH_EMPTY_DESIGN_SUMMARY,
  );

  await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "Plan",
      result: buildFenceText(VALID_ENVELOPE),
    },
  });

  const untouchedState = await fs.readFile(statePath, "utf8");
  assert.equal(untouchedState, STATE_WITH_EMPTY_DESIGN_SUMMARY);
});

test("key_decisions with mixed non-string entries only persists the strings (parity with Go, which filters non-strings)", async (t) => {
  const { workspace, statePath } = await createChangeWorkspace(
    t,
    STATE_WITH_EMPTY_DESIGN_SUMMARY,
  );
  const envelopeWithMixedKeyDecisions = {
    ...VALID_ENVELOPE,
    key_decisions: ["A real decision", 42, { nested: true }, "Another real decision", null],
  };

  await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-design",
      result: buildFenceText(envelopeWithMixedKeyDecisions),
    },
  });

  const updatedState = await fs.readFile(statePath, "utf8");
  assert.match(updatedState, /- "A real decision"/);
  assert.match(updatedState, /- "Another real decision"/);
  assert.doesNotMatch(updatedState, /42/);
  assert.doesNotMatch(updatedState, /nested/);
});

test("findEnvelopeInValue resolves sibling fences last-sibling-wins, matching findStructuredResolution's semantics", async (t) => {
  const { workspace, statePath } = await createChangeWorkspace(
    t,
    STATE_WITH_EMPTY_DESIGN_SUMMARY,
  );
  const firstEnvelope = { ...VALID_ENVELOPE, executive_summary: "First sibling fence — must lose." };
  const secondEnvelope = { ...VALID_ENVELOPE, executive_summary: "Second sibling fence — must win." };

  await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-design",
      result: {
        first: buildFenceText(firstEnvelope),
        second: buildFenceText(secondEnvelope),
      },
    },
  });

  const updatedState = await fs.readFile(statePath, "utf8");
  assert.match(updatedState, /summary: "Second sibling fence — must win\."/);
  assert.doesNotMatch(updatedState, /First sibling fence/);
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

// ── appendPhaseCost (ospec-state.js) — Phase 1 store writer (REQ-hooks-001) ──

test("appendPhaseCost writes a JSONL line under .ospec/session/{change}/phase-costs.jsonl", async (t) => {
  const workspace = await createWorkspace(t);

  await appendPhaseCost({
    workspace,
    changeName: "add-x",
    record: {
      phase: "design",
      agent: "sdd-design",
      est_tokens: 42,
      status: "success",
      ts: "2026-07-04T15:00:00.000Z",
    },
  });

  const filePath = path.join(
    workspace,
    ".ospec",
    "session",
    "add-x",
    PHASE_COST_FILE_NAME,
  );
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.trim().split(/\r?\n/).map((line) => JSON.parse(line));

  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0], {
    phase: "design",
    agent: "sdd-design",
    est_tokens: 42,
    status: "success",
    ts: "2026-07-04T15:00:00.000Z",
    relaunch: false,
  });
});

test("appendPhaseCost appends a second record as a second JSONL line (triangulation)", async (t) => {
  const workspace = await createWorkspace(t);

  await appendPhaseCost({
    workspace,
    changeName: "add-x",
    record: { phase: "spec", agent: "sdd-spec", est_tokens: 10, status: "success", ts: "T1" },
  });
  await appendPhaseCost({
    workspace,
    changeName: "add-x",
    record: { phase: "apply", agent: "sdd-apply", est_tokens: 20, status: "unknown", ts: "T2" },
  });

  const filePath = path.join(
    workspace,
    ".ospec",
    "session",
    "add-x",
    PHASE_COST_FILE_NAME,
  );
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.trim().split(/\r?\n/).map((line) => JSON.parse(line));

  assert.equal(lines.length, 2);
  assert.equal(lines[0].phase, "spec");
  assert.equal(lines[1].phase, "apply");
});

// ── persistPhaseCost — Phase 2 (REQ-hooks-001) ───────────────────────────────

async function readPhaseCosts(workspace, changeName) {
  const filePath = path.join(
    workspace,
    ".ospec",
    "session",
    changeName,
    PHASE_COST_FILE_NAME,
  );
  const content = await fs.readFile(filePath, "utf8");

  return content
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
}

test("persistPhaseCost writes a record for an active change (phase, agent, est_tokens, status, ts)", async (t) => {
  const { workspace } = await createChangeWorkspace(
    t,
    STATE_WITH_EMPTY_DESIGN_SUMMARY,
  );

  await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-design",
      status: "success",
      result: "A prose result with no envelope fence.",
    },
  });

  const records = await readPhaseCosts(workspace, "strict-result-envelope");

  assert.equal(records.length, 1);
  assert.equal(records[0].phase, "design");
  assert.equal(records[0].agent, "sdd-design");
  assert.equal(records[0].status, "success");
  assert.equal(typeof records[0].estimated_output_tokens, "number");
  assert.ok(records[0].estimated_output_tokens > 0);
  assert.equal(typeof records[0].ts, "string");
});

test("persistPhaseCost prefers the valid envelope's status over top-level input.status (triangulation)", async (t) => {
  const { workspace } = await createChangeWorkspace(
    t,
    STATE_WITH_EMPTY_DESIGN_SUMMARY,
  );

  await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-apply",
      status: "top-level-status-must-lose",
      result: buildFenceText({ ...VALID_ENVELOPE, status: "partial" }),
    },
  });

  const records = await readPhaseCosts(workspace, "strict-result-envelope");

  assert.equal(records.length, 1);
  assert.equal(records[0].phase, "apply");
  assert.equal(records[0].status, "partial");
});

test("persistPhaseCost skips silently — no .ospec/session/ created — when no active change resolves", async (t) => {
  const workspace = await createWorkspace(t);

  await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-design",
      result: "Some result text.",
    },
  });

  await assert.rejects(
    fs.stat(path.join(workspace, ".ospec", "session")),
    (error) => error.code === "ENOENT",
  );
});

test("persistPhaseCost ignores a non-sdd-* agent", async (t) => {
  const { workspace } = await createChangeWorkspace(
    t,
    STATE_WITH_EMPTY_DESIGN_SUMMARY,
  );

  await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "Plan",
      result: "Some result text.",
    },
  });

  await assert.rejects(
    fs.stat(
      path.join(
        workspace,
        ".ospec",
        "session",
        "strict-result-envelope",
        PHASE_COST_FILE_NAME,
      ),
    ),
    (error) => error.code === "ENOENT",
  );
});

test("persistPhaseCost swallows estimation errors without affecting stdout/return value (fail-safe)", async (t) => {
  const { workspace } = await createChangeWorkspace(
    t,
    STATE_WITH_EMPTY_DESIGN_SUMMARY,
  );
  const circular = {};
  circular.self = circular;

  const result = await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-design",
      result: circular,
    },
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "resolution-unavailable",
  });
  await assert.rejects(
    fs.stat(
      path.join(
        workspace,
        ".ospec",
        "session",
        "strict-result-envelope",
        PHASE_COST_FILE_NAME,
      ),
    ),
    (error) => error.code === "ENOENT",
  );
});

test("estimateResultTokens computes round(utf8ByteLength/4) for a string payload", () => {
  assert.equal(estimateResultTokens("abcd"), 1);
  assert.equal(estimateResultTokens("abcdefgh"), 2);
});

test("estimateResultTokens JSON-serializes a non-string payload (triangulation)", () => {
  const objectTokens = estimateResultTokens({ a: 1 });
  assert.equal(typeof objectTokens, "number");
  assert.ok(objectTokens > 0);
});

test("resolveDispatchStatus resolves from a valid envelope's status field", async () => {
  const status = await resolveDispatchStatus({
    result: buildFenceText(VALID_ENVELOPE),
  });
  assert.equal(status, VALID_ENVELOPE.status);
});

test("resolveDispatchStatus falls back to top-level input.status, then 'unknown' (triangulation)", async () => {
  assert.equal(
    await resolveDispatchStatus({ status: "blocked", result: "no fence here" }),
    "blocked",
  );
  assert.equal(await resolveDispatchStatus({ result: "no fence, no status" }), "unknown");
});

// Task 1.1 RED: resolveModelTier tests
test("resolveModelTier resolves correct tiers and handles fallbacks/failures", async () => {
  const { resolveModelTier } = require("./lib/model-tier.js");
  const testYamlDir = path.resolve(__dirname, "../../"); // Has models.yaml in workspace root
  
  assert.equal(resolveModelTier("sdd-design", testYamlDir), "premium");
  assert.equal(resolveModelTier("sdd-apply", testYamlDir), "default");
  assert.equal(resolveModelTier("sdd-nonexistent", testYamlDir), "default"); // Fallback to _default
  assert.equal(resolveModelTier("sdd-design", "/invalid-path"), "unknown"); // Missing file -> unknown
});

// Task 1.1 RED: normalizeDispatchCostContext tests
test("normalizeDispatchCostContext handles alias precedence, integers, UTF-8 segments, status and duration", () => {
  const { normalizeDispatchCostContext } = require("./subagent-stop.js");
  
  // 1. Alias precedence for integer values
  const input1 = {
    telemetry: {
      estimated_prompt_tokens: 10,
      estimated_artifact_tokens: 20,
      estimated_tool_output_tokens: 30,
      estimated_output_tokens: 40,
      duration_ms: 1000
    },
    estimated_prompt_tokens: 100, // should be ignored as telemetry.estimated_prompt_tokens has priority
    usage: {
      prompt_tokens: 1000 // should be ignored
    }
  };
  const ctx1 = normalizeDispatchCostContext(input1);
  assert.equal(ctx1.prompt, 10);
  assert.equal(ctx1.artifact, 20);
  assert.equal(ctx1.tool_output, 30);
  assert.equal(ctx1.output, 40);
  assert.equal(ctx1.duration_ms, 1000);

  // 2. Fallbacks for integers and alias precedence
  const input2 = {
    estimated_prompt_tokens: 100,
    usage: {
      prompt_tokens: 1000
    },
    usage: {
      artifact_tokens: 200,
      tool_output_tokens: 300,
      output_tokens: 400
    },
    duration_ms: 2000
  };
  const ctx2 = normalizeDispatchCostContext(input2);
  assert.equal(ctx2.prompt, 100);
  assert.equal(ctx2.artifact, 200);
  assert.equal(ctx2.tool_output, 300);
  assert.equal(ctx2.output, 400);
  assert.equal(ctx2.duration_ms, 2000);

  // 3. UTF-8 segment heuristics when integers are missing/invalid
  const input3 = {
    telemetry: {
      prompt: "café", // 5 UTF-8 bytes -> ceil(5/4) = 2
      artifact: "abcd", // 4 bytes -> ceil(4/4) = 1
      tool_output: "", // 0 bytes -> 0
      output: "a" // 1 byte -> 1
    },
    telemetry_estimated_prompt_tokens: -5, // invalid integer
  };
  const ctx3 = normalizeDispatchCostContext(input3);
  assert.equal(ctx3.prompt, 2);
  assert.equal(ctx3.artifact, 1);
  assert.equal(ctx3.tool_output, 0);
  assert.equal(ctx3.output, 1);

  // 4. Existing RESULT_FIELDS fallback for output segment
  const input4 = {
    response: "hello", // RESULT_FIELDS has "response" before "message", etc. 5 bytes -> 2
    message: "longer message"
  };
  const ctx4 = normalizeDispatchCostContext(input4);
  assert.equal(ctx4.output, 2);

  // 5. Invalid segments produce 0
  const input5 = {
    prompt: 12345, // not a string
    telemetry: {
      artifact: { some: "object" } // not a string
    }
  };
  const ctx5 = normalizeDispatchCostContext(input5);
  assert.equal(ctx5.prompt, 0);
  assert.equal(ctx5.artifact, 0);
});

test("persistPhaseCost writes a complete normalized O1 record with correct fields", async (t) => {
  const { workspace } = await createChangeWorkspace(
    t,
    STATE_WITH_EMPTY_DESIGN_SUMMARY,
  );

  const modelsContent = `
agents:
  sdd-design: premium
  sdd-apply: default
  _default: default
tiers:
  premium:
    claude: opus
  default:
    claude: sonnet
`;
  await fs.writeFile(path.join(workspace, "models.yaml"), modelsContent);

  await runSubagentStop({
    input: {
      cwd: workspace,
      agent_type: "sdd-design",
      status: "success",
      estimated_prompt_tokens: 12,
      telemetry: {
        estimated_artifact_tokens: 34,
        estimated_tool_output_tokens: 56,
        output: "hello world"
      },
      duration_ms: 500,
    },
  });

  const costFile = path.join(
    workspace,
    ".ospec",
    "session",
    "strict-result-envelope",
    PHASE_COST_FILE_NAME,
  );
  const data = await fs.readFile(costFile, "utf8");
  const record = JSON.parse(data.trim());

  assert.equal(record.phase, "design");
  assert.equal(record.agent, "sdd-design");
  assert.equal(record.estimated_prompt_tokens, 12);
  assert.equal(record.estimated_artifact_tokens, 34);
  assert.equal(record.estimated_tool_output_tokens, 56);
  assert.equal(record.estimated_output_tokens, 3);
  assert.equal(record.duration_ms, 500);
  assert.equal(record.model_tier, "premium");
  assert.equal(record.status, "success");
  assert.equal(record.relaunch, false);
  assert.equal(typeof record.ts, "string");
  assert.ok(record.ts.endsWith("Z")); // ISO 8601 UTC
});


