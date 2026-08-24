"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { normalizeRelativePath } = require("./allowed-paths-validator.js");
const { sha256Fingerprint } = require("./canonical-json.js");

/**
 * Normalizes content to Buffer preserving exact byte representation.
 *
 * @param {string|Buffer} content
 * @returns {Buffer}
 */
function normalizeToBuffer(content) {
  if (Buffer.isBuffer(content)) {
    return content;
  }
  return Buffer.from(String(content !== undefined && content !== null ? content : ""), "utf8");
}

/**
 * Computes SHA-256 digest with sha256: prefix over exact bytes.
 *
 * @param {string|Buffer} content
 * @returns {string}
 */
function sha256(content) {
  const buf = normalizeToBuffer(content);
  return `sha256:${crypto.createHash("sha256").update(buf).digest("hex")}`;
}

/**
 * Computes a deterministic SHA-256 Merkle tree digest over a collection of files.
 * Always recomputes digests from actual file bytes and rejects mismatching declared digests.
 *
 * @param {Record<string, string|Buffer>|Map<string, string|Buffer>|Array<{ path: string, content?: string|Buffer, sha256?: string }>} files
 * @returns {string} sha256:...
 */
function computeTreeDigest(files) {
  const entries = [];
  if (files instanceof Map) {
    for (const [filePath, content] of files.entries()) {
      const normalizedPath = normalizeRelativePath(filePath);
      if (normalizedPath) {
        const digest = sha256(content);
        entries.push({ path: normalizedPath, sha256: digest });
      }
    }
  } else if (Array.isArray(files)) {
    for (const item of files) {
      if (!item || !item.path) continue;
      const normalizedPath = normalizeRelativePath(item.path);
      if (normalizedPath) {
        if (item.content === undefined || item.content === null) {
          throw new Error(
            `computeTreeDigest requires content for each file to ensure byte-level zero-trust verification: ${item.path}`
          );
        }
        const digest = sha256(item.content);
        if (item.sha256 && item.sha256 !== digest) {
          throw new Error(
            `Declared sha256 mismatch for ${item.path}: declared ${item.sha256}, calculated from bytes ${digest}`
          );
        }
        entries.push({ path: normalizedPath, sha256: digest });
      }
    }
  } else if (files && typeof files === "object") {
    for (const [filePath, content] of Object.entries(files)) {
      const normalizedPath = normalizeRelativePath(filePath);
      if (normalizedPath) {
        entries.push({ path: normalizedPath, sha256: sha256(content) });
      }
    }
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return sha256Fingerprint("source-tree/v1", entries);
}

/**
 * Private in-memory workspace registry tracking active workspaces.
 * Map<workspace_id, { descriptor: Object, rootPath: string, baselineInventory: Array, baselineContents: Map<string, string>, createdAt: number }>
 */
const workspaceRegistry = new Map();

/**
 * Updates status of a tracked workspace in the private registry.
 *
 * @param {string} workspaceId
 * @param {string} status
 * @returns {boolean} true if workspace was found and updated
 */
function updateWorkspaceStatus(workspaceId, status) {
  if (!workspaceId || typeof workspaceId !== "string") return false;
  const record = workspaceRegistry.get(workspaceId);
  if (!record || !record.descriptor) return false;
  record.descriptor.status = status;
  return true;
}

/**
 * Returns internal workspace record for a workspace ID if tracked.
 * Returns a defensive copy to prevent external mutation of internal registry.
 *
 * @param {string} workspaceId
 * @returns {Object|null}
 */
function getWorkspaceRecord(workspaceId) {
  if (!workspaceId || typeof workspaceId !== "string") return null;
  const record = workspaceRegistry.get(workspaceId);
  if (!record) return null;
  return {
    descriptor: { ...record.descriptor },
    rootPath: record.rootPath,
    baselineInventory: record.baselineInventory ? record.baselineInventory.map((item) => ({ ...item })) : [],
    baselineContents: record.baselineContents ? new Map(record.baselineContents) : new Map(),
    createdAt: record.createdAt,
  };
}

/**
 * Creates a fresh isolated workspace directory and returns its descriptor.
 * Always generates an internal UUID, ignoring any caller-supplied workspace_id.
 *
 * @param {Object} [options]
 * @param {string} [options.baseDir]
 * @param {string} [options.source_snapshot_id]
 * @param {string} [options.sourceSnapshotId]
 * @returns {Promise<Object>}
 */
async function createWorkspace(options = {}) {
  const sourceSnapshotId =
    options.source_snapshot_id ||
    options.sourceSnapshotId ||
    "sha256:0000000000000000000000000000000000000000000000000000000000000000";

  const uuid = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2));
  const workspaceId = `ws-${uuid}`;
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

  workspaceRegistry.set(workspaceId, {
    descriptor,
    rootPath,
    baselineInventory: [],
    baselineContents: new Map(),
    createdAt: Date.now(),
  });

  const initialInventory = await inspectWorkspace(workspaceId);
  const registeredRecord = workspaceRegistry.get(workspaceId);
  if (registeredRecord) {
    registeredRecord.baselineInventory = initialInventory;
  }

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
 * FAILS CLOSED (throws) if workspaceDescriptor.workspace_id is not found in private registry.
 * Preserves baseline file contents in workspace record for subsequent diff generation.
 * Cryptographically verifies candidate file bytes against sourceSnapshot.base_tree_digest pre-materialization.
 * Enforces 3-way binding: Workspace == WorkOrder == SourceSnapshot.
 *
 * @param {Object} workspaceDescriptor
 * @param {Object} workOrder
 * @param {Object} sourceSnapshot
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function materializeSourceSnapshot(workspaceDescriptor, workOrder, sourceSnapshot, options = {}) {
  if (!workOrder || typeof workOrder !== "object") {
    throw new Error("workOrder must be a valid object");
  }
  if (!sourceSnapshot || typeof sourceSnapshot !== "object") {
    throw new Error("sourceSnapshot must be a valid object");
  }
  const workspaceId = workspaceDescriptor ? workspaceDescriptor.workspace_id : "";
  const record = workspaceRegistry.get(workspaceId);

  if (!record || !record.rootPath) {
    throw new Error(`Cannot materialize into unrecorded workspace: ${workspaceId || "missing"}`);
  }

  // 3-Way binding validation
  const workspaceSnapshotId = record.descriptor && record.descriptor.source_snapshot_id;
  if (workspaceSnapshotId && workspaceSnapshotId !== sourceSnapshot.source_snapshot_id) {
    throw new Error(
      `Workspace source_snapshot_id binding mismatch: workspace registered for ${workspaceSnapshotId}, snapshot is ${sourceSnapshot.source_snapshot_id}`
    );
  }

  const { validateWorkOrderBinding } = require("./execution-identities/index.js");
  const bindingRes = validateWorkOrderBinding(sourceSnapshot, workOrder);
  if (!bindingRes.ok) {
    throw new Error(`WorkOrder binding validation failed: ${bindingRes.reason_code || bindingRes.error || "mismatch"}`);
  }

  const rootPath = record.rootPath;
  const dependencies = Array.isArray(workOrder.dependencies) ? workOrder.dependencies : [];
  const allowedPaths = Array.isArray(workOrder.allowed_paths) ? workOrder.allowed_paths : ["**"];
  const environment = workOrder.environment || options.environment || {};

  // Resolve capsule inputs strictly from declared capsule_inputs or inputs options
  let declaredInputs = [];
  if (Array.isArray(options.capsule_inputs)) {
    declaredInputs = options.capsule_inputs;
  } else if (Array.isArray(workOrder.capsule_inputs)) {
    declaredInputs = workOrder.capsule_inputs;
  } else if (Array.isArray(options.inputs)) {
    declaredInputs = options.inputs;
  } else if (options.files && typeof options.files === "object" && !Array.isArray(options.files)) {
    declaredInputs = Object.keys(options.files);
  } else if (Array.isArray(options.files)) {
    declaredInputs = options.files.map((f) => f && f.path).filter(Boolean);
  }

  const filesSource = options.files;
  const resolveFileFn = typeof options.resolveFile === "function" ? options.resolveFile : null;
  const repositoryDir = options.repositoryDir || options.repositoryPath;

  // Gather candidate files in memory BEFORE writing anything to disk
  const candidateFiles = new Map();
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

    candidateFiles.set(normalizedInput, content);
  }

  // Cryptographic verification pre-materialization against base_tree_digest
  if (sourceSnapshot && sourceSnapshot.base_tree_digest) {
    let treeSource = candidateFiles;
    if (filesSource && typeof filesSource === "object") {
      if (Array.isArray(filesSource)) {
        const hydratedArray = filesSource.map((f) => {
          if (!f || !f.path) return f;
          const norm = normalizeRelativePath(f.path);
          if (f.content !== undefined && f.content !== null) return f;
          if (candidateFiles.has(norm)) {
            return { ...f, content: candidateFiles.get(norm) };
          }
          if (resolveFileFn) {
            const content = resolveFileFn(norm);
            if (content !== undefined && content !== null) return { ...f, content };
          }
          return f;
        });
        treeSource = hydratedArray;
      } else {
        treeSource = filesSource;
      }
    }
    const calculatedTreeDigest = computeTreeDigest(treeSource);
    if (calculatedTreeDigest !== sourceSnapshot.base_tree_digest) {
      throw new Error(
        `Cryptographic verification failed: base_tree_digest mismatch (expected ${sourceSnapshot.base_tree_digest}, calculated ${calculatedTreeDigest})`
      );
    }
  }

  // If filesSource declares per-file sha256 digests, verify them against actual candidate bytes
  if (Array.isArray(filesSource)) {
    for (const f of filesSource) {
      if (f && f.path && f.sha256) {
        const norm = normalizeRelativePath(f.path);
        const actualContent = candidateFiles.get(norm);
        if (actualContent !== undefined) {
          const actualSha = sha256(actualContent);
          if (actualSha !== f.sha256) {
            throw new Error(
              `Declared sha256 mismatch for ${f.path}: declared ${f.sha256}, calculated from candidate bytes ${actualSha}`
            );
          }
        }
      }
    }
  }

  // Cryptographic verification pre-materialization against source_snapshot_id
  if (
    sourceSnapshot &&
    sourceSnapshot.source_snapshot_id &&
    sourceSnapshot.repository_id &&
    sourceSnapshot.base_tree_digest
  ) {
    const { computeSourceSnapshotId } = require("./execution-identities/index.js");
    const recomputedSnapshotId = computeSourceSnapshotId(sourceSnapshot);
    if (sourceSnapshot.source_snapshot_id !== recomputedSnapshotId) {
      throw new Error(
        `Cryptographic verification failed: source_snapshot_id mismatch (declared ${sourceSnapshot.source_snapshot_id}, recomputed ${recomputedSnapshotId})`
      );
    }
  }

  if (!record.baselineContents) {
    record.baselineContents = new Map();
  }

  const materializedList = [];
  for (const [normalizedInput, content] of candidateFiles.entries()) {
    const destPath = path.join(rootPath, normalizedInput);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, content);

    const textContent = typeof content === "string" ? content : content.toString("utf8");
    record.baselineContents.set(normalizedInput, textContent);

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
  const currentInventory = await inspectWorkspace(workspaceId);
  record.baselineInventory = currentInventory;

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
 * Computes sorted filesystem inventory with digests and modes for a workspace resolved strictly from the registry.
 *
 * @param {Object|string} workspaceDescriptorOrId
 * @returns {Promise<Array<{ path: string, sha256: string, mode: number }>>}
 */
async function inspectWorkspace(workspaceDescriptorOrId) {
  const workspaceId =
    typeof workspaceDescriptorOrId === "string"
      ? workspaceDescriptorOrId
      : (workspaceDescriptorOrId && workspaceDescriptorOrId.workspace_id);

  let rootPath = null;
  if (workspaceId && workspaceRegistry.has(workspaceId)) {
    rootPath = workspaceRegistry.get(workspaceId).rootPath;
  } else if (workspaceDescriptorOrId && typeof workspaceDescriptorOrId === "object" && workspaceDescriptorOrId.root_path) {
    // If not tracked in private registry, fail closed by returning empty inventory
    return [];
  }

  if (!rootPath || !fs.existsSync(rootPath)) return [];
  const inventory = [];
  const { checkSymlinkEscape } = require("./allowed-paths-validator.js");

  function scanDir(currentDir, relPrefix) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const normalizedRelPath = relPath.replace(/\\/g, "/");

      let lstat;
      try {
        lstat = fs.lstatSync(fullPath);
      } catch (err) {
        throw new Error(`Failed to lstat file during workspace inspection: ${relPath} (${err.message})`);
      }

      if (lstat.isSymbolicLink()) {
        const escapeCheck = checkSymlinkEscape(normalizedRelPath, rootPath);
        if (escapeCheck.isEscape) {
          throw new Error(`Symlink escape detected during workspace inspection: ${relPath}`);
        }
        let stat;
        let content;
        try {
          stat = fs.statSync(fullPath);
          content = fs.readFileSync(fullPath);
        } catch (err) {
          throw new Error(`Unreadable or dangling symlink in workspace: ${relPath} (${err.message})`);
        }
        inventory.push({
          path: normalizedRelPath,
          sha256: sha256(content),
          mode: stat.mode,
        });
      } else if (lstat.isDirectory()) {
        scanDir(fullPath, relPath);
      } else if (lstat.isFile()) {
        let stat;
        let content;
        try {
          stat = fs.statSync(fullPath);
          content = fs.readFileSync(fullPath);
        } catch (err) {
          throw new Error(`Unreadable file in workspace: ${relPath} (${err.message})`);
        }
        inventory.push({
          path: normalizedRelPath,
          sha256: sha256(content),
          mode: stat.mode,
        });
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
  updateWorkspaceStatus,
  computeTreeDigest,
  sha256,
};
