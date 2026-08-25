"use strict";

const { normalizeRelativePath, validateAllowedPaths } = require("../allowed-paths-validator.js");
const { computeTreeDigest } = require("../worker-workspace.js");
const { freezeCandidate } = require("../execution-identities/index.js");

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

function parseUnifiedDiffs(diffText) {
  if (!diffText || typeof diffText !== "string") return [];
  const normalized = diffText.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const fileDiffs = [];
  let currentFile = null;
  let currentHunk = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("--- ")) {
      const oldHeader = line.slice(4).trim();
      const nextLine = lines[i + 1] || "";
      if (nextLine.startsWith("+++ ")) {
        i++;
        const newHeader = nextLine.slice(4).trim();
        const oldPath = oldHeader === "/dev/null" ? "/dev/null" : oldHeader.replace(/^[ab]\//, "");
        const newPath = newHeader === "/dev/null" ? "/dev/null" : newHeader.replace(/^[ab]\//, "");
        currentFile = {
          oldPath,
          newPath,
          targetPath: newPath !== "/dev/null" ? newPath : oldPath,
          hunks: [],
        };
        fileDiffs.push(currentFile);
        currentHunk = null;
        continue;
      }
    }

    if (line.startsWith("@@ ") && currentFile) {
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
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
    }

    if (currentHunk) {
      if (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ") || line.startsWith("\\ No newline")) {
        currentHunk.lines.push(line);
      }
    }
  }

  return fileDiffs;
}

function applyFileDiff(oldContent, fileDiff) {
  if (fileDiff.newPath === "/dev/null") {
    return { deleted: true, content: "" };
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
    return { deleted: false, content: res };
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

  return { deleted: false, content: finalContent };
}

/**
 * Integrates WorkResult patches onto the authorized SourceSnapshot and freezes Candidate via K3.
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

  const baseFilesMap = new Map();
  if (options.files instanceof Map) {
    for (const [k, v] of options.files.entries()) {
      const norm = normalizeRelativePath(k);
      if (norm) baseFilesMap.set(norm, typeof v === "string" ? v : (Buffer.isBuffer(v) ? v.toString("utf8") : String(v)));
    }
  } else if (Array.isArray(options.files)) {
    for (const item of options.files) {
      if (item && item.path) {
        const norm = normalizeRelativePath(item.path);
        if (norm) baseFilesMap.set(norm, typeof item.content === "string" ? item.content : (Buffer.isBuffer(item.content) ? item.content.toString("utf8") : String(item.content || "")));
      }
    }
  } else if (options.files && typeof options.files === "object") {
    for (const [k, v] of Object.entries(options.files)) {
      const norm = normalizeRelativePath(k);
      if (norm) baseFilesMap.set(norm, typeof v === "string" ? v : (Buffer.isBuffer(v) ? v.toString("utf8") : String(v)));
    }
  }

  // Parse all diffs and validate path containment against allowed_paths
  const allFileDiffs = [];
  const modifiedPathsSet = new Set();
  const diffTexts = [];

  for (const wr of workResults) {
    if (!wr || typeof wr !== "object") continue;
    const patch = wr.patch || "";
    if (patch.trim()) {
      diffTexts.push(patch.trim());
      const parsed = parseUnifiedDiffs(patch);
      for (const fd of parsed) {
        const normTarget = normalizeRelativePath(fd.targetPath);
        if (!normTarget) {
          return { ok: false, error: `Invalid target path in patch: ${fd.targetPath}`, reason_code: "CONTAINMENT_VIOLATION" };
        }
        fd.targetPath = normTarget;

        if (options.allowed_paths && Array.isArray(options.allowed_paths)) {
          const containment = validateAllowedPaths([normTarget], options.allowed_paths);
          if (!containment.ok) {
            return {
              ok: false,
              error: `Containment violation: path ${normTarget} is outside allowed_paths`,
              reason_code: "CONTAINMENT_VIOLATION",
              violation: containment.violation,
            };
          }
        }

        allFileDiffs.push(fd);
        modifiedPathsSet.add(normTarget);
      }
    }
  }

  // Apply diffs in memory
  const candidateFiles = new Map(baseFilesMap);
  for (const fd of allFileDiffs) {
    const oldContent = candidateFiles.has(fd.targetPath) ? candidateFiles.get(fd.targetPath) : (baseFilesMap.get(fd.targetPath) || "");
    const res = applyFileDiff(oldContent, fd);
    if (res.deleted) {
      candidateFiles.delete(fd.targetPath);
    } else {
      candidateFiles.set(fd.targetPath, res.content);
    }
  }

  const modifiedPaths = Array.from(modifiedPathsSet).sort();
  const combinedDiffText = diffTexts.join("\n\n");
  const candidateTreeDigest = computeTreeDigest(candidateFiles);
  const repositoryId = options.repository_id || sourceSnapshot.repository_id || "workspace";

  try {
    const candidate = freezeCandidate({
      repository_id: repositoryId,
      projection: "workspace",
      base_tree: sourceSnapshot.base_tree_digest,
      candidate_tree: candidateTreeDigest,
      diffText: combinedDiffText,
      paths: modifiedPaths,
      predecessorCandidate: options.predecessorCandidate,
    });

    return {
      ok: true,
      candidate,
      candidateFiles,
      combinedDiffText,
      modifiedPaths,
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
};
