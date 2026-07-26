"use strict";

// Resolve an agent's model per target from the two-table `models` config
// (agent -> tier, tier -> model-per-target). Pure and fail-soft: any gap
// yields OMIT so the generator simply writes no `model:` key (host inherits).
//
// Agent→tier policy lives only in models.yaml. This module validates structural
// invariants (complete SDD roster, known tiers, reviewers/_default, Codex pins)
// and never re-asserts which agent belongs to which cost tier.

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
const CODEX_TIER_POLICY = {
  premium: { model: "gpt-5.6-sol", model_reasoning_effort: "medium" },
  default: { model: "gpt-5.6-terra", model_reasoning_effort: "medium" },
  cheap: { model: "gpt-5.6-luna", model_reasoning_effort: "low" },
};
const REVIEW_AGENTS = ["review-change", "review-correction", "review-risk", "review-readability", "review-reliability", "review-resilience"];

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
    else if (!KNOWN_TIERS.includes(actual)) errors.push({ code: "unknown-tier", agent, actual });
  }
  for (const agent of Object.keys(agents).filter(name => name.startsWith("sdd-") && !required.has(name)).sort()) {
    errors.push({ code: "unexpected-agent", agent, actual: agents[agent] });
  }
  for (const agent of [...REVIEW_AGENTS, "_default"]) {
    if (agents[agent] !== "default") errors.push({ code: "tier-mismatch", agent, expected: "default", actual: agents[agent] });
  }
  for (const tier of Object.keys(tiers).filter(name => !KNOWN_TIERS.includes(name)).sort()) {
    errors.push({ code: "unknown-tier", tier, actual: tier });
  }
  for (const tier of KNOWN_TIERS) {
    const actual = tiers[tier] && tiers[tier].codex;
    const actualModel = actual && typeof actual === "object" ? actual.model : undefined;
    const actualEffort = actual && typeof actual === "object" ? actual.model_reasoning_effort : undefined;
    if (actualModel !== CODEX_TIER_POLICY[tier].model) {
      errors.push({ code: "codex-model-mismatch", tier, expected: CODEX_TIER_POLICY[tier].model, actual: actualModel });
    }
    if (actualEffort !== CODEX_TIER_POLICY[tier].model_reasoning_effort) {
      errors.push({ code: "codex-reasoning-effort-mismatch", tier, expected: CODEX_TIER_POLICY[tier].model_reasoning_effort, actual: actualEffort });
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  resolveModel,
  validateSddModelPolicy,
  sddAgentsByTier,
  REQUIRED_SDD_AGENTS,
  KNOWN_TIERS,
  CODEX_TIER_POLICY,
  OMIT,
};
