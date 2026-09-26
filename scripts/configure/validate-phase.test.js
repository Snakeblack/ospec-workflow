"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { main, resolveRoots } = require("../validate-phase.js");

const ROOT = path.resolve(__dirname, "../..");
const VALIDATE_SCRIPT = path.join(ROOT, "scripts", "configure", "validate-phase.js");

const MINIMAL_ROUTING_CONFIG = `routing:
  - name: standard
    classification: [normal, large]
    phases: [sdd-propose, sdd-spec, sdd-design, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]
  - name: lite
    classification: [small]
    phases: [sdd-propose, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]
`;

function captureMain(argv, options) {
  let code = 0;
  const logs = [];
  const errors = [];
  main(argv, {
    ...options,
    log: (msg) => logs.push(String(msg)),
    error: (msg) => errors.push(String(msg)),
    exit: (c) => {
      code = c;
      return c;
    },
  });
  return { code, logs, errors };
}

function writeProjectChange(projectRoot, changeName, { design = true, state = null } = {}) {
  const changeDir = path.join(projectRoot, "openspec", "changes", changeName);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "openspec"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "openspec", "config.yaml"), MINIMAL_ROUTING_CONFIG);
  if (design) fs.writeFileSync(path.join(changeDir, "design.md"), "Design details");
  if (state) fs.writeFileSync(path.join(changeDir, "state.yaml"), state);
  return changeDir;
}

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

test("validate-phase: resolveRoots splits plugin vs project (cwd / --workspace / OSPEC_PROJECT_ROOT) [REQ-install-027]", () => {
  const pluginScripts = path.join(os.tmpdir(), "ospec-plugin-scripts-sentinel");
  const { pluginRoot, projectRoot } = resolveRoots({
    argv: ["sdd-tasks", "standard", "x", "--workspace", "D:/consumer-project"],
    cwd: "D:/other",
    env: { OSPEC_PROJECT_ROOT: "D:/env-project" },
    scriptDir: pluginScripts,
  });
  assert.equal(pluginRoot, path.resolve(pluginScripts, ".."));
  assert.equal(projectRoot, path.resolve("D:/consumer-project"));

  const fromEnv = resolveRoots({
    argv: ["sdd-tasks", "standard", "x"],
    cwd: "D:/cwd-project",
    env: { OSPEC_PROJECT_ROOT: "D:/env-project" },
    scriptDir: pluginScripts,
  });
  assert.equal(fromEnv.projectRoot, path.resolve("D:/env-project"));
});

test("validate-phase: global Claude layout reads project openspec not plugin [REQ-install-027]", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vp-claude-"));
  const pluginRoot = path.join(root, "claude-global", "ospec-workflow");
  const projectRoot = path.join(root, "consumer-project");
  fs.mkdirSync(path.join(pluginRoot, "scripts"), { recursive: true });
  // Decoy openspec under plugin — must NOT be used when project has its own.
  fs.mkdirSync(path.join(pluginRoot, "openspec"), { recursive: true });
  fs.writeFileSync(
    path.join(pluginRoot, "openspec", "config.yaml"),
    "routing:\n  - name: decoy\n    phases: []\n",
  );
  const changeName = "claude-global-change";
  writeProjectChange(projectRoot, changeName);

  const result = captureMain(["sdd-tasks", "standard", changeName], {
    cwd: projectRoot,
    scriptDir: path.join(pluginRoot, "scripts"),
    env: {},
  });
  assert.equal(result.code, 0, result.errors.join("\n"));
  assert.match(result.logs.join("\n"), /\[OK\]/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("validate-phase: global Cursor layout keeps the same root split [REQ-install-027]", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vp-cursor-"));
  const pluginRoot = path.join(root, ".cursor", "plugins", "ospec-workflow");
  const projectRoot = path.join(root, "workspace-app");
  fs.mkdirSync(path.join(pluginRoot, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, "openspec"), { recursive: true });
  fs.writeFileSync(
    path.join(pluginRoot, "openspec", "config.yaml"),
    "routing:\n  - name: cursor-decoy\n    phases: []\n",
  );
  const changeName = "cursor-global-change";
  writeProjectChange(projectRoot, changeName);

  const result = captureMain(["sdd-tasks", "standard", changeName], {
    cwd: projectRoot,
    scriptDir: path.join(pluginRoot, "scripts"),
    env: {},
  });
  assert.equal(result.code, 0, result.errors.join("\n"));
  assert.match(result.logs.join("\n"), /\[OK\]/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("validate-phase: collapsed global openspec (only under plugin) fails closed [REQ-install-027]", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vp-collapsed-"));
  const pluginRoot = path.join(root, "plugin-install");
  const projectRoot = path.join(root, "bare-project");
  fs.mkdirSync(path.join(pluginRoot, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, "openspec"), { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, "openspec", "config.yaml"), MINIMAL_ROUTING_CONFIG);
  fs.mkdirSync(projectRoot, { recursive: true });

  const result = captureMain(["sdd-tasks", "standard", "missing-change"], {
    cwd: projectRoot,
    scriptDir: path.join(pluginRoot, "scripts"),
    env: {},
  });
  assert.equal(result.code, 1);
  assert.match(result.errors.join("\n"), /Raíces colapsadas|openspec\/ del proyecto/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("validate-phase: policy-bound route section without actual_route fails closed [REQ-routing-016]", () => {
  const changeName = `test-missing-actual-${Date.now()}`;
  const changeDir = path.join(ROOT, "openspec", "changes", changeName);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, "design.md"), "Design");
  fs.writeFileSync(
    path.join(changeDir, "state.yaml"),
    ["change: test-missing-actual", "route:", "  intended_route: standard"].join("\n"),
  );

  try {
    assert.throws(
      () => execSync(`node "${VALIDATE_SCRIPT}" sdd-tasks standard ${changeName}`, { stdio: "pipe" }),
      (error) =>
        error.status === 1 && /missing_actual_route|sin actual_route/.test(error.stderr.toString()),
    );
  } finally {
    fs.rmSync(changeDir, { recursive: true, force: true });
  }
});

test("validate-phase: in-repo coincident roots still pass [REQ-install-027]", () => {
  const changeName = `test-inrepo-${Date.now()}`;
  const changeDir = path.join(ROOT, "openspec", "changes", changeName);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, "design.md"), "Design details");
  try {
    const result = execSync(`node "${VALIDATE_SCRIPT}" sdd-tasks standard ${changeName}`).toString();
    assert.match(result, /\[OK\]/);
  } finally {
    fs.rmSync(changeDir, { recursive: true, force: true });
  }
});

test("validate-phase: independent Node process with foreign cwd proves root separation [REQ-install-027]", () => {
  const { spawnSync } = require("node:child_process");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vp-foreign-cwd-"));
  const projectRoot = path.join(root, "consumer-without-script");
  const pluginScript = path.join(ROOT, "scripts", "validate-phase.js");
  const pluginRoot = path.resolve(path.dirname(pluginScript), "..");

  const changeName = "foreign-cwd-change";
  writeProjectChange(projectRoot, changeName);
  assert.ok(
    !fs.existsSync(path.join(projectRoot, "scripts", "validate-phase.js")),
    "consumer project must not contain validate-phase.js",
  );
  assert.ok(fs.existsSync(pluginScript), "plugin install path must contain validate-phase.js");
  assert.notEqual(path.resolve(pluginRoot), path.resolve(projectRoot));

  const result = spawnSync(
    process.execPath,
    [pluginScript, "sdd-tasks", "standard", changeName, "--workspace", projectRoot],
    { cwd: projectRoot, encoding: "utf8", env: { ...process.env } },
  );
  assert.equal(result.status, 0, `stderr=${result.stderr}\nstdout=${result.stdout}`);
  assert.match(result.stdout, /\[OK\]/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("validate-phase: readPersistedRouteInfo ignores actual_route outside route block [REQ-routing-016]", () => {
  const { readPersistedRouteInfo } = require("../validate-phase.js");
  const { extractStateRouteInfo } = require("../route-dispatch-run.js");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vp-route-parse-"));
  const changeDir = path.join(root, "change");
  fs.mkdirSync(changeDir, { recursive: true });

  const outOfBlock = [
    "change: out-of-block",
    "actual_route: standard",
    "status: planning",
  ].join("\n");
  fs.writeFileSync(path.join(changeDir, "state.yaml"), outOfBlock);
  const fromValidate = readPersistedRouteInfo(changeDir);
  const fromDispatch = extractStateRouteInfo(outOfBlock);
  assert.equal(fromValidate.persistedRoute, null);
  assert.equal(fromValidate.routeSectionPresent, false);
  assert.equal(fromDispatch.persistedRoute, null);
  assert.equal(fromDispatch.routeSectionPresent, false);

  const underRoute = [
    "change: under-route",
    "route:",
    "  actual_route: lite",
  ].join("\n");
  fs.writeFileSync(path.join(changeDir, "state.yaml"), underRoute);
  const underV = readPersistedRouteInfo(changeDir);
  const underD = extractStateRouteInfo(underRoute);
  assert.equal(underV.persistedRoute, "lite");
  assert.equal(underD.persistedRoute, "lite");
  assert.equal(underV.routeSectionPresent, true);
  assert.equal(underD.routeSectionPresent, true);

  const legacyNoRoute = ["change: legacy", "status: planning"].join("\n");
  fs.writeFileSync(path.join(changeDir, "state.yaml"), legacyNoRoute);
  const legacyV = readPersistedRouteInfo(changeDir);
  const legacyD = extractStateRouteInfo(legacyNoRoute);
  assert.equal(legacyV.routeSectionPresent, false);
  assert.equal(legacyD.routeSectionPresent, false);
  assert.equal(legacyV.persistedRoute, null);
  assert.equal(legacyD.persistedRoute, null);

  fs.rmSync(root, { recursive: true, force: true });
});
