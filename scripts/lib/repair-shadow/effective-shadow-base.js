"use strict";

const { normalizeRelativePath } = require("../allowed-paths-validator.js");
const { computeTreeDigest } = require("../worker-workspace.js");

function fileContentToString(value) {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * Normalizes a files collection into a Map of posix-relative path → utf8 content.
 *
 * @param {Map|Array|Object|null|undefined} files
 * @returns {Map<string, string>}
 */
function collectFilesMap(files) {
  const baseFilesMap = new Map();
  if (!files) return baseFilesMap;

  if (files instanceof Map) {
    for (const [k, v] of files.entries()) {
      const norm = normalizeRelativePath(k);
      if (norm) baseFilesMap.set(norm, fileContentToString(v));
    }
    return baseFilesMap;
  }

  if (Array.isArray(files)) {
    for (const item of files) {
      if (!item || !item.path) continue;
      const norm = normalizeRelativePath(item.path);
      if (norm) baseFilesMap.set(norm, fileContentToString(item.content));
    }
    return baseFilesMap;
  }

  if (typeof files === "object") {
    for (const [k, v] of Object.entries(files)) {
      const norm = normalizeRelativePath(k);
      if (norm) baseFilesMap.set(norm, fileContentToString(v));
    }
  }
  return baseFilesMap;
}

/**
 * Builds a deterministic EffectiveShadowBase from snapshot identity, files, and modes.
 * Derived bases are materialization inputs only; they do not change SourceSnapshot identity.
 *
 * @param {Object} input
 * @returns {Object}
 */
function buildEffectiveShadowBase(input = {}) {
  const sourceSnapshot = input.sourceSnapshot;
  const filesMap = collectFilesMap(input.files);
  const file_modes = { ...(input.file_modes || {}) };
  const predecessor_node_ids = Array.isArray(input.predecessor_node_ids)
    ? [...input.predecessor_node_ids]
    : [];
  const source_snapshot_id =
    (sourceSnapshot && sourceSnapshot.source_snapshot_id) || input.source_snapshot_id || "";

  return {
    kind: "effective-shadow-base/v1",
    source_snapshot_id,
    predecessor_node_ids,
    tree_digest: computeTreeDigest(filesMap),
    files: filesMap,
    file_modes,
  };
}

module.exports = {
  collectFilesMap,
  buildEffectiveShadowBase,
};
