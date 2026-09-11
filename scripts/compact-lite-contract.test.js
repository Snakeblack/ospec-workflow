"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure } = require("./configure/cli.js");
const { parseRoutingTable } = require("./lib/route-dispatcher.js");
const { validatePhaseTransition } = require("./lib/flow-validator.js");

const ROOT = path.resolve(__dirname, "..");
const TARGETS = ["claude", "vscode", "github-copilot", "opencode", "codex", "cursor"];

function tmpOut(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-compact-lite-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function readTree(root, relative = "") {
  const directory = path.join(root, relative);
  if (!fs.existsSync(directory)) {
    return "";
  }

  return fs.readdirSync(directory, { withFileTypes: true })
    .map((entry) => {
      const child = relative ? path.join(relative, entry.name) : entry.name;
      return entry.isDirectory()
        ? readTree(root, child)
        : fs.readFileSync(path.join(root, child), "utf8");
    })
    .join("\n");
}

function assertLiteConsumerContract(text, label) {
  assert.match(text, /state\.yaml\.route\.actual_route/, `${label} must resolve the persisted route`);
  for (const artifact of ["proposal-lite.md", "tasks.md", "apply-progress.md", "verify-report.md"]) {
    assert.match(text, new RegExp(artifact.replace(".", "\\.")), `${label} must retain ${artifact}`);
  }
  const unconditionalStandardRead = text.split(/\r?\n/).find((line) =>
    /lite[^\n]*(?:requires|require)[^\n]*proposal, change-local specs, and design/i.test(line) &&
    !/standard(?: also)? requires/i.test(line),
  );
  assert.equal(
    unconditionalStandardRead,
    undefined,
    `${label} must not require standard planning artifacts for lite`,
  );
}

test("compact lite source contract has stable producers, independent verify, and no filler", () => {
  const source = [
    "skills/sdd-propose/SKILL.md",
    "skills/sdd-tasks/SKILL.md",
    "skills/sdd-apply/SKILL.md",
    "skills/sdd-verify/SKILL.md",
    "skills/sdd-archive/SKILL.md",
  ].map((relative) => fs.readFileSync(path.join(ROOT, relative), "utf8")).join("\n");

  assert.match(source, /AC-1:/, "lite proposal must create stable acceptance labels");
  assert.match(source, /proposal-lite\.md/, "lite contract must be represented once");
  assert.match(source, /verify-report\.md/, "archive must retain independent verification evidence");
  assert.doesNotMatch(source, /create empty spec\/design/i, "lite contract must not use filler artifacts");
});

test("compact lite generator parity holds across six targets and rejects an unconditional standard read", (t) => {
  const sourceConfig = fs.readFileSync(path.join(ROOT, "openspec", "config.yaml"), "utf8");
  const lite = parseRoutingTable(sourceConfig).find((route) => route.name === "lite");
  assert.deepEqual(lite.phases, ["sdd-propose", "sdd-tasks", "sdd-apply", "sdd-verify", "sdd-archive"]);

  for (const target of TARGETS) {
    const outDir = tmpOut(t);
    const result = runConfigure({ sourceDir: ROOT, target, outDir, validate: false });
    assert.ok(result.files.length > 0, `${target} must generate files`);
    assertLiteConsumerContract(readTree(outDir), target);
  }

  assert.throws(
    () => assertLiteConsumerContract(
      "state.yaml.route.actual_route proposal-lite.md tasks.md apply-progress.md verify-report.md lite requires proposal, change-local specs, and design",
      "broken target",
    ),
    /must not require standard planning artifacts/,
  );
});

test("compact lite compatibility does not weaken standard predecessor validation", () => {
  const standard = ["sdd-propose", "sdd-spec", "sdd-design", "sdd-tasks", "sdd-apply", "sdd-verify", "sdd-archive"];
  const standardResult = validatePhaseTransition("sdd-tasks", standard, {
    "proposal.md": true,
    specs: true,
    "design.md": false,
  }, { routeName: "standard" });
  assert.equal(standardResult.allowed, false);

  const liteResult = validatePhaseTransition("sdd-tasks", ["sdd-propose", "sdd-tasks", "sdd-apply", "sdd-verify", "sdd-archive"], {
    "proposal-lite.md": true,
    "design.md": false,
    specs: false,
  }, { routeName: "lite" });
  assert.equal(liteResult.allowed, true);
});
