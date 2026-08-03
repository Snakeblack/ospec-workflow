"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");
const K1_BASELINE = "9aa6c453681f46941b8b34b89496b9aae89fa20c";
const FROZEN_CANDIDATE_INVENTORY =
  "openspec/changes/archive/2026-08-03-k1-contract-suite/.4r/paths.json";
const REMEDIATION_IMPLEMENTATION_PATHS = [
  "schemas/kernel/contract-claims.json",
  "schemas/kernel/graph-node/fixtures/invalid/partial-canonical-node.json",
  "schemas/kernel/graph-node/fixtures/valid/canonical-semantic-node.json",
  "schemas/kernel/receipt/fixtures/invalid/unbound-evaluation.json",
  "schemas/kernel/receipt/fixtures/valid/canonical-evaluation.json",
  "schemas/kernel/work-order/fixtures/invalid/partial-canonical-work-order.json",
  "schemas/kernel/work-order/fixtures/valid/canonical-bounded-work-order.json",
];

const ALLOWED_EXACT = new Set([
  "docs/architecture/harness-evolution.md",
  "openspec/specs/contract-lint/spec.md",
  "scripts/contract-lint.test.js",
  "scripts/lib/authority-canon.js",
  "scripts/lib/authority-canon.test.js",
  "scripts/lib/canonical-json.js",
  "scripts/lib/canonical-json.test.js",
  "scripts/lib/change-classification.js",
  "scripts/lib/change-classification.test.js",
  "scripts/lib/contract-lint.js",
  "scripts/lib/contract-lint.test.js",
  "scripts/lib/k1-scope-guard.test.js",
  "scripts/lib/kernel-aliases.js",
  "scripts/lib/kernel-aliases.test.js",
  "scripts/lib/kernel-schema-fixtures.test.js",
  "scripts/lib/kernel-schema-validator.js",
  "scripts/lib/kernel-schema-validator.test.js",
  "scripts/lib/next-transition.js",
  "scripts/lib/next-transition.test.js",
  "scripts/lib/transition-parity.js",
  "scripts/lib/transition-parity.test.js",
]);

const ALLOWED_PREFIXES = [
  "docs/adr/adr-20260803-",
  "openspec/changes/archive/2026-08-03-k1-contract-suite/",
  "openspec/specs/change-classification/",
  "openspec/specs/harness-authority-canon/",
  "openspec/specs/kernel-contract-schemas/",
  "openspec/specs/transition-surface-parity/",
  "schemas/kernel/",
  "scripts/lib/contract-checkers/k1-",
  "scripts/lib/emission-catalogs/",
];

const PROTECTED_BASELINE_PATHS = [
  "openspec/config.yaml",
  "scripts/lib/route-dispatcher.js",
  "scripts/configure/validate-phase.js",
];

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

function toPosix(relativePath) {
  return relativePath.replace(/\\/g, "/");
}

function changedPathsSinceBaseline() {
  const tracked = git([
    "diff",
    "--name-only",
    "--diff-filter=ACDMRTUXB",
    K1_BASELINE,
    "--",
  ]);
  assert.equal(tracked.status, 0, tracked.stderr);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  assert.equal(untracked.status, 0, untracked.stderr);
  return new Set(
    `${tracked.stdout}\n${untracked.stdout}`
      .split(/\r?\n/)
      .map((entry) => toPosix(entry.trim()))
      .filter(Boolean)
  );
}

function isAllowedK1Path(relativePath) {
  const normalized = toPosix(relativePath);
  if (ALLOWED_EXACT.has(normalized)) return true;
  if (ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    if (normalized.startsWith("docs/adr/adr-20260803-")) {
      return /^docs\/adr\/adr-20260803-00[1-4]-[a-z0-9-]+\.md$/.test(normalized);
    }
    return true;
  }
  return false;
}

function isImplementationPath(relativePath) {
  return (
    relativePath === "docs/architecture/harness-evolution.md" ||
    relativePath === "scripts/contract-lint.test.js" ||
    relativePath.startsWith("schemas/kernel/") ||
    relativePath.startsWith("scripts/lib/")
  );
}

function loadCandidateImplementationPaths() {
  const inventoryPath = path.join(ROOT, FROZEN_CANDIDATE_INVENTORY);
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  assert.ok(Array.isArray(inventory), `${FROZEN_CANDIDATE_INVENTORY} must contain a path array`);
  const normalized = inventory.map((entry) => {
    assert.equal(typeof entry, "string", "candidate inventory entries must be strings");
    const relativePath = toPosix(entry);
    assert.equal(path.isAbsolute(relativePath), false, `candidate path must be relative: ${relativePath}`);
    assert.equal(
      relativePath === ".." || relativePath.startsWith("../"),
      false,
      `candidate path escapes the repository: ${relativePath}`
    );
    return relativePath;
  });
  assert.equal(new Set(normalized).size, normalized.length, "candidate inventory paths must be unique");
  return new Set(
    [...normalized.filter(isImplementationPath), ...REMEDIATION_IMPLEMENTATION_PATHS].sort()
  );
}

function readChangedProductionSource(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  return fs.existsSync(absolute) && fs.statSync(absolute).isFile()
    ? fs.readFileSync(absolute, "utf8")
    : "";
}

test("K1 scope guard classifies representative in-scope and out-of-scope paths", () => {
  assert.equal(isAllowedK1Path("schemas/kernel/event/v1.schema.json"), true);
  assert.equal(isAllowedK1Path("scripts/lib/contract-checkers/k1-emission.js"), true);
  assert.equal(isAllowedK1Path("scripts/lib/lifecycle-reducer.js"), false);
  assert.equal(isAllowedK1Path("openspec/config.yaml"), false);
  assert.equal(isAllowedK1Path("docs/roadmaps/future.md"), false);
  assert.equal(isAllowedK1Path("docs/adr/adr-20260803-999-unplanned.md"), false);
});

test("K1 scope guard: the frozen candidate implementation inventory is confined to design", () => {
  const baseline = git(["cat-file", "-e", `${K1_BASELINE}^{commit}`]);
  assert.equal(baseline.status, 0, `K1 baseline commit is unavailable: ${baseline.stderr}`);

  const candidatePaths = [...loadCandidateImplementationPaths()].sort();
  assert.ok(candidatePaths.length > 0, "K1 candidate inventory must contain implementation paths");
  const outside = candidatePaths.filter((relativePath) => !isAllowedK1Path(relativePath));
  assert.deepEqual(outside, [], `K1 candidate paths outside its design allocation:\n${outside.join("\n")}`);

  const governedChanges = [...changedPathsSinceBaseline()].filter(isImplementationPath).sort();
  const unmanifested = governedChanges.filter((relativePath) => !candidatePaths.includes(relativePath));
  assert.deepEqual(
    unmanifested,
    [],
    `K1 implementation changes absent from its frozen/remediation inventory:\n${unmanifested.join("\n")}`
  );
});

test("K1 scope guard: fixed routing and phase validation remain byte-equivalent to baseline", () => {
  for (const relativePath of PROTECTED_BASELINE_PATHS) {
    if (relativePath === "openspec/config.yaml") {
      const baseline = git(["show", `${K1_BASELINE}:openspec/config.yaml`]);
      assert.equal(baseline.status, 0, "unable to read baseline openspec/config.yaml");
      const current = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
      const normalizeConfig = (text) =>
        text
          .replace(/\r\n/g, "\n")
          .replace(/^(\s*version:\s*)\S+$/m, "$1<release-version>");
      assert.equal(
        normalizeConfig(baseline.stdout),
        normalizeConfig(current),
        "openspec/config.yaml changed beyond project.version relative to the fixed K1 baseline"
      );
      continue;
    }
    const result = git(["diff", "--quiet", K1_BASELINE, "--", relativePath]);
    assert.equal(result.status, 0, `${relativePath} changed relative to the fixed K1 baseline`);
  }
});

test("K1 scope guard: changed productive modules expose contracts but no lifecycle reducer", () => {
  const candidatePaths = loadCandidateImplementationPaths();
  const changedProduction = [...changedPathsSinceBaseline()].filter(
    (relativePath) =>
      candidatePaths.has(relativePath) &&
      relativePath.startsWith("scripts/lib/") &&
      relativePath.endsWith(".js") &&
      !relativePath.endsWith(".test.js") &&
      relativePath !== "scripts/lib/contract-lint.js" &&
      !relativePath.startsWith("scripts/lib/contract-checkers/")
  );
  assert.deepEqual(
    changedProduction.filter((relativePath) => !isAllowedK1Path(relativePath)),
    [],
    "an undeclared productive runtime module was added by K1"
  );

  const forbiddenSymbols = /\b(?:reduceStatusToNextTransition|deriveNextTransitionFromStatus|nextTransitionForStatus|executeAdaptiveRoute|runLifecycleReducer|dispatchKernelTransition)\b/;
  for (const relativePath of changedProduction) {
    assert.doesNotMatch(
      readChangedProductionSource(relativePath),
      forbiddenSymbols,
      `${relativePath} must not implement or dispatch the K2 lifecycle reducer`
    );
  }
});
