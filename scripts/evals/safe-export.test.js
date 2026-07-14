"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  buildSafeExportManifest,
  buildSafePrompt,
  materializeSafeExport,
  validateExportWorkspace,
  validateSafePayload,
  verifySafeExportFile,
  assertSyntheticGitOutcome,
} = require("./safe-export.js");

test("safe prompt treats native O1 as supplementary and lite does not force 4R", () => {
  const prompt = buildSafePrompt("docs-one-file");
  assert.match(prompt, /Reemplaza exactamente la única línea `Old wording\.` por `Updated wording\.`/);
  assert.match(prompt, /preserva el heading y no modifiques ningún otro archivo de producto/);
  assert.match(prompt, /must not create, edit, append, or repair .*phase-costs\.jsonl/i);
  assert.match(prompt, /run-level.*turn\.completed\.usage/i);
  assert.doesNotMatch(prompt, /post-exit weighted estimate/i);
  assert.doesNotMatch(prompt, /configured review gate/i);
  assert.doesNotMatch(prompt, /Emit hook telemetry/i);
  assert.match(prompt, /MUST NOT modify .*benchmark\.pending\.json/i);
});

test("fixture contracts match route artifacts and product files", () => {
  const lite = buildSafeExportManifest("docs-one-file").benchmark_contract;
  assert.equal(lite.expected_reviews, 0);
  assert.equal(lite.expected_artifacts.some((file) => file.endsWith("4r-review-report.md")), false);

  const standard = buildSafeExportManifest("security-sensitive-change").benchmark_contract;
  assert.equal(standard.expected_reviews, 4);
  assert.ok(standard.expected_artifacts.some((file) => file.includes("/specs/") && file.endsWith("spec.md")));
  assert.ok(standard.expected_artifacts.some((file) => file.endsWith("design.md")));

  const feature = buildSafeExportManifest("small-feature");
  assert.ok(feature.files.some((file) => file.path === "src/slug.js"));
  assert.deepEqual(feature.benchmark_contract.product_files, ["src/slug.js"]);
});

test("route artifacts are derived exactly from declared phases", () => {
  const bugfix = buildSafeExportManifest("small-bugfix").benchmark_contract;
  assert.deepEqual(bugfix.expected_phases, ["explore", "tasks", "apply", "verify"]);
  assert.ok(bugfix.expected_artifacts.some((file) => file.endsWith("exploration.md")));
  assert.equal(bugfix.expected_artifacts.some((file) => /proposal(?:-lite)?\.md$/.test(file)), false);

  const refactor = buildSafeExportManifest("behavior-preserving-refactor").benchmark_contract;
  assert.deepEqual(refactor.expected_phases, ["design", "tasks", "apply", "verify"]);
  assert.ok(refactor.expected_artifacts.some((file) => file.endsWith("design.md")));
  assert.equal(refactor.expected_artifacts.some((file) => /proposal(?:-lite)?\.md$/.test(file)), false);

  const standard = buildSafeExportManifest("security-sensitive-change");
  assert.equal(standard.benchmark_contract.spec_domain, "benchmark");
  assert.ok(standard.benchmark_contract.expected_artifacts.some((file) => file.endsWith("/specs/benchmark/spec.md")));
  assert.match(standard.prompt.text, /spec domain.*benchmark/i);
});

test("safe export manifest contains only synthetic allowlisted files and deterministic hashes", () => {
  const first = buildSafeExportManifest("docs-one-file");
  const second = buildSafeExportManifest("docs-one-file");
  assert.deepEqual(first, second);
  assert.deepEqual(first.files.map((entry) => entry.path), [".eval-capture/benchmark.pending.json", "README.md", "openspec/config.yaml", "package.json", "scripts/configure/validate-phase.js", "scripts/lib/route-dispatcher.js"]);
  for (const entry of first.files) {
    assert.equal(path.isAbsolute(entry.path), false);
    assert.doesNotMatch(entry.path, /(^|\/)\.git(\/|$)|\.\./);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
  }
  assert.match(first.prompt.sha256, /^[a-f0-9]{64}$/);
  assert.equal(first.safety.source, "embedded-synthetic-catalog");
  assert.equal(first.benchmark_contract.expected_assumptions, 0);
  assert.deepEqual(first.benchmark_contract.allowed_host_assumptions, []);
  const reviewed = buildSafeExportManifest("security-sensitive-change");
  assert.deepEqual(reviewed.benchmark_contract.allowed_host_assumptions.map(({ code, phase, max }) => ({ code, phase, max })), [{ code: "dispatch-identity-unavailable", phase: "4r-review-gate", max: 1 }]);
  assert.match(reviewed.benchmark_contract.allowed_host_assumptions[0].basis_sha256, /^[a-f0-9]{64}$/);
  assert.equal(first.git.synthetic_git, true);
  assert.equal(first.git.initialized, false);
});

test("materialized export is outside checkout and rejects extra files or symlinks", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-safe-export-test-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const exported = materializeSafeExport("docs-one-file", { tempRoot });
  assert.equal(path.resolve(exported.workspaceRoot).startsWith(path.resolve(__dirname)), false);
  assert.doesNotThrow(() => validateExportWorkspace(exported.workspaceRoot, exported.manifest));
  assert.match(exported.manifest.git.initial_commit, /^[a-f0-9]{40}$/);
  assert.equal(spawnSync("git", ["status", "--porcelain"], { cwd: exported.workspaceRoot, encoding: "utf8", shell: false }).stdout, "");
  const phaseOk = spawnSync(process.execPath, [path.join(exported.workspaceRoot, "scripts", "configure", "validate-phase.js"), "sdd-propose", "lite", "update-readme"], { cwd: exported.workspaceRoot, encoding: "utf8" });
  assert.equal(phaseOk.status, 0, phaseOk.stderr);
  const phaseBad = spawnSync(process.execPath, [path.join(exported.workspaceRoot, "scripts", "configure", "validate-phase.js"), "sdd-spec", "lite", "update-readme"], { cwd: exported.workspaceRoot, encoding: "utf8" });
  assert.equal(phaseBad.status, 1);
  fs.writeFileSync(path.join(exported.workspaceRoot, "README.md"), "changed\n");
  assert.deepEqual(assertSyntheticGitOutcome(exported.workspaceRoot, exported.manifest.git, ["README.md"]).product_diff, ["README.md"]);
  fs.writeFileSync(path.join(exported.workspaceRoot, "package.json"), "{}\n");
  assert.throws(() => assertSyntheticGitOutcome(exported.workspaceRoot, exported.manifest.git, ["README.md"]), /product diff mismatch/i);
  fs.writeFileSync(path.join(exported.workspaceRoot, "package.json"), buildSafeExportManifest("docs-one-file").files.find((entry) => entry.path === "package.json") ? JSON.stringify({ name: "isolated-benchmark-docs-one-file", version: "1.0.0", private: true, scripts: { test: "node --test" } }) + "\n" : "");
  assert.doesNotThrow(() => verifySafeExportFile(exported.workspaceRoot, exported.manifest, ".eval-capture/benchmark.pending.json"));
  fs.writeFileSync(path.join(exported.workspaceRoot, ".eval-capture", "benchmark.pending.json"), "tampered\n");
  assert.throws(() => verifySafeExportFile(exported.workspaceRoot, exported.manifest, ".eval-capture/benchmark.pending.json"), /content mismatch/i);
  const pending = buildSafeExportManifest("docs-one-file").files.find((entry) => entry.path === ".eval-capture/benchmark.pending.json");
  assert.ok(pending);
  fs.rmSync(path.join(exported.workspaceRoot, ".eval-capture", "benchmark.pending.json"));
  const pristine = JSON.stringify({ schema: "ospec-benchmark-pending/v1", profile: "docs-one-file", owner: "live-driver", status: "awaiting-host-observation" }, null, 2) + "\n";
  fs.writeFileSync(path.join(exported.workspaceRoot, ".eval-capture", "benchmark.pending.json"), pristine);
  fs.writeFileSync(path.join(exported.workspaceRoot, "README.md"), "# Fixture docs\n\nOld wording.\n");
  fs.writeFileSync(path.join(exported.workspaceRoot, "extra.txt"), "extra\n");
  assert.throws(() => validateExportWorkspace(exported.workspaceRoot, exported.manifest), /not allowlisted/i);

  fs.rmSync(path.join(exported.workspaceRoot, "extra.txt"));
  const link = path.join(exported.workspaceRoot, "linked.txt");
  try {
    fs.symlinkSync(path.join(exported.workspaceRoot, "README.md"), link);
    assert.throws(() => validateExportWorkspace(exported.workspaceRoot, exported.manifest), /symlink|reparse/i);
  } catch (error) {
    if (error.code !== "EPERM") throw error;
  }
});

test("safe payload scanner rejects absolute paths and sensitive content", () => {
  assert.throws(() => validateSafePayload({ files: { "C:/escape.txt": "safe" }, prompt: "safe" }), /relative path/i);
  assert.throws(() => validateSafePayload({ files: { "safe.txt": "-----BEGIN PRIVATE KEY-----" }, prompt: "safe" }), /sensitive/i);
  assert.throws(() => validateSafePayload({ files: { "safe.txt": "safe" }, prompt: "read C:\\Users\\person\\repo" }), /absolute path|sensitive/i);
});

test("dry-run export manifest performs no live spawn and prints complete JSON", () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, "live-driver.js"), "--dry-run-export-manifest", "docs-one-file"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(result.stdout);
  assert.equal(manifest.profile, "docs-one-file");
  assert.equal(manifest.files.length, 6);
  assert.equal(manifest.git.initialized, false);
  assert.equal(manifest.network_used, false);
  assert.equal(manifest.spawned, false);
});
