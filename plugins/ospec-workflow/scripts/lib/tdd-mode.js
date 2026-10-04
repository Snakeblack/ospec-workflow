"use strict";

/**
 * Resolves the TDD mode from openspec config object.
 * Authority: testing.tdd_mode (standard | focused | strict).
 * Scale is NOT used for runtime resolution.
 *
 * @param {object} [config]
 * @returns {"standard" | "focused" | "strict"}
 */
function resolveTddMode(config = {}) {
  if (!config || typeof config !== "object") {
    return "standard";
  }
  const rawMode = config.testing?.tdd_mode || config.testing?.tddMode;
  if (typeof rawMode === "string") {
    const normalized = rawMode.trim().toLowerCase();
    if (["standard", "focused", "strict"].includes(normalized)) {
      return normalized;
    }
  }
  return "standard";
}

module.exports = {
  resolveTddMode,
};
