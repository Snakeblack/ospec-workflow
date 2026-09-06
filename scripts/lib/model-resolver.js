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
const REQUIRED_QUALITY_REVIEW_AGENTS = [
  "review-change",
  "review-correction",
  "review-trust",
  "review-runtime",
  "review-evolution",
  "review-efficiency",
];
const LEGACY_QUALITY_REVIEW_AGENTS = [
  "review-risk",
  "review-reliability",
  "review-resilience",
  "review-readability",
];
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

function resolveModel(agentName, target, models) {
  if (!models || typeof models !== "object") {
    return OMIT;
  }

  const modelOverrides = models.modelOverrides;
  if (
    modelOverrides &&
    typeof modelOverrides === "object" &&
    Object.prototype.hasOwnProperty.call(modelOverrides, agentName)
  ) {
    const agentOverrides = modelOverrides[agentName];
    if (
      agentOverrides &&
      typeof agentOverrides === "object" &&
      Object.prototype.hasOwnProperty.call(agentOverrides, target)
    ) {
      return agentOverrides[target];
    }
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

function isModelValue(value) {
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0 && value.every(item => typeof item === "string" && item.length > 0);
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof value.model === "string" && value.model.length > 0);
}

function validateModelOverrides(modelOverrides) {
  if (modelOverrides === undefined) return { valid: true, errors: [] };
  const errors = [];
  if (!modelOverrides || typeof modelOverrides !== "object" || Array.isArray(modelOverrides)) {
    return { valid: false, errors: [{ code: "invalid-overrides" }] };
  }
  for (const [agent, value] of Object.entries(modelOverrides)) {
    if (!agent || !isModelValue(value)) errors.push({ code: "invalid-override", agent });
  }
  return { valid: errors.length === 0, errors };
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
  for (const agent of REQUIRED_QUALITY_REVIEW_AGENTS) {
    if (agents[agent] === undefined) errors.push({ code: "missing-agent", agent });
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
  validateModelOverrides,
  validateSddModelPolicy,
  sddAgentsByTier,
  REQUIRED_SDD_AGENTS,
  REQUIRED_QUALITY_REVIEW_AGENTS,
  LEGACY_QUALITY_REVIEW_AGENTS,
  KNOWN_TIERS,
  OMIT,
};
