"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MANIFEST_FILENAME = ".ospec-workflow-install.json";
const TRANSIENT_FS_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

function sleepSync(milliseconds) {
  if (milliseconds > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function withTransientFsRetries(operation, options = {}) {
  const maxRetries = Math.min(5, Math.max(0, options.maxRetries ?? 3));
  const retryDelay = Math.max(1, options.retryDelay ?? 10);
  const sleep = options.sleep || sleepSync;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      if (!TRANSIENT_FS_CODES.has(error?.code)) throw error;
      if (attempt < maxRetries) {
        sleep(retryDelay * (attempt + 1));
        continue;
      }
      const target = options.target || "installer";
      const operationName = options.operation || "filesystem mutation";
      const targetPath = options.path || "unknown path";
      const enriched = new Error(
        `${target}: ${operationName} failed for ${targetPath} after ${attempt + 1} attempts (${error.code}). ` +
        "Close the application or process using this path, then retry the installation.",
        { cause: error },
      );
      enriched.code = error.code;
      enriched.attempts = attempt + 1;
      enriched.operation = operationName;
      enriched.path = targetPath;
      enriched.target = target;
      throw enriched;
    }
  }
}

function mutateFs(operation, targetPath, action, options = {}) {
  return withTransientFsRetries(action, { ...options, operation, path: targetPath });
}

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

function createRollbackJournal(targetRoot, fsImpl = fs, retryOptions = {}) {
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
            mutateFs("rollback mkdir", path.dirname(entry.path), () => fsImpl.mkdirSync(path.dirname(entry.path), { recursive: true }), retryOptions);
            mutateFs("rollback write", entry.path, () => fsImpl.writeFileSync(entry.path, entry.bytes), retryOptions);
            if (entry.mode !== null) {
              mutateFs("rollback chmod", entry.path, () => fsImpl.chmodSync(entry.path, entry.mode), retryOptions);
            }
          } else {
            mutateFs("rollback remove", entry.path, () => fsImpl.rmSync(entry.path, { force: true }), retryOptions);
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
            mutateFs("rollback remove directory", dir, () => fsImpl.rmdirSync(dir), retryOptions);
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

function writeOwnershipManifest(targetRoot, manifest, fsImpl = fs, journal = null, retryOptions = {}) {
  const manifestPath = path.join(targetRoot, MANIFEST_FILENAME);
  assertPathSafe(targetRoot, manifestPath, fsImpl);
  if (journal) {
    journal.captureDirectory(targetRoot);
    journal.capture(manifestPath);
  }
  mutateFs("mkdir", targetRoot, () => fsImpl.mkdirSync(targetRoot, { recursive: true }), retryOptions);
  const content = JSON.stringify(manifest, null, 2) + "\n";
  mutateFs("write manifest", manifestPath, () => fsImpl.writeFileSync(manifestPath, content, "utf8"), retryOptions);
}

function toPosix(filePath) {
  return filePath ? filePath.split(path.sep).join("/").replace(/\\/g, "/") : "";
}

function pruneStaleFiles(targetRoot, previousManifest, currentFiles, fsImpl = fs, journal = null, retryOptions = {}) {
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
          mutateFs("remove stale file", fullPath, () => fsImpl.rmSync(fullPath, { force: true }), retryOptions);
          deleted.push(toPosix(relFile));

          // Clean up empty directories up to targetRoot
          let parentDir = path.dirname(fullPath);
          const resolvedRoot = path.resolve(targetRoot);
          while (path.resolve(parentDir) !== resolvedRoot && path.resolve(parentDir).startsWith(resolvedRoot)) {
            const entries = fsImpl.readdirSync(parentDir);
            if (entries.length === 0) {
              mutateFs("remove empty directory", parentDir, () => fsImpl.rmdirSync(parentDir), retryOptions);
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
  mutateFs("mkdir", path.dirname(filePath), () => fsImpl.mkdirSync(path.dirname(filePath), { recursive: true }), deps.retryOptions);
  const content = JSON.stringify(updated, null, 2) + "\n";
  mutateFs("write JSON", filePath, () => fsImpl.writeFileSync(filePath, content, "utf8"), deps.retryOptions);
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
  mutateFs("mkdir", path.dirname(filePath), () => fsImpl.mkdirSync(path.dirname(filePath), { recursive: true }), deps.retryOptions);
  const content = JSON.stringify(updated, null, 2) + "\n";
  mutateFs("write JSONC", filePath, () => fsImpl.writeFileSync(filePath, content, "utf8"), deps.retryOptions);
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
    // Retired events need the same cleanup as events still generated today.
    const events = new Set([...Object.keys(next.hooks), ...Object.keys(genHooks)]);
    for (const event of events) {
      const genCommandList = genHooks[event] || [];
      const existingList = Array.isArray(next.hooks[event]) ? next.hooks[event] : [];
      // Filter out previous ospec-hooks commands
      const foreignCommands = existingList.filter((entry) => {
        const cmd = typeof entry === "string" ? entry : entry?.command || "";
        return !cmd.includes("ospec-hooks");
      });
      next.hooks[event] = [...foreignCommands, ...genCommandList];
      if (next.hooks[event].length === 0) delete next.hooks[event];
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
  retryOptions = {},
) {
  assertPathSafe(targetRoot, destDir, fsImpl);
  if (journal) journal.captureDirectory(destDir);
  mutateFs("mkdir", destDir, () => fsImpl.mkdirSync(destDir, { recursive: true }), retryOptions);

  for (const entry of fsImpl.readdirSync(sourceDir, { withFileTypes: true })) {
    if (skipNames.has(entry.name)) {
      continue;
    }
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destDir, entry.name);
    const relFile = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      syncTargetTree(source, destination, fsImpl, result, skipNames, targetRoot, journal, relFile, retryOptions);
    } else if (entry.isFile()) {
      assertPathSafe(targetRoot, destination, fsImpl);
      result.ownedFiles.push(relFile);
      if (filesMatch(source, destination, fsImpl)) {
        result.unchanged.push(destination);
      } else {
        if (journal) journal.capture(destination);
        mutateFs("mkdir", path.dirname(destination), () => fsImpl.mkdirSync(path.dirname(destination), { recursive: true }), retryOptions);
        mutateFs("copy", destination, () => fsImpl.copyFileSync(source, destination), retryOptions);
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
  withTransientFsRetries,
  mutateFs,
};
