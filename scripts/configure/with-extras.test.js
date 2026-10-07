"use strict";

// Roadmap E0.3 (b2): every installer forwards `--with-extras` to the build,
// and installs the default package (no extras) without it. The build itself
// is stubbed to fail, so nothing past the build step runs.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const sink = { write() {} };

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-with-extras-"));
  const source = path.join(root, "src");
  const dest = path.join(root, "dest");
  const home = path.join(root, "home");
  for (const dir of [source, dest, home]) fs.mkdirSync(dir);
  return { root, source, dest, home };
}

// Runs an installer entry point with a capturing runConfigure stub and
// returns the options the build received.
function captureBuild(run) {
  const box = sandbox();
  const calls = [];
  const runConfigure = (options) => {
    calls.push(options);
    return { files: [], summary: [], exitCode: 1, validation: null };
  };
  try {
    run(box, { runConfigure, cwd: box.source, homedir: () => box.home, stdout: sink, stderr: sink, exitCodeTarget: {} });
  } finally {
    fs.rmSync(box.root, { recursive: true, force: true });
  }
  assert.equal(calls.length, 1, "the build must run exactly once");
  return calls[0];
}

const INSTALLERS = {
  vscode: (extra) => (box, deps) => require("./install-vscode.js").main(["--source", box.source, ...extra], deps),
  "github-copilot": (extra) => (box, deps) => require("./install-global-copilot.js").main(["--source", box.source, "--dest", box.dest, ...extra], deps),
  opencode: (extra) => (box, deps) => require("./install-global-opencode.js").main(["--source", box.source, "--dest", box.dest, ...extra], deps),
  codex: (extra) => (box, deps) => require("./install-codex.js").main(["--source", box.source, ...extra], deps),
  cursor: (extra) => (box, deps) => require("./install-cursor.js").main(["--source", box.source, ...extra], deps),
  antigravity: (extra) => (box, deps) => require("./install-antigravity.js").main(["--source", box.source, "--dest", box.dest, ...extra], deps),
  "install-target": (extra) => (box, deps) => require("./install-target.js").main(["opencode", box.dest, "--source", box.source, ...extra], deps),
};

for (const [name, installer] of Object.entries(INSTALLERS)) {
  test(`${name}: --with-extras reaches the build, and the default build has no extras`, () => {
    assert.equal(captureBuild(installer(["--with-extras"])).withExtras, true);
    assert.equal(captureBuild(installer([])).withExtras, false);
  });
}

test("claude: install-claude forwards --with-extras to the marketplace build", () => {
  const { main } = require("./install-claude.js");
  const seen = [];
  const deps = {
    cwd: os.tmpdir(),
    stdout: sink,
    stderr: sink,
    resolveClaudeBin: () => null,
    buildClaudeMarketplace: (options) => {
      seen.push(options.withExtras);
      return { outDir: "unused", exitCode: 1, validation: null };
    },
  };
  main(["--with-extras"], deps);
  main([], deps);
  assert.deepEqual(seen, [true, false]);
});

test("claude: the marketplace builder forwards withExtras to runConfigure", () => {
  const { buildClaudeMarketplace } = require("./claude-marketplace.js");
  const box = sandbox();
  fs.mkdirSync(path.join(box.source, ".claude-plugin"));
  fs.writeFileSync(path.join(box.source, ".claude-plugin", "plugin.json"), JSON.stringify({ description: "d" }));
  const seen = [];
  const runConfigure = (options) => {
    seen.push(options.withExtras);
    return { files: [], summary: [], exitCode: 0, validation: null };
  };
  try {
    for (const withExtras of [true, false]) {
      buildClaudeMarketplace(
        { source: box.source, out: path.join(box.dest, "mp"), validate: false, marketplaceName: "m", pluginName: "p", withExtras },
        { runConfigure, validateAttributionSentinels: () => [] },
      );
    }
  } finally {
    fs.rmSync(box.root, { recursive: true, force: true });
  }
  assert.deepEqual(seen, [true, false]);
});

test("cli: runConfigure passes withExtras to the transform, and parseArgs accepts --with-extras", () => {
  const cli = require("./cli.js");
  const root = path.resolve(__dirname, "..", "..");
  const box = sandbox();
  try {
    const paths = (withExtras) =>
      cli.runConfigure({ sourceDir: root, target: "opencode", outDir: path.join(box.dest, String(withExtras)), validate: false, withExtras })
        .summary.filter((p) => p.startsWith("skills/judgment-day/"));
    assert.ok(paths(true).length > 0);
    assert.deepEqual(paths(false), []);
  } finally {
    fs.rmSync(box.root, { recursive: true, force: true });
  }
});
