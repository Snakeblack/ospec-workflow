#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const { captureWorkspace } = require("./lib/capture.js");
const { assertScenario, resolveActualRoute } = require("./lib/assertions.js");
const { loadBenchmarkObservation, parseCodexTranscript, verifyBenchmarkProvenance, verifyPhaseCostBindings, readPhaseCosts, buildRunBenchmarkRow, renderBaseline } = require("./lib/benchmark.js");
const { buildSafeExportManifest, materializeSafeExport, scenarioFor, validateExportWorkspace, verifySafeExportFile, assertSyntheticGitOutcome } = require("./safe-export.js");
const {
  resolveBenchmarkNames,
  resolveBenchmarkEvidencePaths,
  preflightBenchmarkWorkspace,
  publishBaselineAtomic,
  resolveCodexLauncher,
  codexVersion,
  gitRevision: resolveGitRevision,
} = require("./run.js");

const CAPABILITIES = new WeakMap();
const SEALED_PROFILE_RESULTS = new WeakSet();
const DEFAULT_CAPABILITY_TTL_MS = 30_000;
const EXPERIMENT_RESULT_SCHEMA = "ospec-experimental-run-result/v1";
const DEFAULT_RESULT_CACHE = path.join(__dirname, ".runs", "benchmark-results");
const O1_RUNTIME_FILES = Object.freeze([
  "scripts/hooks/ospec-hooks-launch.js",
  "scripts/hooks/subagent-stop.js",
  "scripts/lib/ospec-state.js",
]);
const POST_RUN_RUNTIME_UNTRACKED = Object.freeze([
  ".eval-capture/codex-events.jsonl",
  ".ospec/cache/skill-registry.cache.json",
  ".ospec/session/latest.md",
]);
const REMOTE_REASONING_EFFORTS = new Set(["low", "medium", "high"]);

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function allowedGitUntracked(manifest) {
  const change = manifest.benchmark.change;
  return [...(manifest.benchmark.allowed_untracked_files || []), ...(manifest.benchmark.expected_artifacts || []), `openspec/changes/${change}/state.yaml`, ".eval-capture/benchmark-evidence.json", `.ospec/session/${change}/phase-costs.jsonl`, ...POST_RUN_RUNTIME_UNTRACKED];
}

function assertPostRunGitOutcome(workspaceRoot, manifest) {
  for (const relative of POST_RUN_RUNTIME_UNTRACKED) {
    const absolute = path.join(workspaceRoot, ...relative.split("/"));
    if (fs.existsSync(absolute)) safeObservedFile(workspaceRoot, relative);
  }
  return assertSyntheticGitOutcome(workspaceRoot, manifest.benchmark.synthetic_git, manifest.benchmark.product_files, allowedGitUntracked(manifest));
}

function hashRuntimeSurface(root = path.resolve(__dirname, "../..")) {
  const roots = ["AGENTS.md", "agents", "skills", "rules", "models.yaml", "openspec/config.yaml", "scripts/evals/live-driver.js", "scripts/evals/safe-export.js", "scripts/evals/run.js", "scripts/evals/lib/benchmark.js", "scripts/hooks", "scripts/lib/ospec-state.js"];
  const rows = [];
  const visit = (relative) => {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) return;
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Runtime fingerprint refuses symlink: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) visit(path.join(relative, name));
    } else if (stat.isFile()) rows.push([relative.split(path.sep).join("/"), sha256(fs.readFileSync(absolute))]);
  };
  for (const relative of roots) visit(relative);
  return Object.fromEntries(rows);
}

function workingTreeIdentity(root = path.resolve(__dirname, "../..")) {
  const run = (args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
    if (result.error || result.status !== 0) return "unknown";
    return result.stdout;
  };
  const status = run(["status", "--porcelain=v1"]);
  const tracked = run(["diff", "--binary", "HEAD", "--"]);
  const staged = run(["diff", "--binary", "--cached", "--"]);
  if ([status, tracked, staged].includes("unknown")) return "unknown";
  return sha256(`${status}\0${tracked}\0${staged}`);
}

function defaultRuntimeHashes() {
  return hashRuntimeSurface();
}

function normalizeRemoteModelIdentity(value) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error("Remote model identity is required and cannot be blank.");
  return value.trim();
}

function normalizeRemoteReasoningEffort(value) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error("Remote reasoning effort is required and cannot be blank.");
  const normalized = value.trim().toLowerCase();
  if (!REMOTE_REASONING_EFFORTS.has(normalized)) throw new Error(`Unsupported remote reasoning effort: ${value}.`);
  return normalized;
}

function hashInstalledRuntimeBytes(installedRoot, files) {
  if (typeof installedRoot !== "string" || !Array.isArray(files) || files.length === 0) throw new Error("Installed runtime audit returned no files to identify.");
  const hash = crypto.createHash("sha256");
  hash.update("ospec-installed-runtime/v1\0");
  for (const relative of [...files].sort()) {
    const bytes = fs.readFileSync(path.join(installedRoot, relative));
    hash.update(relative.split(path.sep).join("/"));
    hash.update("\0");
    hash.update(String(bytes.length));
    hash.update("\0");
    hash.update(bytes);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function resolveProductiveExecutionContext(options = {}, deps = {}) {
  const remoteModelIdentity = normalizeRemoteModelIdentity(options.remoteModelIdentity ?? process.env.OSPEC_REMOTE_MODEL_IDENTITY);
  const remoteReasoningEffort = normalizeRemoteReasoningEffort(options.remoteReasoningEffort ?? process.env.OSPEC_REMOTE_REASONING_EFFORT);
  const assertRuntime = deps.assertRuntime || assertInstalledO1Runtime;
  const preflight = deps.preflight || preflightInstalledSubagentStop;
  const validated = assertRuntime({ expectedRoot: options.expectedRoot, installedRoot: options.installedRoot });
  preflight({ installedRoot: validated.installedRoot, tempRoot: options.tempRoot });
  const installedRuntimeIdentity = hashInstalledRuntimeBytes(validated.installedRoot, validated.files);
  return Object.freeze({ remoteModelIdentity, remoteReasoningEffort, installedRuntimeIdentity });
}

function buildCompatibilityDescriptor(profile, options = {}) {
  const exported = buildSafeExportManifest(profile);
  const runtimeHashes = options.runtimeHashes || defaultRuntimeHashes();
  return {
    schema: EXPERIMENT_RESULT_SCHEMA,
    profile,
    git_revision: options.gitRevision || resolveGitRevision(),
    cli_version: options.cliVersion || codexVersion(),
    runtime_sha256: sha256(JSON.stringify(Object.entries(runtimeHashes).sort(([a], [b]) => a.localeCompare(b)))),
    working_tree_identity: options.workingTreeIdentity || workingTreeIdentity(),
    installed_runtime_identity: options.installedRuntimeIdentity || "unknown",
    remote_model_identity: options.remoteModelIdentity || "unknown",
    remote_reasoning_effort: options.remoteReasoningEffort || "unknown",
    compatibility_strength: options.remoteModelIdentity && options.remoteReasoningEffort && options.installedRuntimeIdentity ? "strong" : "limited",
    manifest_sha256: sha256(JSON.stringify(exported)),
    prompt_sha256: exported.prompt.sha256,
    fixture_sha256: sha256(JSON.stringify(exported.files)),
  };
}

function profileResultPath(cacheRoot, profile) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(profile)) throw new Error("Invalid cached benchmark profile.");
  return path.join(path.resolve(cacheRoot), profile, "result.json");
}

function validRunRow(row, profile) {
  return row?.profile === profile && row.measurement_scope === "run" && row.phase_attribution === "none" && row.token_source === "terminal-turn-usage" && Number.isSafeInteger(row.total_tokens) && row.total_tokens > 0 && row.total_tokens === row.input_tokens + row.output_tokens && Number.isSafeInteger(row.duration_ms) && row.duration_ms > 0 && row.invocations === null && row.relaunches === null && row.subagent_coverage === "unknown";
}

function persistProfileResult(cacheRoot, descriptor, result) {
  if (!Buffer.isBuffer(result?.transcriptBytes) || !result?.observation || !Number.isSafeInteger(result?.durationMs) || typeof result?.route !== "string") throw new Error("Refusing to cache a result without replay-verifiable host evidence.");
  const transcript = parseCodexTranscript(result.transcriptBytes);
  if (transcript.sha256 !== result?.transcript?.sha256) throw new Error("Refusing to cache transcript hash mismatch.");
  const recomputed = buildRunBenchmarkRow({ profile: descriptor.profile, route: result.route, transcript, durationMs: result.durationMs, observation: result.observation, nativeO1: result.row?.native_o1?.status ? result.row.native_o1 : null });
  if (!validRunRow(result.row, descriptor.profile) || canonicalJson(recomputed) !== canonicalJson(result.row)) throw new Error("Refusing to cache an invalid or unreproducible run row.");
  const payload = { schema: EXPERIMENT_RESULT_SCHEMA, compatibility: descriptor, transcript_base64: result.transcriptBytes.toString("base64"), evidence: { route: result.route, duration_ms: result.durationMs, observation: result.observation, native_o1: result.row.native_o1 }, row: result.row };
  payload.attestation_sha256 = sha256(canonicalJson(payload));
  const target = profileResultPath(cacheRoot, descriptor.profile);
  publishBaselineAtomic(target, `${JSON.stringify(payload, null, 2)}\n`);
  return target;
}

function loadCompatibleProfileResult(cacheRoot, descriptor) {
  const miss = (reason) => ({ hit: false, reason });
  if (descriptor.compatibility_strength !== "strong" || descriptor.installed_runtime_identity === "unknown" || descriptor.remote_model_identity === "unknown" || descriptor.remote_reasoning_effort === "unknown") return miss("unknown-identity");
  const target = profileResultPath(cacheRoot, descriptor.profile);
  let payload;
  try { payload = JSON.parse(fs.readFileSync(target, "utf8")); } catch { return miss("missing-or-invalid-cache"); }
  if (payload.schema !== EXPERIMENT_RESULT_SCHEMA || canonicalJson(payload.compatibility) !== canonicalJson(descriptor) || !/^[a-f0-9]{64}$/.test(payload.attestation_sha256 || "")) return miss("compatibility-mismatch");
  const attestation = payload.attestation_sha256;
  delete payload.attestation_sha256;
  if (sha256(canonicalJson(payload)) !== attestation) return miss("tamper-or-corruption");
  try {
    const transcriptBytes = Buffer.from(payload.transcript_base64, "base64");
    const transcript = parseCodexTranscript(transcriptBytes);
    const nativeO1 = payload.evidence?.native_o1?.status ? payload.evidence.native_o1 : null;
    const recomputed = buildRunBenchmarkRow({ profile: descriptor.profile, route: payload.evidence.route, transcript, durationMs: payload.evidence.duration_ms, observation: payload.evidence.observation, nativeO1 });
    if (!validRunRow(payload.row, descriptor.profile) || canonicalJson(recomputed) !== canonicalJson(payload.row)) return miss("unreproducible-evidence");
    return { hit: true, result: { profile: descriptor.profile, row: payload.row, transcript, transcriptBytes, reused: true } };
  } catch { return miss("unreproducible-evidence"); }
}

function readSupplementaryO1(costsPath) {
  if (!fs.existsSync(costsPath)) return { present: false, status: "unavailable", warning: "missing" };
  try {
    const costs = readPhaseCosts(costsPath);
    return { present: true, status: "available", sha256: costs.raw_sha256, rows: costs.rows.length, bytes: costs.raw_bytes };
  } catch (error) {
    return { present: false, status: "unavailable", warning: `invalid: ${error.message}` };
  }
}

function assertInstalledO1Runtime(options = {}) {
  const expectedRoot = path.resolve(options.expectedRoot || path.join(__dirname, "../.."));
  const installedRoot = path.resolve(options.installedRoot || path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "ospec-workflow"));
  for (const relative of O1_RUNTIME_FILES) {
    let expected;
    let installed;
    try { expected = fs.readFileSync(path.join(expectedRoot, relative)); }
    catch (error) { throw new Error(`O1 producer source is unavailable at ${relative}: ${error.message}`); }
    try { installed = fs.readFileSync(path.join(installedRoot, relative)); }
    catch (error) { throw new Error(`stale-o1-runtime: installed producer is unavailable at ${relative}; run npm run setup:codex before live scoring.`); }
    if (!installed.equals(expected)) {
      throw new Error(`stale-o1-runtime: installed producer differs at ${relative}; run npm run setup:codex before live scoring.`);
    }
  }
  return { installedRoot, files: [...O1_RUNTIME_FILES] };
}

function preflightInstalledSubagentStop(options = {}) {
  const installedRoot = path.resolve(options.installedRoot || path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "ospec-workflow"));
  const tempRoot = path.resolve(options.tempRoot || os.tmpdir());
  const workspaceRoot = fs.mkdtempSync(path.join(tempRoot, "ospec-o1-hook-preflight-"));
  const change = "o1-hook-preflight";
  const sessionId = `preflight-${crypto.randomUUID()}`;
  const hostRunId = crypto.randomUUID();
  const transcriptBytes = Buffer.from([
    JSON.stringify({ type: "thread.started", thread_id: sessionId }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } }),
  ].join("\n") + "\n");
  const write = (relative, content) => {
    const target = path.join(workspaceRoot, ...relative.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, { flag: "wx" });
    return target;
  };
  try {
    write("openspec/config.yaml", "schema: spec-driven\nartifact_store:\n  mode: openspec\n  backend: openspec\n");
    write(`openspec/changes/${change}/state.yaml`, `schema: ospec-change-state/v1\nchange: ${change}\nstatus: applying\nphases:\n  verify:\n    status: running\n`);
    const transcriptPath = write(".eval-capture/codex-events.jsonl", transcriptBytes);
    const agentTranscriptPath = write(".eval-capture/agent-events.jsonl", `${JSON.stringify({ type: "result", skill_resolution: "injected" })}\n`);
    const launcher = path.join(installedRoot, "scripts", "hooks", "ospec-hooks-launch.js");
    const input = {
      cwd: workspaceRoot,
      agent_type: "sdd-verify",
      session_id: sessionId,
      agent_transcript_path: agentTranscriptPath,
      status: "success",
      telemetry: { prompt: "preflight", artifact: "state", tool_output: "none", output: "success", duration_ms: 1 },
    };
    const result = spawnSync(process.execPath, [launcher, "subagent-stop"], {
      cwd: workspaceRoot,
      input: JSON.stringify(input),
      env: { ...process.env, OSPEC_TARGET: "codex", OSPEC_CODEX_WRAPPER: "1", OSPEC_CODEX_EVENTS_PATH: transcriptPath, OSPEC_BENCHMARK_RUN_ID: hostRunId },
      encoding: "utf8",
      shell: false,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) throw new Error(`installed SubagentStop launcher failed: ${result.error?.message || result.stderr || `exit ${result.status}`}`);
    const costsPath = path.join(workspaceRoot, ".ospec", "session", change, "phase-costs.jsonl");
    const costs = readPhaseCosts(costsPath, { expectedPhases: ["verify"], trustedBinding: { session_id: sessionId, transcriptBytes, hostRunId } });
    if (costs.rows.length !== 1) throw new Error(`installed SubagentStop preflight emitted ${costs.rows.length} rows instead of one.`);
    return { workspaceRoot, row: costs.rows[0], launcher };
  } catch (error) {
    throw new Error(`o1-hook-preflight failed: ${error.message}`);
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

function manifestCompletedPhases(state) {
  const completed = new Set(["success", "completed", "complete", "done", "verified", "pass", "passed"]);
  const aliases = { proposal: "propose" };
  const known = new Set(["explore", "propose", "spec", "clarify", "design", "tasks", "apply", "verify", "foundation", "baseline", "document", "onboard", "reconcile", "workspace"]);
  return Object.entries(state?.phases || {}).flatMap(([name, value]) => {
    const phase = aliases[name] || name;
    const status = typeof value === "object" && value ? String(value.status || "").toLowerCase() : "";
    return completed.has(status) && known.has(phase) ? [phase] : [];
  });
}

function assertManifestStateContract(manifest, state) {
  if (state?.route?.actual_route !== manifest.benchmark.expected_route) throw new Error("Host benchmark route mismatch with trusted profile catalog.");
  const actual = manifestCompletedPhases(state);
  const expected = manifest.benchmark.expected_phases;
  if (!Array.isArray(expected) || actual.length !== expected.length || actual.some((phase, index) => phase !== expected[index])) throw new Error(`Host benchmark phase sequence mismatch: expected ${expected?.join(",")}, got ${actual.join(",")}.`);
  const unresolved = Array.isArray(state?.assumptions) ? state.assumptions.filter((entry) => String(entry?.status || "unresolved").toLowerCase() === "unresolved") : [];
  if (unresolved.length !== manifest.benchmark.expected_assumptions) throw new Error(`Host benchmark unresolved assumptions mismatch: expected ${manifest.benchmark.expected_assumptions}, got ${unresolved.length}.`);
  if (!Array.isArray(state?.blocking_questions) || state.blocking_questions.length !== 0) throw new Error("Host benchmark requires an explicit empty blocking_questions ledger.");
  return actual;
}

function transcriptEvents(bytes) {
  return bytes.toString("utf8").split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`Host-observed transcript line ${index + 1} is invalid: ${error.message}`); }
  });
}

function safeObservedFile(workspaceRoot, relative) {
  const root = path.resolve(workspaceRoot);
  const canonicalRoot = path.resolve(fs.realpathSync(root));
  const absolute = path.resolve(root, ...relative.split("/"));
  if (!absolute.startsWith(root + path.sep)) throw new Error(`Observed path escapes workspace: ${relative}`);
  const stat = fs.lstatSync(absolute);
  const real = fs.realpathSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || !path.resolve(real).startsWith(canonicalRoot + path.sep)) throw new Error(`Observed path is redirected or not regular: ${relative}`);
  return { absolute, real: path.resolve(real), stat, bytes: fs.readFileSync(absolute) };
}

function snapshotExpectedEffects(manifest, workspaceRoot) {
  const root = path.resolve(workspaceRoot);
  const parentPaths = new Set();
  for (const relative of manifest.benchmark.expected_artifacts) {
    const absolute = path.resolve(root, ...relative.split("/"));
    if (!absolute.startsWith(root + path.sep)) throw new Error(`Expected artifact escapes workspace: ${relative}`);
    if (fs.existsSync(absolute)) throw new Error(`Expected post-exit artifact was preexisting: ${relative}`);
    let parent = path.dirname(absolute);
    while (!fs.existsSync(parent) && parent.startsWith(root + path.sep)) parent = path.dirname(parent);
    parentPaths.add(parent);
  }
  for (const relative of manifest.benchmark.created_product_files || []) {
    const absolute = path.resolve(root, ...relative.split("/"));
    if (!absolute.startsWith(root + path.sep) || fs.existsSync(absolute)) throw new Error(`Expected created product path is unsafe or preexisting: ${relative}`);
  }
  const parents = [...parentPaths].map((parent) => {
    const stat = fs.lstatSync(parent);
    const real = fs.realpathSync(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink() || path.resolve(real).toLowerCase() !== path.resolve(parent).toLowerCase()) throw new Error(`Expected artifact parent is redirected: ${parent}`);
    return { path: path.resolve(parent), dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs, real: path.resolve(real) };
  });
  const products = manifest.benchmark.product_files.map((relative) => {
    const observed = safeObservedFile(root, relative);
    return { path: relative, dev: observed.stat.dev, ino: observed.stat.ino, birthtimeMs: observed.stat.birthtimeMs, sha256: crypto.createHash("sha256").update(observed.bytes).digest("hex") };
  });
  return { workspaceRoot: root, parents, products };
}

function assertHostObservedExecution(manifest, transcriptBytes, workspaceRoot, snapshot, runStartMs, runEndMs, toleranceMs = 2000) {
  const events = transcriptEvents(transcriptBytes);
  const waitAttempts = events.flatMap((event, index) => event?.type === "item.completed" && event?.item?.type === "collab_tool_call" && event?.item?.tool === "wait" ? [{ index, status: String(event.item.status || "unknown").toLowerCase() }] : []);
  const waitIndexes = waitAttempts.filter((entry) => entry.status === "completed").map((entry) => entry.index);
  const collabCompletions = waitIndexes.map((index) => events[index]);
  const expectedReviews = manifest.benchmark.expected_reviews || 0;
  if (collabCompletions.length < manifest.benchmark.expected_phases.length + expectedReviews) throw new Error("Host-observed execution lacks sufficient completed collab dispatch/wait evidence.");
  if (!snapshot || snapshot.workspaceRoot !== path.resolve(workspaceRoot)) throw new Error("Host-observed execution requires the matching pre-spawn snapshot.");
  for (const parent of snapshot.parents) {
    const stat = fs.lstatSync(parent.path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== parent.dev || stat.ino !== parent.ino || stat.birthtimeMs !== parent.birthtimeMs || path.resolve(fs.realpathSync(parent.path)) !== parent.real) throw new Error(`Expected artifact parent identity was replaced: ${parent.path}`);
  }
  const artifacts = manifest.benchmark.expected_artifacts.map((relative) => {
    const observed = safeObservedFile(workspaceRoot, relative);
    const createdAtMs = observed.stat.birthtimeMs || observed.stat.ctimeMs;
    if (observed.bytes.length === 0) throw new Error(`Observed artifact is empty: ${relative}`);
    if (observed.stat.mtimeMs < runStartMs - toleranceMs || observed.stat.mtimeMs > runEndMs + toleranceMs) throw new Error(`Observed artifact timestamp is stale/outside run: ${relative}`);
    if (createdAtMs < runStartMs - toleranceMs || createdAtMs > runEndMs + toleranceMs) throw new Error(`Observed artifact creation is stale/outside run: ${relative}`);
    return { path: relative, mtimeMs: observed.stat.mtimeMs, createdAtMs, sha256: crypto.createHash("sha256").update(observed.bytes).digest("hex") };
  });
  const products = snapshot.products.map((before) => {
    const observed = safeObservedFile(workspaceRoot, before.path);
    const hash = crypto.createHash("sha256").update(observed.bytes).digest("hex");
    if (observed.stat.dev !== before.dev || observed.stat.ino !== before.ino || observed.stat.birthtimeMs !== before.birthtimeMs) throw new Error(`Observed product file identity was replaced: ${before.path}`);
    if (hash === before.sha256 || observed.stat.mtimeMs < runStartMs - toleranceMs || observed.stat.mtimeMs > runEndMs + toleranceMs) throw new Error(`Observed product file is unchanged or stale: ${before.path}`);
    return { path: before.path, mtimeMs: observed.stat.mtimeMs, sha256: hash };
  });
  const createdProducts = (manifest.benchmark.created_product_files || []).map((relative) => {
    const observed = safeObservedFile(workspaceRoot, relative);
    const createdAtMs = observed.stat.birthtimeMs || observed.stat.ctimeMs;
    if (observed.bytes.length === 0 || observed.stat.mtimeMs < runStartMs - toleranceMs || observed.stat.mtimeMs > runEndMs + toleranceMs || createdAtMs < runStartMs - toleranceMs || createdAtMs > runEndMs + toleranceMs) throw new Error(`Observed created product is empty or stale: ${relative}`);
    return { path: relative, mtimeMs: observed.stat.mtimeMs, createdAtMs, sha256: crypto.createHash("sha256").update(observed.bytes).digest("hex") };
  });
  const applyIndex = manifest.benchmark.expected_artifacts.findIndex((relative) => relative.endsWith("/apply-progress.md"));
  const groups = artifacts.map((entry) => entry.createdAtMs);
  if (applyIndex >= 0) groups.splice(applyIndex, 0, Math.max(...products.map((entry) => entry.mtimeMs)));
  for (let index = 1; index < groups.length; index += 1) if (groups[index] + toleranceMs < groups[index - 1]) throw new Error("Host-observed artifact group order regressed.");
  const supplemental = events.flatMap((event) => event?.type === "item.completed" && event?.item?.type === "file_change" && Array.isArray(event.item.changes) ? event.item.changes.map((change) => path.relative(workspaceRoot, path.resolve(change.path)).split(path.sep).join("/")) : []);
  const hashes = [...artifacts, ...products, ...createdProducts].map(({ path: filePath, sha256 }) => ({ path: filePath, sha256 }));
  const artifactEvidenceSha256 = crypto.createHash("sha256").update(JSON.stringify(hashes)).digest("hex");
  return { phase_evidence: "host-observed-artifacts-and-waits", threat_model: "cooperative-orchestrator", dispatch_identity_available: false, collab_completions: collabCompletions.length, dispatch_attempts: waitAttempts.length, dispatch_failures: waitAttempts.filter((entry) => ["failed", "error", "cancelled"].includes(entry.status)).length, supplemental_file_changes: supplemental, hashes, artifact_evidence_sha256: artifactEvidenceSha256 };
}

function parseReportBlock(filePath, label, schema, countKeys) {
  const text = fs.readFileSync(filePath, "utf8");
  const pattern = new RegExp("```json:" + label + "\\r?\\n([\\s\\S]*?)\\r?\\n```", "g");
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`Structured ${label} must contain exactly one canonical block.`);
  const match = matches[0];
  const suffix = text.slice(match.index + match[0].length);
  let value;
  try { value = JSON.parse(match[1]); } catch (error) { throw new Error(`Structured ${label} block is invalid: ${error.message}`); }
  if (value.schema !== schema || typeof value.outcome !== "string") throw new Error(`Structured ${label} block schema/outcome is invalid.`);
  for (const key of countKeys) if (!Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > 1_000_000) throw new Error(`Structured ${label}.${key} is out of range.`);
  const blocker = value.blocker || 0;
  if (value.outcome === "PASS" && (blocker !== 0 || value.critical !== 0 || value.warning !== 0)) throw new Error(`Structured ${label} PASS contradicts severity counts.`);
  if (value.outcome === "PASS WITH WARNINGS" && (blocker !== 0 || value.critical !== 0 || value.warning <= 0)) throw new Error(`Structured ${label} PASS WITH WARNINGS contradicts severity counts.`);
  if (value.outcome === "FAIL" && blocker + value.critical <= 0) throw new Error(`Structured ${label} FAIL requires blocker or critical findings.`);
  if (label === "ospec-benchmark-verify") assertVerifyVerdictSuffix(suffix, value.outcome);
  else if (suffix.trim()) throw new Error(`Structured ${label} must be the final report block.`);
  return value;
}

function assertVerifyVerdictSuffix(suffix, jsonOutcome) {
  if (!suffix.trim()) return true;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(suffix)) throw new Error("Structured ospec-benchmark-verify verdict suffix contains control characters.");
  const match = suffix.match(/^\s*## Verdict[ \t]*\r?\n[ \t]*\r?\n([^\r\n]+(?:\r?\n(?![ \t]*\r?\n)[^\r\n]+)*)[ \t]*(?:\r?\n)?\s*$/);
  if (!match) throw new Error("Structured ospec-benchmark-verify suffix must be exactly one anchored Verdict paragraph.");
  const paragraph = match[1];
  if (/^\s*(?:#{1,6}\s|```|~~~)/m.test(paragraph) || /[{}<>]/.test(paragraph)) throw new Error("Structured ospec-benchmark-verify verdict paragraph contains forbidden heading, fence, JSON, or HTML.");
  const outcomeMatch = paragraph.match(/^(?:\*\*(PASS WITH WARNINGS|PASS|FAIL)\*\*|(PASS WITH WARNINGS|PASS|FAIL))(?=$|[ \t]|[—–:;-])/);
  const textualOutcome = outcomeMatch?.[1] || outcomeMatch?.[2];
  if (!textualOutcome) throw new Error("Structured ospec-benchmark-verify verdict paragraph lacks a canonical textual outcome.");
  if (textualOutcome !== jsonOutcome) throw new Error(`Structured ospec-benchmark-verify verdict outcome mismatch: JSON ${jsonOutcome}, text ${textualOutcome}.`);
  return true;
}

function assertStructuredReports({ workspaceRoot, change, expectedReviews = 4 }) {
  const verify = parseReportBlock(path.join(workspaceRoot, "openspec", "changes", change, "verify-report.md"), "ospec-benchmark-verify", "ospec-benchmark-verify/v1", ["critical", "warning", "suggestion"]);
  const fourR = expectedReviews > 0
    ? parseReportBlock(path.join(workspaceRoot, "openspec", "changes", change, "4r-review-report.md"), "ospec-benchmark-4r", "ospec-benchmark-4r/v1", ["blocker", "critical", "warning", "suggestion"])
    : { schema: "ospec-benchmark-4r/v1", outcome: "NOT_RUN", blocker: 0, critical: 0, warning: 0, suggestion: 0 };
  if (verify.outcome !== "PASS" || (expectedReviews > 0 && !["PASS", "PASS WITH WARNINGS"].includes(fourR.outcome))) throw new Error("Structured verify/4R outcome is not acceptable.");
  return { verify, four_r: fourR };
}

function sealEvalCaptureDirectory(workspaceRoot) {
  const root = path.resolve(workspaceRoot);
  const canonicalRoot = path.resolve(fs.realpathSync(root));
  const target = path.join(root, ".eval-capture");
  const stat = fs.lstatSync(target);
  const real = fs.realpathSync(target);
  const canonicalTarget = path.resolve(real);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !canonicalTarget.toLowerCase().startsWith(`${canonicalRoot}${path.sep}`.toLowerCase())) throw new Error("Host evidence directory is redirected.");
  return { path: path.resolve(target), dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs, real: canonicalTarget };
}

function buildHostBenchmarkEvidence({ manifest, state, observedEffects, reports }) {
  const questions = Object.values(state?.gates || {}).reduce((sum, gate) => sum + (Number.isSafeInteger(gate?.questions_asked) && gate.questions_asked >= 0 ? gate.questions_asked : 0), 0);
  const approvalIds = (state?.approvals || []).map((entry) => entry?.id).filter((id) => typeof id === "string").sort();
  return { schema: "ospec-benchmark-evidence/v2", owner: "live-driver-post-exit", route: state.route.actual_route, final_status: state.status, phase: { expected: manifest.benchmark.expected_phases.length, dispatched: null, succeeded: null, coverage: "unknown" }, review: { expected: manifest.benchmark.expected_reviews || 0, dispatched: null, succeeded: null, coverage: "unknown" }, dispatch: { attempts: observedEffects.dispatch_attempts, failures: observedEffects.dispatch_failures, completed_waits: observedEffects.collab_completions }, questions: { count: questions, approval_ids: approvalIds }, verify: reports.verify, four_r: reports.four_r };
}

function writeHostBenchmarkEvidence(evidencePath, captureSeal, evidence) {
  verifyO1DirectorySeal([captureSeal]);
  if (fs.existsSync(evidencePath)) throw new Error("Host benchmark evidence path already exists; agent-created evidence is forbidden and never replaced.");
  const content = `${JSON.stringify(evidence, null, 2)}\n`;
  const temp = `${evidencePath}.${process.pid}.${Date.now()}.host.tmp`;
  fs.writeFileSync(temp, content, { encoding: "utf8", flag: "wx" });
  fs.renameSync(temp, evidencePath);
  const observed = safeObservedFile(path.dirname(evidencePath), path.basename(evidencePath));
  const sha256 = crypto.createHash("sha256").update(observed.bytes).digest("hex");
  return { sha256, bytes: observed.bytes.length, evidence };
}

function verifyHostBenchmarkEvidence(evidencePath, expectedSha256) {
  const bytes = fs.readFileSync(evidencePath);
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== expectedSha256) throw new Error("Host benchmark evidence mutated after publication.");
  return JSON.parse(bytes.toString("utf8"));
}

function sealO1Directory(workspaceRoot, change) {
  const root = path.resolve(workspaceRoot);
  const canonicalRoot = path.resolve(fs.realpathSync(root));
  const targets = [root, path.join(root, ".ospec"), path.join(root, ".ospec", "session"), path.join(root, ".ospec", "session", change)];
  return targets.map((target) => {
    const stat = fs.lstatSync(target);
    const real = fs.realpathSync(target);
    const canonicalTarget = path.resolve(real);
    const insideRoot = canonicalTarget.toLowerCase() === canonicalRoot.toLowerCase() || canonicalTarget.toLowerCase().startsWith(`${canonicalRoot}${path.sep}`.toLowerCase());
    if (!stat.isDirectory() || stat.isSymbolicLink() || !insideRoot) throw new Error(`O1 host-owned directory is redirected: ${target}`);
    return { path: path.resolve(target), dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs, real: canonicalTarget };
  });
}

function verifyO1DirectorySeal(seal) {
  for (const expected of seal) {
    const stat = fs.lstatSync(expected.path);
    const real = fs.realpathSync(expected.path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== expected.dev || stat.ino !== expected.ino || stat.birthtimeMs !== expected.birthtimeMs || path.resolve(real) !== expected.real) throw new Error(`O1 host-owned directory identity changed: ${expected.path}`);
  }
  return true;
}

function normalizedAssumptionText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function confirmAllowedHostAssumption({ manifest, state, workspaceRoot, observedEffects }) {
  const unresolved = Array.isArray(state?.assumptions) ? state.assumptions.filter((entry) => String(entry?.status || "unresolved").toLowerCase() === "unresolved") : [];
  if (unresolved.length === 0) return null;
  if (unresolved.length !== 1 || !observedEffects?.artifact_evidence_sha256) throw new Error("Host assumption normalization requires exactly one allowed entry after complete observed effects.");
  const entry = unresolved[0];
  const allowed = manifest.benchmark.allowed_host_assumptions;
  const match = Array.isArray(allowed) && allowed.length === 1 && allowed[0].max === 1 ? allowed[0] : null;
  const basisHash = crypto.createHash("sha256").update(normalizedAssumptionText(entry.basis)).digest("hex");
  if (!match || entry.phase !== match.phase || normalizedAssumptionText(entry.statement) !== match.statement_normalized || basisHash !== match.basis_sha256) throw new Error("Unresolved change assumption is not the exact declared host-contract legacy entry.");
  const statePath = path.join(workspaceRoot, "openspec", "changes", state.change, "state.yaml");
  const before = fs.readFileSync(statePath, "utf8");
  const lines = before.split(/\r?\n/);
  let inTarget = false;
  let replacements = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^  - id:\s*/.test(lines[index])) inTarget = lines[index].trim().slice("- id:".length).trim() === entry.id;
    else if (inTarget && /^    status:\s*unresolved\s*$/.test(lines[index])) { lines[index] = "    status: confirmed"; replacements += 1; inTarget = false; }
  }
  if (replacements !== 1) throw new Error("Host assumption normalization could not uniquely update the legacy state entry.");
  const after = lines.join("\n");
  const temp = `${statePath}.${process.pid}.${Date.now()}.host.tmp`;
  fs.writeFileSync(temp, after, { encoding: "utf8", flag: "wx" });
  fs.renameSync(temp, statePath);
  entry.status = "confirmed";
  return { code: match.code, phase: match.phase, source: "host-observed-artifacts-and-waits", state_sha256_before: crypto.createHash("sha256").update(before).digest("hex"), state_sha256_after: crypto.createHash("sha256").update(after).digest("hex"), approval_created: false };
}

function mintScoringCapability({ workspaceRoot, transcriptPath, transcript, cliVersion, kind, hostControl, o1Sha256, now = Date.now(), ttlMs = DEFAULT_CAPABILITY_TTL_MS }) {
  if (!transcript || typeof transcript.session_id !== "string" || !/^[a-f0-9]{64}$/.test(transcript.sha256 || "")) {
    throw new Error("Verified transcript identity is required before capability creation.");
  }
  if (kind === "live" && (!hostControl || typeof hostControl.runId !== "string")) {
    throw new Error("Productive capability requires a host run id.");
  }
  const capability = Object.freeze(Object.create(null));
  CAPABILITIES.set(capability, {
    workspaceRoot: path.resolve(workspaceRoot),
    transcriptPath: path.resolve(transcriptPath),
    sessionId: transcript.session_id,
    transcriptSha256: transcript.sha256,
    cliVersion,
    hostRunId: hostControl?.runId,
    o1Sha256,
    kind,
    expiresAt: now + ttlMs,
    consumed: false,
  });
  return capability;
}

function authorizeBenchmarkScoring(capability, expected) {
  const grant = capability && CAPABILITIES.get(capability);
  if (!grant) throw new Error("A valid in-memory scoring capability is required.");
  if (grant.consumed) throw new Error("Scoring capability was already consumed.");
  if ((expected.now ?? Date.now()) > grant.expiresAt) throw new Error("Scoring capability expired.");
  if (grant.kind === "test" && expected.allowTestCapability !== true) throw new Error("Test capability cannot authorize productive scoring.");
  if (path.resolve(expected.workspaceRoot) !== grant.workspaceRoot) throw new Error("Scoring capability workspace mismatch.");
  if (path.resolve(expected.transcriptPath) !== grant.transcriptPath) throw new Error("Scoring capability transcript path mismatch.");
  if (expected.sessionId !== grant.sessionId) throw new Error("Scoring capability session mismatch.");
  if (expected.transcriptSha256 !== grant.transcriptSha256) throw new Error("Scoring capability transcript hash mismatch.");
  if (expected.cliVersion !== grant.cliVersion) throw new Error("Scoring capability CLI version mismatch.");
  if (grant.hostRunId !== undefined && expected.hostRunId !== grant.hostRunId) throw new Error("Scoring capability host run mismatch.");
  if (grant.o1Sha256 !== undefined && expected.o1Sha256 !== grant.o1Sha256) throw new Error("Scoring capability raw O1 mismatch.");
  grant.consumed = true;
  return { session_id: grant.sessionId, transcript_sha256: grant.transcriptSha256, hostRunId: grant.hostRunId, o1Sha256: grant.o1Sha256 };
}

function preflightHostBinding(bindings, trustedBinding) {
  if (!Array.isArray(bindings) || bindings.length === 0) throw new Error("unsupported-host-binding: no O1 bindings were emitted.");
  try {
    const rows = bindings[0]?.host_binding ? bindings : bindings.map((host_binding, index) => ({ phase: `row-${index + 1}`, host_binding }));
    verifyPhaseCostBindings(rows, trustedBinding);
  } catch {
    throw new Error("unsupported-host-binding: SubagentStop cannot bind every O1 row to authoritative codex-events bytes.");
  }
  return { session_id: trustedBinding.session_id };
}

function executedPhasesFromState(state) {
  const phases = state?.phases;
  if (!phases || typeof phases !== "object" || Array.isArray(phases)) throw new Error("Benchmark state lacks phase evidence for O1 reconciliation.");
  return Object.entries(phases).flatMap(([phase, value]) => {
    const status = typeof value === "object" && value ? String(value.status || "").toLowerCase() : "";
    return ["", "pending", "not-started", "not_started", "skipped"].includes(status) ? [] : [phase];
  });
}

function scoreAuthorizedBenchmarkWorkspace({ capability, name, manifest, workspaceRoot, trustedCliVersion, transcriptBytes, supplementaryO1, durationMs, allowTestCapability = false, now }) {
  const evidence = resolveBenchmarkEvidencePaths(workspaceRoot, manifest.benchmark.change);
  if (!Buffer.isBuffer(transcriptBytes)) throw new Error("Scoring requires a sealed transcript.");
  const transcript = parseCodexTranscript(transcriptBytes);
  const o1Sha256 = supplementaryO1?.present ? supplementaryO1.sha256 : undefined;
  const trustedBinding = authorizeBenchmarkScoring(capability, {
    workspaceRoot,
    transcriptPath: evidence.transcriptPath,
    sessionId: transcript.session_id,
    transcriptSha256: transcript.sha256,
    cliVersion: trustedCliVersion,
    hostRunId: CAPABILITIES.get(capability)?.hostRunId,
    o1Sha256,
    allowTestCapability,
    now,
  });
  const observation = loadBenchmarkObservation(evidence.observationPath);
  const captured = captureWorkspace(workspaceRoot);
  verifyBenchmarkProvenance({ provenance: observation.provenance, transcriptPath: evidence.transcriptPath, transcriptBytes, trustedCliVersion });
  assertManifestStateContract(manifest, captured.state);
  const result = assertScenario(manifest.expect, captured);
  const nativeO1 = supplementaryO1?.present ? { present: true, sha256: supplementaryO1.sha256, rows: supplementaryO1.rows } : supplementaryO1;
  const row = buildRunBenchmarkRow({ profile: name, route: resolveActualRoute(captured.state) || manifest.benchmark.expected_route, transcript, durationMs, observation, nativeO1 });
  if (!fs.readFileSync(evidence.transcriptPath).equals(transcriptBytes)) throw new Error("codex transcript mutated after descriptor sealing.");
  if (supplementaryO1?.present && sha256(fs.readFileSync(evidence.costsPath)) !== supplementaryO1.sha256) throw new Error("supplementary O1 mutated during scoring.");
  return { name, manifest, captured, result, row, transcript };
}

function buildLivePrompt(profile, manifest) {
  return [
    "Act as the sdd-orchestrator for this benchmark fixture and execute the real workflow with sub-agents.",
    `Benchmark profile: ${profile}`,
    `Change: ${manifest.benchmark.change}`,
    `Expected route: ${manifest.benchmark.expected_route}`,
    "Execution mode is automatic and delivery strategy is exception-ok; these choices are explicit for this run.",
    `Run through sdd-verify${manifest.benchmark.expected_reviews ? " and the configured review gate" : ""}, but do not archive or publish a release.`,
    `User command: ${manifest.input.command || "(plain chat)"}`,
    `User request: ${manifest.input.text}`,
    "Use filesystem OpenSpec artifacts as source of truth. Do not simulate, fabricate, replay, or manually invent any phase result.",
    `The completed active state must remain at openspec/changes/${manifest.benchmark.change}/state.yaml with status: verified.`,
    `Do not create or repair .ospec/session/${manifest.benchmark.change}/phase-costs.jsonl. Native hooks may emit supplementary O1; run-level scoring does not require it.`,
    "You MUST NOT create or edit .eval-capture/benchmark-evidence.json; it is exclusively derived and written by the host driver after exit.",
    "Write workflow state and reports before returning. Do not write .eval-capture/benchmark.json or .eval-capture/done.json; the host driver owns those transactional outputs.",
    "If the workflow cannot complete, return the concrete blocker and leave benchmark.pending.json/benchmark.json/done.json absent rather than filling evidence.",
  ].join("\n");
}

function finalizeLiveObservation(observationPath, transcriptPath, cliVersion, completedAt = new Date().toISOString(), finalPath = observationPath, options = {}) {
  let observed;
  try { observed = JSON.parse(fs.readFileSync(observationPath, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") throw new Error(`Live session did not write benchmark.json at ${observationPath}.`);
    throw new Error(`Live benchmark.json is invalid: ${error.message}`);
  }
  if (options.expectedObservation && JSON.stringify(observed) !== JSON.stringify(options.expectedObservation)) throw new Error("Pending benchmark observation does not match host-derived evidence.");
  const transcriptBytes = options.transcriptBytes || fs.readFileSync(transcriptPath);
  const transcript = parseCodexTranscript(transcriptBytes);
  const finalized = {
    questions_asked: observed.questions_asked,
    defects: observed.defects,
    provenance: {
      driver: "codex-exec",
      cli_version: cliVersion,
      session_id: transcript.session_id,
      transcript_sha256: transcript.sha256,
      completed_at: completedAt,
      ...(options.artifactEvidenceSha256 ? { artifact_evidence_sha256: options.artifactEvidenceSha256 } : {}),
      ...(options.hostAssumptionConfirmation ? { host_assumption_confirmation: options.hostAssumptionConfirmation } : {}),
      ...(options.benchmarkEvidenceSha256 ? { benchmark_evidence_sha256: options.benchmarkEvidenceSha256 } : {}),
    },
  };
  publishBaselineAtomic(finalPath, `${JSON.stringify(finalized, null, 2)}\n`);
  const observation = loadBenchmarkObservation(finalPath);
  verifyBenchmarkProvenance({ provenance: observation.provenance, transcriptPath, transcriptBytes, trustedCliVersion: cliVersion });
  return finalized;
}

function sameIdentity(left, right) {
  const sameDevice = left.dev === right.dev || left.dev === 0 || right.dev === 0;
  return sameDevice && left.ino === right.ino && left.birthtimeMs === right.birthtimeMs;
}

function readDescriptorBytes(fd, size) {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const count = fs.readSync(fd, bytes, offset, size - offset, offset);
    if (count === 0) throw new Error("Transcript descriptor ended before its sealed size.");
    offset += count;
  }
  return bytes;
}

function createHostControl() {
  return { runId: crypto.randomUUID() };
}

function runCommandWithTranscript({ command, args, cwd, transcriptPath, env = {}, hostControl }) {
  if (!hostControl || typeof hostControl.runId !== "string") throw new Error("Host run identity is required.");
  fs.mkdirSync(path.dirname(transcriptPath), { recursive: true });
  const parentInfo = fs.lstatSync(path.dirname(transcriptPath));
  if (parentInfo.isSymbolicLink()) throw new Error("Transcript parent is a symlink/reparse point.");
  const transcriptFd = fs.openSync(transcriptPath, "wx+");
  try {
    const openedIdentity = fs.fstatSync(transcriptFd);
    const result = spawnSync(command, args, {
      cwd,
      env: { ...process.env, ...env, OSPEC_CODEX_EVENTS_PATH: path.resolve(transcriptPath), OSPEC_BENCHMARK_RUN_ID: hostControl.runId },
      encoding: "utf8",
      shell: false,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", transcriptFd, "pipe"],
    });
    fs.fsyncSync(transcriptFd);
    const sealedIdentity = fs.fstatSync(transcriptFd);
    const pathIdentity = fs.lstatSync(transcriptPath);
    if (pathIdentity.isSymbolicLink() || !sameIdentity(openedIdentity, sealedIdentity) || !sameIdentity(sealedIdentity, pathIdentity)) throw new Error("Transcript path was replaced; descriptor identity no longer matches.");
    const transcriptBytes = readDescriptorBytes(transcriptFd, sealedIdentity.size);
    if (!fs.readFileSync(transcriptPath).equals(transcriptBytes)) throw new Error("Transcript path was replaced; retained bytes differ from the sealed descriptor.");
    return { ...result, transcriptBytes, transcriptIdentity: { dev: sealedIdentity.dev, ino: sealedIdentity.ino, birthtimeMs: sealedIdentity.birthtimeMs, size: sealedIdentity.size } };
  } finally {
    fs.closeSync(transcriptFd);
  }
}

function deriveHostObservation({ captured, evidencePath, evidence: suppliedEvidence }) {
  let evidence = suppliedEvidence;
  try { if (!evidence) evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8")); }
  catch (error) { throw new Error(`Structured benchmark evidence is missing or invalid: ${error.message}`); }
  if (evidence?.schema !== "ospec-benchmark-evidence/v2" || evidence.owner !== "live-driver-post-exit") throw new Error("Structured benchmark evidence has an unsupported or non-host-owned schema.");
  const questions = Object.values(captured?.state?.gates || {}).reduce((sum, gate) => sum + (Number.isInteger(gate?.questions_asked) && gate.questions_asked >= 0 ? gate.questions_asked : 0), 0);
  const approvalIds = (captured?.state?.approvals || []).map((entry) => entry?.id).filter((id) => typeof id === "string").sort();
  const suppliedApprovalIds = Array.isArray(evidence?.questions?.approval_ids) ? [...evidence.questions.approval_ids].sort() : null;
  if (evidence?.questions?.count !== questions) throw new Error("questions count mismatch with state gate ledger.");
  if (!suppliedApprovalIds || approvalIds.length !== suppliedApprovalIds.length || approvalIds.some((id, index) => id !== suppliedApprovalIds[index])) throw new Error("approval id set mismatch with state ledger.");
  const verify = Object.fromEntries(["critical", "warning", "suggestion"].map((key) => [key, evidence?.verify?.[key]]));
  const four_r = Object.fromEntries(["blocker", "critical", "warning", "suggestion"].map((key) => [key, evidence?.four_r?.[key]]));
  for (const [label, value] of Object.entries({ ...verify, ...four_r })) if (!Number.isInteger(value) || value < 0) throw new Error(`Structured benchmark evidence contains invalid numeric field ${label}.`);
  const derived = { questions_asked: questions, defects: { verify, four_r } };
  return derived;
}

function resolveLiveCodexInvocation(workspaceRoot, prompt, remoteModelIdentity, remoteReasoningEffort, deps = {}) {
  const model = normalizeRemoteModelIdentity(remoteModelIdentity);
  const effort = normalizeRemoteReasoningEffort(remoteReasoningEffort);
  const resolve = deps.resolveCodexLauncher || resolveCodexLauncher;
  const trustedPath = path.resolve(workspaceRoot).split(path.sep).join("/").replaceAll('"', '\\"');
  return resolve(["exec", "--ephemeral", "--skip-git-repo-check", "-c", `projects."${trustedPath}".trust_level="trusted"`, "-c", `model_reasoning_effort="${effort}"`, "-C", workspaceRoot, "--model", model, "--json", prompt]);
}

function offlineCodexVersion() {
  const invocation = resolveCodexLauncher([]);
  const scriptPath = invocation.args.find((value) => /[\\/]bin[\\/]codex\.js$/i.test(String(value)));
  if (!scriptPath) throw new Error("Offline recovery could not locate the installed Codex package descriptor.");
  const packagePath = path.join(path.dirname(path.dirname(path.resolve(scriptPath))), "package.json");
  const descriptor = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (descriptor.name !== "@openai/codex" || !/^\d+\.\d+\.\d+$/.test(descriptor.version || "")) throw new Error("Offline recovery found an invalid Codex package descriptor.");
  return `codex-cli ${descriptor.version}`;
}

function assertRecoveryWorkspaceRoot(profile, workspaceRoot) {
  if (typeof workspaceRoot !== "string" || !path.isAbsolute(workspaceRoot)) throw new Error("Recovery workspace path must be absolute.");
  const root = path.resolve(workspaceRoot);
  const temp = path.resolve(fs.realpathSync(os.tmpdir()));
  const canonicalRoot = path.resolve(fs.realpathSync(root));
  if (!canonicalRoot.startsWith(`${temp}${path.sep}`) || !path.basename(canonicalRoot).startsWith(`ospec-safe-${profile}-`)) throw new Error("Recovery workspace path must be the matching synthetic profile under the system temporary root.");
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Recovery workspace path is redirected or not a regular directory.");
  return root;
}

function runRecoveryGit(workspaceRoot, args, options = {}) {
  const encoding = Object.prototype.hasOwnProperty.call(options, "encoding") ? options.encoding : "utf8";
  const result = spawnSync("git", args, { cwd: workspaceRoot, encoding, shell: false, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Recovery git ${args[0]} failed: ${result.error?.message || result.stderr?.toString().trim()}`);
  return result.stdout;
}

function recoverSyntheticGitSeal(workspaceRoot, manifest) {
  const commitCount = String(runRecoveryGit(workspaceRoot, ["rev-list", "--count", "HEAD"])).trim();
  if (commitCount !== "1") throw new Error("Recovery requires the untouched single-commit synthetic Git baseline.");
  const initialCommit = String(runRecoveryGit(workspaceRoot, ["rev-parse", "HEAD"])).trim();
  const tracked = String(runRecoveryGit(workspaceRoot, ["ls-tree", "-r", "--name-only", "HEAD"])).split(/\r?\n/).filter(Boolean).sort();
  const expected = manifest.files.map((entry) => entry.path).sort();
  if (canonicalJson(tracked) !== canonicalJson(expected)) throw new Error("Recovery synthetic Git baseline file set does not match the trusted profile manifest.");
  for (const declaration of manifest.files) {
    const bytes = runRecoveryGit(workspaceRoot, ["show", `HEAD:${declaration.path}`], { encoding: null });
    if (!Buffer.isBuffer(bytes) || bytes.length !== declaration.bytes || sha256(bytes) !== declaration.sha256) throw new Error(`Recovery synthetic Git baseline content mismatch: ${declaration.path}`);
  }
  return { initialized: true, initial_commit: initialCommit };
}

function assertRecoveredHostExecution(manifest, transcriptBytes, workspaceRoot, transcriptStat, toleranceMs = 2000) {
  const events = transcriptEvents(transcriptBytes);
  const waits = events.flatMap((event, index) => event?.type === "item.completed" && event?.item?.type === "collab_tool_call" && event?.item?.tool === "wait" ? [{ index, status: String(event.item.status || "unknown").toLowerCase() }] : []);
  const completed = waits.filter((entry) => entry.status === "completed");
  if (completed.length < manifest.benchmark.expected_phases.length + (manifest.benchmark.expected_reviews || 0)) throw new Error("Recovered transcript lacks sufficient completed collab dispatch/wait evidence.");
  const startedAt = transcriptStat.birthtimeMs || transcriptStat.ctimeMs;
  const endedAt = transcriptStat.mtimeMs;
  const observe = (relative, requireCreated = true) => {
    const file = safeObservedFile(workspaceRoot, relative);
    if (file.bytes.length === 0 || file.stat.mtimeMs < startedAt - toleranceMs || file.stat.mtimeMs > endedAt + toleranceMs) throw new Error(`Recovered artifact is empty or outside transcript lifetime: ${relative}`);
    const createdAtMs = file.stat.birthtimeMs || file.stat.ctimeMs;
    if (requireCreated && (createdAtMs < startedAt - toleranceMs || createdAtMs > endedAt + toleranceMs)) throw new Error(`Recovered artifact creation is outside transcript lifetime: ${relative}`);
    return { path: relative, mtimeMs: file.stat.mtimeMs, createdAtMs, sha256: sha256(file.bytes) };
  };
  const artifacts = manifest.benchmark.expected_artifacts.map(observe);
  const products = manifest.benchmark.product_files.map((relative) => {
    const current = observe(relative, false);
    const original = runRecoveryGit(workspaceRoot, ["show", `HEAD:${relative}`], { encoding: null });
    if (sha256(original) === current.sha256) throw new Error(`Recovered product file is unchanged: ${relative}`);
    return current;
  });
  const createdProducts = (manifest.benchmark.created_product_files || []).map(observe);
  const applyIndex = manifest.benchmark.expected_artifacts.findIndex((relative) => relative.endsWith("/apply-progress.md"));
  const groups = artifacts.map((entry) => entry.createdAtMs);
  if (applyIndex >= 0 && products.length) groups.splice(applyIndex, 0, Math.max(...products.map((entry) => entry.mtimeMs)));
  for (let index = 1; index < groups.length; index += 1) if (groups[index] + toleranceMs < groups[index - 1]) throw new Error("Recovered artifact group order regressed.");
  const hashes = [...artifacts, ...products, ...createdProducts].map(({ path: filePath, sha256: digest }) => ({ path: filePath, sha256: digest }));
  return {
    phase_evidence: "recovered-host-observed-artifacts-and-waits",
    threat_model: "cooperative-orchestrator",
    dispatch_identity_available: false,
    collab_completions: completed.length,
    dispatch_attempts: waits.length,
    dispatch_failures: waits.filter((entry) => ["failed", "error", "cancelled"].includes(entry.status)).length,
    supplemental_file_changes: [],
    hashes,
    artifact_evidence_sha256: sha256(JSON.stringify(hashes)),
  };
}

function recoverWorkspaceWithContext(profile, workspaceRoot, executionContext, options = {}) {
  resolveBenchmarkNames(profile);
  const root = assertRecoveryWorkspaceRoot(profile, workspaceRoot);
  const remoteModelIdentity = normalizeRemoteModelIdentity(executionContext?.remoteModelIdentity);
  const remoteReasoningEffort = normalizeRemoteReasoningEffort(executionContext?.remoteReasoningEffort);
  if (typeof executionContext?.installedRuntimeIdentity !== "string" || executionContext.installedRuntimeIdentity.trim().length === 0) throw new Error("Installed runtime identity is required for offline recovery.");
  const installedRuntimeIdentity = executionContext.installedRuntimeIdentity.trim();
  const exportManifest = buildSafeExportManifest(profile);
  const manifest = scenarioFor(profile);
  manifest.benchmark.synthetic_git = recoverSyntheticGitSeal(root, exportManifest);
  const captureSeal = sealEvalCaptureDirectory(root);
  const evidence = resolveBenchmarkEvidencePaths(root, manifest.benchmark.change);
  if (fs.existsSync(evidence.observationPath) || fs.existsSync(path.join(root, ".eval-capture", "benchmark-evidence.json")) || fs.existsSync(path.join(root, ".eval-capture", "done.json"))) throw new Error("Recovery refuses a workspace with preexisting host completion outputs.");
  verifySafeExportFile(root, exportManifest, ".eval-capture/benchmark.pending.json");
  const transcriptFile = safeObservedFile(root, ".eval-capture/codex-events.jsonl");
  const transcriptBytes = transcriptFile.bytes;
  const transcript = parseCodexTranscript(transcriptBytes);
  const captured = captureWorkspace(root);
  const structural = assertScenario(manifest.expect, captured);
  if (!structural.pass) throw new Error(`Recovered benchmark structural evidence is incomplete: ${structural.failures.join("; ")}`);
  assertPostRunGitOutcome(root, manifest);
  const observedEffects = assertRecoveredHostExecution(manifest, transcriptBytes, root, transcriptFile.stat);
  const reports = assertStructuredReports({ workspaceRoot: root, change: manifest.benchmark.change, expectedReviews: manifest.benchmark.expected_reviews });
  const hostAssumptionConfirmation = confirmAllowedHostAssumption({ manifest, state: captured.state, workspaceRoot: root, observedEffects });
  assertManifestStateContract(manifest, captured.state);
  const hostEvidence = buildHostBenchmarkEvidence({ manifest, state: captured.state, observedEffects, reports });
  const evidencePublication = writeHostBenchmarkEvidence(path.join(root, ".eval-capture", "benchmark-evidence.json"), captureSeal, hostEvidence);
  const hostObservation = deriveHostObservation({ captured, evidence: hostEvidence });
  publishBaselineAtomic(evidence.pendingObservationPath, `${JSON.stringify(hostObservation, null, 2)}\n`);
  const version = options.cliVersion || offlineCodexVersion();
  finalizeLiveObservation(evidence.pendingObservationPath, evidence.transcriptPath, version, new Date().toISOString(), evidence.observationPath, { transcriptBytes, expectedObservation: hostObservation, artifactEvidenceSha256: observedEffects.artifact_evidence_sha256, hostAssumptionConfirmation, benchmarkEvidenceSha256: evidencePublication.sha256 });
  const supplementaryO1 = readSupplementaryO1(evidence.costsPath);
  const capability = mintScoringCapability({ workspaceRoot: root, transcriptPath: evidence.transcriptPath, transcript, cliVersion: version, kind: "recovery", o1Sha256: supplementaryO1.present ? supplementaryO1.sha256 : undefined });
  const durationMs = Math.max(1, Math.round(transcriptFile.stat.mtimeMs - (transcriptFile.stat.birthtimeMs || transcriptFile.stat.ctimeMs)));
  const scored = scoreAuthorizedBenchmarkWorkspace({ capability, name: profile, manifest, workspaceRoot: root, trustedCliVersion: version, transcriptBytes, supplementaryO1, durationMs });
  if (!scored.result.pass) throw new Error(`Recovered benchmark ${profile} failed structural scoring: ${scored.result.failures.join("; ")}`);
  publishBaselineAtomic(path.join(root, ".eval-capture", "done.json"), `${JSON.stringify({ completed_at: new Date().toISOString(), session_id: transcript.session_id, recovered_offline: true }, null, 2)}\n`);
  const sealedResult = { profile, workspaceRoot: root, version, transcript, transcriptBytes, observation: loadBenchmarkObservation(evidence.observationPath), durationMs, route: scored.row.route, row: scored.row };
  SEALED_PROFILE_RESULTS.add(sealedResult);
  const descriptor = buildCompatibilityDescriptor(profile, {
    cliVersion: version,
    gitRevision: options.gitRevision || resolveGitRevision(),
    runtimeHashes: options.runtimeHashes,
    workingTreeIdentity: options.workingTreeIdentity,
    installedRuntimeIdentity,
    remoteModelIdentity,
    remoteReasoningEffort,
  });
  const cachePath = persistProfileResult(options.cacheRoot || DEFAULT_RESULT_CACHE, descriptor, sealedResult);
  return { profile, row: scored.row, cachePath, transcript_sha256: transcript.sha256, session_id: transcript.session_id, network_used: false, spawned_model_process: false };
}

function recoverWorkspace(profile, workspaceRoot) {
  if (arguments.length !== 2) throw new Error("recoverWorkspace accepts only profile and absolute workspace path.");
  return recoverWorkspaceWithContext(profile, workspaceRoot, resolveProductiveExecutionContext());
}

function runLiveProfileWithContext(profile, executionContext) {
  resolveBenchmarkNames(profile);
  const exported = materializeSafeExport(profile);
  const manifest = exported.scenario;
  const workspaceRoot = exported.workspaceRoot;
  const captureSeal = sealEvalCaptureDirectory(workspaceRoot);
  const evidence = resolveBenchmarkEvidencePaths(workspaceRoot, manifest.benchmark.change);
  if (fs.existsSync(evidence.observationPath.replace(/benchmark\.json$/, "benchmark-evidence.json"))) throw new Error("Host benchmark evidence must be absent before live spawn.");
  const effectSnapshot = snapshotExpectedEffects(manifest, workspaceRoot);
  const captureDir = path.join(workspaceRoot, ".eval-capture");
  const donePath = path.join(captureDir, "done.json");
  const transcriptPath = evidence.transcriptPath;
  const version = codexVersion();
  const prompt = exported.prompt;
  const hostControl = createHostControl();
  validateExportWorkspace(workspaceRoot, exported.manifest);
  process.stderr.write(`SAFE_EXPORT_MANIFEST ${JSON.stringify({ ...exported.manifest, workspace_root: workspaceRoot, network_used: false, spawned: false })}\n`);
  const invocation = resolveLiveCodexInvocation(workspaceRoot, prompt, executionContext.remoteModelIdentity, executionContext.remoteReasoningEffort);
  const runStartMs = Date.now();
  const runStarted = process.hrtime.bigint();
  const result = runCommandWithTranscript({
    command: invocation.command,
    args: invocation.args,
    cwd: workspaceRoot,
    transcriptPath,
    hostControl,
  });
  const runEndMs = Date.now();
  const hostDurationMs = Math.max(1, Number((process.hrtime.bigint() - runStarted) / 1_000_000n));
  fs.rmSync(donePath, { force: true });
  if (result.error || result.status !== 0) {
    const detail = result.error ? result.error.message : (result.stderr || "").trim().slice(0, 2000);
    throw new Error(`codex exec failed for ${profile} (exit ${result.status}): ${detail}`);
  }
  verifySafeExportFile(workspaceRoot, exported.manifest, ".eval-capture/benchmark.pending.json");
  const transcriptBytes = result.transcriptBytes;
  const transcript = parseCodexTranscript(transcriptBytes);
  const captured = captureWorkspace(workspaceRoot);
  const structural = assertScenario(manifest.expect, captured);
  if (!structural.pass) throw new Error(`Live benchmark structural evidence is incomplete: ${structural.failures.join("; ")}`);
  assertPostRunGitOutcome(workspaceRoot, manifest);
  const observedEffects = assertHostObservedExecution(manifest, transcriptBytes, workspaceRoot, effectSnapshot, runStartMs, runEndMs);
  const reports = assertStructuredReports({ workspaceRoot, change: manifest.benchmark.change, expectedReviews: manifest.benchmark.expected_reviews });
  const hostAssumptionConfirmation = confirmAllowedHostAssumption({ manifest, state: captured.state, workspaceRoot, observedEffects });
  assertManifestStateContract(manifest, captured.state);
  const hostEvidence = buildHostBenchmarkEvidence({ manifest, state: captured.state, observedEffects, reports });
  const evidencePublication = writeHostBenchmarkEvidence(path.join(captureDir, "benchmark-evidence.json"), captureSeal, hostEvidence);
  const hostObservation = deriveHostObservation({ captured, evidence: hostEvidence });
  publishBaselineAtomic(evidence.pendingObservationPath, `${JSON.stringify(hostObservation, null, 2)}\n`);
  finalizeLiveObservation(evidence.pendingObservationPath, transcriptPath, version, new Date().toISOString(), evidence.observationPath, { transcriptBytes, expectedObservation: hostObservation, artifactEvidenceSha256: observedEffects.artifact_evidence_sha256, hostAssumptionConfirmation, benchmarkEvidenceSha256: evidencePublication.sha256 });
  const supplementaryO1 = readSupplementaryO1(evidence.costsPath);
  const o1Sha256 = supplementaryO1.present ? supplementaryO1.sha256 : undefined;
  const capability = mintScoringCapability({ workspaceRoot, transcriptPath, transcript, cliVersion: version, kind: "live", hostControl, o1Sha256 });
  const scored = scoreAuthorizedBenchmarkWorkspace({ capability, name: profile, manifest, workspaceRoot, trustedCliVersion: version, transcriptBytes, supplementaryO1, durationMs: hostDurationMs });
  if (!scored.result.pass) throw new Error(`Live benchmark ${profile} failed structural scoring: ${scored.result.failures.join("; ")}`);
  publishBaselineAtomic(donePath, `${JSON.stringify({ completed_at: new Date().toISOString(), session_id: transcript.session_id }, null, 2)}\n`);
  const sealedResult = { profile, workspaceRoot, version, transcript, transcriptBytes, observation: loadBenchmarkObservation(evidence.observationPath), durationMs: hostDurationMs, route: scored.row.route, row: scored.row };
  SEALED_PROFILE_RESULTS.add(sealedResult);
  return sealedResult;
}

function runLiveProfile(profile) {
  if (arguments.length !== 1) throw new Error("runLiveProfile does not accept execution-context injection.");
  return runLiveProfileWithContext(profile, resolveProductiveExecutionContext());
}

function resolveSuiteSelection(selection = "all") {
  if (typeof selection !== "string" || !["all", "initial", "extended"].includes(selection)) throw new Error("Benchmark suite selection must be all, initial, or extended.");
  return resolveBenchmarkNames(selection);
}

function runLiveSuite(selection = "all") {
  if (arguments.length > 1) throw new Error("runLiveSuite does not accept dependency or execution-context injection.");
  const names = resolveSuiteSelection(selection);
  const executionContext = resolveProductiveExecutionContext();
  const reportPath = path.join(__dirname, "reports", "reference-baseline.md");
  if (!names.includes("docs-one-file")) throw new Error("Benchmark suite must include docs-one-file as its canary.");
  const ordered = ["docs-one-file", ...names.filter((name) => name !== "docs-one-file")];
  const cliVersion = codexVersion();
  const gitRevision = resolveGitRevision();
  const sealedResults = ordered.map((name) => {
    const descriptor = buildCompatibilityDescriptor(name, { cliVersion, gitRevision, installedRuntimeIdentity: executionContext.installedRuntimeIdentity, remoteModelIdentity: executionContext.remoteModelIdentity, remoteReasoningEffort: executionContext.remoteReasoningEffort });
    const cached = loadCompatibleProfileResult(DEFAULT_RESULT_CACHE, descriptor);
    if (cached.hit) return cached.result;
    const fresh = runLiveProfileWithContext(name, executionContext);
    persistProfileResult(DEFAULT_RESULT_CACHE, descriptor, fresh);
    return fresh;
  });
  if (sealedResults.some((result, index) => (!result.reused && !SEALED_PROFILE_RESULTS.has(result)) || result.profile !== ordered[index])) throw new Error("Productive benchmark result is not sealed by a live capability or compatible resume record.");
  const rows = sealedResults.map((result) => result.row);
  const markdown = renderBaseline(rows, { expectedProfiles: names, generatedAt: new Date().toISOString(), gitRevision });
  publishBaselineAtomic(reportPath, markdown);
  return { profiles: ordered, rows, reportPath };
}

function main() {
  if (process.argv[2] === "--recover-workspace") {
    const profile = process.argv[3];
    const workspaceRoot = process.argv[4];
    if (!profile || !workspaceRoot || process.argv.length !== 5) throw new Error("Usage: node scripts/evals/live-driver.js --recover-workspace <single-profile> <absolute-workspace>");
    process.stdout.write(`${JSON.stringify(recoverWorkspace(profile, workspaceRoot))}\n`);
    return;
  }
  if (process.argv[2] === "--dry-run-export-manifest") {
    const profile = process.argv[3];
    if (!profile) throw new Error("Usage: node scripts/evals/live-driver.js --dry-run-export-manifest <single-profile>");
    resolveBenchmarkNames(profile);
    process.stdout.write(`${JSON.stringify({ ...buildSafeExportManifest(profile), network_used: false, spawned: false, workspace_root_policy: "fresh os.tmpdir mkdtemp outside checkout" })}\n`);
    return;
  }
  const profile = process.argv[2];
  if (!profile) throw new Error("Usage: node scripts/evals/live-driver.js <single-profile|all|initial|extended>");
  const result = ["all", "initial", "extended"].includes(profile) ? runLiveSuite(profile) : runLiveProfile(profile);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildLivePrompt,
  parseCodexTranscript,
  finalizeLiveObservation,
  runLiveProfile,
  runLiveSuite,
  recoverWorkspace,
  runCommandWithTranscript,
  deriveHostObservation,
  resolveLiveCodexInvocation,
  assertInstalledO1Runtime,
  preflightInstalledSubagentStop,
  assertManifestStateContract,
  assertHostObservedExecution,
  assertStructuredReports,
  sealEvalCaptureDirectory,
  buildHostBenchmarkEvidence,
  writeHostBenchmarkEvidence,
  verifyHostBenchmarkEvidence,
  sealO1Directory,
  verifyO1DirectorySeal,
  snapshotExpectedEffects,
  confirmAllowedHostAssumption,
  authorizeBenchmarkScoring,
  preflightHostBinding,
  buildCompatibilityDescriptor,
  persistProfileResult,
  loadCompatibleProfileResult,
  resolveSuiteSelection,
  readSupplementaryO1,
  hashRuntimeSurface,
  workingTreeIdentity,
  testing: {
    resolveExecutionContext(options, deps) {
      return resolveProductiveExecutionContext(options, deps);
    },
    createTestScoringCapability(options) {
      return mintScoringCapability({ ...options, kind: "test" });
    },
    scoreAuthorizedBenchmarkWorkspace(options) {
      return scoreAuthorizedBenchmarkWorkspace({ ...options, allowTestCapability: true });
    },
    assertPostRunGitOutcome(workspaceRoot, manifest) {
      return assertPostRunGitOutcome(workspaceRoot, manifest);
    },
    assertVerifyVerdictSuffix(suffix, outcome) {
      return assertVerifyVerdictSuffix(suffix, outcome);
    },
    recoverWorkspace(profile, workspaceRoot, options) {
      return recoverWorkspaceWithContext(profile, workspaceRoot, options.executionContext, options);
    },
  },
};
