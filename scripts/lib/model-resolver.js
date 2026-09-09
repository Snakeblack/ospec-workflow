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
const CONTROL_FIELDS_BY_TARGET = {
  claude: "effort",
  codex: "model_reasoning_effort",
  opencode: "variant",
};
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

function modelKey(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value.model : value;
}

function canonicalControlsFor(models, target, value) {
  const key = modelKey(value);
  if (typeof key !== "string") return {};
  const declared = models?.installer?.capabilities?.[target]?.[key];
  if (!declared || typeof declared !== "object" || Array.isArray(declared)) return {};
  const controls = {};
  for (const [name, control] of Object.entries(declared)) {
    if (!control || typeof control !== "object" || Array.isArray(control)) continue;
    if (!Array.isArray(control.values) || !control.values.every(item => typeof item === "string") || !control.values.includes(control.default)) continue;
    controls[name] = { values: [...control.values], default: control.default };
  }
  return controls;
}

function validateModelOverrides(modelOverrides, models, target) {
  if (modelOverrides === undefined) return { valid: true, errors: [] };
  const errors = [];
  if (!modelOverrides || typeof modelOverrides !== "object" || Array.isArray(modelOverrides)) {
    return { valid: false, errors: [{ code: "invalid-overrides" }] };
  }
  for (const [agent, value] of Object.entries(modelOverrides)) {
    if (!agent || !isModelValue(value)) errors.push({ code: "invalid-override", agent });
    if (target && Object.keys(CONTROL_FIELDS_BY_TARGET).includes(target)) {
      const field = CONTROL_FIELDS_BY_TARGET[target];
      const model = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      if (Object.prototype.hasOwnProperty.call(model, field)) {
        const policy = canonicalControlsFor(models, target, value)[field];
        if (!policy || !policy.values.includes(model[field])) errors.push({ code: "unsupported-control", agent, target, field, actual: model[field] });
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

function validateInstallerPolicy(models) {
  const errors = [];
  const agents = models && typeof models === "object" && models.agents && typeof models.agents === "object" ? models.agents : {};
  const installer = models && typeof models === "object" ? models.installer : null;
  if (!installer || typeof installer !== "object" || Array.isArray(installer)) {
    errors.push({ code: "missing-installer-policy" });
  } else {
    const groups = installer.phase_groups;
    if (!groups || typeof groups !== "object" || Array.isArray(groups) || Object.keys(groups).length === 0) {
      errors.push({ code: "missing-phase-groups" });
    } else {
      for (const [group, definition] of Object.entries(groups)) {
        const members = definition?.agents;
        if (!Array.isArray(members) || members.length === 0) errors.push({ code: "invalid-phase-group", group });
        else for (const agent of members) if (typeof agent !== "string" || agents[agent] === undefined) errors.push({ code: "unknown-phase-agent", group, agent });
      }
    }
    const presets = installer.presets;
    if (!presets || typeof presets !== "object" || Array.isArray(presets) || Object.keys(presets).length === 0) errors.push({ code: "missing-presets" });
    else for (const [preset, definition] of Object.entries(presets)) {
      const groups = definition?.groups;
      if (!Array.isArray(groups) || groups.length === 0 || groups.some(group => !installer.phase_groups?.[group])) errors.push({ code: "invalid-preset-group", preset });
    }
    const capabilities = installer.capabilities;
    if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) errors.push({ code: "missing-capabilities" });
    else for (const [target, modelsByKey] of Object.entries(capabilities)) {
      const field = CONTROL_FIELDS_BY_TARGET[target];
      if (!field || !modelsByKey || typeof modelsByKey !== "object" || Array.isArray(modelsByKey)) {
        errors.push({ code: "invalid-capability-target", target });
        continue;
      }
      for (const [key, controls] of Object.entries(modelsByKey)) {
        const control = controls?.[field];
        if (!key || !control || !Array.isArray(control.values) || !control.values.every(value => typeof value === "string") || !control.values.includes(control.default)) {
          errors.push({ code: "invalid-capability", target, model: key, field });
        }
      }
    }
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
  validateModelOverrides,
  validateSddModelPolicy,
  validateInstallerPolicy,
  canonicalControlsFor,
  sddAgentsByTier,
  REQUIRED_SDD_AGENTS,
  REQUIRED_QUALITY_REVIEW_AGENTS,
  LEGACY_QUALITY_REVIEW_AGENTS,
  KNOWN_TIERS,
  OMIT,
};
