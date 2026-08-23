"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { normalizeRelativePath } = require("./allowed-paths-validator.js");

/**
 * Normalizes line endings to LF for deterministic hashing.
 *
 * @param {string|Buffer} content
 * @returns {Buffer}
 */
function normalizeToBuffer(content) {
  if (Buffer.isBuffer(content)) {
    const text = content.toString("utf8").replace(/\r\n/g, "\n");
    return Buffer.from(text, "utf8");
  }
  const text = String(content || "").replace(/\r\n/g, "\n");
  return Buffer.from(text, "utf8");
}

/**
 * Computes SHA-256 digest with sha256: prefix.
 *
 * @param {string|Buffer} content
 * @returns {string}
 */
function sha256(content) {
  const buf = normalizeToBuffer(content);
  return `sha256:${crypto.createHash("sha256").update(buf).digest("hex")}`;
}

/**
 * Creates a fresh isolated workspace directory and returns its descriptor.
 *
 * @param {Object} [options]
 * @param {string} [options.baseDir]
 * @param {string} [options.source_snapshot_id]
 * @param {string} [options.sourceSnapshotId]
 * @param {string} [options.workspace_id]
 * @returns {Promise<Object>}
 */
async function createWorkspace(options = {}) {
  const sourceSnapshotId =
    options.source_snapshot_id ||
    options.sourceSnapshotId ||
    "sha256:0000000000000000000000000000000000000000000000000000000000000000";

  const uuid = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2));
  const workspaceId = options.workspace_id || `ws-${uuid}`;
  const baseDir = options.baseDir || path.join(os.tmpdir(), "ospec-workspaces");
  const rootPath = path.resolve(baseDir, workspaceId);

  fs.mkdirSync(rootPath, { recursive: true });

  const descriptor = {
    schema_version: 1,
    workspace_id: workspaceId,
    root_path: rootPath,
    source_snapshot_id: sourceSnapshotId,
    status: "active",
    created_at: new Date().toISOString(),
  };

  return descriptor;
}

/**
 * Idempotently cleans up an allocated workspace directory.
 *
 * @param {Object} workspaceDescriptor
 * @returns {Promise<{ ok: boolean, workspace_id: string, status: string }>}
 */
async function disposeWorkspace(workspaceDescriptor) {
  if (workspaceDescriptor && workspaceDescriptor.root_path) {
    try {
      if (fs.existsSync(workspaceDescriptor.root_path)) {
        fs.rmSync(workspaceDescriptor.root_path, { recursive: true, force: true });
      }
    } catch {
      // Cleanup best-effort
    }
    workspaceDescriptor.status = "disposed";
  }

  return {
    ok: true,
    workspace_id: workspaceDescriptor ? workspaceDescriptor.workspace_id : "",
    status: "disposed",
  };
}

/**
 * Materializes declared dependencies into the workspace and calculates deterministic fingerprint.
 *
 * @param {Object} workspaceDescriptor
 * @param {Object} workOrder
 * @param {Object} sourceSnapshot
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function materializeSourceSnapshot(workspaceDescriptor, workOrder, sourceSnapshot, options = {}) {
  const rootPath = workspaceDescriptor.root_path;
  const dependencies = Array.isArray(workOrder.dependencies) ? workOrder.dependencies : [];
  const allowedPaths = Array.isArray(workOrder.allowed_paths) ? workOrder.allowed_paths : ["**"];
  const environment = workOrder.environment || options.environment || {};

  const snapshotFiles = sourceSnapshot && (sourceSnapshot.files || sourceSnapshot);
  const materializedList = [];

  for (const depPath of dependencies) {
    const normalizedDep = normalizeRelativePath(depPath);
    if (!normalizedDep) {
      throw new Error(`Invalid dependency path or traversal attempt: ${depPath}`);
    }

    let content = null;
    if (snapshotFiles && typeof snapshotFiles === "object") {
      if (typeof snapshotFiles[depPath] === "string" || Buffer.isBuffer(snapshotFiles[depPath])) {
        content = snapshotFiles[depPath];
      } else if (typeof snapshotFiles[normalizedDep] === "string" || Buffer.isBuffer(snapshotFiles[normalizedDep])) {
        content = snapshotFiles[normalizedDep];
      } else if (Array.isArray(snapshotFiles)) {
        const found = snapshotFiles.find((f) => f && (f.path === depPath || f.path === normalizedDep));
        if (found) content = found.content;
      }
    }

    if (content !== null) {
      const destPath = path.join(rootPath, normalizedDep);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, content);
      materializedList.push({
        path: normalizedDep,
        digest: sha256(content),
      });
    }
  }

  materializedList.sort((a, b) => a.path.localeCompare(b.path));
  const sortedDeps = [...dependencies].map((d) => d.replace(/\\/g, "/")).sort();

  const fingerprintPayload = JSON.stringify({
    dependencies: sortedDeps,
    files: materializedList,
    source_snapshot_id: sourceSnapshot.source_snapshot_id || workspaceDescriptor.source_snapshot_id,
  });

  const fingerprint = sha256(fingerprintPayload);
  const uuid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10);
  const capsuleId = `capsule-${uuid}`;

  const capsule = {
    schema_version: 1,
    capsule_id: capsuleId,
    fingerprint,
    source_snapshot_id: sourceSnapshot.source_snapshot_id || workspaceDescriptor.source_snapshot_id,
    dependencies,
    allowed_paths: allowedPaths,
    environment,
  };

  return capsule;
}

/**
 * Computes sorted filesystem inventory with digests and modes for a workspace.
 *
 * @param {Object} workspaceDescriptor
 * @returns {Promise<Array<{ path: string, sha256: string, mode: number }>>}
 */
async function inspectWorkspace(workspaceDescriptor) {
  const rootPath = workspaceDescriptor.root_path;
  const inventory = [];

  function scanDir(currentDir, relPrefix) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        scanDir(fullPath, relPath);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        try {
          const stat = fs.statSync(fullPath);
          const content = fs.readFileSync(fullPath);
          inventory.push({
            path: relPath.replace(/\\/g, "/"),
            sha256: sha256(content),
            mode: stat.mode,
          });
        } catch {
          // ignore unreadable/transient file
        }
      }
    }
  }

  scanDir(rootPath, "");
  inventory.sort((a, b) => a.path.localeCompare(b.path));
  return inventory;
}

module.exports = {
  createWorkspace,
  disposeWorkspace,
  materializeSourceSnapshot,
  inspectWorkspace,
  sha256,
};
