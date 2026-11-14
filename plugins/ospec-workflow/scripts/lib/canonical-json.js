"use strict";

const crypto = require("node:crypto");

/**
 * Recursively serialize a JSON-compatible value with object keys sorted.
 * Matches the harness pattern used by review-lineage digests (ADR-002).
 *
 * @param {*} value
 * @returns {string}
 */
function stableSerialize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

/**
 * Domain-prefixed SHA-256 fingerprint: `sha256:` + hex.
 * Domain bytes are followed by a NUL separator then the stable serialization.
 *
 * @param {string} domain
 * @param {*} value
 * @returns {string}
 */
function sha256Fingerprint(domain, value) {
  return `sha256:${crypto.createHash("sha256").update(`${domain}\0${stableSerialize(value)}`).digest("hex")}`;
}

module.exports = { stableSerialize, sha256Fingerprint };
