"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { renameWithFallback } = require("./atomic-write.js");

function clone(val) {
  return val !== undefined ? JSON.parse(JSON.stringify(val)) : undefined;
}

function createFileSystemStore(options = {}) {
  const filePath = options.filePath;
  if (!filePath || typeof filePath !== "string") {
    throw new Error("FileSystemStore requires options.filePath string");
  }

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
          memoryCache = defaultRecord();
          return clone(memoryCache);
        }
        throw err;
      }
    },
    async commitJournal(nextJournal) {
      const current = memoryCache || (await this.load());
      const nextRecord = {
        state: current.state,
        journal: clone(nextJournal),
        authority: current.authority,
        budgets: current.budgets,
      };
      await writeRecordAtomic(nextRecord);
      return { journal: nextRecord.journal };
    },
    async commit({ state, journal, authority, budgets }) {
      const current = memoryCache || (await this.load());
      const nextRecord = {
        state: clone(state !== undefined ? state : current.state),
        journal: clone(journal !== undefined ? journal : current.journal),
        authority: clone(authority !== undefined ? authority : current.authority),
        budgets: clone(budgets !== undefined ? budgets : current.budgets),
      };
      await writeRecordAtomic(nextRecord);
      return clone(nextRecord);
    },
    snapshot() {
      if (!memoryCache) {
        memoryCache = defaultRecord();
      }
      return clone(memoryCache);
    },
  };
}

module.exports = { createFileSystemStore };
