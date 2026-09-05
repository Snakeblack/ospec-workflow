"use strict";

/**
 * Pure archive-plan.json schema v1 validator.
 * No filesystem I/O. Never throws — returns structured {valid, codes[], errors[]}.
 */

const PLAN_SCHEMA_VERSION = 1;

const PLAN_REJECTION_CODES = Object.freeze([
  "invalid-schema",
  "invalid-rollback-strategy",
  "missing-reference",
  "hash-mismatch",
  "inventory-mismatch",
  "change-name-mismatch",
  "corrupted-spec-content",
  "dropped-requirement-id",
]);


const KNOWN_CODES = new Set(PLAN_REJECTION_CODES);

function isKnownRejectionCode(code) {
  return typeof code === "string" && KNOWN_CODES.has(code);
}

function emptyResult() {
  return { valid: true, codes: [], errors: [] };
}

function fail(codes, errors) {
  const unique = [];
  for (const c of codes) {
    if (!unique.includes(c)) unique.push(c);
  }
  return { valid: false, codes: unique, errors: errors || [] };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSha256Digest(value) {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/i.test(value);
}

function normalizeDigest(value) {
  return typeof value === "string" ? value.toLowerCase() : value;
}

/**
 * @param {string} text
 * @returns {{parsed: boolean, value: object|null}}
 */
function parsePlan(text) {
  if (typeof text !== "string") {
    return { parsed: false, value: null };
  }
  try {
    const value = JSON.parse(text);
    if (!isPlainObject(value)) {
      return { parsed: false, value: null };
    }
    return { parsed: true, value };
  } catch {
    return { parsed: false, value: null };
  }
}

function pushCode(codes, errors, code, message) {
  codes.push(code);
  errors.push({ code, message });
}

/** Reject absolute / `..` / empty segments. Pure, no I/O. */
function hasTraversalOrAbsolute(p) {
  if (typeof p !== "string" || !p) return true;
  if (p.startsWith("/") || p.startsWith("\\") || /^[a-zA-Z]:[\\/]/.test(p)) return true;
  const n = p.replace(/\\/g, "/");
  return n.startsWith("//") || n.split("/").some((s) => s === ".." || s === "");
}
function isRelativeUnder(p, root) {
  if (hasTraversalOrAbsolute(p)) return false;
  const n = String(p).replace(/\\/g, "/");
  return n === root || n.startsWith(`${root}/`);
}
function isSafeChangeName(name) {
  return typeof name === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
}
function isSafeDomain(domain) {
  return isSafeChangeName(domain);
}

/**
 * @param {object} plan
 * @param {{changeName: string}} options
 * @returns {{valid: boolean, codes: string[], errors: object[]}}
 */
function validatePlanShape(plan, options) {
  const codes = [];
  const errors = [];
  const changeName = options && options.changeName;

  if (!isPlainObject(plan)) {
    return fail(
      ["invalid-schema"],
      [{ code: "invalid-schema", message: "plan must be a plain object" }],
    );
  }

  if (plan.schema_version !== PLAN_SCHEMA_VERSION) {
    pushCode(
      codes,
      errors,
      "invalid-schema",
      `unsupported schema_version: ${String(plan.schema_version)}`,
    );
  }

  if (typeof plan.change !== "string" || plan.change.length === 0) {
    pushCode(codes, errors, "invalid-schema", "change must be a non-empty string");
  } else if (typeof changeName === "string" && plan.change !== changeName) {
    pushCode(
      codes,
      errors,
      "change-name-mismatch",
      `change "${plan.change}" !== active "${changeName}"`,
    );
  }

  if (!isSha256Digest(plan.source_fingerprint)) {
    pushCode(
      codes,
      errors,
      "invalid-schema",
      "source_fingerprint must be sha256:<64hex>",
    );
  }

  if (!Array.isArray(plan.spec_writes)) {
    pushCode(codes, errors, "invalid-schema", "spec_writes must be an array");
  } else {
    for (let i = 0; i < plan.spec_writes.length; i++) {
      const entry = plan.spec_writes[i];
      if (!isPlainObject(entry)) {
        pushCode(codes, errors, "invalid-schema", `spec_writes[${i}] must be object`);
        continue;
      }
      for (const field of ["domain", "source_delta", "target", "content_sha256"]) {
        if (typeof entry[field] !== "string" || entry[field].length === 0) {
          pushCode(
            codes,
            errors,
            "invalid-schema",
            `spec_writes[${i}].${field} required`,
          );
        }
      }
      if (entry.domain && !isSafeDomain(entry.domain)) {
        pushCode(codes, errors, "invalid-schema", `spec_writes[${i}].domain unsafe`);
      }
      if (entry.source_delta && hasTraversalOrAbsolute(entry.source_delta)) {
        pushCode(codes, errors, "invalid-schema", `spec_writes[${i}].source_delta unsafe`);
      }
      if (entry.target && !isRelativeUnder(entry.target, "openspec/specs")) {
        pushCode(codes, errors, "invalid-schema", `spec_writes[${i}].target unsafe`);
      }
      if (
        entry.target_before_sha256 != null &&
        !isSha256Digest(entry.target_before_sha256)
      ) {
        pushCode(
          codes,
          errors,
          "invalid-schema",
          `spec_writes[${i}].target_before_sha256 invalid`,
        );
      }
      if (entry.content_sha256 != null && !isSha256Digest(entry.content_sha256)) {
        pushCode(
          codes,
          errors,
          "invalid-schema",
          `spec_writes[${i}].content_sha256 invalid`,
        );
      }
    }
  }

  if (!Array.isArray(plan.adr_promotions)) {
    pushCode(codes, errors, "invalid-schema", "adr_promotions must be an array");
  } else {
    for (let i = 0; i < plan.adr_promotions.length; i++) {
      const entry = plan.adr_promotions[i];
      if (!isPlainObject(entry)) {
        pushCode(codes, errors, "invalid-schema", `adr_promotions[${i}] must be object`);
        continue;
      }
      for (const field of ["source", "target", "content_sha256"]) {
        if (typeof entry[field] !== "string" || entry[field].length === 0) {
          pushCode(
            codes,
            errors,
            "invalid-schema",
            `adr_promotions[${i}].${field} required`,
          );
        }
      }
      if (entry.source && hasTraversalOrAbsolute(entry.source)) {
        pushCode(codes, errors, "invalid-schema", `adr_promotions[${i}].source unsafe`);
      }
      if (entry.target && !isRelativeUnder(entry.target, "docs/adr")) {
        pushCode(codes, errors, "invalid-schema", `adr_promotions[${i}].target unsafe`);
      }
      if (entry.content_sha256 != null && !isSha256Digest(entry.content_sha256)) {
        pushCode(
          codes,
          errors,
          "invalid-schema",
          `adr_promotions[${i}].content_sha256 invalid`,
        );
      }
    }
  }

  if (!Array.isArray(plan.archive_inventory)) {
    pushCode(codes, errors, "invalid-schema", "archive_inventory must be an array");
  } else if (!plan.archive_inventory.every((p) => typeof p === "string")) {
    pushCode(
      codes,
      errors,
      "invalid-schema",
      "archive_inventory entries must be strings",
    );
  } else if (plan.archive_inventory.some(hasTraversalOrAbsolute)) {
    pushCode(codes, errors, "invalid-schema", "archive_inventory unsafe path");
  }

  if (!Array.isArray(plan.accepted_warnings)) {
    pushCode(codes, errors, "invalid-schema", "accepted_warnings must be an array");
  }

  if (!isPlainObject(plan.rollback) || typeof plan.rollback.strategy !== "string") {
    pushCode(codes, errors, "invalid-schema", "rollback.strategy required");
  } else if (plan.rollback.strategy !== "staging-rename") {
    pushCode(
      codes,
      errors,
      "invalid-rollback-strategy",
      `rollback.strategy must be staging-rename, got ${plan.rollback.strategy}`,
    );
  }

  if (codes.length > 0) {
    return fail(codes, errors);
  }
  return emptyResult();
}

function extractRequirementIds(markdownText) {
  if (typeof markdownText !== "string") return new Set();
  const matches = markdownText.match(/\{#(REQ-[a-zA-Z0-9_-]+)\}/g) || [];
  return new Set(matches.map((m) => m.slice(2, -1)));
}

function extractRemovedRequirementIds(markdownText) {
  if (typeof markdownText !== "string") return new Set();
  const removedMatch = markdownText.match(/(?:^|\n)## REMOVED Requirements([\s\S]*?)(?=(?:\n## )|$)/);
  if (!removedMatch) return new Set();
  const text = removedMatch[1];
  const ids = new Set();
  for (const m of text.matchAll(/\{#(REQ-[a-zA-Z0-9_-]+)\}/g)) ids.add(m[1]);
  for (const m of text.matchAll(/\b(REQ-[a-zA-Z0-9_-]+)\b/g)) ids.add(m[1]);
  return ids;
}


function hasCorruptedSpecContent(text) {
  if (typeof text !== "string") return false;
  if (/^\s*undefined\s*$/m.test(text)) return true;
  if (/\[object Object\]/.test(text)) return true;
  return false;
}

/**
 * @param {object} plan - already shape-validated (or still checked lightly)
 * @param {object} snapshot
 * @returns {{valid: boolean, codes: string[], errors: object[]}}
 */
function validatePlanAgainstSnapshot(plan, snapshot) {
  const codes = [];
  const errors = [];

  if (!isPlainObject(plan) || !isPlainObject(snapshot)) {
    return fail(
      ["invalid-schema"],
      [{ code: "invalid-schema", message: "plan and snapshot must be objects" }],
    );
  }

  const originInventory = Array.isArray(snapshot.originInventory)
    ? snapshot.originInventory
    : [];
  const originPaths = new Set(
    originInventory.map((e) => (e && typeof e.path === "string" ? e.path : null)).filter(Boolean),
  );

  const archiveInventory = Array.isArray(plan.archive_inventory)
    ? plan.archive_inventory
    : [];
  const planPaths = new Set(archiveInventory);

  let inventoryMismatch = false;
  if (planPaths.size !== originPaths.size) {
    inventoryMismatch = true;
  } else {
    for (const p of planPaths) {
      if (!originPaths.has(p)) {
        inventoryMismatch = true;
        break;
      }
    }
  }

  const planFp = normalizeDigest(plan.source_fingerprint);
  const snapFp = normalizeDigest(snapshot.sourceFingerprint);
  if (planFp !== snapFp) {
    inventoryMismatch = true;
  }

  if (inventoryMismatch) {
    pushCode(
      codes,
      errors,
      "inventory-mismatch",
      "archive_inventory or source_fingerprint disagree with origin",
    );
  }

  const preparedContent = isPlainObject(snapshot.preparedContent)
    ? snapshot.preparedContent
    : {};
  const preparedTexts = isPlainObject(snapshot.preparedTexts)
    ? snapshot.preparedTexts
    : {};
  const targets = isPlainObject(snapshot.targets) ? snapshot.targets : {};
  const targetTexts = isPlainObject(snapshot.targetTexts)
    ? snapshot.targetTexts
    : {};
  const adrSources = isPlainObject(snapshot.adrSources) ? snapshot.adrSources : {};

  const specWrites = Array.isArray(plan.spec_writes) ? plan.spec_writes : [];
  for (let i = 0; i < specWrites.length; i++) {
    const entry = specWrites[i];
    if (!isPlainObject(entry)) continue;

    const preparedKey = entry.source_delta;
    const preparedHash = preparedContent[preparedKey];
    if (preparedHash == null) {
      pushCode(
        codes,
        errors,
        "missing-reference",
        `prepared content missing for ${preparedKey}`,
      );
    } else if (
      normalizeDigest(preparedHash) !== normalizeDigest(entry.content_sha256)
    ) {
      pushCode(
        codes,
        errors,
        "hash-mismatch",
        `content_sha256 mismatch for ${preparedKey}`,
      );
    }

    const prepText = preparedTexts[preparedKey];
    if (typeof prepText === "string") {
      if (hasCorruptedSpecContent(prepText)) {
        pushCode(
          codes,
          errors,
          "corrupted-spec-content",
          `prepared content for ${preparedKey} contains corrupted spec content`,
        );
      }
      const targetText = targetTexts[entry.target];
      if (typeof targetText === "string") {
        const targetReqs = extractRequirementIds(targetText);
        const prepReqs = extractRequirementIds(prepText);
        const removedReqs = extractRemovedRequirementIds(prepText);
        for (const reqId of targetReqs) {
          if (!prepReqs.has(reqId) && !removedReqs.has(reqId)) {
            pushCode(
              codes,
              errors,
              "dropped-requirement-id",
              `requirement ID ${reqId} dropped in ${preparedKey} without REMOVED declaration`,
            );
          }
        }
      }
    }

    const targetHash = Object.prototype.hasOwnProperty.call(targets, entry.target)
      ? targets[entry.target]
      : undefined;

    // null target_before means new file expected (target absent / null)
    if (entry.target_before_sha256 == null) {
      if (targetHash != null) {
        pushCode(
          codes,
          errors,
          "hash-mismatch",
          `target ${entry.target} exists but plan expected absent`,
        );
      }
    } else {
      if (targetHash == null) {
        pushCode(
          codes,
          errors,
          "missing-reference",
          `live target missing for ${entry.target}`,
        );
      } else if (
        normalizeDigest(targetHash) !== normalizeDigest(entry.target_before_sha256)
      ) {
        pushCode(
          codes,
          errors,
          "hash-mismatch",
          `target_before_sha256 mismatch for ${entry.target}`,
        );
      }
    }
  }

  const adrPromotions = Array.isArray(plan.adr_promotions) ? plan.adr_promotions : [];
  for (let i = 0; i < adrPromotions.length; i++) {
    const entry = adrPromotions[i];
    if (!isPlainObject(entry)) continue;
    const srcHash = adrSources[entry.source];
    if (srcHash == null) {
      pushCode(
        codes,
        errors,
        "missing-reference",
        `ADR source missing for ${entry.source}`,
      );
    } else if (normalizeDigest(srcHash) !== normalizeDigest(entry.content_sha256)) {
      pushCode(
        codes,
        errors,
        "hash-mismatch",
        `ADR content_sha256 mismatch for ${entry.source}`,
      );
    }
  }

  if (codes.length > 0) {
    return fail(codes, errors);
  }
  return emptyResult();
}

module.exports = {
  PLAN_SCHEMA_VERSION,
  PLAN_REJECTION_CODES,
  parsePlan,
  validatePlanShape,
  validatePlanAgainstSnapshot,
  extractRequirementIds,
  extractRemovedRequirementIds,
  hasCorruptedSpecContent,
  isKnownRejectionCode,
  hasTraversalOrAbsolute,
  isRelativeUnder,
  isSafeChangeName,
  isSafeDomain,
};

