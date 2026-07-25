"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const r = require("./lib/strict-tdd-evidence-remediation.js");
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
Object.assign(gapFixtureRecord.cycles[0].provenance, { source: "runtime-receipt", command: "node --test scripts/fixtures/strict-tdd-fast-path/functional.test.js", receipt_id: "sha256:" + "a".repeat(64) });
fs.mkdirSync("openspec/changes/strict-tdd-test-fixture", { recursive: true });
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
