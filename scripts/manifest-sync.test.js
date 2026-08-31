"use strict";

// The repo ships two plugin manifests on purpose:
//   - .plugin.json                 canonical, read by VS Code / direct-load
//   - .claude-plugin/plugin.json   compatibility copy, read by the Claude
//                                  distribution and the generator (cli.js source)
// They MUST describe the same plugin (same name, version, component wiring) or a
// consumer loads stale metadata. Nothing derives one from the other, so this test
// is the contract that keeps them from drifting. If you change one, change both.
//
// The published release version is whatever .claude-plugin/plugin.json carries at
// tag time (publish-marketplace.yml reads it via cli.js). A release bump that
// touches package.json but not the manifests therefore ships a STALE plugin
// version while every cross-manifest check still passes. That actually happened
// for 2.4.8: package.json was bumped first, the manifests lagged at 2.4.7, and
// the release branch was published as 2.4.7. So this test also pins package.json
// and openspec/config.yaml to the manifest version: a partial bump now fails CI
// before a release can ship.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const CANONICAL = path.join(ROOT, ".plugin.json");
const CLAUDE_COPY = path.join(ROOT, ".claude-plugin", "plugin.json");
const PACKAGE_JSON = path.join(ROOT, "package.json");
const OPENSPEC_CONFIG = path.join(ROOT, "openspec", "config.yaml");
const CHANGELOG = path.join(ROOT, "CHANGELOG.md");
const ROADMAP = path.join(ROOT, "docs", "roadmaps", "harness-evolution.md");
const ARCHITECTURE = path.join(ROOT, "docs", "architecture", "harness-evolution.md");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("the canonical and Claude manifests stay in sync", () => {
  const canonical = readJson(CANONICAL);
  const claudeCopy = readJson(CLAUDE_COPY);

  assert.deepEqual(
    claudeCopy,
    canonical,
    ".claude-plugin/plugin.json must mirror the canonical .plugin.json (bump both together)",
  );
});

test("package.json version matches the plugin manifest version", () => {
  const manifestVersion = readJson(CANONICAL).version;
  const packageVersion = readJson(PACKAGE_JSON).version;

  assert.equal(
    packageVersion,
    manifestVersion,
    "package.json version must match .plugin.json (a release bump must update both, or the published plugin ships a stale version)",
  );
});

test("openspec/config.yaml version matches the plugin manifest version", () => {
  const manifestVersion = readJson(CANONICAL).version;
  const configText = fs.readFileSync(OPENSPEC_CONFIG, "utf8");
  const match = configText.match(/^\s*version:\s*(\S+)\s*$/m);

  assert.ok(match, "openspec/config.yaml must declare a project version");
  assert.equal(
    match[1],
    manifestVersion,
    "openspec/config.yaml version must match .plugin.json (bump both together)",
  );
});

test("release version matches changelog, roadmap, architecture, verify report, and tag", () => {
  const packageVersion = readJson(PACKAGE_JSON).version;
  const changelogText = fs.readFileSync(CHANGELOG, "utf8");
  const roadmapText = fs.readFileSync(ROADMAP, "utf8");
  const architectureText = fs.readFileSync(ARCHITECTURE, "utf8");
  const latestRelease = changelogText.match(/^## \[(\d+\.\d+\.\d+)\].*$/m);
  assert.ok(latestRelease, "CHANGELOG.md must start with a semantic release section");
  assert.equal(latestRelease[1], packageVersion, "latest changelog release must match package.json");

  const nextReleaseOffset = changelogText.indexOf("\n## [", latestRelease.index + latestRelease[0].length);
  const latestSection = changelogText.slice(
    latestRelease.index,
    nextReleaseOffset === -1 ? changelogText.length : nextReleaseOffset
  );
  const archiveMatch = latestSection.match(/`(openspec\/changes\/archive\/[^`/]+)\/`/);
  assert.ok(archiveMatch, "latest changelog release must reference its archived change");
  const verifyReport = fs.readFileSync(
    path.join(ROOT, ...archiveMatch[1].split("/"), "verify-report.md"),
    "utf8"
  );
  const reportVersion = verifyReport.match(/^\*\*Version\*\*:\s*(\d+\.\d+\.\d+)\s*$/m);
  assert.ok(reportVersion, "release verify-report must declare Version");

  const roadmapVersion = roadmapText.match(/^> \*\*Versión de referencia:\*\* v(\d+\.\d+\.\d+),/m);
  const architectureVersion = architectureText.match(/^> \*\*Corte documental:\*\* v(\d+\.\d+\.\d+),/m);
  assert.ok(roadmapVersion, "roadmap must declare its reference version");
  assert.ok(architectureVersion, "architecture must declare its document version");
  assert.equal(reportVersion[1], packageVersion, "release verify-report version must match package.json");
  assert.equal(roadmapVersion[1], packageVersion, "roadmap reference must match package.json");
  assert.equal(architectureVersion[1], packageVersion, "architecture cut must match package.json");

  if (process.env.GITHUB_REF_TYPE === "tag") {
    assert.equal(process.env.GITHUB_REF_NAME, `v${packageVersion}`, "published tag must match package.json");
  }
});

test("canonical specs in openspec/specs/**/spec.md contain valid content and no undefined tokens", () => {
  const specsDir = path.join(ROOT, "openspec", "specs");
  const domains = fs.readdirSync(specsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  assert.ok(domains.length > 0, "openspec/specs must contain domain directories");

  for (const domain of domains) {
    const specPath = path.join(specsDir, domain, "spec.md");
    if (!fs.existsSync(specPath)) continue;

    const content = fs.readFileSync(specPath, "utf8");

    assert.equal(
      /^\s*undefined\s*$/m.test(content),
      false,
      `canonical spec ${domain}/spec.md must not contain literal undefined tokens`,
    );

    assert.equal(
      /\[object Object\]/.test(content),
      false,
      `canonical spec ${domain}/spec.md must not contain serialized [object Object] tokens`,
    );

    assert.ok(
      content.trim().length > 0,
      `canonical spec ${domain}/spec.md must not be empty`,
    );
  }

  // Explicit check for adversarial-challenges REQs restoration
  const advSpec = fs.readFileSync(path.join(specsDir, "adversarial-challenges", "spec.md"), "utf8");
  for (const req of [
    "REQ-adversarial-challenges-001",
    "REQ-adversarial-challenges-002",
    "REQ-adversarial-challenges-003",
    "REQ-adversarial-challenges-004",
  ]) {
    assert.ok(
      advSpec.includes(`{#${req}}`),
      `canonical adversarial-challenges spec must retain ${req}`,
    );
  }
});



