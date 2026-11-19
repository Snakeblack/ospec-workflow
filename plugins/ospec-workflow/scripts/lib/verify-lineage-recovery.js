"use strict";

// Durable evidence for the exceptional path where a frozen Candidate record is
// readable but its source tree cannot be materialised.  This module deliberately
// stores evidence under the change root; state.yaml remains the workflow source
// of truth and only references these immutable blobs.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { stableSerialize } = require("./verify-lineage-candidate-store.js");

const AUDIT_KIND = "candidate-recovery-audit/v1";
const OPERATION_KIND = "verify-lineage-operation/v1";
const DISPOSITION_KIND = "directed-recheck-disposition/v1";
const RECONCILIATION_AUDIT_KIND = "reconciliation-successor-audit/v1";
const PREDECESSOR_KIND = "verify-lineage-predecessor/v1";
const INVENTORY = ["persisted-record", "change-root", "git-objects", "git-references", "reflog", "stash", "worktrees"];
const OUTCOMES = new Set(["unavailable", "metadata-only", "recovered", "unknown", "not-applicable"]);

function sha256(bytes) { return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function sameImmutableReference(left, right) {
  return left?.content_digest === right?.content_digest && left?.relative_path === right?.relative_path;
}
function rootPath(changeRoot) {
  if (typeof changeRoot !== "string" || !changeRoot.trim()) throw new TypeError("changeRoot is required");
  const root = path.resolve(changeRoot);
  const stat = fs.lstatSync(root, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) throw new Error("changeRoot must be a real directory");
  return root;
}
function childPath(root, name) {
  if (!/^[a-z0-9.-]+\.json$/i.test(name)) throw new Error("invalid immutable evidence name");
  return path.join(root, name);
}
function writeImmutable(root, name, payload, options = {}) {
  const bytes = Buffer.from(stableSerialize(payload), "utf8");
  const target = childPath(root, name);
  const existing = fs.lstatSync(target, { throwIfNoEntry: false });
  let created = false;
  if (existing) {
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error("immutable evidence path is unsafe");
    const actual = fs.readFileSync(target);
    if (!actual.equals(bytes)) throw new Error("immutable evidence conflict");
  } else {
    const temp = path.join(root, `.${name}.${process.pid}.${crypto.randomUUID()}.tmp`);
    try { fs.writeFileSync(temp, bytes, { flag: "wx", mode: 0o600 }); fs.linkSync(temp, target); created = true; }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      const actual = fs.readFileSync(target);
      if (!actual.equals(bytes)) throw new Error("immutable evidence conflict");
    } finally { try { fs.unlinkSync(temp); } catch (error) { if (error.code !== "ENOENT") throw error; } }
  }
  const reference = { content_digest: sha256(bytes), relative_path: name };
  return options.withStatus ? { reference, created } : reference;
}
function readImmutable(changeRoot, reference, kind) {
  const root = rootPath(changeRoot);
  if (!reference || typeof reference.relative_path !== "string" || typeof reference.content_digest !== "string") throw new TypeError("immutable reference is required");
  const target = childPath(root, reference.relative_path);
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) throw new Error("immutable evidence missing or unsafe");
  const bytes = fs.readFileSync(target);
  if (sha256(bytes) !== reference.content_digest) throw new Error("immutable evidence digest mismatch");
  const parsed = JSON.parse(bytes.toString("utf8"));
  if (stableSerialize(parsed) !== bytes.toString("utf8") || parsed.kind !== kind) throw new Error("immutable evidence is not canonical");
  return parsed;
}
function requiredApproval(approvals, gate) {
  return (approvals || []).find((entry) => entry && entry.gate === gate && typeof entry.decision === "string" && entry.decision.length > 0);
}
function normalizeSource(source) {
  if (!source || typeof source.id !== "string" || !source.id) throw new TypeError("audit source id is required");
  const applicable = source.applicable !== false;
  const metadata = source.metadata || (applicable ? "unavailable" : "not-applicable");
  const tree = source.tree || (applicable ? "unknown" : "not-applicable");
  if (!OUTCOMES.has(metadata) || !OUTCOMES.has(tree)) throw new Error("audit source outcome is invalid");
  if (!applicable && (metadata !== "not-applicable" || tree !== "not-applicable")) throw new Error("not-applicable source requires verified non-applicability");
  if (applicable && tree === "not-applicable") throw new Error("applicable source cannot be not-applicable");
  return { id: source.id, applicable, metadata, tree, bounds: source.bounds || "bounded", evidence: source.evidence || null };
}
function collectCandidateRecoveryAudit(state, options = {}) {
  if (!state || !state.lineage_id || !state.current_candidate_id) throw new TypeError("lineage identity is required");
  const root = rootPath(options.changeRoot);
  const configured = options.sources || [];
  const byId = new Map(configured.map((source) => [source.id, source]));
  const sourceIds = [...INVENTORY, ...configured.filter((source) => !INVENTORY.includes(source.id)).map((source) => source.id)];
  const sources = sourceIds.map((id) => normalizeSource(byId.get(id) || { id, applicable: false }));
  if (sources.some((source) => source.applicable && source.tree === "unknown")) throw new Error("candidate recovery audit is incomplete: unknown source-tree result");
  if (sources.some((source) => source.tree === "recovered")) throw new Error("candidate recovery audit found a recoverable source tree");
  const audit = {
    kind: AUDIT_KIND, schema_version: 1, lineage_id: state.lineage_id,
    current_candidate_id: state.current_candidate_id,
    original_content_digest: state.candidate_recovery?.current?.content_digest || null,
    source_inventory: sources,
  };
  const digestValue = sha256(Buffer.from(stableSerialize(audit), "utf8"));
  const reference = { kind: "candidate-recovery-audit-ref/v1", schema_version: 1, content_digest: digestValue, relative_path: `.candidate-recovery-audit-${digestValue.slice(7)}.json` };
  writeImmutable(root, reference.relative_path, audit);
  return { ok: true, audit, reference };
}
function validateCandidateRecoveryAudit(state, reference, options = {}) {
  try {
    const audit = readImmutable(options.changeRoot, reference, AUDIT_KIND);
    if (audit.lineage_id !== state?.lineage_id || audit.current_candidate_id !== state?.current_candidate_id || audit.original_content_digest !== (state.candidate_recovery?.current?.content_digest || null)) throw new Error("audit does not bind the active Candidate");
    const ids = new Set(audit.source_inventory?.map((source) => source.id));
    if (!INVENTORY.every((id) => ids.has(id))) throw new Error("audit omitted a mandatory source");
    for (const source of audit.source_inventory) normalizeSource(source);
    if (audit.source_inventory.some((source) => source.applicable && source.tree === "unknown")) throw new Error("audit includes unknown recovery result");
    if (audit.source_inventory.some((source) => source.tree === "recovered")) throw new Error("audit found recoverable source bytes");
    return { ok: true, audit: clone(audit), reference: clone(reference) };
  } catch (error) { return { ok: false, reason_code: "candidate-recovery-audit-invalid", error: error.message }; }
}
function persistRecoveryOperation(changeRoot, input) {
  const root = rootPath(changeRoot);
  if (!input || typeof input.type !== "string" || !input.type || !("input" in input) || !("expected_output" in input)) throw new TypeError("operation type, input and expected_output are required");
  const { operation, reference } = recoveryOperationRecord(input);
  const persisted = writeImmutable(root, reference.relative_path, operation, { withStatus: true });
  return { operation, reference: persisted.reference, created: persisted.created };
}

function recoveryOperationRecord(input) {
  if (!input || typeof input.type !== "string" || !input.type || !("input" in input) || !("expected_output" in input)) throw new TypeError("operation type, input and expected_output are required");
  const operation = { kind: OPERATION_KIND, schema_version: 1, status: "pending", type: input.type, input_digest: sha256(Buffer.from(stableSerialize(input.input))), expected_output_digest: sha256(Buffer.from(stableSerialize(input.expected_output))), input: clone(input.input), expected_output: clone(input.expected_output) };
  operation.operation_id = sha256(Buffer.from(stableSerialize(operation)));
  const digestValue = sha256(Buffer.from(stableSerialize(operation)));
  return {
    operation,
    reference: { kind: "verify-lineage-operation-ref/v1", schema_version: 1, content_digest: digestValue, relative_path: `.verify-lineage-operation-${digestValue.slice(7)}.json` },
  };
}

function frozenDirectedRecipes(lineage) {
  let index = 0;
  return (lineage?.findings || []).flatMap((finding) => (finding.validation?.commands || []).map((command) => {
    const input = { type: "directed-recheck-command", input: { lineage_id: lineage.lineage_id, finding_id: finding.id, command, index: index++ }, expected_output: { command } };
    return { finding_id: finding.id, command, index: input.input.index, ...recoveryOperationRecord(input) };
  }));
}

function assertDirectedRecheckOperation(operation) {
  if (
    operation.type !== "directed-recheck-command" ||
    typeof operation.operation_id !== "string" ||
    typeof operation.input?.lineage_id !== "string" ||
    typeof operation.input?.finding_id !== "string" ||
    typeof operation.input?.command !== "string" ||
    !Number.isInteger(operation.input?.index) ||
    operation.input.index < 0 ||
    operation.expected_output?.command !== operation.input.command
  ) throw new Error("directed recheck operation is invalid");
}

function readDirectedRecheckOperation(changeRoot, reference) {
  const pending = readImmutable(changeRoot, reference, OPERATION_KIND);
  assertDirectedRecheckOperation(pending);
  const root = rootPath(changeRoot);
  const matching = [];
  for (const name of fs.readdirSync(root)) {
    const match = /^\.verify-lineage-operation-result-([a-f0-9]{64})\.json$/i.exec(name);
    if (!match) continue;
    const completed = readImmutable(changeRoot, { content_digest: `sha256:${match[1]}`, relative_path: name }, OPERATION_KIND);
    if (completed.operation_id !== pending.operation_id) continue;
    if (completed.status !== "completed" || completed.type !== pending.type || completed.input_digest !== pending.input_digest || completed.expected_output_digest !== pending.expected_output_digest) {
      throw new Error("directed recheck completion does not exactly reconcile its pending operation");
    }
    const output = completed.output;
    if (!output || output.command !== pending.input.command || !Object.hasOwn(output, "exit_code") || (output.exit_code !== null && !Number.isInteger(output.exit_code)) || typeof output.output !== "string") {
      throw new Error("directed recheck completion evidence is invalid");
    }
    matching.push(completed);
  }
  if (matching.length > 1) throw new Error("directed recheck completion is ambiguous");
  return { operation: pending, status: matching.length === 1 ? "completed" : "pending", completed: matching[0] || null };
}

function inspectDirectedRecheckOperation(changeRoot, reference) {
  const operation = readImmutable(changeRoot, reference, OPERATION_KIND);
  assertDirectedRecheckOperation(operation);
  const root = rootPath(changeRoot);
  const completions = [];
  for (const name of fs.readdirSync(root)) {
    const match = /^\.verify-lineage-operation-result-([a-f0-9]{64})\.json$/i.exec(name);
    if (!match) continue;
    const completionRef = { content_digest: `sha256:${match[1]}`, relative_path: name };
    let completion;
    try {
      completion = readImmutable(changeRoot, completionRef, OPERATION_KIND);
    } catch {
      continue;
    }
    if (completion.operation_id === operation.operation_id) completions.push({ completion, reference: completionRef });
  }
  if (completions.length === 0) return { operation, status: "pending", reason_code: "completion-absent" };
  if (completions.length > 1) return { operation, status: "unknown", reason_code: "completion-ambiguous", completions };
  const [{ completion, reference: completionRef }] = completions;
  if (
    completion.status !== "completed" || completion.type !== operation.type ||
    completion.input_digest !== operation.input_digest ||
    completion.expected_output_digest !== operation.expected_output_digest ||
    !completion.output || completion.output.command !== operation.input.command ||
    !Object.hasOwn(completion.output, "exit_code") ||
    (completion.output.exit_code !== null && !Number.isInteger(completion.output.exit_code)) ||
    typeof completion.output.output !== "string"
  ) return { operation, status: "unknown", reason_code: "completion-invalid", completion_reference: completionRef };
  return { operation, status: "completed", completion, completion_reference: completionRef };
}

function dispositionReference(disposition) {
  const contentDigest = sha256(Buffer.from(stableSerialize(disposition), "utf8"));
  return {
    kind: "directed-recheck-disposition-ref/v1",
    schema_version: 1,
    content_digest: contentDigest,
    relative_path: `.verify-lineage-operation-disposition-${contentDigest.slice(7)}.json`,
  };
}

function preserveDirectedRecheckOperation(changeRoot, reference, options = {}) {
  const inspected = inspectDirectedRecheckOperation(changeRoot, reference);
  if (inspected.status === "completed") {
    throw new Error("completed directed recheck operations cannot receive a non-reconcilable disposition");
  }
  if (typeof options.predecessor_lineage_id !== "string" || options.predecessor_lineage_id !== inspected.operation.input.lineage_id) {
    throw new Error("disposition predecessor lineage does not bind the directed operation");
  }
  const disposition = {
    kind: DISPOSITION_KIND,
    schema_version: 1,
    status: "non-reconcilable",
    preserved: true,
    predecessor_lineage_id: options.predecessor_lineage_id,
    operation_reference: clone(reference),
    operation_id: inspected.operation.operation_id,
    input_digest: inspected.operation.input_digest,
    expected_output_digest: inspected.operation.expected_output_digest,
    reason_code: inspected.reason_code,
    inspection: {
      status: inspected.status,
      completion_reference: inspected.completion_reference || null,
    },
  };
  const dispositionRef = dispositionReference(disposition);
  writeImmutable(rootPath(changeRoot), dispositionRef.relative_path, disposition);
  return { disposition, reference: dispositionRef };
}

function readDirectedRecheckDisposition(changeRoot, reference) {
  const disposition = readImmutable(changeRoot, reference, DISPOSITION_KIND);
  if (
    disposition.status !== "non-reconcilable" || disposition.preserved !== true ||
    typeof disposition.predecessor_lineage_id !== "string" || typeof disposition.operation_id !== "string" ||
    typeof disposition.input_digest !== "string" || typeof disposition.expected_output_digest !== "string" ||
    !disposition.operation_reference || typeof disposition.reason_code !== "string"
  ) throw new Error("directed recheck disposition is invalid");
  return { disposition: clone(disposition), reference: clone(reference) };
}

function predecessorReference(predecessor) {
  const contentDigest = sha256(Buffer.from(stableSerialize(predecessor), "utf8"));
  return {
    kind: "verify-lineage-predecessor-ref/v1", schema_version: 1, content_digest: contentDigest,
    relative_path: `.verify-lineage-predecessor-${contentDigest.slice(7)}.json`,
  };
}

function collectReconciliationSuccessorAudit(predecessor, options = {}) {
  const root = rootPath(options.changeRoot);
  if (!predecessor || typeof predecessor.lineage_id !== "string" || !predecessor.candidate_recovery?.current) throw new TypeError("predecessor lineage with Candidate reference is required");
  const predecessorPayload = { kind: PREDECESSOR_KIND, schema_version: 1, lineage: clone(predecessor) };
  const predecessorRef = predecessorReference(predecessorPayload);
  writeImmutable(root, predecessorRef.relative_path, predecessorPayload);
  const dispositionRefs = options.dispositions || [];
  const expected = frozenDirectedRecipes(predecessor);
  if (dispositionRefs.length !== expected.length) throw new Error("reconciliation audit requires one disposition for every frozen recipe");
  const byOperation = new Map();
  for (const dispositionRef of dispositionRefs) {
    const { disposition } = readDirectedRecheckDisposition(options.changeRoot, dispositionRef);
    if (disposition.predecessor_lineage_id !== predecessor.lineage_id) throw new Error("disposition does not bind predecessor lineage");
    byOperation.set(disposition.operation_id, { disposition, reference: clone(dispositionRef) });
  }
  const recipes = expected.map(({ finding_id, command, index, operation, reference }) => {
    const entry = byOperation.get(operation.operation_id);
    if (!entry || !sameImmutableReference(entry.disposition.operation_reference, reference) || entry.disposition.input_digest !== operation.input_digest || entry.disposition.expected_output_digest !== operation.expected_output_digest) {
      throw new Error("reconciliation audit disposition inventory is incomplete or mismatched");
    }
    return { finding_id, command, index, operation_reference: reference, disposition_reference: entry.reference };
  });
  const audit = {
    kind: RECONCILIATION_AUDIT_KIND, schema_version: 1, predecessor_lineage_id: predecessor.lineage_id,
    predecessor_reference: predecessorRef, candidate_reference: clone(predecessor.candidate_recovery.current),
    recipes, approval_ids: (options.approvals || []).map((approval) => approval?.id).filter(Boolean).sort(),
  };
  const contentDigest = sha256(Buffer.from(stableSerialize(audit), "utf8"));
  const reference = { kind: "reconciliation-successor-audit-ref/v1", schema_version: 1, content_digest: contentDigest, relative_path: `.reconciliation-successor-audit-${contentDigest.slice(7)}.json` };
  writeImmutable(root, reference.relative_path, audit);
  return { audit, reference };
}

function validateReconciliationSuccessorAudit(predecessor, reference, options = {}) {
  try {
    const audit = readImmutable(options.changeRoot, reference, RECONCILIATION_AUDIT_KIND);
    if (audit.predecessor_lineage_id !== predecessor?.lineage_id) throw new Error("reconciliation audit predecessor identity mismatch");
    const storedPredecessor = readImmutable(options.changeRoot, audit.predecessor_reference, PREDECESSOR_KIND);
    if (stableSerialize(storedPredecessor.lineage) !== stableSerialize(predecessor)) throw new Error("reconciliation audit predecessor bytes mismatch");
    if (stableSerialize(audit.candidate_reference) !== stableSerialize(predecessor.candidate_recovery?.current)) throw new Error("reconciliation audit Candidate reference mismatch");
    const expected = frozenDirectedRecipes(predecessor);
    if (!Array.isArray(audit.recipes) || audit.recipes.length !== expected.length) throw new Error("reconciliation audit recipe coverage is incomplete");
    for (const item of expected) {
      const bound = audit.recipes.find((entry) => entry.finding_id === item.finding_id && entry.index === item.index && entry.command === item.command && sameImmutableReference(entry.operation_reference, item.reference));
      if (!bound) throw new Error("reconciliation audit recipe identity mismatch");
      const { disposition } = readDirectedRecheckDisposition(options.changeRoot, bound.disposition_reference);
      if (disposition.predecessor_lineage_id !== predecessor.lineage_id || disposition.operation_id !== item.operation.operation_id || !sameImmutableReference(disposition.operation_reference, item.reference)) throw new Error("reconciliation audit disposition binding mismatch");
    }
    return { ok: true, audit: clone(audit), reference: clone(reference) };
  } catch (error) { return { ok: false, reason_code: "reconciliation-successor-audit-invalid", error: error.message }; }
}

function completeDirectedRecheckOperation(changeRoot, reference, output) {
  const current = readDirectedRecheckOperation(changeRoot, reference);
  if (current.status === "completed") return current;
  if (!output || output.command !== current.operation.input.command || !Object.hasOwn(output, "exit_code") || (output.exit_code !== null && !Number.isInteger(output.exit_code)) || typeof output.output !== "string") {
    throw new Error("directed recheck output is invalid");
  }
  const completed = { ...current.operation, status: "completed", output: clone(output) };
  writeImmutable(rootPath(changeRoot), `.verify-lineage-operation-result-${sha256(Buffer.from(stableSerialize(completed))).slice(7)}.json`, completed);
  return readDirectedRecheckOperation(changeRoot, reference);
}
function reconcileRecoveryOperation(changeRoot, reference, input = {}) {
  const pending = readImmutable(changeRoot, reference, OPERATION_KIND);
  if (!("output" in input)) return clone(pending);
  if (sha256(Buffer.from(stableSerialize(input.output))) !== pending.expected_output_digest) throw new Error("operation output does not match persisted expectation");
  // Completion gets its own immutable record; the pending record is never overwritten.
  const completed = { ...pending, status: "completed", output: clone(input.output) };
  const result = writeImmutable(rootPath(changeRoot), `.verify-lineage-operation-result-${sha256(Buffer.from(stableSerialize(completed))).slice(7)}.json`, completed);
  return { ...completed, result_reference: result };
}

module.exports = { AUDIT_KIND, OPERATION_KIND, DISPOSITION_KIND, RECONCILIATION_AUDIT_KIND, collectCandidateRecoveryAudit, validateCandidateRecoveryAudit, persistRecoveryOperation, recoveryOperationRecord, frozenDirectedRecipes, reconcileRecoveryOperation, readDirectedRecheckOperation, inspectDirectedRecheckOperation, completeDirectedRecheckOperation, preserveDirectedRecheckOperation, readDirectedRecheckDisposition, collectReconciliationSuccessorAudit, validateReconciliationSuccessorAudit, requiredApproval, readImmutable, writeImmutable, sha256 };
