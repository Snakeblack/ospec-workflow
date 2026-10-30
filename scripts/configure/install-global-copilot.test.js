"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { runConfigure } = require("./cli.js");
const { main, parseArgs } = require("./install-global-copilot.js");

const ROOT = path.resolve(__dirname, "..", "..");

test("parseArgs handles arguments cleanly", () => {
  assert.deepEqual(parseArgs(["--dry-run"]), {
    dryRun: true,
    validate: true,
    source: undefined,
    dest: undefined,
  });
  assert.deepEqual(parseArgs(["--dest", "/custom/dest"]), {
    dryRun: false,
    validate: true,
    source: undefined,
    dest: "/custom/dest",
  });
});

// --- uvx prerequisite warning (foundation document conversion) -------------

function uvxBox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "copilot-uvx-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const dest = path.join(root, "dest");
  fs.mkdirSync(path.join(source, "dist", "github-copilot"), { recursive: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(source, "package.json"), JSON.stringify({ name: "ospec-workflow", version: "1.0.0" }));
  fs.writeFileSync(
    path.join(source, "dist", "github-copilot", ".mcp.json"),
    JSON.stringify({ mcpServers: { markitdown: { command: "uvx", args: ["markitdown-mcp@0.0.1a7"] } } }),
  );
  return { source, dest };
}

function runInstall(source, dest, deps = {}) {
  return main(["--source", source, "--dest", dest], {
    runConfigure: () => ({ files: [], summary: [], exitCode: 0, validation: null }),
    copyBinaryToTree() {},
    stdout: { write() {} },
    ...deps,
  });
}

test("setup:copilot warns when the generated MCP config needs uvx and the binary is missing", (t) => {
  const { source, dest } = uvxBox(t);
  const stderr = [];
  const exitCode = runInstall(source, dest, {
    spawnSync: () => ({ error: new Error("ENOENT") }),
    stderr: { write: (chunk) => stderr.push(chunk) },
  });
  assert.equal(exitCode, 0);
  assert.match(stderr.join(""), /uvx/);
  assert.match(stderr.join(""), /docs\.astral\.sh\/uv/);
  const merged = JSON.parse(fs.readFileSync(path.join(dest, "mcp-config.json"), "utf8"));
  assert.ok(merged.mcpServers.markitdown, "the MCP config is still merged");
});

test("setup:copilot stays silent when uvx answers", (t) => {
  const { source, dest } = uvxBox(t);
  const stderr = [];
  const probes = [];
  const exitCode = runInstall(source, dest, {
    spawnSync(command, args) {
      probes.push([command, ...args]);
      return { status: 0 };
    },
    stderr: { write: (chunk) => stderr.push(chunk) },
  });
  assert.equal(exitCode, 0);
  assert.deepEqual(probes, [["uvx", "--version"]]);
  assert.doesNotMatch(stderr.join(""), /uvx/);
});

// --- the installed ospec CLI starts (OSP-030) --------------------------------

test("setup:copilot installs schemas/ so the installed ospec CLI starts", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "copilot-cli-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const dest = path.join(root, "dest");
  const repo = path.join(root, "repo");
  fs.mkdirSync(source);
  fs.mkdirSync(repo);
  const install = () => runInstall(source, dest, {
    runConfigure: (options) => runConfigure({ ...options, sourceDir: ROOT, validate: false }),
    spawnSync: () => ({ status: 0 }),
    stderr: { write() {} },
  });
  assert.equal(install(), 0);

  const cli = path.join(dest, "scripts", "ospec.js");
  const help = spawnSync(process.execPath, [cli, "--help"], { cwd: os.tmpdir(), encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  spawnSync("git", ["init", "-q"], { cwd: repo });
  const status = spawnSync(process.execPath, [cli, "status", "--json"], { cwd: repo, encoding: "utf8" });
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).ok, true);

  const manifestPath = path.join(dest, ".ospec-workflow-install.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.ok(manifest.files.includes("schemas/foundation/knowledge-map/catalog.json"));

  // A schema an earlier build installed and this one lacks is pruned.
  fs.writeFileSync(path.join(dest, "schemas", "stale.json"), "{}");
  fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, files: [...manifest.files, "schemas/stale.json"] }));
  assert.equal(install(), 0);
  assert.equal(fs.existsSync(path.join(dest, "schemas", "stale.json")), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath, "utf8")).files, manifest.files);
});

test("setup:copilot upgrades an install made without schemas/", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "copilot-upgrade-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const dest = path.join(root, "dest");
  fs.mkdirSync(source);
  const install = () => runInstall(source, dest, {
    runConfigure: (options) => runConfigure({ ...options, sourceDir: ROOT, validate: false }),
    spawnSync: () => ({ status: 0 }),
    stderr: { write() {} },
  });
  assert.equal(install(), 0);
  const manifestPath = path.join(dest, ".ospec-workflow-install.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  // The layout and manifest an install before OSP-030 left behind.
  fs.rmSync(path.join(dest, "schemas"), { recursive: true });
  const before = manifest.files.filter((file) => !file.startsWith("schemas/"));
  fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, files: before }));

  assert.equal(install(), 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath, "utf8")).files, manifest.files);
  const help = spawnSync(process.execPath, [path.join(dest, "scripts", "ospec.js"), "--help"], { cwd: os.tmpdir(), encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
});

// --- the end of a turn reaches the repository (E1.49) ------------------------

const LAUNCHER_DEADLINE = /\[ospec error\] Hook [\w-]+ failed: ETIMEDOUT/;

// Copilot CLI runs personal hooks from the user's repository, so a hook
// command must name the installed runtime by its absolute path.
test("setup:copilot installs hooks that count the end of a turn in the repository they run from", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "copilot hooks-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  // Quotes of both shells in the path: bash's ' and PowerShell's typographic ones.
  const dest = path.join(root, "o'neil \u2019dest");
  const repo = path.join(root, "repo");
  fs.mkdirSync(source);
  fs.mkdirSync(repo);
  assert.equal(runInstall(source, dest, {
    runConfigure: (options) => runConfigure({ ...options, sourceDir: ROOT, validate: false }),
    spawnSync: () => ({ status: 0 }),
    stderr: { write() {} },
  }), 0);

  const [hook] = JSON.parse(fs.readFileSync(path.join(dest, "hooks", "hooks.json"), "utf8")).hooks.agentStop;
  const installed = path.resolve(dest).split(path.sep).join("/");
  assert.equal(hook.powershell, `node '${installed.replace("'", "''").replace("\u2019", "\u2019\u2019")}/scripts/hooks/ospec-hooks-launch.js' stop`);
  const shell = process.platform === "win32"
    ? { program: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", hook.powershell] }
    : { program: "/bin/sh", args: ["-c", hook.bash] };
  const runHook = () => spawnSync(shell.program, shell.args, { cwd: repo, input: JSON.stringify({ cwd: repo }), encoding: "utf8" });
  const turns = path.join(repo, ".ospec", "turns");
  let result = runHook();
  // A slow Windows runner can pass the launcher's 4 s deadline: it exits 0,
  // maybe without counting, so the hook runs once more, as
  // codex-hook-shell.test.js does.
  if (process.platform === "win32" && LAUNCHER_DEADLINE.test(`${result.stdout}${result.stderr}`) && !fs.existsSync(turns)) {
    t.diagnostic(`retrying after the launcher deadline: ${`${result.stderr}${result.stdout}`.trim()}`);
    result = runHook();
  }
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(turns), `no turn counted; stdout: ${result.stdout} stderr: ${result.stderr}`);
  assert.equal(fs.readFileSync(turns, "utf8"), "1\n");
});

test("setup:copilot rewrites the repo-relative hooks an earlier install left", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "copilot-hooks-upgrade-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const dest = path.join(root, "dest");
  fs.mkdirSync(source);
  const install = () => runInstall(source, dest, {
    runConfigure: (options) => runConfigure({ ...options, sourceDir: ROOT, validate: false }),
    spawnSync: () => ({ status: 0 }),
    stderr: { write() {} },
  });
  assert.equal(install(), 0);
  const hooksPath = path.join(dest, "hooks", "hooks.json");
  const installed = fs.readFileSync(hooksPath, "utf8");

  // The hooks an install before E1.49's fix copied as built.
  fs.copyFileSync(path.join(source, "dist", "github-copilot", ".github", "hooks", "hooks.json"), hooksPath);
  assert.match(fs.readFileSync(hooksPath, "utf8"), /node \\"scripts\/hooks\//);
  assert.equal(install(), 0);
  assert.equal(fs.readFileSync(hooksPath, "utf8"), installed);
  assert.doesNotMatch(installed, /node \\"scripts\//);
  assert.match(fs.readFileSync(path.join(source, "dist", "github-copilot", ".github", "hooks", "hooks.json"), "utf8"), /node \\"scripts\/hooks\//, "the build keeps its repo-relative hooks");
});

test("setup:copilot refuses a hook command it cannot make absolute", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "copilot-hooks-relative-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const dest = path.join(root, "dest");
  fs.mkdirSync(source);
  const stderr = [];
  const exitCode = runInstall(source, dest, {
    runConfigure({ outDir }) {
      const hooks = path.join(outDir, ".github", "hooks", "hooks.json");
      fs.mkdirSync(path.dirname(hooks), { recursive: true });
      fs.writeFileSync(hooks, JSON.stringify({ version: 1, hooks: { agentStop: [{ type: "command", bash: "node scripts/hooks/ospec-hooks-launch.js stop" }] } }));
      return { files: [], summary: [], exitCode: 0, validation: null };
    },
    spawnSync: () => ({ status: 0 }),
    stderr: { write: (chunk) => stderr.push(chunk) },
  });
  assert.equal(exitCode, 1);
  assert.match(stderr.join(""), /repository-relative script/);
  assert.equal(fs.existsSync(path.join(dest, "hooks", "hooks.json")), false);
});
