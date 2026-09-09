"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../..");
const VALIDATE_SCRIPT = path.join(ROOT, "scripts", "configure", "validate-phase.js");

test("validate-phase CLI: exits with 0 for freeform or undefined route", () => {
  const cmd = `node "${VALIDATE_SCRIPT}" sdd-tasks freeform my-change`;
  const result = execSync(cmd).toString().trim();
  assert.equal(result, "");
});

test("validate-phase CLI: fails validation when required file is missing", () => {
  // Use standard route which expects design.md for sdd-tasks phase
  const changeName = `test-change-${Date.now()}`;
  const changeDir = path.join(ROOT, "openspec", "changes", changeName);
  fs.mkdirSync(changeDir, { recursive: true });

  try {
    const cmd = `node "${VALIDATE_SCRIPT}" sdd-tasks standard ${changeName}`;
    let threw = false;
    try {
      execSync(cmd, { stdio: "pipe" });
    } catch (e) {
      threw = true;
      assert.equal(e.status, 1);
    }
    assert.equal(threw, true, "execSync should throw error with status 1");
  } finally {
    // Clean up temporary change dir
    fs.rmSync(changeDir, { recursive: true, force: true });
  }
});

test("validate-phase CLI: passes validation when required file is present", () => {
  const changeName = `test-change-ok-${Date.now()}`;
  const changeDir = path.join(ROOT, "openspec", "changes", changeName);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, "design.md"), "Design details");

  try {
    const cmd = `node "${VALIDATE_SCRIPT}" sdd-tasks standard ${changeName}`;
    const result = execSync(cmd).toString();
    assert.match(result, /\[OK\]/);
  } finally {
    fs.rmSync(changeDir, { recursive: true, force: true });
  }
});

test("validate-phase CLI: uses the persisted lite route and rejects a conflicting launch route", () => {
  const changeName = `test-lite-route-${Date.now()}`;
  const changeDir = path.join(ROOT, "openspec", "changes", changeName);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, "proposal-lite.md"), "# Lite proposal");
  fs.writeFileSync(path.join(changeDir, "state.yaml"), [
    "change: test-lite-route",
    "route:",
    "  actual_route: lite",
  ].join("\n"));

  try {
    const valid = execSync(`node "${VALIDATE_SCRIPT}" sdd-tasks lite ${changeName}`).toString();
    assert.match(valid, /\[OK\]/);

    assert.throws(
      () => execSync(`node "${VALIDATE_SCRIPT}" sdd-tasks standard ${changeName}`, { stdio: "pipe" }),
      (error) => error.status === 1 && /no coincide con la ruta persistida/.test(error.stderr.toString()),
    );
  } finally {
    fs.rmSync(changeDir, { recursive: true, force: true });
  }
});

test("validate-phase CLI: rejects an undeclared persisted route instead of bypassing validation", () => {
  const changeName = `test-unknown-route-${Date.now()}`;
  const changeDir = path.join(ROOT, "openspec", "changes", changeName);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, "state.yaml"), [
    "change: test-unknown-route",
    "route:",
    "  actual_route: removed-route",
  ].join("\n"));

  try {
    assert.throws(
      () => execSync(`node "${VALIDATE_SCRIPT}" sdd-tasks removed-route ${changeName}`, { stdio: "pipe" }),
      (error) => error.status === 1 && /no está declarada con fases/.test(error.stderr.toString()),
    );
  } finally {
    fs.rmSync(changeDir, { recursive: true, force: true });
  }
});
