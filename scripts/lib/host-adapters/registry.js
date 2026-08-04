"use strict";

/**
 * Explicit K2a product-adapter registry.
 * Only `claude` is activated. Other profiles remain inactive stubs until K11a.
 * Headless Conformance Host is NOT a product adapter.
 */

const ACTIVE_PRODUCT_ADAPTERS = Object.freeze(["claude"]);

const INACTIVE_PRODUCT_STUBS = Object.freeze([
  "vscode",
  "github-copilot",
  "opencode",
  "codex",
  "cursor",
]);

function listActivatedRealAdapters() {
  return ACTIVE_PRODUCT_ADAPTERS.slice();
}

function isActivatedRealAdapter(adapterId) {
  return ACTIVE_PRODUCT_ADAPTERS.includes(adapterId);
}

function isInactiveStub(adapterId) {
  return INACTIVE_PRODUCT_STUBS.includes(adapterId);
}

function isConformanceHostCountedAsProductAdapter() {
  return false;
}

function getAdapterFactory(adapterId) {
  if (adapterId === "claude") {
    return require("./claude.js").createClaudeHostAdapter;
  }
  if (isInactiveStub(adapterId)) {
    const error = new Error(`adapter "${adapterId}" is an inactive stub until K11a`);
    error.code = "inactive-adapter-stub";
    throw error;
  }
  const error = new Error(`unknown adapter "${adapterId}"`);
  error.code = "unknown-adapter";
  throw error;
}

function assertSoleClaudeActivation(inventory) {
  const activated = Array.isArray(inventory) ? inventory : listActivatedRealAdapters();
  const real = activated.filter((id) => id !== "headless-conformance-host" && id !== "headless");
  if (real.length !== 1 || real[0] !== "claude") {
    return {
      ok: false,
      reason_code: "sole-adapter-gate-failed",
      activated: real,
    };
  }
  return { ok: true, activated: real };
}

module.exports = {
  ACTIVE_PRODUCT_ADAPTERS,
  INACTIVE_PRODUCT_STUBS,
  listActivatedRealAdapters,
  isActivatedRealAdapter,
  isInactiveStub,
  isConformanceHostCountedAsProductAdapter,
  getAdapterFactory,
  assertSoleClaudeActivation,
};
