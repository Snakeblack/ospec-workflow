"use strict";

const path = require("node:path");
const { sha256Fingerprint, stableSerialize } = require("./canonical-json.js");
const { validateCandidateV2, computeCandidateId, computeSourceSnapshotId } = require("./execution-identities/index.js");
const { compileExecutionGraph, validatePolicySnapshotBinding, validateExecutionGraphBinding } = require("./execution-graph/index.js");
const { validateInstance, loadSchemaById } = require("./kernel-schema-validator.js");
const { computeVerificationId } = require("./independent-verifier/verdict.js");
const assuranceGraph = require("./assurance-graph/index.js");
const { QUALITY_DOMAINS } = require("./review-taxonomy.js");

const ROOT = path.resolve(__dirname, "../..");
const VERIFICATION_SCHEMA_ID = "ospec://schemas/kernel/verification/v2";
const SOURCE_SNAPSHOT_SCHEMA_ID = "ospec://schemas/kernel/source-snapshot/v1";
const RULE_PREFIX = "k7/v1:";
const K7_PREFIX = /^k7(?:\/|:)/;
const SUBJECT_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
let verificationSchema = null;
let sourceSnapshotSchema = null;

function fail(reason_code, error) {
  return { ok: false, reason_code, error: error || reason_code };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function getVerificationSchema() {
  if (!verificationSchema) {
    verificationSchema = loadSchemaById(VERIFICATION_SCHEMA_ID, { rootDir: ROOT });
  }
  return verificationSchema;
}

function getSourceSnapshotSchema() {
  if (!sourceSnapshotSchema) {
    sourceSnapshotSchema = loadSchemaById(SOURCE_SNAPSHOT_SCHEMA_ID, { rootDir: ROOT });
  }
  return sourceSnapshotSchema;
}

function canonicalSubjectId(value) {
  if (typeof value !== "string" || !SUBJECT_ID.test(value)) return null;
  return value;
}

/**
 * K7 owns only rules carrying the k7/ version prefix. Generic K4a rules remain
 * opaque input to this parser so K7 cannot change their semantics.
 */
function parseK7ReviewRules(effectiveRules) {
  if (!Array.isArray(effectiveRules) || effectiveRules.some((rule) => typeof rule !== "string")) {
    return fail("K7_POLICY_RULE_INVALID", "PolicySnapshot.effective_rules must be a string array");
  }

  const mapping = new Map();
  let noModel = null;
  let k7RuleCount = 0;
  for (const rule of effectiveRules) {
    if (!K7_PREFIX.test(rule)) continue;
    k7RuleCount += 1;
    if (!rule.startsWith(RULE_PREFIX)) {
      return fail("K7_POLICY_RULE_INVALID", `unsupported K7 rule version: ${rule}`);
    }

    const noModelMatch = /^k7\/v1:no-model=(allow|deny)$/.exec(rule);
    if (noModelMatch) {
      if (noModel !== null) return fail("K7_POLICY_RULE_INVALID", "duplicate no-model rule");
      noModel = noModelMatch[1];
      continue;
    }

    const mappingMatch = /^k7\/v1:(obligation|signal):([a-z0-9][a-z0-9._/-]{0,127})=(trust|runtime|evolution|efficiency)$/.exec(rule);
    if (!mappingMatch) return fail("K7_POLICY_RULE_INVALID", `unknown K7 rule: ${rule}`);
    const [, kind, subjectId, domain] = mappingMatch;
    const key = `${kind}\0${subjectId}`;
    if (mapping.has(key)) {
      const prior = mapping.get(key);
      return fail(
        "K7_POLICY_RULE_INVALID",
        prior.domain === domain ? `duplicate K7 mapping: ${rule}` : `conflicting K7 mapping: ${rule}`
      );
    }
    mapping.set(key, { kind, id: subjectId, domain, rule });
  }

  if (k7RuleCount === 0) {
    return fail("K7_POLICY_RULE_INVALID", "PolicySnapshot has no K7/v1 selection rules");
  }
  return {
    ok: true,
    rules: deepFreeze({
      schema_version: 1,
      mappings: [...mapping.values()].sort((left, right) => left.rule.localeCompare(right.rule)),
      no_model: noModel || "deny",
    }),
  };
}

function normalizeResidual(residual) {
  if (!exactKeys(residual, ["obligations", "signals"])) {
    return fail("K7_RESIDUAL_INVALID", "residual must contain exactly obligations and signals");
  }
  const normalizeList = (items, kind) => {
    if (!Array.isArray(items)) return null;
    const ids = new Set();
    const normalized = [];
    for (const item of items) {
      if (!exactKeys(item, ["id", "material"]) || !canonicalSubjectId(item.id) || typeof item.material !== "boolean") {
        return null;
      }
      if (ids.has(item.id)) return null;
      ids.add(item.id);
      normalized.push({ id: item.id, material: item.material, kind });
    }
    return normalized.sort((left, right) => left.id.localeCompare(right.id));
  };
  const obligations = normalizeList(residual.obligations, "obligation");
  const signals = normalizeList(residual.signals, "signal");
  if (!obligations || !signals) {
    return fail("K7_RESIDUAL_INVALID", "residual subjects must be unique typed material declarations");
  }
  return { ok: true, residual: { obligations, signals } };
}

function computeNormalizedResidualDigest(residual) {
  return sha256Fingerprint("k7-residual/v1", residual);
}

function computeResidualDigest(residual) {
  const normalized = normalizeResidual(residual);
  if (!normalized.ok) throw new TypeError(normalized.error);
  return computeNormalizedResidualDigest(normalized.residual);
}

/**
 * Counts a canonical unified diff without trusting caller-provided line totals.
 * The same parser is used by K7 lineage genesis and is deliberately strict:
 * malformed headers, hunk counts, or repository-escaping paths are rejected.
 */
function countCanonicalCandidateDiff(diffBytes) {
  if (typeof diffBytes !== "string" || diffBytes.length === 0) {
    throw new TypeError("candidate_diff must be non-empty canonical unified diff text");
  }
  const lines = diffBytes.replaceAll("\r\n", "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  let added_lines = 0;
  let removed_lines = 0;
  const paths = new Set();
  let index = 0;
  while (index < lines.length) {
    const section = /^diff --git a\/(.+) b\/(.+)$/.exec(lines[index]);
    if (!section) throw new TypeError(`candidate_diff requires diff --git header at line ${index + 1}`);
    const oldPath = canonicalDiffPath(section[1]);
    const newPath = canonicalDiffPath(section[2]);
    index += 1;
    let oldMarker = null;
    let newMarker = null;
    let hunks = 0;
    while (index < lines.length && !lines[index].startsWith("diff --git ")) {
      const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(lines[index]);
      if (!hunk) {
        if (lines[index].startsWith("--- ")) {
          if (oldMarker !== null) throw new TypeError(`candidate_diff duplicate old marker at line ${index + 1}`);
          oldMarker = canonicalDiffMarker(lines[index].slice(4), oldPath, "a");
        } else if (lines[index].startsWith("+++ ")) {
          if (oldMarker === null || newMarker !== null) throw new TypeError(`candidate_diff invalid new marker at line ${index + 1}`);
          newMarker = canonicalDiffMarker(lines[index].slice(4), newPath, "b");
        } else if (lines[index].startsWith("@@") || !/^(?:index |(?:new|deleted) file mode |(?:old|new) mode |(?:dis)?similarity index |(?:rename|copy) (?:from|to) )/.test(lines[index])) {
          throw new TypeError(`candidate_diff invalid metadata at line ${index + 1}`);
        }
        index += 1;
        continue;
      }
      if (oldMarker === null || newMarker === null) throw new TypeError(`candidate_diff hunk lacks file markers at line ${index + 1}`);
      hunks += 1;
      const expectedOld = hunk[2] === undefined ? 1 : Number(hunk[2]);
      const expectedNew = hunk[4] === undefined ? 1 : Number(hunk[4]);
      let actualOld = 0;
      let actualNew = 0;
      index += 1;
      while (index < lines.length && !lines[index].startsWith("diff --git ") && !lines[index].startsWith("@@")) {
        const line = lines[index];
        if (line === "\\ No newline at end of file") { index += 1; continue; }
        if (!/^[ +\-]/.test(line)) throw new TypeError(`candidate_diff invalid hunk content at line ${index + 1}`);
        if (line[0] !== "+") actualOld += 1;
        if (line[0] !== "-") actualNew += 1;
        if (line[0] === "+") added_lines += 1;
        if (line[0] === "-") removed_lines += 1;
        index += 1;
      }
      if (actualOld !== expectedOld || actualNew !== expectedNew) throw new TypeError(`candidate_diff hunk count mismatch at line ${index + 1}`);
    }
    if (hunks === 0) throw new TypeError(`candidate_diff section for ${newPath} has no hunk`);
    if (oldMarker !== "/dev/null") paths.add(oldPath);
    if (newMarker !== "/dev/null") paths.add(newPath);
  }
  if (paths.size === 0) throw new TypeError("candidate_diff must affect at least one repository path");
  return Object.freeze({
    added_lines,
    removed_lines,
    changed_lines: added_lines + removed_lines,
    paths: [...paths].sort(),
  });
}

function canonicalDiffPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) throw new TypeError("candidate_diff path is invalid");
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new TypeError(`candidate_diff path escapes repository: ${value}`);
  }
  return normalized;
}

function canonicalDiffMarker(value, expectedPath, prefix) {
  const marker = value.trim().split("\t")[0];
  if (marker === "/dev/null") return marker;
  if (marker !== `${prefix}/${expectedPath}`) throw new TypeError(`candidate_diff ${prefix === "a" ? "old" : "new"} marker does not match diff header`);
  return expectedPath;
}

function validateCandidate(candidate) {
  try {
    if (!validateCandidateV2(candidate) || candidate.kind !== "candidate/v2" || candidate.schema_version !== 2) {
      return fail("K7_CANDIDATE_INVALID", "Candidate must be canonical Candidate v2");
    }
    if (candidate.candidate_id !== computeCandidateId(candidate)) {
      return fail("K7_CANDIDATE_INVALID", "CandidateId does not match canonical Candidate v2");
    }
    return { ok: true };
  } catch (error) {
    return fail("K7_CANDIDATE_INVALID", error.message);
  }
}

function validateSourceSnapshotBinding(sourceSnapshot, candidate, executionGraph) {
  try {
    if (!isRecord(sourceSnapshot) || !validateInstance(getSourceSnapshotSchema(), sourceSnapshot).valid) {
      return fail("K7_SOURCE_SNAPSHOT_INVALID", "sourceSnapshot must satisfy source-snapshot/v1 schema");
    }
    const snapshotId = computeSourceSnapshotId(sourceSnapshot);
    if (
      sourceSnapshot.source_snapshot_id !== snapshotId ||
      executionGraph.source_snapshot_id !== snapshotId ||
      candidate.repository_id !== sourceSnapshot.repository_id ||
      candidate.base_tree !== sourceSnapshot.base_tree_digest ||
      candidate.projection !== sourceSnapshot.projection
    ) {
      return fail("K7_SOURCE_SNAPSHOT_INVALID", "Candidate, SourceSnapshot, and ExecutionGraph must share one recomputed source identity");
    }
    return { ok: true };
  } catch (error) {
    return fail("K7_SOURCE_SNAPSHOT_INVALID", error.message);
  }
}

function validatePolicyAndGraph(policySnapshot, executionGraph, sourceSnapshot) {
  const policy = validatePolicySnapshotBinding(policySnapshot);
  if (!policy.ok) return fail("K7_POLICY_INVALID", policy.error || policy.reason_code);
  const graph = validateExecutionGraphBinding(executionGraph, { policySnapshot, sourceSnapshot });
  if (!graph.ok) return fail("K7_GRAPH_INVALID", graph.error || graph.reason_code);
  if (executionGraph.policy_bundle_digest !== policySnapshot.policy_bundle_digest) {
    return fail("K7_GRAPH_INVALID", "Execution Graph policy bundle digest differs from PolicySnapshot");
  }
  return { ok: true };
}

function isApprovedDeferred(obligation) {
  return Boolean(
    obligation && obligation.deferred && typeof obligation.deferred === "object" &&
    typeof obligation.deferred.reason === "string" && obligation.deferred.reason.trim() &&
    typeof obligation.deferred.approved_by === "string" && obligation.deferred.approved_by.trim()
  );
}

function validateContractDenominator(contract, executionGraph, policySnapshot, sourceSnapshot) {
  if (!isRecord(contract) || typeof contract.contract_digest !== "string" || contract.contract_digest !== executionGraph.contract_digest) {
    return fail("K7_CONTRACT_INVALID", "contract must bind its digest to the ExecutionGraph");
  }
  if (!Array.isArray(contract.obligations) || contract.source_snapshot_id !== executionGraph.source_snapshot_id) {
    return fail("K7_CONTRACT_INVALID", "contract obligations and source snapshot binding are required");
  }
  const contractIds = contract.obligations.map((obligation) => obligation && obligation.id);
  const graphIds = (executionGraph.obligations || []).map((obligation) => obligation && obligation.id);
  if (
    contractIds.some((id) => !canonicalSubjectId(id)) ||
    new Set(contractIds).size !== contractIds.length ||
    new Set(graphIds).size !== graphIds.length ||
    contractIds.length !== graphIds.length ||
    contractIds.some((id) => !graphIds.includes(id))
  ) {
    return fail("K7_CONTRACT_INVALID", "contract and ExecutionGraph obligation denominators diverge");
  }
  try {
    const recompiled = compileExecutionGraph({
      contract,
      policySnapshot,
      sourceSnapshot,
      nodes: executionGraph.nodes,
      obligations: executionGraph.obligations,
    });
    if (recompiled.graph_id !== executionGraph.graph_id) {
      return fail("K7_CONTRACT_INVALID", "ExecutionGraph does not recompile from the supplied contract denominator");
    }
  } catch (error) {
    return fail("K7_CONTRACT_INVALID", error.message);
  }
  return {
    ok: true,
    material_obligation_ids: contract.obligations
      .filter((obligation) => String(obligation.criticality || "must").toLowerCase() === "must" && !isApprovedDeferred(obligation))
      .map((obligation) => obligation.id)
      .sort(),
  };
}

function validateResidualDenominator(residual, materialObligationIds) {
  // K7-1 can prove only the contract's MUST-obligation denominator. It has no
  // independent signal oracle, so caller-declared signals are deferred to K7-2.
  if (residual.signals.length !== 0) {
    return fail("K7_SIGNAL_DENOMINATOR_UNAVAILABLE", "K7-1 has no independently validated signal denominator");
  }
  const declared = new Map(residual.obligations.map((obligation) => [obligation.id, obligation]));
  if (
    declared.size !== materialObligationIds.length ||
    materialObligationIds.some((id) => !declared.has(id) || !declared.get(id).material)
  ) {
    return fail("K7_RESIDUAL_INCOMPLETE", "residual must mark every material contract obligation");
  }
  return { ok: true };
}

function validateVerification(verification, candidateId) {
  try {
    if (!isRecord(verification) || !validateInstance(getVerificationSchema(), verification).valid) {
      return fail("K7_K6B_INVALID", "K6b verification must satisfy verification/v2 schema");
    }
    if (verification.candidate_id !== candidateId || verification.verdict !== "PASS") {
      return fail("K7_K6B_INVALID", "K6b verification must be a PASS bound to the Candidate");
    }
    if (verification.verification_id !== computeVerificationId(
      verification.candidate_id,
      verification.verdict,
      verification.evidence_ids
    )) {
      return fail("K7_K6B_INVALID", "K6b verification identity does not recompute");
    }
    return { ok: true };
  } catch (error) {
    return fail("K7_K6B_INVALID", error.message);
  }
}

function validateK6bBinding(k6b, candidate, executionGraph, policySnapshot) {
  const keys = [
    "verification",
    "assurance_graph",
    "evidence",
    "assessments",
    "replay_evidence",
    "runner_receipt_channel",
  ];
  if (!exactKeys(k6b, keys)) return fail("K7_K6B_INVALID", "K6b bundle has missing or unknown fields");
  const verification = validateVerification(k6b.verification, candidate.candidate_id);
  if (!verification.ok) return verification;

  let replay;
  try {
    replay = assuranceGraph.validateReplayRecords({
      candidate,
      executionGraph,
      policySnapshot,
      verification: k6b.verification,
      evidence: k6b.replay_evidence,
      assessments: k6b.assessments,
      runnerReceiptChannel: k6b.runner_receipt_channel,
    });
  } catch (error) {
    return fail("K7_K6B_INVALID", error.message);
  }
  if (!replay.ok) return fail("K7_K6B_INVALID", replay.error || replay.reason_code);

  const replayEvidence = canonicalEvidenceSet(k6b.replay_evidence, true);
  const presentedEvidence = canonicalEvidenceSet(k6b.evidence, false);
  if (!replayEvidence || !presentedEvidence) {
    return fail("K7_K6B_INVALID", "K6b evidence sets must be canonical arrays");
  }
  if (stableSerialize(replayEvidence) !== stableSerialize(presentedEvidence)) {
    return fail("K7_K6B_EVIDENCE_DIVERGENCE", "K6b evidence differs from the replay-validated evidence set");
  }

  const reconciled = assuranceGraph.reconcileAssuranceGraph(k6b.assurance_graph, {
    canonicalInputs: k6b.assurance_graph && k6b.assurance_graph.canonical_inputs,
    candidate,
    executionGraph,
    policySnapshot,
    evidence: k6b.evidence,
    assessments: k6b.assessments,
    verification: k6b.verification,
  });
  if (!reconciled.ok) return fail("K7_GRAPH_INVALID", reconciled.error || reconciled.reason_code);
  return { ok: true };
}

function canonicalEvidenceSet(items, nested) {
  if (!Array.isArray(items)) return null;
  const records = items.map((item) => nested ? item && item.evidence : item);
  if (records.some((record) => !isRecord(record) || typeof record.evidence_id !== "string")) return null;
  const ids = records.map((record) => record.evidence_id);
  if (new Set(ids).size !== ids.length) return null;
  return [...records].sort((left, right) => left.evidence_id.localeCompare(right.evidence_id));
}

function buildSelection(rules, residual) {
  const selected = new Set();
  const selectedBy = [];
  for (const subject of [...residual.obligations, ...residual.signals]) {
    if (!subject.material) continue;
    const rule = rules.mappings.find((entry) => entry.kind === subject.kind && entry.id === subject.id);
    if (!rule) {
      return fail("K7_RESIDUAL_UNMAPPED", `material ${subject.kind} ${subject.id} has no K7 policy mapping`);
    }
    selected.add(rule.domain);
    selectedBy.push({ kind: subject.kind, id: subject.id, domain: rule.domain, rule: rule.rule });
  }
  return {
    ok: true,
    selection: {
      selected_domains: QUALITY_DOMAINS.filter((domain) => selected.has(domain)),
      selected_by: selectedBy.sort((left, right) => (
        left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id) || left.domain.localeCompare(right.domain)
      )),
    },
  };
}

/**
 * Produces an immutable K7 selection/binding. It validates existing K1/K6b
 * records but deliberately does not mutate a lineage or invoke a reviewer.
 */
function createK7ReviewSelection(input) {
  const requiredInputKeys = ["candidate", "sourceSnapshot", "contract", "policySnapshot", "executionGraph", "k6b", "residual"];
  const allowedInputKeys = new Set([...requiredInputKeys, "no_model_discharge"]);
  if (!isRecord(input) || requiredInputKeys.some((key) => !Object.hasOwn(input, key)) || Object.keys(input).some((key) => !allowedInputKeys.has(key))) {
    return fail("K7_INPUT_INVALID", "K7 input must contain Candidate, SourceSnapshot, contract, policy, graph, K6b, and residual; only no_model_discharge is optional");
  }
  const candidate = validateCandidate(input.candidate);
  if (!candidate.ok) return candidate;
  const source = validateSourceSnapshotBinding(input.sourceSnapshot, input.candidate, input.executionGraph);
  if (!source.ok) return source;
  const policyGraph = validatePolicyAndGraph(input.policySnapshot, input.executionGraph, input.sourceSnapshot);
  if (!policyGraph.ok) return policyGraph;
  const contract = validateContractDenominator(
    input.contract,
    input.executionGraph,
    input.policySnapshot,
    input.sourceSnapshot
  );
  if (!contract.ok) return contract;
  const rules = parseK7ReviewRules(input.policySnapshot.effective_rules);
  if (!rules.ok) return rules;
  const residual = normalizeResidual(input.residual);
  if (!residual.ok) return residual;
  const denominator = validateResidualDenominator(residual.residual, contract.material_obligation_ids);
  if (!denominator.ok) return denominator;
  const k6b = validateK6bBinding(input.k6b, input.candidate, input.executionGraph, input.policySnapshot);
  if (!k6b.ok) return k6b;
  const selected = buildSelection(rules.rules, residual.residual);
  if (!selected.ok) return selected;

  if (selected.selection.selected_domains.length === 0) {
    // K6b proves listed MUST-obligation evidence, but neither K6b nor the
    // contract API exposes an independently sourced complete residual
    // denominator. A caller-supplied residual or discharge cannot fill that
    // gap. K7-2 owns admission after that independent coverage exists.
    return fail(
      "K7_NO_MODEL_DEFERRED",
      "no-model admission is deferred to K7-2 pending independently validated residual coverage"
    );
  }
  if (input.no_model_discharge !== undefined && input.no_model_discharge !== null) {
    return fail("K7_NO_MODEL_DISCHARGE_INVALID", "no-model discharge cannot accompany selected review domains");
  }

  const selection = {
    schema_version: 1,
    kind: "k7-review-selection/v1",
    selected_domains: selected.selection.selected_domains,
    selected_by: selected.selection.selected_by,
    no_model: false,
  };
  const bindingBody = {
    schema_version: 1,
    kind: "k7-review-binding/v1",
    issuance: input,
    candidate: input.candidate,
    candidate_id: input.candidate.candidate_id,
    source_snapshot_id: input.sourceSnapshot.source_snapshot_id,
    contract_digest: input.contract.contract_digest,
    policy_snapshot_id: input.policySnapshot.snapshot_id,
    policy_bundle_digest: input.policySnapshot.policy_bundle_digest,
    execution_graph_id: input.executionGraph.graph_id,
    verification_id: input.k6b.verification.verification_id,
    assurance_graph_id: input.k6b.assurance_graph.graph_id,
    residual_digest: computeNormalizedResidualDigest(residual.residual),
    selection,
    no_model_discharge_id: null,
  };
  const binding = { ...bindingBody, binding_id: sha256Fingerprint("k7-review-binding/v1", bindingBody) };
  return { ok: true, binding_id: binding.binding_id, binding: deepFreeze(binding), selection: binding.selection };
}

/**
 * Replays K7 issuance rather than trusting a caller-supplied self-hash.
 * A binding is valid only when the full Candidate/Policy/K6b/residual issuance
 * reproduces byte-for-byte the presented binding and its identity.
 */
function validateK7ReviewBinding(binding) {
  if (!isRecord(binding) || !isRecord(binding.issuance)) {
    return fail("K7_BINDING_ISSUANCE_INVALID", "K7 binding must retain its full validated issuance");
  }
  const issued = createK7ReviewSelection(binding.issuance);
  if (!issued.ok) return fail("K7_BINDING_ISSUANCE_INVALID", issued.error || issued.reason_code);
  if (binding.binding_id !== issued.binding_id || stableSerialize(binding) !== stableSerialize(issued.binding)) {
    return fail("K7_BINDING_ISSUANCE_INVALID", "K7 binding differs from its revalidated issuance");
  }
  return { ok: true, binding: issued.binding };
}

module.exports = {
  parseK7ReviewRules,
  computeResidualDigest,
  countCanonicalCandidateDiff,
  createK7ReviewSelection,
  validateK7ReviewBinding,
};
