"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Normalizes relative path to forward slashes without leading './'.
 * Returns null if path contains traversal sequences ('..') or null bytes.
 *
 * @param {string} p
 * @returns {string|null}
 */
function normalizeRelativePath(p) {
  if (typeof p !== "string" || !p.trim() || p.includes("\0")) {
    return null;
  }
  const posix = p.replace(/\\/g, "/");
  if (posix.startsWith("/") || /^[a-zA-Z]:/.test(posix)) {
    return null;
  }
  const parts = posix.split("/");
  const normalizedParts = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      return null; // Traversal detected
    }
    normalizedParts.push(part);
  }
  if (normalizedParts.length === 0) return null;
  return normalizedParts.join("/");
}

/**
 * Inspects all existing ancestor directories of targetPath to ensure no symlinks escape workspaceRoot.
 *
 * @param {string} targetPath
 * @param {string} workspaceRoot
 * @returns {{ isEscape: boolean, offendingPath?: string }}
 */
function checkSymlinkEscape(targetPath, workspaceRoot) {
  if (!workspaceRoot || typeof workspaceRoot !== "string") {
    return { isEscape: false };
  }
  try {
    const absRoot = path.resolve(workspaceRoot);
    const realRoot = fs.realpathSync(absRoot);
    const normalized = normalizeRelativePath(targetPath);
    if (!normalized) return { isEscape: false };

    const segments = normalized.split("/");
    let currentRelative = "";
    for (const segment of segments) {
      currentRelative = currentRelative ? `${currentRelative}/${segment}` : segment;
      const currentAbs = path.resolve(absRoot, currentRelative);
      if (fs.existsSync(currentAbs)) {
        try {
          const lstat = fs.lstatSync(currentAbs);
          if (lstat.isSymbolicLink()) {
            const realPath = fs.realpathSync(currentAbs);
            if (!realPath.startsWith(realRoot + path.sep) && realPath !== realRoot) {
              return { isEscape: true, offendingPath: currentRelative };
            }
          }
        } catch {
          // ignore stat errors on intermediate checks
        }
      }
    }
  } catch {
    // If root does not exist or realpath fails
  }
  return { isEscape: false };
}

/**
 * Checks if a target path is contained within declared allowed paths.
 *
 * @param {string} targetPath
 * @param {string[]} allowedPaths
 * @param {string} [workspaceRoot]
 * @returns {boolean}
 */
function isPathContained(targetPath, allowedPaths, workspaceRoot) {
  if (!Array.isArray(allowedPaths) || allowedPaths.length === 0) {
    return false;
  }
  const normalizedTarget = normalizeRelativePath(targetPath);
  if (!normalizedTarget) {
    return false;
  }

  // If workspaceRoot is provided, verify symlinks do not escape root
  if (workspaceRoot && typeof workspaceRoot === "string") {
    const escapeCheck = checkSymlinkEscape(targetPath, workspaceRoot);
    if (escapeCheck.isEscape) {
      return false;
    }
  }

  for (const allowed of allowedPaths) {
    if (typeof allowed !== "string" || !allowed) continue;
    if (allowed.includes("..")) continue;

    const normAllowed = allowed.replace(/\\/g, "/").replace(/^\.\//, "");

    if (normAllowed === "**" || normAllowed === "*") {
      return true;
    }
    if (normAllowed.endsWith("/**")) {
      const prefix = normAllowed.slice(0, -3);
      if (normalizedTarget === prefix || normalizedTarget.startsWith(prefix + "/")) {
        return true;
      }
    } else if (normAllowed.endsWith("/*")) {
      const prefix = normAllowed.slice(0, -2);
      if (normalizedTarget.startsWith(prefix + "/")) {
        const rest = normalizedTarget.slice(prefix.length + 1);
        if (!rest.includes("/")) {
          return true;
        }
      }
    } else if (normAllowed.endsWith("/")) {
      const prefix = normAllowed.slice(0, -1);
      if (normalizedTarget === prefix || normalizedTarget.startsWith(prefix + "/")) {
        return true;
      }
    } else if (normAllowed === normalizedTarget) {
      return true;
    }
  }

  return false;
}

/**
 * Validates target paths or mutation deltas against allowed paths, emitting a structured containment violation on boundary failures.
 *
 * @param {string[]|{ created?: string[], modified?: string[], deleted?: string[], allMutations?: string[] }} targetPaths
 * @param {string[]} allowedPaths
 * @param {Object} [options]
 * @param {string} [options.workspaceRoot]
 * @param {string} [options.workspace_id]
 * @param {string} [options.work_order_id]
 * @returns {{ ok: boolean, violation?: Object }}
 */
function validateAllowedPaths(targetPaths, allowedPaths, options = {}) {
  const workspaceId = options.workspace_id || options.workspaceId || "ws-default";
  const workOrderId = options.work_order_id || options.workOrderId || "sha256:0000000000000000000000000000000000000000000000000000000000000000";
  const workspaceRoot = options.workspaceRoot || options.workspace_root;

  function makeViolation(attemptedPath, violationType) {
    return {
      schema_version: 1,
      violation_id: `viol-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10)}`,
      workspace_id: String(workspaceId),
      work_order_id: String(workOrderId),
      attempted_path: String(attemptedPath || ""),
      allowed_paths: Array.isArray(allowedPaths) ? allowedPaths : [],
      violation_type: violationType,
      timestamp: new Date().toISOString(),
    };
  }

  let pathList = [];
  if (Array.isArray(targetPaths)) {
    pathList = targetPaths;
  } else if (targetPaths && typeof targetPaths === "object") {
    const set = new Set();
    if (Array.isArray(targetPaths.created)) targetPaths.created.forEach(p => set.add(p));
    if (Array.isArray(targetPaths.modified)) targetPaths.modified.forEach(p => set.add(p));
    if (Array.isArray(targetPaths.deleted)) targetPaths.deleted.forEach(p => set.add(p));
    if (Array.isArray(targetPaths.allMutations)) targetPaths.allMutations.forEach(p => set.add(p));
    pathList = Array.from(set);
  } else {
    return { ok: false, violation: makeViolation("", "undeclared_write") };
  }

  for (const target of pathList) {
    if (typeof target !== "string" || !target.trim()) {
      return { ok: false, violation: makeViolation(String(target), "traversal") };
    }

    const posix = target.replace(/\\/g, "/");
    if (posix.includes("..") || posix.includes("\0") || posix.startsWith("/")) {
      return { ok: false, violation: makeViolation(target, "traversal") };
    }

    // Check for symlink escapes across intermediate non-instantiated hierarchies
    if (workspaceRoot && typeof workspaceRoot === "string") {
      const escapeCheck = checkSymlinkEscape(target, workspaceRoot);
      if (escapeCheck.isEscape) {
        return { ok: false, violation: makeViolation(target, "symlink_escape") };
      }
    }

    if (!isPathContained(target, allowedPaths, workspaceRoot)) {
      return { ok: false, violation: makeViolation(target, "undeclared_write") };
    }
  }

  return { ok: true };
}

module.exports = {
  checkSymlinkEscape,
  isPathContained,
  validateAllowedPaths,
  normalizeRelativePath,
};
