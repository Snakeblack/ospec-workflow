"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTree, PROFILES } = require("./configure/cli.js");
const { transform } = require("./lib/target-transform.js");
const remediation = require("./lib/strict-tdd-evidence-remediation.js");
const fs = require("node:fs");
const helperPath = "scripts/lib/strict-tdd-evidence-remediation.js";
const targets = ["claude", "vscode", "github-copilot", "opencode", "codex", "cursor"];

test("REQ-agents-012 generated in-memory parity ships helper to every target", () => {
  const source = loadTree(process.cwd());
  const outputs = targets.map(target => transform({ files: source, profile: PROFILES[target] }).files);
  for (const files of outputs) {
    const helper = files.find(file => file.path === helperPath);
    assert.ok(helper, `missing ${helperPath}`);
    assert.ok(helper.content.length > 1000, "helper content must be non-empty");
    assert.match(helper.content, /validateEvidenceRecord/);
  }
  assert.equal(new Set(outputs.map(files => files.find(file => file.path === helperPath).content)).size, 1);
});

test("REQ-routing-006 generated parity mutants keep the same guard contract", () => {
  const source = loadTree(process.cwd());
  for (const target of targets) {
    const files = transform({ files: source, profile: PROFILES[target] }).files;
    const helper = files.find(file => file.path === helperPath).content;
    for (const marker of ["fast-path-disabled-invalid-cap", "empty-write-set", "candidate-identity-mismatch", "focal-recheck-failed", "CRITICAL"]) assert.ok(helper.includes(marker), `${target} lost ${marker}`);
  }
});

test("REQ-agents-012 executable isolated mutations all fail closed", () => {
  const rootDir = process.cwd();
  const authorizedChange = "strict-tdd-parity-fixture", evidencePath = `openspec/changes/${authorizedChange}/apply-progress.md`;
  const fixture = fs.readFileSync("scripts/fixtures/strict-tdd-fast-path/apply-progress.md", "utf8"), baseRecord = remediation.parseEvidenceBlock(fixture).record;
  const functionalPath = `openspec/changes/${authorizedChange}/functional.js`, functional = "module.exports = 1;\n";
  baseRecord.change = authorizedChange; baseRecord.evidence_mode = "live"; baseRecord.functional_snapshot.genesis_paths.push(evidencePath, functionalPath); baseRecord.functional_snapshot.files = [{ path: functionalPath, digest: remediation.sha256(functional) }];
  Object.assign(baseRecord.cycles[0].provenance, { source: "runtime-receipt", command: "node --test scripts/fixtures/strict-tdd-fast-path/functional.test.js", receipt_id: "sha256:" + "b".repeat(64) });
  const evidenceText = fixture.replace(/```json:strict-tdd-evidence\s*[\s\S]*?```/, `\`\`\`json:strict-tdd-evidence\n${JSON.stringify(baseRecord)}\n\`\`\``);
  fs.mkdirSync(`openspec/changes/${authorizedChange}`, { recursive: true }); fs.writeFileSync(functionalPath, functional); fs.writeFileSync(evidencePath, evidenceText); test.after(() => fs.rmSync(`openspec/changes/${authorizedChange}`, { recursive: true, force: true }));
  const evidenceDigest = remediation.sha256(evidenceText);
  const findingBody = { id: "mutation-finding", origin: "code-bug", severity: "CRITICAL" };
  const finding = { ...findingBody, digest: remediation.sha256(JSON.stringify(remediation.canonical(findingBody))) };
  const externalReceipt = { authority: "reconciled-lineage", candidate_id: remediation.candidateIdentity(baseRecord.functional_snapshot).id, reconciled_candidate_id: remediation.candidateIdentity(baseRecord.functional_snapshot).id, test_file: baseRecord.cycles[0].test_file, test_digest: baseRecord.cycles[0].provenance.test_digest, command: baseRecord.cycles[0].provenance.command, receipt_id: baseRecord.cycles[0].provenance.receipt_id, outcome: "pass" };
  const base = { rootDir, authorizedChange, evidencePath, evidenceDigest, candidate_digest: remediation.candidateIdentity(baseRecord.functional_snapshot).id, reconciledCandidateId: remediation.candidateIdentity(baseRecord.functional_snapshot).id, finding, record: baseRecord, before: baseRecord, after: baseRecord, externalReceipt, format_gap: true, maxChangedLines: 40, proposedPaths: [evidencePath], changedLines: 1 };
  const mutations = {
    provenance: () => ({ ...base, record: { ...base.record, cycles: [{ ...base.record.cycles[0], provenance: null }] } }),
    identity: () => ({ ...base, identity_drift: true }),
    finding: () => ({ ...base, finding: { ...base.finding, origin: "spec-gap" }, origin: "code-bug" }),
    origin: () => ({ ...base, origin: "spec-gap" }),
    cap: () => ({ ...base, maxChangedLines: 41 }),
    writeSet: () => ({ ...base, proposedPaths: ["src/production.js"] }),
    nextAction: () => ({ ...base, action: { type: "wrong-action" } }),
    recheckResult: () => ({ ...base, tests_passed: false }),
    repetition: () => ({ ...base, focalRechecksUsed: 1 }),
    formatGap: () => ({ ...base, format_gap: false }),
    beforeSnapshot: () => ({ ...base, before: null }),
    afterSnapshot: () => ({ ...base, after: null }),
    severity: () => ({ ...base, finding: { ...finding, severity: "WARNING" } }),
    missingOrigin: () => { const body = { id: "mutation-finding", severity: "CRITICAL" }; return { ...base, finding: { ...body, digest: remediation.sha256(JSON.stringify(remediation.canonical(body))) } }; },
    undeclaredOrigin: () => { const body = { id: "mutation-finding", origin: "banana", severity: "CRITICAL" }; return { ...base, finding: { ...body, digest: remediation.sha256(JSON.stringify(remediation.canonical(body))) } }; },
    caseVariantOrigin: () => { const body = { id: "mutation-finding", origin: "Code-Bug", severity: "CRITICAL" }; return { ...base, finding: { ...body, digest: remediation.sha256(JSON.stringify(remediation.canonical(body))) } }; },
    nonStringOrigin: () => { const body = { id: "mutation-finding", origin: 42, severity: "CRITICAL" }; return { ...base, finding: { ...body, digest: remediation.sha256(JSON.stringify(remediation.canonical(body))) } }; }
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const outcome = remediation.classifyRemediation(mutate());
    assert.equal(outcome.status, "ordinary-routing", `${name} mutation bypassed classify guard`);
  }
  let state = remediation.reduce(undefined, { type: "classify", ...base });
  assert.equal(state.status, "repair-pending");
  const stateProof = { candidate_digest: remediation.sha256(JSON.stringify(remediation.canonical(state.candidate))), finding_digest: state.original_finding.digest };
  const repairedText = evidenceText.replace("| stale | table |", remediation.renderEvidenceTable(baseRecord));
  const beforeSnapshot = remediation.captureEvidenceSnapshot(evidenceText); const afterSnapshot = remediation.captureEvidenceSnapshot(repairedText);
  const write = { type: "write", rootDir, authorizedChange, external_receipt_digest: state.live_receipt.digest, path: evidencePath, section: remediation.EVIDENCE_SECTION, changed_lines: 1, ...stateProof, candidate_id: state.candidate.id, finding_id: state.original_finding.id, origin: state.original_finding.origin, evidence_before_digest: evidenceDigest, repaired_digest: afterSnapshot.full_digest, live_manifest_digest: state.functional_manifest.digest, before_evidence: evidenceText, after_evidence: repairedText, before_snapshot_digest: beforeSnapshot.digest, after_snapshot_digest: afterSnapshot.digest };
  assert.equal(remediation.reduce(state, { ...write, live_manifest_digest: "sha256:" + "0".repeat(64) }).status, "ordinary-routing");
  assert.equal(remediation.reduce(state, { ...write, path: "apply-progress.md" }).status, "ordinary-routing");
  assert.equal(remediation.reduce(state, { ...write, before_snapshot_digest: null }).status, "ordinary-routing");
  const outsideMutation = repairedText.replace("This text is outside", "Outside changed"); const outsideSnapshot = remediation.captureEvidenceSnapshot(outsideMutation);
  assert.equal(remediation.reduce(state, { ...write, after_evidence: outsideMutation, after_snapshot_digest: outsideSnapshot.digest, repaired_digest: outsideSnapshot.full_digest }).status, "ordinary-routing");
  const recordMutation = repairedText.replace('"red": "✅ Written"', '"red": "✅ Passed"').replace("| ✅ Written | ✅ Passed | ✅ Written | ✅ Passed |", "| ✅ Passed | ✅ Passed | ✅ Written | ✅ Passed |");
  const recordSnapshot = remediation.captureEvidenceSnapshot(recordMutation);
  assert.equal(remediation.reduce(state, { ...write, after_evidence: recordMutation, after_snapshot_digest: recordSnapshot.digest, repaired_digest: recordSnapshot.full_digest }).status, "ordinary-routing");
  state = remediation.reduce(state, write); assert.equal(state.status, "recheck-pending"); assert.equal(state.next_action.type, "run-focal-recheck");
  const focal = { type: "focal-recheck", action: state.next_action, rootDir, authorizedChange, external_receipt_digest: state.live_receipt.digest, ...stateProof, candidate_id: state.candidate.id, finding_id: state.original_finding.id, origin: state.original_finding.origin, evidence_digest: afterSnapshot.full_digest, evidence_content: repairedText, live_manifest_digest: state.functional_manifest.digest, tests_passed: true, outcome: "pass" };
  assert.equal(remediation.reduce({ ...state, next_action: { type: "wrong-action" } }, focal).status, "ordinary-routing");
  assert.equal(remediation.reduce(state, { ...focal, tests_passed: false }).status, "ordinary-routing");
  const resolved = remediation.reduce(state, focal); assert.equal(resolved.status, "resolved");
  assert.equal(remediation.reduce(resolved, focal).status, "ordinary-routing");
});
