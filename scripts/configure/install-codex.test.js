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
  syncCodexSkills,
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

function snapshotTree(root) {
  const snapshot = [];
  const walk = (absolute, relative = "") => {
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const childRelative = relative ? path.join(relative, entry.name) : entry.name;
      const childAbsolute = path.join(absolute, entry.name);
      const stat = fs.lstatSync(childAbsolute);
      if (entry.isDirectory()) {
        snapshot.push(["dir", childRelative, stat.mode & 0o777]);
        walk(childAbsolute, childRelative);
      } else if (entry.isFile()) {
        snapshot.push(["file", childRelative, stat.mode & 0o777, fs.readFileSync(childAbsolute, "hex")]);
      } else {
        snapshot.push(["other", childRelative, stat.mode & 0o777]);
      }
    }
  };
  walk(root);
  return snapshot;
}

function failOnceFs(method, destinationPattern) {
  let failed = false;
  return new Proxy(fs, {
    get(target, property) {
      if (property !== method) return target[property];
      return (...args) => {
        const destination = method === "copyFileSync" ? args[1] : args[0];
        if (!failed && destinationPattern.test(String(destination))) {
          failed = true;
          const error = new Error(`injected ${method} failure`);
          error.code = "EIO";
          throw error;
        }
        return target[property](...args);
      };
    },
  });
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
  fs.mkdirSync(path.join(root, "skills", "standalone-tool", "references"), { recursive: true });
  fs.writeFileSync(path.join(root, "scripts", "hooks", "session-start.js"), "// runtime\n");
  fs.writeFileSync(path.join(root, "skills", "apply", "SKILL.md"), "# Apply\n");
  fs.writeFileSync(path.join(root, "skills", "verify", "SKILL.md"), "# Verify\n");
  fs.writeFileSync(path.join(root, "skills", "_shared", "shared.md"), "shared\n");
  fs.writeFileSync(path.join(root, "skills", "standalone-tool", "SKILL.md"), "# Standalone\n");
  fs.writeFileSync(path.join(root, "skills", "standalone-tool", "references", "nested.txt"), "nested\n");
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
  syncCodexSkills(outDir, skillsRoot);
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
  assert.equal(fs.readFileSync(path.join(skillsRoot, "standalone-tool", "SKILL.md"), "utf8"), "# Standalone\n");
  assert.equal(fs.readFileSync(path.join(skillsRoot, "standalone-tool", "references", "nested.txt"), "utf8"), "nested\n");
});

test("copyCodexRuntime refreshes changed runtime bytes and is idempotent", (t) => {
  const outDir = makeTempDir(t, "codex-runtime-sync-source-");
  const runtimeDir = makeTempDir(t, "codex-runtime-sync-dest-");
  const sourceHook = path.join(outDir, "scripts", "hooks", "subagent-stop.js");
  const installedHook = path.join(runtimeDir, "scripts", "hooks", "subagent-stop.js");
  fs.mkdirSync(path.dirname(sourceHook), { recursive: true });
  fs.writeFileSync(sourceHook, "runtime-v1\n");

  const first = copyCodexRuntime(outDir, runtimeDir);
  fs.writeFileSync(sourceHook, "runtime-v2\n");
  const second = copyCodexRuntime(outDir, runtimeDir);
  const third = copyCodexRuntime(outDir, runtimeDir);

  assert.equal(fs.readFileSync(installedHook, "utf8"), "runtime-v2\n");
  assert.ok(first.updated.some((file) => file.endsWith(path.join("scripts", "hooks", "subagent-stop.js"))));
  assert.ok(second.updated.some((file) => file.endsWith(path.join("scripts", "hooks", "subagent-stop.js"))));
  assert.equal(third.updated.length, 0);
  assert.ok(third.unchanged.some((file) => file.endsWith(path.join("scripts", "hooks", "subagent-stop.js"))));
});

test("copyCodexRuntime is a no-op when the generated runtime is absent", (t) => {
  const outDir = makeTempDir(t, "codex-runtime-absent-source-");
  const runtimeDir = makeTempDir(t, "codex-runtime-absent-dest-");

  assert.deepEqual(copyCodexRuntime(outDir, runtimeDir, { fs }), { updated: [], unchanged: [] });
  assert.deepEqual(fs.readdirSync(runtimeDir), []);
});

test("syncCodexSkills installs every generated skill recursively, preserves extras, and is idempotent", (t) => {
  const outDir = makeTempDir(t, "codex-skills-source-");
  const skillsRoot = makeTempDir(t, "codex-skills-dest-");
  writeGeneratedCodexTree(outDir);
  fs.mkdirSync(path.join(skillsRoot, "apply"), { recursive: true });
  fs.writeFileSync(path.join(skillsRoot, "apply", "SKILL.md"), "old\n");
  fs.mkdirSync(path.join(skillsRoot, "user-extra"), { recursive: true });
  fs.writeFileSync(path.join(skillsRoot, "user-extra", "SKILL.md"), "keep\n");
  fs.mkdirSync(path.join(skillsRoot, "stale-ospec"), { recursive: true });
  fs.writeFileSync(path.join(skillsRoot, "stale-ospec", "SKILL.md"), "preserve-without-manifest\n");

  const first = syncCodexSkills(outDir, skillsRoot);
  const second = syncCodexSkills(outDir, skillsRoot);

  assert.equal(fs.readFileSync(path.join(skillsRoot, "apply", "SKILL.md"), "utf8"), "# Apply\n");
  assert.equal(fs.readFileSync(path.join(skillsRoot, "standalone-tool", "SKILL.md"), "utf8"), "# Standalone\n");
  assert.equal(fs.readFileSync(path.join(skillsRoot, "standalone-tool", "references", "nested.txt"), "utf8"), "nested\n");
  assert.equal(fs.readFileSync(path.join(skillsRoot, "user-extra", "SKILL.md"), "utf8"), "keep\n");
  assert.equal(fs.readFileSync(path.join(skillsRoot, "stale-ospec", "SKILL.md"), "utf8"), "preserve-without-manifest\n");
  assert.ok(first.updated.some((file) => file.endsWith(path.join("apply", "SKILL.md"))));
  assert.equal(second.updated.length, 0);
});

test("syncCodexSkills fails closed before a nested destination symlink can escape", (t) => {
  const outDir = makeTempDir(t, "codex-skills-symlink-source-");
  const homeDir = makeTempDir(t, "codex-skills-symlink-home-");
  const outsideDir = makeTempDir(t, "codex-skills-symlink-outside-");
  const skillsRoot = path.join(homeDir, ".agents", "skills");
  writeGeneratedCodexTree(outDir);
  fs.mkdirSync(skillsRoot, { recursive: true });

  try {
    fs.symlinkSync(outsideDir, path.join(skillsRoot, "standalone-tool"), "junction");
  } catch {
    t.skip("symlink creation unavailable");
    return;
  }

  assert.throws(
    () => syncCodexSkills(outDir, skillsRoot, { approvedRoot: homeDir }),
    /redirects through a symlinked or canonicalized path/i,
  );
  assert.ok(!fs.existsSync(path.join(outsideDir, "SKILL.md")));
  assert.ok(!fs.existsSync(path.join(skillsRoot, "apply", "SKILL.md")), "preflight must prevent partial skill writes");
});

test("syncCodexSkills fails closed when the generated skills root is missing or redirected", (t) => {
  const outDir = makeTempDir(t, "codex-skills-invalid-source-");
  const skillsRoot = makeTempDir(t, "codex-skills-invalid-dest-");

  assert.throws(
    () => syncCodexSkills(outDir, skillsRoot, { fs }),
    /generated Codex skills root must be a real directory/i,
  );

  const outsideDir = makeTempDir(t, "codex-skills-source-outside-");
  fs.writeFileSync(path.join(outsideDir, "SKILL.md"), "outside\n");
  try {
    fs.symlinkSync(outsideDir, path.join(outDir, "skills"), "junction");
  } catch {
    t.skip("symlink creation unavailable");
    return;
  }

  assert.throws(
    () => syncCodexSkills(outDir, skillsRoot, { fs }),
    /generated Codex skills root must be a real directory/i,
  );
  assert.deepEqual(fs.readdirSync(skillsRoot), []);
});

test("syncCodexSkills rejects non-file entries in the generated skill tree", (t) => {
  const outDir = makeTempDir(t, "codex-skills-special-source-");
  const skillsRoot = makeTempDir(t, "codex-skills-special-dest-");
  const outsideDir = makeTempDir(t, "codex-skills-special-outside-");
  fs.mkdirSync(path.join(outDir, "skills"), { recursive: true });
  try {
    fs.symlinkSync(outsideDir, path.join(outDir, "skills", "redirected"), "junction");
  } catch {
    t.skip("symlink creation unavailable");
    return;
  }

  assert.throws(
    () => syncCodexSkills(outDir, skillsRoot, { fs }),
    /must be a regular file or directory/i,
  );
  assert.deepEqual(fs.readdirSync(skillsRoot), []);
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

test("readCodexMcpDefinitions rejects unknown or changed identities without echoing untrusted values", (t) => {
  const sourceDir = makeTempDir(t, "codex-untrusted-mcp-");
  const cases = [
    { "unknown-secret-name": { command: "secret-command", args: ["secret-arg"] } },
    { context7: { command: "secret-command", args: ["@upstash/context7-mcp@1.0.31"] } },
    { markitdown: { command: "uvx", args: ["secret-arg"] } },
  ];

  for (const mcpServers of cases) {
    fs.writeFileSync(path.join(sourceDir, ".mcp.json"), JSON.stringify({ mcpServers }));
    assert.throws(
      () => readCodexMcpDefinitions(sourceDir),
      (error) => {
        assert.match(error.message, /unsupported Codex MCP definition/i);
        assert.doesNotMatch(error.message, /secret/i);
        return true;
      },
    );
  }
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

test("ensureCodexMcps removes only additions from the current attempt when a later add fails", () => {
  const calls = [];
  const definitions = [
    { name: "context7", command: "npx", args: ["@upstash/context7-mcp@1.0.31"] },
    { name: "markitdown", command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
  ];
  const exitCode = ensureCodexMcps("codex", definitions, {
    stdout: { write() {} },
    stderr: { write() {} },
    runCodexCommand(bin, args) {
      calls.push([bin, ...args]);
      if (args.join(" ") === "mcp list --json") {
        return {
          status: 0,
          stdout: JSON.stringify([{
            name: "user-owned",
            transport: { type: "stdio", command: "user-command", args: [] },
          }]),
          stderr: "",
        };
      }
      if (args.slice(0, 3).join(" ") === "mcp add markitdown") {
        return { status: 9, stdout: "", stderr: "add failed\n" };
      }
      return { status: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(exitCode, 9);
  assert.deepEqual(calls, [
    ["codex", "mcp", "list", "--json"],
    ["codex", "mcp", "add", "context7", "--", "npx", "@upstash/context7-mcp@1.0.31"],
    ["codex", "mcp", "add", "markitdown", "--", "uvx", "markitdown-mcp@0.0.1a4"],
    ["codex", "mcp", "remove", "context7"],
  ]);
  assert.ok(!calls.some((call) => call.slice(1).join(" ") === "mcp remove user-owned"));
});

test("ensureCodexMcps compensates prior additions when a later CLI invocation throws", () => {
  const calls = [];
  assert.equal(ensureCodexMcps("codex", [
    { name: "context7", command: "npx", args: ["@upstash/context7-mcp@1.0.31"] },
    { name: "markitdown", command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
  ], {
    stdout: { write() {} },
    stderr: { write() {} },
    runCodexCommand(bin, args) {
      calls.push([bin, ...args]);
      if (args.join(" ") === "mcp list --json") return { status: 0, stdout: "[]", stderr: "" };
      if (args.slice(0, 3).join(" ") === "mcp add markitdown") throw new Error("runner failed");
      return { status: 0, stdout: "", stderr: "" };
    },
  }), 1);
  assert.deepEqual(calls.at(-1), ["codex", "mcp", "remove", "context7"]);
});

test("ensureCodexMcps rejects unsupported direct definitions before invoking the CLI", () => {
  const stderr = [];
  let calls = 0;
  const exitCode = ensureCodexMcps("codex", [{
    name: "unknown-secret-name",
    command: "secret-command",
    args: ["secret-arg"],
  }], {
    stderr: { write: (chunk) => stderr.push(chunk) },
    runCodexCommand() {
      calls += 1;
      return { status: 0, stdout: "[]", stderr: "" };
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(calls, 0);
  assert.match(stderr.join(""), /unsupported Codex MCP definition/i);
  assert.doesNotMatch(stderr.join(""), /secret/i);
});

test("ensureCodexMcps fails closed on unusable list responses", () => {
  const definition = [{ name: "context7", command: "npx", args: ["@upstash/context7-mcp@1.0.31"] }];
  const stderr = [];
  const responses = [
    { status: null, stdout: "[]", stderr: "list failed\n" },
    { status: 0, stdout: "not-json", stderr: "" },
    { status: 0, stdout: "{}", stderr: "" },
  ];

  assert.equal(ensureCodexMcps("codex", [], { runCodexCommand() { throw new Error("must not run"); } }), 0);
  for (const response of responses) {
    assert.equal(ensureCodexMcps("codex", definition, {
      stderr: { write: (chunk) => stderr.push(chunk) },
      stdout: { write() {} },
      runCodexCommand: () => response,
    }), 1);
  }
  assert.match(stderr.join(""), /failed while listing|invalid JSON|unexpected JSON shape/);
});

test("installCodexHooks rejects malformed generated and existing hook maps without overwriting", (t) => {
  const outDir = makeTempDir(t, "codex-hooks-invalid-source-");
  const codexRoot = makeTempDir(t, "codex-hooks-invalid-dest-");
  const runtimeDir = path.join(codexRoot, "ospec-workflow");

  assert.equal(installCodexHooks(outDir, codexRoot, runtimeDir, { fs }), undefined);
  fs.writeFileSync(path.join(outDir, "hooks.json"), "{}\n");
  assert.throws(
    () => installCodexHooks(outDir, codexRoot, runtimeDir, { fs }),
    /generated Codex hooks\.json must contain a hooks object/i,
  );

  fs.writeFileSync(path.join(outDir, "hooks.json"), JSON.stringify({ hooks: { Stop: [] } }));
  fs.writeFileSync(path.join(codexRoot, "hooks.json"), JSON.stringify({ hooks: [] }));
  const before = fs.readFileSync(path.join(codexRoot, "hooks.json"), "utf8");
  assert.throws(
    () => installCodexHooks(outDir, codexRoot, runtimeDir, { fs }),
    /existing Codex hooks\.json must contain a hooks object/i,
  );
  assert.equal(fs.readFileSync(path.join(codexRoot, "hooks.json"), "utf8"), before);
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
  fs.mkdirSync(path.join(homeDir, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(homeDir, ".codex", "config.toml"), "model = \"user-choice\"\n");
  fs.writeFileSync(path.join(homeDir, ".codex", "auth.json"), "{\"token\":\"user-owned\"}\n");
  fs.mkdirSync(path.join(homeDir, ".agents", "skills", "user-extra"), { recursive: true });
  fs.writeFileSync(path.join(homeDir, ".agents", "skills", "user-extra", "SKILL.md"), "keep\n");
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
  assert.equal(fs.readFileSync(path.join(homeDir, ".codex", "config.toml"), "utf8"), "model = \"user-choice\"\n");
  assert.equal(fs.readFileSync(path.join(homeDir, ".codex", "auth.json"), "utf8"), "{\"token\":\"user-owned\"}\n");
  assert.equal(fs.readFileSync(path.join(homeDir, ".agents", "skills", "user-extra", "SKILL.md"), "utf8"), "keep\n");
  assert.ok(fs.existsSync(path.join(homeDir, ".agents", "skills", "standalone-tool", "references", "nested.txt")));
  assert.equal(codexCalls.filter((call) => call.slice(1, 4).join(" ") === "mcp add markitdown").length, 1);
  assert.equal(codexCalls.filter((call) => call.slice(1).join(" ") === "mcp list --json").length, 2);
});

test("main rolls back managed filesystem bytes and modes after failures at every install stage", (t) => {
  const failures = [
    ["copyFileSync", /[\\/]\.codex[\\/]agents[\\/]apply\.toml$/],
    ["copyFileSync", /[\\/]\.codex[\\/]ospec-workflow[\\/]scripts[\\/]hooks[\\/]session-start\.js$/],
    ["copyFileSync", /[\\/]\.agents[\\/]skills[\\/]standalone-tool[\\/]SKILL\.md$/],
    ["writeFileSync", /[\\/]\.codex[\\/]hooks\.json$/],
    ["rmSync", /[\\/]\.codex[\\/]ospec-workflow[\\/]skills$/],
  ];

  for (const [method, pattern] of failures) {
    const sourceDir = makeTempDir(t, `codex-rollback-source-${method}-`);
    const homeDir = makeTempDir(t, `codex-rollback-home-${method}-`);
    fs.mkdirSync(path.join(homeDir, ".codex", "agents"), { recursive: true });
    fs.mkdirSync(path.join(homeDir, ".codex", "ospec-workflow", "scripts", "hooks"), { recursive: true });
    fs.mkdirSync(path.join(homeDir, ".codex", "ospec-workflow", "skills", "legacy"), { recursive: true });
    fs.mkdirSync(path.join(homeDir, ".agents", "skills", "apply"), { recursive: true });
    fs.mkdirSync(path.join(homeDir, ".agents", "skills", "user-extra"), { recursive: true });
    fs.writeFileSync(path.join(homeDir, ".codex", "AGENTS.md"), "old-agent\n");
    fs.writeFileSync(path.join(homeDir, ".codex", "agents", "apply.toml"), "old-apply\n");
    fs.chmodSync(path.join(homeDir, ".codex", "agents", "apply.toml"), 0o600);
    fs.writeFileSync(path.join(homeDir, ".codex", "ospec-workflow", "scripts", "hooks", "session-start.js"), "old-runtime\n");
    fs.writeFileSync(path.join(homeDir, ".codex", "ospec-workflow", "skills", "legacy", "SKILL.md"), "old-legacy\n");
    fs.writeFileSync(path.join(homeDir, ".agents", "skills", "apply", "SKILL.md"), "old-skill\n");
    fs.writeFileSync(path.join(homeDir, ".agents", "skills", "user-extra", "SKILL.md"), "keep-extra\n");
    fs.writeFileSync(path.join(homeDir, ".codex", "hooks.json"), JSON.stringify({ hooks: { Stop: [{ matcher: ".*", hooks: [{ command: "user-hook" }] }] } }));
    fs.writeFileSync(path.join(homeDir, ".codex", "config.toml"), "model = \"user-choice\"\n");
    fs.writeFileSync(path.join(homeDir, ".codex", "auth.json"), "{\"token\":\"user-owned\"}\n");
    const before = snapshotTree(homeDir);

    const runInstall = (fsImpl) => main([], {
      cwd: sourceDir,
      homedir: () => homeDir,
      fs: fsImpl,
      stdout: { write() {} },
      stderr: { write() {} },
      findCodexBin: () => null,
      runConfigure({ outDir }) {
        writeGeneratedCodexTree(outDir);
        return { exitCode: 0, validation: null };
      },
    });

    assert.equal(runInstall(failOnceFs(method, pattern)), 1, `${method} ${pattern} must fail the install`);
    assert.deepEqual(snapshotTree(homeDir), before, `${method} ${pattern} must restore the exact prior tree`);
    assert.equal(runInstall(fs), 0, `${method} ${pattern} must allow a clean second run`);
    assert.equal(fs.readFileSync(path.join(homeDir, ".agents", "skills", "user-extra", "SKILL.md"), "utf8"), "keep-extra\n");
    assert.equal(fs.readFileSync(path.join(homeDir, ".codex", "config.toml"), "utf8"), "model = \"user-choice\"\n");
    assert.equal(fs.readFileSync(path.join(homeDir, ".codex", "auth.json"), "utf8"), "{\"token\":\"user-owned\"}\n");
  }
});

test("main compensates allowlisted MCP additions when later install stages fail", (t) => {
  const failures = [
    ["lstatSync", /[\\/]\.codex[\\/]ospec-workflow$/],
    ["copyFileSync", /[\\/]\.codex[\\/]agents[\\/]apply\.toml$/],
    ["copyFileSync", /[\\/]\.codex[\\/]ospec-workflow[\\/]scripts[\\/]hooks[\\/]session-start\.js$/],
    ["copyFileSync", /[\\/]\.agents[\\/]skills[\\/]standalone-tool[\\/]SKILL\.md$/],
    ["writeFileSync", /[\\/]\.codex[\\/]hooks\.json$/],
  ];

  for (const [method, pattern] of failures) {
    const sourceDir = makeTempDir(t, `codex-mcp-file-rollback-source-${method}-`);
    const homeDir = makeTempDir(t, `codex-mcp-file-rollback-home-${method}-`);
    fs.writeFileSync(path.join(sourceDir, ".mcp.json"), JSON.stringify({
      mcpServers: {
        context7: { command: "npx", args: ["@upstash/context7-mcp@1.0.31"] },
        markitdown: { command: "uvx", args: ["markitdown-mcp@0.0.1a4"] },
      },
    }));
    const calls = [];
    const configured = [{
      name: "user-owned",
      transport: { type: "stdio", command: "user-command", args: [] },
    }];
    const stderr = [];

    const exitCode = main([], {
      cwd: sourceDir,
      homedir: () => homeDir,
      fs: failOnceFs(method, pattern),
      stdout: { write() {} },
      stderr: { write: (chunk) => stderr.push(chunk) },
      findCodexBin: () => "codex",
      runConfigure({ outDir }) {
        writeGeneratedCodexTree(outDir);
        return { exitCode: 0, validation: null };
      },
      runCodexCommand(bin, args) {
        calls.push([bin, ...args]);
        if (args.join(" ") === "mcp list --json") {
          return { status: 0, stdout: JSON.stringify(configured), stderr: "" };
        }
        if (args[1] === "add") {
          configured.push({
            name: args[2],
            transport: { type: "stdio", command: args[4], args: args.slice(5) },
          });
        } else if (args[1] === "remove") {
          const index = configured.findIndex((server) => server.name === args[2]);
          if (index >= 0) configured.splice(index, 1);
        }
        return { status: 0, stdout: "", stderr: "" };
      },
    });

    assert.equal(exitCode, 1, `${method} ${pattern} must preserve the original install failure`);
    assert.deepEqual(calls.filter((call) => call[2] === "remove"), [
      ["codex", "mcp", "remove", "markitdown"],
      ["codex", "mcp", "remove", "context7"],
    ]);
    assert.deepEqual(configured.map((server) => server.name), ["user-owned"]);
    assert.ok(!calls.some((call) => call.slice(1).join(" ") === "mcp remove user-owned"));
    assert.doesNotMatch(stderr.join(""), /user-command/);
  }
});

test("main reports MCP compensation failure generically without replacing the install failure", (t) => {
  const sourceDir = makeTempDir(t, "codex-mcp-remove-failure-source-");
  const homeDir = makeTempDir(t, "codex-mcp-remove-failure-home-");
  fs.writeFileSync(path.join(sourceDir, ".mcp.json"), JSON.stringify({
    mcpServers: { context7: { command: "npx", args: ["@upstash/context7-mcp@1.0.31"] } },
  }));
  const stderr = [];
  let removeCalls = 0;
  const exitCode = main([], {
    cwd: sourceDir,
    homedir: () => homeDir,
    fs: failOnceFs("copyFileSync", /[\\/]\.codex[\\/]agents[\\/]apply\.toml$/),
    stdout: { write() {} },
    stderr: { write: (chunk) => stderr.push(chunk) },
    findCodexBin: () => "codex",
    runConfigure({ outDir }) {
      writeGeneratedCodexTree(outDir);
      return { exitCode: 0, validation: null };
    },
    runCodexCommand(bin, args) {
      if (args.join(" ") === "mcp list --json") return { status: 0, stdout: "[]", stderr: "" };
      if (args[1] === "remove") {
        removeCalls += 1;
        return { status: 7, stdout: "", stderr: "secret-remove-detail" };
      }
      return { status: 0, stdout: "", stderr: "" };
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(removeCalls, 1);
  assert.match(stderr.join(""), /failed to roll back a newly added Codex MCP server/i);
  assert.doesNotMatch(stderr.join(""), /secret-remove-detail/);
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
