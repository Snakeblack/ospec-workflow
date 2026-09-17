"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure } = require("./cli.js");
const { validateVsCodeTarget } = require("./validate-vscode.js");

const SOURCE = path.join(__dirname, "__fixtures__", "source");

function tmpOut(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-vscode-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("validate accepts generated vscode output", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "vscode", outDir: out, validate: false });

  const result = validateVsCodeTarget(out);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("INSTALL-026: attribution sentinels fail closed on a stale build", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "vscode", outDir: out, validate: false });
  const dimensions = path.join(out, "scripts/lib/review-dimensions.js");
  fs.writeFileSync(dimensions, fs.readFileSync(dimensions, "utf8").split("kernel-contract-change").join("STALE-SENTINEL"));

  const result = validateVsCodeTarget(out);

  assert.ok(result.errors.some((error) => error.includes("attribution sentinel stale in scripts/lib/review-dimensions.js: missing kernel-contract-change")));
});

test("INSTALL-026: attribution sentinels fail closed on an unmapped kernel tool reference", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "vscode", outDir: out, validate: false });
  fs.rmSync(path.join(out, "scripts/lib/review-gate-state.js"));

  const result = validateVsCodeTarget(out);

  assert.ok(result.errors.some((error) => error.includes("attribution sentinel missing (unmapped kernel tool reference): scripts/lib/review-gate-state.js")));
});
