"use strict";

// Resolve an agent's model per target from the two-table `models` config
// (agent -> tier, tier -> model-per-target). Pure and fail-soft: any gap
// yields OMIT so the generator simply writes no `model:` key (host inherits).

const OMIT = Symbol("model-omit");
const INHERIT = "inherit";
const SDD_AGENT_TIERS = {
  premium: ["sdd-propose", "sdd-design", "sdd-verify", "sdd-foundation", "sdd-workspace"],
  default: ["sdd-orchestrator", "sdd-spec", "sdd-clarify", "sdd-apply", "sdd-reconcile", "sdd-baseline"],
  cheap: ["sdd-init", "sdd-explore", "sdd-tasks", "sdd-archive", "sdd-onboard", "sdd-document"],
};
const CODEX_TIER_POLICY = {
  premium: { model: "gpt-5.6-sol", model_reasoning_effort: "medium" },
  default: { model: "gpt-5.6-terra", model_reasoning_effort: "medium" },
  cheap: { model: "gpt-5.6-luna", model_reasoning_effort: "low" },
};
const REVIEW_AGENTS = ["review-change", "review-correction", "review-risk", "review-readability", "review-reliability", "review-resilience"];

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
  const knownTiers = Object.keys(SDD_AGENT_TIERS);
  const expectedAgents = new Set(Object.values(SDD_AGENT_TIERS).flat());

  for (const [expected, names] of Object.entries(SDD_AGENT_TIERS)) {
    for (const agent of names) {
      const actual = agents[agent];
      if (actual === undefined) errors.push({ code: "missing-agent", agent, expected });
      else if (!knownTiers.includes(actual)) errors.push({ code: "unknown-tier", agent, expected, actual });
      else if (actual !== expected) errors.push({ code: "tier-mismatch", agent, expected, actual });
    }
  }
  for (const agent of Object.keys(agents).filter(name => name.startsWith("sdd-") && !expectedAgents.has(name)).sort()) {
    errors.push({ code: "unexpected-agent", agent, actual: agents[agent] });
  }
  for (const agent of [...REVIEW_AGENTS, "_default"]) {
    if (agents[agent] !== "default") errors.push({ code: "tier-mismatch", agent, expected: "default", actual: agents[agent] });
  }
  for (const tier of Object.keys(tiers).filter(name => !knownTiers.includes(name)).sort()) {
    errors.push({ code: "unknown-tier", tier, actual: tier });
  }
  for (const tier of knownTiers) {
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

module.exports = { resolveModel, validateSddModelPolicy, SDD_AGENT_TIERS, CODEX_TIER_POLICY, OMIT };
