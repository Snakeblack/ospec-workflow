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
const { ignoreOspecDir } = require("./ospec-gitignore.js");
const { parseRoutingTable } = require("./route-dispatcher.js");
const { planLineageGate } = require("./review-gate-state.js");
const { opaqueScalarLines } = require("./yaml-lite.js");

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

function hasLiveWrites(journal) {
  return Array.isArray(journal && journal.created_by_tx) && journal.created_by_tx.length > 0;
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

  // A rollback restored the pre-transaction state, and a failure before any
  // live write left it untouched: both start a new transaction. A failure
  // after a live write waits for --rollback.
  if (state === "rolled-back" || (state === "failed" && !hasLiveWrites(journal))) {
    return { action: "restart" };
  }
  if (state === "failed") {
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
 * Continuation lines of a scalar never count, and a state.yaml with a quoted
 * scalar that never closes never satisfies the gates (REQ-lifecycle-kernel-033).
 * Never throws.
 */
function yamlScalar(raw) {
  return String(raw || "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function readArchiveGateFacts(stateYamlText) {
  const text = typeof stateYamlText === "string" ? stateYamlText : "";
  const { lines, error: malformed } = opaqueScalarLines(text);

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
      inQualityGates = false;
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
    // Only a line at exactly four spaces under a phase is a phase field, as the
    // projector reads it (REQ-lifecycle-kernel-032 and -033).
    if (inVerify && indent === 4 && content.startsWith("verdict:")) {
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
      qualityGatesStatus === "pass" ||
      qualityGatesStatus === "passed" ||
      qualityGatesStatus === "done" ||
      qualityGatesStatus === "approved" ||
      overridePresent;
  }

  const gatesSatisfied = !malformed && verdictOk && qgOk;

  return {
    verdict,
    qualityGatesPresent,
    qualityGatesStatus,
    overridePresent,
    baselineFingerprints,
    gatesSatisfied,
  };
}

function readPersistedRoute(stateYamlText) {
  let inRoute = false;

  for (const raw of opaqueScalarLines(stateYamlText).lines) {
    const content = raw.trim();
    const indent = raw.match(/^\s*/)[0].length;

    if (!content || content.startsWith("#")) continue;
    if (indent === 0) {
      inRoute = content === "route:";
      continue;
    }

    if (inRoute && indent === 2 && content.startsWith("actual_route:")) {
      return yamlScalar(content.slice("actual_route:".length)).toLowerCase();
    }
  }

  return "";
}

// ---- Review and verify lineages the archive needs ----
// state.yaml keeps top-level keys at indent 0, gate entries at 2 and their
// fields at 4. A lineage is read as a one-line JSON value, the form the
// review and verify runtimes emit; anything else reads as unreadable.

const UNREADABLE = Symbol("unreadable");

// The value of `key:` among the lines [start, end) at `indent`, with the range
// of the lines nested under it, or null when the key is absent.
function yamlEntry(lines, start, end, indent, key) {
  for (let i = start; i < end; i += 1) {
    const raw = lines[i];
    const content = raw.trim();
    if (!content || content.startsWith("#")) continue;
    if (raw.length - raw.trimStart().length !== indent || !content.startsWith(`${key}:`)) continue;
    let next = i + 1;
    while (next < end) {
      const nested = lines[next];
      const nestedContent = nested.trim();
      if (nestedContent && !nestedContent.startsWith("#") && nested.length - nested.trimStart().length <= indent) break;
      next += 1;
    }
    const value = content.slice(key.length + 1).trim();
    return { value: value.startsWith("#") ? "" : value, start: i + 1, end: next };
  }
  return null;
}

function jsonValue(entry) {
  if (!entry) return undefined;
  if (entry.value === "null" || entry.value === "~") return null;
  if (!entry.value.startsWith("{")) return UNREADABLE;
  try {
    return JSON.parse(entry.value);
  } catch {
    return UNREADABLE;
  }
}

// Selected review domains of a block gate: `- trust` items, an inline list,
// or a `trust: { selected: true }` map.
function blockDomains(lines, entry) {
  if (entry.value) {
    if (entry.value === "[]") return [];
    if (!entry.value.startsWith("[") || !entry.value.endsWith("]")) return UNREADABLE;
    return entry.value.slice(1, -1).split(",").map((item) => yamlScalar(item)).filter(Boolean);
  }
  const selected = [];
  for (let i = entry.start; i < entry.end; i += 1) {
    const content = lines[i].trim();
    if (!content || content.startsWith("#")) continue;
    if (content.startsWith("- ")) selected.push(yamlScalar(content.slice(2)));
    else if (/\bselected:\s*true\b/.test(content)) selected.push(content.slice(0, content.indexOf(":")));
  }
  return selected;
}

function readReviewGateEntry(stateYamlText) {
  const { lines } = opaqueScalarLines(stateYamlText);
  const gates = yamlEntry(lines, 0, lines.length, 0, "gates");
  const entry = gates && yamlEntry(lines, gates.start, gates.end, 2, "quality-review-gate");
  if (!entry) return undefined;
  if (entry.value) return jsonValue(entry);
  const field = (name) => yamlEntry(lines, entry.start, entry.end, 4, name);
  const status = field("status");
  const domains = field("selected_domains");
  return {
    status: status ? yamlScalar(status.value) : null,
    selected_domains: domains ? blockDomains(lines, domains) : [],
    lineage: jsonValue(field("lineage")),
  };
}

function selectedDomainCount(domains) {
  if (Array.isArray(domains)) return domains.length;
  if (domains && typeof domains === "object") {
    return Object.values(domains).filter((domain) => domain && domain.selected !== false).length;
  }
  return Infinity;
}

// The status of a top-level verify_lineage (one-line JSON or a block), null
// when there is none, or UNREADABLE.
function readVerifyLineageStatus(stateYamlText) {
  const { lines } = opaqueScalarLines(stateYamlText);
  const entry = yamlEntry(lines, 0, lines.length, 0, "verify_lineage");
  if (!entry) return null;
  if (entry.value) {
    const lineage = jsonValue(entry);
    if (lineage === null) return null;
    return lineage === UNREADABLE || typeof lineage.status !== "string" ? UNREADABLE : lineage.status;
  }
  const status = yamlEntry(lines, entry.start, entry.end, 2, "status");
  return status ? yamlScalar(status.value) : UNREADABLE;
}

/**
 * Whether the review and verify lineages let the change archive: a present
 * verify_lineage is closed and, when the route lists quality-review-gate, its
 * gate holds a lineage approved for archive (or selected no domain). A
 * lineage that ended unapproved, or one that cannot be read, blocks.
 * @param {string} stateYamlText
 * @param {{reviewRequired: boolean}} opts
 */
function archiveLineagesAllow(stateYamlText, { reviewRequired }) {
  const verifyStatus = readVerifyLineageStatus(stateYamlText);
  if (verifyStatus !== null && verifyStatus !== "closed") return false;
  if (!reviewRequired) return true;

  const gate = readReviewGateEntry(stateYamlText);
  if (!gate || gate === UNREADABLE || typeof gate !== "object") return false;
  const lineage = gate.lineage;
  if (lineage === undefined || lineage === null) {
    return gate.status === "done" && selectedDomainCount(gate.selected_domains) === 0;
  }
  if (lineage === UNREADABLE || typeof lineage !== "object") return false;
  const binding = lineage.genesis && lineage.genesis.k7_binding;
  try {
    return planLineageGate({
      lineage,
      observed_candidate_id: lineage.current_candidate_id,
      observed_binding_id: binding && binding.binding_id,
      observed_policy_snapshot_id: binding && binding.policy_snapshot_id,
      issuance: gate.issuance,
      downstream_gate: "archive",
    }).archive_allowed === true;
  } catch {
    return false;
  }
}

// Whether the persisted route lists quality-review-gate in the routing table
// of openspec/config.yaml. No route, freeform, no config or an empty table
// (the degraded routes) need no review; a config that cannot be read or a
// route it does not declare is { ok: false }.
async function routeReviewRequirement(workspace, stateYamlText, fsx) {
  const route = readPersistedRoute(stateYamlText);
  if (!route || route === "freeform") return { ok: true, required: false };
  let content;
  try {
    content = await fsx.readFile(path.join(workspace, "openspec", "config.yaml"), "utf8");
  } catch (err) {
    return err && err.code === "ENOENT" ? { ok: true, required: false } : { ok: false };
  }
  let routes;
  try {
    routes = parseRoutingTable(content);
  } catch {
    return { ok: false };
  }
  if (routes.length === 0) return { ok: true, required: false };
  const entry = routes.find((candidate) => String(candidate.name || "").toLowerCase() === route);
  if (!entry) return { ok: false };
  return { ok: true, required: Array.isArray(entry.gates) && entry.gates.includes("quality-review-gate") };
}

// The archived copy of state.yaml says `status: archived`: the staged copy is
// the origin bytes with only its top-level status line replaced (latin1 maps
// each byte to one character, so no other byte changes). Returns the
// inventory the archive must match.
async function markStagedStateArchived(stagingArchive, originInv, fsx) {
  if (!originInv.some((entry) => entry.path === "state.yaml")) return originInv;
  const stagedState = path.join(stagingArchive, "state.yaml");
  const text = (await fsx.readFile(stagedState)).toString("latin1");
  const archived = text.replace(/^status:[^\r\n]*/m, "status: archived");
  if (archived === text) return originInv;
  const bytes = Buffer.from(archived, "latin1");
  await fsx.writeFile(stagedState, bytes);
  const digest = digestBytes(bytes);
  return originInv.map((entry) => (entry.path === "state.yaml" ? { ...entry, sha256: digest } : entry));
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
  ignoreOspecDir(txDir);
  const p = path.join(txDir, "journal.json");
  await fsx.writeFile(p, JSON.stringify(journal, null, 2), "utf8");
}

async function writeReceipt(txDir, receipt, fsx) {
  await fsx.mkdir(txDir, { recursive: true });
  ignoreOspecDir(txDir);
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
  const { lines } = opaqueScalarLines(text);
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
  let route = "";

  try {
    route = readPersistedRoute(
      await fsx.readFile(path.join(origin, "state.yaml"), "utf8"),
    );
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

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

  return {
    changeName,
    sourceFingerprint,
    originInventory,
    targets,
    targetTexts,
    preparedContent,
    preparedTexts,
    route,
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

  for (const sw of plan.spec_writes || []) {
    const src = path.join(origin, ...sw.source_delta.split("/"));
    const dest = path.join(specsStaging, sw.domain, "spec.md");
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
  if (nextTransactionAction(journal, {}).action === "restart") {
    await fsx.rm(path.join(txDir, "staging"), { recursive: true, force: true }).catch(() => {});
    journal = { state: "init", plan_sha256: null, created_by_tx: [] };
  }
  if (journal.state === "failed") {
    const receipt = emptyReceipt(changeName, journal.plan_sha256, "failed", {
      failure_reason: journal.failure_reason || null,
    });
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
    const review = await routeReviewRequirement(workspace, stateText, fsx);
    if (
      !gateFacts.gatesSatisfied ||
      !review.ok ||
      !archiveLineagesAllow(stateText, { reviewRequired: review.required })
    ) {
      const receipt = emptyReceipt(changeName, planSha, "failed", {
        failure_reason: "gate-not-satisfied",
      });
      journal.state = "failed";
      journal.failure_reason = "gate-not-satisfied";
      await writeJournal(txDir, journal, fsx);
      await writeReceipt(txDir, receipt, fsx);
      return receipt;
    }

    let snapshot;
    try {
      snapshot = await buildSnapshot(workspace, changeName, plan, fsx);
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
      const archiveInv = await markStagedStateArchived(stagingArchive, originInv, fsx);
      await stagePreparedWrites(workspace, changeName, plan, stagingRoot, fsx);
      journal.state = "staged";
      journal.origin_inventory = originInv;
      journal.archive_inventory = archiveInv;
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
      // A journal staged before the archived status rewrite has no
      // archive_inventory: its staging copied the origin bytes unchanged.
      const originInv =
        journal.archive_inventory ||
        journal.origin_inventory ||
        (await computeInventory(origin, fsx));
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

      // Read branch for transactions staged before E3.1 (ADR-0009): their
      // plan still promotes ADRs. A plan validated since then has none.
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
      // A journal staged before the archived status rewrite has no
      // archive_inventory: its staging copied the origin bytes unchanged.
      const originInv =
        journal.archive_inventory ||
        journal.origin_inventory ||
        (await computeInventory(origin, fsx));
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
  archiveLineagesAllow,
  readPersistedRoute,
  computeInventory,
  runArchiveTransaction,
  rollbackTransaction,
  fingerprintInventory,
  digestBytes,
  sumQuestionsAsked,
};

