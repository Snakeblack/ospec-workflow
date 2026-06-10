#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  calculateFingerprint,
  discoverSkills,
  readRegistryCache,
  writeRegistryCache,
} = require("../lib/skill-registry.js");

const CACHE_VERSION = 1;
const CACHE_RELATIVE_PATH = ".ospec/cache/skill-registry.cache.json";

async function pathIsFile(filePath) {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function resolveWorkspace(input, fallbackCwd) {
  const requestedCwd =
    typeof input.cwd === "string" && input.cwd.trim()
      ? input.cwd
      : fallbackCwd;

  return path.resolve(requestedCwd);
}

async function runSessionStart({
  input = {},
  fallbackCwd = process.cwd(),
  pluginRoot = path.resolve(__dirname, "../.."),
  now = () => new Date(),
} = {}) {
  const workspace = resolveWorkspace(input, fallbackCwd);
  const cachePath = path.join(workspace, ...CACHE_RELATIVE_PATH.split("/"));
  const ospecDetected = await pathIsFile(
    path.join(workspace, "openspec", "config.yaml"),
  );

  if (!ospecDetected) {
    return {
      status: "ok",
      ospecDetected: false,
      registry: {
        status: "skipped",
        path: CACHE_RELATIVE_PATH,
      },
    };
  }

  const registry = await discoverSkills(pluginRoot);
  const fingerprint = await calculateFingerprint(registry.fingerprintPaths);
  const currentCache = await readRegistryCache(cachePath);

  if (
    currentCache?.version === CACHE_VERSION &&
    currentCache.fingerprint === fingerprint
  ) {
    return {
      status: "ok",
      ospecDetected: true,
      registry: {
        status: "fresh",
        path: CACHE_RELATIVE_PATH,
      },
    };
  }

  await writeRegistryCache(cachePath, {
    version: CACHE_VERSION,
    fingerprint,
    generated_at: now().toISOString(),
    skills: registry.skills,
  });

  return {
    status: "ok",
    ospecDetected: true,
    registry: {
      status: "fresh",
      path: CACHE_RELATIVE_PATH,
    },
  };
}

async function readJsonInput(stream = process.stdin) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const input = Buffer.concat(chunks).toString("utf8").trim();
  return input ? JSON.parse(input) : {};
}

async function main() {
  try {
    const result = await runSessionStart({
      input: await readJsonInput(),
    });

    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        status: "error",
        message: error.message,
      })}\n`,
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  CACHE_RELATIVE_PATH,
  runSessionStart,
};
