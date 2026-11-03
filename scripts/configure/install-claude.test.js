"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { main } = require("./install-claude.js");

function writer() {
  let text = "";
  return {
    write(value) { text += value; },
    get value() { return text; },
  };
}

test("Claude installer forwards an injected generator to the marketplace build", () => {
  const stdout = writer();
  const stderr = writer();
  const runConfigure = () => ({ exitCode: 0 });
  let marketplaceDeps;
  let copied = false;

  const exitCode = main(["--build-only"], {
    cwd: "/repository",
    resolveClaudeBin: () => null,
    runConfigure,
    stdout,
    stderr,
    buildClaudeMarketplace(options, deps) {
      marketplaceDeps = deps;
      assert.equal(options.source, "/repository");
      return { outDir: "/repository/dist/claude-marketplace", pluginDir: "/plugin", exitCode: 0, validation: null };
    },
    copyBinaryToTree() { copied = true; },
  });

  assert.equal(exitCode, 0);
  assert.equal(marketplaceDeps.runConfigure, runConfigure);
  assert.equal(copied, true);
  assert.match(stdout.value, /solo generar \(--build-only\)/);
  assert.match(stdout.value, /Ejecuta \/reload-plugins/);
  assert.equal(stderr.value, "");
});

// --- Engram optional step (REQ-install-028/029/030, ADR-002) ----------------

function baseDeps(overrides = {}) {
  return {
    cwd: "/repository",
    stdout: writer(),
    stderr: writer(),
    resolveClaudeBin: () => "claude",
    buildClaudeMarketplace: () => ({ outDir: "/out", pluginDir: "/plugin", exitCode: 0, validation: null }),
    copyBinaryToTree() {},
    run() { return true; },
    listOutput() { return ""; },
    ...overrides,
  };
}

test("Engram step receives the claude target, argv and the resolved claude bin on the success path", () => {
  let received;
  const exitCode = main(["--no-engram"], baseDeps({ engramStep(options) { received = options; } }));
  assert.equal(exitCode, 0);
  assert.equal(received.target, "claude");
  assert.deepEqual(received.argv, ["--no-engram"]);
  assert.equal(received.hostBin, "claude");
});

test("without an injected Engram step (embedded call) nothing Engram-related runs", () => {
  const stdout = writer();
  const exitCode = main([], baseDeps({ stdout }));
  assert.equal(exitCode, 0);
  assert.doesNotMatch(stdout.value, /Engram/);
});

test("Engram step also runs (guidance only) when the claude CLI is absent", () => {
  let received;
  const exitCode = main([], baseDeps({ resolveClaudeBin: () => null, engramStep(options) { received = options; } }));
  assert.equal(exitCode, 0);
  assert.equal(received.hostBin, null);
  assert.deepEqual(received.argv, []);
});

test("--build-only skips the Engram step entirely", () => {
  let called = false;
  const exitCode = main(["--build-only", "--with-engram"], baseDeps({ engramStep() { called = true; } }));
  assert.equal(exitCode, 0);
  assert.equal(called, false);
});

test("a throwing Engram step never alters the exit code", () => {
  const stderr = writer();
  const exitCode = main(["--with-engram"], baseDeps({ stderr, engramStep() { throw new Error("kaboom"); } }));
  assert.equal(exitCode, 0);
  assert.match(stderr.value, /aviso: paso Engram omitido/);
});

test("an ospec install failure still exits 1 and skips the Engram step", () => {
  let called = false;
  const exitCode = main(["--with-engram"], baseDeps({
    run() { throw new Error("install failed"); },
    engramStep() { called = true; },
  }));
  assert.equal(exitCode, 1);
  assert.equal(called, false);
});

// --- E0.4 / claude-router: the router goes to ~/.claude/rules/ospec-workflow.md

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { BEGIN, END } = require("./instruction-block.js");

function routerFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-claude-router-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pluginDir = path.join(root, "plugin");
  const home = path.join(root, "home");
  fs.mkdirSync(path.join(pluginDir, "global-instructions"), { recursive: true });
  fs.writeFileSync(path.join(pluginDir, "global-instructions", "CLAUDE.md"), "# ospec-workflow\n\nrouter\n");
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const claudeMd = path.join(home, ".claude", "CLAUDE.md");
  const rules = path.join(home, ".claude", "rules", "ospec-workflow.md");
  const state = path.join(home, ".claude", "plugins", "data", "ospec-workflow-ospec-tools", "router.json");
  fs.writeFileSync(claudeMd, "# Mine\n");
  const deps = (overrides = {}) => baseDeps({
    homedir: () => home,
    buildClaudeMarketplace: () => ({ outDir: "/out", pluginDir, exitCode: 0, validation: null }),
    ...overrides,
  });
  return { root, claudeMd, rules, state, deps };
}

test("setup:claude writes the built router to ~/.claude/rules and moves an old block out of CLAUDE.md", (t) => {
  const { claudeMd, rules, state, deps } = routerFixture(t);
  fs.writeFileSync(claudeMd, `# Mine\n\n${BEGIN}\n# old router\n${END}\n`);
  const stdout = writer();
  assert.equal(main([], deps({ stdout })), 0);
  assert.equal(fs.readFileSync(rules, "utf8"), "# ospec-workflow\n\nrouter\n");
  assert.equal(fs.readFileSync(claudeMd, "utf8"), "# Mine\n", "the old block goes, the user's text stays");
  assert.match(stdout.value, /movido desde/);
  assert.equal(main([], deps()), 0);
  assert.equal(fs.readFileSync(rules, "utf8"), "# ospec-workflow\n\nrouter\n", "a reinstall rewrites nothing else");
  assert.equal(main(["--no-router"], deps()), 0);
  assert.equal(fs.existsSync(rules), false, "--no-router takes the router out");
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).declined, true, "and records the no that silences the notice");
  assert.equal(fs.readFileSync(claudeMd, "utf8"), "# Mine\n");
});

test("setup:claude reports a router edited by hand and still installs", (t) => {
  const { rules, deps } = routerFixture(t);
  fs.mkdirSync(path.dirname(rules), { recursive: true });
  fs.writeFileSync(rules, "# my router\n");
  const stderr = writer();
  assert.equal(main([], deps({ stderr })), 0);
  assert.equal(fs.readFileSync(rules, "utf8"), "# my router\n");
  assert.match(stderr.value, /router-modified|edited by hand/);
  assert.match(stderr.value, /--force/);
});

test("setup:claude writes the router where CLAUDE_CONFIG_DIR points", (t) => {
  const { root, rules, deps } = routerFixture(t);
  const custom = path.join(root, "custom");
  assert.equal(main([], deps({ env: { CLAUDE_CONFIG_DIR: custom } })), 0);
  assert.ok(fs.existsSync(path.join(custom, "rules", "ospec-workflow.md")));
  assert.equal(fs.existsSync(rules), false);
});

test("--build-only and a missing claude CLI leave the router alone", (t) => {
  const { claudeMd, rules, deps } = routerFixture(t);
  assert.equal(main(["--build-only"], deps()), 0);
  assert.equal(main([], deps({ resolveClaudeBin: () => null })), 0);
  assert.equal(fs.readFileSync(claudeMd, "utf8"), "# Mine\n");
  assert.equal(fs.existsSync(rules), false);
});

// --- E1.24: --dry-run simulates, it never installs ---------------------------

test("--dry-run builds in a temporary directory and registers, installs and writes nothing", (t) => {
  const { claudeMd, rules, deps } = routerFixture(t);
  const stdout = writer();
  const calls = [];
  let engram = false;
  let copied = false;
  let buildOut;
  const exitCode = main(["--dry-run"], deps({
    stdout,
    run(bin, args) { calls.push(["run", ...args]); return true; },
    listOutput(bin, args) { calls.push(["list", ...args]); return ""; },
    engramStep() { engram = true; },
    copyBinaryToTree() { copied = true; },
    buildClaudeMarketplace(options) {
      buildOut = options.out;
      return { outDir: path.resolve("/repository", options.out), pluginDir: "/plugin", exitCode: 0, validation: null };
    },
  }));
  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [], "the claude CLI is not touched");
  assert.equal(fs.readFileSync(claudeMd, "utf8"), "# Mine\n");
  assert.equal(fs.existsSync(rules), false, "the router is not written");
  assert.equal(engram, false, "the Engram step is skipped");
  assert.equal(copied, false);
  assert.ok(path.isAbsolute(buildOut) && path.relative(os.tmpdir(), buildOut).startsWith("ospec-claude-dry-run-"), `built under the OS temp dir, got ${buildOut}`);
  assert.equal(fs.existsSync(buildOut), false, "the temporary build is removed");
  assert.match(stdout.value, /simulación \(--dry-run\)/);
});

// --- uvx prerequisite warning (foundation document conversion) -------------

function uvxCwd(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-claude-uvx-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(dir, ".mcp.json"),
    JSON.stringify({ mcpServers: { markitdown: { command: "uvx", args: ["markitdown-mcp@0.0.1a7"] } } }),
  );
  return dir;
}

test("setup:claude warns when the source ships a uvx MCP server and the binary is missing", (t) => {
  const { deps } = routerFixture(t);
  const stderr = writer();
  const exitCode = main([], deps({
    cwd: uvxCwd(t),
    stderr,
    spawnSync: () => ({ error: new Error("ENOENT") }),
  }));
  assert.equal(exitCode, 0);
  assert.match(stderr.value, /uvx/);
  assert.match(stderr.value, /docs\.astral\.sh\/uv/);
});

test("setup:claude stays silent when uvx answers", (t) => {
  const { deps } = routerFixture(t);
  const stderr = writer();
  const probes = [];
  const exitCode = main([], deps({
    cwd: uvxCwd(t),
    stderr,
    spawnSync(command, args) {
      probes.push([command, ...args]);
      return { status: 0 };
    },
  }));
  assert.equal(exitCode, 0);
  assert.deepEqual(probes, [["uvx", "--version"]]);
  assert.doesNotMatch(stderr.value, /uvx/);
});
