"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const { buildRunBenchmarkRow, verifyRowAttestation } = require("./lib/benchmark.js");
const { materializeSafeExport } = require("./safe-export.js");

const {
  buildLivePrompt,
  parseCodexTranscript,
  finalizeLiveObservation,
  authorizeBenchmarkScoring,
  preflightHostBinding,
  runCommandWithTranscript,
  runLiveProfile,
  runLiveSuite,
  deriveHostObservation,
  resolveLiveCodexInvocation,
  assertInstalledO1Runtime,
  preflightInstalledSubagentStop,
  sealEvalCaptureDirectory,
  assertStructuredReports,
  verifyHostBenchmarkEvidence,
  snapshotExpectedEffects,
  testing,
  buildCompatibilityDescriptor,
  persistProfileResult,
  loadCompatibleProfileResult,
  resolveSuiteSelection,
  readSupplementaryO1,
} = require("./live-driver.js");

function writeRecoveryFile(root, relative, content) {
  const target = path.join(root, ...relative.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

function completedRecoveryFixture(t) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-recovery-fixture-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const exported = materializeSafeExport("docs-one-file", { tempRoot });
  const root = exported.workspaceRoot;
  fs.writeFileSync(path.join(root, "README.md"), "# Example\n\nUpdated wording.\n");
  writeRecoveryFile(root, "openspec/changes/update-readme/proposal-lite.md", "# Proposal\n\nUpdate the wording.\n");
  writeRecoveryFile(root, "openspec/changes/update-readme/tasks.md", "# Tasks\n\n- [x] Update README.\n");
  writeRecoveryFile(root, "openspec/changes/update-readme/apply-progress.md", "# Apply progress\n\nREADME updated and checked.\n");
  writeRecoveryFile(root, "openspec/changes/update-readme/verify-report.md", [
    "# Verify report", "", "PASS", "", "```json:ospec-benchmark-verify",
    JSON.stringify({ schema: "ospec-benchmark-verify/v1", outcome: "PASS", critical: 0, warning: 0, suggestion: 0 }),
    "```", "",
  ].join("\n"));
  writeRecoveryFile(root, "openspec/changes/update-readme/state.yaml", [
    "change: update-readme", "status: verified", "route:", "  actual_route: lite", "phases:",
    "  propose:", "    status: done", "  tasks:", "    status: done", "  apply:", "    status: done", "  verify:", "    status: done",
    "assumptions: []", "blocking_questions: []", "approvals: []", "gates: {}", "",
  ].join("\n"));
  writeRecoveryFile(root, ".ospec/cache/skill-registry.cache.json", "{}\n");
  writeRecoveryFile(root, ".ospec/session/latest.md", "# Session\n");
  const events = [
    { type: "thread.started", thread_id: "recovery-session" },
    ...Array.from({ length: 4 }, (_, index) => ({ type: "item.completed", item: { id: `wait-${index}`, type: "collab_tool_call", tool: "wait", status: "completed" } })),
    { type: "turn.completed", usage: { input_tokens: 20, cached_input_tokens: 10, output_tokens: 5, reasoning_output_tokens: 2 } },
  ];
  writeRecoveryFile(root, ".eval-capture/codex-events.jsonl", `${events.map(JSON.stringify).join("\n")}\n`);
  return exported;
}

function verifyReportFixture(t, suffix, outcome = "PASS") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-verify-suffix-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const change = "verify-suffix";
  const report = [
    "# Verify report", "", "Evidence complete.", "", "```json:ospec-benchmark-verify",
    JSON.stringify({ schema: "ospec-benchmark-verify/v1", outcome, critical: outcome === "FAIL" ? 1 : 0, warning: outcome === "PASS WITH WARNINGS" ? 1 : 0, suggestion: 0 }),
    "```", suffix,
  ].join("\n");
  writeRecoveryFile(root, `openspec/changes/${change}/verify-report.md`, report);
  return { root, change };
}

test("live preflight rejects a stale installed O1 producer before spawn", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "o1-runtime-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const expectedRoot = path.join(root, "expected");
  const installedRoot = path.join(root, "installed");
  for (const relative of ["scripts/hooks/ospec-hooks-launch.js", "scripts/hooks/subagent-stop.js", "scripts/lib/ospec-state.js"]) {
    fs.mkdirSync(path.dirname(path.join(expectedRoot, relative)), { recursive: true });
    fs.mkdirSync(path.dirname(path.join(installedRoot, relative)), { recursive: true });
    fs.writeFileSync(path.join(expectedRoot, relative), `current ${relative}\n`);
    fs.writeFileSync(path.join(installedRoot, relative), `current ${relative}\n`);
  }
  assert.doesNotThrow(() => assertInstalledO1Runtime({ expectedRoot, installedRoot }));
  fs.writeFileSync(path.join(installedRoot, "scripts/hooks/subagent-stop.js"), "stale\n");
  assert.throws(() => assertInstalledO1Runtime({ expectedRoot, installedRoot }), /stale-o1-runtime.*setup:codex/i);
});

test("live invocation preserves arguments supplied by the safe launcher", () => {
  const workspaceRoot = path.join(os.tmpdir(), "safe-workspace");
  const trustedPath = path.resolve(workspaceRoot).split(path.sep).join("/").replaceAll('"', '\\"');
  const invocation = resolveLiveCodexInvocation(workspaceRoot, "fixed prompt", "gpt-5.6-luna", " low ", {
    resolveCodexLauncher: (args) => ({ command: "node.exe", args: ["codex.js", ...args] }),
  });
  assert.deepEqual(invocation, {
    command: "node.exe",
    args: ["codex.js", "exec", "--ephemeral", "--skip-git-repo-check", "-c", `projects."${trustedPath}".trust_level="trusted"`, "-c", 'model_reasoning_effort="low"', "-C", workspaceRoot, "--model", "gpt-5.6-luna", "--json", "fixed prompt"],
  });
  const other = resolveLiveCodexInvocation(workspaceRoot, "fixed prompt", "gpt-5.6-luna", "high", {
    resolveCodexLauncher: (args) => ({ command: "node.exe", args }),
  });
  assert.equal(other.args[other.args.indexOf("--model") + 1], "gpt-5.6-luna");
  assert.equal(other.args[other.args.lastIndexOf("-c") + 1], 'model_reasoning_effort="high"');
  assert.throws(() => resolveLiveCodexInvocation(workspaceRoot, "fixed prompt", "  ", "low", { resolveCodexLauncher: () => ({}) }), /model.*required|blank/i);
  assert.throws(() => resolveLiveCodexInvocation(workspaceRoot, "fixed prompt", "gpt-5.6-luna", "", { resolveCodexLauncher: () => ({}) }), /reasoning effort.*required|blank/i);
  assert.throws(() => resolveLiveCodexInvocation(workspaceRoot, "fixed prompt", "gpt-5.6-luna", "max", { resolveCodexLauncher: () => ({}) }), /unsupported.*reasoning effort/i);
});

test("productive execution context derives installed identity and seals the causal model", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-runtime-identity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const installedRoot = path.join(root, "installed");
  const files = ["scripts/hooks/ospec-hooks-launch.js", "scripts/hooks/subagent-stop.js", "scripts/lib/ospec-state.js"];
  for (const relative of files) {
    fs.mkdirSync(path.dirname(path.join(installedRoot, relative)), { recursive: true });
    fs.writeFileSync(path.join(installedRoot, relative), `same:${relative}\n`);
  }
  const calls = [];
  const deps = {
    assertRuntime: () => { calls.push("assert"); return { installedRoot, files }; },
    preflight: () => { calls.push("preflight"); return { row: { phase: "verify" } }; },
  };
  const first = testing.resolveExecutionContext({ remoteModelIdentity: " gpt-5.6-luna ", remoteReasoningEffort: " low " }, deps);
  const second = testing.resolveExecutionContext({ remoteModelIdentity: "gpt-5.6-luna", remoteReasoningEffort: "low" }, deps);
  assert.equal(first.remoteModelIdentity, "gpt-5.6-luna");
  assert.equal(first.remoteReasoningEffort, "low");
  assert.match(first.installedRuntimeIdentity, /^[a-f0-9]{64}$/);
  assert.equal(first.installedRuntimeIdentity, second.installedRuntimeIdentity);
  fs.writeFileSync(path.join(installedRoot, files[1]), "different\n");
  const changed = testing.resolveExecutionContext({ remoteModelIdentity: "gpt-5.6-luna", remoteReasoningEffort: "low" }, deps);
  assert.notEqual(changed.installedRuntimeIdentity, first.installedRuntimeIdentity);
  assert.deepEqual(calls.slice(0, 2), ["assert", "preflight"]);
  assert.equal(Object.isFrozen(first), true);
});

test("execution context rejects blank model, forged installed env, stale runtime and preflight failure", () => {
  const previous = process.env.OSPEC_INSTALLED_RUNTIME_IDENTITY;
  process.env.OSPEC_INSTALLED_RUNTIME_IDENTITY = "forged-installed-label";
  try {
    const descriptor = buildCompatibilityDescriptor("docs-one-file", { cliVersion: "cli", gitRevision: "git", runtimeHashes: { one: "a" }, remoteModelIdentity: "gpt-5.6-luna", remoteReasoningEffort: "low" });
    assert.equal(descriptor.installed_runtime_identity, "unknown");
    assert.throws(() => testing.resolveExecutionContext({ remoteModelIdentity: "  ", remoteReasoningEffort: "low" }, {}), /model.*required|blank/i);
    assert.throws(() => testing.resolveExecutionContext({ remoteModelIdentity: "gpt-5.6-luna" }, { assertRuntime() { throw new Error("must not run"); } }), /reasoning effort.*required|blank/i);
    assert.throws(() => testing.resolveExecutionContext({ remoteModelIdentity: "gpt-5.6-luna", remoteReasoningEffort: "max" }, { assertRuntime() { throw new Error("must not run"); } }), /unsupported.*reasoning effort/i);
    assert.throws(() => testing.resolveExecutionContext({ remoteModelIdentity: "gpt-5.6-luna", remoteReasoningEffort: "low" }, { assertRuntime() { throw new Error("stale-o1-runtime"); }, preflight() { throw new Error("must not run"); } }), /stale-o1-runtime/i);
    assert.throws(() => testing.resolveExecutionContext({ remoteModelIdentity: "gpt-5.6-luna", remoteReasoningEffort: "low" }, { assertRuntime() { return { installedRoot: "unused", files: [] }; }, preflight() { throw new Error("preflight rejected"); } }), /preflight rejected/i);
  } finally {
    if (previous === undefined) delete process.env.OSPEC_INSTALLED_RUNTIME_IDENTITY;
    else process.env.OSPEC_INSTALLED_RUNTIME_IDENTITY = previous;
  }
});

test("installed SubagentStop preflight persists one bound canonical O1 row and cleans up", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "o1-hook-preflight-test-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const result = preflightInstalledSubagentStop({ installedRoot: path.resolve(__dirname, "../.."), tempRoot });
  assert.equal(result.row.phase, "verify");
  assert.equal(result.row.agent, "sdd-verify");
  assert.equal(result.row.host_binding.status, "supported-observable-binding");
  assert.equal(fs.existsSync(result.workspaceRoot), false);
});

test("buildLivePrompt carries the manifest intent and transaction boundary", () => {
  const prompt = buildLivePrompt("docs-one-file", {
    input: { command: "/sdd-new update-readme", text: "Actualiza README." },
    benchmark: { change: "update-readme", expected_route: "lite" },
  });

  assert.match(prompt, /\/sdd-new update-readme/);
  assert.match(prompt, /Actualiza README\./);
  assert.match(prompt, /Do not write .*done\.json/i);
  assert.match(prompt, /phase-costs\.jsonl/);
  assert.match(prompt, /benchmark\.json/);
});

function capabilityFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-live-capability-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const transcriptPath = path.join(root, "codex-events.jsonl");
  const raw = [
    JSON.stringify({ type: "thread.started", thread_id: "session-live" }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 2, output_tokens: 1 } }),
  ].join("\n") + "\n";
  fs.writeFileSync(transcriptPath, raw);
  const transcript = parseCodexTranscript(raw);
  return { root, transcriptPath, transcript };
}

test("scoring capability is opaque, workspace-bound, single-use and expiring", (t) => {
  const fixture = capabilityFixture(t);
  const capability = testing.createTestScoringCapability({
    workspaceRoot: fixture.root,
    transcriptPath: fixture.transcriptPath,
    transcript: fixture.transcript,
    cliVersion: "codex-cli 0.144.1",
    now: 100,
    ttlMs: 50,
  });

  assert.deepEqual(Object.keys(capability), []);
  assert.throws(() => authorizeBenchmarkScoring(JSON.parse(JSON.stringify(capability)), { workspaceRoot: fixture.root, transcriptPath: fixture.transcriptPath, sessionId: "session-live", transcriptSha256: fixture.transcript.sha256, cliVersion: "codex-cli 0.144.1", now: 101, allowTestCapability: true }), /capability/i);
  assert.throws(() => authorizeBenchmarkScoring(capability, { workspaceRoot: path.join(fixture.root, "other"), transcriptPath: fixture.transcriptPath, sessionId: "session-live", transcriptSha256: fixture.transcript.sha256, cliVersion: "codex-cli 0.144.1", now: 101, allowTestCapability: true }), /workspace.*mismatch/i);
  authorizeBenchmarkScoring(capability, { workspaceRoot: fixture.root, transcriptPath: fixture.transcriptPath, sessionId: "session-live", transcriptSha256: fixture.transcript.sha256, cliVersion: "codex-cli 0.144.1", now: 101, allowTestCapability: true });
  assert.throws(() => authorizeBenchmarkScoring(capability, { workspaceRoot: fixture.root, transcriptPath: fixture.transcriptPath, sessionId: "session-live", transcriptSha256: fixture.transcript.sha256, cliVersion: "codex-cli 0.144.1", now: 102, allowTestCapability: true }), /consumed/i);

  const expired = testing.createTestScoringCapability({ workspaceRoot: fixture.root, transcriptPath: fixture.transcriptPath, transcript: fixture.transcript, cliVersion: "codex-cli 0.144.1", now: 100, ttlMs: 1 });
  assert.throws(() => authorizeBenchmarkScoring(expired, { workspaceRoot: fixture.root, transcriptPath: fixture.transcriptPath, sessionId: "session-live", transcriptSha256: fixture.transcript.sha256, cliVersion: "codex-cli 0.144.1", now: 102, allowTestCapability: true }), /expired/i);
});

test("productive authorization rejects explicitly labelled test capabilities", (t) => {
  const fixture = capabilityFixture(t);
  const capability = testing.createTestScoringCapability({ workspaceRoot: fixture.root, transcriptPath: fixture.transcriptPath, transcript: fixture.transcript, cliVersion: "codex-cli 0.144.1" });
  assert.throws(() => authorizeBenchmarkScoring(capability, { workspaceRoot: fixture.root, transcriptPath: fixture.transcriptPath, sessionId: "session-live", transcriptSha256: fixture.transcript.sha256, cliVersion: "codex-cli 0.144.1" }), /test capability.*productive/i);
});

test("host-binding preflight fails closed when O1 is tied only to agent transcripts", () => {
  const transcriptBytes = Buffer.from(`${JSON.stringify({ type: "thread.started", thread_id: "session-live" })}\n`);
  const binding = { session_id: "session-live", transcript_sha256: "b".repeat(64), transcript_source: "agent-transcript" };
  assert.throws(() => preflightHostBinding([binding], { session_id: "session-live", transcriptBytes }), /unsupported-host-binding/i);
});

test("runCommandWithTranscript exposes the exact root stream path while the child is running", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-live-stream-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const transcriptPath = path.join(root, ".eval-capture", "codex-events.jsonl");
  const script = [
    "const fs = require('node:fs');",
    "const p = process.env.OSPEC_CODEX_EVENTS_PATH;",
    "process.stdout.write(JSON.stringify({type:'thread.started',thread_id:'stream-session'}) + '\\n');",
    "if (!fs.readFileSync(p, 'utf8').includes('thread.started')) process.exit(9);",
    "process.stdout.write(JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}) + '\\n');",
  ].join("");

  const result = runCommandWithTranscript({ command: process.execPath, args: ["-e", script], cwd: root, transcriptPath, hostControl: { runId: "run-test", secret: "11".repeat(32) } });

  assert.equal(result.status, 0);
  assert.match(result.transcriptBytes.toString("utf8"), /turn\.completed/);
  assert.match(fs.readFileSync(transcriptPath, "utf8"), /turn\.completed/);
});

test("runCommandWithTranscript rejects replacement of the authenticated path while fd remains open", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-live-stream-swap-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const transcriptPath = path.join(root, ".eval-capture", "codex-events.jsonl");
  const script = [
    "const fs = require('node:fs');",
    "const p = process.env.OSPEC_CODEX_EVENTS_PATH;",
    "process.stdout.write(JSON.stringify({type:'thread.started',thread_id:'stream-session'}) + '\\n');",
    "fs.renameSync(p, p + '.swapped'); fs.writeFileSync(p, JSON.stringify({type:'thread.started',thread_id:'forged'}) + '\\n');",
  ].join("");
  assert.throws(() => runCommandWithTranscript({ command: process.execPath, args: ["-e", script], cwd: root, transcriptPath, hostControl: { runId: "run-test", secret: "11".repeat(32) } }), /replaced|identity/i);
});

test("production module exposes no writable synthetic publisher", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-live-suite-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const reportPath = path.join(root, "reference-baseline.md");
  const names = ["small-feature", "docs-one-file", "small-bugfix"];
  assert.equal(testing.publishRowsForTest, undefined);
  assert.equal(fs.existsSync(reportPath), false);
});

test("productive runLiveSuite rejects callback injection and does not publish synthetic rows", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-live-suite-fail-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const reportPath = path.join(root, "reference-baseline.md");
  assert.throws(() => runLiveSuite({ runProfile() { return { row: {} }; }, reportPath }), /selection|does not accept injected/i);
  assert.throws(() => runLiveSuite("all", { resolveExecutionContext() {} }), /does not accept.*injection/i);
  assert.throws(() => runLiveProfile("docs-one-file", { remoteModelIdentity: "forged" }), /does not accept.*injection/i);
  assert.equal(fs.existsSync(reportPath), false);
});

test("accepted profile cache resumes only an exact compatible sealed result", (t) => {
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-profile-cache-"));
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));
  const descriptor = buildCompatibilityDescriptor("docs-one-file", { cliVersion: "codex-cli 1.2.3", gitRevision: "abc123", runtimeHashes: { driver: "a".repeat(64) }, installedRuntimeIdentity: "runtime-1", remoteModelIdentity: "gpt-5.6-luna", remoteReasoningEffort: "low" });
  const transcriptBytes = Buffer.from(`${JSON.stringify({ type: "thread.started", thread_id: "cache-old" })}\n${JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 2 } })}\n`);
  const observation = { questions_asked: 0, verify_defects: 0, four_r_defects: 0, defects_total: 0 };
  const result = { profile: "docs-one-file", row: { profile: "docs-one-file", route: "lite", measurement_scope: "run", phase_attribution: "none", token_source: "terminal-turn-usage", total_tokens: 12, input_tokens: 10, output_tokens: 2, duration_ms: 3, subagent_coverage: "unknown", invocations: null, relaunches: null, model_tiers: [], native_o1: { present: false }, questions_asked: 0, verify_defects: 0, four_r_defects: 0, defects_total: 0 }, transcript: parseCodexTranscript(transcriptBytes), transcriptBytes, observation, durationMs: 3, route: "lite" };
  persistProfileResult(cacheRoot, descriptor, result);
  assert.deepEqual(loadCompatibleProfileResult(cacheRoot, descriptor), { hit: true, result: { profile: "docs-one-file", row: result.row, transcript: parseCodexTranscript(transcriptBytes), transcriptBytes, reused: true } });
  assert.equal(loadCompatibleProfileResult(cacheRoot, { ...descriptor, cli_version: "codex-cli 1.2.4" }).hit, false);
  assert.equal(loadCompatibleProfileResult(cacheRoot, { ...descriptor, remote_reasoning_effort: "high" }).hit, false);
  assert.deepEqual(loadCompatibleProfileResult(cacheRoot, { ...descriptor, remote_reasoning_effort: "unknown", compatibility_strength: "limited" }), { hit: false, reason: "unknown-identity" });
  assert.equal(loadCompatibleProfileResult(cacheRoot, { ...descriptor, git_revision: "different" }).hit, false);
  assert.equal(loadCompatibleProfileResult(cacheRoot, { ...descriptor, prompt_sha256: "c".repeat(64) }).hit, false);
});

test("suite selection supports productive core and extended sets", () => {
  assert.deepEqual(resolveSuiteSelection("all"), ["docs-one-file", "small-bugfix", "security-sensitive-change"]);
  assert.deepEqual(resolveSuiteSelection("initial"), ["docs-one-file", "small-bugfix", "security-sensitive-change"]);
  assert.equal(resolveSuiteSelection("extended").length, 9);
  assert.throws(() => resolveSuiteSelection({}), /selection/i);
});

test("cache refuses unknown identity and preserves valid supplementary O1 on known identity", (t) => {
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-profile-cache-evidence-"));
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));
  const transcriptBytes = Buffer.from(`${JSON.stringify({ type: "thread.started", thread_id: "cache-session" })}\n${JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 2 } })}\n`);
  const limited = buildCompatibilityDescriptor("docs-one-file", { cliVersion: "codex-cli 1.2.3", gitRevision: "abc", runtimeHashes: { driver: "a".repeat(64) }, workingTreeIdentity: "dirty-a" });
  assert.equal(limited.compatibility_strength, "limited");
  const observation = { questions_asked: 0, verify_defects: 0, four_r_defects: 0, defects_total: 0 };
  const row = buildRunBenchmarkRow({ profile: "docs-one-file", route: "lite", transcript: parseCodexTranscript(transcriptBytes), durationMs: 3, observation, nativeO1: { present: true, status: "observed", sha256: "b".repeat(64), rows: 2 } });
  persistProfileResult(cacheRoot, limited, { profile: "docs-one-file", row, transcript: parseCodexTranscript(transcriptBytes), transcriptBytes, observation, durationMs: 3, route: "lite" });
  assert.deepEqual(loadCompatibleProfileResult(cacheRoot, limited), { hit: false, reason: "unknown-identity" });
  const descriptor = { ...limited, installed_runtime_identity: "runtime-1", remote_model_identity: "model-1", remote_reasoning_effort: "low", compatibility_strength: "strong" };
  persistProfileResult(cacheRoot, descriptor, { profile: "docs-one-file", row, transcript: parseCodexTranscript(transcriptBytes), transcriptBytes, observation, durationMs: 3, route: "lite" });
  assert.deepEqual(loadCompatibleProfileResult(cacheRoot, descriptor).result.row.native_o1, row.native_o1);
  assert.equal(loadCompatibleProfileResult(cacheRoot, { ...descriptor, remote_model_identity: "model-2" }).hit, false);
  const file = path.join(cacheRoot, "docs-one-file", "result.json");
  const tampered = JSON.parse(fs.readFileSync(file, "utf8"));
  tampered.row.total_tokens = 99;
  fs.writeFileSync(file, JSON.stringify(tampered));
  assert.equal(loadCompatibleProfileResult(cacheRoot, descriptor).hit, false);
  assert.equal(loadCompatibleProfileResult(cacheRoot, { ...descriptor, working_tree_identity: "dirty-b" }).hit, false);
});

test("invalid supplementary O1 degrades without blocking run-level scoring", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-o1-supplementary-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "phase-costs.jsonl");
  assert.deepEqual(readSupplementaryO1(file), { present: false, status: "unavailable", warning: "missing" });
  for (const value of ["{bad}\n", "{}\n", "{}"] ) {
    fs.writeFileSync(file, value);
    const result = readSupplementaryO1(file);
    assert.equal(result.present, false);
    assert.equal(result.status, "unavailable");
    assert.match(result.warning, /invalid/i);
  }
});

test("verify report accepts one canonical block followed only by the anchored verdict grammar", (t) => {
  const fixture = verifyReportFixture(t, "\n## Verdict\n\n**PASS** — evidence-backed final verdict.\n");
  assert.equal(assertStructuredReports({ workspaceRoot: fixture.root, change: fixture.change, expectedReviews: 0 }).verify.outcome, "PASS");
  assert.equal(testing.assertVerifyVerdictSuffix("\n## Verdict\n\n**PASS WITH WARNINGS** — accepted warnings.\n", "PASS WITH WARNINGS"), true);
  assert.equal(testing.assertVerifyVerdictSuffix("\n## Verdict\n\nFAIL — rejected evidence.\n", "FAIL"), true);
});

test("verify report verdict suffix rejects mismatch, extra structures, controls, second paragraph and duplicate block", (t) => {
  const cases = [
    ["outcome mismatch", "\n## Verdict\n\n**FAIL** — contradicts JSON.\n"],
    ["extra heading", "\n## Verdict\n\n**PASS** — accepted.\n\n## Extra\n"],
    ["fence posterior", "\n## Verdict\n\n**PASS** — accepted.\n\n```text\nextra\n```\n"],
    ["JSON posterior", "\n## Verdict\n\n**PASS** — accepted.\n\n{\"extra\":true}\n"],
    ["HTML posterior", "\n## Verdict\n\n**PASS** — accepted <aside>hidden</aside>.\n"],
    ["control char", "\n## Verdict\n\n**PASS** — accepted.\u0007\n"],
    ["second paragraph", "\n## Verdict\n\n**PASS** — first paragraph.\n\nSecond paragraph.\n"],
    ["duplicate block", `\n## Verdict\n\n**PASS** — accepted.\n\n\`\`\`json:ospec-benchmark-verify\n${JSON.stringify({ schema: "ospec-benchmark-verify/v1", outcome: "PASS", critical: 0, warning: 0, suggestion: 0 })}\n\`\`\`\n`],
  ];
  for (const [name, suffix] of cases) {
    const fixture = verifyReportFixture(t, suffix);
    assert.throws(() => assertStructuredReports({ workspaceRoot: fixture.root, change: fixture.change, expectedReviews: 0 }), /structured|suffix|verdict|outcome|report block/i, name);
  }
});

test("post-run git allowlist accepts only regular runtime-owned evidence and still rejects arbitrary untracked or symlink paths", (t) => {
  const exported = completedRecoveryFixture(t);
  assert.doesNotThrow(() => testing.assertPostRunGitOutcome(exported.workspaceRoot, exported.scenario));

  fs.writeFileSync(path.join(exported.workspaceRoot, "arbitrary.txt"), "forbidden\n");
  assert.throws(() => testing.assertPostRunGitOutcome(exported.workspaceRoot, exported.scenario), /untracked allowlist.*arbitrary\.txt/i);
  fs.rmSync(path.join(exported.workspaceRoot, "arbitrary.txt"));

  const target = path.join(exported.workspaceRoot, "README.md");
  const link = path.join(exported.workspaceRoot, "redirected-runtime");
  try {
    fs.symlinkSync(target, link, "file");
    assert.throws(() => testing.assertPostRunGitOutcome(exported.workspaceRoot, exported.scenario), /untracked allowlist|symlink|redirected/i);
  } catch (error) {
    if (!fs.existsSync(link) && /privilege|operation not permitted|EPERM/i.test(String(error.message))) t.diagnostic("symlink triangulation unavailable on this host");
    else throw error;
  }
});

test("offline recovery replays completed host post-exit validation and persists only a compatible cache result", (t) => {
  const exported = completedRecoveryFixture(t);
  const base = Date.now();
  fs.utimesSync(path.join(exported.workspaceRoot, "openspec/changes/update-readme/tasks.md"), new Date(base + 10_000), new Date(base + 10_000));
  fs.utimesSync(path.join(exported.workspaceRoot, ".eval-capture/codex-events.jsonl"), new Date(base + 20_000), new Date(base + 20_000));
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-recovery-cache-"));
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));
  const context = { remoteModelIdentity: "model-recovery", remoteReasoningEffort: "low", installedRuntimeIdentity: "runtime-recovery" };
  const recovered = testing.recoverWorkspace("docs-one-file", exported.workspaceRoot, {
    executionContext: context,
    cacheRoot,
    cliVersion: "codex-cli 0.144.1",
    gitRevision: "recovery-git",
    runtimeHashes: { driver: "a".repeat(64) },
    workingTreeIdentity: "recovery-tree",
  });

  assert.equal(recovered.profile, "docs-one-file");
  assert.equal(recovered.row.total_tokens, 25);
  assert.equal(recovered.row.verify_defects, 0);
  assert.equal(recovered.network_used, false);
  assert.equal(recovered.spawned_model_process, false);
  assert.equal(fs.existsSync(path.join(cacheRoot, "docs-one-file", "result.json")), true);
  assert.equal(fs.existsSync(path.join(exported.workspaceRoot, ".eval-capture", "benchmark.json")), true);
  assert.equal(fs.existsSync(path.join(exported.workspaceRoot, ".eval-capture", "done.json")), true);
});

test("offline recovery fails closed for unsafe roots, profile mismatch, missing identity and incomplete or tampered transcript", (t) => {
  const options = {
    executionContext: { remoteModelIdentity: "model-recovery", remoteReasoningEffort: "low", installedRuntimeIdentity: "runtime-recovery" },
    cacheRoot: fs.mkdtempSync(path.join(os.tmpdir(), "ospec-recovery-reject-cache-")),
    cliVersion: "codex-cli 0.144.1",
    gitRevision: "recovery-git",
    runtimeHashes: { driver: "a".repeat(64) },
    workingTreeIdentity: "recovery-tree",
  };
  t.after(() => fs.rmSync(options.cacheRoot, { recursive: true, force: true }));
  assert.throws(() => testing.recoverWorkspace("docs-one-file", path.resolve(__dirname), options), /temporary|fixture|workspace path/i);

  const mismatch = completedRecoveryFixture(t);
  assert.throws(() => testing.recoverWorkspace("small-bugfix", mismatch.workspaceRoot, options), /profile|workspace name|manifest/i);

  const missingIdentity = completedRecoveryFixture(t);
  assert.throws(() => testing.recoverWorkspace("docs-one-file", missingIdentity.workspaceRoot, { ...options, executionContext: { remoteModelIdentity: "", remoteReasoningEffort: "low", installedRuntimeIdentity: "runtime" } }), /model.*identity|required|blank/i);
  assert.throws(() => testing.recoverWorkspace("docs-one-file", missingIdentity.workspaceRoot, { ...options, executionContext: { remoteModelIdentity: "model", remoteReasoningEffort: "", installedRuntimeIdentity: "runtime" } }), /reasoning effort.*required|blank/i);
  assert.throws(() => testing.recoverWorkspace("docs-one-file", missingIdentity.workspaceRoot, { ...options, executionContext: { remoteModelIdentity: "model", remoteReasoningEffort: "low", installedRuntimeIdentity: "" } }), /runtime.*identity|required|blank/i);

  const incomplete = completedRecoveryFixture(t);
  fs.writeFileSync(path.join(incomplete.workspaceRoot, ".eval-capture", "codex-events.jsonl"), `${JSON.stringify({ type: "thread.started", thread_id: "incomplete" })}\n`);
  assert.throws(() => testing.recoverWorkspace("docs-one-file", incomplete.workspaceRoot, options), /turn\.completed|transcript/i);

  const tampered = completedRecoveryFixture(t);
  fs.appendFileSync(path.join(tampered.workspaceRoot, ".eval-capture", "codex-events.jsonl"), "{tampered}\n");
  assert.throws(() => testing.recoverWorkspace("docs-one-file", tampered.workspaceRoot, options), /valid JSONL|invalid|transcript/i);
});

test("weighted post-exit O1 fallback is not importable or present in production source", () => {
  assert.equal(require("./live-driver.js").materializeHostOwnedO1Fallback, undefined);
  const source = fs.readFileSync(path.join(__dirname, "live-driver.js"), "utf8");
  assert.doesNotMatch(source, /HOST_PHASE_WEIGHTS|weightedTotals|materializeHostOwnedO1Fallback|host-total-weighted-heuristic/);
});

test("deriveHostObservation consumes deterministic structured evidence and rejects missing/mismatched sets", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-live-observation-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const evidencePath = path.join(root, "benchmark-evidence.json");
  const v2 = { schema: "ospec-benchmark-evidence/v2", owner: "live-driver-post-exit", questions: { count: 1, approval_ids: ["a"] }, verify: { critical: 0, warning: 1, suggestion: 0 }, four_r: { blocker: 0, critical: 0, warning: 0, suggestion: 0 } };
  fs.writeFileSync(evidencePath, JSON.stringify(v2));
  const captured = { state: { gates: { clarify: { questions_asked: 1 } }, approvals: [{ id: "a" }] } };
  const pending = { questions_asked: 1, defects: { verify: { critical: 0, warning: 1, suggestion: 0 }, four_r: { blocker: 0, critical: 0, warning: 0, suggestion: 0 } } };
  assert.deepEqual(deriveHostObservation({ captured, evidencePath }), pending);
  fs.writeFileSync(evidencePath, JSON.stringify({ ...v2, questions: { count: 1, approval_ids: ["other"] } }));
  assert.throws(() => deriveHostObservation({ captured, evidencePath }), /approval.*mismatch/i);
  fs.writeFileSync(evidencePath, JSON.stringify({ ...v2, schema: "ospec-benchmark-evidence/v1" }));
  assert.throws(() => deriveHostObservation({ captured, evidencePath }), /unsupported|non-host-owned/i);
  assert.throws(() => deriveHostObservation({ captured, evidencePath: path.join(root, "missing.json") }), /structured benchmark evidence/i);
});

test("parseCodexTranscript requires real JSONL session and usage evidence", () => {
  const transcript = [
    JSON.stringify({ type: "thread.started", thread_id: "019f-real-session" }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 123, output_tokens: 45 } }),
  ].join("\n") + "\n";
  const parsed = parseCodexTranscript(transcript);

  assert.equal(parsed.session_id, "019f-real-session");
  assert.equal(parsed.usage.input_tokens, 123);
  assert.match(parsed.sha256, /^[a-f0-9]{64}$/);
  assert.throws(() => parseCodexTranscript("not-json\n"), /valid JSONL/i);
  assert.throws(
    () => parseCodexTranscript(JSON.stringify({ type: "thread.started", thread_id: "only-thread" })),
    /turn\.completed/i,
  );
});

test("finalizeLiveObservation derives provenance from the transcript and preserves observed counters", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-live-finalize-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const observationPath = path.join(root, "benchmark.json");
  fs.writeFileSync(observationPath, JSON.stringify({
    questions_asked: 1,
    defects: {
      verify: { critical: 0, warning: 1, suggestion: 0 },
      four_r: { blocker: 0, critical: 0, warning: 0, suggestion: 2 },
    },
  }));
  const rawTranscript = [
    JSON.stringify({ type: "thread.started", thread_id: "019f-real-session" }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 123, output_tokens: 45 } }),
  ].join("\n") + "\n";
  const transcriptPath = path.join(root, "codex-events.jsonl");
  fs.writeFileSync(transcriptPath, rawTranscript);
  const transcript = parseCodexTranscript(rawTranscript);

  const finalized = finalizeLiveObservation(observationPath, transcriptPath, "codex-cli 0.144.1", "2026-07-12T18:00:00.000Z");

  assert.equal(finalized.questions_asked, 1);
  assert.equal(finalized.defects.four_r.suggestion, 2);
  assert.deepEqual(finalized.provenance, {
    driver: "codex-exec",
    cli_version: "codex-cli 0.144.1",
    session_id: "019f-real-session",
    transcript_sha256: transcript.sha256,
    completed_at: "2026-07-12T18:00:00.000Z",
  });
});
