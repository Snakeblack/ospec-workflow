"use strict";

const { normalizeRelativePath, validateAllowedPaths } = require("../allowed-paths-validator.js");
const { computeTreeDigest } = require("../worker-workspace.js");
const { freezeCandidate } = require("../execution-identities/index.js");
const { collectFilesMap, buildEffectiveShadowBase } = require("./effective-shadow-base.js");

const VALID_GIT_FILE_MODES = new Set(["100644", "100755", "100664", "120000", "160000"]);

function analyzeLines(content) {
  if (content === null || content === undefined || content === "") {
    return { lines: [], hasTrailingNewline: true };
  }
  const normalized = String(content).replace(/\r\n/g, "\n");
  const hasTrailingNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  if (hasTrailingNewline && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return { lines, hasTrailingNewline };
}

function stripGitPath(headerPath) {
  if (!headerPath || headerPath === "/dev/null") return "/dev/null";
  return headerPath.replace(/^[ab]\//, "");
}

function parseModeToken(raw) {
  const value = String(raw || "").trim();
  if (!VALID_GIT_FILE_MODES.has(value)) {
    return { ok: false, value };
  }
  return { ok: true, value };
}

function parseUnifiedDiffs(diffText) {
  if (diffText === undefined || diffText === null) {
    return { ok: true, files: [], modeOnly: false };
  }
  if (typeof diffText !== "string") {
    return {
      ok: false,
      files: [],
      reason_code: "MALFORMED_UNIFIED_DIFF",
      error: "unified diff must be a string",
    };
  }
  if (!diffText.trim()) {
    return { ok: true, files: [], modeOnly: false };
  }

  const normalized = diffText.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const fileDiffs = [];
  let currentFile = null;
  let currentHunk = null;
  let malformed = false;
  let malformedError = "Malformed unified diff";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const gitMatch = line.match(/^diff --git a\/(.*?) b\/(.*)$/);
    if (gitMatch) {
      currentFile = {
        oldPath: gitMatch[1],
        newPath: gitMatch[2],
        targetPath: gitMatch[2] !== "/dev/null" ? gitMatch[2] : gitMatch[1],
        hunks: [],
        fromGitHeader: true,
        hasContentHeaders: false,
      };
      fileDiffs.push(currentFile);
      currentHunk = null;
      continue;
    }

    const oldModeMatch = line.match(/^old mode\s+(\S+)\s*$/);
    if (oldModeMatch && currentFile) {
      const parsed = parseModeToken(oldModeMatch[1]);
      if (!parsed.ok) currentFile.invalidMode = parsed.value;
      else currentFile.oldMode = parsed.value;
      continue;
    }
    const newModeMatch = line.match(/^new mode\s+(\S+)\s*$/);
    if (newModeMatch && currentFile) {
      const parsed = parseModeToken(newModeMatch[1]);
      if (!parsed.ok) currentFile.invalidMode = parsed.value;
      else currentFile.newMode = parsed.value;
      continue;
    }
    const newFileModeMatch = line.match(/^new file mode\s+(\S+)\s*$/);
    if (newFileModeMatch && currentFile) {
      const parsed = parseModeToken(newFileModeMatch[1]);
      if (!parsed.ok) currentFile.invalidMode = parsed.value;
      else currentFile.newFileMode = parsed.value;
      continue;
    }
    const deletedFileModeMatch = line.match(/^deleted file mode\s+(\S+)\s*$/);
    if (deletedFileModeMatch && currentFile) {
      const parsed = parseModeToken(deletedFileModeMatch[1]);
      if (!parsed.ok) currentFile.invalidMode = parsed.value;
      else currentFile.deletedFileMode = parsed.value;
      continue;
    }

    if (line.startsWith("--- ")) {
      const oldHeader = line.slice(4).trim();
      const nextLine = lines[i + 1] || "";
      if (nextLine.startsWith("+++ ")) {
        i++;
        const newHeader = nextLine.slice(4).trim();
        const oldPath = stripGitPath(oldHeader);
        const newPath = stripGitPath(newHeader);
        const canAttach = currentFile && currentFile.fromGitHeader && !currentFile.hasContentHeaders;
        if (canAttach) {
          currentFile.oldPath = oldPath;
          currentFile.newPath = newPath;
          currentFile.targetPath = newPath !== "/dev/null" ? newPath : oldPath;
        } else {
          currentFile = {
            oldPath,
            newPath,
            targetPath: newPath !== "/dev/null" ? newPath : oldPath,
            hunks: [],
            fromGitHeader: false,
            hasContentHeaders: true,
          };
          fileDiffs.push(currentFile);
        }
        currentFile.hasContentHeaders = true;
        currentHunk = null;
        continue;
      }
    }

    if (line.startsWith("@@")) {
      if (!currentFile) {
        malformed = true;
        malformedError = "Hunk header without a file section";
        continue;
      }
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!match) {
        malformed = true;
        malformedError = `Truncated or unparseable hunk header: ${line}`;
        currentHunk = null;
        continue;
      }
      currentHunk = {
        oldStart: parseInt(match[1], 10),
        oldCount: match[2] !== undefined ? parseInt(match[2], 10) : 1,
        newStart: parseInt(match[3], 10),
        newCount: match[4] !== undefined ? parseInt(match[4], 10) : 1,
        lines: [],
      };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    if (currentHunk) {
      if (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ") || line.startsWith("\\ No newline")) {
        currentHunk.lines.push(line);
      }
    }
  }

  function isCreate(fileDiff) {
    return fileDiff.oldPath === "/dev/null" || Boolean(fileDiff.newFileMode);
  }
  function isDelete(fileDiff) {
    return fileDiff.newPath === "/dev/null" || Boolean(fileDiff.deletedFileMode);
  }
  function isModeOnly(fileDiff) {
    return Boolean(fileDiff.oldMode && fileDiff.newMode)
      && !isCreate(fileDiff)
      && !isDelete(fileDiff)
      && fileDiff.hunks.length === 0
      && fileDiff.targetPath
      && fileDiff.targetPath !== "/dev/null";
  }

  const hasValidHunk = fileDiffs.some((fd) => fd.hunks.length > 0);
  const allModeOnly = fileDiffs.length > 0 && fileDiffs.every(isModeOnly);
  for (const fd of fileDiffs) {
    if ((isCreate(fd) || isDelete(fd)) && fd.hunks.length === 0) {
      malformed = true;
      malformedError = isCreate(fd)
        ? "Header-only create is not a valid unified diff"
        : "Header-only delete is not a valid unified diff";
    }
  }

  if (malformed || (!allModeOnly && (!fileDiffs.length || !hasValidHunk))) {
    return {
      ok: false,
      files: fileDiffs,
      reason_code: "MALFORMED_UNIFIED_DIFF",
      error: malformedError,
    };
  }

  return { ok: true, files: fileDiffs, modeOnly: allModeOnly };
}

function countHunkSides(hunk) {
  let oldLines = 0;
  let newLines = 0;
  for (const hLine of hunk.lines) {
    if (hLine.startsWith("\\")) continue;
    if (hLine.startsWith(" ")) {
      oldLines++;
      newLines++;
    } else if (hLine.startsWith("-")) {
      oldLines++;
    } else if (hLine.startsWith("+")) {
      newLines++;
    }
  }
  return { oldLines, newLines };
}

function hunkOldRange(hunk) {
  if (hunk.oldCount === 0) {
    return { start: hunk.oldStart, end: hunk.oldStart };
  }
  const start = hunk.oldStart > 0 ? hunk.oldStart : 1;
  return { start, end: start + hunk.oldCount };
}

function rangesOverlap(a, b) {
  if (a.end === a.start && b.end === b.start) {
    return a.start === b.start;
  }
  if (a.end === a.start) {
    return a.start >= b.start && a.start < b.end;
  }
  if (b.end === b.start) {
    return b.start >= a.start && b.start < a.end;
  }
  return a.start < b.end && b.start < a.end;
}

function validateHunkCountsAndOverlaps(fileDiff) {
  const ranges = [];
  for (const hunk of fileDiff.hunks) {
    const counted = countHunkSides(hunk);
    if (counted.oldLines !== hunk.oldCount || counted.newLines !== hunk.newCount) {
      return {
        ok: false,
        reason_code: "HUNK_COUNT_MISMATCH",
        error: `Hunk count mismatch on ${fileDiff.targetPath}: expected -${hunk.oldCount}/+${hunk.newCount}, got -${counted.oldLines}/+${counted.newLines}`,
      };
    }
    ranges.push(hunkOldRange(hunk));
  }
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      if (rangesOverlap(ranges[i], ranges[j])) {
        return {
          ok: false,
          reason_code: "HUNK_OVERLAP",
          error: `Overlapping hunks on ${fileDiff.targetPath}`,
        };
      }
    }
  }
  return { ok: true };
}

function validateContextAndDeletion(oldContent, fileDiff) {
  if (fileDiff.oldPath === "/dev/null") {
    return { ok: true };
  }
  const { lines: oldLines } = analyzeLines(oldContent);
  for (const hunk of fileDiff.hunks) {
    let oldIdx = hunk.oldStart > 0 ? hunk.oldStart - 1 : 0;
    for (const hLine of hunk.lines) {
      if (hLine.startsWith("\\")) continue;
      if (hLine.startsWith(" ") || hLine.startsWith("-")) {
        const expected = hLine.slice(1);
        if (oldIdx >= oldLines.length || oldLines[oldIdx] !== expected) {
          return {
            ok: false,
            reason_code: hLine.startsWith("-") ? "HUNK_DELETION_MISMATCH" : "HUNK_CONTEXT_MISMATCH",
            error: `Hunk ${hLine.startsWith("-") ? "deletion" : "context"} mismatch on ${fileDiff.targetPath} at line ${oldIdx + 1}`,
          };
        }
        oldIdx++;
      }
    }
  }
  return { ok: true };
}

function applyFileDiff(oldContent, fileDiff) {
  if (fileDiff.invalidMode) {
    return { ok: false, reason_code: "INVALID_FILE_MODE", error: `Invalid file mode: ${fileDiff.invalidMode}` };
  }

  if (fileDiff.newPath === "/dev/null") {
    return { ok: true, deleted: true, content: "" };
  }

  const { lines: oldLines, hasTrailingNewline: oldHasTrailingNewline } = analyzeLines(oldContent);
  let newLines = [];
  let newHasTrailingNewline = true;

  if (fileDiff.oldPath === "/dev/null") {
    for (const hunk of fileDiff.hunks) {
      for (const hLine of hunk.lines) {
        if (hLine.startsWith("+")) {
          newLines.push(hLine.slice(1));
        } else if (hLine.startsWith("\\ No newline")) {
          newHasTrailingNewline = false;
        }
      }
    }
    let res = newLines.join("\n");
    if (newHasTrailingNewline && newLines.length > 0) res += "\n";
    return { ok: true, deleted: false, content: res };
  }

  let oldIdx = 0;
  newHasTrailingNewline = oldHasTrailingNewline;

  for (const hunk of fileDiff.hunks) {
    const hunkOldStart = hunk.oldStart > 0 ? hunk.oldStart - 1 : 0;
    while (oldIdx < hunkOldStart && oldIdx < oldLines.length) {
      newLines.push(oldLines[oldIdx]);
      oldIdx++;
    }

    for (let h = 0; h < hunk.lines.length; h++) {
      const hLine = hunk.lines[h];
      if (hLine.startsWith(" ")) {
        if (oldIdx < oldLines.length) {
          newLines.push(oldLines[oldIdx]);
          oldIdx++;
        } else {
          newLines.push(hLine.slice(1));
        }
      } else if (hLine.startsWith("-")) {
        oldIdx++;
      } else if (hLine.startsWith("+")) {
        newLines.push(hLine.slice(1));
      } else if (hLine.startsWith("\\ No newline")) {
        const prev = hunk.lines[h - 1] || "";
        if (prev.startsWith("+")) {
          newHasTrailingNewline = false;
        } else if (prev.startsWith("-")) {
          newHasTrailingNewline = true;
        }
      }
    }
  }

  while (oldIdx < oldLines.length) {
    newLines.push(oldLines[oldIdx]);
    oldIdx++;
  }

  let finalContent = newLines.join("\n");
  if (newHasTrailingNewline && newLines.length > 0) {
    finalContent += "\n";
  }

  return { ok: true, deleted: false, content: finalContent };
}

function resolveWorkOrderBinding(workResult, options) {
  const workOrders = Array.isArray(options.workOrders) ? options.workOrders : null;
  if (workOrders && workOrders.length > 0) {
    const id = workResult && workResult.work_order_id;
    if (!id) {
      return { ok: false, reason_code: "MISSING_WORK_ORDER", error: "WorkResult is missing work_order_id" };
    }
    const workOrder = workOrders.find((wo) => wo && wo.work_order_id === id);
    if (!workOrder) {
      return {
        ok: false,
        reason_code: "MISSING_WORK_ORDER",
        error: `No WorkOrder bound for work_order_id ${id}`,
      };
    }
    return {
      ok: true,
      workOrder,
      allowed_paths: Array.isArray(workOrder.allowed_paths) ? workOrder.allowed_paths : [],
    };
  }
  return {
    ok: true,
    workOrder: null,
    allowed_paths: Array.isArray(options.allowed_paths) ? options.allowed_paths : null,
  };
}

function resultingFileMode(fileDiff) {
  if (fileDiff.newPath === "/dev/null") return null;
  return fileDiff.newMode || fileDiff.newFileMode || null;
}

/**
 * Fail-closed when incomparable predecessor WorkResults claim overlapping original
 * hunk context on the same path. Ancestor→descendant overlaps are permitted.
 *
 * @param {Array<{node_id: string, workResult: object}>|object} predecessorsOrCurrent
 * @param {Array<{node_id: string, workResult: object}>} [predecessors]
 * @param {Map<string, Set<string>>|Record<string, string[]>} [ancestorClosure]
 * @returns {{ ok: boolean, error?: string, reason_code?: string }}
 */
function detectPredecessorContextConflicts(predecessorsOrCurrent, predecessors, ancestorClosure) {
  let entries;
  let closure = ancestorClosure;
  if (Array.isArray(predecessorsOrCurrent)) {
    entries = predecessorsOrCurrent;
    closure = predecessors;
  } else if (Array.isArray(predecessors)) {
    entries = predecessors;
  } else {
    entries = [];
  }

  const normalized = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.workResult) {
      normalized.push({ node_id: entry.node_id, workResult: entry.workResult });
    } else {
      normalized.push({ node_id: entry.node_id || entry.work_order_id, workResult: entry });
    }
  }

  function ancestorsOf(nodeId) {
    if (!closure || !nodeId) return new Set();
    if (closure instanceof Map) return closure.get(nodeId) || new Set();
    const raw = closure[nodeId];
    return new Set(Array.isArray(raw) ? raw : []);
  }

  function areIncomparable(aId, bId) {
    if (!aId || !bId || aId === bId) return true;
    const aAnc = ancestorsOf(aId);
    const bAnc = ancestorsOf(bId);
    if (aAnc.has(bId) || bAnc.has(aId)) return false;
    return true;
  }

  const byFile = new Map();
  for (const entry of normalized) {
    const wr = entry.workResult;
    if (!wr || typeof wr !== "object") continue;
    const patch = wr.patch || "";
    if (!patch.trim()) continue;
    const parsed = parseUnifiedDiffs(patch);
    if (!parsed.ok) {
      return {
        ok: false,
        reason_code: parsed.reason_code || "MALFORMED_UNIFIED_DIFF",
        error: parsed.error,
      };
    }
    for (const fd of parsed.files) {
      const normTarget = normalizeRelativePath(fd.targetPath);
      if (!normTarget) continue;
      if (!byFile.has(normTarget)) byFile.set(normTarget, []);
      const previous = byFile.get(normTarget);
      const hunks = fd.hunks.length > 0
        ? fd.hunks
        : [{ oldStart: 0, oldCount: 0 }];
      for (const hunk of hunks) {
        const range = hunkOldRange(hunk);
        for (const prev of previous) {
          const sameAuthor = prev.node_id && entry.node_id
            ? prev.node_id === entry.node_id
            : prev.work_order_id === wr.work_order_id;
          if (sameAuthor) continue;
          if (!areIncomparable(prev.node_id, entry.node_id)) continue;
          if (rangesOverlap(prev.range, range)) {
            return {
              ok: false,
              reason_code: "PREDECESSOR_CONTEXT_CONFLICT",
              error: `Incompatible predecessor diffs overlap on ${normTarget}`,
            };
          }
        }
        previous.push({
          node_id: entry.node_id,
          work_order_id: wr.work_order_id,
          range,
        });
      }
    }
  }
  return { ok: true };
}

/**
 * Integrates WorkResult patches onto the node's effective base and optionally freezes Candidate via K3.
 * Containment is bound to the producing WorkOrder via work_order_id when workOrders are supplied.
 *
 * @param {Object} sourceSnapshot
 * @param {Array<Object>} workResults
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function integrateWorkResultPatches(sourceSnapshot, workResults = [], options = {}) {
  if (!sourceSnapshot || typeof sourceSnapshot !== "object") {
    return { ok: false, error: "sourceSnapshot is required", reason_code: "INVALID_SOURCE_SNAPSHOT" };
  }
  if (!Array.isArray(workResults)) {
    return { ok: false, error: "workResults must be an array", reason_code: "INVALID_WORK_RESULTS" };
  }

  const candidateFiles = collectFilesMap(options.files);
  const fileModes = { ...(options.file_modes || options.fileModes || {}) };
  const modifiedPathsSet = new Set();
  const diffTexts = [];
  const freeze = options.freeze !== false;

  for (const wr of workResults) {
    if (!wr || typeof wr !== "object") continue;
    const patch = wr.patch || "";
    if (!patch.trim()) continue;

    const binding = resolveWorkOrderBinding(wr, options);
    if (!binding.ok) return binding;

    diffTexts.push(patch.trim());
    const parsed = parseUnifiedDiffs(patch);
    if (!parsed.ok) {
      return {
        ok: false,
        error: parsed.error || "Malformed unified diff",
        reason_code: parsed.reason_code || "MALFORMED_UNIFIED_DIFF",
      };
    }
    for (const fd of parsed.files) {
      if (fd.invalidMode) {
        return {
          ok: false,
          error: `Invalid file mode: ${fd.invalidMode}`,
          reason_code: "INVALID_FILE_MODE",
        };
      }

      const normTarget = normalizeRelativePath(fd.targetPath);
      if (!normTarget) {
        return { ok: false, error: `Invalid target path in patch: ${fd.targetPath}`, reason_code: "CONTAINMENT_VIOLATION" };
      }
      fd.targetPath = normTarget;

      if (binding.allowed_paths) {
        const containment = validateAllowedPaths([normTarget], binding.allowed_paths, {
          work_order_id: wr.work_order_id,
        });
        if (!containment.ok) {
          return {
            ok: false,
            error: `Containment violation: path ${normTarget} is outside WorkOrder.allowed_paths`,
            reason_code: "CONTAINMENT_VIOLATION",
            violation: containment.violation,
          };
        }
      }

      const countOverlap = validateHunkCountsAndOverlaps(fd);
      if (!countOverlap.ok) return countOverlap;

      const isCreate = fd.oldPath === "/dev/null" || Boolean(fd.newFileMode);
      const isDelete = fd.newPath === "/dev/null" || Boolean(fd.deletedFileMode);
      const isModeOnly = fd.hunks.length === 0 && fd.oldMode && fd.newMode && !isCreate && !isDelete;
      if (isModeOnly) {
        if (!candidateFiles.has(normTarget)) {
          return {
            ok: false,
            error: `Mode-only patch targets nonexistent path: ${normTarget}`,
            reason_code: "MALFORMED_UNIFIED_DIFF",
          };
        }
        const effectiveMode = fileModes[normTarget] ?? "100644";
        if (fd.oldMode !== effectiveMode) {
          return {
            ok: false,
            error: `Mode-only patch old mode ${fd.oldMode} does not match authorized base mode ${effectiveMode}`,
            reason_code: "INVALID_FILE_MODE",
          };
        }
      }

      const oldContent = candidateFiles.has(fd.targetPath) ? candidateFiles.get(fd.targetPath) : "";
      const contextDeletion = validateContextAndDeletion(oldContent, fd);
      if (!contextDeletion.ok) return contextDeletion;

      const applied = applyFileDiff(oldContent, fd);
      if (!applied.ok) return applied;

      if (applied.deleted) {
        candidateFiles.delete(fd.targetPath);
        delete fileModes[fd.targetPath];
      } else {
        candidateFiles.set(fd.targetPath, applied.content);
        const mode = resultingFileMode(fd);
        if (mode) fileModes[fd.targetPath] = mode;
      }
      modifiedPathsSet.add(fd.targetPath);
    }
  }

  const modifiedPaths = Array.from(modifiedPathsSet).sort();
  const combinedDiffText = diffTexts.join("\n\n");
  const candidateTreeDigest = computeTreeDigest(candidateFiles);
  const repositoryId = options.repository_id || sourceSnapshot.repository_id || "workspace";
  const effectiveBase = buildEffectiveShadowBase({
    sourceSnapshot,
    files: candidateFiles,
    file_modes: fileModes,
    predecessor_node_ids: options.predecessor_node_ids,
  });

  if (!freeze) {
    return {
      ok: true,
      candidateFiles,
      fileModes,
      combinedDiffText,
      modifiedPaths,
      effectiveBase,
    };
  }

  try {
    const candidate = freezeCandidate({
      repository_id: repositoryId,
      projection: "workspace",
      base_tree: sourceSnapshot.base_tree_digest,
      candidate_tree: candidateTreeDigest,
      diffText: combinedDiffText,
      paths: modifiedPaths,
      fileModes,
      predecessorCandidate: options.predecessorCandidate,
    });

    return {
      ok: true,
      candidate,
      candidateFiles,
      fileModes,
      combinedDiffText,
      modifiedPaths,
      effectiveBase,
    };
  } catch (err) {
    return {
      ok: false,
      error: `freezeCandidate failed: ${err.message}`,
      reason_code: "CANDIDATE_FREEZE_FAILED",
    };
  }
}

module.exports = {
  integrateWorkResultPatches,
  parseUnifiedDiffs,
  applyFileDiff,
  detectPredecessorContextConflicts,
  VALID_GIT_FILE_MODES,
};
