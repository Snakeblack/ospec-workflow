"use strict";

// Resolve an agent's model per target from the two-table `models` config
// (agent -> tier, tier -> model-per-target). Pure and fail-soft: any gap
// yields OMIT so the generator simply writes no `model:` key (host inherits).

const OMIT = Symbol("model-omit");
const INHERIT = "inherit";

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

module.exports = { resolveModel, OMIT };
