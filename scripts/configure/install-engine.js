"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MANIFEST_FILENAME = ".ospec-workflow-install.json";

function lstatIfExists(targetPath, fsImpl = fs) {
  try {
    return fsImpl.lstatSync(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function realpathIfExists(targetPath, fsImpl = fs) {
  try {
    return fsImpl.realpathSync(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return path.resolve(targetPath);
    }
    throw error;
  }
}

function assertPathSafe(targetRoot, managedPath = targetRoot, fsImpl = fs) {
  const resolvedRoot = path.resolve(targetRoot);
  if (resolvedRoot === path.parse(resolvedRoot).root) {
    throw new Error(`refusing to sync into filesystem root: ${resolvedRoot}`);
  }

  const rootStat = lstatIfExists(resolvedRoot, fsImpl);
  if (rootStat && rootStat.isSymbolicLink()) {
    throw new Error(`refusing symlinked target root: ${resolvedRoot}`);
  }

  const resolvedManaged = path.resolve(managedPath);
  const managedStat = lstatIfExists(resolvedManaged, fsImpl);
  if (managedStat && managedStat.isSymbolicLink()) {
    throw new Error(`refusing symlinked destination path: ${resolvedManaged}`);
  }

  const canonicalRoot = realpathIfExists(resolvedRoot, fsImpl);
  const parentOfManaged = path.dirname(resolvedManaged);
  const canonicalManagedParent = realpathIfExists(parentOfManaged, fsImpl);

  if (path.resolve(managedPath) !== resolvedRoot) {
    const relative = path.relative(
      canonicalRoot,
      path.join(canonicalManagedParent, path.basename(resolvedManaged)),
    );
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`refusing path that escapes target root: ${resolvedManaged}`);
    }
  }
}

function filesMatch(source, destination, fsImpl = fs) {
  try {
    return fsImpl.readFileSync(source).equals(fsImpl.readFileSync(destination));
  } catch {
    return false;
  }
}

function createRollbackJournal(targetRoot, fsImpl = fs) {
  const entries = [];
  const captured = new Set();
  const newDirectories = new Set();

  return {
    captureDirectory(targetPath) {
      const absolute = path.resolve(targetPath);
      assertPathSafe(targetRoot, absolute, fsImpl);
      const stat = lstatIfExists(absolute, fsImpl);
      if (!stat) {
        newDirectories.add(absolute);
      } else if (!stat.isDirectory()) {
        throw new Error(`refusing non-directory managed path: ${absolute}`);
      }
    },
    capture(targetPath) {
      const absolute = path.resolve(targetPath);
      if (captured.has(absolute)) return;
      assertPathSafe(targetRoot, absolute, fsImpl);
      const stat = lstatIfExists(absolute, fsImpl);
      if (stat && !stat.isFile()) {
        throw new Error(`refusing to replace non-file managed path: ${absolute}`);
      }
      entries.push({
        path: absolute,
        existed: Boolean(stat),
        bytes: stat ? fsImpl.readFileSync(absolute) : null,
        mode: stat ? stat.mode : null,
      });
      captured.add(absolute);
    },
    rollback() {
      const failures = [];
      for (const entry of [...entries].reverse()) {
        try {
          if (entry.existed) {
            fsImpl.mkdirSync(path.dirname(entry.path), { recursive: true });
            fsImpl.writeFileSync(entry.path, entry.bytes);
            if (entry.mode !== null) {
              fsImpl.chmodSync(entry.path, entry.mode);
            }
          } else {
            fsImpl.rmSync(entry.path, { force: true });
          }
        } catch (error) {
          failures.push(`${entry.path}: ${error.message || error}`);
        }
      }

      const candidateDirs = [...newDirectories].sort((a, b) => b.length - a.length);
      for (const dir of candidateDirs) {
        try {
          const stat = lstatIfExists(dir, fsImpl);
          if (stat && stat.isSymbolicLink()) {
            throw new Error("refusing to follow symlink during rollback");
          }
          if (stat && stat.isDirectory() && fsImpl.readdirSync(dir).length === 0) {
            fsImpl.rmdirSync(dir);
          }
        } catch (error) {
          failures.push(`${dir}: ${error.message || error}`);
        }
      }
      if (failures.length > 0) {
        throw new Error(`rollback incomplete: ${failures.join("; ")}`);
      }
    },
  };
}

function readOwnershipManifest(targetRoot, fsImpl = fs) {
  const manifestPath = path.join(targetRoot, MANIFEST_FILENAME);
  if (!fsImpl.existsSync(manifestPath)) {
    return null;
  }
  const raw = fsImpl.readFileSync(manifestPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse installation manifest at ${manifestPath}: ${error.message}`);
  }
}

function writeOwnershipManifest(targetRoot, manifest, fsImpl = fs, journal = null) {
  const manifestPath = path.join(targetRoot, MANIFEST_FILENAME);
  assertPathSafe(targetRoot, manifestPath, fsImpl);
  if (journal) {
    journal.captureDirectory(targetRoot);
    journal.capture(manifestPath);
  }
  fsImpl.mkdirSync(targetRoot, { recursive: true });
  fsImpl.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

function toPosix(filePath) {
  return filePath ? filePath.split(path.sep).join("/").replace(/\\/g, "/") : "";
}

function pruneStaleFiles(targetRoot, previousManifest, currentFiles, fsImpl = fs, journal = null) {
  if (!previousManifest || !Array.isArray(previousManifest.files)) {
    return { deleted: [] };
  }

  const currentSet = new Set(currentFiles.map((f) => toPosix(f)));
  const previousFiles = previousManifest.files.map((f) => toPosix(f));
  const deleted = [];

  for (const relFile of previousFiles) {
    if (!currentSet.has(relFile)) {
      const fullPath = path.join(targetRoot, relFile);
      try {
        assertPathSafe(targetRoot, fullPath, fsImpl);
        if (fsImpl.existsSync(fullPath)) {
          if (journal) journal.capture(fullPath);
          fsImpl.rmSync(fullPath, { force: true });
          deleted.push(toPosix(relFile));

          // Clean up empty directories up to targetRoot
          let parentDir = path.dirname(fullPath);
          const resolvedRoot = path.resolve(targetRoot);
          while (path.resolve(parentDir) !== resolvedRoot && path.resolve(parentDir).startsWith(resolvedRoot)) {
            const entries = fsImpl.readdirSync(parentDir);
            if (entries.length === 0) {
              fsImpl.rmdirSync(parentDir);
              parentDir = path.dirname(parentDir);
            } else {
              break;
            }
          }
        }
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw new Error(`Failed to prune stale file ${fullPath}: ${error.message || error}`);
        }
      }
    }
  }

  return { deleted };
}

function safeParseJson(content, filename = "config.json") {
  if (typeof content !== "string" || !content.trim()) {
    return {};
  }
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse ${filename}: ${error.message}`);
  }
}

function stripJsoncComments(content) {
  const chars = [];
  let inString = false;
  let inSingleLineComment = false;
  let inMultiLineComment = false;
  let isEscaped = false;
  let lastCommaIndex = -1;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inSingleLineComment) {
      if (char === "\n" || char === "\r") {
        inSingleLineComment = false;
        chars.push(char);
      }
      continue;
    }

    if (inMultiLineComment) {
      if (char === "*" && nextChar === "/") {
        inMultiLineComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      chars.push(char);
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      lastCommaIndex = -1;
      chars.push(char);
      continue;
    }

    if (char === "/" && nextChar === "/") {
      inSingleLineComment = true;
      i += 1;
      continue;
    }

    if (char === "/" && nextChar === "*") {
      inMultiLineComment = true;
      i += 1;
      continue;
    }

    // Outside comments and strings
    if (char === ",") {
      lastCommaIndex = chars.length;
      chars.push(char);
      continue;
    }

    if (char === "}" || char === "]") {
      if (lastCommaIndex !== -1) {
        chars.splice(lastCommaIndex, 1);
        lastCommaIndex = -1;
      }
      chars.push(char);
      continue;
    }

    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      chars.push(char);
      continue;
    }

    lastCommaIndex = -1;
    chars.push(char);
  }

  return chars.join("");
}

function safeParseJsonc(content, filename = "settings.json") {
  if (typeof content !== "string" || !content.trim()) {
    return {};
  }
  const cleaned = stripJsoncComments(content);
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`Failed to parse JSONC in ${filename}: ${error.message}`);
  }
}

function mergeJsonFile(filePath, updaterFn, deps = {}) {
  const fsImpl = deps.fs || fs;
  const journal = deps.journal;
  let parsed = {};

  if (fsImpl.existsSync(filePath)) {
    const raw = fsImpl.readFileSync(filePath, "utf8");
    parsed = safeParseJson(raw, filePath);
  }

  const updated = updaterFn(parsed);
  if (journal) {
    journal.captureDirectory(path.dirname(filePath));
    journal.capture(filePath);
  }
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  fsImpl.writeFileSync(filePath, JSON.stringify(updated, null, 2) + "\n", "utf8");
  return updated;
}

function mergeJsoncFile(filePath, updaterFn, deps = {}) {
  const fsImpl = deps.fs || fs;
  const journal = deps.journal;
  let parsed = {};

  if (fsImpl.existsSync(filePath)) {
    const raw = fsImpl.readFileSync(filePath, "utf8");
    parsed = safeParseJsonc(raw, filePath);
  }

  const updated = updaterFn(parsed);
  if (journal) {
    journal.captureDirectory(path.dirname(filePath));
    journal.capture(filePath);
  }
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  fsImpl.writeFileSync(filePath, JSON.stringify(updated, null, 2) + "\n", "utf8");
  return updated;
}

function mergeHooksDoc(existingDoc, generatedDoc, format = "standard") {
  if (!existingDoc || typeof existingDoc !== "object") {
    return generatedDoc;
  }
  if (!generatedDoc || typeof generatedDoc !== "object") {
    return existingDoc;
  }

  if (format === "cursor") {
    const next = { ...existingDoc };
    next.version = generatedDoc.version || existingDoc.version || 1;
    next.hooks = { ...(existingDoc.hooks || {}) };

    const genHooks = generatedDoc.hooks || {};
    for (const [event, genCommandList] of Object.entries(genHooks)) {
      const existingList = Array.isArray(next.hooks[event]) ? next.hooks[event] : [];
      // Filter out previous ospec-hooks commands
      const foreignCommands = existingList.filter((entry) => {
        const cmd = typeof entry === "string" ? entry : entry?.command || "";
        return !cmd.includes("ospec-hooks");
      });
      next.hooks[event] = [...foreignCommands, ...genCommandList];
    }
    return next;
  }

  // Standard / Claude / Antigravity format: keyed by hook group name ("ospec-...")
  const next = { ...existingDoc };
  for (const [groupName, groupValue] of Object.entries(generatedDoc)) {
    next[groupName] = groupValue;
  }
  return next;
}

function syncTargetTree(
  sourceDir,
  destDir,
  fsImpl = fs,
  result = { updated: [], unchanged: [], ownedFiles: [] },
  skipNames = new Set(),
  targetRoot = destDir,
  journal = null,
  relPrefix = "",
) {
  assertPathSafe(targetRoot, destDir, fsImpl);
  if (journal) journal.captureDirectory(destDir);
  fsImpl.mkdirSync(destDir, { recursive: true });

  for (const entry of fsImpl.readdirSync(sourceDir, { withFileTypes: true })) {
    if (skipNames.has(entry.name)) {
      continue;
    }
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destDir, entry.name);
    const relFile = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      syncTargetTree(source, destination, fsImpl, result, skipNames, targetRoot, journal, relFile);
    } else if (entry.isFile()) {
      assertPathSafe(targetRoot, destination, fsImpl);
      result.ownedFiles.push(relFile);
      if (filesMatch(source, destination, fsImpl)) {
        result.unchanged.push(destination);
      } else {
        if (journal) journal.capture(destination);
        fsImpl.mkdirSync(path.dirname(destination), { recursive: true });
        fsImpl.copyFileSync(source, destination);
        result.updated.push(destination);
      }
    }
  }
  return result;
}

module.exports = {
  MANIFEST_FILENAME,
  toPosix,
  assertPathSafe,
  createRollbackJournal,
  readOwnershipManifest,
  writeOwnershipManifest,
  pruneStaleFiles,
  safeParseJson,
  stripJsoncComments,
  safeParseJsonc,
  mergeJsonFile,
  mergeJsoncFile,
  mergeHooksDoc,
  syncTargetTree,
};
