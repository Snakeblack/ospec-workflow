"use strict";

// Decision-gap engine (openspec/specs/decision-gap/spec.md, REQ-decision-gap-001
// to REQ-decision-gap-004). Ranks knowledge-map gaps and persists one answer.
// The finished-map validator stays strict; a draft may still leave a mandatory
// slot unknown. These requires put the catalog and schema on the runtime graph
// so an installed CLI can read them from disk.

require("../../schemas/foundation/knowledge-map/catalog.json");
require("../../schemas/foundation/knowledge-map/v1.schema.json");

const fs = require("node:fs");
const path = require("node:path");
const { loadCatalog, validateKnowledgeMap } = require("./knowledge-map.js");
const { writeFileAtomic } = require("./atomic-write.js");

const MAP_RELATIVE = "docs/architecture/knowledge-map.yaml";
const SOURCE_KINDS = new Set(["user", "document", "repository"]);
const RECORD_STATES = new Set(["confirmed", "assumed", "n/a", "deferred"]);

class DecisionGapError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DecisionGapError";
    this.code = code;
  }
}

function mapFile(root, override) {
  return override ? path.resolve(root, override) : path.join(root, MAP_RELATIVE);
}

function displayPath(override) {
  if (!override) return MAP_RELATIVE;
  return override.split(path.sep).join("/");
}

function readMap(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  try {
    return { map: JSON.parse(raw), raw };
  } catch (error) {
    throw new DecisionGapError("map-unreadable", `${file} is not JSON text (valid YAML 1.2): ${error.message}`);
  }
}

function draftErrors(map) {
  const result = validateKnowledgeMap(map);
  return result.errors.filter((error) => error.rule !== "mandatory");
}

function assertDraft(map, file) {
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    throw new DecisionGapError("map-invalid", `${file} is not a knowledge map`);
  }
  const errors = draftErrors(map);
  if (errors.length > 0) {
    throw new DecisionGapError("map-invalid", `${file}: ${errors.map((error) => error.message).join("; ")}`);
  }
}

function blankMap(profile, catalog) {
  if (!catalog.profiles.includes(profile)) {
    throw new DecisionGapError("unknown-profile", `unknown profile "${profile}"`);
  }
  return {
    schema: "ospec-knowledge-map/v1",
    profile,
    slots: catalog.slots.map((slot) => ({
      id: slot.id,
      dimension: slot.dimension,
      state: "unknown",
      decisions: [...slot.decisions],
    })),
    quality_scenarios: [],
  };
}

function unanswered(map, id) {
  const slot = map.slots.find((item) => item.id === id);
  return !slot || slot.state === "unknown";
}

function pendingDecisions(catalog, map) {
  const pending = new Set();
  for (const slot of catalog.slots) {
    if (!unanswered(map, slot.id)) continue;
    for (const decision of slot.decisions) pending.add(decision);
  }
  return pending;
}

function selectRound(map, catalog = loadCatalog()) {
  const pending = pendingDecisions(catalog, map);
  const ranked = catalog.slots
    .map((slot, index) => {
      const open = unanswered(map, slot.id);
      const impact = slot.decisions.filter((decision) => pending.has(decision)).length;
      const weight = slot.mandatory.includes(map.profile) ? 2 : 1;
      const decisions = slot.decisions.filter((decision) => pending.has(decision));
      return {
        id: slot.id,
        dimension: slot.dimension,
        mandatory: slot.mandatory.includes(map.profile),
        priority: impact * (open ? 1 : 0) * weight,
        decisions,
        index,
      };
    })
    .filter((slot) => slot.priority > 0)
    .sort((a, b) => b.priority - a.priority || a.index - b.index);

  if (ranked.length === 0) return { profile: map.profile, theme: null, round: [] };
  const theme = ranked[0].dimension;
  const round = ranked
    .filter((slot) => slot.dimension === theme)
    .slice(0, 4)
    .map((slot) => ({
      id: slot.id,
      dimension: slot.dimension,
      mandatory: slot.mandatory,
      priority: slot.priority,
      decisions: slot.decisions,
      recommendation: { unblocks: [...slot.decisions], if_unknown: "assumed" },
    }));
  return { profile: map.profile, theme, round };
}

function nextRound({ root, profile = null, map: mapOverride = null } = {}) {
  const file = mapFile(root, mapOverride);
  const loaded = readMap(file);
  const shown = displayPath(mapOverride);
  if (!loaded) {
    if (typeof profile !== "string" || profile.trim() === "") {
      throw new DecisionGapError("profile-required", "foundation next needs --profile when the knowledge map does not exist");
    }
    const template = blankMap(profile, loadCatalog());
    return { ...selectRound(template), map: shown, exists: false, template };
  }
  assertDraft(loaded.map, file);
  if (profile && profile !== loaded.map.profile) {
    throw new DecisionGapError("profile-mismatch", `map profile is ${loaded.map.profile}, not ${profile}`);
  }
  return { ...selectRound(loaded.map), map: shown, exists: true };
}

function text(value, code, message) {
  if (typeof value !== "string" || value.trim() === "") throw new DecisionGapError(code, message);
  return value.trim();
}

function buildSlot(defined, answer) {
  if (!RECORD_STATES.has(answer.state)) {
    throw new DecisionGapError("state-invalid", `state must be confirmed, assumed, n/a or deferred, got ${JSON.stringify(answer.state)}`);
  }
  const slot = {
    id: defined.id,
    dimension: defined.dimension,
    state: answer.state,
    decisions: [...defined.decisions],
  };
  if (answer.state === "confirmed" || answer.state === "assumed") {
    const kind = text(answer.sourceKind, "answer-incomplete", `${answer.state} needs --source-kind`);
    if (!SOURCE_KINDS.has(kind)) throw new DecisionGapError("answer-incomplete", `--source-kind must be user, document or repository`);
    slot.source = { kind, ref: text(answer.sourceRef, "answer-incomplete", `${answer.state} needs --source-ref`) };
  }
  if (answer.state === "assumed") {
    slot.review_trigger = text(answer.reviewTrigger, "answer-incomplete", "assumed needs --review-trigger");
  }
  if (answer.state === "n/a") {
    slot.reason = text(answer.reason, "answer-incomplete", "n/a needs --reason");
  }
  if (answer.state === "deferred") {
    slot.owner = text(answer.owner, "answer-incomplete", "deferred needs --owner");
    if (typeof answer.reviewTrigger === "string" && answer.reviewTrigger.trim() !== "") {
      slot.review_trigger = answer.reviewTrigger.trim();
    }
  }
  return slot;
}

function serialize(map) {
  return `${JSON.stringify(map, null, 2)}\n`;
}

async function recordAnswer({
  root,
  map: mapOverride = null,
  slot: slotId,
  state,
  sourceKind = null,
  sourceRef = null,
  reviewTrigger = null,
  reason = null,
  owner = null,
} = {}) {
  const file = mapFile(root, mapOverride);
  const loaded = readMap(file);
  if (!loaded) throw new DecisionGapError("map-missing", `${displayPath(mapOverride)} does not exist`);
  assertDraft(loaded.map, file);
  const catalog = loadCatalog();
  const defined = catalog.slots.find((slot) => slot.id === slotId);
  if (!defined) throw new DecisionGapError("unknown-slot", `unknown slot "${slotId}"`);
  const slot = buildSlot(defined, { state, sourceKind, sourceRef, reviewTrigger, reason, owner });
  const draft = validateKnowledgeMap({ ...loaded.map, slots: [slot] });
  const slotErrors = draft.errors.filter((error) => error.rule !== "mandatory" && error.path.startsWith("/slots/"));
  if (slotErrors.length > 0) {
    throw new DecisionGapError("map-invalid", slotErrors.map((error) => error.message).join("; "));
  }

  const slots = loaded.map.slots.slice();
  const index = slots.findIndex((item) => item.id === slot.id);
  if (index >= 0) slots[index] = slot;
  else slots.push(slot);
  const next = {
    schema: loaded.map.schema,
    profile: loaded.map.profile,
    slots,
    quality_scenarios: loaded.map.quality_scenarios,
  };
  assertDraft(next, file);
  const shown = displayPath(mapOverride);
  const round = selectRound(next, catalog);
  const textOut = serialize(next);
  if (textOut === loaded.raw) return { ...round, slot: slot.id, map: shown, changed: false };
  await writeFileAtomic(file, textOut);
  return { ...round, slot: slot.id, map: shown, changed: true };
}

module.exports = {
  DecisionGapError,
  MAP_RELATIVE,
  nextRound,
  recordAnswer,
};
