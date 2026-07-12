#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  ARTIFACT_STORE_RELATIVE_PATHS,
  createArtifactStoreFromConfig,
} = require("../lib/artifact-store.js");
const { validatePath, resolveWorkspaceCwd } = require("../lib/pathsafe.js");
const {
  appendPhaseCost,
  findActiveChanges,
  findOpenSpecRoot,
  setPhaseSummary,
  withFileLock,
} = require("../lib/ospec-state.js");
const { writeFileAtomic, recoverOrphanBak } = require("../lib/atomic-write.js");
const { extractEnvelope, validateEnvelope } = require("../lib/result-envelope.js");
const { resolveModelTier } = require("./lib/model-tier.js");

const EVENT_RELATIVE_PATH = ARTIFACT_STORE_RELATIVE_PATHS.runtimeEvents;
const RESULT_FIELDS = [
  "result",
  "output",
  "response",
  "final_output",
  "final_result",
  "message",
  "content",
];

// REQ-hooks-006: on the codex target the host names the transcript-file field
// `agent_transcript_path` rather than `transcript_path`. Every call site that
// reads a transcript path resolves through this helper so both field names
// work identically (transcript_path takes priority when both are present;
// resolution priority and the §5.2 step-3 JSONL-parsing logic are otherwise
// unchanged).
function resolveTranscriptPath(input) {
  return input?.transcript_path || input?.agent_transcript_path;
}

function normalizeResolution(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isDegradedResolution(resolution) {
  return ["fallback-registry", "fallback-path", "none"].includes(resolution);
}

function findStructuredResolution(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return "";
  }

  seen.add(value);

  if (Object.prototype.hasOwnProperty.call(value, "skill_resolution")) {
    const resolution = normalizeResolution(value.skill_resolution);

    if (resolution) {
      return resolution;
    }
  }

  const nestedValues = Array.isArray(value)
    ? [...value].reverse()
    : Object.values(value).reverse();

  for (const nestedValue of nestedValues) {
    const resolution = findStructuredResolution(nestedValue, seen);

    if (resolution) {
      return resolution;
    }
  }

  return "";
}

function parseJsonText(text) {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function findTextResolution(text) {
  const parsed = parseJsonText(text);

  if (parsed) {
    const structured = findStructuredResolution(parsed);

    if (structured) {
      return structured;
    }
  }

  const matches = [
    ...text.matchAll(
      /(?:["'`]?skill_resolution["'`]?)\s*[:=]\s*["'`]?([a-z-]+)["'`]?/gi,
    ),
  ];

  return matches.length
    ? normalizeResolution(matches[matches.length - 1][1])
    : "";
}

function findResolutionInValue(value) {
  if (typeof value === "string") {
    return findTextResolution(value);
  }

  return findStructuredResolution(value);
}

function findResolutionInInput(input) {
  const direct = normalizeResolution(input?.skill_resolution);

  if (direct) {
    return direct;
  }

  for (const field of RESULT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input || {}, field)) {
      continue;
    }

    const resolution = findResolutionInValue(input[field]);

    if (resolution) {
      return resolution;
    }
  }

  return "";
}

function findResolutionInJsonLines(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = parseJsonText(lines[index]);

    if (!parsed) {
      continue;
    }

    const resolution = findStructuredResolution(parsed);

    if (resolution) {
      return resolution;
    }

    for (const field of RESULT_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(parsed, field)) {
        continue;
      }

      const nestedResolution = findResolutionInValue(parsed[field]);

      if (nestedResolution) {
        return nestedResolution;
      }
    }
  }

  return "";
}

async function findResolutionInTranscript(transcriptPath) {
  // Reject relative paths, ".." traversal, and filesystem roots before any read
  // (parity with internal/hooks/subagentstop.go). A rejected path is treated as
  // absent — identical degradation to ENOENT.
  const { cleaned, ok } = validatePath(transcriptPath);
  if (!ok) {
    return "";
  }

  try {
    const content = await fs.readFile(cleaned, "utf8");
    const parsed = parseJsonText(content);

    if (parsed) {
      return findStructuredResolution(parsed);
    }

    return findResolutionInJsonLines(content);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EACCES") {
      return "";
    }

    throw error;
  }
}

/**
 * Result Envelope fence extraction (C5 / strict-result-envelope). Mirrors the
 * §5.2 field-search order already used for skill_resolution (RESULT_FIELDS,
 * then a transcript_path fallback), but looks for the strict
 * ```json:result-envelope``` fence instead of a bare skill_resolution value.
 * Every function here is fail-safe: it returns {found:false} rather than
 * throwing on any unexpected shape.
 */
function findEnvelopeInValue(value, seen = new Set()) {
  if (typeof value === "string") {
    return extractEnvelope(value);
  }

  if (!value || typeof value !== "object" || seen.has(value)) {
    return { found: false };
  }

  seen.add(value);

  // Mirrors findStructuredResolution's "last-sibling-wins" semantics: walk
  // sibling values in reverse so that when two sibling fields both carry a
  // fence, the LAST one (in object-key insertion order, or array order) wins
  // deterministically in both runtimes (parity with Go's sorted-reverse walk).
  const nestedValues = Array.isArray(value)
    ? [...value].reverse()
    : Object.values(value).reverse();

  for (const nestedValue of nestedValues) {
    const result = findEnvelopeInValue(nestedValue, seen);

    if (result.found) {
      return result;
    }
  }

  return { found: false };
}

function findEnvelopeInInput(input) {
  for (const field of RESULT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input || {}, field)) {
      continue;
    }

    const result = findEnvelopeInValue(input[field]);

    if (result.found) {
      return result;
    }
  }

  return { found: false };
}

async function findEnvelopeInTranscript(transcriptPath) {
  const { cleaned, ok } = validatePath(transcriptPath);

  if (!ok) {
    return { found: false };
  }

  try {
    const content = await fs.readFile(cleaned, "utf8");
    const direct = extractEnvelope(content);

    if (direct.found) {
      return direct;
    }

    const lines = content.split(/\r?\n/).filter((line) => line.trim());

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const parsed = parseJsonText(lines[index]);

      if (!parsed) {
        continue;
      }

      const result = findEnvelopeInValue(parsed);

      if (result.found) {
        return result;
      }
    }

    return { found: false };
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EACCES") {
      return { found: false };
    }

    throw error;
  }
}

/**
 * Extracts, validates, and (fill-gap) persists the phase's Result Envelope
 * summary into the active change's state.yaml, per REQ-hooks-001. Strictly
 * additive and fail-safe: any failure at any step (no fence, malformed JSON,
 * schema-invalid, no active change, non-"sdd-" agent, lock/write failure)
 * silently no-ops without throwing and without affecting the hook's stdout.
 */
async function persistResultEnvelope({ input, workspace }) {
  try {
    let envelopeResult = findEnvelopeInInput(input);

    if (!envelopeResult.found) {
      envelopeResult = await findEnvelopeInTranscript(resolveTranscriptPath(input));
    }

    if (!envelopeResult.found || !envelopeResult.value) {
      return;
    }

    const validation = validateEnvelope(envelopeResult.value);

    if (!validation.valid) {
      return;
    }

    const agentName = resolveAgentName(input);
    const phase = derivePhaseKey(agentName);

    if (!phase) {
      return;
    }

    const openspecRoot = await findOpenSpecRoot(workspace);
    const activeChange = (await findActiveChanges(openspecRoot))[0];

    if (!activeChange) {
      return;
    }

    const envelope = envelopeResult.value;
    // Filter out non-string entries (parity with internal/hooks/subagentstop.go,
    // which only relays `item.(string)` values) rather than String()-coercing
    // them — a stray non-string key_decisions entry should be dropped, not
    // silently turned into a misleading "[object Object]"/"42"/"null" string.
    const keyDecisions = Array.isArray(envelope.key_decisions)
      ? envelope.key_decisions.filter((item) => typeof item === "string")
      : [];

    await withFileLock(activeChange.statePath, async () => {
      let freshContent;

      try {
        // CRITICAL remediation (strict-result-envelope 4R gate): recover an
        // orphaned state.yaml.bak (left by a failed writeFileAtomic
        // double-rename) before this re-read-under-lock, so a prior transient
        // write failure never turns into a silent no-op here.
        await recoverOrphanBak(activeChange.statePath);
        freshContent = await fs.readFile(activeChange.statePath, "utf8");
      } catch {
        return;
      }

      const updated = setPhaseSummary(freshContent, phase, {
        summary: envelope.executive_summary,
        keyDecisions,
      });

      if (updated === freshContent) {
        return;
      }

      await writeFileAtomic(activeChange.statePath, updated);
    });
  } catch {
    // Fully fail-safe: envelope persistence must never affect SubagentStop's
    // existing skill_resolution behavior or exit status.
  }
}

/**
 * Strips the `sdd-` prefix from an agent name to derive its phase key.
 * Returns "" when the agent name does not carry the `sdd-` prefix. Shared
 * between persistResultEnvelope and persistPhaseCost (REFACTOR, task 2.5) so
 * the phase-key derivation rule lives in exactly one place.
 */
function derivePhaseKey(agentName) {
  return agentName.startsWith("sdd-") ? agentName.slice("sdd-".length) : "";
}

/**
 * Picks the first present §5.2 RESULT_FIELDS value from the dispatch input,
 * unresolved/raw (no stringification here) — the caller decides how to turn
 * it into an estimate string. Mirrors findEnvelopeInInput/findResolutionInInput's
 * field-search order.
 */
function resolveResultPayload(input) {
  for (const field of RESULT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input || {}, field)) {
      return input[field];
    }
  }

  return undefined;
}

/**
 * Estimates a token count for a dispatch result payload using the same
 * ~4-bytes/token heuristic as `estimateTokens` in `pre-tool-use.js`
 * (REQ-hooks-001 / design "Estimate over UTF-8 byte length"). `payload` is
 * used as-is when it is already a string, else JSON-serialized. A payload
 * that cannot be serialized (e.g. a circular structure) propagates its error
 * to the caller, which is expected to be wrapped in persistPhaseCost's own
 * fail-safe boundary.
 */
function estimateResultTokens(payload) {
  const str = typeof payload === "string" ? payload : JSON.stringify(payload) ?? "";

  return Math.round(Buffer.byteLength(str, "utf8") / 4);
}

/**
 * Resolves the dispatch's status for a phase-cost record: a valid
 * json:result-envelope fence's `status` field, else the top-level
 * `input.status`, else `"unknown"` (REQ-hooks-001 / design "Payload/status
 * resolution").
 */
async function resolveDispatchStatus(input) {
  let envelopeResult = findEnvelopeInInput(input);

  if (!envelopeResult.found) {
    envelopeResult = await findEnvelopeInTranscript(resolveTranscriptPath(input));
  }

  if (envelopeResult.found && envelopeResult.value) {
    const validation = validateEnvelope(envelopeResult.value);

    if (validation.valid && typeof envelopeResult.value.status === "string") {
      return envelopeResult.value.status;
    }
  }

  if (typeof input?.status === "string" && input.status.trim()) {
    return input.status;
  }

  return "unknown";
}

function getValidInt(val) {
  if (typeof val === "number" && Number.isInteger(val) && val >= 0) {
    return val;
  }
  return undefined;
}

function getNestedValue(obj, pathStr) {
  const parts = pathStr.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function resolveIntField(input, paths) {
  for (const p of paths) {
    const val = getNestedValue(input, p);
    const num = getValidInt(val);
    if (num !== undefined) {
      return num;
    }
  }
  return undefined;
}

function resolveSegmentField(input, paths) {
  for (const p of paths) {
    const val = getNestedValue(input, p);
    if (typeof val === "string") {
      return val;
    }
  }
  return undefined;
}

function normalizeDispatchCostContext(input) {
  // prompt
  let prompt = resolveIntField(input, [
    "telemetry.estimated_prompt_tokens",
    "estimated_prompt_tokens",
    "usage.prompt_tokens"
  ]);
  if (prompt === undefined) {
    const segment = resolveSegmentField(input, ["telemetry.prompt", "prompt"]);
    prompt = segment !== undefined ? Math.ceil(Buffer.byteLength(segment, "utf8") / 4) : 0;
  }

  // artifact
  let artifact = resolveIntField(input, [
    "telemetry.estimated_artifact_tokens",
    "estimated_artifact_tokens",
    "usage.artifact_tokens"
  ]);
  if (artifact === undefined) {
    const segment = resolveSegmentField(input, ["telemetry.artifact", "artifact"]);
    artifact = segment !== undefined ? Math.ceil(Buffer.byteLength(segment, "utf8") / 4) : 0;
  }

  // tool_output
  let tool_output = resolveIntField(input, [
    "telemetry.estimated_tool_output_tokens",
    "estimated_tool_output_tokens",
    "usage.tool_output_tokens"
  ]);
  if (tool_output === undefined) {
    const segment = resolveSegmentField(input, ["telemetry.tool_output", "tool_output"]);
    tool_output = segment !== undefined ? Math.ceil(Buffer.byteLength(segment, "utf8") / 4) : 0;
  }

  // output
  let output = resolveIntField(input, [
    "telemetry.estimated_output_tokens",
    "estimated_output_tokens",
    "usage.output_tokens"
  ]);
  if (output === undefined) {
    let segment = resolveSegmentField(input, ["telemetry.output"]);
    if (segment === undefined) {
      const payload = resolveResultPayload(input);
      if (payload !== undefined) {
        segment = typeof payload === "string" ? payload : (JSON.stringify(payload) ?? "");
      }
    }
    output = segment !== undefined ? Math.ceil(Buffer.byteLength(segment, "utf8") / 4) : 0;
  }

  // duration_ms
  let duration_ms = resolveIntField(input, ["telemetry.duration_ms", "duration_ms"]);
  if (duration_ms === undefined) {
    duration_ms = 0;
  }

  return {
    prompt,
    artifact,
    tool_output,
    output,
    duration_ms
  };
}

/**
 * Appends one estimated-cost JSONL record for this dispatch to
 * `.ospec/session/{change}/phase-costs.jsonl` (REQ-hooks-001), mirroring the
 * fail-safe boundary and active-change resolution already used by
 * persistResultEnvelope. Any failure (non-"sdd-" agent, no active change,
 * estimation error, write/lock error) silently no-ops without throwing and
 * without affecting the hook's stdout.
 */
async function persistPhaseCost({ input, workspace }) {
  try {
    const agentName = resolveAgentName(input);
    const phase = derivePhaseKey(agentName);

    if (!phase) {
      return;
    }

    const openspecRoot = await findOpenSpecRoot(workspace);
    const activeChange = (await findActiveChanges(openspecRoot))[0];

    if (!activeChange) {
      return;
    }

    const ctx = normalizeDispatchCostContext(input);
    const status = await resolveDispatchStatus(input);
    const model_tier = resolveModelTier(agentName, path.resolve(__dirname, "../.."));

    await appendPhaseCost({
      workspace,
      changeName: activeChange.directoryName,
      record: {
        phase,
        agent: agentName,
        estimated_prompt_tokens: ctx.prompt,
        estimated_artifact_tokens: ctx.artifact,
        estimated_tool_output_tokens: ctx.tool_output,
        estimated_output_tokens: ctx.output,
        duration_ms: ctx.duration_ms,
        model_tier,
        status,
        ts: new Date().toISOString(),
      },
    });
  } catch (err) {
    // Fully fail-safe: phase-cost recording must never affect SubagentStop's
    // existing skill_resolution behavior or exit status.
  }
}

function resolveAgentName(input) {
  return String(
    input?.agent_type ||
      input?.agent_name ||
      input?.agent ||
      input?.agent_id ||
      "unknown",
  );
}

function resolveTimestamp(input, now) {
  const timestamp =
    typeof input?.timestamp === "string" ? input.timestamp.trim() : "";

  return timestamp || now().toISOString();
}

async function runSubagentStop({
  input = {},
  fallbackCwd = process.cwd(),
  mode,
  now = () => new Date(),
} = {}) {
  const workspace = resolveWorkspaceCwd(input.cwd, fallbackCwd);

  // REQ-hooks-001: attempt the strict result-envelope fence extract/validate/
  // persist step BEFORE the existing skill_resolution evaluation below. This
  // is a pure side effect (state.yaml write) and never alters this function's
  // return value or the hook's stdout.
  await persistResultEnvelope({ input, workspace });

  // REQ-hooks-001: per-dispatch phase-cost recording. Same fail-safe/ordering
  // contract as persistResultEnvelope above — pure side effect, never alters
  // this function's return value or the hook's stdout.
  await persistPhaseCost({ input, workspace });

  const resolution =
    findResolutionInInput(input) ||
    (await findResolutionInTranscript(resolveTranscriptPath(input)));

  if (!isDegradedResolution(resolution)) {
    return {
      status: "skipped",
      reason: resolution ? "healthy-resolution" : "resolution-unavailable",
    };
  }

  const event = {
    timestamp: resolveTimestamp(input, now),
    agent: resolveAgentName(input),
    skill_resolution: resolution,
    action: "refresh-registry-next-delegation",
  };

  const store = await createArtifactStoreFromConfig({ mode, workspace });
  await store.appendRuntimeEvent(event);

  return {
    status: "warning-recorded",
    path: EVENT_RELATIVE_PATH,
    event,
  };
}

async function readJsonInput(stream = process.stdin) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const input = Buffer.concat(chunks).toString("utf8").trim();
  return input ? JSON.parse(input) : {};
}

async function main() {
  try {
    const result = await runSubagentStop({
      input: await readJsonInput(),
    });

    process.stdout.write(
      `${JSON.stringify(
        result.status === "warning-recorded"
          ? {
              continue: true,
              systemMessage:
                "Subagent skill resolution degraded; refresh the skill registry before the next delegation.",
            }
          : { continue: true },
      )}\n`,
    );
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        continue: true,
        systemMessage: `SubagentStop observability failed: ${error.message}`,
      })}\n`,
    );
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  EVENT_RELATIVE_PATH,
  estimateResultTokens,
  findEnvelopeInInput,
  findEnvelopeInTranscript,
  findResolutionInInput,
  findResolutionInJsonLines,
  findResolutionInTranscript,
  findStructuredResolution,
  findTextResolution,
  isDegradedResolution,
  persistPhaseCost,
  persistResultEnvelope,
  resolveDispatchStatus,
  runSubagentStop,
  normalizeDispatchCostContext,
};
