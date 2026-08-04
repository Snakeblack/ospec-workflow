"use strict";

const { stableSerialize, sha256Fingerprint } = require("../canonical-json.js");

const KERNEL_VERSION = 1;

const VOLATILE_KEYS = new Set([
  "evaluated_at",
  "wall_clock_ms",
  "clock",
  "timestamp",
  "now",
]);

function stripVolatile(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripVolatile);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (VOLATILE_KEYS.has(key)) continue;
    out[key] = stripVolatile(value[key]);
  }
  return out;
}

function canonicalizeState(state) {
  return stableSerialize(stripVolatile(state));
}

function digestLifecycleState(state) {
  return sha256Fingerprint(`lifecycle-kernel:v${KERNEL_VERSION}`, stripVolatile(state));
}

module.exports = {
  KERNEL_VERSION,
  canonicalizeState,
  digestLifecycleState,
  stripVolatile,
};
