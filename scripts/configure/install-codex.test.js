"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  parseArgs,
  findCodexBin,
  buildCodexMarketplace,
  copyCodexAgents,
  extractManagedCodexConfig,
  mergeManagedCodexConfig,
  assertManagedPathSafe,
  main,
} = require("./install-codex.js");

function makeTempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function readRepoFile(...segments) {
  return fs.readFileSync(path.join(__dirname, "..", "..", ...segments), "utf8");
}

function writeGeneratedCodexTree(root) {
  fs.mkdirSync(path.join(root, ".codex", "agents"), { recursive: true });
  fs.mkdirSync(path.join(root, ".codex-plugin"), { recursive: true });
  fs.mkdirSync(path.join(root, "skills", "example"), { recursive: true });
  fs.writeFileSync(path.join(root, ".codex", "agents", "apply.toml"), 'name = "apply"\n');
  fs.writeFileSync(path.join(root, ".codex", "agents", "verify.toml"), 'name = "verify"\n');
  fs.writeFileSync(path.join(root, ".codex", "agents", "README.md"), "ignore\n");
  fs.writeFileSync(
    path.join(root, ".codex", "config.toml"),
    'skills.config = "skills/**/*.md"\n\n[agents]\nmax_output_tokens = 65536\nmax_tool_calls = 32\n',
  );
  fs.writeFileSync(path.join(root, ".codex-plugin", "plugin.json"), JSON.stringify({ skills: "skills/" }, null, 2));
  fs.writeFileSync(path.join(root, "skills", "example", "SKILL.md"), "example\n");
}

test("parseArgs parses global setup defaults and repo install flags", () => {
  assert.deepEqual(parseArgs([]), {
    dryRun: false,
    validate: true,
    source: undefined,
    destRepo: undefined,
  });

  assert.deepEqual(parseArgs(["../repo", "--dry-run", "--no-validate", "--source", "../src"]), {
    dryRun: true,
    validate: false,
    source: "../src",
    destRepo: "../repo",
  });
});

test("findCodexBin returns the first working codex executable", () => {
  const calls = [];
  const bin = findCodexBin({
    resolveBinFromPath(binName) {
      return `C:\\path\\to\\safe\\bin\\${binName}.cmd`;
    },
    spawnSync(command) {
      calls.push(command);
      return { error: undefined };
    },
  });

  assert.equal(bin, "C:\\path\\to\\safe\\bin\\codex.cmd");
  assert.deepEqual(calls, ["C:\\path\\to\\safe\\bin\\codex.cmd"]);
});

test("extractManagedCodexConfig reads only the managed [agents] block and skills.config line", () => {
  const managed = extractManagedCodexConfig(
    '# comment\n[agents]\nmax_output_tokens = 65536\nmax_tool_calls = 32\n\n[profile]\nname = "user"\nskills.config = "skills/**/*.md"\nother = true\n',
  );

  assert.deepEqual(managed, {
    agentsLines: ["max_output_tokens = 65536", "max_tool_calls = 32"],
    skillsConfigLine: 'skills.config = "skills/**/*.md"',
  });
});

test("mergeManagedCodexConfig updates managed keys without touching unrelated config", () => {
  const result = mergeManagedCodexConfig(
    'skills.config = "skills/**/*.md"\n\n[agents]\nmax_output_tokens = 65536\nmax_tool_calls = 32\n',
    '# user comment\n[profile]\nname = "user"\n\n[agents]\nmax_output_tokens = 10\n\nskills.config = "old/**/*.md"\n',
  );

  assert.match(result, /# user comment/);
  assert.match(result, /\[profile\]\nname = "user"/);
  assert.match(result, /\[agents\]\nmax_output_tokens = 65536\nmax_tool_calls = 32/);
  assert.match(result, /skills\.config = "skills\/\*\*\/\*\.md"/);
});

test("copyCodexAgents copies only TOML agents and preserves unrelated files", (t) => {
  const sourceDir = makeTempDir(t, "codex-source-");
  const destDir = makeTempDir(t, "codex-dest-");
  writeGeneratedCodexTree(sourceDir);
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(path.join(destDir, "notes.txt"), "keep\n");

  copyCodexAgents(sourceDir, destDir);

  assert.ok(fs.existsSync(path.join(destDir, "apply.toml")));
  assert.ok(fs.existsSync(path.join(destDir, "verify.toml")));
  assert.ok(!fs.existsSync(path.join(destDir, "README.md")));
  assert.equal(fs.readFileSync(path.join(destDir, "notes.txt"), "utf8"), "keep\n");
});

test("buildCodexMarketplace wraps dist/codex as a local marketplace", (t) => {
  const sourceDir = makeTempDir(t, "codex-marketplace-source-");
  const outDir = makeTempDir(t, "codex-marketplace-out-");
  writeGeneratedCodexTree(sourceDir);

  const result = buildCodexMarketplace(sourceDir, outDir);

  assert.equal(result.marketplaceDir, outDir);
  assert.ok(fs.existsSync(path.join(outDir, "plugins", "ospec-workflow", ".codex-plugin", "plugin.json")));
  assert.ok(fs.existsSync(path.join(outDir, "marketplace.json")));
});

test("main falls back to manual Codex commands when the CLI is unavailable", (t) => {
  const sourceDir = makeTempDir(t, "codex-main-source-");
  const homeDir = makeTempDir(t, "codex-home-");
  const stdout = [];
  const stderr = [];

  const exitCode = main([], {
    cwd: sourceDir,
    homedir: () => homeDir,
    stdout: { write: (chunk) => stdout.push(chunk) },
    stderr: { write: (chunk) => stderr.push(chunk) },
    runConfigure({ outDir, validate }) {
      assert.equal(validate, true);
      writeGeneratedCodexTree(outDir);
      return { exitCode: 0, validation: null };
    },
    findCodexBin: () => null,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.join(""), "");
  assert.ok(fs.existsSync(path.join(homeDir, ".codex", "agents", "apply.toml")));
  assert.ok(fs.existsSync(path.join(homeDir, ".codex", "config.toml")));
  assert.match(stdout.join(""), /codex plugin marketplace add/i);
  assert.match(stdout.join(""), /codex plugin add ospec-workflow@ospec-tools/i);
});

test("main registers the Codex marketplace and plugin when the CLI is available", (t) => {
  const sourceDir = makeTempDir(t, "codex-main-cli-source-");
  const homeDir = makeTempDir(t, "codex-main-cli-home-");
  const stdout = [];
  const stderr = [];
  const codexCalls = [];

  const exitCode = main([], {
    cwd: sourceDir,
    homedir: () => homeDir,
    stdout: { write: (chunk) => stdout.push(chunk) },
    stderr: { write: (chunk) => stderr.push(chunk) },
    runConfigure({ outDir, validate }) {
      assert.equal(validate, true);
      writeGeneratedCodexTree(outDir);
      return { exitCode: 0, validation: null };
    },
    findCodexBin: () => "codex",
    runCodexCommand(bin, args) {
      codexCalls.push([bin, ...args]);
      return { status: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.join(""), "");
  assert.ok(fs.existsSync(path.join(homeDir, ".codex", "agents", "apply.toml")));
  assert.ok(fs.existsSync(path.join(homeDir, ".codex", "config.toml")));
  assert.deepEqual(codexCalls, [
    ["codex", "plugin", "marketplace", "add", path.join(sourceDir, "dist", "codex-marketplace")],
    ["codex", "plugin", "add", "ospec-workflow@ospec-tools"],
  ]);
  assert.match(stdout.join(""), /Done\. Codex marketplace, plugin, agents, and config are installed\./);
});

test("main installs repo-local agents and config without copying the plugin bundle", (t) => {
  const sourceDir = makeTempDir(t, "codex-repo-source-");
  const destRepo = makeTempDir(t, "codex-repo-dest-");
  const stdout = [];
  fs.writeFileSync(path.join(destRepo, "README.md"), "keep\n");

  const exitCode = main([destRepo, "--no-validate"], {
    cwd: sourceDir,
    stdout: { write: (chunk) => stdout.push(chunk) },
    stderr: { write() {} },
    runConfigure({ outDir, validate }) {
      assert.equal(validate, false);
      writeGeneratedCodexTree(outDir);
      return { exitCode: 0, validation: null };
    },
    findCodexBin: () => "codex",
    runCodexCommand() {
      throw new Error("repo install must not register marketplace commands");
    },
  });

  assert.equal(exitCode, 0);
  assert.ok(fs.existsSync(path.join(destRepo, ".codex", "agents", "apply.toml")));
  assert.ok(fs.existsSync(path.join(destRepo, ".codex", "config.toml")));
  assert.ok(!fs.existsSync(path.join(destRepo, ".codex-plugin", "plugin.json")));
  assert.equal(fs.readFileSync(path.join(destRepo, "README.md"), "utf8"), "keep\n");
  assert.match(stdout.join(""), /Done\./);
});

test("main dry-run previews actions without writing files or invoking codex", (t) => {
  const sourceDir = makeTempDir(t, "codex-dry-source-");
  const homeDir = makeTempDir(t, "codex-dry-home-");
  let codexInvocations = 0;

  const exitCode = main(["--dry-run"], {
    cwd: sourceDir,
    homedir: () => homeDir,
    stdout: { write() {} },
    stderr: { write() {} },
    runConfigure({ outDir }) {
      writeGeneratedCodexTree(outDir);
      return { exitCode: 0, validation: null };
    },
    findCodexBin: () => "codex",
    runCodexCommand() {
      codexInvocations += 1;
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(codexInvocations, 0);
  assert.ok(!fs.existsSync(path.join(homeDir, ".codex", "agents", "apply.toml")));
});

test("main fails before writes when generated .codex/config.toml is missing", (t) => {
  const sourceDir = makeTempDir(t, "codex-missing-config-source-");
  const homeDir = makeTempDir(t, "codex-missing-config-home-");
  const stdout = [];
  const stderr = [];
  let codexInvocations = 0;

  const exitCode = main([], {
    cwd: sourceDir,
    homedir: () => homeDir,
    stdout: { write: (chunk) => stdout.push(chunk) },
    stderr: { write: (chunk) => stderr.push(chunk) },
    runConfigure({ outDir }) {
      writeGeneratedCodexTree(outDir);
      fs.rmSync(path.join(outDir, ".codex", "config.toml"));
      return { exitCode: 0, validation: null };
    },
    findCodexBin: () => "codex",
    runCodexCommand() {
      codexInvocations += 1;
      return { status: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(stdout.join(""), "");
  assert.match(stderr.join(""), /ENOENT|config\.toml/i);
  assert.equal(codexInvocations, 0);
  assert.ok(!fs.existsSync(path.join(homeDir, ".codex", "agents", "apply.toml")));
  assert.ok(!fs.existsSync(path.join(homeDir, ".codex", "config.toml")));
});

test("main fails before writes when generated .codex/config.toml is invalid", (t) => {
  const sourceDir = makeTempDir(t, "codex-invalid-config-source-");
  const homeDir = makeTempDir(t, "codex-invalid-config-home-");
  const stderr = [];

  const exitCode = main([], {
    cwd: sourceDir,
    homedir: () => homeDir,
    stdout: { write() {} },
    stderr: { write: (chunk) => stderr.push(chunk) },
    runConfigure({ outDir }) {
      writeGeneratedCodexTree(outDir);
      fs.writeFileSync(path.join(outDir, ".codex", "config.toml"), "[agents]\nmax_output_tokens = 65536\n");
      return { exitCode: 0, validation: null };
    },
    findCodexBin: () => "codex",
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(""), /missing skills\.config/i);
  assert.ok(!fs.existsSync(path.join(homeDir, ".codex", "agents", "apply.toml")));
  assert.ok(!fs.existsSync(path.join(homeDir, ".codex", "config.toml")));
});

test("main rejects incomplete --source usage before build side effects", () => {
  const stderr = [];
  let runConfigureCalls = 0;

  const exitCode = main(["--source"], {
    stdout: { write() {} },
    stderr: { write: (chunk) => stderr.push(chunk) },
    runConfigure() {
      runConfigureCalls += 1;
      throw new Error("should not build");
    },
  });

  assert.equal(exitCode, 2);
  assert.equal(runConfigureCalls, 0);
  assert.match(stderr.join(""), /usage: install-codex/i);
});

test("main rejects invalid repo destinations before build side effects", (t) => {
  const sourceDir = makeTempDir(t, "codex-invalid-dest-source-");
  const missingRepo = path.join(sourceDir, "..", "missing-repo");
  const stderr = [];
  let runConfigureCalls = 0;

  const exitCode = main([missingRepo], {
    cwd: sourceDir,
    stdout: { write() {} },
    stderr: { write: (chunk) => stderr.push(chunk) },
    runConfigure() {
      runConfigureCalls += 1;
      throw new Error("should not build");
    },
  });

  assert.equal(exitCode, 2);
  assert.equal(runConfigureCalls, 0);
  assert.match(stderr.join(""), /destination is not an existing directory/i);
});

test("main returns a recovery error when codex plugin marketplace add fails without partial global writes", (t) => {
  const sourceDir = makeTempDir(t, "codex-marketplace-fail-source-");
  const homeDir = makeTempDir(t, "codex-marketplace-fail-home-");
  const stderr = [];
  const codexCalls = [];

  const exitCode = main([], {
    cwd: sourceDir,
    homedir: () => homeDir,
    stdout: { write() {} },
    stderr: { write: (chunk) => stderr.push(chunk) },
    runConfigure({ outDir }) {
      writeGeneratedCodexTree(outDir);
      return { exitCode: 0, validation: null };
    },
    findCodexBin: () => "codex",
    runCodexCommand(bin, args) {
      codexCalls.push([bin, ...args]);
      return { status: 9, stdout: "", stderr: "marketplace boom\n" };
    },
  });

  assert.equal(exitCode, 9);
  assert.deepEqual(codexCalls, [["codex", "plugin", "marketplace", "add", path.join(sourceDir, "dist", "codex-marketplace")]]);
  assert.match(stderr.join(""), /marketplace boom/);
  assert.match(stderr.join(""), /codex command failed/i);
  assert.ok(!fs.existsSync(path.join(homeDir, ".codex", "agents", "apply.toml")));
  assert.ok(!fs.existsSync(path.join(homeDir, ".codex", "config.toml")));
});

test("main returns a recovery error when codex plugin add fails without partial global writes", (t) => {
  const sourceDir = makeTempDir(t, "codex-plugin-fail-source-");
  const homeDir = makeTempDir(t, "codex-plugin-fail-home-");
  const stderr = [];
  const codexCalls = [];

  const exitCode = main([], {
    cwd: sourceDir,
    homedir: () => homeDir,
    stdout: { write() {} },
    stderr: { write: (chunk) => stderr.push(chunk) },
    runConfigure({ outDir }) {
      writeGeneratedCodexTree(outDir);
      return { exitCode: 0, validation: null };
    },
    findCodexBin: () => "codex",
    runCodexCommand(bin, args) {
      codexCalls.push([bin, ...args]);
      return args[1] === "marketplace" ? { status: 0, stdout: "", stderr: "" } : { status: 7, stdout: "", stderr: "plugin boom\n" };
    },
  });

  assert.equal(exitCode, 7);
  assert.deepEqual(codexCalls, [
    ["codex", "plugin", "marketplace", "add", path.join(sourceDir, "dist", "codex-marketplace")],
    ["codex", "plugin", "add", "ospec-workflow@ospec-tools"],
  ]);
  assert.match(stderr.join(""), /plugin boom/);
  assert.match(stderr.join(""), /codex command failed/i);
  assert.ok(!fs.existsSync(path.join(homeDir, ".codex", "agents", "apply.toml")));
  assert.ok(!fs.existsSync(path.join(homeDir, ".codex", "config.toml")));
});

test("main rejects redirected global .codex roots before writing managed files", (t) => {
  const sourceDir = makeTempDir(t, "codex-global-link-source-");
  const homeDir = makeTempDir(t, "codex-global-link-home-");
  const redirectDir = makeTempDir(t, "codex-global-link-redirect-");
  const codexRoot = path.join(homeDir, ".codex");
  const stderr = [];

  try {
    fs.symlinkSync(redirectDir, codexRoot, "junction");
  } catch {
    t.skip("symlink creation unavailable");
    return;
  }

  const exitCode = main([], {
    cwd: sourceDir,
    homedir: () => homeDir,
    stdout: { write() {} },
    stderr: { write: (chunk) => stderr.push(chunk) },
    runConfigure({ outDir }) {
      writeGeneratedCodexTree(outDir);
      return { exitCode: 0, validation: null };
    },
    findCodexBin: () => null,
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(""), /symlink|canonical|redirect/i);
  assert.deepEqual(fs.readdirSync(redirectDir), []);
});

test("main rejects redirected repo-local .codex roots before writing managed files", (t) => {
  const sourceDir = makeTempDir(t, "codex-repo-link-source-");
  const destRepo = makeTempDir(t, "codex-repo-link-dest-");
  const redirectDir = makeTempDir(t, "codex-repo-link-redirect-");
  const stderr = [];
  const codexRoot = path.join(destRepo, ".codex");

  try {
    fs.symlinkSync(redirectDir, codexRoot, "junction");
  } catch {
    t.skip("symlink creation unavailable");
    return;
  }

  const exitCode = main([destRepo], {
    cwd: sourceDir,
    stdout: { write() {} },
    stderr: { write: (chunk) => stderr.push(chunk) },
    runConfigure({ outDir }) {
      writeGeneratedCodexTree(outDir);
      return { exitCode: 0, validation: null };
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(""), /symlink|canonical|redirect/i);
  assert.deepEqual(fs.readdirSync(redirectDir), []);
});

test("package.json exposes Codex build and install scripts", () => {
  const pkg = JSON.parse(readRepoFile("package.json"));

  assert.equal(pkg.scripts["build:codex"], "node scripts/configure/cli.js --target codex --out dist/codex");
  assert.equal(pkg.scripts["setup:codex"], "node scripts/configure/install-codex.js");
  assert.equal(pkg.scripts["install:codex"], "node scripts/configure/install-codex.js");
});

test("README documents Codex commands and managed agent/config behavior", () => {
  const readme = readRepoFile("README.md");

  assert.match(readme, /`codex` \|/);
  assert.match(readme, /npm run setup:codex/);
  assert.match(readme, /npm run install:codex --/);
  assert.match(readme, /\.codex\/agents/);
  assert.match(readme, /\.codex\/config\.toml/);
});

test("plugin-installation guide documents Codex fallback, separate agent copy, and config merge", () => {
  const doc = readRepoFile("docs", "plugin-installation.md");

  assert.match(doc, /codex plugin marketplace add/i);
  assert.match(doc, /codex plugin add ospec-workflow@ospec-tools/i);
  assert.match(doc, /\.codex\/agents/);
  assert.match(doc, /\.codex\/config\.toml/);
  assert.match(doc, /preserv|no destructiv|sin destruir/i);
});

test("assertManagedPathSafe: accepts valid paths inside the root", (t) => {
  const root = makeTempDir(t, "codex-safe-root-");
  const managed = path.join(root, "agents", "apply.toml");
  fs.mkdirSync(path.dirname(managed), { recursive: true });
  fs.writeFileSync(managed, "");

  assert.doesNotThrow(() => assertManagedPathSafe(root, managed));
});

test("assertManagedPathSafe: rejects when managedPath itself is a symlink", (t) => {
  const root = makeTempDir(t, "codex-symlink-root-");
  const managed = path.join(root, "config.toml");
  const linkDest = path.join(root, "target.toml");
  fs.writeFileSync(linkDest, "");

  try {
    fs.symlinkSync(linkDest, managed, "file");
  } catch {
    t.skip("symlink creation unavailable");
    return;
  }

  assert.throws(
    () => assertManagedPathSafe(root, managed),
    /redirects through a symlinked or canonicalized path/i
  );
});

test("assertManagedPathSafe: rejects when rootPath is a symlink", (t) => {
  const realRoot = makeTempDir(t, "codex-real-root-");
  const linkRoot = path.join(os.tmpdir(), `codex-link-root-${Date.now()}`);
  const managed = path.join(linkRoot, "config.toml");

  try {
    fs.symlinkSync(realRoot, linkRoot, "junction");
  } catch {
    t.skip("symlink creation unavailable");
    return;
  }

  t.after(() => {
    try {
      fs.unlinkSync(linkRoot);
    } catch {}
  });

  assert.throws(
    () => assertManagedPathSafe(linkRoot, managed),
    /redirects through a symlinked or canonicalized root/i
  );
});

test("assertManagedPathSafe: rejects when path escapes the root via traversal", (t) => {
  const root = makeTempDir(t, "codex-traversal-root-");
  const managedOutside = path.join(root, "..", "escaped.toml");

  assert.throws(
    () => assertManagedPathSafe(root, managedOutside),
    /escapes the approved Codex root/i
  );
});

test("copyCodexAgents: validates each target file individual paths with assertManagedPathSafe", (t) => {
  const outDir = makeTempDir(t, "codex-agent-out-");
  const destDir = makeTempDir(t, "codex-agent-dest-");

  fs.mkdirSync(path.join(outDir, ".codex", "agents"), { recursive: true });
  fs.writeFileSync(path.join(outDir, ".codex", "agents", "sdd-apply.toml"), "name = 'test'");

  // Create a symlinked destination file
  const linkDest = path.join(destDir, "sdd-apply.toml");
  const realTarget = path.join(destDir, "real-target.toml");
  fs.writeFileSync(realTarget, "");

  try {
    fs.symlinkSync(realTarget, linkDest, "file");
  } catch {
    t.skip("symlink creation unavailable");
    return;
  }

  assert.throws(
    () => copyCodexAgents(outDir, destDir, { fs }),
    /redirects through a symlinked or canonicalized path/i
  );
});
