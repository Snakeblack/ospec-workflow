"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { renameWithFallback } = require("./atomic-write.js");
const { computeRevision } = require("./authority-store/index.js");

function clone(val) {
  return val !== undefined ? JSON.parse(JSON.stringify(val)) : undefined;
}

async function withFileLock(filePath, fn, options = {}) {
  const lockPath = `${filePath}.lock`;
  const retries = options.retries ?? 50;
  const retryInterval = options.retryInterval ?? 10;
  const staleTimeout = options.staleTimeout ?? 5000;
  const ownerToken = randomUUID();
  const lockPayload = JSON.stringify({
    ownerToken,
    pid: process.pid,
    timestamp: Date.now(),
  });

  let handle = null;
  for (let i = 0; i < retries; i++) {
    try {
      handle = await fs.open(lockPath, "wx");
      await handle.writeFile(lockPayload, "utf8");
      await handle.sync();
      break;
    } catch (err) {
      if (handle) {
        try { await handle.close(); } catch (_) {}
        handle = null;
      }
      if (err.code === "EEXIST") {
        try {
          const stats = await fs.stat(lockPath);
          if (Date.now() - stats.mtimeMs > staleTimeout) {
            try {
              await fs.unlink(lockPath);
            } catch (_) {}
          }
        } catch (_) {}
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      } else {
        throw err;
      }
    }
  }

  if (!handle) {
    throw new Error(`Failed to acquire lockfile on ${lockPath}`);
  }

  try {
    return await fn();
  } finally {
    try {
      await handle.close();
    } catch (_) {}
    try {
      const lockContent = await fs.readFile(lockPath, "utf8");
      const lockData = JSON.parse(lockContent);
      if (lockData && lockData.ownerToken === ownerToken) {
        await fs.unlink(lockPath);
      }
    } catch (_) {}
  }
}

function createFileSystemStore(options = {}) {
  const filePath = options.filePath;
  if (!filePath || typeof filePath !== "string") {
    throw new Error("FileSystemStore requires options.filePath string");
  }

  const initializeIfMissing = options.initializeIfMissing ?? false;
  let memoryCache = null;

  async function writeRecordAtomic(record) {
    const jsonStr = JSON.stringify(record, null, 2);
    const dirPath = path.dirname(filePath);
    await fs.mkdir(dirPath, { recursive: true });

    const tempPath = `${filePath}.tmp.${randomUUID()}`;

    // 1. Temp write & 2. File fsync
    const handle = await fs.open(tempPath, "w");
    try {
      await handle.writeFile(jsonStr, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    // 3. Atomic rename
    await renameWithFallback(tempPath, filePath);

    // 4. Directory fsync
    try {
      const dirHandle = await fs.open(dirPath, "r");
      try {
        await dirHandle.sync();
      } catch (_) {
        // Ignored if directory fsync is unsupported on current OS
      } finally {
        await dirHandle.close();
      }
    } catch (_) {
      // Ignored if directory open fails
    }

    memoryCache = JSON.parse(jsonStr);
  }

  function defaultRecord() {
    const seed = options.initial || {};
    return {
      state: clone(seed.state) || { schema_version: 1, status: "ready", nodes: {} },
      journal: clone(seed.journal) || [],
      authority: clone(seed.authority) || { permits: {}, receipts: {} },
      budgets: clone(seed.budgets) || { attempts: 0, corrections: 0 },
    };
  }

  return {
    async load() {
      try {
        const content = await fs.readFile(filePath, "utf8");
        const record = JSON.parse(content);
        memoryCache = {
          state: record.state || { schema_version: 1, status: "ready", nodes: {} },
          journal: Array.isArray(record.journal) ? record.journal : [],
          authority: record.authority || { permits: {}, receipts: {} },
          budgets: record.budgets || { attempts: 0, corrections: 0 },
        };
        return clone(memoryCache);
      } catch (err) {
        if (err.code === "ENOENT") {
          const bakPath = `${filePath}.bak`;
          try {
            const bakContent = await fs.readFile(bakPath, "utf8");
            await renameWithFallback(bakPath, filePath);
            const record = JSON.parse(bakContent);
            memoryCache = {
              state: record.state || { schema_version: 1, status: "ready", nodes: {} },
              journal: Array.isArray(record.journal) ? record.journal : [],
              authority: record.authority || { permits: {}, receipts: {} },
              budgets: record.budgets || { attempts: 0, corrections: 0 },
            };
            return clone(memoryCache);
          } catch (bakErr) {
            if (bakErr.code === "ENOENT") {
              if (initializeIfMissing === true) {
                memoryCache = defaultRecord();
                return clone(memoryCache);
              }
              const notFoundErr = new Error(`Authority head not found at ${filePath}`);
              notFoundErr.code = "authority-head-not-found";
              throw notFoundErr;
            }
            throw bakErr;
          }
        }
        throw err;
      }
    },
    async commitJournal(nextJournal) {
      return withFileLock(filePath, async () => {
        const current = await this.load();
        const nextRecord = {
          state: current.state,
          journal: clone(nextJournal),
          authority: current.authority,
          budgets: current.budgets,
        };
        await writeRecordAtomic(nextRecord);
        return { journal: nextRecord.journal };
      });
    },
    async commit({ state, journal, authority, budgets, expectedRevision }) {
      return withFileLock(filePath, async () => {
        let currentRecord;
        try {
          const content = await fs.readFile(filePath, "utf8");
          currentRecord = JSON.parse(content);
        } catch (err) {
          if (err.code === "ENOENT") {
            const bakPath = `${filePath}.bak`;
            try {
              const bakContent = await fs.readFile(bakPath, "utf8");
              await renameWithFallback(bakPath, filePath);
              currentRecord = JSON.parse(bakContent);
            } catch (bakErr) {
              if (bakErr.code === "ENOENT") {
                currentRecord = defaultRecord();
              } else {
                throw bakErr;
              }
            }
          } else {
            throw err;
          }
        }

        const currentRevision = computeRevision(
          currentRecord.state,
          currentRecord.journal,
          currentRecord.authority
        );

        if (expectedRevision !== undefined && expectedRevision !== null && expectedRevision !== currentRevision) {
          return { ok: false, code: "cas-conflict", revision: currentRevision };
        }

        const nextRecord = {
          state: clone(state !== undefined ? state : currentRecord.state),
          journal: clone(journal !== undefined ? journal : currentRecord.journal),
          authority: clone(authority !== undefined ? authority : currentRecord.authority),
          budgets: clone(budgets !== undefined ? budgets : currentRecord.budgets),
        };

        await writeRecordAtomic(nextRecord);
        return clone(nextRecord);
      });
    },
    snapshot() {
      if (!memoryCache) {
        memoryCache = defaultRecord();
      }
      return clone(memoryCache);
    },
  };
}

module.exports = { createFileSystemStore, withFileLock };
