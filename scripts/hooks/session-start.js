#!/usr/bin/env node

"use strict";

const path = require("node:path");
const {
  calculateFingerprint,
  discoverSkills,
  readRegistryCache,
  writeRegistryCache,
} = require("../lib/skill-registry.js");
const { readBaselineState } = require("../lib/ospec-state.js");
const {
  ARTIFACT_STORE_RELATIVE_PATHS,
  createArtifactStoreFromConfig,
} = require("../lib/artifact-store.js");

const CACHE_VERSION = 1;
const CACHE_RELATIVE_PATH = ARTIFACT_STORE_RELATIVE_PATHS.cache;

function buildBaselineHint(baselineState) {
  if (!baselineState) {
    return null;
  }

  const { status, domains_pending, stale_domains } = baselineState;

  if (status === "pending") {
    return "Baseline not started. Run /sdd-baseline to seed openspec/specs/.";
  }

  if (status === "partial") {
    const count = domains_pending.length;
    return `Baseline partial: ${count} domain(s) pending. Run /sdd-baseline to resume.`;
  }

  if (stale_domains.length > 0) {
    const list = stale_domains.join(", ");
    return `Baseline done but ${stale_domains.length} domain(s) stale: ${list}. Run /sdd-baseline refresh to update.`;
  }

  return null;
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
  mode,
  now = () => new Date(),
} = {}) {
  const workspace = resolveWorkspace(input, fallbackCwd);
  const store = await createArtifactStoreFromConfig({ mode, workspace });
  const cachePath = store.cachePath();
  const ospecDetected = await store.isInitialized();

  if (!ospecDetected) {
    return {
      status: "ok",
      ospecDetected: false,
      registry: {
        status: "skipped",
        path: store.cacheRelativePath,
      },
    };
  }

  let baselineHint = null;
  try {
    const configContent = await store.readConfig();
    if (configContent !== null) {
      baselineHint = buildBaselineHint(readBaselineState(configContent));
    }
  } catch {
    // Baseline state read failure must not break session start
  }

  const registry = await discoverSkills(pluginRoot);
  const fingerprint = await calculateFingerprint(registry.fingerprintPaths);
  const currentCache = await readRegistryCache(cachePath);

  const registryResult = {
    status: "fresh",
    path: store.cacheRelativePath,
  };

  if (
    currentCache?.version === CACHE_VERSION &&
    currentCache.fingerprint === fingerprint
  ) {
    const result = { status: "ok", ospecDetected: true, registry: registryResult };
    if (baselineHint !== null) {
      result.baseline = { hint: baselineHint };
    }
    return result;
  }

  await writeRegistryCache(cachePath, {
    version: CACHE_VERSION,
    fingerprint,
    generated_at: now().toISOString(),
    skills: registry.skills,
  });

  const result = { status: "ok", ospecDetected: true, registry: registryResult };
  if (baselineHint !== null) {
    result.baseline = { hint: baselineHint };
  }
  return result;
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
