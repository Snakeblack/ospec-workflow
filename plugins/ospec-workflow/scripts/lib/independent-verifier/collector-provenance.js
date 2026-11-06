"use strict";

const STRONG_CLASSES = Object.freeze(["runtime-observed", "host-attested", "tool-produced"]);
const WEAK_CLASSES = Object.freeze(["model-reported", "human-decision", "external-unverified"]);

const ALLOWLIST = Object.freeze([
  {
    ids: Object.freeze(["node-test", "npm-test", "node:test"]),
    transport: "tool-execution-transport",
    provenanceClass: "runtime-observed",
  },
  {
    ids: Object.freeze(["tool-execution"]),
    transport: "tool-execution-transport",
    provenanceClass: "tool-produced",
  },
  {
    ids: Object.freeze(["host-adapter"]),
    transport: "execution-transport",
    provenanceClass: "host-attested",
  },
]);

function fail(reason_code, error) {
  return { ok: false, reason_code, error: error || reason_code };
}

function deriveProvenanceClass(collector) {
  if (!collector || typeof collector !== "object") {
    return { provenance: null, trusted: false, worker: false };
  }
  const id = collector.id;
  const transport = collector.transport;
  if (id === "worker" || transport === "worker-transport") {
    return { provenance: "model-reported", trusted: false, worker: true };
  }
  for (const row of ALLOWLIST) {
    if (row.ids.includes(id) && row.transport === transport) {
      return { provenance: row.provenanceClass, trusted: true, worker: false };
    }
  }
  return { provenance: null, trusted: false, worker: false };
}

/**
 * Stored class comes from the harness collector channel (`provenanceClass` on the
 * allowlist row), not from silently upgrading a payload claim. The allowlisted
 * collector is the authority of the stored class even when the envelope claims a
 * weaker provenance. `collectorResolution` is that channel result, not the raw
 * collector object.
 */
function resolveEvidenceProvenance(raw, harnessCollector) {
  // Channel identity is only the harness argument. A collector field on the
  // worker envelope is rejected, not ignored or merged with the channel.
  if (raw && Object.prototype.hasOwnProperty.call(raw, "collector")) return fail("UNTRUSTED_COLLECTOR");
  const claimed = raw && raw.provenance;
  const collectorResolution = deriveProvenanceClass(harnessCollector);
  const claimsStrong = STRONG_CLASSES.includes(claimed);
  const claimedClass = typeof claimed === "string" && claimed.length > 0 ? claimed : null;

  if (claimsStrong && !collectorResolution.trusted) {
    return fail("UNTRUSTED_COLLECTOR", "strong provenance requires an allowlisted collector/transport");
  }
  if (collectorResolution.trusted) {
    if (claimedClass && claimedClass !== collectorResolution.provenance) {
      return fail("UNTRUSTED_COLLECTOR", "claimed provenance disagrees with collector-derived class");
    }
    return { ok: true, provenance: collectorResolution.provenance };
  }
  if (collectorResolution.worker) {
    return { ok: true, provenance: "model-reported" };
  }
  if (WEAK_CLASSES.includes(claimed)) {
    return { ok: true, provenance: claimed };
  }
  if (claimsStrong) {
    return fail("UNTRUSTED_COLLECTOR", "strong provenance requires an allowlisted collector/transport");
  }
  return fail("UNTRUSTED_COLLECTOR", "collector/transport metadata is absent or untrusted");
}

module.exports = {
  STRONG_CLASSES,
  deriveProvenanceClass,
  resolveEvidenceProvenance,
};
