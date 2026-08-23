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
 * Private in-memory workspace registry tracking active workspaces.
 * Map<workspace_id, { descriptor: Object, rootPath: string, baselineInventory: Array, createdAt: number }>
 */
const workspaceRegistry = new Map();

/**
 * Returns internal workspace record for a workspace ID if tracked.
 *
 * @param {string} workspaceId
 * @returns {Object|null}
 */
function getWorkspaceRecord(workspaceId) {
  if (!workspaceId || typeof workspaceId !== "string") return null;
  return workspaceRegistry.get(workspaceId) || null;
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

  const initialInventory = await inspectWorkspace({ root_path: rootPath });

  workspaceRegistry.set(workspaceId, {
    descriptor,
    rootPath,
    baselineInventory: initialInventory,
    createdAt: Date.now(),
  });

  return descriptor;
}

/**
 * Idempotently cleans up an allocated workspace directory resolved strictly from the private registry.
 *
 * @param {Object|string} workspaceDescriptorOrId
 * @returns {Promise<{ ok: boolean, workspace_id: string, status: string }>}
 */
async function disposeWorkspace(workspaceDescriptorOrId) {
  const workspaceId =
    typeof workspaceDescriptorOrId === "string"
      ? workspaceDescriptorOrId
      : (workspaceDescriptorOrId && workspaceDescriptorOrId.workspace_id);

  if (workspaceId && workspaceRegistry.has(workspaceId)) {
    const record = workspaceRegistry.get(workspaceId);
    try {
      if (fs.existsSync(record.rootPath)) {
        fs.rmSync(record.rootPath, { recursive: true, force: true });
      }
    } catch {
      // Cleanup best-effort
    }
    record.descriptor.status = "disposed";
    workspaceRegistry.delete(workspaceId);
  }

  if (workspaceDescriptorOrId && typeof workspaceDescriptorOrId === "object") {
    workspaceDescriptorOrId.status = "disposed";
  }

  return {
    ok: true,
    workspace_id: workspaceId || "",
    status: "disposed",
  };
}

/**
 * Materializes declared inputs into the workspace and calculates deterministic fingerprint.
 *
 * @param {Object} workspaceDescriptor
 * @param {Object} workOrder
 * @param {Object} sourceSnapshot
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function materializeSourceSnapshot(workspaceDescriptor, workOrder, sourceSnapshot, options = {}) {
  const workspaceId = workspaceDescriptor ? workspaceDescriptor.workspace_id : "";
  const record = workspaceRegistry.get(workspaceId);
  const rootPath = (record && record.rootPath) || (workspaceDescriptor && workspaceDescriptor.root_path);

  if (!rootPath) {
    throw new Error("Cannot materialize into workspace: missing workspace root path");
  }

  const dependencies = Array.isArray(workOrder.dependencies) ? workOrder.dependencies : [];
  const allowedPaths = Array.isArray(workOrder.allowed_paths) ? workOrder.allowed_paths : ["**"];
  const environment = workOrder.environment || options.environment || {};

  // Resolve capsule inputs
  let declaredInputs = [];
  if (Array.isArray(options.capsule_inputs)) {
    declaredInputs = options.capsule_inputs;
  } else if (Array.isArray(workOrder.capsule_inputs)) {
    declaredInputs = workOrder.capsule_inputs;
  } else if (Array.isArray(options.inputs)) {
    declaredInputs = options.inputs;
  } else if (dependencies.length > 0 && !dependencies.some((d) => typeof d === "string" && d.startsWith("sha256:"))) {
    // Legacy support where dependencies were file paths
    declaredInputs = dependencies;
  }

  const filesSource = options.files || (sourceSnapshot && sourceSnapshot.files);
  const resolveFileFn = typeof options.resolveFile === "function" ? options.resolveFile : null;
  const repositoryDir = options.repositoryDir || options.repositoryPath;

  const materializedList = [];

  for (const inputPath of declaredInputs) {
    const normalizedInput = normalizeRelativePath(inputPath);
    if (!normalizedInput) {
      throw new Error(`Invalid capsule input path or traversal attempt: ${inputPath}`);
    }

    let content = null;

    if (resolveFileFn) {
      content = resolveFileFn(normalizedInput);
    } else if (filesSource && typeof filesSource === "object") {
      if (typeof filesSource[inputPath] === "string" || Buffer.isBuffer(filesSource[inputPath])) {
        content = filesSource[inputPath];
      } else if (typeof filesSource[normalizedInput] === "string" || Buffer.isBuffer(filesSource[normalizedInput])) {
        content = filesSource[normalizedInput];
      } else if (Array.isArray(filesSource)) {
        const found = filesSource.find((f) => f && (f.path === inputPath || f.path === normalizedInput));
        if (found) content = found.content;
      }
    } else if (repositoryDir && typeof repositoryDir === "string") {
      const srcFile = path.resolve(repositoryDir, normalizedInput);
      if (fs.existsSync(srcFile)) {
        content = fs.readFileSync(srcFile);
      }
    }

    if (content === null || content === undefined) {
      throw new Error(`Missing required capsule input file: ${inputPath}`);
    }

    const destPath = path.join(rootPath, normalizedInput);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, content);
    materializedList.push({
      path: normalizedInput,
      digest: sha256(content),
    });
  }

  materializedList.sort((a, b) => a.path.localeCompare(b.path));
  const sortedInputs = [...new Set(materializedList.map((f) => f.path))].sort();
  const sortedDeps = [...dependencies].map((d) => String(d).replace(/\\/g, "/")).sort();

  const fingerprintPayload = JSON.stringify({
    capsule_inputs: sortedInputs,
    dependencies: sortedDeps,
    files: materializedList,
    source_snapshot_id: (sourceSnapshot && sourceSnapshot.source_snapshot_id) || (workspaceDescriptor && workspaceDescriptor.source_snapshot_id),
  });

  const fingerprint = sha256(fingerprintPayload);
  const uuid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10);
  const capsuleId = `capsule-${uuid}`;

  // Update baseline inventory after materialization
  const currentInventory = await inspectWorkspace({ root_path: rootPath });
  if (record) {
    record.baselineInventory = currentInventory;
  }

  const capsule = {
    schema_version: 1,
    capsule_id: capsuleId,
    fingerprint,
    source_snapshot_id: (sourceSnapshot && sourceSnapshot.source_snapshot_id) || (workspaceDescriptor && workspaceDescriptor.source_snapshot_id),
    dependencies,
    capsule_inputs: sortedInputs,
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
  const rootPath = workspaceDescriptor ? workspaceDescriptor.root_path : null;
  if (!rootPath || !fs.existsSync(rootPath)) return [];
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
  getWorkspaceRecord,
  sha256,
};
