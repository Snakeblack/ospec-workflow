"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

// A temporary file older than this belongs to a writer that died: a live one
// renames it within the lock's stale window (LOCK_STALE_MS, ospec-state.js).
const STALE_TEMP_MS = 5000;
// Syncing a directory is not supported on these, so the rename stays as
// durable as the filesystem makes it.
const DIRECTORY_SYNC_UNSUPPORTED = new Set(["EINVAL", "ENOTSUP", "EOPNOTSUPP"]);

/**
 * Restores an orphaned target.bak to target if target is absent.
 * @param {string} targetPath
 */
async function recoverOrphanBak(targetPath) {
  const bakPath = targetPath + ".bak";
  try {
    const targetExists = await fs.stat(targetPath).then(() => true, () => false);
    if (!targetExists) {
      const bakExists = await fs.stat(bakPath).then(() => true, () => false);
      if (bakExists) {
        await fs.rename(bakPath, targetPath);
      }
    }
  } catch (error) {
    // Ignore recovery errors, but let it fail open or log if critical.
  }
}

// <target>.<writer>.tmp is each writer's own temporary file (the native
// binary's too); <target>.tmp is the one versions before E1.46 shared.
function tempPattern(targetPath) {
  const base = path.basename(targetPath).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${base}(?:\\.[^.]+)?\\.tmp$`);
}

// Best effort: a leftover that cannot be removed never fails the write.
async function removeStaleTemps(targetPath, now = Date.now()) {
  const dir = path.dirname(targetPath);
  const pattern = tempPattern(targetPath);
  let names;
  try {
    names = await fs.readdir(dir);
  } catch (_) {
    return;
  }
  for (const name of names.filter((entry) => pattern.test(entry))) {
    const file = path.join(dir, name);
    try {
      if (now - (await fs.lstat(file)).mtimeMs > STALE_TEMP_MS) await fs.unlink(file);
    } catch (_) {}
  }
}

async function writeDurably(file, content) {
  const handle = await fs.open(file, "wx");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

// Makes the rename itself survive a power cut. Windows cannot open a
// directory to sync it.
async function syncDirectory(dir) {
  if (process.platform === "win32") return;
  let handle;
  try {
    handle = await fs.open(dir, "r");
    await handle.sync();
  } catch (error) {
    if (!DIRECTORY_SYNC_UNSUPPORTED.has(error.code)) throw error;
  } finally {
    await handle?.close();
  }
}

/**
 * Writes content to targetPath atomically and durably: the content goes to a
 * temporary file of this writer, synced to disk, then renamed over the target,
 * and the directory is synced.
 * @param {string} targetPath
 * @param {string} content
 */
async function writeFileAtomic(targetPath, content) {
  const tempPath = `${targetPath}.${process.pid}-${crypto.randomBytes(6).toString("hex")}.tmp`;
  const bakPath = targetPath + ".bak";

  // 1. Ensure the parent directory exists and drop what dead writers left
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await removeStaleTemps(targetPath);

  // 2. Write and sync the new content to this writer's temp file
  try {
    await writeDurably(tempPath, content);
  } catch (error) {
    // Clean up temp file on failure, ignore if doesn't exist
    try {
      await fs.unlink(tempPath);
    } catch (_) {}
    throw error;
  }

  // 3. Rename temp file to target
  try {
    await fs.rename(tempPath, targetPath);
  } catch (error) {
    // Fallback for Windows rename issue: target exists and throws EEXIST or EPERM
    if (error.code === "EEXIST" || error.code === "EPERM") {
      let backedUp = false;
      try {
        // Try to backup existing target
        await fs.rename(targetPath, bakPath);
        backedUp = true;

        // Try renaming temp to target again
        await fs.rename(tempPath, targetPath);

        // Delete backup on success
        await fs.unlink(bakPath);
      } catch (fallbackError) {
        // Rollback: if backed up, restore original target
        if (backedUp) {
          try {
            await fs.rename(bakPath, targetPath);
          } catch (rollbackError) {
            // Rollback itself failed: target is now MISSING and the only
            // surviving copy of the pre-write content is at bakPath. Do not
            // swallow this — surface the .bak path in the thrown error so a
            // caller (or a recoverOrphanBak() call on the next read) can
            // restore it, instead of the failure looking identical to a
            // clean single-rename failure with the original file intact.
            try {
              await fs.unlink(tempPath);
            } catch (_) {}
            const aggregate = new Error(
              `writeFileAtomic: rollback to "${bakPath}" also failed after the ` +
                `rename fallback errored; the pre-write content is still recoverable ` +
                `at "${bakPath}" (original error: ${fallbackError.message}; ` +
                `rollback error: ${rollbackError.message})`,
            );
            aggregate.code = fallbackError.code;
            aggregate.bakPath = bakPath;
            aggregate.cause = fallbackError;
            throw aggregate;
          }
        }
        // Clean up temp file
        try {
          await fs.unlink(tempPath);
        } catch (_) {}
        throw fallbackError;
      }
    } else {
      // Normal error path
      try {
        await fs.unlink(tempPath);
      } catch (_) {}
      throw error;
    }
  }

  // 4. Sync the directory so the rename itself is durable
  await syncDirectory(path.dirname(targetPath));
}

/**
 * Renames sourcePath → targetPath with Windows EPERM/EEXIST fallback
 * (backup target → .bak, retry rename, remove .bak). Works for files and directories.
 * @param {string} sourcePath
 * @param {string} targetPath
 * @param {{fsImpl?: {rename, unlink, rm, stat}}} [options]
 */
async function renameWithFallback(sourcePath, targetPath, options = {}) {
  const fsImpl = options.fsImpl || {
    rename: fs.rename,
    unlink: fs.unlink,
    rm: fs.rm,
    stat: fs.stat,
  };
  const bakPath = targetPath + ".bak";

  try {
    await fsImpl.rename(sourcePath, targetPath);
    return;
  } catch (error) {
    if (error.code !== "EEXIST" && error.code !== "EPERM") {
      throw error;
    }
  }

  let backedUp = false;
  try {
    try {
      await fsImpl.rename(targetPath, bakPath);
      backedUp = true;
    } catch (bakErr) {
      // Target may be absent (injected EPERM on create) — retry bare rename.
      if (bakErr.code === "ENOENT") {
        await fsImpl.rename(sourcePath, targetPath);
        return;
      }
      throw bakErr;
    }
    await fsImpl.rename(sourcePath, targetPath);
    // Remove backup: file via unlink, directory via rm
    try {
      await fsImpl.unlink(bakPath);
    } catch (unlinkErr) {
      if (unlinkErr.code === "EISDIR" || unlinkErr.code === "EPERM") {
        await fsImpl.rm(bakPath, { recursive: true, force: true });
      } else if (unlinkErr.code !== "ENOENT") {
        // Directory on some platforms: try rm
        await fsImpl.rm(bakPath, { recursive: true, force: true });
      }
    }
  } catch (fallbackError) {
    if (backedUp) {
      try {
        await fsImpl.rename(bakPath, targetPath);
      } catch (rollbackError) {
        const aggregate = new Error(
          `renameWithFallback: rollback to "${bakPath}" also failed; ` +
            `pre-rename content may be at "${bakPath}" ` +
            `(original: ${fallbackError.message}; rollback: ${rollbackError.message})`,
        );
        aggregate.code = fallbackError.code;
        aggregate.bakPath = bakPath;
        aggregate.cause = fallbackError;
        throw aggregate;
      }
    }
    throw fallbackError;
  }
}

module.exports = {
  STALE_TEMP_MS,
  writeFileAtomic,
  recoverOrphanBak,
  renameWithFallback,
};
