"use strict";

// Resolve an agent's model per target from the two-table `models` config
// (agent -> tier, tier -> model-per-target). Pure and fail-soft: any gap
// yields OMIT so the generator simply writes no `model:` key (host inherits).
//
// Agent→tier and tier→model policy live only in models.yaml. This module
// validates structural invariants (complete SDD roster and known tiers) and
// never re-asserts configurable agent, model, or reasoning-effort choices.

const OMIT = Symbol("model-omit");
const INHERIT = "inherit";
const KNOWN_TIERS = ["premium", "default", "cheap"];
const REQUIRED_SDD_AGENTS = [
  "sdd-apply",
  "sdd-archive",
  "sdd-baseline",
  "sdd-clarify",
  "sdd-design",
  "sdd-document",
  "sdd-explore",
  "sdd-foundation",
  "sdd-init",
  "sdd-onboard",
  "sdd-orchestrator",
  "sdd-propose",
  "sdd-reconcile",
  "sdd-spec",
  "sdd-tasks",
  "sdd-verify",
  "sdd-workspace",
];
function sddAgentsByTier(agents) {
  const partition = { premium: [], default: [], cheap: [] };
  const source = agents && typeof agents === "object" ? agents : {};
  for (const agent of REQUIRED_SDD_AGENTS) {
    const tier = source[agent];
    if (KNOWN_TIERS.includes(tier)) partition[tier].push(agent);
  }
  return partition;
}

function lookupAssignment(assignments, target, agentName) {
  if (!assignments || typeof assignments !== "object") {
    return undefined;
  }
  const byTarget = assignments[target];
  if (!byTarget || typeof byTarget !== "object") {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(byTarget, agentName)) {
    return byTarget[agentName];
  }
  if (String(target).toLowerCase() === "antigravity" && byTarget._all !== undefined) {
    return byTarget._all;
  }
  return undefined;
}

function materializeAssignment(target, overlay) {
  if (overlay === undefined || overlay === null || overlay === INHERIT) {
    return OMIT;
  }
  if (typeof overlay === "string") {
    return overlay === INHERIT ? OMIT : overlay;
  }
  if (typeof overlay !== "object" || Array.isArray(overlay)) {
    return overlay;
  }
  const model = overlay.model;
  if (model === INHERIT) {
    return OMIT;
  }
  const effort = overlay.effort || overlay.model_reasoning_effort || "";
  const verbosity = overlay.verbosity || overlay.model_verbosity || "";
  const t = String(target).toLowerCase();
  if (t === "codex") {
    const out = { model };
    if (effort) out.model_reasoning_effort = effort;
    if (verbosity) out.model_verbosity = verbosity;
    return out;
  }
  if (t === "cursor" && effort) {
    return `${model}[${effort}]`;
  }
  if (t === "opencode" && effort) {
    return `${model}#${effort}`;
  }
  if (effort) {
    return { model, effort };
  }
  return model;
}

function resolveModel(agentName, target, models) {
  if (!models || typeof models !== "object") {
    return OMIT;
  }

  const overlay = lookupAssignment(models.assignments, target, agentName);
  if (overlay !== undefined) {
    return materializeAssignment(target, overlay);
  }

  const agents = models.agents || {};
  const tier = agents[agentName] || agents._default;

  if (!tier) {
    return OMIT;
  }

  const tierEntry = models.tiers && models.tiers[tier];

  if (!tierEntry || typeof tierEntry !== "object") {
    return OMIT;
  }

  const value = tierEntry[target];

  if (value === undefined || value === null || value === INHERIT) {
    return OMIT;
  }

  return value;
}

function validateSddModelPolicy(models) {
  const errors = [];
  const agents = models && typeof models === "object" && models.agents && typeof models.agents === "object" ? models.agents : {};
  const tiers = models && typeof models === "object" && models.tiers && typeof models.tiers === "object" ? models.tiers : {};
  const required = new Set(REQUIRED_SDD_AGENTS);

  for (const agent of REQUIRED_SDD_AGENTS) {
    const actual = agents[agent];
    if (actual === undefined) errors.push({ code: "missing-agent", agent });
  }
  for (const [agent, actual] of Object.entries(agents).sort(([left], [right]) => left.localeCompare(right))) {
    if (!KNOWN_TIERS.includes(actual)) errors.push({ code: "unknown-tier", agent, actual });
  }
  for (const agent of Object.keys(agents).filter(name => name.startsWith("sdd-") && !required.has(name)).sort()) {
    errors.push({ code: "unexpected-agent", agent, actual: agents[agent] });
  }
  for (const tier of Object.keys(tiers).filter(name => !KNOWN_TIERS.includes(name)).sort()) {
    errors.push({ code: "unknown-tier", tier, actual: tier });
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  resolveModel,
  validateSddModelPolicy,
  sddAgentsByTier,
  REQUIRED_SDD_AGENTS,
  KNOWN_TIERS,
  OMIT,
};
