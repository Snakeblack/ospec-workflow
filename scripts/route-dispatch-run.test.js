"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execSync, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DISPATCH_SCRIPT = path.join(ROOT, "scripts", "route-dispatch-run.js");
const {
  parseArgs,
  extractStateRouteInfo,
  extractConfigDefaults,
} = require("./route-dispatch-run.js");

test("route-dispatch-run: parseArgs extracts flags and options correctly", () => {
  const flags = parseArgs([
    "my-change",
    "--classification=small",
    "--change.classification=small",
    "--persisted-route=lite",
    "--auth_security",
    "--data_migration",
    "--public_api",
    "--workspace=/tmp/ws",
    "--config=custom-config.yaml",
  ]);

  assert.equal(flags.changeName, "my-change");
  assert.equal(flags.classification, "small");
  assert.equal(flags.changeClassification, "small");
  assert.equal(flags.persistedRoute, "lite");
  assert.equal(flags.authSecurity, true);
  assert.equal(flags.dataMigration, true);
  assert.equal(flags.publicApi, true);
  assert.equal(flags.workspace, "/tmp/ws");
  assert.equal(flags.configFile, "custom-config.yaml");
});

test("route-dispatch-run: extractStateRouteInfo extracts actual_route, classification and impact", () => {
  const stateSample = `
change: sample-change
classification: small
route:
  intended_route: standard
  actual_route: lite
gates:
  quality-review-gate:
    impact:
      auth_security: true
`;
  const info = extractStateRouteInfo(stateSample);
  assert.equal(info.persistedRoute, "lite");
  assert.equal(info.classification, "small");
  assert.equal(info.impact.auth_security, true);
});

test("route-dispatch-run: extractConfigDefaults extracts project.status, baseline.status, backend", () => {
  const configSample = `
project:
  status: active
baseline:
  status: pending
artifact_store:
  backend: workspace-federated
`;
  const defaults = extractConfigDefaults(configSample);
  assert.equal(defaults["project.status"], "active");
  assert.equal(defaults["baseline.status"], "pending");
  assert.equal(defaults["artifact_store.backend"], "workspace-federated");
});

test("route-dispatch-run CLI E2E: selects lite for small on active repo", () => {
  const cmd = `node "${DISPATCH_SCRIPT}" --classification=small`;
  const output = execSync(cmd, { cwd: ROOT }).toString();
  const parsed = JSON.parse(output);

  assert.equal(parsed.status, "success");
  assert.equal(parsed.name, "lite");
  assert.equal(parsed.classification, "small");
});

test("route-dispatch-run CLI E2E: elevates small to standard on auth_security floor", () => {
  const cmd = `node "${DISPATCH_SCRIPT}" --classification=small --auth_security`;
  const output = execSync(cmd, { cwd: ROOT }).toString();
  const parsed = JSON.parse(output);

  assert.equal(parsed.status, "success");
  assert.equal(parsed.name, "standard");
  assert.equal(parsed.floor, "critical");
});

test("route-dispatch-run CLI E2E: blocks when newly discovered auth_security violates persisted lite route", () => {
  const cmd = `node "${DISPATCH_SCRIPT}" --classification=small --auth_security --persisted-route=lite`;
  let threw = false;
  try {
    execSync(cmd, { cwd: ROOT, stdio: "pipe" });
  } catch (err) {
    threw = true;
    assert.equal(err.status, 2);
    const parsed = JSON.parse(err.stdout.toString());
    assert.equal(parsed.status, "blocked");
    assert.equal(parsed.blocker_type, "needs_user_decision");
    assert.equal(parsed.name, "lite");
    assert.ok(parsed.reasons.includes("persisted_route_violation.lite"));
  }
  assert.equal(threw, true, "command must exit with status 2 on blocker");
});

test("route-dispatch-run CLI E2E: blocks when persisted route is missing from routing table", () => {
  const cmd = `node "${DISPATCH_SCRIPT}" --classification=small --persisted-route=missing-custom-route`;
  let threw = false;
  try {
    execSync(cmd, { cwd: ROOT, stdio: "pipe" });
  } catch (err) {
    threw = true;
    assert.equal(err.status, 2);
    const parsed = JSON.parse(err.stdout.toString());
    assert.equal(parsed.status, "blocked");
    assert.equal(parsed.blocker_type, "needs_user_decision");
    assert.equal(parsed.name, "missing-custom-route");
    assert.ok(parsed.reasons.includes("persisted_route_missing.missing-custom-route"));
  }
  assert.equal(threw, true, "command must exit with status 2 when persisted route is missing");
});

test("route-dispatch-run CLI E2E: fails closed on conflicting classification signals", () => {
  const cmd = `node "${DISPATCH_SCRIPT}" --classification=small --change.classification=normal`;
  let threw = false;
  try {
    execSync(cmd, { cwd: ROOT, stdio: "pipe" });
  } catch (err) {
    threw = true;
    assert.equal(err.status, 1);
    const parsed = JSON.parse(err.stderr.toString());
    assert.equal(parsed.status, "error");
    assert.equal(parsed.code, "ERR_CLASSIFICATION_CONFLICT");
  }
  assert.equal(threw, true, "command must exit with status 1 on classification conflict");
});

test("route-dispatch-run CLI E2E: reads state.yaml from active change directory", () => {
  const tempChange = `test-dispatch-${Date.now()}`;
  const changeDir = path.join(ROOT, "openspec", "changes", tempChange);
  fs.mkdirSync(changeDir, { recursive: true });

  const stateContent = `
change: ${tempChange}
classification: small
route:
  intended_route: lite
  actual_route: lite
`;
  fs.writeFileSync(path.join(changeDir, "state.yaml"), stateContent, "utf8");

  try {
    const cmd = `node "${DISPATCH_SCRIPT}" ${tempChange}`;
    const output = execSync(cmd, { cwd: ROOT }).toString();
    const parsed = JSON.parse(output);

    assert.equal(parsed.status, "success");
    assert.equal(parsed.name, "lite");
    assert.ok(parsed.reasons.includes("continuation_locked"));
  } finally {
    fs.rmSync(changeDir, { recursive: true, force: true });
  }
});

test("route-dispatch-run: extractStateRouteInfo strips quotes from classification and route", () => {
  const stateSample = `
change: sample-change
classification: "small"
route:
  actual_route: 'lite'
`;
  const info = extractStateRouteInfo(stateSample);
  assert.equal(info.classification, "small");
  assert.equal(info.persistedRoute, "lite");
});

test("route-dispatch-run: extractStateRouteInfo ignores comment lines and extracts quoted booleans", () => {
  const stateWithComments = `
change: sample-change
classification: small
# auth_security: true
impact:
  data_migration: "true"
`;
  const info = extractStateRouteInfo(stateWithComments);
  assert.equal(info.impact.auth_security, undefined);
  assert.equal(info.impact.data_migration, true);
});

test("route-dispatch-run CLI E2E: rejects path traversal in changeName", () => {
  const cmd = `node "${DISPATCH_SCRIPT}" ../outside-dir`;
  let threw = false;
  try {
    execSync(cmd, { cwd: ROOT, stdio: "pipe" });
  } catch (err) {
    threw = true;
    assert.equal(err.status, 1);
    const parsed = JSON.parse(err.stderr.toString());
    assert.match(parsed.error, /Invalid change-name/);
  }
  assert.equal(threw, true, "command must exit with status 1 on path traversal");
});

test("route-dispatch-run CLI E2E: selects bugfix via --context JSON", () => {
  const context = JSON.stringify({
    classification: "small",
    explicit_bugfix_intent: true,
  });
  const output = execFileSync(process.execPath, [DISPATCH_SCRIPT, `--context=${context}`], { cwd: ROOT }).toString();
  const parsed = JSON.parse(output);

  assert.equal(parsed.status, "success");
  assert.equal(parsed.name, "bugfix");
});

test("route-dispatch-run CLI E2E: selects refactor via --context JSON", () => {
  const context = JSON.stringify({
    classification: "small",
    explicit_refactor_intent: true,
  });
  const output = execFileSync(process.execPath, [DISPATCH_SCRIPT, `--context=${context}`], { cwd: ROOT }).toString();
  const parsed = JSON.parse(output);

  assert.equal(parsed.status, "success");
  assert.equal(parsed.name, "refactor");
});

test("route-dispatch-run CLI E2E: selects hotfix via shorthand --hotfix and --classification=small", () => {
  const cmd = `node "${DISPATCH_SCRIPT}" --classification=small --hotfix`;
  const output = execSync(cmd, { cwd: ROOT }).toString();
  const parsed = JSON.parse(output);

  assert.equal(parsed.status, "success");
  assert.equal(parsed.name, "hotfix");
});

test("route-dispatch-run CLI E2E: selects brownfield via derived signal specs_empty_with_code in --context", () => {
  const context = JSON.stringify({
    classification: "small",
    specs_empty_with_code: true,
  });
  const output = execFileSync(process.execPath, [DISPATCH_SCRIPT, `--context=${context}`], { cwd: ROOT }).toString();
  const parsed = JSON.parse(output);

  assert.equal(parsed.status, "success");
  assert.equal(parsed.name, "brownfield");
});

test("route-dispatch-run CLI E2E: selects brownfield via derived signal code_without_specs in --context", () => {
  const context = JSON.stringify({
    classification: "small",
    code_without_specs: true,
  });
  const output = execFileSync(process.execPath, [DISPATCH_SCRIPT, `--context=${context}`], { cwd: ROOT }).toString();
  const parsed = JSON.parse(output);

  assert.equal(parsed.status, "success");
  assert.equal(parsed.name, "brownfield");
});

test("route-dispatch-run CLI E2E: selects lite on new change without prior state via --context", () => {
  const tempChange = `new-unstarted-${Date.now()}`;
  const context = JSON.stringify({
    classification: "small",
  });
  const output = execFileSync(process.execPath, [DISPATCH_SCRIPT, tempChange, `--context=${context}`], { cwd: ROOT }).toString();
  const parsed = JSON.parse(output);

  assert.equal(parsed.status, "success");
  assert.equal(parsed.name, "lite");
  assert.equal(parsed.classification, "small");
});

test("route-dispatch-run CLI E2E: reads context from file via --context-file", () => {
  const tempFile = path.join(ROOT, `temp-ctx-${Date.now()}.json`);
  fs.writeFileSync(
    tempFile,
    JSON.stringify({ classification: "small", explicit_bugfix_intent: true }),
    "utf8"
  );

  try {
    const cmd = `node "${DISPATCH_SCRIPT}" --context-file="${tempFile}"`;
    const output = execSync(cmd, { cwd: ROOT }).toString();
    const parsed = JSON.parse(output);

    assert.equal(parsed.status, "success");
    assert.equal(parsed.name, "bugfix");
  } finally {
    fs.rmSync(tempFile, { force: true });
  }
});

test("route-dispatch-run CLI E2E: reads context from stdin via --context=-", () => {
  const inputJson = JSON.stringify({ classification: "small", explicit_refactor_intent: true });
  const cmd = `node "${DISPATCH_SCRIPT}" --context=-`;
  const output = execSync(cmd, { cwd: ROOT, input: inputJson }).toString();
  const parsed = JSON.parse(output);

  assert.equal(parsed.status, "success");
  assert.equal(parsed.name, "refactor");
});


