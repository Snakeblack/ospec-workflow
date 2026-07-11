"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  parseArgs,
  findCodexBin,
  resolveCodexInvocation,
  copyCodexAgents,
  installCodexHooks,
  copyCodexRuntime,
  syncCodexAgentSkills,
  readCodexMcpDefinitions,
  ensureCodexMcps,
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
  fs.writeFileSync(path.join(root, ".codex", "agents", "apply.toml"), 'name = "apply"\n');
  fs.writeFileSync(path.join(root, ".codex", "agents", "verify.toml"), 'name = "verify"\n');
  fs.writeFileSync(path.join(root, ".codex", "agents", "README.md"), "ignore\n");
  fs.writeFileSync(path.join(root, "agent.md"), "orchestrator instructions\n");
  fs.mkdirSync(path.join(root, "scripts", "hooks"), { recursive: true });
  fs.mkdirSync(path.join(root, "skills", "apply"), { recursive: true });
  fs.mkdirSync(path.join(root, "skills", "verify"), { recursive: true });
  fs.mkdirSync(path.join(root, "skills", "_shared"), { recursive: true });
  fs.writeFileSync(path.join(root, "scripts", "hooks", "session-start.js"), "// runtime\n");
  fs.writeFileSync(path.join(root, "skills", "apply", "SKILL.md"), "# Apply\n");
  fs.writeFileSync(path.join(root, "skills", "verify", "SKILL.md"), "# Verify\n");
  fs.writeFileSync(path.join(root, "skills", "_shared", "shared.md"), "shared\n");
  fs.writeFileSync(
    path.join(root, "hooks.json"),
    JSON.stringify({
      hooks: {
        SessionStart: [{ matcher: ".*", hooks: [{ type: "command", command: 'OSPEC_TARGET=codex OSPEC_CODEX_WRAPPER=1 node "__OSPEC_RUNTIME__/scripts/hooks/session-start.js"', commandWindows: 'set OSPEC_TARGET=codex&& set OSPEC_CODEX_WRAPPER=1&& node "__OSPEC_RUNTIME__\\scripts\\hooks\\session-start.js"', timeout: 10 }] }],
      },
    }, null, 2),
  );
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

test("global native runtime installs hooks and keeps skills outside the runtime", (t) => {
  const outDir = makeTempDir(t, "codex-runtime-source-");
  const codexRoot = makeTempDir(t, "codex-runtime-dest-");
  writeGeneratedCodexTree(outDir);
  fs.writeFileSync(
    path.join(codexRoot, "hooks.json"),
    JSON.stringify({ hooks: { Stop: [{ matcher: "^Bash$", hooks: [{ type: "command", command: "user-hook" }] }] } }),
  );

  const runtimeDir = path.join(codexRoot, "ospec-workflow");
  const skillsRoot = path.join(codexRoot, "..", ".agents", "skills");
  copyCodexRuntime(outDir, runtimeDir);
  syncCodexAgentSkills(outDir, skillsRoot);
  installCodexHooks(outDir, codexRoot, runtimeDir);

  const installed = JSON.parse(fs.readFileSync(path.join(codexRoot, "hooks.json"), "utf8"));
  assert.equal(installed.hooks.Stop[0].hooks[0].command, "user-hook");
  assert.match(installed.hooks.SessionStart[0].hooks[0].command, /ospec-workflow[\\/]scripts[\\/]hooks/);
  assert.doesNotMatch(installed.hooks.SessionStart[0].hooks[0].command, /__OSPEC_RUNTIME__/);
  assert.ok(fs.existsSync(path.join(runtimeDir, "scripts", "hooks", "session-start.js")));
  assert.ok(!fs.existsSync(path.join(runtimeDir, "skills")));
  assert.equal(fs.readFileSync(path.join(skillsRoot, "apply", "SKILL.md"), "utf8"), "# Apply\n");
  assert.equal(fs.readFileSync(path.join(skillsRoot, "verify", "SKILL.md"), "utf8"), "# Verify\n");
  assert.ok(fs.existsSync(path.join(skillsRoot, "_shared", "shared.md")));
});

test("syncCodexAgentSkills updates differing content and skips byte-identical files", (t) => {
  const outDir = makeTempDir(t, "codex-skills-source-");
  const skillsRoot = makeTempDir(t, "codex-skills-dest-");
  writeGeneratedCodexTree(outDir);
  fs.mkdirSync(path.join(skillsRoot, "apply"), { recursive: true });
  fs.writeFileSync(path.join(skillsRoot, "apply", "SKILL.md"), "old\n");

  const first = syncCodexAgentSkills(outDir, skillsRoot);
  const second = syncCodexAgentSkills(outDir, skillsRoot);

  assert.equal(fs.readFileSync(path.join(skillsRoot, "apply", "SKILL.md"), "utf8"), "# Apply\n");
  assert.ok(first.updated.some((file) => file.endsWith(path.join("apply", "SKILL.md"))));
  assert.equal(second.updated.length, 0);
});



test("resolveCodexInvocation runs the npm Windows shim through node without a shell", (t) => {
  const root = makeTempDir(t, "codex-npm-shim-");
  const shim = path.join(root, "codex.cmd");
  const cli = path.join(root, "node_modules", "@openai", "codex", "bin", "codex.js");
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.writeFileSync(shim, "@echo off\n");
  fs.writeFileSync(cli, "// fixture\n");

  const invocation = resolveCodexInvocation(shim, ["mcp", "list", "--json"], {
    platform: "win32",
    execPath: "C:\\node\\node.exe",
  });

  assert.deepEqual(invocation, {
    command: "C:\\node\\node.exe",
    args: [cli, "mcp", "list", "--json"],
  });
});

test("ensureCodexMcps skips equivalent pre-existing servers and adds only missing definitions", () => {
  const calls = [];
  const stdout = [];
  const definitions = [
    { name: "context7", command: "npx", args: ["@upstash/context7-mcp@1.0.31"] },
    { name: "markitdown", command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
  ];

  const exitCode = ensureCodexMcps("codex", definitions, {
    stdout: { write: (chunk) => stdout.push(chunk) },
    stderr: { write() {} },
    runCodexCommand(bin, args) {
      calls.push([bin, ...args]);
      if (args.join(" ") === "mcp list --json") {
        return {
          status: 0,
          stdout: JSON.stringify([
            {
              name: "my-existing-doc-converter",
              transport: {
                type: "stdio",
                command: "uvx",
                args: ["markitdown-mcp@0.0.1a4"],
              },
            },
          ]),
          stderr: "",
        };
      }
      return { status: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    ["codex", "mcp", "list", "--json"],
    ["codex", "mcp", "add", "context7", "--", "npx", "@upstash/context7-mcp@1.0.31"],
  ]);
  assert.match(stdout.join(""), /reusing existing MCP.*my-existing-doc-converter/i);
});

test("readCodexMcpDefinitions normalizes legacy slash-qualified names for Codex", (t) => {
  const sourceDir = makeTempDir(t, "codex-legacy-mcp-");
  fs.writeFileSync(
    path.join(sourceDir, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        "io.github.upstash/context7": {
          command: "npx",
          args: ["@upstash/context7-mcp@1.0.31"],
        },
        "microsoft/markitdown": {
          command: "uvx",
          args: ["markitdown-mcp@0.0.1a4"],
        },
      },
    }),
  );

  assert.deepEqual(readCodexMcpDefinitions(sourceDir), [
    { name: "context7", command: "npx", args: ["@upstash/context7-mcp@1.0.31"] },
    { name: "markitdown", command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
  ]);
});

test("ensureCodexMcps is idempotent when all required identities already exist", () => {
  const calls = [];
  const definitions = [
    { name: "markitdown", command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
  ];

  const exitCode = ensureCodexMcps("codex", definitions, {
    stdout: { write() {} },
    stderr: { write() {} },
    runCodexCommand(bin, args) {
      calls.push([bin, ...args]);
      return {
        status: 0,
        stdout: JSON.stringify([
          {
            name: "markitdown",
            transport: { type: "stdio", command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
          },
        ]),
        stderr: "",
      };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [["codex", "mcp", "list", "--json"]]);
});

test("main falls back to manual Codex commands when the CLI is unavailable", (t) => {
  const sourceDir = makeTempDir(t, "codex-main-source-");
  const homeDir = makeTempDir(t, "codex-home-");
  const stdout = [];
  const stderr = [];

  fs.writeFileSync(
    path.join(sourceDir, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        markitdown: { command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
      },
    }),
  );

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
  assert.ok(fs.existsSync(path.join(homeDir, ".codex", "AGENTS.md")));
  assert.ok(!fs.existsSync(path.join(homeDir, ".codex", "config.toml")));
  assert.match(stdout.join(""), /codex mcp add/i);
});

test("main installs repo-local agents without changing an existing config or copying the plugin bundle", (t) => {
  const sourceDir = makeTempDir(t, "codex-repo-source-");
  const destRepo = makeTempDir(t, "codex-repo-dest-");
  const stdout = [];
  fs.writeFileSync(path.join(destRepo, "README.md"), "keep\n");
  fs.mkdirSync(path.join(destRepo, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(destRepo, ".codex", "config.toml"), "model = \"user-choice\"\n");

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
  assert.ok(fs.existsSync(path.join(destRepo, "agent.md")));
  assert.equal(fs.readFileSync(path.join(destRepo, ".codex", "config.toml"), "utf8"), "model = \"user-choice\"\n");
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

test("README documents the native global Codex installation", () => {
  const readme = readRepoFile("README.md");

  assert.match(readme, /`codex` \|/);
  assert.match(readme, /npm run setup:codex/);
  assert.match(readme, /npm run install:codex --/);
  assert.match(readme, /hooks\.json/);
  assert.match(readme, /ospec-workflow/);
  assert.doesNotMatch(readme, /codex plugin marketplace add/i);
  assert.doesNotMatch(readme, /fusiona `.codex\/config\.toml`/);
  assert.match(readme, /claves no compatibles/i);
  assert.match(readme, /manualmente/i);
});

test("plugin-installation guide documents native global Codex hooks and runtime", () => {
  const doc = readRepoFile("docs", "plugin-installation.md");

  assert.match(doc, /Instalación global nativa/i);
  assert.match(doc, /hooks\.json/);
  assert.match(doc, /ospec-workflow/);
  assert.doesNotMatch(doc, /fusiona.*\.codex\/config\.toml/i);
  assert.match(doc, /claves no compatibles/i);
  assert.match(doc, /manualmente/i);
});

test("install baseline specifies the native global Codex contract", () => {
  const spec = readRepoFile("openspec", "specs", "install", "spec.md");

  assert.match(spec, /hooks\.json/);
  assert.match(spec, /without a plugin or marketplace/i);
  assert.match(spec, /MUST NOT modify the destination project's `\.codex\/config\.toml`/i);
  assert.match(spec, /codex mcp add/i);
  assert.match(spec, /command plus ordered arguments/i);
  assert.match(spec, /runtime placeholder/i);
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

test("main repo install is idempotent: re-running twice converges without duplicating TOML entries or touching config.toml", (t) => {
  const sourceDir = makeTempDir(t, "codex-idempotent-source-");
  const destRepo = makeTempDir(t, "codex-idempotent-dest-");
  fs.mkdirSync(path.join(destRepo, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(destRepo, ".codex", "config.toml"), "model = \"user-choice\"\n");

  const runOnce = () =>
    main([destRepo, "--no-validate"], {
      cwd: sourceDir,
      stdout: { write() {} },
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

  const firstExit = runOnce();
  const agentsDir = path.join(destRepo, ".codex", "agents");
  const firstListing = fs.readdirSync(agentsDir).sort();
  const firstContent = fs.readFileSync(path.join(agentsDir, "apply.toml"), "utf8");

  const secondExit = runOnce();
  const secondListing = fs.readdirSync(agentsDir).sort();
  const secondContent = fs.readFileSync(path.join(agentsDir, "apply.toml"), "utf8");

  assert.equal(firstExit, 0);
  assert.equal(secondExit, 0);
  assert.deepEqual(secondListing, firstListing);
  assert.equal(secondContent, firstContent);
  assert.equal(
    fs.readFileSync(path.join(destRepo, ".codex", "config.toml"), "utf8"),
    "model = \"user-choice\"\n",
  );
  assert.ok(!fs.existsSync(path.join(destRepo, ".codex-plugin", "plugin.json")));
});

test("main global install is idempotent across the plugin channel and the agent channel independently", (t) => {
  const sourceDir = makeTempDir(t, "codex-idempotent-global-source-");
  const homeDir = makeTempDir(t, "codex-idempotent-global-home-");
  const codexCalls = [];
  const configuredMcps = [];
  fs.writeFileSync(
    path.join(sourceDir, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        markitdown: { command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
      },
    }),
  );

  const runOnce = () =>
    main([], {
      cwd: sourceDir,
      homedir: () => homeDir,
      stdout: { write() {} },
      stderr: { write() {} },
      runConfigure({ outDir, validate }) {
        assert.equal(validate, true);
        writeGeneratedCodexTree(outDir);
        return { exitCode: 0, validation: null };
      },
      findCodexBin: () => "codex",
      runCodexCommand(bin, args) {
        codexCalls.push([bin, ...args]);
        if (args.join(" ") === "mcp list --json") {
          return { status: 0, stdout: JSON.stringify(configuredMcps), stderr: "" };
        }
        if (args.slice(0, 3).join(" ") === "mcp add markitdown") {
          configuredMcps.push({
            name: "markitdown",
            transport: { type: "stdio", command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
          });
        }
        return { status: 0, stdout: "", stderr: "" };
      },
    });

  const firstExit = runOnce();
  const agentsDir = path.join(homeDir, ".codex", "agents");
  const firstAgents = fs.readdirSync(agentsDir).sort();
  const firstAgentMd = fs.readFileSync(path.join(homeDir, ".codex", "AGENTS.md"), "utf8");

  const secondExit = runOnce();
  const secondAgents = fs.readdirSync(agentsDir).sort();
  const secondAgentMd = fs.readFileSync(path.join(homeDir, ".codex", "AGENTS.md"), "utf8");

  assert.equal(firstExit, 0);
  assert.equal(secondExit, 0);
  assert.deepEqual(secondAgents, firstAgents);
  assert.equal(secondAgentMd, firstAgentMd);
  assert.ok(!fs.existsSync(path.join(homeDir, ".codex", "config.toml")));
  assert.equal(codexCalls.filter((call) => call.slice(1, 4).join(" ") === "mcp add markitdown").length, 1);
  assert.equal(codexCalls.filter((call) => call.slice(1).join(" ") === "mcp list --json").length, 2);
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
