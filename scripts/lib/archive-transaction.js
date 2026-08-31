"use strict";

/**
 * Archive transaction runtime: pure reducer + I/O shell.
 * Staging/journal/receipt live under .ospec/archive-tx/{change}/.
 */

const crypto = require("node:crypto");
const path = require("node:path");
const fsp = require("node:fs/promises");
const {
  parsePlan,
  validatePlanShape,
  validatePlanAgainstSnapshot,
  isKnownRejectionCode,
  isSafeChangeName,
  isRelativeUnder,
} = require("./archive-plan.js");
const { renameWithFallback } = require("./atomic-write.js");

const TERMINAL_STATES = new Set(["done", "failed", "rolled-back"]);
const NON_TERMINAL = new Set([
  "init",
  "preflighted",
  "staged",
  "compared",
  "committing",
  "committed",
  "confirmed",
]);

function digestBytes(buf) {
  return `sha256:${crypto.createHash("sha256").update(buf).digest("hex")}`;
}

function fingerprintInventory(inventory) {
  const lines = inventory
    .slice()
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((e) => `${e.sha256}  ${e.path}\n`)
    .join("");
  return digestBytes(Buffer.from(lines, "utf8"));
}

/**
 * Pure reducer: decide the next transaction action from journal + facts.
 * @param {{state: string, plan_sha256?: string}} journal
 * @param {object} facts
 */
function nextTransactionAction(journal, facts) {
  const state = journal && journal.state ? journal.state : "init";
  const planSha = facts && facts.planSha256;
  const journalSha = journal && journal.plan_sha256;

  if (
    journalSha &&
    planSha &&
    journalSha !== planSha &&
    state !== "init" &&
    !TERMINAL_STATES.has(state)
  ) {
    return { action: "fail", failure_reason: "journal-plan-conflict" };
  }

  if (state === "failed" || state === "rolled-back") {
    return { action: "noop-terminal" };
  }
  if (state === "done") {
    return { action: "already-complete" };
  }

  if (facts && facts.requestRollback) {
    return { action: "rollback" };
  }

  switch (state) {
    case "init":
      return { action: "preflight" };
    case "preflighted":
      return { action: "stage" };
    case "staged":
      return { action: "compare-a" };
    case "compared":
      if (facts && facts.compareAOk === false) {
        return { action: "fail", failure_reason: "compare-mismatch" };
      }
      return { action: "commit" };
    case "committing":
      return { action: "commit" };
    case "committed":
      return { action: "compare-b" };
    case "confirmed":
      if (facts && facts.compareBOk === false) {
        return { action: "fail", failure_reason: "compare-mismatch" };
      }
      return { action: "delete-origin" };
    default:
      return { action: "fail", failure_reason: "io-error" };
  }
}

/**
 * Line-oriented reader for archive-relevant gate facts from state.yaml text.
 * Never throws.
 */
function yamlScalar(raw) {
  return String(raw || "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function readArchiveGateFacts(stateYamlText) {
  const text = typeof stateYamlText === "string" ? stateYamlText : "";
  const lines = text.split(/\r?\n/);

  let verdict = null;
  let inVerify = false;
  let inPhases = false;
  let qualityGatesPresent = false;
  let qualityGatesStatus = null;
  let overridePresent = false;
  let inQualityGates = false;
  let inBaseline = false;
  let baselineFingerprints = null;
  let inGates = false;
  let inApprovals = false;
  let approvalGate = null;
  let approvalDecision = null;

  function noteApprovalField(key, value) {
    if (key === "gate") approvalGate = yamlScalar(value);
    if (key === "decision") approvalDecision = yamlScalar(value);
    if (approvalGate === "quality-gates" && approvalDecision === "override") {
      overridePresent = true;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.trimStart().startsWith("#")) continue;

    const indent = line.match(/^ */)[0].length;
    const content = trimmed.trim();

    if (indent === 0 && content === "phases:") {
      inPhases = true;
      inVerify = false;
      inGates = false;
      inBaseline = false;
      inApprovals = false;
      continue;
    }
    if (indent === 0 && content === "gates:") {
      inGates = true;
      inPhases = false;
      inVerify = false;
      inBaseline = false;
      inQualityGates = false;
      inApprovals = false;
      continue;
    }
    if (indent === 0 && content === "approvals:") {
      inApprovals = true;
      inPhases = false;
      inGates = false;
      inVerify = false;
      inBaseline = false;
      inQualityGates = false;
      approvalGate = null;
      approvalDecision = null;
      continue;
    }
    if (indent === 0 && content.startsWith("baseline_fingerprints:")) {
      inBaseline = true;
      inPhases = false;
      inGates = false;
      inVerify = false;
      inQualityGates = false;
      inApprovals = false;
      baselineFingerprints = {};
      continue;
    }
    if (indent === 0 && !content.startsWith(" ")) {
      // other top-level key
      if (
        content !== "phases:" &&
        content !== "gates:" &&
        content !== "approvals:" &&
        !content.startsWith("baseline_fingerprints:")
      ) {
        inPhases = false;
        inGates = false;
        inVerify = false;
        inQualityGates = false;
        inBaseline = false;
        inApprovals = false;
      }
    }

    if (inPhases && indent === 2 && (content === "verify:" || content === "sdd-verify:")) {
      inVerify = true;
      continue;
    }
    if (inPhases && indent === 2 && content.endsWith(":") && content !== "verify:" && content !== "sdd-verify:") {
      inVerify = false;
    }
    if (inVerify && content.startsWith("verdict:")) {
      verdict = yamlScalar(content.slice("verdict:".length));
    }

    if (inGates && indent === 2 && content === "quality-gates:") {
      qualityGatesPresent = true;
      inQualityGates = true;
      continue;
    }
    if (inGates && indent === 2 && content.endsWith(":") && content !== "quality-gates:") {
      inQualityGates = false;
    }
    if (inQualityGates) {
      if (indent === 4 && content.startsWith("status:")) {
        qualityGatesStatus = yamlScalar(content.slice("status:".length));
      }
      if (indent === 4 && content === "override:") {
        overridePresent = true;
      }
    }

    if (inApprovals) {
      if (indent === 2 && content.startsWith("- ")) {
        approvalGate = null;
        approvalDecision = null;
        const rest = content.slice(2).trim();
        const idx = rest.indexOf(":");
        if (idx > 0) {
          noteApprovalField(rest.slice(0, idx).trim(), rest.slice(idx + 1));
        }
      } else if (indent >= 4 && content.includes(":")) {
        const idx = content.indexOf(":");
        noteApprovalField(content.slice(0, idx).trim(), content.slice(idx + 1));
      }
    }

    if (inBaseline && indent >= 2 && content.includes(":")) {
      const idx = content.indexOf(":");
      const key = content.slice(0, idx).trim();
      let val = yamlScalar(content.slice(idx + 1));
      if (key && val) {
        if (!baselineFingerprints) baselineFingerprints = {};
        baselineFingerprints[key] = val;
      }
    }
  }

  const verdictOk =
    verdict === "PASS" || verdict === "PASS WITH WARNINGS";
  let qgOk = true;
  if (qualityGatesPresent) {
    qgOk =
      qualityGatesStatus === "passed" ||
      qualityGatesStatus === "done" ||
      qualityGatesStatus === "approved" ||
      overridePresent;
  }

  const gatesSatisfied = verdictOk && qgOk;

  return {
    verdict,
    qualityGatesPresent,
    qualityGatesStatus,
    overridePresent,
    baselineFingerprints,
    gatesSatisfied,
  };
}

function defaultFs() {
  return {
    rename: fsp.rename,
    unlink: fsp.unlink,
    rm: fsp.rm,
    stat: fsp.stat,
    mkdir: fsp.mkdir,
    readFile: fsp.readFile,
    writeFile: fsp.writeFile,
    readdir: fsp.readdir,
    lstat: fsp.lstat,
    cp: fsp.cp,
  };
}

/**
 * Walk directory; reject symlinks/junctions fail-closed.
 * @returns {Promise<Array<{path: string, sha256: string}>>}
 */
async function computeInventory(rootDir, fsImpl) {
  const fsx = fsImpl || defaultFs();
  const root = path.resolve(rootDir);
  const results = [];

  async function walk(dir, relBase) {
    let entries;
    try {
      entries = await fsx.readdir(dir, { withFileTypes: true });
    } catch (err) {
      const e = new Error(`computeInventory readdir failed: ${err.message}`);
      e.code = "io-error";
      throw e;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      const posixRel = rel.split(path.sep).join("/");

      let lst;
      try {
        lst = await fsx.lstat(abs);
      } catch (err) {
        const e = new Error(`computeInventory lstat failed: ${err.message}`);
        e.code = "io-error";
        throw e;
      }

      if (lst.isSymbolicLink()) {
        const e = new Error(`symlink/junction rejected: ${posixRel}`);
        e.code = "io-error";
        throw e;
      }
      if (lst.isDirectory()) {
        await walk(abs, posixRel);
      } else if (lst.isFile()) {
        const buf = await fsx.readFile(abs);
        results.push({ path: posixRel, sha256: digestBytes(buf) });
      }
    }
  }

  await walk(root, "");
  results.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return results;
}

function txRoot(workspace, changeName) {
  return path.join(workspace, ".ospec", "archive-tx", changeName);
}

function originPath(workspace, changeName) {
  return path.join(workspace, "openspec", "changes", changeName);
}

async function readJournal(txDir, fsx) {
  const p = path.join(txDir, "journal.json");
  try {
    const raw = await fsx.readFile(p, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") {
      return { state: "init", plan_sha256: null, created_by_tx: [] };
    }
    throw err;
  }
}

async function writeJournal(txDir, journal, fsx) {
  await fsx.mkdir(txDir, { recursive: true });
  const p = path.join(txDir, "journal.json");
  await fsx.writeFile(p, JSON.stringify(journal, null, 2), "utf8");
}

async function writeReceipt(txDir, receipt, fsx) {
  await fsx.mkdir(txDir, { recursive: true });
  const p = path.join(txDir, "receipt.json");
  await fsx.writeFile(p, JSON.stringify(receipt, null, 2), "utf8");
}

function emptyReceipt(changeName, planSha, outcome, extra = {}) {
  return {
    schema_version: 1,
    change: changeName,
    plan_sha256: planSha,
    outcome,
    already_complete: false,
    destination: null,
    committed_inventory: [],
    origin_deleted: false,
    cost: { available: false },
    rejection_codes: [],
    failure_reason: null,
    parity: { go: "n/a" },
    ...extra,
  };
}

async function aggregateCost(workspace, changeName, fsx) {
  const costPath = path.join(
    workspace,
    ".ospec",
    "session",
    changeName,
    "phase-costs.jsonl",
  );
  let text;
  try {
    text = await fsx.readFile(costPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return { available: false };
    return { available: false };
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { available: false };

  const byPhase = new Map();
  for (const line of lines) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const phase = row.phase || "unknown";
    if (!byPhase.has(phase)) {
      byPhase.set(phase, {
        phase,
        estimated_prompt_tokens: 0,
        estimated_artifact_tokens: 0,
        estimated_tool_output_tokens: 0,
        estimated_output_tokens: 0,
        duration_ms: 0,
        invocations: 0,
        model_tiers: new Set(),
        statuses: new Set(),
      });
    }
    const agg = byPhase.get(phase);
    agg.estimated_prompt_tokens += Number(row.estimated_prompt_tokens) || 0;
    agg.estimated_artifact_tokens += Number(row.estimated_artifact_tokens) || 0;
    agg.estimated_tool_output_tokens += Number(row.estimated_tool_output_tokens) || 0;
    agg.estimated_output_tokens += Number(row.estimated_output_tokens) || 0;
    agg.duration_ms += Number(row.duration_ms) || 0;
    agg.invocations += 1;
    if (typeof row.model_tier === "string" && row.model_tier) {
      agg.model_tiers.add(row.model_tier);
    }
    if (typeof row.status === "string" && row.status) {
      agg.statuses.add(row.status);
    }
  }

  const phases = [...byPhase.values()].map((p) => ({
    phase: p.phase,
    estimated_prompt_tokens: p.estimated_prompt_tokens,
    estimated_artifact_tokens: p.estimated_artifact_tokens,
    estimated_tool_output_tokens: p.estimated_tool_output_tokens,
    estimated_output_tokens: p.estimated_output_tokens,
    duration_ms: p.duration_ms,
    invocations: p.invocations,
    relaunches: Math.max(0, p.invocations - 1),
    model_tiers: [...p.model_tiers].sort(),
    statuses: [...p.statuses].sort(),
  }));

  let total_questions_asked = 0;
  try {
    const statePath = path.join(
      workspace,
      "openspec",
      "changes",
      changeName,
      "state.yaml",
    );
    const stateText = await fsx.readFile(statePath, "utf8");
    total_questions_asked = sumQuestionsAsked(stateText);
  } catch {
    total_questions_asked = 0;
  }

  return {
    available: true,
    phases,
    total_questions_asked,
  };
}

/**
 * Sum gates.*.questions_asked from state.yaml text. Missing → 0. Never throws.
 */
function sumQuestionsAsked(stateYamlText) {
  const text = typeof stateYamlText === "string" ? stateYamlText : "";
  const lines = text.split(/\r?\n/);
  let inGates = false;
  let sum = 0;
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.trimStart().startsWith("#")) continue;
    const indent = line.match(/^ */)[0].length;
    const content = trimmed.trim();
    if (indent === 0 && content === "gates:") {
      inGates = true;
      continue;
    }
    if (indent === 0 && content !== "gates:") {
      inGates = false;
    }
    if (!inGates) continue;
    if (content.startsWith("questions_asked:")) {
      const raw = content
        .slice("questions_asked:".length)
        .trim()
        .replace(/^["']|["']$/g, "");
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) sum += n;
    }
  }
  return sum;
}

async function buildSnapshot(workspace, changeName, plan, fsx) {
  const origin = originPath(workspace, changeName);
  const fullInventory = await computeInventory(origin, fsx);
  // archive-plan.json is the plan document itself; including it in the
  // fingerprint creates a self-referential hash. Exclude it from inventory
  // identity checks while still copying it during staging.
  const originInventory = fullInventory.filter(
    (e) => e.path !== "archive-plan.json",
  );
  const sourceFingerprint = fingerprintInventory(originInventory);

  const targets = {};
  const targetTexts = {};
  const preparedContent = {};
  const preparedTexts = {};
  const adrSources = {};

  for (const sw of plan.spec_writes || []) {
    const targetAbs = path.join(workspace, ...sw.target.split("/"));
    try {
      const buf = await fsx.readFile(targetAbs);
      targets[sw.target] = digestBytes(buf);
      targetTexts[sw.target] = buf.toString("utf8");
    } catch (err) {
      if (err.code === "ENOENT") targets[sw.target] = null;
      else throw err;
    }
    const prepAbs = path.join(origin, ...sw.source_delta.split("/"));
    try {
      const buf = await fsx.readFile(prepAbs);
      preparedContent[sw.source_delta] = digestBytes(buf);
      preparedTexts[sw.source_delta] = buf.toString("utf8");
    } catch (err) {
      if (err.code === "ENOENT") {
        // leave missing — validator will emit missing-reference
      } else throw err;
    }
  }

  for (const adr of plan.adr_promotions || []) {
    const srcAbs = path.join(origin, ...adr.source.split("/"));
    try {
      const buf = await fsx.readFile(srcAbs);
      adrSources[adr.source] = digestBytes(buf);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  return {
    changeName,
    sourceFingerprint,
    originInventory,
    targets,
    targetTexts,
    preparedContent,
    preparedTexts,
    adrSources,
  };
}


async function copyInventoryToStaging(origin, stagingArchive, inventory, fsx) {
  await fsx.mkdir(stagingArchive, { recursive: true });
  for (const entry of inventory) {
    const src = path.join(origin, ...entry.path.split("/"));
    const dest = path.join(stagingArchive, ...entry.path.split("/"));
    await fsx.mkdir(path.dirname(dest), { recursive: true });
    await fsx.cp(src, dest);
  }
}

async function stagePreparedWrites(workspace, changeName, plan, stagingRoot, fsx) {
  const origin = originPath(workspace, changeName);
  const specsStaging = path.join(stagingRoot, "specs");
  const adrStaging = path.join(stagingRoot, "adr");

  for (const sw of plan.spec_writes || []) {
    const src = path.join(origin, ...sw.source_delta.split("/"));
    const dest = path.join(specsStaging, sw.domain, "spec.md");
    await fsx.mkdir(path.dirname(dest), { recursive: true });
    await fsx.cp(src, dest);
  }
  for (const adr of plan.adr_promotions || []) {
    const src = path.join(origin, ...adr.source.split("/"));
    const destName = path.posix.basename(adr.target);
    const dest = path.join(adrStaging, destName);
    await fsx.mkdir(path.dirname(dest), { recursive: true });
    await fsx.cp(src, dest);
  }
}

function inventoriesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].path !== b[i].path || a[i].sha256.toLowerCase() !== b[i].sha256.toLowerCase()) {
      return false;
    }
  }
  return true;
}

async function compareOriginToDir(originInv, otherDir, fsx) {
  const otherInv = await computeInventory(otherDir, fsx);
  return inventoriesEqual(originInv, otherInv);
}

/**
 * @param {{workspace, changeName, planPath, now?, fsImpl?}} opts
 */
async function runArchiveTransaction(opts) {
  const workspace = path.resolve(opts.workspace);
  const changeName = opts.changeName;
  const planPath = opts.planPath || path.join(originPath(workspace, changeName), "archive-plan.json");
  const now = opts.now instanceof Date ? opts.now : new Date();
  const fsx = opts.fsImpl || defaultFs();
  const txDir = txRoot(workspace, changeName);
  const origin = originPath(workspace, changeName);

  if (!isSafeChangeName(changeName)) {
    const receipt = emptyReceipt(changeName, null, "failed", {
      failure_reason: "gate-not-satisfied",
      rejection_codes: ["invalid-schema"],
    });
    await writeReceipt(txDir, receipt, fsx).catch(() => {});
    return receipt;
  }

  let journal = await readJournal(txDir, fsx);
  // Mid-flight resume: journal already past init on a non-terminal state.
  // Fresh runs (init) emit "success"; post-done re-runs emit success+already_complete.
  const wasResume =
    Boolean(opts._resumed) ||
    (NON_TERMINAL.has(journal.state) && journal.state !== "init");

  // Idempotent done — origin (and plan) may already be gone.
  // If interrupted after the done checkpoint but before rm, finish the delete.
  if (journal.state === "done") {
    await fsx.rm(origin, { recursive: true, force: true }).catch(() => {});
    const receipt = emptyReceipt(changeName, journal.plan_sha256, "success", {
      already_complete: true,
      origin_deleted: true,
      destination: journal.destination || null,
      committed_inventory: journal.committed_inventory || [],
      cost: await aggregateCost(workspace, changeName, fsx),
    });
    await writeReceipt(txDir, receipt, fsx).catch(() => {});
    return receipt;
  }
  if (journal.state === "failed" || journal.state === "rolled-back") {
    const receipt = emptyReceipt(
      changeName,
      journal.plan_sha256,
      journal.state === "rolled-back" ? "rolled-back" : "failed",
      { failure_reason: journal.failure_reason || null },
    );
    await writeReceipt(txDir, receipt, fsx);
    return receipt;
  }

  let planText;
  try {
    planText = await fsx.readFile(planPath, "utf8");
  } catch (err) {
    const receipt = emptyReceipt(changeName, journal.plan_sha256, "failed", {
      failure_reason: "io-error",
    });
    await writeReceipt(txDir, receipt, fsx).catch(() => {});
    return receipt;
  }

  const planSha = digestBytes(Buffer.from(planText, "utf8"));
  const parsed = parsePlan(planText);
  if (!parsed.parsed) {
    const receipt = emptyReceipt(changeName, planSha, "failed", {
      failure_reason: "io-error",
      rejection_codes: ["invalid-schema"],
    });
    await writeReceipt(txDir, receipt, fsx);
    return receipt;
  }
  const plan = parsed.value;

  if (!journal.plan_sha256 && journal.state === "init") {
    journal.plan_sha256 = planSha;
  }

  let decision = nextTransactionAction(journal, { planSha256: planSha });
  if (decision.action === "already-complete") {
    const receipt = emptyReceipt(changeName, planSha, "success", {
      already_complete: true,
      origin_deleted: true,
      destination: journal.destination || null,
      committed_inventory: journal.committed_inventory || [],
      cost: await aggregateCost(workspace, changeName, fsx),
    });
    await writeReceipt(txDir, receipt, fsx);
    return receipt;
  }
  if (decision.action === "noop-terminal") {
    const receipt = emptyReceipt(changeName, planSha, journal.state === "rolled-back" ? "rolled-back" : "failed", {
      failure_reason: journal.failure_reason || null,
    });
    await writeReceipt(txDir, receipt, fsx);
    return receipt;
  }
  if (decision.action === "fail" && decision.failure_reason === "journal-plan-conflict") {
    const receipt = emptyReceipt(changeName, planSha, "failed", {
      failure_reason: "journal-plan-conflict",
    });
    journal.state = "failed";
    journal.failure_reason = "journal-plan-conflict";
    await writeJournal(txDir, journal, fsx);
    await writeReceipt(txDir, receipt, fsx);
    return receipt;
  }

  const datePrefix = now.toISOString().slice(0, 10);
  const destinationRel =
    journal.destination || `openspec/changes/archive/${datePrefix}-${changeName}`;
  if (!isRelativeUnder(destinationRel, "openspec/changes/archive")) {
    const receipt = emptyReceipt(changeName, planSha, "failed", {
      failure_reason: "gate-not-satisfied",
      rejection_codes: ["invalid-schema"],
    });
    journal.state = "failed";
    journal.failure_reason = "gate-not-satisfied";
    await writeJournal(txDir, journal, fsx);
    await writeReceipt(txDir, receipt, fsx);
    return receipt;
  }
  journal.destination = destinationRel;

  // ---- PREFLIGHT ----
  if (journal.state === "init" || journal.state === "preflighted") {
    const shape = validatePlanShape(plan, { changeName });
    if (!shape.valid) {
      const codes = shape.codes.filter(isKnownRejectionCode);
      const receipt = emptyReceipt(changeName, planSha, "failed", {
        rejection_codes: codes,
        failure_reason: "gate-not-satisfied",
      });
      journal.state = "failed";
      journal.failure_reason = "gate-not-satisfied";
      await writeJournal(txDir, journal, fsx);
      await writeReceipt(txDir, receipt, fsx);
      return receipt;
    }

    let stateText = "";
    try {
      stateText = await fsx.readFile(path.join(origin, "state.yaml"), "utf8");
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    const gateFacts = readArchiveGateFacts(stateText);
    if (!gateFacts.gatesSatisfied) {
      const receipt = emptyReceipt(changeName, planSha, "failed", {
        failure_reason: "gate-not-satisfied",
      });
      journal.state = "failed";
      journal.failure_reason = "gate-not-satisfied";
      await writeJournal(txDir, journal, fsx);
      await writeReceipt(txDir, receipt, fsx);
      return receipt;
    }

    // baseline stale: compare target_before against live AND recorded fingerprints
    if (gateFacts.baselineFingerprints) {
      for (const sw of plan.spec_writes || []) {
        const recorded = gateFacts.baselineFingerprints[sw.domain];
        if (recorded && sw.target_before_sha256) {
          if (recorded.toLowerCase() !== String(sw.target_before_sha256).toLowerCase()) {
            // Fingerprint in state may be domain-level baseline; also check live bytes via snapshot
          }
        }
      }
    }

    let snapshot;
    try {
      snapshot = await buildSnapshot(workspace, changeName, plan, fsx);
    } catch (err) {
      const receipt = emptyReceipt(changeName, planSha, "failed", {
        failure_reason: err.code === "io-error" ? "io-error" : "io-error",
      });
      journal.state = "failed";
      journal.failure_reason = "io-error";
      await writeJournal(txDir, journal, fsx);
      await writeReceipt(txDir, receipt, fsx);
      return receipt;
    }

    // Stale baseline: if state has fingerprint for domain and live target differs from recorded
    if (gateFacts.baselineFingerprints) {
      for (const [domain, recorded] of Object.entries(gateFacts.baselineFingerprints)) {
        const sw = (plan.spec_writes || []).find((s) => s.domain === domain);
        if (!sw) continue;
        const live = snapshot.targets[sw.target];
        const normRecorded = String(recorded).replace(/^sha256:/i, "").toLowerCase();
        const normLive = String(live || "").replace(/^sha256:/i, "").toLowerCase();
        if (live && normRecorded !== normLive) {
          const receipt = emptyReceipt(changeName, planSha, "failed", {
            failure_reason: "baseline-stale",
          });
          journal.state = "failed";
          journal.failure_reason = "baseline-stale";
          await writeJournal(txDir, journal, fsx);
          await writeReceipt(txDir, receipt, fsx);
          return receipt;
        }
      }
    }

    const snapResult = validatePlanAgainstSnapshot(plan, snapshot);
    if (!snapResult.valid) {
      const codes = snapResult.codes.filter(isKnownRejectionCode);
      const receipt = emptyReceipt(changeName, planSha, "failed", {
        rejection_codes: codes,
        failure_reason: codes.includes("hash-mismatch")
          ? "compare-mismatch"
          : "gate-not-satisfied",
      });
      journal.state = "failed";
      journal.failure_reason = receipt.failure_reason;
      await writeJournal(txDir, journal, fsx);
      await writeReceipt(txDir, receipt, fsx);
      return receipt;
    }

    journal.state = "preflighted";
    journal.plan_sha256 = planSha;
    await writeJournal(txDir, journal, fsx);
  }

  // ---- STAGE ----
  if (journal.state === "preflighted") {
    try {
      const stagingRoot = path.join(txDir, "staging");
      await fsx.rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
      const stagingArchive = path.join(stagingRoot, "archive");
      const originInv = await computeInventory(origin, fsx);
      await copyInventoryToStaging(origin, stagingArchive, originInv, fsx);
      await stagePreparedWrites(workspace, changeName, plan, stagingRoot, fsx);
      journal.state = "staged";
      journal.origin_inventory = originInv;
      await writeJournal(txDir, journal, fsx);
    } catch (err) {
      const receipt = emptyReceipt(changeName, planSha, "failed", {
        failure_reason: "io-error",
      });
      journal.state = "failed";
      journal.failure_reason = "io-error";
      await writeJournal(txDir, journal, fsx);
      await writeReceipt(txDir, receipt, fsx);
      return receipt;
    }
  }

  // ---- COMPARE A ----
  if (journal.state === "staged") {
    try {
      const stagingArchive = path.join(txDir, "staging", "archive");
      const originInv =
        journal.origin_inventory || (await computeInventory(origin, fsx));
      const ok = await compareOriginToDir(originInv, stagingArchive, fsx);
      if (!ok) {
        const receipt = emptyReceipt(changeName, planSha, "failed", {
          failure_reason: "compare-mismatch",
        });
        journal.state = "failed";
        journal.failure_reason = "compare-mismatch";
        await writeJournal(txDir, journal, fsx);
        await writeReceipt(txDir, receipt, fsx);
        return receipt;
      }
      journal.state = "compared";
      journal.compareAOk = true;
      await writeJournal(txDir, journal, fsx);
    } catch (err) {
      const receipt = emptyReceipt(changeName, planSha, "failed", {
        failure_reason: "io-error",
      });
      journal.state = "failed";
      journal.failure_reason = "io-error";
      await writeJournal(txDir, journal, fsx);
      await writeReceipt(txDir, receipt, fsx);
      return receipt;
    }
  }

  // ---- COMMIT ----
  // Advance to `committing` on each live mutation so resume never re-commits from empty staging.
  if (journal.state === "compared" || journal.state === "committing") {
    const created = Array.isArray(journal.created_by_tx)
      ? journal.created_by_tx.slice()
      : [];
    async function persistCommitting() {
      journal.created_by_tx = created;
      journal.state = "committing";
      await writeJournal(txDir, journal, fsx);
    }
    try {
      const stagingRoot = path.join(txDir, "staging");
      const stagingArchive = path.join(stagingRoot, "archive");
      const destAbs = path.join(workspace, ...destinationRel.split("/"));
      await fsx.mkdir(path.dirname(destAbs), { recursive: true });

      // Retain `.bak` for prior live content until the full multi-step commit ends.
      if (!created.includes(destinationRel)) {
        let destExisted = true;
        try {
          await fsx.stat(destAbs);
        } catch (err) {
          if (err.code === "ENOENT") destExisted = false;
          else throw err;
        }
        if (destExisted) {
          await fsx.rm(destAbs + ".bak", { recursive: true, force: true }).catch(() => {});
          await fsx.rename(destAbs, destAbs + ".bak");
        }
        created.push(destinationRel);
        await renameWithFallback(stagingArchive, destAbs, { fsImpl: fsx });
        await persistCommitting();
      }

      for (const sw of plan.spec_writes || []) {
        if (created.includes(sw.target)) continue;
        const stagedSpec = path.join(stagingRoot, "specs", sw.domain, "spec.md");
        const liveTarget = path.join(workspace, ...sw.target.split("/"));
        await fsx.mkdir(path.dirname(liveTarget), { recursive: true });
        let existed = true;
        try {
          await fsx.stat(liveTarget);
        } catch (err) {
          if (err.code === "ENOENT") existed = false;
          else throw err;
        }
        if (existed) {
          await fsx.rm(liveTarget + ".bak", { recursive: true, force: true }).catch(() => {});
          await fsx.rename(liveTarget, liveTarget + ".bak");
        }
        created.push(sw.target);
        const tmp = liveTarget + ".ospec-tx-tmp";
        await fsx.cp(stagedSpec, tmp);
        await renameWithFallback(tmp, liveTarget, { fsImpl: fsx });
        await persistCommitting();
      }

      for (const adr of plan.adr_promotions || []) {
        if (created.includes(adr.target)) continue;
        const destName = path.posix.basename(adr.target);
        const stagedAdr = path.join(stagingRoot, "adr", destName);
        const liveTarget = path.join(workspace, ...adr.target.split("/"));
        await fsx.mkdir(path.dirname(liveTarget), { recursive: true });
        let existed = true;
        try {
          await fsx.stat(liveTarget);
        } catch (err) {
          if (err.code === "ENOENT") existed = false;
          else throw err;
        }
        if (existed) {
          await fsx.rm(liveTarget + ".bak", { recursive: true, force: true }).catch(() => {});
          await fsx.rename(liveTarget, liveTarget + ".bak");
        }
        created.push(adr.target);
        const tmp = liveTarget + ".ospec-tx-tmp";
        await fsx.cp(stagedAdr, tmp);
        await renameWithFallback(tmp, liveTarget, { fsImpl: fsx });
        await persistCommitting();
      }

      for (const rel of created) {
        await fsx
          .rm(path.join(workspace, ...rel.split("/")) + ".bak", {
            recursive: true,
            force: true,
          })
          .catch(() => {});
      }
      journal.created_by_tx = created;
      journal.state = "committed";
      await writeJournal(txDir, journal, fsx);
    } catch (err) {
      if (err && err.code === "SIMULATED_KILL") throw err;
      const receipt = emptyReceipt(changeName, planSha, "failed", {
        failure_reason: "commit-failed",
      });
      journal.created_by_tx = created;
      journal.state = "failed";
      journal.failure_reason = "commit-failed";
      await writeJournal(txDir, journal, fsx);
      await writeReceipt(txDir, receipt, fsx);
      return receipt;
    }
  }

  // ---- COMPARE B ----
  if (journal.state === "committed") {
    try {
      const destAbs = path.join(workspace, ...destinationRel.split("/"));
      const originInv =
        journal.origin_inventory || (await computeInventory(origin, fsx));
      const ok = await compareOriginToDir(originInv, destAbs, fsx);
      if (!ok) {
        const receipt = emptyReceipt(changeName, planSha, "failed", {
          failure_reason: "compare-mismatch",
          origin_deleted: false,
        });
        journal.state = "failed";
        journal.failure_reason = "compare-mismatch";
        await writeJournal(txDir, journal, fsx);
        await writeReceipt(txDir, receipt, fsx);
        return receipt;
      }
      journal.state = "confirmed";
      journal.compareBOk = true;
      await writeJournal(txDir, journal, fsx);
    } catch (err) {
      const receipt = emptyReceipt(changeName, planSha, "failed", {
        failure_reason: "io-error",
        origin_deleted: false,
      });
      journal.state = "failed";
      journal.failure_reason = "io-error";
      await writeJournal(txDir, journal, fsx);
      await writeReceipt(txDir, receipt, fsx);
      return receipt;
    }
  }

  // ---- DELETE ORIGIN ----
  // Persist journal `done` BEFORE rm(origin). A successful rm must never leave a
  // terminal failed receipt with origin_deleted:false while origin is already gone.
  if (journal.state === "confirmed") {
    let originRemoved = false;
    let donePersisted = false;
    let cost = { available: false };
    let committed = [];
    try {
      // Aggregate cost while origin (state.yaml) still exists
      cost = await aggregateCost(workspace, changeName, fsx);
      const destAbs = path.join(workspace, ...destinationRel.split("/"));
      committed = await computeInventory(destAbs, fsx);
      const doneSnapshot = {
        ...journal,
        state: "done",
        committed_inventory: committed,
        origin_deleted: true,
      };
      await writeJournal(txDir, doneSnapshot, fsx);
      Object.assign(journal, doneSnapshot);
      donePersisted = true;

      await fsx.rm(origin, { recursive: true, force: true });
      originRemoved = true;

      const receipt = emptyReceipt(changeName, planSha, wasResume ? "resumed-success" : "success", {
        destination: destinationRel,
        committed_inventory: committed,
        origin_deleted: true,
        cost,
        already_complete: false,
      });
      await writeReceipt(txDir, receipt, fsx);
      return receipt;
    } catch (err) {
      // Done checkpoint persisted and/or origin already removed → reconcile to
      // success/already_complete; never emit failed + origin_deleted:false after rm.
      let originAbsent = originRemoved;
      if (!originAbsent) {
        originAbsent = await fsx.stat(origin).then(
          () => false,
          (e) => e && e.code === "ENOENT",
        );
      }
      if (donePersisted || originAbsent) {
        if (!donePersisted) {
          const destAbs = path.join(workspace, ...destinationRel.split("/"));
          if (!committed.length) {
            committed =
              journal.committed_inventory ||
              (await computeInventory(destAbs, fsx).catch(() => []));
          }
          journal.state = "done";
          journal.committed_inventory = committed;
          journal.origin_deleted = true;
          await writeJournal(txDir, journal, fsx).catch(() => {});
        }
        if (!originAbsent) {
          await fsx.rm(origin, { recursive: true, force: true }).catch(() => {});
        }
        const receipt = emptyReceipt(changeName, planSha, wasResume ? "resumed-success" : "success", {
          destination: destinationRel,
          committed_inventory: journal.committed_inventory || committed,
          origin_deleted: true,
          cost,
          already_complete: false,
        });
        await writeReceipt(txDir, receipt, fsx).catch(() => {});
        return receipt;
      }
      const receipt = emptyReceipt(changeName, planSha, "failed", {
        failure_reason: "io-error",
        origin_deleted: false,
      });
      journal.state = "failed";
      journal.failure_reason = "io-error";
      await writeJournal(txDir, journal, fsx).catch(() => {});
      await writeReceipt(txDir, receipt, fsx).catch(() => {});
      return receipt;
    }
  }

  const receipt = emptyReceipt(changeName, planSha, "failed", {
    failure_reason: "io-error",
  });
  await writeReceipt(txDir, receipt, fsx);
  return receipt;
}

/**
 * Rollback with staging-rename strategy.
 */
async function rollbackTransaction(opts) {
  const workspace = path.resolve(opts.workspace);
  const changeName = opts.changeName;
  const fsx = opts.fsImpl || defaultFs();
  const txDir = txRoot(workspace, changeName);
  if (!isSafeChangeName(changeName)) {
    return emptyReceipt(changeName, null, "failed", {
      failure_reason: "gate-not-satisfied",
      rejection_codes: ["invalid-schema"],
    });
  }
  const journal = await readJournal(txDir, fsx);

  if (journal.state === "done") {
    return emptyReceipt(changeName, journal.plan_sha256, "success", {
      already_complete: true,
      origin_deleted: true,
      destination: journal.destination || null,
    });
  }

  const createdPaths = journal.created_by_tx || [];
  const midCommitPartial =
    journal.state === "committing" ||
    (journal.state === "compared" && createdPaths.length > 0);

  // Before any live commit mutation: discard staging only
  if (
    journal.state === "init" ||
    journal.state === "preflighted" ||
    journal.state === "staged" ||
    (journal.state === "compared" && createdPaths.length === 0)
  ) {
    await fsx.rm(path.join(txDir, "staging"), { recursive: true, force: true }).catch(() => {});
    journal.state = "rolled-back";
    await writeJournal(txDir, journal, fsx);
    const receipt = emptyReceipt(changeName, journal.plan_sha256, "rolled-back", {
      origin_deleted: false,
    });
    await writeReceipt(txDir, receipt, fsx);
    return receipt;
  }

  // During/after commit but before done: restore .bak and remove created_by_tx
  if (
    midCommitPartial ||
    journal.state === "committed" ||
    journal.state === "confirmed" ||
    journal.state === "failed"
  ) {
    for (const rel of journal.created_by_tx || []) {
      const abs = path.join(workspace, ...rel.split("/"));
      const bak = abs + ".bak";
      try {
        await fsx.stat(bak);
        await fsx.rm(abs, { recursive: true, force: true }).catch(() => {});
        await fsx.rename(bak, abs);
      } catch {
        // If created_by_tx and no bak, remove the destination we created
        try {
          await fsx.rm(abs, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    }
    await fsx.rm(path.join(txDir, "staging"), { recursive: true, force: true }).catch(() => {});
    journal.state = "rolled-back";
    await writeJournal(txDir, journal, fsx);
    const receipt = emptyReceipt(changeName, journal.plan_sha256, "rolled-back", {
      origin_deleted: false,
    });
    await writeReceipt(txDir, receipt, fsx);
    return receipt;
  }

  journal.state = "rolled-back";
  await writeJournal(txDir, journal, fsx);
  const receipt = emptyReceipt(changeName, journal.plan_sha256, "rolled-back");
  await writeReceipt(txDir, receipt, fsx);
  return receipt;
}

module.exports = {
  nextTransactionAction,
  readArchiveGateFacts,
  computeInventory,
  runArchiveTransaction,
  rollbackTransaction,
  fingerprintInventory,
  digestBytes,
  sumQuestionsAsked,
};

