"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  SUBCOMMANDS,
  hostBinarySuffix,
  binaryCandidates,
  resolveBinary,
  resolveInvocation,
  normalizeCodexHookOutput,
  stripUtf8Bom,
  isCursorInstall,
  adaptCursorHookInput,
  normalizeCursorHookOutput,
  isCursorHost,
  isClaudeCodeHost,
} = require("./ospec-hooks-launch.js");

const HOOKS_DIR = path.join("plugins", "ospec-workflow", "scripts", "hooks");

test("launcher bounds children and reports PreToolUse failures through each adapter", (t) => {
  const cp = require('node:child_process');
  const fs = require('node:fs');
  const originalSpawn = cp.spawnSync;
  const originalRead = fs.readFileSync;
  const originalWrite = process.stdout.write;
  const originalErrorWrite = process.stderr.write;
  const originalTarget = process.env.OSPEC_TARGET;
  let outcome;
  let options;
  cp.spawnSync = (_command, _args, opts) => { options = opts; return outcome; };
  fs.readFileSync = (file, encoding) => file === 0 ? '{}' : originalRead(file, encoding);
  process.stderr.write = () => true;
  t.after(() => {
    cp.spawnSync = originalSpawn;
    fs.readFileSync = originalRead;
    process.stdout.write = originalWrite;
    process.stderr.write = originalErrorWrite;
    if (originalTarget === undefined) delete process.env.OSPEC_TARGET;
    else process.env.OSPEC_TARGET = originalTarget;
    delete require.cache[require.resolve('./ospec-hooks-launch.js')];
  });
  delete require.cache[require.resolve('./ospec-hooks-launch.js')];
  const launcher = require('./ospec-hooks-launch.js');
  for (const target of ['claude', 'codex', 'cursor', 'github-copilot', 'vscode', 'opencode', 'antigravity']) {
    process.env.OSPEC_TARGET = target;
    for (const mode of ['default', 'bypassPermissions']) {
    fs.readFileSync = (file, encoding) => file === 0 ? JSON.stringify({ permission_mode: mode }) : originalRead(file, encoding);
    for (const failure of [
      { error: Object.assign(new Error('start failed'), { code: 'ENOENT' }), status: null },
      { error: Object.assign(new Error('deadline'), { code: 'ETIMEDOUT' }), status: null },
      { status: 7, stdout: '{"hookSpecificOutput":{"permissionDecision":"allow"}}' },
      { status: null, signal: 'SIGTERM', stdout: '' },
      { status: 0, stdout: 'invalid output' },
      { status: 0, stdout: '1' },
      { status: 0, stdout: '{"continue":true}' },
    ]) {
      outcome = failure;
      const written = [];
      process.stdout.write = (chunk) => { written.push(String(chunk)); return true; };
      assert.equal(launcher.main(['pre-tool-use'], HOOKS_DIR), 0);
      process.stdout.write = originalWrite;
      assert.ok(options.timeout > 0 && options.timeout < 5000, 'deadline must precede the host deadline');
      assert.equal(options.killSignal, 'SIGKILL', 'a child must not defeat the deadline by handling SIGTERM');
      const output = JSON.parse(written.join(''));
      if (target === 'cursor') {
        assert.equal(output.permission, 'allow');
        assert.match(output.agent_message, /could not inspect/);
      } else if (target === 'codex') {
        assert.match(output.hookSpecificOutput.additionalContext, /could not inspect/);
        assert.equal(output.hookSpecificOutput.permissionDecision, undefined);
      } else {
        assert.equal(output.hookSpecificOutput.permissionDecision, mode === 'bypassPermissions' ? 'allow' : 'ask');
        assert.match(output.hookSpecificOutput.permissionDecisionReason, /could not inspect/);
      }
    }
    }
  }
  process.env.OSPEC_TARGET = 'claude';
  fs.readFileSync = (file, encoding) => file === 0 ? '{"permission_mode":"bypassPermissions"}' : originalRead(file, encoding);
  outcome = { error: Object.assign(new Error('deadline'), { code: 'ETIMEDOUT' }), status: null };
  const written = [];
  process.stdout.write = (chunk) => { written.push(String(chunk)); return true; };
  assert.equal(launcher.main(['pre-tool-use'], HOOKS_DIR), 0);
  process.stdout.write = originalWrite;
  const output = JSON.parse(written.join(''));
  assert.equal(output.hookSpecificOutput.permissionDecision, 'allow');
  assert.match(output.systemMessage, /ospec advisory/);
});

test('launcher timeout terminates a real child and returns a visible inspection failure', (t) => {
  const fs = require('node:fs');
  const os = require('node:os');
  const { spawnSync } = require('node:child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ospec-launch-deadline-'));
  const hook = path.join(root, 'pre-tool-use.js');
  fs.writeFileSync(hook, "process.on('SIGTERM', () => {}); setTimeout(() => process.stdout.write('completed'), 8000);");
  t.after(() => { fs.unlinkSync(hook); fs.rmdirSync(root); });
  const launcherPath = require.resolve('./ospec-hooks-launch.js');
  const env = { ...process.env, OSPEC_TARGET: 'claude' };
  const result = spawnSync(process.execPath, ['-e', 'process.exitCode = require(process.argv[1]).main(["pre-tool-use"], process.argv[2]);', launcherPath, root], {
    input: '{}', encoding: 'utf8', env, timeout: 10000, killSignal: 'SIGKILL',
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /ETIMEDOUT/);
  assert.doesNotMatch(result.stdout, /completed/);
});

test("SUBCOMMANDS covers exactly the five hook events", () => {
  assert.deepEqual(
    [...SUBCOMMANDS].sort(),
    ["pre-compact", "pre-tool-use", "session-start", "stop", "subagent-stop"],
  );
});

test("hostBinarySuffix maps node platform/arch to Go tuples", () => {
  assert.deepEqual(hostBinarySuffix("win32", "x64"), {
    goos: "windows",
    goarch: "amd64",
    ext: ".exe",
  });
  assert.deepEqual(hostBinarySuffix("darwin", "arm64"), {
    goos: "darwin",
    goarch: "arm64",
    ext: "",
  });
  assert.deepEqual(hostBinarySuffix("linux", "x64"), {
    goos: "linux",
    goarch: "amd64",
    ext: "",
  });
});

test("binaryCandidates lists per-platform then release/dist then generic", () => {
  const suffix = { goos: "windows", goarch: "amd64", ext: ".exe" };
  const candidates = binaryCandidates(HOOKS_DIR, suffix);
  assert.deepEqual(candidates, [
    path.join(HOOKS_DIR, "ospec-hooks-windows-amd64.exe"),
    path.join("plugins", "ospec-workflow", "release", "dist", "ospec-hooks-windows-amd64.exe"),
    path.join(HOOKS_DIR, "ospec-hooks.exe"),
  ]);
});

test("resolveBinary returns the first existing candidate", () => {
  const suffix = { goos: "linux", goarch: "amd64", ext: "" };
  const generic = path.join(HOOKS_DIR, "ospec-hooks");
  const exists = (p) => p === generic; // only the generic local binary is present
  assert.equal(resolveBinary(HOOKS_DIR, suffix, exists), generic);
});

test("resolveBinary returns null when no candidate exists", () => {
  const suffix = { goos: "linux", goarch: "amd64", ext: "" };
  assert.equal(resolveBinary(HOOKS_DIR, suffix, () => false), null);
});

test("resolveInvocation runs the native binary when present", () => {
  const suffix = { goos: "linux", goarch: "amd64", ext: "" };
  const platform = path.join(HOOKS_DIR, "ospec-hooks-linux-amd64");
  const invocation = resolveInvocation("stop", HOOKS_DIR, suffix, (p) => p === platform);
  assert.deepEqual(invocation, { command: platform, args: ["stop"] });
});

test("resolveInvocation falls back to node <sub>.js when no binary ships", () => {
  const suffix = { goos: "linux", goarch: "amd64", ext: "" };
  const invocation = resolveInvocation("pre-tool-use", HOOKS_DIR, suffix, () => false);
  assert.deepEqual(invocation, {
    command: process.execPath,
    args: [path.join(HOOKS_DIR, "pre-tool-use.js")],
  });
});

test("resolveInvocation bypasses binary and returns node fallback for session-start when backend is workspace-federated", () => {
  const suffix = { goos: "linux", goarch: "amd64", ext: "" };
  const platform = path.join(HOOKS_DIR, "ospec-hooks-linux-amd64");
  const configPath = path.join(process.cwd(), "openspec", "config.yaml");
  
  const exists = (p) => p === platform || p === configPath;
  const readFileSync = (p) => {
    if (p === configPath) {
      return "artifact_store:\n  backend: workspace-federated\n";
    }
    throw new Error(`Unexpected read of: ${p}`);
  };

  const invocation = resolveInvocation("session-start", HOOKS_DIR, suffix, exists, readFileSync);
  assert.deepEqual(invocation, {
    command: process.execPath,
    args: [path.join(HOOKS_DIR, "session-start.js")],
  });
});

test("resolveInvocation does not read config and uses binary for pre-tool-use even under federated backend (hot path optimization)", () => {
  const suffix = { goos: "linux", goarch: "amd64", ext: "" };
  const platform = path.join(HOOKS_DIR, "ospec-hooks-linux-amd64");
  
  const exists = (p) => p === platform;
  const readFileSync = (p) => {
    throw new Error(`Should not read filesystem/config on hot path! Attempted read of: ${p}`);
  };

  const invocation = resolveInvocation("pre-tool-use", HOOKS_DIR, suffix, exists, readFileSync);
  assert.deepEqual(invocation, {
    command: platform,
    args: ["pre-tool-use"],
  });
});

test("resolveInvocation handles missing config file gracefully, defaulting to openspec backend and using Go binary", () => {
  const suffix = { goos: "linux", goarch: "amd64", ext: "" };
  const platform = path.join(HOOKS_DIR, "ospec-hooks-linux-amd64");
  const configPath = path.join(process.cwd(), "openspec", "config.yaml");
  
  const exists = (p) => p === platform; // configPath does not exist
  const readFileSync = (p) => {
    throw new Error(`Should not attempt read since config does not exist! Attempted read of: ${p}`);
  };

  const invocation = resolveInvocation("session-start", HOOKS_DIR, suffix, exists, readFileSync);
  assert.deepEqual(invocation, {
    command: platform,
    args: ["session-start"],
  });
});

// ── H-019: el launcher enruta subagent-stop a Node bajo hosts Claude ────────

const LINUX_SUFFIX = { goos: "linux", goarch: "amd64", ext: "" };
const LINUX_BINARY = path.join(HOOKS_DIR, "ospec-hooks-linux-amd64");
const readNoConfig = () => {
  throw new Error("no config read expected");
};

test("[REQ-hooks-019] H-019: subagent-stop bajo host Claude con binario presente se ejecuta vía Node", () => {
  const exists = (p) => p === LINUX_BINARY; // binario nativo presente

  // Señal OSPEC_TARGET=claude (tier 3 de ADR-002).
  assert.deepEqual(
    resolveInvocation("subagent-stop", HOOKS_DIR, LINUX_SUFFIX, exists, readNoConfig, { OSPEC_TARGET: "claude" }),
    { command: process.execPath, args: [path.join(HOOKS_DIR, "subagent-stop.js")] },
    "el binario nativo no debe ensombrecer al productor Node",
  );

  // Señal CLAUDE_PLUGIN_ROOT no vacío (tier 4 de ADR-002).
  assert.deepEqual(
    resolveInvocation("subagent-stop", HOOKS_DIR, LINUX_SUFFIX, exists, readNoConfig, { CLAUDE_PLUGIN_ROOT: "/plugins/claude" }),
    { command: process.execPath, args: [path.join(HOOKS_DIR, "subagent-stop.js")] },
  );

  // OSPEC_PLUGIN_ROOT NO es señal: el binario conserva el evento.
  assert.deepEqual(
    resolveInvocation("subagent-stop", HOOKS_DIR, LINUX_SUFFIX, exists, readNoConfig, { OSPEC_PLUGIN_ROOT: "/plugins/x" }),
    { command: LINUX_BINARY, args: ["subagent-stop"] },
  );
});

test("isClaudeCodeHost detecta hosts Claude solo por marcadores de entorno", () => {
  assert.equal(isClaudeCodeHost({ OSPEC_TARGET: "claude" }), true);
  assert.equal(isClaudeCodeHost({ CLAUDE_PLUGIN_ROOT: "/x" }), true);
  assert.equal(isClaudeCodeHost({ CLAUDE_PLUGIN_ROOT: "" }), false, "valor vacío no es señal");
  assert.equal(isClaudeCodeHost({ OSPEC_TARGET: "codex" }), false);
  assert.equal(isClaudeCodeHost({ OSPEC_TARGET: "cursor" }), false);
  assert.equal(isClaudeCodeHost({}), false);
});

test("explicit targets override inherited host markers and install paths", () => {
  for (const target of ["codex", "claude", "vscode", "github-copilot"]) {
    assert.equal(isCursorHost("/plugins/.cursor/hooks", {
      OSPEC_TARGET: target, CURSOR_AGENT: "1", VSCODE_PID: "123",
    }, JSON.stringify({ hook_event_name: "preToolUse" })), false, target);
  }
  assert.equal(isClaudeCodeHost({ OSPEC_TARGET: "cursor", CLAUDE_PLUGIN_ROOT: "/plugin" }), false);
  assert.equal(isClaudeCodeHost({ OSPEC_TARGET: "codex", CLAUDE_PLUGIN_ROOT: "/plugin" }), false);
});

test("VS Code terminal markers alone do not select Cursor's hook protocol", () => {
  assert.equal(isCursorHost(HOOKS_DIR, { VSCODE_PID: "123", VSCODE_CWD: "/workspace" }, "{}"), false);
});

test("[REQ-hooks-019] H-019: los demás eventos conservan el enrutamiento binario y sin binario manda el fallback Node", () => {
  const exists = (p) => p === LINUX_BINARY;
  const claudeEnv = { OSPEC_TARGET: "claude" };

  // pre-tool-use con binario y host Claude → binario (la rama es solo para subagent-stop).
  assert.deepEqual(
    resolveInvocation("pre-tool-use", HOOKS_DIR, LINUX_SUFFIX, exists, readNoConfig, claudeEnv),
    { command: LINUX_BINARY, args: ["pre-tool-use"] },
  );
  // stop con binario y host Claude → binario.
  assert.deepEqual(
    resolveInvocation("stop", HOOKS_DIR, LINUX_SUFFIX, exists, readNoConfig, claudeEnv),
    { command: LINUX_BINARY, args: ["stop"] },
  );
  // Cualquier subcomando sin binario → fallback Node existente.
  assert.deepEqual(
    resolveInvocation("subagent-stop", HOOKS_DIR, LINUX_SUFFIX, () => false, readNoConfig, claudeEnv),
    { command: process.execPath, args: [path.join(HOOKS_DIR, "subagent-stop.js")] },
  );
  assert.deepEqual(
    resolveInvocation("session-start", HOOKS_DIR, LINUX_SUFFIX, () => false, readNoConfig, claudeEnv),
    { command: process.execPath, args: [path.join(HOOKS_DIR, "session-start.js")] },
  );
});

test("[REQ-hooks-019] la rama codex queda intacta (byte a byte) y precede a la rama Claude", () => {
  const exists = (p) => p === LINUX_BINARY;
  const original = process.env.OSPEC_TARGET;
  process.env.OSPEC_TARGET = "codex";
  try {
    // Con OSPEC_TARGET=codex en el entorno real, subagent-stop va a Node
    // aunque el env inyectado diga claude: la rama codex conserva su
    // precedencia y su forma original.
    assert.deepEqual(
      resolveInvocation("subagent-stop", HOOKS_DIR, LINUX_SUFFIX, exists, readNoConfig, { OSPEC_TARGET: "claude", CLAUDE_PLUGIN_ROOT: "/x" }),
      { command: process.execPath, args: [path.join(HOOKS_DIR, "subagent-stop.js")] },
    );
    // Y para otro subcomando codex no altera el enrutamiento binario.
    assert.deepEqual(
      resolveInvocation("pre-tool-use", HOOKS_DIR, LINUX_SUFFIX, exists, readNoConfig, {}),
      { command: LINUX_BINARY, args: ["pre-tool-use"] },
    );
  } finally {
    if (original === undefined) {
      delete process.env.OSPEC_TARGET;
    } else {
      process.env.OSPEC_TARGET = original;
    }
  }
});

test("normalizeCodexHookOutput wraps SessionStart context in the native hook shape", () => {
  const output = normalizeCodexHookOutput("session-start", {
    status: "ok",
    ospecDetected: true,
    systemMessage: "Read the workspace state.",
  });

  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: 'Read the workspace state.\n{"ospecDetected":true}',
    },
  });
});

test("SessionStart advisory preserves registry and capability context for skill injection", () => {
  const registry = { status: "generated", path: ".ospec/cache/skill-registry.cache.json" };
  const capabilities = ["go", "postgres"];
  const result = normalizeCodexHookOutput("session-start", {
    status: "ok", systemMessage: "Working tree has changes.", registry, capabilities,
  });
  const context = result.hookSpecificOutput.additionalContext;
  assert.equal(context.split("\n")[0], "Working tree has changes.");
  assert.deepEqual(JSON.parse(context.split("\n").at(-1)), { registry, capabilities });
  assert.deepEqual(normalizeCodexHookOutput("session-start", { status: "ok" }), {});
  assert.deepEqual(normalizeCodexHookOutput("session-start", {
    status: "ok", systemMessage: "  Advisory only.  ",
  }).hookSpecificOutput.additionalContext, "Advisory only.");
});

test("SessionStart error envelopes keep an explicit error frame in additionalContext", () => {
  const framed = normalizeCodexHookOutput("session-start", {
    status: "error",
    message: "no SKILL.md files found in required skills root: C:\\Users\\example\\.codex\\ospec-workflow\\skills",
  });
  assert.deepEqual(framed, {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: "[ospec error] no SKILL.md files found in required skills root: C:\\Users\\example\\.codex\\ospec-workflow\\skills",
    },
  });
  assert.deepEqual(
    normalizeCodexHookOutput("session-start", { status: "error" }).hookSpecificOutput.additionalContext,
    "[ospec error] unknown session-start failure",
  );
});

test("normalizeCodexHookOutput emits PreToolUse context for advisory decisions and no allow decision", () => {
  const advisory = normalizeCodexHookOutput("pre-tool-use", {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Review this command.",
    },
  });
  const allow = normalizeCodexHookOutput("pre-tool-use", {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: "Safe command.",
    },
  });

  assert.deepEqual(advisory, {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: "Review this command.",
    },
  });
  assert.deepEqual(allow, {});
});

test("isCursorInstall detects .cursor path segments and OSPEC_TARGET=cursor", () => {
  assert.equal(isCursorInstall(path.join("C:", "Users", "me", ".cursor", "scripts", "hooks")), true);
  assert.equal(isCursorInstall(path.join("/home", "me", ".cursor", "scripts", "hooks")), true);
  assert.equal(isCursorInstall(path.join("/repo", "scripts", "hooks"), {}), false);
  assert.equal(isCursorInstall(path.join("/repo", "scripts", "hooks"), { OSPEC_TARGET: "cursor" }), true);
  assert.equal(isCursorInstall(path.join("/repo", "scripts", "hooks"), { OSPEC_TARGET: "codex" }), false);
});

test("isCursorHost detects Cursor preToolUse when stdin starts with a UTF-8 BOM", () => {
  const claudePluginDir = path.join("/home", "me", ".claude", "plugins", "cache", "ospec", "scripts", "hooks");
  const payload = `\uFEFF${JSON.stringify({ hook_event_name: "preToolUse", tool_name: "Task" })}`;
  assert.equal(stripUtf8Bom(payload).startsWith("{"), true);
  assert.equal(isCursorHost(claudePluginDir, {}, payload), true);
});

test("isCursorHost detects Cursor-native stdin even from Claude plugin paths", () => {
  const claudePluginDir = path.join("/home", "me", ".claude", "plugins", "cache", "ospec", "scripts", "hooks");
  assert.equal(isCursorHost(claudePluginDir, {}, JSON.stringify({ hook_event_name: "preToolUse", tool_name: "Task" })), true);
  assert.equal(isCursorHost(claudePluginDir, {}, JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash" })), false);
  assert.equal(isCursorHost(claudePluginDir, { CURSOR_AGENT: "1" }, "{}"), true);
  assert.equal(
    isCursorHost(
      claudePluginDir,
      {},
      JSON.stringify({ command: "npm install", cwd: "/repo", sandbox: true }),
    ),
    true,
  );
});

test("adaptCursorHookInput maps beforeShellExecution and beforeReadFile shapes", () => {
  const shell = JSON.parse(
    adaptCursorHookInput(
      "pre-tool-use",
      JSON.stringify({ command: "npm install", cwd: "/repo", sandbox: true }),
    ),
  );
  assert.equal(shell.tool_name, "Shell");
  assert.equal(shell.tool_input.command, "npm install");

  const read = JSON.parse(
    adaptCursorHookInput(
      "pre-tool-use",
      JSON.stringify({ file_path: "/repo/.env", content: "SECRET=1" }),
    ),
  );
  assert.equal(read.tool_name, "Read");
  assert.equal(read.tool_input.file_path, "/repo/.env");
});

test("normalizeCursorHookOutput degrades ask to allow and maps deny", () => {
  const ask = normalizeCursorHookOutput("pre-tool-use", {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Vas a commitear con dominios derivados.",
    },
  });
  assert.equal(ask.permission, "allow");
  assert.match(ask.user_message, /ospec advisory/);
  assert.match(ask.agent_message, /dominios derivados/);

  const deny = normalizeCursorHookOutput("pre-tool-use", {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Blocked.",
    },
  });
  assert.deepEqual(deny, {
    permission: "deny",
    user_message: "Blocked.",
    agent_message: "Blocked.",
  });

  const allow = normalizeCursorHookOutput("pre-tool-use", {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: "ok",
    },
  });
  assert.deepEqual(allow, { permission: "allow" });
});

// OSP-017: a neutral PreToolUse call writes nothing. Each target keeps its own
// "no objection" shape: Claude-format hosts get no output, Codex `{}` and
// Cursor `permission: "allow"` (its contract only accepts allow|deny).
test("neutral pre-tool-use output keeps each target's no-objection shape", (t) => {
  assert.deepEqual(normalizeCodexHookOutput("pre-tool-use", null), {});
  assert.deepEqual(normalizeCursorHookOutput("pre-tool-use", null), { permission: "allow" });

  const cp = require("node:child_process");
  const fs = require("node:fs");
  const origSpawnSync = cp.spawnSync;
  const origReadFileSync = fs.readFileSync;
  const origWrite = process.stdout.write;
  const origTarget = process.env.OSPEC_TARGET;
  cp.spawnSync = () => ({ status: 0, stdout: "", stderr: "" });
  fs.readFileSync = (fd, encoding) =>
    fd === 0 ? '{"tool_name":"Write","tool_input":{"file_path":"probe.txt"}}' : origReadFileSync(fd, encoding);
  process.env.OSPEC_TARGET = "claude";
  const written = [];
  t.after(() => {
    cp.spawnSync = origSpawnSync;
    fs.readFileSync = origReadFileSync;
    process.stdout.write = origWrite;
    if (origTarget === undefined) delete process.env.OSPEC_TARGET;
    else process.env.OSPEC_TARGET = origTarget;
    delete require.cache[require.resolve("./ospec-hooks-launch.js")];
  });

  delete require.cache[require.resolve("./ospec-hooks-launch.js")];
  const launcher = require("./ospec-hooks-launch.js");
  process.stdout.write = (chunk) => {
    written.push(String(chunk));
    return true;
  };
  const code = launcher.main(["pre-tool-use"], __dirname);
  process.stdout.write = origWrite;

  assert.equal(code, 0);
  assert.deepEqual(written, []);
});

test("normalizeCursorHookOutput maps session-start to beforeSubmitPrompt continue", () => {
  assert.deepEqual(
    normalizeCursorHookOutput("session-start", { systemMessage: "Drift warning" }),
    { continue: true, user_message: "Drift warning" },
  );
  assert.deepEqual(normalizeCursorHookOutput("stop", { continue: true }), { continue: true });
});

test("main passes OSPEC_PLUGIN_ROOT env var when spawning", (t) => {
  const cp = require("node:child_process");
  const origSpawnSync = cp.spawnSync;
  
  let spawnedOptions = null;
  cp.spawnSync = (command, args, options) => {
    spawnedOptions = options;
    return { status: 0, stdout: '{"continue":true}', stderr: "" };
  };
  
  t.after(() => {
    cp.spawnSync = origSpawnSync;
  });

  // Clear require cache so it re-reads the mocked spawnSync
  delete require.cache[require.resolve("./ospec-hooks-launch.js")];
  const { main } = require("./ospec-hooks-launch.js");
  const fs = require("node:fs");
  const origReadFileSync = fs.readFileSync;
  fs.readFileSync = (fd, encoding) => {
    if (fd === 0) return '{"cwd":"/workspace"}';
    return origReadFileSync(fd, encoding);
  };
  t.after(() => {
    fs.readFileSync = origReadFileSync;
    delete require.cache[require.resolve("./ospec-hooks-launch.js")];
  });

  main(["stop"], __dirname);

  assert.ok(spawnedOptions);
  assert.ok(spawnedOptions.env);
  assert.equal(spawnedOptions.env.OSPEC_PLUGIN_ROOT, path.resolve(__dirname, "../.."));
});



