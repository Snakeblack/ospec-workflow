"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");

const TOKEN_FIELDS = ["estimated_prompt_tokens", "estimated_artifact_tokens", "estimated_tool_output_tokens", "estimated_output_tokens"];
const VERIFY_SEVERITIES = ["critical", "warning", "suggestion"];
const FOUR_R_SEVERITIES = ["blocker", "critical", "warning", "suggestion"];

function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer.`);
  return value;
}

function readJson(filePath, label) {
  let raw;
  try { raw = fs.readFileSync(filePath, "utf8"); }
  catch (error) { if (error.code === "ENOENT") throw new Error(`${label} is missing at ${filePath}.`); throw error; }
  try { return JSON.parse(raw); }
  catch (error) { throw new Error(`${label} must contain valid JSON: ${error.message}`); }
}

function loadBenchmarkObservation(filePath) {
  const value = readJson(filePath, "Benchmark observation");
  const verify = value.defects && value.defects.verify;
  const fourR = value.defects && value.defects.four_r;
  const questions = nonNegativeInteger(value.questions_asked, "questions_asked");
  if (!verify || !fourR) throw new Error("defects.verify and defects.four_r are required.");
  const provenance = value.provenance;
  if (!provenance || typeof provenance !== "object") throw new Error("Live provenance is required.");
  if (provenance.driver !== "codex-exec") throw new Error("provenance.driver must be codex-exec.");
  if (typeof provenance.cli_version !== "string" || !/^codex-cli \d+\.\d+\.\d+$/.test(provenance.cli_version)) {
    throw new Error("provenance.cli_version must identify the codex CLI version.");
  }
  if (typeof provenance.session_id !== "string" || provenance.session_id.trim().length === 0) {
    throw new Error("provenance.session_id is required.");
  }
  if (typeof provenance.transcript_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(provenance.transcript_sha256)) {
    throw new Error("provenance.transcript_sha256 must be a lowercase SHA-256 digest.");
  }
  if (typeof provenance.completed_at !== "string" || Number.isNaN(Date.parse(provenance.completed_at))) {
    throw new Error("provenance.completed_at must be an ISO timestamp.");
  }
  const verifyDefects = VERIFY_SEVERITIES.reduce((sum, key) => sum + nonNegativeInteger(verify[key], `defects.verify.${key}`), 0);
  const fourRDefects = FOUR_R_SEVERITIES.reduce((sum, key) => sum + nonNegativeInteger(fourR[key], `defects.four_r.${key}`), 0);
  return { questions_asked: questions, verify_defects: verifyDefects, four_r_defects: fourRDefects, defects_total: verifyDefects + fourRDefects, provenance };
}

function parseCodexTranscript(raw) {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8");
  const lines = bytes.toString("utf8").split(/\r?\n/).filter((line) => line.length > 0);
  const events = lines.map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`codex transcript must be valid JSONL; line ${index + 1}: ${error.message}`); }
  });
  const starts = events.filter((event) => event && event.type === "thread.started" && typeof event.thread_id === "string" && event.thread_id.trim().length > 0);
  if (starts.length !== 1) throw new Error("codex transcript must contain exactly one thread.started event with thread_id.");
  const started = starts[0];
  const sessionId = started.thread_id.trim();
  for (const event of events) {
    for (const key of ["thread_id", "session_id"]) {
      if (typeof event?.[key] === "string" && event[key].trim() && event[key].trim() !== sessionId) {
        throw new Error("codex transcript contains mixed session identifiers.");
      }
    }
  }
  const completions = events.filter((event) => event && event.type === "turn.completed" && event.usage && typeof event.usage === "object");
  if (completions.length !== 1) throw new Error("codex transcript must contain exactly one turn.completed event with usage.");
  if (events[events.length - 1] !== completions[0]) throw new Error("codex transcript has an ambiguous terminal event sequence.");
  const completed = completions[0];
  return {
    session_id: sessionId,
    usage: completed.usage,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

function readCodexTranscript(transcriptPath) {
  let bytes;
  try { bytes = fs.readFileSync(transcriptPath); }
  catch (error) {
    if (error.code === "ENOENT") throw new Error(`Live codex transcript is missing at ${transcriptPath}.`);
    throw error;
  }
  return parseCodexTranscript(bytes);
}

function verifyBenchmarkProvenance({ provenance, transcriptPath, transcriptBytes, trustedCliVersion }) {
  if (!provenance || typeof provenance !== "object") throw new Error("Live provenance is required.");
  if (typeof trustedCliVersion !== "string" || !/^codex-cli \d+\.\d+\.\d+$/.test(trustedCliVersion)) {
    throw new Error("Trusted codex CLI version is required from the host boundary.");
  }
  const transcript = transcriptBytes === undefined ? readCodexTranscript(transcriptPath) : parseCodexTranscript(transcriptBytes);
  if (provenance.transcript_sha256 !== transcript.sha256) {
    throw new Error(`provenance transcript SHA-256 mismatch for ${transcriptPath}.`);
  }
  if (provenance.session_id !== transcript.session_id) {
    throw new Error("provenance session_id mismatch with thread.started.thread_id.");
  }
  if (provenance.cli_version !== trustedCliVersion) {
    throw new Error("provenance cli_version mismatch with the trusted host CLI version.");
  }
  return transcript;
}

function validCostRow(row) {
  const allowed = new Set(["phase", "agent", ...TOKEN_FIELDS, "duration_ms", "model_tier", "status", "relaunch", "row_index", "ts", "host_binding", "row_attestation_sha256", "estimate_source", "emitter", "phase_evidence", "artifact_evidence_sha256", "benchmark_evidence_sha256"]);
  return row && typeof row === "object" && !Array.isArray(row) && Object.keys(row).every((key) => allowed.has(key)) && typeof row.phase === "string" && row.phase.length > 0 &&
    row.agent === `sdd-${row.phase}` &&
    TOKEN_FIELDS.every((key) => Number.isSafeInteger(row[key]) && row[key] >= 0 && row[key] <= 1_000_000_000_000) &&
    Number.isSafeInteger(row.duration_ms) && row.duration_ms >= 0 && row.duration_ms <= 31_536_000_000 &&
    typeof row.model_tier === "string" && row.model_tier.length > 0 &&
    typeof row.status === "string" && row.status.length > 0 &&
    (row.estimate_source === undefined || typeof row.estimate_source === "string") &&
    (row.emitter === undefined || typeof row.emitter === "string") &&
    (row.phase_evidence === undefined || typeof row.phase_evidence === "string") &&
    (row.artifact_evidence_sha256 === undefined || /^[a-f0-9]{64}$/.test(row.artifact_evidence_sha256)) &&
    (row.benchmark_evidence_sha256 === undefined || /^[a-f0-9]{64}$/.test(row.benchmark_evidence_sha256)) &&
    typeof row.relaunch === "boolean" &&
    typeof row.ts === "string" && !Number.isNaN(Date.parse(row.ts));
}

function canonicalPersistedO1Row(row) {
  const binding = row.host_binding || {};
  if (row.emitter !== undefined || row.estimate_source !== undefined || binding.binding_scope === "full") {
    return JSON.stringify(["o1-row-v2", row.phase, row.agent, row.estimated_prompt_tokens, row.estimated_artifact_tokens, row.estimated_tool_output_tokens, row.estimated_output_tokens, row.duration_ms, row.model_tier, row.status, row.relaunch, row.row_index, row.ts, row.estimate_source, row.emitter, row.phase_evidence, row.artifact_evidence_sha256, row.benchmark_evidence_sha256, binding.status, binding.session_id, binding.transcript_source, binding.binding_scope, binding.transcript_prefix_bytes, binding.transcript_prefix_sha256, binding.transcript_bytes, binding.transcript_sha256, binding.host_run_id, binding.authentication]);
  }
  return JSON.stringify(["o1-row-v1", row.phase, row.agent, row.estimated_prompt_tokens, row.estimated_artifact_tokens, row.estimated_tool_output_tokens, row.estimated_output_tokens, row.duration_ms, row.model_tier, row.status, row.relaunch, row.row_index, row.ts, binding.status, binding.session_id, binding.transcript_source, binding.binding_scope, binding.transcript_prefix_bytes, binding.transcript_prefix_sha256, binding.host_run_id, binding.authentication]);
}

function verifyRowAttestation(row) {
  const allowed = new Set(["phase", "agent", ...TOKEN_FIELDS, "duration_ms", "model_tier", "status", "relaunch", "row_index", "ts", "host_binding", "row_attestation_sha256", "estimate_source", "emitter", "phase_evidence", "artifact_evidence_sha256", "benchmark_evidence_sha256"]);
  const unexpected = Object.keys(row || {}).find((key) => !allowed.has(key));
  if (unexpected) throw new Error(`Noncanonical O1 field: ${unexpected}.`);
  const expected = crypto.createHash("sha256").update(canonicalPersistedO1Row(row)).digest("hex");
  if (row.row_attestation_sha256 !== expected) throw new Error("O1 row attestation mismatch.");
  return true;
}

function verifyPhaseCostBindings(rows, trustedBinding) {
  if (!trustedBinding || typeof trustedBinding.session_id !== "string" || !Buffer.isBuffer(trustedBinding.transcriptBytes)) {
    throw new Error("Trusted host binding requires session_id and immutable transcriptBytes.");
  }
  const trustedTranscript = parseCodexTranscript(trustedBinding.transcriptBytes);
  if (trustedTranscript.session_id !== trustedBinding.session_id) throw new Error("Trusted host binding session mismatch with codex transcript.");
  let priorPrefixBytes = 0;
  for (const [rowPosition, row] of rows.entries()) {
    verifyRowAttestation(row);
    if (row.row_index !== rowPosition) throw new Error(`O1 row index mismatch at position ${rowPosition}.`);
    const binding = row.host_binding;
    if (!binding || typeof binding !== "object") throw new Error(`O1 host binding is missing for phase ${row.phase}.`);
    if (binding.session_id !== trustedBinding.session_id) throw new Error(`O1 host binding session mismatch for phase ${row.phase}.`);
    if (binding.status !== "supported-observable-binding" || binding.authentication !== "none" || binding.transcript_source !== "codex-events" || !["prefix", "full"].includes(binding.binding_scope)) {
      throw new Error(`unsupported-host-binding: O1 phase ${row.phase} is not bound to authoritative codex-events bytes.`);
    }
    if (trustedBinding.hostRunId !== undefined && binding.host_run_id !== trustedBinding.hostRunId) throw new Error(`O1 host binding run mismatch for phase ${row.phase}.`);
    if (binding.binding_scope === "full") {
      if (binding.transcript_bytes !== trustedBinding.transcriptBytes.length) throw new Error(`O1 full binding length mismatch for phase ${row.phase}.`);
      const fullHash = crypto.createHash("sha256").update(trustedBinding.transcriptBytes).digest("hex");
      if (binding.transcript_sha256 !== fullHash) throw new Error(`O1 full binding transcript mismatch for phase ${row.phase}.`);
      priorPrefixBytes = trustedBinding.transcriptBytes.length;
      continue;
    }
    if (!Number.isInteger(binding.transcript_prefix_bytes) || binding.transcript_prefix_bytes <= 0 || binding.transcript_prefix_bytes > trustedBinding.transcriptBytes.length) {
      throw new Error(`O1 host binding prefix length is invalid for phase ${row.phase}.`);
    }
    if (binding.transcript_prefix_bytes < priorPrefixBytes) throw new Error(`O1 host binding prefix order regressed for phase ${row.phase}.`);
    priorPrefixBytes = binding.transcript_prefix_bytes;
    const prefix = trustedBinding.transcriptBytes.subarray(0, binding.transcript_prefix_bytes);
    if (prefix[prefix.length - 1] !== 0x0a) throw new Error(`O1 host binding prefix is not newline-complete for phase ${row.phase}.`);
    const prefixHash = crypto.createHash("sha256").update(prefix).digest("hex");
    if (binding.transcript_prefix_sha256 !== prefixHash) throw new Error(`O1 host binding prefix mismatch for phase ${row.phase}.`);
  }
  return rows;
}

function readPhaseCosts(filePath, options = {}) {
  let rawBytes;
  try { rawBytes = options.rawBytes === undefined ? fs.readFileSync(filePath) : Buffer.from(options.rawBytes); }
  catch (error) { if (error.code === "ENOENT") throw new Error(`O1 phase-cost evidence is missing at ${filePath}.`); throw error; }
  if (rawBytes.length === 0 || rawBytes[rawBytes.length - 1] !== 0x0a) throw new Error(`O1 phase-cost evidence must end with a final newline at ${filePath}.`);
  const rows = [];
  for (const [index, line] of rawBytes.toString("utf8").split(/\r?\n/).entries()) {
    if (!line) continue;
    let row;
    try { row = JSON.parse(line); }
    catch (error) { throw new Error(`Invalid O1 line ${index + 1}: ${error.message}`); }
    if (!validCostRow(row)) throw new Error(`Invalid O1 line ${index + 1}: noncanonical phase-cost row.`);
    rows.push(row);
  }
  if (rows.length === 0) throw new Error(`O1 phase-cost evidence has no valid rows at ${filePath}.`);
  if (Array.isArray(options.expectedPhases)) {
    const expected = new Set(options.expectedPhases);
    const actual = new Set(rows.map((row) => row.phase));
    const unexpected = [...actual].find((phase) => !expected.has(phase));
    if (unexpected) throw new Error(`O1 contains unexpected phase ${unexpected}.`);
    const missing = [...expected].find((phase) => !actual.has(phase));
    if (missing) throw new Error(`O1 is missing phase ${missing}.`);
  }
  if (options.trustedBinding) verifyPhaseCostBindings(rows, options.trustedBinding);
  const totals = Object.fromEntries(TOKEN_FIELDS.map((field) => [field, rows.reduce((sum, row) => sum + row[field], 0)]));
  return {
    rows,
    invocations: rows.length,
    relaunches: rows.filter((row) => row.relaunch).length,
    ...totals,
    estimated_total_tokens: TOKEN_FIELDS.reduce((sum, field) => sum + totals[field], 0),
    duration_ms: rows.reduce((sum, row) => sum + row.duration_ms, 0),
    model_tiers: [...new Set(rows.map((row) => typeof row.model_tier === "string" ? row.model_tier : "unknown"))].sort(),
    statuses: [...new Set(rows.map((row) => typeof row.status === "string" ? row.status : "unknown"))].sort(),
    raw_sha256: crypto.createHash("sha256").update(rawBytes).digest("hex"),
    raw_bytes: rawBytes,
  };
}

function buildRunBenchmarkRow({ profile, route, transcript, durationMs, observation, nativeO1 = null }) {
  const input = transcript?.usage?.input_tokens;
  const output = transcript?.usage?.output_tokens;
  if (!Number.isSafeInteger(input) || input < 0 || !Number.isSafeInteger(output) || output < 0 || input + output <= 0) throw new Error("Run benchmark requires non-zero terminal turn usage.");
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) throw new Error("Run benchmark requires measured host duration.");
  return {
    profile, route, measurement_scope: "run", phase_attribution: "none", token_source: "terminal-turn-usage",
    input_tokens: input, output_tokens: output, total_tokens: input + output, duration_ms: durationMs,
    subagent_coverage: "unknown", invocations: null, relaunches: null, model_tiers: [],
    native_o1: nativeO1?.present
      ? { present: true, status: nativeO1.status || "available", sha256: nativeO1.sha256, rows: nativeO1.rows }
      : nativeO1 ? { present: false, status: "unavailable", warning: nativeO1.warning } : { present: false },
    questions_asked: observation.questions_asked, verify_defects: observation.verify_defects,
    four_r_defects: observation.four_r_defects, defects_total: observation.defects_total,
  };
}

function renderBaseline(rows, options = {}) {
  const expected = options.expectedProfiles || [];
  const profiles = new Set(rows.map((row) => row.profile));
  const missing = expected.filter((profile) => !profiles.has(profile));
  if (rows.length !== expected.length || missing.length > 0) throw new Error(`Benchmark suite incomplete; missing profiles: ${missing.join(", ") || "duplicate rows"}.`);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const revision = options.gitRevision || "unknown";
  if (!rows.every((row) => row.measurement_scope === "run" && row.phase_attribution === "none")) throw new Error("Baseline renderer accepts run-level rows only.");
  const lines = ["# Experimental run-level benchmark", "", `Generated: ${generatedAt}`, `Git revision: \`${revision}\``, "Measurement scope: complete run; phase attribution: none.", "Token source: terminal `turn.completed.usage`; O1 is supplementary when present.", "Subagent coverage: unknown unless the host reports it explicitly.", "", "| Profile | Route | Input tokens | Output tokens | Total tokens | Duration ms | Questions | Verify defects | 4R defects | Total defects |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"];
  for (const row of [...rows].sort((a, b) => a.profile.localeCompare(b.profile))) lines.push(`| ${row.profile} | ${row.route} | ${row.input_tokens} | ${row.output_tokens} | ${row.total_tokens} | ${row.duration_ms} | ${row.questions_asked} | ${row.verify_defects} | ${row.four_r_defects} | ${row.defects_total} |`);
  return `${lines.join("\n")}\n`;
}

module.exports = {
  loadBenchmarkObservation,
  parseCodexTranscript,
  readCodexTranscript,
  verifyBenchmarkProvenance,
  verifyPhaseCostBindings,
  readPhaseCosts,
  buildRunBenchmarkRow,
  renderBaseline,
  verifyRowAttestation,
  canonicalPersistedO1Row,
};
