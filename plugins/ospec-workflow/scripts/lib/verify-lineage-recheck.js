"use strict";

const childProcess = require("node:child_process");
const { computeContractDigestFromArtifacts, evaluateRecheck } = require("./verify-lineage.js");
const { recoverCandidateSnapshot } = require("./verify-lineage-candidate-store.js");
const {
  persistRecoveryOperation,
  readDirectedRecheckOperation,
  completeDirectedRecheckOperation,
  readImmutable,
  writeImmutable,
  sha256,
  OPERATION_KIND,
} = require("./verify-lineage-recovery.js");
const { stableSerialize } = require("./verify-lineage-candidate-store.js");

const JOURNAL_KIND = "directed-recheck-journal/v1";

function frozenRecipeEntries(lineage) {
  let index = 0;
  return lineage.findings
    .flatMap((finding) => finding.validation.commands.map((command) => ({
      finding,
      command,
      index: index++,
    })));
}

function journalReference(manifest) {
  const contentDigest = sha256(Buffer.from(stableSerialize(manifest), "utf8"));
  return {
    kind: "directed-recheck-journal-ref/v1", schema_version: 1, content_digest: contentDigest,
    relative_path: `.directed-recheck-journal-${contentDigest.slice(7)}.json`,
  };
}

function createDirectedRecheckJournal(lineage, options = {}) {
  if (!lineage?.recovery_successor || lineage.status !== "recheck-pending") throw new Error("recheck-pending recovery successor is required");
  const recipes = frozenRecipeEntries(lineage).map(({ finding, command, index }) => ({ finding_id: finding.id, command, index }));
  const identity = {
    lineage_id: lineage.lineage_id, candidate_id: lineage.current_candidate_id,
    contract_digest: lineage.contract_digest, candidate_snapshot: lineage.candidate_snapshot, recipes,
  };
  const journalId = sha256(Buffer.from(stableSerialize(identity), "utf8"));
  const manifest = { kind: JOURNAL_KIND, schema_version: 1, journal_id: journalId, ...identity };
  const reference = journalReference(manifest);
  writeImmutable(options.changeRoot, reference.relative_path, manifest);
  const stored = readImmutable(options.changeRoot, reference, JOURNAL_KIND);
  if (stableSerialize(stored) !== stableSerialize(manifest)) throw new Error("directed recheck journal readback mismatch");
  return { manifest, reference };
}

function hasUnreconciledLegacyOperation(changeRoot, lineageId) {
  const fs = require("node:fs");
  const path = require("node:path");
  for (const name of fs.readdirSync(changeRoot)) {
    if (!/^\.verify-lineage-operation-[a-f0-9]{64}\.json$/i.test(name)) continue;
    try {
      const operation = readImmutable(changeRoot, { content_digest: `sha256:${name.match(/([a-f0-9]{64})/i)[1]}`, relative_path: name }, OPERATION_KIND);
      if (operation.type === "directed-recheck-command" && operation.input?.lineage_id === lineageId && !operation.input?.journal_id) return true;
    } catch { return true; }
  }
  return false;
}

function normalizeRecheckResults(entries) {
  const grouped = Object.fromEntries(entries.map(({ finding }) => [finding.id, true]));
  for (const entry of entries) {
    if (!entry.completed) throw new Error("directed recheck result is not durably completed");
    const expectedExit = entry.finding.validation.expected_exit ?? 0;
    const passed = entry.completed.output.exit_code === expectedExit;
    grouped[entry.finding.id] = grouped[entry.finding.id] && passed;
  }
  return grouped;
}

function runRecoverySuccessorRecheck(lineage, options = {}) {
  if (Object.hasOwn(options, "recheck_results")) throw new Error("caller-supplied recheck_results are not authority for directed recovery rechecks");
  if (!lineage || lineage.status !== "recheck-pending" || !lineage.recovery_successor) throw new Error("recheck-pending recovery successor is required");
  const changeRoot = options.changeRoot;
  if (!changeRoot) throw new TypeError("changeRoot is required");
  if (computeContractDigestFromArtifacts(changeRoot, { mode: options.mode || "standard" }) !== lineage.contract_digest) throw new Error("successor contract drift prevents recheck");
  const snapshot = recoverCandidateSnapshot(changeRoot, lineage.candidate_snapshot, lineage.current_candidate_id, {
    rootDir: options.rootDir,
    verifyLiveWorkspace: true,
  });
  if (!snapshot.ok) throw new Error(`successor snapshot invalid: ${snapshot.reason_code}`);
  if (hasUnreconciledLegacyOperation(changeRoot, lineage.lineage_id)) throw new Error("directed recheck reconciliation required before command execution: legacy operation");
  const journal = createDirectedRecheckJournal(lineage, { changeRoot });
  const recipes = frozenRecipeEntries(lineage).map((recipe) => {
    const persisted = persistRecoveryOperation(changeRoot, {
      type: "directed-recheck-command",
      input: {
        lineage_id: lineage.lineage_id, journal_id: journal.manifest.journal_id, manifest_digest: journal.reference.content_digest,
        finding_id: recipe.finding.id, command: recipe.command, index: recipe.index,
      },
      expected_output: { command: recipe.command },
    });
    const recovered = readDirectedRecheckOperation(changeRoot, persisted.reference);
    return { ...recipe, persisted, completed: recovered.completed };
  });

  const unreconciled = recipes.filter((recipe) => !recipe.completed && !recipe.persisted.created);
  if (unreconciled.length > 0) {
    const identities = unreconciled.map((recipe) => `${recipe.finding.id}:${recipe.index}`).join(", ");
    throw new Error(`directed recheck reconciliation required before command execution: ${identities}`);
  }

  const runCommand = options.runCommand || ((command) => childProcess.spawnSync(command, {
    cwd: options.rootDir || process.cwd(), shell: true, encoding: "utf8",
  }));
  for (const recipe of recipes.filter((recipe) => !recipe.completed)) {
    const execution = runCommand(recipe.command);
    const completed = completeDirectedRecheckOperation(changeRoot, recipe.persisted.reference, {
      command: recipe.command,
      exit_code: Number.isInteger(execution.status) ? execution.status : null,
      output: `${execution.stdout || ""}${execution.stderr || ""}`,
    });
    recipe.completed = completed.completed;
    if (!recipe.completed) throw new Error("directed recheck completion readback is required before evaluation");
    options.onCompletionPersisted?.(recipe.completed);
  }

  options.onBeforeEvaluate?.();
  return evaluateRecheck(lineage, {
    changeRoot,
    mode: options.mode || "standard",
    candidate: snapshot.candidate,
    recheck_results: normalizeRecheckResults(recipes),
    durable_recheck: true,
  });
}

module.exports = { runRecoverySuccessorRecheck, normalizeRecheckResults, createDirectedRecheckJournal };
