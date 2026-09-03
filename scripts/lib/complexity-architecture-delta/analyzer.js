"use strict";

function computeDimensionDelta(observation) {
  if (observation.status === "unavailable") {
    return { status: "unavailable", reason: observation.reason };
  }
  const baseById = new Map(observation.base.map((record) => [record.id, record]));
  const candidateById = new Map(observation.candidate.map((record) => [record.id, record]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [id, record] of candidateById) {
    const before = baseById.get(id);
    if (!before) added.push(record);
    else if (before.digest !== record.digest) changed.push({ id, before_digest: before.digest, after_digest: record.digest });
  }
  for (const [id, record] of baseById) if (!candidateById.has(id)) removed.push(record);
  // Locale-independent UTF-16 code-unit order (not localeCompare / Collator).
  const byId = (left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  return { status: "observed", added: added.sort(byId), removed: removed.sort(byId), changed: changed.sort(byId) };
}

function computeDeltas(observations) {
  return Object.fromEntries(Object.entries(observations).map(([dimension, value]) => [dimension, computeDimensionDelta(value)]));
}

module.exports = { computeDimensionDelta, computeDeltas };
