"use strict";

// Roadmap E1.6 (d2): IDD is the default flow, so the SDD package (the `sdd-*`
// skills, the `sdd-*` agents with the orchestrator and the `/sdd-*` commands)
// installs only with `--with-sdd`. A reinstall keeps it when the previous
// install held it, and `--no-sdd` removes it. The build is stubbed to fail, so
// nothing past the build step runs.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { isSddPackagePath } = require("../lib/skill-extras.js");
const { hasSddPath, previousInstallHasSdd, resolveWithSdd } = require("./sdd-package.js");

const ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST = ".ospec-workflow-install.json";
const sink = { write() {} };

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-with-sdd-"));
  const box = { root, source: path.join(root, "src"), dest: path.join(root, "dest"), home: path.join(root, "home") };
  for (const dir of [box.source, box.dest, box.home]) fs.mkdirSync(dir);
  return box;
}

function write(file, content = "x\n") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function manifest(dir, files) {
  write(path.join(dir, MANIFEST), JSON.stringify({ target: "t", files }));
}

// Each installer, how to run it in the sandbox, and how to leave behind a
// previous install that held the SDD package.
const INSTALLERS = {
  vscode: {
    run: (extra) => (box, deps) => require("./install-vscode.js").main(["--source", box.source, ...extra], deps),
    previous: (box) => write(path.join(box.source, "dist", "vscode", "agents", "sdd-apply.agent.md")),
  },
  "github-copilot": {
    run: (extra) => (box, deps) => require("./install-global-copilot.js").main(["--source", box.source, "--dest", box.dest, ...extra], deps),
    previous: (box) => manifest(box.dest, ["agents/sdd-apply.agent.md"]),
  },
  opencode: {
    run: (extra) => (box, deps) => require("./install-global-opencode.js").main(["--source", box.source, "--dest", box.dest, ...extra], deps),
    previous: (box) => manifest(box.dest, ["agents/sdd-apply.md"]),
  },
  codex: {
    run: (extra) => (box, deps) => require("./install-codex.js").main(["--source", box.source, ...extra], deps),
    previous: (box) => manifest(path.join(box.home, ".codex"), ["agents/sdd-apply.toml"]),
  },
  "codex repo": {
    run: (extra) => (box, deps) => require("./install-codex.js").main([box.dest, "--source", box.source, ...extra], deps),
    previous: (box) => write(path.join(box.dest, ".codex", "agents", "sdd-apply.toml")),
  },
  cursor: {
    run: (extra) => (box, deps) => require("./install-cursor.js").main(["--source", box.source, ...extra], deps),
    previous: (box) => manifest(path.join(box.home, ".cursor"), ["agents/sdd-apply.md"]),
  },
  antigravity: {
    run: (extra) => (box, deps) => require("./install-antigravity.js").main(["--source", box.source, "--dest", box.dest, ...extra], deps),
    previous: (box) => manifest(box.dest, ["skills/sdd-apply/SKILL.md"]),
  },
  "install-target": {
    run: (extra) => (box, deps) => require("./install-target.js").main(["opencode", box.dest, "--source", box.source, ...extra], deps),
    previous: (box) => write(path.join(box.dest, ".opencode", "agents", "sdd-apply.md")),
  },
};

// Runs an installer with a capturing runConfigure stub and returns the
// options the build received (or null when it never ran) and the exit code.
function captureBuild(installer, extra, { previous = false } = {}) {
  const box = sandbox();
  const calls = [];
  const runConfigure = (options) => {
    calls.push(options);
    return { files: [], summary: [], exitCode: 1, validation: null };
  };
  const exitCodeTarget = {};
  let code;
  try {
    if (previous) installer.previous(box);
    code = installer.run(extra)(box, { runConfigure, cwd: box.source, homedir: () => box.home, env: {}, stdout: sink, stderr: sink, exitCodeTarget });
  } finally {
    fs.rmSync(box.root, { recursive: true, force: true });
  }
  return { options: calls[0] || null, calls: calls.length, code: code === undefined ? exitCodeTarget.exitCode : code };
}

for (const [name, installer] of Object.entries(INSTALLERS)) {
  test(`${name}: --with-sdd reaches the build, and a first install has no SDD`, () => {
    assert.equal(captureBuild(installer, ["--with-sdd"]).options.withSdd, true);
    assert.equal(captureBuild(installer, []).options.withSdd, false);
  });

  test(`${name}: a reinstall keeps SDD when the previous install held it, and --no-sdd removes it`, () => {
    assert.equal(captureBuild(installer, [], { previous: true }).options.withSdd, true);
    assert.equal(captureBuild(installer, ["--no-sdd"], { previous: true }).options.withSdd, false);
  });

  test(`${name}: --with-sdd and --no-sdd together are a usage error`, () => {
    const run = captureBuild(installer, ["--with-sdd", "--no-sdd"]);
    assert.equal(run.calls, 0, "nothing is built");
    assert.equal(run.code, 2);
  });
}

function claudeRun(argv, { previous = false } = {}) {
  const { main } = require("./install-claude.js");
  const box = sandbox();
  const seen = [];
  try {
    if (previous) write(path.join(box.source, "dist", "claude-marketplace", "plugins", "ospec-workflow", "agents", "sdd-apply.md"));
    const code = main(argv, {
      cwd: box.source,
      stdout: sink,
      stderr: sink,
      resolveClaudeBin: () => null,
      buildClaudeMarketplace: (options) => {
        seen.push(options.withSdd);
        return { outDir: "unused", exitCode: 1, validation: null };
      },
    });
    return { seen, code };
  } finally {
    fs.rmSync(box.root, { recursive: true, force: true });
  }
}

test("claude: install-claude forwards --with-sdd, keeps a previous SDD build and removes it with --no-sdd", () => {
  assert.deepEqual(claudeRun(["--with-sdd"]).seen, [true]);
  assert.deepEqual(claudeRun([]).seen, [false]);
  assert.deepEqual(claudeRun([], { previous: true }).seen, [true]);
  assert.deepEqual(claudeRun(["--no-sdd"], { previous: true }).seen, [false]);
  const both = claudeRun(["--with-sdd", "--no-sdd"]);
  assert.deepEqual(both.seen, []);
  assert.equal(both.code, 2);
});

test("claude: the marketplace builder forwards withSdd to runConfigure, and its CLI accepts --with-sdd", () => {
  const { buildClaudeMarketplace, parseArgs } = require("./claude-marketplace.js");
  const box = sandbox();
  write(path.join(box.source, ".claude-plugin", "plugin.json"), JSON.stringify({ description: "d" }));
  const seen = [];
  const runConfigure = (options) => {
    seen.push(options.withSdd);
    return { files: [], summary: [], exitCode: 0, validation: null };
  };
  try {
    for (const withSdd of [true, false]) {
      buildClaudeMarketplace(
        { source: box.source, out: path.join(box.dest, "mp"), validate: false, marketplaceName: "m", pluginName: "p", withSdd },
        { runConfigure, validateAttributionSentinels: () => [] },
      );
    }
  } finally {
    fs.rmSync(box.root, { recursive: true, force: true });
  }
  assert.deepEqual(seen, [true, false]);
  assert.equal(parseArgs(["--with-sdd"]).withSdd, true);
});

test("the SDD package is every sdd-* skill, agent and command plus the foundation delegate, and nothing else", () => {
  for (const file of ["skills/sdd-apply/SKILL.md", "skills/sdd-verify/references/ai-blind-spots.md", "agents/sdd-orchestrator.agent.md", "commands/sdd-new.prompt.md", "rules/sdd-strict-tdd.instructions.md", "agents/foundation.agent.md"]) {
    assert.equal(isSddPackagePath(file), true, file);
  }
  for (const file of ["skills/idd/SKILL.md", "skills/_shared/sdd-phase-common.md", "agents/review-trust.agent.md", "skills/review-trust/SKILL.md", "rules/ospec-router.instructions.md", "skills/sdd/SKILL.md", "skills/foundation/SKILL.md", "skills/foundation/references/foundation-details.md"]) {
    assert.equal(isSddPackagePath(file), false, file);
  }
});

test("a previous install holds SDD by its ownership manifest or by its installed agents", () => {
  const box = sandbox();
  try {
    assert.equal(hasSddPath("agents/sdd-apply.toml"), true);
    assert.equal(hasSddPath("skills\\sdd-apply\\SKILL.md"), true);
    assert.equal(hasSddPath("skills/_shared/sdd-phase-common.md"), false, "a shared module named sdd-* is not the package");
    assert.equal(hasSddPath("agents/review-trust.md"), false);
    assert.equal(previousInstallHasSdd({ manifestRoots: [box.dest], agentDirs: [path.join(box.dest, "agents")] }), false, "nothing installed");
    manifest(box.dest, ["agents/review-trust.md", "skills/idd/SKILL.md"]);
    assert.equal(previousInstallHasSdd({ manifestRoots: [box.dest] }), false);
    manifest(box.dest, ["agents/review-trust.md", "commands/sdd-new.md"]);
    assert.equal(previousInstallHasSdd({ manifestRoots: [box.dest] }), true);
    write(path.join(box.dest, MANIFEST), "{not json");
    assert.equal(previousInstallHasSdd({ manifestRoots: [box.dest] }), false, "an unreadable manifest holds nothing");
    write(path.join(box.home, "agents", "sdd-apply.md"));
    assert.equal(previousInstallHasSdd({ agentDirs: [path.join(box.home, "agents")] }), true);
  } finally {
    fs.rmSync(box.root, { recursive: true, force: true });
  }
  assert.equal(resolveWithSdd({ withSdd: true }, () => false), true);
  assert.equal(resolveWithSdd({ noSdd: true }, () => true), false);
  assert.equal(resolveWithSdd({}, () => true), true);
  assert.equal(resolveWithSdd({}, () => false), false);
});

test("the default build of every target passes its validator, without SDD commands or prompts", () => {
  const cli = require("./cli.js");
  const validators = {
    antigravity: (dir) => require("./validate-antigravity.js").validate(dir),
    cursor: (dir) => require("./validate-cursor.js").validate(dir),
    "github-copilot": (dir) => require("./validate-github-copilot.js").validate(dir),
    opencode: (dir) => require("./validate-opencode.js").validate(dir),
    codex: (dir) => require("./validate-codex.js").validate(dir),
    vscode: (dir) => require("./validate-vscode.js").validateVsCodeTarget(dir),
  };
  const box = sandbox();
  try {
    for (const [target, validate] of Object.entries(validators)) {
      const outDir = path.join(box.dest, target);
      cli.runConfigure({ sourceDir: ROOT, target, outDir, validate: false });
      const { errors } = validate(outDir);
      assert.deepEqual(errors, [], `${target}: the default build must validate`);
    }
  } finally {
    fs.rmSync(box.root, { recursive: true, force: true });
  }
});

test("cli: a default build has no SDD package and keeps IDD and review; --with-sdd ships all of it", () => {
  const cli = require("./cli.js");
  const box = sandbox();
  try {
    for (const target of Object.keys(cli.PROFILES)) {
      const build = (withSdd) => cli.runConfigure({ sourceDir: ROOT, target, outDir: path.join(box.dest, `${target}-${withSdd}`), validate: false, withSdd }).summary;
      const lean = build(false);
      const full = build(true);
      const sdd = (paths) => paths.filter(hasSddPath);
      assert.deepEqual(sdd(lean), [], `${target}: the default build ships SDD files`);
      assert.ok(!lean.some((p) => /sdd-orchestrator|(^|\/)ospec-workflow\.md$/.test(p) && !p.startsWith("scripts/")), `${target}: the default build ships the orchestrator`);
      assert.ok(lean.includes("skills/idd/SKILL.md"), `${target}: IDD is in the default build`);
      assert.ok(lean.some((p) => p.includes("review-trust")), `${target}: IDD's trust reviewer is in the default build`);
      assert.ok(sdd(full).some((p) => p.includes("sdd-apply")), `${target}: --with-sdd ships the phases`);
      assert.ok(full.some((p) => p.includes("sdd-orchestrator") || /(^|\/)ospec-workflow\.md$/.test(p)), `${target}: --with-sdd ships the orchestrator`);
    }
    assert.equal(cli.parseArgs(["--with-sdd"]).withSdd, true);
  } finally {
    fs.rmSync(box.root, { recursive: true, force: true });
  }
});
