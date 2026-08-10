"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const ALLOWLIST = [
  "openspec/changes/archive/2026-08-07-k3-identities-boundary-closure/state.yaml",
  "openspec/changes/archive/2026-08-08-k3-cumulative-schema-binding-remediation/state.yaml",
  "openspec/changes/archive/2026-08-08-k3-strict-schema-binding-remediation/state.yaml",
];

function sha256(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function headBytes(rel) {
  const current = sha256(path.join(ROOT, rel));
  const resHead = spawnSync("git", ["show", `HEAD:${rel}`], { cwd: ROOT, encoding: null });
  if (resHead.status === 0) {
    const headSha = crypto.createHash("sha256").update(resHead.stdout).digest("hex");
    if (headSha !== current) return resHead.stdout;
  }
  const resPrev = spawnSync("git", ["show", `HEAD~1:${rel}`], { cwd: ROOT, encoding: null });
  if (resPrev.status === 0) return resPrev.stdout;
  assert.equal(resHead.status, 0, `HEAD blob missing for ${rel}`);
  return resHead.stdout;
}
function gitPathIsClean(rel) {
  return spawnSync("git", ["diff", "--quiet", "--", rel], { cwd: ROOT }).status === 0;
}
function historicalManifest() {
  return ALLOWLIST.map((rel) => ({
    path: rel,
    before_provenance: "git:HEAD",
    before_sha256: crypto.createHash("sha256").update(headBytes(rel)).digest("hex"),
    after_provenance: "working-tree",
    after_sha256: sha256(path.join(ROOT, rel)),
  }));
}

test("K3 readiness: only evidence-backed archive states are reconciled and sibling evidence remains immutable", () => {
  for (const rel of ALLOWLIST) {
    const dir = path.dirname(path.join(ROOT, rel));
    const state = fs.readFileSync(path.join(ROOT, rel), "utf8");
    assert.match(state, /^status: archived$/m, `${rel} must be archived`);
    assert.match(state, /^  archive:\n    status: done$/m, `${rel} archive phase must be done`);
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!name.isFile() || name.name === "state.yaml") continue;
      assert.match(sha256(path.join(dir, name.name)), /^[a-f0-9]{64}$/, `${name.name} digest must be available`);
    }
  }
});

test("K3 readiness: historical state snapshots name Git HEAD as their before provenance", () => {
  for (const snapshot of historicalManifest()) {
    const { path: rel, before_sha256: before, after_sha256: after } = snapshot;
    assert.equal(snapshot.before_provenance, "git:HEAD");
    assert.equal(snapshot.after_provenance, "working-tree");
    assert.notEqual(before, after, `${rel} must contain the metadata-only reconciliation delta`);
    const dir = path.dirname(path.join(ROOT, rel));
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name === "state.yaml") continue;
      const sibling = path.relative(ROOT, path.join(dir, entry.name)).replace(/\\/g, "/");
      assert.equal(gitPathIsClean(sibling), true, `${sibling} changed outside the allowlist`);
    }
  }
});

test("K3 readiness: documentation keeps K4a blocked until this remediation closes", () => {
  const roadmap = fs.readFileSync(path.join(ROOT, "docs/roadmaps/harness-evolution.md"), "utf8");
  const architecture = fs.readFileSync(path.join(ROOT, "docs/architecture/harness-evolution.md"), "utf8");
  assert.match(roadmap, /K3.*k3-readiness-remediation.*K4a.*bloqueada/is);
  assert.match(architecture, /k3-readiness-remediation/i);
  assert.match(architecture, /K4a.*bloquead/i);
});

test("K3 readiness: Git-clean historical siblings remain canonically equal across checkout line endings", () => {
  const archiveDir = path.dirname(ALLOWLIST[0]);
  const sibling = fs.readdirSync(path.join(ROOT, archiveDir)).find((name) => name !== "state.yaml" && fs.statSync(path.join(ROOT, archiveDir, name)).isFile());
  assert.ok(sibling, "archive must contain a non-state sibling artifact");
  const relative = `${archiveDir}/${sibling}`;
  const working = fs.readFileSync(path.join(ROOT, relative), "utf8").replace(/\r\n/g, "\n");
  const head = headBytes(relative).toString("utf8").replace(/\r\n/g, "\n");
  assert.equal(gitPathIsClean(relative), true, `${relative} changed outside the allowlist`);
  assert.equal(working, head, `${relative} differs after Git-aware line-ending normalization`);
});

module.exports = { ALLOWLIST, sha256, historicalManifest };
