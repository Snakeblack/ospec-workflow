"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const r = require("./lib/strict-tdd-evidence-remediation.js");
const rawDigest = value => `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
const canonicalJson = value => JSON.stringify((function sort(input) {
  if (Array.isArray(input)) return input.map(sort);
  if (input && typeof input === "object" && !Buffer.isBuffer(input)) return Object.fromEntries(Object.keys(input).sort().map(key => [key, sort(input[key])]));
  return input;
})(value));
const clone = value => JSON.parse(JSON.stringify(value));

test("legacy exception retirement keeps only generic runtime evidence APIs", t => {
  const forbidden = [
    "evaluateLegacyEvidenceException",
    "finalizeLegacyEvidenceException",
    "runLegacyEvidenceExceptionFlow"
  ];
  const forbiddenExports = Object.keys(r).filter(name =>
    forbidden.includes(name) || name.startsWith("LEGACY_EXCEPTION_")
  );
  assert.deepEqual(forbiddenExports, [], `legacy exception exports remain: ${forbiddenExports.join(", ")}`);
  assert.equal(
    fs.existsSync(path.join(__dirname, "lib", "legacy-evidence-exception-flow.js")),
    false,
    "legacy exception flow module must be removed"
  );
  for (const name of ["persistRuntimeReceipt", "authenticateRuntimeReceipt", "validateEvidenceRecord"]) {
    assert.equal(typeof r[name], "function", `${name} must remain exported`);
  }

  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "strict-tdd-confinement-"));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(rootDir, "safe"), { recursive: true });
  fs.writeFileSync(path.join(rootDir, "safe", "receipt.json"), "{}\n");
  assert.equal(r.confinedExistingPath(rootDir, "safe/receipt.json", { file: true }).relative, "safe/receipt.json");
  assert.equal(r.confinedExistingPath(rootDir, "../receipt.json", { file: true }), null);
  assert.equal(r.confinedExistingPath(rootDir, path.join(rootDir, "safe", "receipt.json"), { file: true }), null);
});

function writeIndependentRuntimeReceipt(rootDir, body, streams = {}) {
  const receiptDir = path.join(rootDir, "openspec", "changes", body.change, "evidence", "receipts");
  fs.mkdirSync(receiptDir, { recursive: true });
  const streamRef = (name, value) => {
    const bytes = Buffer.from(value || "");
    const digest = rawDigest(bytes);
    const relative = `openspec/changes/${body.change}/evidence/receipts/${digest.slice(7)}.${name}`;
    fs.writeFileSync(path.join(rootDir, relative), bytes);
    return { path: relative, digest, digest_policy: "sha256-raw-v1" };
  };
  const receipt = {
    schema_version: 1,
    authority: "runtime-test",
    digest_policy: "sha256-raw-v1",
    test_digest_policy: "sha256-lf-v1",
    ...body,
    stdout: streamRef("stdout", streams.stdout),
    stderr: streamRef("stderr", streams.stderr)
  };
  const bytes = Buffer.from(`${canonicalJson(receipt)}\n`);
  const digest = rawDigest(bytes);
  const relative = `openspec/changes/${body.change}/evidence/receipts/${digest.slice(7)}.json`;
  fs.writeFileSync(path.join(rootDir, relative), bytes);
  return { receipt, receipt_id: digest, receipt_path: relative };
}
function runtimeFixture(t, change = "runtime-auth-fixture", providedRootDir = null) {
  const rootDir = providedRootDir || fs.mkdtempSync(path.join(os.tmpdir(), "strict-tdd-runtime-"));
  if (t && !providedRootDir) t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  const functionalPath = "src/feature.js";
  const testFile = "test/feature.test.js";
  const verificationTestFile = "test/evidence.test.js";
  fs.mkdirSync(path.join(rootDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(rootDir, "test"), { recursive: true });
  fs.writeFileSync(path.join(rootDir, functionalPath), "module.exports = 1;\n");
  fs.writeFileSync(path.join(rootDir, testFile), "test('feature', () => {});\n");
  fs.writeFileSync(path.join(rootDir, verificationTestFile), "test('evidence', () => {});\n");
  const testDigest = r.sha256(fs.readFileSync(path.join(rootDir, testFile)));
  const verificationTestDigest = r.sha256(fs.readFileSync(path.join(rootDir, verificationTestFile)));
  const functional_snapshot = {
    projection: "strict-tdd-functional-v1",
    base_tree: "base-tree",
    genesis_paths: [functionalPath, testFile],
    files: [{ path: functionalPath, digest: r.sha256(fs.readFileSync(path.join(rootDir, functionalPath))) }]
  };
  const candidate = r.candidateIdentity(functional_snapshot);
  const common = {
    change,
    base_tree: functional_snapshot.base_tree,
    candidate_id: candidate.id,
    test_file: testFile,
    test_digest: testDigest,
    command: `node --test ${testFile}`
  };
  const green = writeIndependentRuntimeReceipt(rootDir, { ...common, phase: "GREEN", exit_code: 0, outcome: "pass" }, { stdout: "1..1\n# pass 1\n" });
  const red = writeIndependentRuntimeReceipt(rootDir, { ...common, phase: "RED", exit_code: 1, outcome: "fail" }, { stderr: "AssertionError\n" });
  const verificationCommon = { ...common, test_file: verificationTestFile, test_digest: verificationTestDigest, command: `node --test ${verificationTestFile}` };
  const verificationGreen = writeIndependentRuntimeReceipt(rootDir, { ...verificationCommon, phase: "GREEN", exit_code: 0, outcome: "pass" }, { stdout: "1..1\n# pass 1\n" });
  const verificationRed = writeIndependentRuntimeReceipt(rootDir, { ...verificationCommon, phase: "RED", exit_code: 1, outcome: "fail" }, { stderr: "AssertionError\n" });
  const record = {
    schema_version: 1,
    change,
    evidence_mode: "live",
    functional_snapshot,
    cycles: [{
      task: "1.1",
      test_file: testFile,
      layer: "unit",
      safety_net: "✅ Passed",
      red: "✅ Written",
      green: "✅ Passed",
      triangulate: "✅ Written",
      refactor: "✅ Passed",
      provenance: {
        source: "runtime-receipt",
        test_file: testFile,
        test_digest: testDigest,
        command: common.command,
        receipt_id: green.receipt_id,
        receipt_path: green.receipt_path,
        red_command: common.command,
        red_test_digest: testDigest,
        red_receipt_id: red.receipt_id,
        red_receipt_path: red.receipt_path
      }
    }, {
      task: "1.2",
      test_file: verificationTestFile,
      layer: "integration",
      safety_net: "✅ Passed",
      red: "✅ Written",
      green: "✅ Passed",
      triangulate: "✅ Written",
      refactor: "✅ Passed",
      provenance: {
        source: "runtime-receipt",
        test_file: verificationTestFile,
        test_digest: verificationTestDigest,
        command: verificationCommon.command,
        receipt_id: verificationGreen.receipt_id,
        receipt_path: verificationGreen.receipt_path,
        red_command: verificationCommon.command,
        red_test_digest: verificationTestDigest,
        red_receipt_id: verificationRed.receipt_id,
        red_receipt_path: verificationRed.receipt_path
      }
    }]
  };
  return { rootDir, record, candidate, green, red, verificationGreen, verificationRed, functionalPath, testFile, verificationTestFile };
}
const evidencePath = "openspec/changes/archive/2026-07-25-strict-tdd-evidence-remediation-fast-path/apply-progress.md";
const evidenceProof = () => ({ evidencePath, evidenceDigest: r.sha256(fs.readFileSync(evidencePath)) });
const stateProof = state => ({ candidate_digest: r.sha256(JSON.stringify(r.canonical(state.candidate))), finding_digest: state.original_finding.digest });
const makeFinding = (id, origin, extra = {}) => { const body = { id, origin, ...extra }; return { ...body, digest: r.sha256(JSON.stringify(r.canonical(body))) }; };
const candidateProof = (value = record()) => ({ candidate_digest: r.candidateIdentity(value.functional_snapshot).id });
const gapEvidencePath = "openspec/changes/strict-tdd-test-fixture/apply-progress.md";
const gapFixtureSource = fs.readFileSync("scripts/fixtures/strict-tdd-fast-path/apply-progress.md", "utf8");
const gapFixtureRecord = r.parseEvidenceBlock(gapFixtureSource).record;
gapFixtureRecord.change = "strict-tdd-test-fixture";
gapFixtureRecord.evidence_mode = "live";
gapFixtureRecord.functional_snapshot.genesis_paths.push(gapEvidencePath);
fs.mkdirSync("openspec/changes/strict-tdd-test-fixture", { recursive: true });
const gapCycle = gapFixtureRecord.cycles[0];
const gapCandidate = r.candidateIdentity(gapFixtureRecord.functional_snapshot);
const gapCommand = "node --test scripts/fixtures/strict-tdd-fast-path/functional.test.js";
const gapReceiptBody = {
  change: gapFixtureRecord.change,
  base_tree: gapFixtureRecord.functional_snapshot.base_tree,
  candidate_id: gapCandidate.id,
  test_file: gapCycle.test_file,
  test_digest: gapCycle.provenance.test_digest,
  command: gapCommand
};
const gapGreen = writeIndependentRuntimeReceipt(process.cwd(), { ...gapReceiptBody, phase: "GREEN", exit_code: 0, outcome: "pass" }, { stdout: "1..1\n# pass 1\n" });
const gapRed = writeIndependentRuntimeReceipt(process.cwd(), { ...gapReceiptBody, phase: "RED", exit_code: 1, outcome: "fail" }, { stderr: "AssertionError\n" });
Object.assign(gapCycle.provenance, {
  source: "runtime-receipt",
  command: gapCommand,
  receipt_id: gapGreen.receipt_id,
  receipt_path: gapGreen.receipt_path,
  red_command: gapCommand,
  red_test_digest: gapCycle.provenance.test_digest,
  red_receipt_id: gapRed.receipt_id,
  red_receipt_path: gapRed.receipt_path
});
fs.writeFileSync(gapEvidencePath, gapFixtureSource.replace(/```json:strict-tdd-evidence\s*[\s\S]*?```/, `\`\`\`json:strict-tdd-evidence\n${JSON.stringify(gapFixtureRecord)}\n\`\`\``));
test.after(() => fs.rmSync("openspec/changes/strict-tdd-test-fixture", { recursive: true, force: true }));

const record = (overrides = {}) => {
  const helperDigest = r.sha256(fs.readFileSync("scripts/lib/strict-tdd-evidence-remediation.js"));
  const testDigest = r.sha256(fs.readFileSync("scripts/strict-tdd-evidence-remediation.test.js"));
  return { schema_version: 1, change: "x", evidence_mode: "historical", functional_snapshot: { projection: "strict-tdd-functional-v1", base_tree: "base", genesis_paths: ["scripts/lib/strict-tdd-evidence-remediation.js"], files: [{ path: "scripts/lib/strict-tdd-evidence-remediation.js", digest: helperDigest }] }, cycles: [{ task: "1.1", test_file: "scripts/strict-tdd-evidence-remediation.test.js", layer: "unit", safety_net: "✅ Passed", red: "✅ Written", green: "✅ Passed", triangulate: "✅ Written", refactor: "✅ Passed", provenance: { test_file: "scripts/strict-tdd-evidence-remediation.test.js", test_digest: testDigest, source: "working-tree" } }], ...overrides };
};
const gapText = () => fs.readFileSync(gapEvidencePath, "utf8");
const gapRecord = () => r.parseEvidenceBlock(gapText()).record;
const receipt = value => { const c = value.cycles[0], candidate_id = r.candidateIdentity(value.functional_snapshot).id; return { authority: "reconciled-lineage", candidate_id, reconciled_candidate_id: candidate_id, test_file: c.test_file, test_digest: c.provenance.test_digest, command: c.provenance.command, receipt_id: c.provenance.receipt_id, outcome: "pass" }; };
const gapClassify = (id = "gap", extra = {}) => ({
  type: "classify", rootDir: process.cwd(), evidencePath: gapEvidencePath, evidenceDigest: r.sha256(fs.readFileSync(gapEvidencePath)),
  candidate_digest: r.candidateIdentity(gapRecord().functional_snapshot).id,
  finding: makeFinding(id, "code-bug", { severity: "CRITICAL" }), record: gapRecord(), before: gapRecord(), after: gapRecord(),
  authorizedChange: "strict-tdd-test-fixture", externalReceipt: receipt(gapRecord()), reconciledCandidateId: r.candidateIdentity(gapRecord().functional_snapshot).id, format_gap: true, maxChangedLines: 40, proposedPaths: [gapEvidencePath], changedLines: 2, ...extra
});
const gapWrite = state => {
  const beforeEvidence = gapText();
  const afterEvidence = beforeEvidence.replace("| stale | table |", r.renderEvidenceTable(gapRecord()));
  const beforeSnapshot = r.captureEvidenceSnapshot(beforeEvidence); const afterSnapshot = r.captureEvidenceSnapshot(afterEvidence);
  return {
    type: "write", rootDir: process.cwd(), authorizedChange: state.authorized_change, external_receipt_digest: state.live_receipt.digest, path: gapEvidencePath, section: r.EVIDENCE_SECTION, changed_lines: 2,
    ...stateProof(state), candidate_id: state.candidate.id, finding_id: state.original_finding.id, origin: state.original_finding.origin,
    evidence_before_digest: state.evidence.before_digest, repaired_digest: afterSnapshot.full_digest,
    live_manifest_digest: state.functional_manifest.digest, before_evidence: beforeEvidence, after_evidence: afterEvidence,
    before_snapshot_digest: beforeSnapshot.digest, after_snapshot_digest: afterSnapshot.digest
  };
};
const gapFocal = state => ({
  type: "focal-recheck", action: state.next_action, rootDir: process.cwd(), authorizedChange: state.authorized_change, external_receipt_digest: state.live_receipt.digest, outcome: "pass", tests_passed: true,
  ...stateProof(state), candidate_id: state.candidate.id, finding_id: state.original_finding.id, origin: state.original_finding.origin,
  evidence_digest: state.evidence.repaired_digest, evidence_content: gapWrite(state).after_evidence,
  live_manifest_digest: state.functional_manifest.digest
});
test("G4 rejects unbound changes and normalizes corrupt evidence without throwing", () => {
  const corrupt = {}; corrupt.self = corrupt;
  assert.doesNotThrow(() => r.normalizeEvidenceRecord(corrupt));
  assert.equal(r.normalizeEvidenceRecord(corrupt), null);
  assert.equal(r.classifyRemediation(gapClassify("g4", { authorizedChange: null })).status, "ordinary-routing");
  for (const key of ["files", "genesis_paths", "cycles"]) assert.doesNotThrow(() => r.validateEvidenceRecord(record({ functional_snapshot: { ...record().functional_snapshot, [key]: {} }, cycles: key === "cycles" ? {} : record().cycles }), { rootDir: process.cwd() }));
  assert.equal(r.classifyRemediation(gapClassify("historical", { record: { ...gapRecord(), evidence_mode: "historical" } })).status, "ordinary-routing");
  assert.equal(r.classifyRemediation(gapClassify("receipt", { reconciledCandidateId: "sha256:" + "0".repeat(64) })).status, "ordinary-routing");
});

test("valid evidence normalizes and hashes deterministically", () => {
  const a = r.validateEvidenceRecord(record(), { rootDir: process.cwd() });
  const b = r.validateEvidenceRecord(record(), { rootDir: process.cwd() });
  assert.equal(a.valid, true); assert.equal(a.candidate.id, b.candidate.id);
  assert.equal(r.sha256("line\n"), r.sha256("line\r\n"));
  assert.equal(r.sha256(Buffer.from("line\n")), r.sha256(Buffer.from("line\r\n")));
});
test("RED runtime evidence authenticates content-addressed GREEN and RED receipts", t => {
  const fixture = runtimeFixture(t);
  const validated = r.validateEvidenceRecord(fixture.record, { rootDir: fixture.rootDir, requireProvenanceDigest: true });
  assert.equal(validated.valid, true);
  assert.equal(validated.authenticity, "runtime-authenticated");
  assert.equal(validated.runtime_receipts.length, 4);
});
test("RED runtime evidence rejects forged sources and loose or incomplete receipt references", t => {
  const fixture = runtimeFixture(t);
  const mutations = [
    ["missing source", provenance => { delete provenance.source; }, "runtime-receipt-source-invalid"],
    ["forged source", provenance => { provenance.source = "trusted-runtime"; }, "runtime-receipt-source-invalid"],
    ["missing command", provenance => { delete provenance.command; }, "runtime-receipt-command-missing"],
    ["tampered command", provenance => { provenance.command += " --forged"; }, "runtime-receipt-binding-mismatch"],
    ["loose receipt id", provenance => { delete provenance.receipt_path; }, "runtime-receipt-reference-missing"],
    ["missing RED receipt", provenance => { delete provenance.red_receipt_path; }, "runtime-receipt-reference-missing"]
  ];
  for (const [name, mutate, reason] of mutations) {
    const candidate = clone(fixture.record);
    mutate(candidate.cycles[0].provenance);
    const outcome = r.validateEvidenceRecord(candidate, { rootDir: fixture.rootDir, requireProvenanceDigest: true });
    assert.equal(outcome.valid, false, name);
    assert.equal(outcome.reason_code, reason, name);
  }
});
test("RED runtime evidence rejects missing, tampered, or differently bound receipt bytes", t => {
  const cases = [
    ["missing receipt", ({ rootDir, record }) => fs.rmSync(path.join(rootDir, record.cycles[0].provenance.receipt_path)), "runtime-receipt-missing"],
    ["receipt content", ({ rootDir, record }) => fs.appendFileSync(path.join(rootDir, record.cycles[0].provenance.receipt_path), " "), "runtime-receipt-digest-mismatch"],
    ["receipt binding", ({ rootDir, record }) => {
      const provenance = record.cycles[0].provenance;
      const absolute = path.join(rootDir, provenance.receipt_path);
      const receipt = JSON.parse(fs.readFileSync(absolute, "utf8"));
      receipt.candidate_id = "sha256:" + "0".repeat(64);
      const bytes = Buffer.from(`${canonicalJson(receipt)}\n`);
      const digest = rawDigest(bytes);
      const relative = `openspec/changes/${record.change}/evidence/receipts/${digest.slice(7)}.json`;
      fs.writeFileSync(path.join(rootDir, relative), bytes);
      provenance.receipt_id = digest;
      provenance.receipt_path = relative;
    }, "runtime-receipt-binding-mismatch"],
    ["output content", ({ rootDir, green }) => fs.appendFileSync(path.join(rootDir, green.receipt.stdout.path), "forged"), "runtime-output-digest-mismatch"]
  ];
  for (const [name, mutate, reason] of cases) {
    const fixture = runtimeFixture(null, `runtime-${name.replace(/\s+/g, "-")}`);
    try {
      mutate(fixture);
      const outcome = r.validateEvidenceRecord(fixture.record, { rootDir: fixture.rootDir, requireProvenanceDigest: true });
      assert.equal(outcome.valid, false, name);
      assert.equal(outcome.reason_code, reason, name);
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  }
});
test("RED runtime and snapshot paths reject traversal, absolute paths, and realpath escapes", t => {
  const fixture = runtimeFixture(t);
  const outside = path.join(path.dirname(fixture.rootDir), `outside-${process.pid}.js`);
  fs.writeFileSync(outside, "outside\n");
  t.after(() => fs.rmSync(outside, { force: true }));
  const mutations = [
    ["snapshot traversal", value => { value.functional_snapshot.files[0].path = "../outside.js"; }, "unsafe-evidence-path"],
    ["snapshot absolute", value => { value.functional_snapshot.files[0].path = outside; }, "unsafe-evidence-path"],
    ["genesis traversal", value => { value.functional_snapshot.genesis_paths[0] = "../outside.js"; }, "unsafe-evidence-path"],
    ["receipt traversal", value => { value.cycles[0].provenance.receipt_path = "../receipt.json"; }, "runtime-receipt-path-invalid"],
    ["receipt absolute", value => { value.cycles[0].provenance.receipt_path = path.join(fixture.rootDir, value.cycles[0].provenance.receipt_path); }, "runtime-receipt-path-invalid"]
  ];
  for (const [name, mutate, reason] of mutations) {
    const value = clone(fixture.record);
    mutate(value);
    const outcome = r.validateEvidenceRecord(value, { rootDir: fixture.rootDir, requireProvenanceDigest: true });
    assert.equal(outcome.valid, false, name);
    assert.equal(outcome.reason_code, reason, name);
  }
  const link = path.join(fixture.rootDir, "src", "escaped.js");
  try {
    fs.symlinkSync(outside, link, "file");
    const value = clone(fixture.record);
    value.functional_snapshot.files[0] = { path: "src/escaped.js", digest: r.sha256(fs.readFileSync(outside)) };
    assert.equal(r.validateEvidenceRecord(value, { rootDir: fixture.rootDir }).reason_code, "unsafe-evidence-path");
  } catch (error) {
    if (!["EPERM", "EACCES", "UNKNOWN"].includes(error.code)) throw error;
  }
});
test("RED persistRuntimeReceipt writes rehashable confined content-addressed evidence", t => {
  const fixture = runtimeFixture(t, "persist-runtime");
  const result = r.persistRuntimeReceipt(fixture.rootDir, {
    change: fixture.record.change,
    phase: "GREEN",
    base_tree: fixture.record.functional_snapshot.base_tree,
    candidate_id: fixture.candidate.id,
    test_file: fixture.testFile,
    test_digest: fixture.record.cycles[0].provenance.test_digest,
    command: `node --test ${fixture.testFile}`,
    exit_code: 0,
    outcome: "pass",
    stdout: Buffer.from("ok\n"),
    stderr: Buffer.alloc(0)
  });
  assert.equal(result.valid, true);
  assert.equal(rawDigest(fs.readFileSync(path.join(fixture.rootDir, result.receipt_path))), result.receipt_id);
  assert.match(result.receipt_path, /^openspec\/changes\/persist-runtime\/evidence\/receipts\/[a-f0-9]{64}\.json$/);
});
test("missing provenance is critical ordinary routing", () => {
  const x = r.classifyRemediation({ rootDir: process.cwd(), finding: { id: "f", severity: "CRITICAL", origin: "code-bug" }, record: record({ cycles: [{ task: "1", test_file: "x", red: "pass", green: "pass", triangulate: "pass", refactor: "pass" }] }) });
  assert.equal(x.status, "ordinary-routing"); assert.equal(x.severity, "CRITICAL");
});
test("reducer permits one bounded repair and focal recheck", () => {
  let s = r.reduce(undefined, gapClassify("f"));
  assert.equal(s.status, "repair-pending");
  s = r.reduce(s, gapWrite(s));
  assert.equal(s.status, "recheck-pending");
  s = r.reduce(s, gapFocal(s));
  assert.equal(s.status, "resolved");
  assert.equal(r.reduce(s, { type: "focal-recheck", outcome: "pass" }).status, "ordinary-routing");
});
test("allowlist, identity and cap reject unsafe writes", () => {
  assert.equal(r.isEvidenceOnlyPath("apply-progress.md"), true);
  assert.equal(r.isEvidenceOnlyPath("src/a.js"), false);
  assert.equal(r.withinChangedLineCap(41, 40), false);
});
test("RED: allowlist requires the exact rooted change artifact and fails closed on I/O races", () => {
  const unsafe = ["/tmp/apply-progress.md", "openspec/changes/x/../x/apply-progress.md", "openspec/changes/other/apply-progress.md"];
  for (const evidencePath of unsafe) {
    assert.equal(r.classifyRemediation(gapClassify("unsafe-path", { evidencePath, proposedPaths: [evidencePath] })).status, "ordinary-routing");
  }
  const statSync = fs.statSync;
  fs.statSync = () => { throw new Error("EACCES"); };
  try {
    assert.equal(r.classifyRemediation(gapClassify("io-race")).status, "ordinary-routing");
  } finally {
    fs.statSync = statSync;
  }
});
test("REQ-routing-006 rejects absent cap and empty write-set while preserving origin", () => {
  const finding = makeFinding("f2", "spec-gap", { severity: "CRITICAL" });
  const absentInput = gapClassify("f2", { finding }); delete absentInput.maxChangedLines;
  const absent = r.classifyRemediation(absentInput);
  const invalid = r.classifyRemediation(gapClassify("f2", { finding, maxChangedLines: 41 }));
  const empty = r.classifyRemediation(gapClassify("f2", { finding, proposedPaths: [] }));
  assert.equal(absent.status, "ordinary-routing"); assert.equal(absent.reason_code, "fast-path-disabled-invalid-cap");
  assert.equal(invalid.status, "ordinary-routing");
  assert.equal(empty.status, "ordinary-routing"); assert.equal(empty.classification, "spec-gap"); assert.equal(empty.original_finding.id, "f2");
  for (const origin of ["code-bug", "tasks-gap", "design-gap", "spec-gap"]) {
    const outcome = r.classifyRemediation(gapClassify(origin, { finding: makeFinding(origin, origin, { severity: "CRITICAL" }), functional_delta: true }));
    assert.equal(outcome.status, "ordinary-routing"); assert.equal(outcome.classification, origin); assert.equal(outcome.original_finding.origin, origin);
  }
});
test("REQ-agents-012 requires root-aware evidence proof at classify, write, and focal boundaries", () => {
  const finding = makeFinding("proof", "code-bug");
  const noRoot = r.classifyRemediation({ finding, record: record(), maxChangedLines: 40, proposedPaths: [evidencePath], evidencePath, evidenceDigest: evidenceProof().evidenceDigest });
  assert.equal(noRoot.status, "ordinary-routing");
  const missingCandidate = r.classifyRemediation({ rootDir: process.cwd(), ...evidenceProof(), finding, record: record(), maxChangedLines: 40, proposedPaths: [evidencePath] });
  assert.equal(missingCandidate.status, "ordinary-routing");
  const badCandidate = r.classifyRemediation({ rootDir: process.cwd(), ...evidenceProof(), ...candidateProof(), candidate_digest: "sha256:" + "f".repeat(64), finding, record: record(), maxChangedLines: 40, proposedPaths: [evidencePath] });
  assert.equal(badCandidate.status, "ordinary-routing");
  const badDigest = r.classifyRemediation({ rootDir: process.cwd(), finding, record: record(), maxChangedLines: 40, proposedPaths: [evidencePath], evidencePath, evidenceDigest: "sha256:fake" });
  assert.equal(badDigest.status, "ordinary-routing");
  let state = r.reduce(undefined, gapClassify("proof"));
  assert.equal(r.reduce(state, { type: "write", rootDir: process.cwd(), path: evidencePath, section: r.EVIDENCE_SECTION, changed_lines: 1 }).status, "ordinary-routing");
  state = r.reduce(state, gapWrite(state));
  assert.equal(r.reduce(state, { type: "focal-recheck", rootDir: process.cwd(), outcome: "pass", tests_passed: true }).status, "ordinary-routing");
});
test("REQ-skills-008 rejects fabricated cycle enums and paths with real root", () => {
  const invalid = record({ cycles: [{ task: "x", test_file: "missing.test.js", red: "invented", green: "✅ Passed", triangulate: "✅ Passed", refactor: "✅ Passed", provenance: { test_file: "missing.test.js", commit: "fake" } }] });
  const result = r.validateEvidenceRecord(invalid, { rootDir: process.cwd() });
  assert.equal(result.valid, false); assert.match(result.reason_code, /cycle-red-enum-invalid|snapshot-file-unverifiable|test-file-unverifiable/);
});
test("REQ-agents-012 rejects tampered frozen state and focal failure is one-shot", () => {
  let state = r.reduce(undefined, gapClassify("f3"));
  const tampered = { ...state, candidate: { ...state.candidate, id: "sha256:tampered" } };
  assert.equal(r.reduce(tampered, { type: "write", path: "apply-progress.md", section: r.EVIDENCE_SECTION, changed_lines: 1 }).reason_code, "immutable-state-tamper");
  state = r.reduce(state, gapWrite(state));
  state = r.reduce(state, { ...gapFocal(state), outcome: "fail", tests_passed: false });
  assert.equal(state.status, "ordinary-routing");
  assert.equal(r.reduce(state, { type: "focal-recheck", outcome: "pass" }).status, "ordinary-routing");
});
test("REQ-agents-012 orchestrator contract persists focal next_action and ordinary fallback", () => {
  const text = fs.readFileSync("agents/sdd-orchestrator.agent.md", "utf8");
  assert.match(text, /repair-pending/); assert.match(text, /run-focal-recheck/); assert.match(text, /origin priority/);
});
test("REQ-skills-008 JSON authority detects derived Markdown representation drift", () => {
  const value = record();
  const rendered = r.renderEvidenceTable(value);
  assert.equal(r.compareEvidenceRendering(value, rendered).equivalent, true);
  assert.equal(r.compareEvidenceRendering(value, "| stale | table |").format_gap, true);
});

test("RED: fast path requires a real deterministic format gap", () => {
  const finding = makeFinding("equivalent", "code-bug", { severity: "CRITICAL" });
  const common = { rootDir: process.cwd(), ...evidenceProof(), ...candidateProof(), finding, record: record(), before: record(), after: record(), maxChangedLines: 40, proposedPaths: [evidencePath], changedLines: 1 };
  assert.equal(r.compareEvidenceRendering(common.record, fs.readFileSync(evidencePath, "utf8")).format_gap, false);
  assert.equal(r.classifyRemediation({ ...common, format_gap: false }).status, "ordinary-routing");
});

test("RED: fast path requires before and after evidence snapshots", () => {
  const finding = makeFinding("snapshots", "code-bug", { severity: "CRITICAL" });
  const outcome = r.classifyRemediation({ rootDir: process.cwd(), ...evidenceProof(), ...candidateProof(), finding, record: record(), format_gap: true, maxChangedLines: 40, proposedPaths: [evidencePath], changedLines: 1 });
  assert.equal(outcome.status, "ordinary-routing");
});

test("RED: fast path requires a CRITICAL finding with an original origin", () => {
  const warning = makeFinding("warning", "code-bug", { severity: "WARNING" });
  const noOriginBody = { id: "no-origin", severity: "CRITICAL" };
  const noOrigin = { ...noOriginBody, digest: r.sha256(JSON.stringify(r.canonical(noOriginBody))) };
  const common = { rootDir: process.cwd(), ...evidenceProof(), ...candidateProof(), record: record(), before: record(), after: record(), format_gap: true, maxChangedLines: 40, proposedPaths: [evidencePath], changedLines: 1 };
  assert.equal(r.classifyRemediation({ ...common, finding: warning }).status, "ordinary-routing");
  assert.equal(r.classifyRemediation({ ...common, finding: noOrigin }).status, "ordinary-routing");
});

test("RED: fast path rejects undeclared origins and accepts exactly the routing taxonomy", () => {
  assert.deepEqual(r.ALLOWED_ORIGINS, ["spec-gap", "design-gap", "tasks-gap", "code-bug"]);
  assert.equal(Object.isFrozen(r.ALLOWED_ORIGINS), true);
  assert.throws(() => r.ALLOWED_ORIGINS.push("banana"), TypeError);
  for (const origin of ["spec-gap", "design-gap", "tasks-gap", "code-bug"]) {
    const finding = makeFinding(`valid-${origin}`, origin, { severity: "CRITICAL" });
    let outcome = r.reduce(undefined, gapClassify(`valid-${origin}`, { finding }));
    assert.equal(outcome.status, "repair-pending", origin); assert.equal(outcome.original_finding.origin, origin);
    outcome = r.reduce(outcome, gapWrite(outcome));
    assert.equal(outcome.next_action.origin, origin);
    outcome = r.reduce(outcome, gapFocal(outcome));
    assert.equal(outcome.status, "resolved"); assert.equal(outcome.original_finding.origin, origin);
    const fallback = r.classifyRemediation(gapClassify(`fallback-${origin}`, { finding, functional_delta: true }));
    assert.equal(fallback.classification, origin); assert.equal(fallback.original_finding.origin, origin);
  }
  for (const origin of ["banana", "", 42, "Code-Bug", "SPEC-GAP"]) {
    const finding = makeFinding(`invalid-${String(origin)}`, origin, { severity: "CRITICAL" });
    assert.equal(r.classifyRemediation(gapClassify("invalid-origin", { finding })).status, "ordinary-routing", String(origin));
  }
});

test("RED: write and focal reject live functional changes between boundaries", () => {
  const functionalPath = gapRecord().functional_snapshot.files[0].path; const original = fs.readFileSync(functionalPath);
  try {
    let state = r.reduce(undefined, gapClassify("live-write")); assert.equal(state.status, "repair-pending");
    fs.writeFileSync(functionalPath, "module.exports = 2;\n");
    assert.equal(r.reduce(state, gapWrite(state)).status, "ordinary-routing");
    fs.writeFileSync(functionalPath, original);
    state = r.reduce(undefined, gapClassify("live-focal")); state = r.reduce(state, gapWrite(state));
    assert.equal(state.status, "recheck-pending");
    fs.writeFileSync(functionalPath, "module.exports = 3;\n");
    assert.equal(r.reduce(state, gapFocal(state)).status, "ordinary-routing");
  } finally {
    fs.writeFileSync(functionalPath, original);
  }
});

test("RED: write rejects a claimed diff outside the exact evidence region", () => {
  const state = r.reduce(undefined, gapClassify("outside"));
  assert.equal(state.status, "repair-pending");
  const safe = gapWrite(state); const afterEvidence = safe.after_evidence.replace("This text is outside", "Changed outside"); const afterSnapshot = r.captureEvidenceSnapshot(afterEvidence);
  const write = r.reduce(state, { ...safe, after_evidence: afterEvidence, after_snapshot_digest: afterSnapshot.digest, repaired_digest: afterSnapshot.full_digest });
  assert.equal(write.status, "ordinary-routing");
});
test("REQ-routing-006 reconciles unknown writes only by exact digest", () => {
  let state = r.reduce(undefined, gapClassify("f4"));
  state = r.reduce(state, gapWrite(state));
  assert.equal(r.reduce(state, { type: "reconcile-unknown-write", artifact_digest: "sha256:wrong" }).status, "ordinary-routing");
  let retry = r.reduce(undefined, gapClassify("f5")); retry = r.reduce(retry, gapWrite(retry));
  assert.equal(r.reduce(retry, { type: "reconcile-unknown-write", artifact_digest: retry.evidence.repaired_digest }).status, "recheck-pending");
});
test("REQ-skills-008 apply-progress snapshot carries current coding-file digests and per-task cycles", () => {
  const text = fs.readFileSync("openspec/changes/archive/2026-07-25-strict-tdd-evidence-remediation-fast-path/apply-progress.md", "utf8");
  const parsed = r.parseEvidenceBlock(text); assert.equal(parsed.valid, true);
  const validated = r.validateEvidenceRecord(parsed.record, { rootDir: process.cwd(), requireProvenanceDigest: true }); assert.equal(validated.valid, true);
  assert.equal(validated.authenticity, "legacy-unverifiable");
  assert.equal(validated.record.evidence_mode, "historical");
  const tasks = fs.readFileSync("openspec/changes/archive/2026-07-25-strict-tdd-evidence-remediation-fast-path/tasks.md", "utf8");
  const taskIds = [...tasks.matchAll(/^- \[[ x~]\] (\d+\.\d+) /gm)].map(match => match[1]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const cycleIds = validated.record.cycles.map(cycle => String(cycle.task)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  assert.equal(taskIds.length, 54);
  assert.deepEqual(cycleIds, taskIds);
  assert.equal(r.compareEvidenceRendering(validated.record, text).equivalent, true);
  assert.ok(validated.record.cycles.every(c => c.red === "✅ Written" && c.green === "✅ Passed"));
});

test("RED O4.2: historical provenance authenticates content-addressed refs and detects digest tampering", () => {
  const snapRoot = fs.mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "hist-prov-"));
  try {
    const sealedDigest = "sha256:" + "c".repeat(64);
    const body = { test_file: "scripts/strict-tdd-evidence-remediation.test.js", test_digest: sealedDigest };
    const snap = r.writeHistoricalSnapshot(snapRoot, body);
    assert.equal(snap.valid, true);
    assert.match(snap.digest, /^sha256:[a-f0-9]{64}$/i);
    const authentic = record({
      cycles: [{
        ...record().cycles[0],
        provenance: {
          test_file: "scripts/strict-tdd-evidence-remediation.test.js",
          test_digest: sealedDigest,
          source: "content-addressed-snapshot",
          snapshot_digest: snap.digest
        }
      }]
    });
    const ok = r.validateEvidenceRecord(authentic, { rootDir: snapRoot, requireProvenanceDigest: true, historicalSnapshotDir: ".ospec/strict-tdd-historical" });
    assert.equal(ok.valid, true, "authenticated historical must accept sealed digests");
    assert.equal(ok.authenticity, "content-addressed");

    const tampered = JSON.parse(JSON.stringify(authentic));
    tampered.cycles[0].provenance.test_digest = "sha256:" + "d".repeat(64);
    const bad = r.validateEvidenceRecord(tampered, { rootDir: snapRoot, requireProvenanceDigest: true, historicalSnapshotDir: ".ospec/strict-tdd-historical" });
    assert.equal(bad.valid, false);
    assert.equal(bad.reason_code, "provenance-digest-mismatch");

    const missing = JSON.parse(JSON.stringify(authentic));
    missing.cycles[0].provenance.snapshot_digest = "sha256:" + "e".repeat(64);
    assert.equal(r.validateEvidenceRecord(missing, { rootDir: snapRoot, requireProvenanceDigest: true, historicalSnapshotDir: ".ospec/strict-tdd-historical" }).reason_code, "historical-ref-missing");

    const corruptPath = require("node:path").join(snapRoot, ".ospec", "strict-tdd-historical", snap.digest.slice(7) + ".json");
    fs.writeFileSync(corruptPath, "{\"tampered\":true}\n");
    assert.equal(r.validateEvidenceRecord(authentic, { rootDir: snapRoot, requireProvenanceDigest: true, historicalSnapshotDir: ".ospec/strict-tdd-historical" }).reason_code, "historical-ref-corrupt");
    fs.unlinkSync(corruptPath);
    assert.equal(r.writeHistoricalSnapshot(snapRoot, body).valid, true);

    const livePath = require("node:path").join(snapRoot, "scripts", "strict-tdd-evidence-remediation.test.js");
    fs.mkdirSync(require("node:path").dirname(livePath), { recursive: true });
    fs.writeFileSync(livePath, "module.exports = 'mutated-live-bytes';\n");
    const afterLiveEdit = r.validateEvidenceRecord(authentic, { rootDir: snapRoot, requireProvenanceDigest: true, historicalSnapshotDir: ".ospec/strict-tdd-historical" });
    assert.equal(afterLiveEdit.valid, true, "historical must ignore live mutable bytes");

    const legacy = r.validateEvidenceRecord(record(), { rootDir: process.cwd(), requireProvenanceDigest: true });
    assert.equal(legacy.valid, true);
    assert.equal(legacy.authenticity, "legacy-unverifiable");
    assert.equal(r.validateEvidenceRecord(record(), { rootDir: process.cwd(), requireHistoricalAuth: true }).reason_code, "provenance-unauthenticated");

    const noRef = record({
      cycles: [{
        ...record().cycles[0],
        provenance: { test_file: "scripts/strict-tdd-evidence-remediation.test.js", test_digest: sealedDigest, source: "content-addressed-snapshot" }
      }]
    });
    assert.equal(r.validateEvidenceRecord(noRef, { rootDir: snapRoot, requireProvenanceDigest: true }).reason_code, "provenance-unauthenticated");
    assert.equal(r.historicalRefPath(snapRoot, "sha256:" + "f".repeat(64), "../outside"), null);
  } finally {
    fs.rmSync(snapRoot, { recursive: true, force: true });
  }
});

test("REQ-skills-008 finalization freezes current digests and rejects stale evidence", () => {
  const value = record();
  const rendered = r.renderEvidenceTable(value);
  const finalized = r.finalizeEvidence({
    record: value,
    rootDir: process.cwd(),
    files: ["scripts/lib/strict-tdd-evidence-remediation.js"],
    markdown: rendered
  });
  assert.equal(finalized.valid, true);
  const proof = r.assertFinalized({ record: finalized.record, rootDir: process.cwd(), digestSet: finalized.digest_set });
  assert.equal(proof.valid, true);
  const stale = r.assertFinalized({
    record: finalized.record,
    rootDir: process.cwd(),
    digestSet: [{ ...finalized.digest_set[0], digest: "sha256:" + "0".repeat(64) }]
  });
  assert.equal(stale.valid, false);
  assert.equal(stale.reason_code, "stale-finalized-digest");
  assert.equal(r.finalizeEvidence({ record: value, rootDir: process.cwd(), files: finalized.digest_set.map(file => file.path), markdown: "| stale | table |" }).valid, false);
  const readFileSync = fs.readFileSync;
  fs.readFileSync = file => String(file).endsWith("strict-tdd-evidence-remediation.js") ? (() => { throw new Error("EACCES"); })() : readFileSync(file);
  try {
    assert.equal(r.finalizeEvidence({ record: value, rootDir: process.cwd(), files: ["scripts/lib/strict-tdd-evidence-remediation.js"], markdown: rendered }).valid, false);
    assert.equal(r.assertFinalized({ record: finalized.record, rootDir: process.cwd(), digestSet: finalized.digest_set }).valid, false);
  } finally { fs.readFileSync = readFileSync; }
});
