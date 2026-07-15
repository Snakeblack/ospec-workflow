"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  loadBenchmarkObservation,
  readPhaseCosts,
  renderBaseline,
  parseCodexTranscript,
  verifyBenchmarkProvenance,
  verifyPhaseCostBindings,
  verifyRowAttestation,
  buildRunBenchmarkRow,
} = require("./benchmark.js");

function temp(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-benchmark-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("loadBenchmarkObservation validates non-negative integer counters", (t) => {
  const root = temp(t);
  const file = path.join(root, "benchmark.json");
  assert.throws(() => loadBenchmarkObservation(file), /missing/i);
  fs.writeFileSync(file, "{bad");
  assert.throws(() => loadBenchmarkObservation(file), /valid JSON/i);
  fs.writeFileSync(file, JSON.stringify({ questions_asked: -1, defects: {} }));
  assert.throws(() => loadBenchmarkObservation(file), /questions_asked/);
});

test("loadBenchmarkObservation preserves separate verify and 4R totals", (t) => {
  const root = temp(t);
  const file = path.join(root, "benchmark.json");
  fs.writeFileSync(file, JSON.stringify({
    questions_asked: 2,
    provenance: {
      driver: "codex-exec",
      cli_version: "codex-cli 0.144.1",
      session_id: "019f-live-session",
      transcript_sha256: "a".repeat(64),
      completed_at: "2026-07-12T18:00:00.000Z",
    },
    defects: {
      verify: { critical: 1, warning: 2, suggestion: 3 },
      four_r: { blocker: 1, critical: 2, warning: 3, suggestion: 4 },
    },
  }));
  const result = loadBenchmarkObservation(file);
  assert.equal(result.verify_defects, 6);
  assert.equal(result.four_r_defects, 10);
  assert.equal(result.defects_total, 16);
  assert.equal(result.provenance.session_id, "019f-live-session");
});

test("loadBenchmarkObservation rejects unverifiable live provenance", (t) => {
  const root = temp(t);
  const file = path.join(root, "benchmark.json");
  const base = {
    questions_asked: 0,
    defects: {
      verify: { critical: 0, warning: 0, suggestion: 0 },
      four_r: { blocker: 0, critical: 0, warning: 0, suggestion: 0 },
    },
  };
  fs.writeFileSync(file, JSON.stringify(base));
  assert.throws(() => loadBenchmarkObservation(file), /provenance/i);
  fs.writeFileSync(file, JSON.stringify({ ...base, provenance: { driver: "simulation" } }));
  assert.throws(() => loadBenchmarkObservation(file), /codex-exec/i);
});

test("readPhaseCosts aggregates canonical O1 evidence", (t) => {
  const root = temp(t);
  const file = path.join(root, "phase-costs.jsonl");
  assert.throws(() => readPhaseCosts(file), /missing/i);
  fs.writeFileSync(file, [
    JSON.stringify({ phase: "spec", agent: "sdd-spec", estimated_prompt_tokens: 10, estimated_artifact_tokens: 20, estimated_tool_output_tokens: 30, estimated_output_tokens: 40, duration_ms: 50, model_tier: "standard", status: "success", relaunch: false, ts: "2026-07-12T18:00:00.000Z" }),
    JSON.stringify({ phase: "apply", agent: "sdd-apply", estimated_prompt_tokens: 1, estimated_artifact_tokens: 2, estimated_tool_output_tokens: 3, estimated_output_tokens: 4, duration_ms: 5, model_tier: "premium", status: "blocked", relaunch: true, ts: "2026-07-12T18:01:00.000Z" }),
  ].join("\n") + "\n");
  const result = readPhaseCosts(file);
  assert.equal(result.invocations, 2);
  assert.equal(result.estimated_total_tokens, 110);
  assert.equal(result.duration_ms, 55);
  assert.equal(result.relaunches, 1);
  assert.deepEqual(result.model_tiers, ["premium", "standard"]);
  assert.deepEqual(result.statuses, ["blocked", "success"]);
});

test("readPhaseCosts rejects plausible but non-canonical synthetic rows", (t) => {
  const root = temp(t);
  const file = path.join(root, "phase-costs.jsonl");
  fs.writeFileSync(file, `${JSON.stringify({
    phase: "verify",
    estimated_prompt_tokens: 1,
    estimated_artifact_tokens: 1,
    estimated_tool_output_tokens: 1,
    estimated_output_tokens: 1,
    duration_ms: 1,
    model_tier: "tier-3",
    status: "success",
    relaunch: false,
  })}\n`);
  assert.throws(() => readPhaseCosts(file), /invalid O1 line/i);
});

test("verifyBenchmarkProvenance binds declared provenance to transcript bytes and trusted CLI", (t) => {
  const root = temp(t);
  const transcriptPath = path.join(root, "codex-events.jsonl");
  const raw = [
    JSON.stringify({ type: "thread.started", thread_id: "019f-real-session" }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 123, output_tokens: 45 } }),
  ].join("\n") + "\n";
  fs.writeFileSync(transcriptPath, raw);
  const provenance = {
    driver: "codex-exec",
    cli_version: "codex-cli 0.144.1",
    session_id: "019f-real-session",
    transcript_sha256: crypto.createHash("sha256").update(raw).digest("hex"),
    completed_at: "2026-07-12T18:00:00.000Z",
  };

  const verified = verifyBenchmarkProvenance({ provenance, transcriptPath, trustedCliVersion: "codex-cli 0.144.1" });
  assert.equal(verified.session_id, "019f-real-session");
  assert.equal(verified.usage.output_tokens, 45);

  fs.writeFileSync(transcriptPath, `${JSON.stringify({ type: "thread.started", thread_id: "019f-real-session" })}\n${JSON.stringify({ type: "item.completed" })}\n${JSON.stringify({ type: "turn.completed", usage: { input_tokens: 123, output_tokens: 45 } })}\n`);
  assert.throws(
    () => verifyBenchmarkProvenance({ provenance, transcriptPath, trustedCliVersion: "codex-cli 0.144.1" }),
    /SHA-256 mismatch/i,
  );
  assert.throws(
    () => verifyBenchmarkProvenance({ provenance: { ...provenance, transcript_sha256: "b".repeat(64) }, transcriptPath, trustedCliVersion: "codex-cli 0.144.1" }),
    /SHA-256 mismatch/i,
  );
});

test("parseCodexTranscript and provenance verification reject replay identity gaps", (t) => {
  const root = temp(t);
  const transcriptPath = path.join(root, "codex-events.jsonl");
  const validTurn = JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 2 } });

  assert.throws(() => parseCodexTranscript(`${validTurn}\n`), /thread\.started/i);
  assert.throws(
    () => parseCodexTranscript(`${JSON.stringify({ type: "thread.started", thread_id: "session" })}\n`),
    /turn\.completed.*usage/i,
  );
  assert.throws(
    () => parseCodexTranscript(`${JSON.stringify({ type: "thread.started", thread_id: "session" })}\nnot-json\n${validTurn}\n`),
    /valid JSONL/i,
  );

  const raw = `${JSON.stringify({ type: "thread.started", thread_id: "actual-session" })}\n${validTurn}\n`;
  fs.writeFileSync(transcriptPath, raw);
  const base = {
    driver: "codex-exec",
    cli_version: "codex-cli 0.144.1",
    session_id: "declared-session",
    transcript_sha256: crypto.createHash("sha256").update(raw).digest("hex"),
    completed_at: "2026-07-12T18:00:00.000Z",
  };
  assert.throws(
    () => verifyBenchmarkProvenance({ provenance: base, transcriptPath, trustedCliVersion: "codex-cli 0.144.1" }),
    /session_id mismatch/i,
  );
  assert.throws(
    () => verifyBenchmarkProvenance({ provenance: { ...base, session_id: "actual-session" }, transcriptPath, trustedCliVersion: "codex-cli 9.9.9" }),
    /cli_version mismatch/i,
  );
});

test("parseCodexTranscript rejects duplicate starts, mixed sessions and ambiguous terminal events", () => {
  const started = (id) => JSON.stringify({ type: "thread.started", thread_id: id });
  const completed = JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } });
  assert.throws(() => parseCodexTranscript(`${started("one")}\n${started("one")}\n${completed}\n`), /exactly one thread\.started/i);
  assert.throws(() => parseCodexTranscript(`${started("one")}\n${JSON.stringify({ type: "item.completed", thread_id: "two" })}\n${completed}\n`), /mixed session/i);
  assert.throws(() => parseCodexTranscript(`${started("one")}\n${completed}\n${completed}\n`), /exactly one turn\.completed/i);
  assert.throws(() => parseCodexTranscript(`${started("one")}\n${completed}\n${JSON.stringify({ type: "item.completed" })}\n`), /terminal/i);
});

test("run benchmark rows use terminal usage without phase attribution or invented dispatch data", () => {
  const row = buildRunBenchmarkRow({
    profile: "docs-one-file",
    route: "lite",
    transcript: { usage: { input_tokens: 120, output_tokens: 30 } },
    durationMs: 987,
    observation: { questions_asked: 0, verify_defects: 0, four_r_defects: 0, defects_total: 0 },
    nativeO1: null,
  });
  assert.deepEqual(row, {
    profile: "docs-one-file", route: "lite", measurement_scope: "run",
    phase_attribution: "none", token_source: "terminal-turn-usage",
    input_tokens: 120, output_tokens: 30, total_tokens: 150, duration_ms: 987,
    subagent_coverage: "unknown", invocations: null, relaunches: null,
    model_tiers: [], native_o1: { present: false }, questions_asked: 0,
    verify_defects: 0, four_r_defects: 0, defects_total: 0,
  });
  const markdown = renderBaseline([row], { expectedProfiles: ["docs-one-file"], generatedAt: "2026-07-13T00:00:00.000Z", gitRevision: "abc" });
  assert.match(markdown, /Experimental run-level benchmark/i);
  assert.match(markdown, /terminal `turn\.completed\.usage`/i);
  assert.doesNotMatch(markdown, /Estimated tokens|heuristic estimates|Invocations|Relaunches/i);
});

test("verifyPhaseCostBindings rejects prefix-only rows without full persisted-row attestation", () => {
  const prefix = `${JSON.stringify({ type: "thread.started", thread_id: "session-live" })}\n`;
  const transcriptBytes = Buffer.from(`${prefix}${JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } })}\n`);
  const trusted = { session_id: "session-live", transcriptBytes };
  const row = {
    phase: "apply",
    agent: "sdd-apply",
    estimated_prompt_tokens: 1,
    estimated_artifact_tokens: 2,
    estimated_tool_output_tokens: 3,
    estimated_output_tokens: 4,
    duration_ms: 5,
    model_tier: "standard",
    status: "success",
    relaunch: false,
    ts: "2026-07-12T18:00:00.000Z",
    host_binding: {
      session_id: "session-live",
      transcript_source: "codex-events",
      binding_scope: "prefix",
      transcript_prefix_bytes: Buffer.byteLength(prefix),
      transcript_prefix_sha256: crypto.createHash("sha256").update(prefix).digest("hex"),
    },
  };

  assert.throws(() => verifyPhaseCostBindings([row], trusted), /row attestation mismatch/i);
});

test("benchmark observation cannot post-declare an O1 host binding", (t) => {
  const root = temp(t);
  const file = path.join(root, "phase-costs.jsonl");
  fs.writeFileSync(file, `${JSON.stringify({
    phase: "verify", agent: "sdd-verify",
    estimated_prompt_tokens: 1, estimated_artifact_tokens: 1,
    estimated_tool_output_tokens: 1, estimated_output_tokens: 1,
    duration_ms: 1, model_tier: "standard", status: "success",
    relaunch: false, ts: "2026-07-12T18:00:00.000Z",
  })}\n`);
  const declaredOnlyInObservation = {
    session_id: "session-live",
    transcriptBytes: Buffer.from([
      JSON.stringify({ type: "thread.started", thread_id: "session-live" }),
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } }),
    ].join("\n") + "\n"),
    hostRunId: "run-live",
  };
  assert.throws(() => readPhaseCosts(file, { trustedBinding: declaredOnlyInObservation }), /row attestation mismatch/i);
});

test("readPhaseCosts fails closed on malformed/noncanonical lines, missing final newline and phase drift", (t) => {
  const root = temp(t);
  const file = path.join(root, "phase-costs.jsonl");
  const row = { phase: "apply", agent: "sdd-apply", estimated_prompt_tokens: 1, estimated_artifact_tokens: 1, estimated_tool_output_tokens: 1, estimated_output_tokens: 1, duration_ms: 1, model_tier: "standard", status: "success", relaunch: false, ts: "2026-07-13T00:00:00.000Z" };
  fs.writeFileSync(file, `${JSON.stringify(row)}\nnot-json\n`);
  assert.throws(() => readPhaseCosts(file), /invalid O1 line 2/i);
  fs.writeFileSync(file, JSON.stringify(row));
  assert.throws(() => readPhaseCosts(file), /final newline/i);
  fs.writeFileSync(file, `${JSON.stringify(row)}\n`);
  assert.throws(() => readPhaseCosts(file, { expectedPhases: ["apply", "verify"] }), /missing phase.*verify/i);
  assert.throws(() => readPhaseCosts(file, { expectedPhases: ["verify"] }), /unexpected phase.*apply/i);
});

test("readPhaseCosts accepts redacted cost_observability metadata and verifies its attestation", (t) => {
  const root = temp(t);
  const file = path.join(root, "phase-costs.jsonl");
  const row = {
    phase: "apply",
    agent: "sdd-apply",
    estimated_prompt_tokens: 12,
    estimated_artifact_tokens: 0,
    estimated_tool_output_tokens: 0,
    estimated_output_tokens: 3,
    duration_ms: 0,
    model_tier: "standard",
    status: "success",
    relaunch: false,
    row_index: 0,
    ts: "2026-07-15T00:00:00.000Z",
    host_binding: { status: "unsupported-host-binding" },
    cost_observability: {
      reason: "codex-token-count-observed",
      field_presence: { prompt: true, artifact: false, tool_output: false, output: true, duration_ms: false },
      token_count_presence: { input_tokens: true, cached_input_tokens: true, output_tokens: true, reasoning_output_tokens: true, total_tokens: true },
      host_binding_status: "unsupported-host-binding",
    },
  };
  row.row_attestation_sha256 = crypto.createHash("sha256").update(JSON.stringify([
    "o1-row-v3", row.phase, row.agent, row.estimated_prompt_tokens,
    row.estimated_artifact_tokens, row.estimated_tool_output_tokens,
    row.estimated_output_tokens, row.duration_ms, row.model_tier, row.status,
    row.relaunch, row.row_index, row.ts, row.estimate_source, row.emitter,
    row.phase_evidence, row.artifact_evidence_sha256, row.benchmark_evidence_sha256,
    row.host_binding.status, row.host_binding.session_id, row.host_binding.transcript_source,
    row.host_binding.binding_scope, row.host_binding.transcript_prefix_bytes,
    row.host_binding.transcript_prefix_sha256, row.host_binding.transcript_bytes,
    row.host_binding.transcript_sha256, row.host_binding.host_run_id,
    row.host_binding.authentication, row.cost_observability.reason,
    row.cost_observability.field_presence.prompt, row.cost_observability.field_presence.artifact,
    row.cost_observability.field_presence.tool_output, row.cost_observability.field_presence.output,
    row.cost_observability.field_presence.duration_ms,
    row.cost_observability.token_count_presence.input_tokens,
    row.cost_observability.token_count_presence.cached_input_tokens,
    row.cost_observability.token_count_presence.output_tokens,
    row.cost_observability.token_count_presence.reasoning_output_tokens,
    row.cost_observability.token_count_presence.total_tokens,
    row.cost_observability.host_binding_status,
  ])).digest("hex");
  fs.writeFileSync(file, `${JSON.stringify(row)}\n`);

  const result = readPhaseCosts(file);
  assert.equal(result.rows[0].cost_observability.reason, "codex-token-count-observed");
  assert.equal(result.estimated_total_tokens, 15);
});

test("observable binding is accepted only with exhaustive ordered row attestation and authentication none", () => {
  const prefix = `${JSON.stringify({ type: "thread.started", thread_id: "session" })}\n`;
  const transcriptBytes = Buffer.from(`${prefix}${JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } })}\n`);
  const row = { phase: "apply", agent: "sdd-apply", estimated_prompt_tokens: 1, estimated_artifact_tokens: 2, estimated_tool_output_tokens: 3, estimated_output_tokens: 4, duration_ms: 5, model_tier: "standard", status: "success", relaunch: false, row_index: 0, ts: "2026-07-13T00:00:00.000Z", host_binding: { status: "supported-observable-binding", session_id: "session", transcript_source: "codex-events", binding_scope: "prefix", transcript_prefix_bytes: Buffer.byteLength(prefix), transcript_prefix_sha256: crypto.createHash("sha256").update(prefix).digest("hex"), host_run_id: "run", authentication: "none" } };
  row.row_attestation_sha256 = crypto.createHash("sha256").update(JSON.stringify(["o1-row-v1", row.phase, row.agent, 1, 2, 3, 4, 5, row.model_tier, row.status, row.relaunch, row.row_index, row.ts, row.host_binding.status, row.host_binding.session_id, row.host_binding.transcript_source, row.host_binding.binding_scope, row.host_binding.transcript_prefix_bytes, row.host_binding.transcript_prefix_sha256, row.host_binding.host_run_id, row.host_binding.authentication])).digest("hex");
  assert.equal(verifyRowAttestation(row), true);
  assert.deepEqual(verifyPhaseCostBindings([row], { session_id: "session", transcriptBytes, hostRunId: "run" }), [row]);
  assert.throws(() => verifyRowAttestation({ ...row, relaunch: true }), /row attestation mismatch/i);
  assert.throws(() => verifyPhaseCostBindings([{ ...row, row_index: 1 }], { session_id: "session", transcriptBytes, hostRunId: "run" }), /attestation|row index/i);
  assert.throws(() => verifyRowAttestation({ ...row, unexpected: 1 }), /noncanonical O1 field/i);
  assert.equal(Object.keys(row.host_binding).some((key) => key.startsWith("receipt_")), false);
});
