"use strict";

// Roadmap E0.4 (b): the orchestrator reads its `_shared` handlers on demand,
// and a consumer project has no `skills/_shared/`. Every reference must point
// at the installed copy: Claude through its own skill-dir substitution, the
// other hosts through a marker each installer renders to the real directory.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure } = require("./cli.js");
const { RUNTIME_DIR_MARKER, SHARED_DIR_MARKER, renderRuntimeDir, renderSharedDir, sharedDirValue } = require("./shared-dir.js");
const { hostBinarySuffix } = require("./install-target.js");

const ROOT = path.resolve(__dirname, "..", "..");

const ORCHESTRATOR_PATHS = {
  claude: "skills/sdd-orchestrator/SKILL.md",
  codex: "skills/sdd-orchestrator/SKILL.md",
  "github-copilot": ".github/agents/sdd-orchestrator.agent.md",
  opencode: ".opencode/agents/ospec-workflow.md",
  vscode: "agents/sdd-orchestrator.agent.md",
  cursor: "agents/sdd-orchestrator.md",
  antigravity: "agents/sdd-orchestrator.agent.md",
};

function tmpDir(t, prefix = "ospec-shared-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(root, rel, content) {
  const destination = path.join(root, rel);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
}

test("every target's orchestrator names its _shared handlers through the installed location", (t) => {
  for (const [target, orchestratorPath] of Object.entries(ORCHESTRATOR_PATHS)) {
    const out = tmpDir(t);
    const result = runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false, withSdd: true });
    const orchestrator = result.files.find((file) => file.path === orchestratorPath);
    assert.ok(orchestrator, `${target}: orchestrator missing at ${orchestratorPath}`);
    const text = String(orchestrator.content);

    // No reference may stay relative to the project the user works in.
    assert.doesNotMatch(text, /(?<![A-Za-z0-9_./-])skills\/_shared\//, `${target}: relative skills/_shared/ left`);
    assert.doesNotMatch(text, /(?<![A-Za-z0-9_./-])_shared\/[A-Za-z0-9][A-Za-z0-9._-]*\.md/, `${target}: bare _shared/ ref left`);

    const prefix = target === "claude" ? "${CLAUDE_SKILL_DIR}/../_shared/" : `${SHARED_DIR_MARKER}/`;
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const named = [...text.matchAll(new RegExp(`${escaped}([A-Za-z0-9][A-Za-z0-9._-]*\\.md)`, "g"))].map((m) => m[1]);
    assert.ok(new Set(named).size >= 13, `${target}: expected the pointer table and conventions, got ${named.length}`);
    for (const name of new Set(named)) {
      assert.ok(fs.existsSync(path.join(out, "skills", "_shared", name)), `${target}: ${name} is not shipped`);
    }
    if (target === "claude") assert.ok(!text.includes(SHARED_DIR_MARKER), "claude needs no install-time marker");
  }
});

test("only the orchestrator carries the install-time marker", (t) => {
  for (const [target, orchestratorPath] of Object.entries(ORCHESTRATOR_PATHS)) {
    const out = tmpDir(t);
    const result = runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false, withSdd: true });
    const carriers = result.files.filter((file) => String(file.content).includes(SHARED_DIR_MARKER)).map((file) => file.path);
    assert.deepEqual(carriers, target === "claude" ? [] : [orchestratorPath], target);
  }
});

test("sharedDirValue gives an absolute POSIX path for a global root and keeps a relative one as is", () => {
  assert.equal(sharedDirValue(path.join(os.tmpdir(), "home", ".cursor", "skills")), `${path.resolve(os.tmpdir(), "home", ".cursor", "skills", "_shared").split(path.sep).join("/")}`);
  assert.equal(sharedDirValue("skills", { relative: true }), "skills/_shared");
  assert.equal(sharedDirValue(".agents/skills", { relative: true }), ".agents/skills/_shared");
});

test("renderSharedDir rewrites the marker under a tree and restore() puts it back", (t) => {
  const dir = tmpDir(t);
  write(dir, "agents/orch.md", `read ${SHARED_DIR_MARKER}/gate.md and ${SHARED_DIR_MARKER}/route.md\n`);
  write(dir, "agents/worker.md", "no marker here\n");
  write(dir, "scripts/hooks/bin", Buffer.from([0, 1, 2, 3]));

  const rendered = renderSharedDir(dir, "/home/me/.copilot/skills/_shared");
  assert.deepEqual(rendered.files.map((file) => path.relative(dir, file).split(path.sep).join("/")), ["agents/orch.md"]);
  assert.equal(
    fs.readFileSync(path.join(dir, "agents/orch.md"), "utf8"),
    "read /home/me/.copilot/skills/_shared/gate.md and /home/me/.copilot/skills/_shared/route.md\n",
  );
  assert.equal(fs.readFileSync(path.join(dir, "agents/worker.md"), "utf8"), "no marker here\n");

  rendered.restore();
  assert.equal(fs.readFileSync(path.join(dir, "agents/orch.md"), "utf8"), `read ${SHARED_DIR_MARKER}/gate.md and ${SHARED_DIR_MARKER}/route.md\n`);
});

test("renderRuntimeDir rewrites the runtime marker and restore() puts it back", (t) => {
  const dir = tmpDir(t);
  write(dir, "skills/idd/SKILL.md", `run node "${RUNTIME_DIR_MARKER}/scripts/ospec.js"\n`);
  write(dir, "agents/orch.md", `read ${SHARED_DIR_MARKER}/gate.md\n`);
  const rendered = renderRuntimeDir(dir, "/home/me/.copilot");
  assert.deepEqual(rendered.files.map((file) => path.relative(dir, file).split(path.sep).join("/")), ["skills/idd/SKILL.md"]);
  assert.equal(fs.readFileSync(path.join(dir, "skills/idd/SKILL.md"), "utf8"), 'run node "/home/me/.copilot/scripts/ospec.js"\n');
  assert.equal(fs.readFileSync(path.join(dir, "agents/orch.md"), "utf8"), `read ${SHARED_DIR_MARKER}/gate.md\n`);
  rendered.restore();
  assert.equal(fs.readFileSync(path.join(dir, "skills/idd/SKILL.md"), "utf8"), `run node "${RUNTIME_DIR_MARKER}/scripts/ospec.js"\n`);
  assert.throws(() => renderRuntimeDir(dir, ""), /runtime directory/);
  assert.throws(() => renderRuntimeDir(dir, `${RUNTIME_DIR_MARKER}/x`), /runtime directory/);
});

test("renderSharedDir refuses an empty value or one that still holds the marker", (t) => {
  const dir = tmpDir(t);
  write(dir, "a.md", `${SHARED_DIR_MARKER}/x.md\n`);
  assert.throws(() => renderSharedDir(dir, ""), /shared directory/);
  assert.throws(() => renderSharedDir(dir, `${SHARED_DIR_MARKER}/again`), /shared directory/);
  assert.equal(fs.readFileSync(path.join(dir, "a.md"), "utf8"), `${SHARED_DIR_MARKER}/x.md\n`);
});

// --- installers render the marker to where they put `skills/_shared/` --------

function stageRealSource(t) {
  const sourceDir = path.join(tmpDir(t, "ospec-shared-src-"), "source");
  for (const rel of ["agents", "commands", "rules", "skills", "hooks", "scripts/hooks", "scripts/lib"]) {
    fs.cpSync(path.join(ROOT, rel), path.join(sourceDir, rel), { recursive: true });
  }
  for (const name of fs.readdirSync(path.join(ROOT, "scripts"))) {
    if (name.endsWith(".js") && !name.endsWith(".test.js")) write(sourceDir, path.join("scripts", name), fs.readFileSync(path.join(ROOT, "scripts", name)));
  }
  for (const rel of [".claude-plugin/plugin.json", ".mcp.json", "models.yaml", "AGENTS.md", "package.json"]) {
    if (fs.existsSync(path.join(ROOT, rel))) write(sourceDir, rel, fs.readFileSync(path.join(ROOT, rel)));
  }
  const { os: goos, arch, ext } = hostBinarySuffix();
  write(sourceDir, path.join("release", "dist", `ospec-hooks-${goos}-${arch}${ext}`), "binary-fixture");
  return sourceDir;
}

const quiet = () => ({ stdout: { write() {} }, stderr: { chunks: [], write(chunk) { this.chunks.push(chunk); } } });
const posix = (value) => path.resolve(value).split(path.sep).join("/");

// E1.6 (a): the IDD protocol names the installed ospec CLI, and that file exists.
function assertRuntime(installedRoot, runtimeDir, cliFile) {
  const protocol = fs.readFileSync(path.join(installedRoot, "skills", "idd", "SKILL.md"), "utf8");
  assert.doesNotMatch(protocol, /__OSPEC_RUNTIME_DIR__/);
  assert.ok(protocol.includes(`node "${runtimeDir}/scripts/ospec.js"`), `installed protocol must run ${runtimeDir}/scripts/ospec.js`);
  assert.ok(fs.existsSync(cliFile), `${cliFile} must be installed`);
}

function assertRendered(installedOrchestrator, generatedOrchestrator, sharedDir) {
  const installed = fs.readFileSync(installedOrchestrator, "utf8");
  assert.doesNotMatch(installed, /__OSPEC_SHARED_DIR__/);
  assert.ok(installed.includes(`${sharedDir}/gate-4r-review.md`), `installed orchestrator must name ${sharedDir}`);
  assert.match(fs.readFileSync(generatedOrchestrator, "utf8"), /__OSPEC_SHARED_DIR__\/gate-4r-review\.md/, "dist keeps the marker");
}

for (const [label, modulePath, agentDir, orchestratorFile] of [
  ["setup:copilot", "./install-global-copilot.js", ".github/agents", "sdd-orchestrator.agent.md"],
  ["setup:opencode", "./install-global-opencode.js", ".opencode/agents", "ospec-workflow.md"],
]) {
  test(`${label} renders the installed _shared directory into the orchestrator`, (t) => {
    const sourceDir = stageRealSource(t);
    const dest = path.join(tmpDir(t, "ospec-shared-home-"), "root");
    const io = quiet();
    const { main } = require(modulePath);
    assert.equal(main(["--source", sourceDir, "--dest", dest, "--no-validate", "--with-sdd"], io), 0, io.stderr.chunks.join(""));
    assert.ok(fs.existsSync(path.join(dest, "skills", "_shared", "gate-4r-review.md")));
    assertRendered(path.join(dest, "agents", orchestratorFile), path.join(sourceDir, "dist", label === "setup:copilot" ? "github-copilot" : "opencode", agentDir, orchestratorFile), `${posix(dest)}/skills/_shared`);
    assertRuntime(dest, posix(dest), path.join(dest, "scripts", "ospec.js"));
  });
}

test("setup:antigravity renders each root's own _shared directory", (t) => {
  const sourceDir = stageRealSource(t);
  const dest = path.join(tmpDir(t, "ospec-shared-home-"), "config");
  const io = quiet();
  const { main } = require("./install-antigravity.js");
  assert.equal(main(["--source", sourceDir, "--dest", dest, "--no-validate", "--with-sdd"], io), 0, io.stderr.chunks.join(""));
  assertRendered(
    path.join(dest, "agents", "sdd-orchestrator.agent.md"),
    path.join(sourceDir, "dist", "antigravity", "agents", "sdd-orchestrator.agent.md"),
    `${posix(dest)}/skills/_shared`,
  );
  assertRuntime(dest, posix(dest), path.join(dest, "scripts", "ospec.js"));
});

test("setup:vscode renders the marker in the dist tree VS Code loads", (t) => {
  const sourceDir = stageRealSource(t);
  const home = tmpDir(t, "ospec-shared-home-");
  const appData = path.join(home, "AppData");
  fs.mkdirSync(path.join(appData, "Code", "User"), { recursive: true });
  const io = quiet();
  const { main } = require("./install-vscode.js");
  const code = main(["--source", sourceDir, "--no-validate", "--with-sdd"], { ...io, homedir: () => home, env: { APPDATA: appData }, platform: "win32" });
  assert.equal(code, 0, io.stderr.chunks.join(""));
  const orchestrator = fs.readFileSync(path.join(sourceDir, "dist", "vscode", "agents", "sdd-orchestrator.agent.md"), "utf8");
  assert.doesNotMatch(orchestrator, /__OSPEC_SHARED_DIR__/);
  assert.ok(orchestrator.includes(`${posix(path.join(sourceDir, "dist", "vscode"))}/skills/_shared/gate-4r-review.md`));
  const pluginDir = path.join(sourceDir, "dist", "vscode");
  assertRuntime(pluginDir, posix(pluginDir), path.join(pluginDir, "scripts", "ospec.js"));
});

// E1.10 (REQ-install-039): dist/vscode is the tree VS Code loads live, so neither a dry run nor
// an install that fails after the build may leave it with unrendered markers.
function snapshotTree(root) {
  if (!fs.existsSync(root)) return null;
  const files = {};
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else files[path.relative(root, absolute).split(path.sep).join("/")] = fs.readFileSync(absolute, "utf8");
    }
  };
  visit(root);
  return files;
}

function vscodeDeps(t) {
  const home = tmpDir(t, "ospec-shared-home-");
  const appData = path.join(home, "AppData");
  fs.mkdirSync(path.join(appData, "Code", "User"), { recursive: true });
  return { ...quiet(), homedir: () => home, env: { APPDATA: appData }, platform: "win32" };
}

test("setup:vscode --dry-run builds elsewhere and leaves the dist tree VS Code loads untouched", (t) => {
  const { main } = require("./install-vscode.js");
  const sourceDir = stageRealSource(t);
  const pluginDir = path.join(sourceDir, "dist", "vscode");

  const deps = vscodeDeps(t);
  assert.equal(main(["--source", sourceDir, "--no-validate", "--dry-run"], deps), 0, deps.stderr.chunks.join(""));
  assert.equal(fs.existsSync(pluginDir), false, "a dry run must not create dist/vscode");

  write(pluginDir, "agents/previous.agent.md", "previous install\n");
  const before = snapshotTree(pluginDir);
  const again = vscodeDeps(t);
  assert.equal(main(["--source", sourceDir, "--no-validate", "--dry-run"], again), 0, again.stderr.chunks.join(""));
  assert.deepEqual(snapshotTree(pluginDir), before, "a dry run must not touch dist/vscode");
  assert.deepEqual(fs.readdirSync(path.join(sourceDir, "dist")), ["vscode"], "no staging, backup or lock left in dist/");
});

test("setup:vscode keeps the previous dist tree when preparing the new build fails", (t) => {
  const { main } = require("./install-vscode.js");
  const sourceDir = stageRealSource(t);
  const pluginDir = path.join(sourceDir, "dist", "vscode");
  write(pluginDir, "agents/previous.agent.md", "previous install\n");
  const before = snapshotTree(pluginDir);

  const deps = vscodeDeps(t);
  const code = main(["--source", sourceDir, "--no-validate"], {
    ...deps,
    copyBinaryToTree: () => {
      throw new Error("copy failed");
    },
  });
  assert.notEqual(code, 0);
  assert.deepEqual(snapshotTree(pluginDir), before, "a failed install must not publish a half-prepared dist/vscode");
  assert.deepEqual(fs.readdirSync(path.join(sourceDir, "dist")), ["vscode"], "no staging, backup or lock left in dist/");
});

for (const target of ["opencode", "github-copilot"]) {
  test(`install-target ${target} names the repository's skills/_shared, relative to the repository root`, (t) => {
    const sourceDir = stageRealSource(t);
    const repo = tmpDir(t, "ospec-shared-repo-");
    const io = quiet();
    const exitCodeTarget = {};
    const { main } = require("./install-target.js");
    main([target, repo, "--source", sourceDir, "--no-validate", "--with-sdd"], { ...io, exitCodeTarget });
    assert.equal(exitCodeTarget.exitCode, undefined, io.stderr.chunks.join(""));
    const orchestratorRel = target === "opencode" ? ".opencode/agents/ospec-workflow.md" : ".github/agents/sdd-orchestrator.agent.md";
    assertRendered(path.join(repo, orchestratorRel), path.join(sourceDir, "dist", target, orchestratorRel), "skills/_shared");
    assert.ok(fs.existsSync(path.join(repo, "skills", "_shared", "gate-4r-review.md")));
    assertRuntime(repo, ".", path.join(repo, "scripts", "ospec.js"));
  });
}

test("renderSharedDir is a no-op on a tree without the marker", (t) => {
  const dir = tmpDir(t);
  write(dir, "a.md", "plain\n");
  const rendered = renderSharedDir(dir, "/x/_shared");
  assert.deepEqual(rendered.files, []);
  rendered.restore();
  assert.equal(fs.readFileSync(path.join(dir, "a.md"), "utf8"), "plain\n");
});
