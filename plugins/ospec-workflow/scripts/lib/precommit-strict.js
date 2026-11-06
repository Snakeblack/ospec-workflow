"use strict";

// Which declaration turns on the pre-commit Strict TDD heuristic.
// IDD (idd/config.yaml present and mode is not sdd) uses strict_tdd only.
// SDD (mode: sdd, or no idd/config.yaml) uses openspec testing.tdd_mode.
// A missing strict_tdd key is false. The other file, when it exists and
// disagrees, is a contradiction the doctor reports; it does not change the hook.

const fs = require("node:fs");
const path = require("node:path");

const { parseIddConfig } = require("./idd-config.js");
const { resolveTddMode } = require("./tdd-mode.js");

function openspecIsStrict(text) {
  if (text == null) return false;
  const match = String(text).match(/tdd_mode\s*:\s*["']?(\w+)/i);
  return resolveTddMode({ testing: match ? { tdd_mode: match[1] } : undefined }) === "strict";
}

/**
 * @param {{ iddText?: string|null, openspecText?: string|null }} sources
 * A null text means that file is absent.
 */
function resolvePrecommitStrict({ iddText = null, openspecText = null } = {}) {
  let idd = { present: false, mode: null, strict: false, invalid: false };
  if (iddText != null) {
    try {
      const parsed = parseIddConfig(iddText);
      idd = { present: true, mode: parsed.mode, strict: parsed.strictTdd === true, invalid: false };
    } catch {
      idd = { present: true, mode: null, strict: false, invalid: true };
    }
  }
  const openspec = { present: openspecText != null, strict: openspecIsStrict(openspecText) };
  const iddActive = idd.present && idd.mode !== "sdd";
  const active = iddActive ? "idd" : "sdd";
  const activeStrict = iddActive ? idd.strict : openspec.strict;
  const other = iddActive ? openspec : idd;
  const contradiction = !idd.invalid && other.present && other.strict !== activeStrict;
  return { active, activeStrict, contradiction, idd, openspec };
}

function readIfExists(root, relative, fsImpl) {
  const file = path.join(root, ...relative.split("/"));
  if (!fsImpl.existsSync(file)) return null;
  try {
    return fsImpl.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function readPrecommitStrict(root, fsImpl = fs) {
  return resolvePrecommitStrict({
    iddText: readIfExists(root, "idd/config.yaml", fsImpl),
    openspecText: readIfExists(root, "openspec/config.yaml", fsImpl),
  });
}

module.exports = {
  readPrecommitStrict,
  resolvePrecommitStrict,
};
