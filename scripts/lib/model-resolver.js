"use strict";

// Resolve an agent's model per target from the `models` config (agent -> tier
// in models.yaml) and the user's tier -> model assignment for that target
// (`userModels`, from scripts/lib/user-models.js). Pure and fail-soft: any gap
// yields OMIT so the generator simply writes no `model:` key (host inherits).
//
// ospec ships no model names (E4.12): a tier entry in models.yaml carries only
// what does not age, Claude's aliases and Codex's reasoning effort. This module
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
const REQUIRED_SDD_AGENTS = [
  "sdd-apply",
  "sdd-archive",
  "sdd-baseline",
  "sdd-clarify",
  "sdd-design",
  "sdd-document",
  "sdd-explore",
  "foundation",
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

  const agents = models.agents || {};
  const tier = agents[agentName] || agents._default;

  if (!tier) {
    return OMIT;
  }

  const tierEntry = models.tiers && models.tiers[tier];
  const base = tierEntry && typeof tierEntry === "object" ? tierEntry[target] : undefined;
  const assigned = models.userModels && typeof models.userModels === "object" ? models.userModels[tier] : undefined;

  if (typeof assigned === "string" && assigned.trim()) {
    // The user's model keeps the tier's settings that are not a model name
    // (Codex's reasoning effort).
    return base && typeof base === "object" && !Array.isArray(base) ? { ...base, model: assigned.trim() } : assigned.trim();
  }

  if (base === undefined || base === null || base === INHERIT) {
    return OMIT;
  }

  // Settings without a model belong to a model the user has not assigned.
  if (typeof base === "object" && !Array.isArray(base) && !base.model) {
    return OMIT;
  }

  return base;
}

function validateUserModels(userModels) {
  if (userModels === undefined) return { valid: true, errors: [] };
  if (!userModels || typeof userModels !== "object" || Array.isArray(userModels)) return { valid: false, errors: [{ code: "invalid-user-models" }] };
  const errors = [];
  for (const [tier, value] of Object.entries(userModels)) {
    if (!KNOWN_TIERS.includes(tier)) errors.push({ code: "unknown-tier", tier });
    else if (typeof value !== "string" || !value.trim()) errors.push({ code: "invalid-model", tier });
  }
  return { valid: errors.length === 0, errors };
}

function validateSddModelPolicy(models) {
  const errors = [];
  const agents = models && typeof models === "object" && models.agents && typeof models.agents === "object" ? models.agents : {};
  const tiers = models && typeof models === "object" && models.tiers && typeof models.tiers === "object" ? models.tiers : {};
  const required = new Set(REQUIRED_SDD_AGENTS);

  for (const agent of REQUIRED_SDD_AGENTS) if (agents[agent] === undefined) errors.push({ code: "missing-agent", agent });
  for (const agent of REQUIRED_QUALITY_REVIEW_AGENTS) if (agents[agent] === undefined) errors.push({ code: "missing-agent", agent });
  for (const [agent, actual] of Object.entries(agents).sort(([left], [right]) => left.localeCompare(right))) if (!KNOWN_TIERS.includes(actual)) errors.push({ code: "unknown-tier", agent, actual });
  for (const agent of Object.keys(agents).filter(name => name.startsWith("sdd-") && !required.has(name)).sort()) errors.push({ code: "unexpected-agent", agent, actual: agents[agent] });
  for (const tier of Object.keys(tiers).filter(name => !KNOWN_TIERS.includes(name)).sort()) errors.push({ code: "unknown-tier", tier, actual: tier });
  return { valid: errors.length === 0, errors };
}

module.exports = {
  resolveModel,
  validateSddModelPolicy,
  validateUserModels,
  sddAgentsByTier,
  REQUIRED_SDD_AGENTS,
  REQUIRED_QUALITY_REVIEW_AGENTS,
  KNOWN_TIERS,
  OMIT,
};
