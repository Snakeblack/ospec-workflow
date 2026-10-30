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
  normalizeAntigravityHookOutput,
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
    const stdin = target === 'antigravity'
      ? JSON.stringify({ permission_mode: mode, toolCall: { name: 'view_file', args: { AbsolutePath: path.join(__dirname, 'a') } }, workspacePaths: [__dirname] })
      : JSON.stringify({ permission_mode: mode });
    fs.readFileSync = (file, encoding) => file === 0 ? stdin : originalRead(file, encoding);
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
      options = undefined;
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
      } else if (target === 'antigravity') {
        // agy sends no permission mode: the inspection failure always asks.
        assert.equal(output.decision, 'ask');
        assert.match(output.reason, /could not inspect/);
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

// REQ-hooks-031: a binary the system cannot start (no execute bit, another
// architecture) gives way to the Node hook; one that ran and failed does not.
test("a binary that cannot start falls back to the Node hook, and one that ran does not", { skip: process.platform === "win32" }, (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const { spawnSync } = require("node:child_process");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-launch-broken-bin-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const allow = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "node hook" } };
  fs.writeFileSync(path.join(root, "pre-tool-use.js"), `process.stdout.write(${JSON.stringify(JSON.stringify(allow))});`);
  const binary = path.join(root, "ospec-hooks");
  const launcherPath = require.resolve("./ospec-hooks-launch.js");
  const run = () => spawnSync(process.execPath, ["-e", "process.exitCode = require(process.argv[1]).main([\"pre-tool-use\"], process.argv[2]);", launcherPath, root], {
    input: "{}", encoding: "utf8", env: { ...process.env, OSPEC_TARGET: "claude" }, timeout: 10000, killSignal: "SIGKILL",
  });

  // An ELF header for a machine no system runs: the exec fails and the shell
  // the spawn falls back to exits 126.
  const foreign = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0x99, 0x99]), Buffer.alloc(64)]);
  for (const [label, content, mode] of [["no execute bit", "#!/bin/sh\nexit 0\n", 0o644], ["foreign architecture", foreign, 0o755]]) {
    fs.writeFileSync(binary, content);
    fs.chmodSync(binary, mode);
    const result = run();
    assert.equal(result.status, 0, label);
    assert.deepEqual(JSON.parse(result.stdout), allow, label);
    assert.match(result.stderr, /\[ospec warn\] the ospec-hooks binary could not start \((EACCES|exit 126)\); ran the Node hook/, label);
  }

  fs.writeFileSync(binary, "#!/bin/sh\nexit 3\n");
  fs.chmodSync(binary, 0o755);
  const failed = run();
  const output = JSON.parse(failed.stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, "ask", "a binary that ran and failed is not retried");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /exit 3/);
  assert.doesNotMatch(failed.stderr, /ospec warn/);
});

test("SUBCOMMANDS covers exactly the six hook events", () => {
  assert.deepEqual(
    [...SUBCOMMANDS].sort(),
    ["post-tool-use", "pre-compact", "pre-tool-use", "session-start", "stop", "subagent-stop"],
  );
});

// Mocks the child and the hook stdin, runs main(argv) and returns what the
// launcher wrote plus the options it spawned the child with.
function runLauncher(t, { argv, stdin, outcome, target = "claude" }) {
  const cp = require("node:child_process");
  const fs = require("node:fs");
  const saved = { spawn: cp.spawnSync, read: fs.readFileSync, write: process.stdout.write, error: process.stderr.write, target: process.env.OSPEC_TARGET };
  let options;
  cp.spawnSync = (_command, _args, opts) => {
    options = opts;
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  fs.readFileSync = (file, encoding) => (file === 0 ? stdin : saved.read(file, encoding));
  process.stderr.write = () => true;
  if (target === null) delete process.env.OSPEC_TARGET;
  else process.env.OSPEC_TARGET = target;
  const restore = () => {
    cp.spawnSync = saved.spawn;
    fs.readFileSync = saved.read;
    process.stdout.write = saved.write;
    process.stderr.write = saved.error;
    if (saved.target === undefined) delete process.env.OSPEC_TARGET;
    else process.env.OSPEC_TARGET = saved.target;
    delete require.cache[require.resolve("./ospec-hooks-launch.js")];
  };
  t.after(restore);
  delete require.cache[require.resolve("./ospec-hooks-launch.js")];
  const launcher = require("./ospec-hooks-launch.js");
  const written = [];
  process.stdout.write = (chunk) => { written.push(String(chunk)); return true; };
  const code = launcher.main(argv, HOOKS_DIR);
  restore();
  return { code, written: written.join(""), options };
}

test("--output-redaction tells the PreToolUse child that the host redacts reads, and only then", (t) => {
  const previous = process.env.OSPEC_OUTPUT_REDACTION;
  process.env.OSPEC_OUTPUT_REDACTION = "1";
  t.after(() => {
    if (previous === undefined) delete process.env.OSPEC_OUTPUT_REDACTION;
    else process.env.OSPEC_OUTPUT_REDACTION = previous;
  });
  const outcome = { status: 0, stdout: "", stderr: "" };
  const flagged = runLauncher(t, { argv: ["pre-tool-use", "--output-redaction"], stdin: "{}", outcome });
  assert.equal(flagged.options.env.OSPEC_OUTPUT_REDACTION, "1");
  const plain = runLauncher(t, { argv: ["pre-tool-use"], stdin: "{}", outcome });
  assert.equal(plain.options.env.OSPEC_OUTPUT_REDACTION, "", "an inherited value never enables it");
});

test("a failed post-tool-use child still redacts in process, or withholds, and never forwards its stdout", (t) => {
  const token = `ghp_${"aB3".repeat(12)}`;
  const secretStdin = JSON.stringify({ tool_name: "Bash", tool_response: { stdout: `token ${token}`, stderr: "" } });
  for (const outcome of [
    { error: Object.assign(new Error("start failed"), { code: "ENOENT" }), status: null },
    { error: Object.assign(new Error("deadline"), { code: "ETIMEDOUT" }), status: null },
    { status: 7, stdout: secretStdin },
    { status: 0, stdout: "invalid output" },
    { status: 0, stdout: '{"hookSpecificOutput":{"hookEventName":"PreToolUse"}}' },
  ]) {
    const { code, written } = runLauncher(t, { argv: ["post-tool-use"], stdin: secretStdin, outcome });
    assert.equal(code, 0);
    assert.equal(written.includes(token), false);
    assert.equal(JSON.parse(written).hookSpecificOutput.updatedToolOutput.stdout, "token [REDACTED:github-token]");
  }
  const clean = runLauncher(t, {
    argv: ["post-tool-use"],
    stdin: JSON.stringify({ tool_name: "Bash", tool_response: { stdout: "ok" } }),
    outcome: { status: null, signal: "SIGKILL", stdout: "" },
  });
  assert.equal(clean.written, "", "nothing to redact keeps the original output");
});

test("a launcher exception keeps the stdin's host and redaction under an inherited CURSOR_AGENT", (t) => {
  const previous = process.env.CURSOR_AGENT;
  process.env.CURSOR_AGENT = "1";
  t.after(() => {
    if (previous === undefined) delete process.env.CURSOR_AGENT;
    else process.env.CURSOR_AGENT = previous;
  });
  const failure = Object.assign(new Error("spawn exploded"), { code: "EBOOM" });
  const claude = { session_id: "s", transcript_path: "/tmp/x.jsonl", permission_mode: "default", tool_name: "Read", tool_input: { file_path: "/repo/.env" } };
  const pre = runLauncher(t, { argv: ["pre-tool-use"], stdin: JSON.stringify({ ...claude, hook_event_name: "PreToolUse" }), outcome: failure, target: null });
  assert.equal(pre.code, 0);
  assert.equal(JSON.parse(pre.written).hookSpecificOutput.permissionDecision, "ask");

  const secret = `DB_PASSWORD=${"hunter2".repeat(2)}`;
  const post = runLauncher(t, {
    argv: ["post-tool-use"],
    stdin: JSON.stringify({ ...claude, hook_event_name: "PostToolUse", tool_response: { type: "text", file: { filePath: "/repo/.env", content: secret } } }),
    outcome: failure,
    target: null,
  });
  assert.equal(post.written.includes(secret), false);
  assert.match(post.written, /\[REDACTED:assigned-secret\]/);

  const cursor = runLauncher(t, {
    argv: ["pre-tool-use"],
    stdin: JSON.stringify({ conversation_id: "c", cursor_version: "2026.10.16", hook_event_name: "preToolUse", tool_name: "Read", tool_input: { file_path: "/repo/.env" } }),
    outcome: failure,
    target: null,
  });
  assert.equal(JSON.parse(cursor.written).permission, "allow", "Cursor keeps its advisory format");
});

test("a valid post-tool-use result is forwarded, and adapted to Codex's block feedback", (t) => {
  const result = {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      updatedToolOutput: "DB_PASSWORD=[REDACTED:assigned-secret]",
      additionalContext: "[ospec] Se censuraron secretos en esta salida (assigned-secret).",
    },
  };
  const outcome = { status: 0, stdout: `${JSON.stringify(result)}\n`, stderr: "" };
  const claude = runLauncher(t, { argv: ["post-tool-use"], stdin: "{}", outcome });
  assert.deepEqual(JSON.parse(claude.written), result);
  const codex = runLauncher(t, { argv: ["post-tool-use"], stdin: "{}", outcome, target: "codex" });
  assert.deepEqual(JSON.parse(codex.written), {
    decision: "block",
    reason: "[ospec] Se censuraron secretos en esta salida (assigned-secret).\nDB_PASSWORD=[REDACTED:assigned-secret]",
  });
  assert.deepEqual(normalizeCodexHookOutput("post-tool-use", null), {});
  assert.equal(
    normalizeCodexHookOutput("post-tool-use", { hookSpecificOutput: { hookEventName: "PostToolUse", updatedToolOutput: { stdout: "x" }, additionalContext: "note" } }).reason,
    'note\n{"stdout":"x"}',
  );
});

// Payloads captured from agy 1.4.2: it runs hooks from the directory holding
// hooks.json, so the workspace only arrives in workspacePaths.
function agyToolCall(name, args, workspace) {
  return JSON.stringify({
    conversationId: "c-1",
    stepIdx: 2,
    toolCall: { name, args: { ...args, toolAction: "a", toolSummary: "s" } },
    workspacePaths: [workspace],
  });
}

test("antigravity input reaches the shared PreToolUse contract from the workspace", (t) => {
  const workspace = path.resolve(__dirname, "..", "..");
  const outcome = { status: 0, stdout: "", stderr: "" };
  const read = runLauncher(t, {
    argv: ["pre-tool-use"],
    stdin: agyToolCall("view_file", { AbsolutePath: path.join(workspace, ".env") }, workspace),
    outcome,
    target: "antigravity",
  });
  assert.equal(read.options.cwd, workspace);
  const readInput = JSON.parse(read.options.input);
  assert.equal(readInput.tool_name, "view_file");
  assert.equal(readInput.tool_input.file_path, path.join(workspace, ".env"));
  assert.equal(readInput.cwd, workspace);
  assert.equal(readInput.session_id, "c-1");

  const scripts = path.join(workspace, "scripts");
  const shell = runLauncher(t, {
    argv: ["pre-tool-use"],
    stdin: agyToolCall("run_command", { CommandLine: "cat .env", Cwd: scripts }, workspace),
    outcome,
    target: "antigravity",
  });
  assert.equal(shell.options.cwd, scripts, "a shell command resolves its operands from its own Cwd");
  assert.equal(JSON.parse(shell.options.input).tool_input.command, "cat .env");
  assert.equal(shell.written, "", "no objection leaves agy's own permission flow");

  for (const [cwd, expected] of [["scripts", scripts], ["", workspace], ["no-such-dir", workspace], [path.join(workspace, "no-such-dir"), workspace]]) {
    const relative = runLauncher(t, {
      argv: ["pre-tool-use"],
      stdin: agyToolCall("run_command", { CommandLine: "cat x", Cwd: cwd }, workspace),
      outcome,
      target: "antigravity",
    });
    assert.equal(relative.options.cwd, expected, `Cwd ${JSON.stringify(cwd)} resolves inside the workspace`);
  }

  const stale = runLauncher(t, {
    argv: ["pre-tool-use"],
    stdin: JSON.stringify({ toolCall: { name: "run_command", args: { CommandLine: "cat .env" } }, workspacePaths: [path.join(workspace, "gone"), workspace] }),
    outcome,
    target: "antigravity",
  });
  assert.equal(stale.options.cwd, workspace, "the first workspace that exists wins");
  // A path that exists but is not a directory is never a working directory.
  const file = path.join(workspace, "package.json");
  const fileWorkspace = runLauncher(t, {
    argv: ["stop"],
    stdin: JSON.stringify({ conversationId: "c-1", workspacePaths: [file, workspace] }),
    outcome,
    target: "antigravity",
  });
  assert.equal(fileWorkspace.options.cwd, workspace, "a file is not a workspace");
  const fileCwd = runLauncher(t, {
    argv: ["pre-tool-use"],
    stdin: agyToolCall("run_command", { CommandLine: "cat x", Cwd: file }, workspace),
    outcome,
    target: "antigravity",
  });
  assert.equal(fileCwd.options.cwd, workspace, "a file is not a command's directory");
  const noWorkspace = runLauncher(t, {
    argv: ["pre-tool-use"],
    stdin: JSON.stringify({ toolCall: { name: "run_command", args: { CommandLine: "cat config", Cwd: scripts } } }),
    outcome,
    target: "antigravity",
  });
  assert.equal(noWorkspace.options.cwd, scripts, "an absolute Cwd that exists stands without a workspace");
  for (const workspacePaths of [undefined, [], [path.join(workspace, "gone")], ["relative/dir"]]) {
    const lost = runLauncher(t, {
      argv: ["pre-tool-use"],
      stdin: JSON.stringify({ toolCall: { name: "run_command", args: { CommandLine: "cat .env" } }, workspacePaths }),
      outcome,
      target: "antigravity",
    });
    assert.equal(lost.options, undefined, "without a directory to inspect, the policy never runs in hooks.json's");
    assert.equal(JSON.parse(lost.written).decision, "ask", JSON.stringify(workspacePaths));
  }

  const chunks = runLauncher(t, {
    argv: ["pre-tool-use"],
    stdin: agyToolCall("multi_replace_file_content", {
      TargetFile: path.join(workspace, "a.js"),
      ReplacementChunks: [{ TargetContent: "x", ReplacementContent: "one" }, { TargetContent: "y", ReplacementContent: "two" }],
    }, workspace),
    outcome,
    target: "antigravity",
  });
  assert.equal(JSON.parse(chunks.options.input).tool_input.content, "one\ntwo", "every written body reaches the content scan");

  for (const stdin of [
    JSON.stringify({ conversationId: "c-1", workspacePaths: [workspace] }),
    JSON.stringify({ toolCall: "view_file", workspacePaths: [workspace] }),
    JSON.stringify({ toolCall: { name: "view_file", args: '{"AbsolutePath":".env"}' }, workspacePaths: [workspace] }),
    "not json",
  ]) {
    const drift = runLauncher(t, { argv: ["pre-tool-use"], stdin, outcome, target: "antigravity" });
    assert.equal(drift.options, undefined, "an unreadable tool call never reaches the policy as an empty one");
    assert.equal(JSON.parse(drift.written).decision, "ask", stdin);
    assert.match(JSON.parse(drift.written).reason, /could not inspect/);
  }

  const missing = runLauncher(t, {
    argv: ["session-start"],
    stdin: JSON.stringify({ conversationId: "c-1", workspacePaths: [path.join(workspace, "no-such-dir")] }),
    outcome,
    target: "antigravity",
  });
  assert.equal(missing.options.cwd, undefined, "a workspace that does not exist is not a cwd");
});

// E1.43: each target with a hook before a file edit denies writing the state
// the ospec CLI owns, from its own tool payload and in its own output shape.
// Cursor's generated hooks have none; its installed preToolUse runs the guard
// too, and denies the write if Cursor sends the edit there (validate-cursor.js).
test("every target with a hook before an edit denies a write of idd/<change>/state.yaml", (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const { spawnSync } = require("node:child_process");
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-owned-"));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const state = path.join(workspace, "idd", "fix-pagination", "state.yaml");
  const env = { ...process.env };
  for (const key of ["OSPEC_TARGET", "OSPEC_CODEX_WRAPPER", "CLAUDE_PLUGIN_ROOT", "CURSOR_AGENT"]) delete env[key];
  const run = (script, target, input) => spawnSync(process.execPath, [path.join(__dirname, script), "pre-tool-use"], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    env: target ? { ...env, OSPEC_TARGET: target } : env,
    encoding: "utf8",
    cwd: workspace,
    timeout: 10000,
  });
  const patch = `*** Begin Patch\n*** Update File: ${state}\n@@\n-"pending"\n+"withdrawn"\n*** End Patch`;
  for (const [target, script, input] of [
    ["claude", "ospec-hooks-launch.js", { tool_name: "Write", tool_input: { file_path: state, content: "{}" } }],
    ["codex", "ospec-codex-hook.js", { tool_name: "apply_patch", tool_input: { command: patch } }],
    ["vscode", "ospec-hooks-launch.js", { tool_name: "replace_string_in_file", tool_input: { filePath: state, oldString: "a", newString: "b" } }],
    ["github-copilot", "ospec-hooks-launch.js", { tool_name: "create_file", tool_input: { filePath: state, content: "{}" } }],
    ["opencode", "ospec-hooks-launch.js", { tool_name: "edit", tool_input: { filePath: state, oldString: "a", newString: "b" } }],
  ]) {
    const result = run(script, target === "codex" ? null : target, input);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout).hookSpecificOutput;
    assert.equal(output?.permissionDecision, "deny", `${target}: ${result.stdout}`);
    assert.match(output.permissionDecisionReason, /CLI de ospec/);
  }
  const agy = run("ospec-antigravity-hook.js", null, agyToolCall("write_to_file", { TargetFile: state, CodeContent: "{}" }, workspace));
  assert.equal(agy.status, 0, agy.stderr);
  assert.equal(JSON.parse(agy.stdout).decision, "deny", agy.stdout);
  const cursor = run("ospec-hooks-launch.js", "cursor", {
    hook_event_name: "preToolUse",
    cursor_version: "1.7.0",
    conversation_id: "c-1",
    tool_name: "Write",
    tool_input: { file_path: state, content: "{}" },
  });
  assert.equal(cursor.status, 0, cursor.stderr);
  assert.equal(JSON.parse(cursor.stdout).permission, "deny", cursor.stdout);
});

test("normalizeAntigravityHookOutput speaks agy's decision and injectSteps contracts", () => {
  const ask = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: "secret" } };
  const deny = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "blocked" } };
  const allow = { systemMessage: "[ospec advisory] x", hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "x" } };
  assert.deepEqual(normalizeAntigravityHookOutput("pre-tool-use", ask), { decision: "ask", reason: "secret" });
  assert.deepEqual(normalizeAntigravityHookOutput("pre-tool-use", deny), { decision: "deny", reason: "blocked" });
  assert.deepEqual(normalizeAntigravityHookOutput("pre-tool-use", allow), {}, "an affirmative allow would skip agy's prompts");
  assert.deepEqual(normalizeAntigravityHookOutput("pre-tool-use", null), {});

  const session = { status: "ok", ospecDetected: true, systemMessage: "Crea una rama." };
  assert.deepEqual(normalizeAntigravityHookOutput("session-start", session), {
    injectSteps: [{ systemMessage: { systemMessage: 'Crea una rama.\n{"ospecDetected":true}' } }],
  });
  assert.deepEqual(normalizeAntigravityHookOutput("session-start", { status: "error", message: "boom" }), {
    injectSteps: [{ systemMessage: { systemMessage: "[ospec error] boom" } }],
  });
  assert.deepEqual(normalizeAntigravityHookOutput("session-start", { status: "ok" }), {});
  // Stop never blocks: only decision "continue" would keep agy running.
  assert.deepEqual(normalizeAntigravityHookOutput("stop", { continue: true, systemMessage: "x" }), {});
});

test("the antigravity wrapper asks before a .env read through view_file or run_command", (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const { spawnSync } = require("node:child_process");
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-agy-"));
  fs.writeFileSync(path.join(workspace, ".env"), "DB_PASSWORD=hunter2hunter2\n");
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const wrapper = path.join(__dirname, "ospec-antigravity-hook.js");
  const env = { ...process.env };
  delete env.OSPEC_TARGET;
  delete env.CLAUDE_PLUGIN_ROOT;
  const token = `ghp_${"aB3".repeat(12)}`;
  for (const input of [
    agyToolCall("view_file", { AbsolutePath: path.join(workspace, ".env") }, workspace),
    agyToolCall("run_command", { CommandLine: "cat .env", Cwd: workspace }, workspace),
    agyToolCall("write_to_file", { TargetFile: path.join(workspace, "config.js"), CodeContent: `const t = "${token}";` }, workspace),
  ]) {
    const result = spawnSync(process.execPath, [wrapper, "pre-tool-use"], { input, env, encoding: "utf8", cwd: os.homedir(), timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "ask");
    assert.match(output.reason, /secreto|credenciales|token/i);
  }

  fs.mkdirSync(path.join(workspace, ".git"));
  fs.writeFileSync(path.join(workspace, ".git", "config"), "[remote \"origin\"]\n");
  const input = agyToolCall("run_command", { CommandLine: "cat config", Cwd: ".git" }, workspace);
  const result = spawnSync(process.execPath, [wrapper, "pre-tool-use"], { input, env, encoding: "utf8", cwd: os.homedir(), timeout: 10000 });
  assert.equal(JSON.parse(result.stdout).decision, "deny", "a relative Cwd resolves against the workspace");
});

test("the antigravity wrapper writes nothing when ospec has no objection", (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const { spawnSync } = require("node:child_process");
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-agy-"));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const wrapper = path.join(__dirname, "ospec-antigravity-hook.js");
  const env = { ...process.env };
  delete env.OSPEC_TARGET;
  delete env.CLAUDE_PLUGIN_ROOT;
  // agy 1.4.2 reads `{}` as an empty decision and denies the call; only an
  // empty stdout lets its own permission flow run.
  const input = agyToolCall("run_command", { CommandLine: "echo hola", Cwd: workspace }, workspace);
  const result = spawnSync(process.execPath, [wrapper, "pre-tool-use"], { input, env, encoding: "utf8", cwd: os.homedir(), timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
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

// OSP-031: the payload names its caller; inherited CURSOR_* markers only
// decide when it does not. Cursor's shape is the one cursor-agent sends to
// third-party hooks (measured with 2026.10.16).
test("isCursorHost lets a Claude-shaped stdin win over inherited Cursor markers", () => {
  const claudePluginDir = path.join("/home", "me", ".claude", "plugins", "cache", "ospec", "scripts", "hooks");
  const claude = JSON.stringify({ session_id: "s", transcript_path: "/tmp/x.jsonl", permission_mode: "default", hook_event_name: "PreToolUse", tool_name: "Read" });
  const cursor = JSON.stringify({ conversation_id: "c", session_id: "c", hook_event_name: "preToolUse", cursor_version: "2026.10.16", tool_name: "Read" });
  for (const marker of ["CURSOR_AGENT", "CURSOR_SESSION_ID", "CURSOR_HOOK"]) {
    assert.equal(isCursorHost(claudePluginDir, { [marker]: "1" }, claude), false, marker);
    assert.equal(isCursorHost(claudePluginDir, { [marker]: "1" }, cursor), true, marker);
  }
  assert.equal(isCursorHost(claudePluginDir, {}, cursor), true);
  assert.equal(isCursorHost(claudePluginDir, {}, JSON.stringify({ cursor_version: "2026.10.16", hook_event_name: "PreToolUse" })), true);
  assert.equal(isCursorHost(claudePluginDir, { OSPEC_TARGET: "cursor" }, claude), true, "an explicit target still wins");
});

test("a Claude Code process that inherits CURSOR_AGENT keeps its ask and its redaction", (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const { spawnSync } = require("node:child_process");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-launch-cursor-env-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const envFile = path.join(root, ".env");
  const secret = `DB_PASSWORD=${"hunter2".repeat(2)}`;
  const env = { ...process.env, CURSOR_AGENT: "1", CLAUDECODE: "1" };
  for (const key of ["OSPEC_TARGET", "CURSOR_SESSION_ID", "CURSOR_HOOK", "OSPEC_OUTPUT_REDACTION"]) delete env[key];
  const base = { session_id: "s", transcript_path: path.join(root, "x.jsonl"), cwd: root, permission_mode: "default", tool_name: "Read", tool_input: { file_path: envFile } };
  const run = (sub, payload) => spawnSync(process.execPath, [require.resolve("./ospec-hooks-launch.js"), sub], {
    input: JSON.stringify(payload), env, cwd: root, encoding: "utf8", timeout: 20000,
  });

  const pre = run("pre-tool-use", { ...base, hook_event_name: "PreToolUse" });
  assert.equal(pre.status, 0, pre.stderr);
  assert.equal(JSON.parse(pre.stdout).hookSpecificOutput.permissionDecision, "ask");

  const post = run("post-tool-use", {
    ...base,
    hook_event_name: "PostToolUse",
    tool_response: { type: "text", file: { filePath: envFile, content: `${secret}\n`, numLines: 1, startLine: 1, totalLines: 1 } },
  });
  assert.equal(post.status, 0, post.stderr);
  assert.equal(post.stdout.includes(secret), false);
  assert.match(JSON.stringify(JSON.parse(post.stdout).hookSpecificOutput.updatedToolOutput), /\[REDACTED:assigned-secret\]/);
});

test("adaptCursorHookInput maps beforeShellExecution and beforeReadFile shapes", () => {
  const shell = JSON.parse(
    adaptCursorHookInput(
      "pre-tool-use",
      JSON.stringify({ command: "npm install", cwd: "/repo", sandbox: true }),
    ).input,
  );
  assert.equal(shell.tool_name, "Shell");
  assert.equal(shell.tool_input.command, "npm install");

  const read = JSON.parse(
    adaptCursorHookInput(
      "pre-tool-use",
      JSON.stringify({ file_path: "/repo/.env", content: "SECRET=1" }),
    ).input,
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




// Cursor runs user hooks from ~/.cursor and names the workspace only in
// workspace_roots: every hook runs from the first root that exists, so the
// end of a turn is counted in the repository (E1.49).
test("cursor hooks run from the first workspace root that exists", (t) => {
  const workspace = path.resolve(__dirname, "..", "..");
  const missing = path.join(workspace, "no-such-dir");
  const outcome = { status: 0, stdout: '{"continue":true}', stderr: "" };
  const cursor = (fields) => JSON.stringify({ conversation_id: "c-1", cursor_version: "1.7", workspace_roots: [missing, workspace], ...fields });
  for (const [sub, fields] of [["stop", { hook_event_name: "stop", status: "completed" }], ["session-start", { hook_event_name: "beforeSubmitPrompt" }], ["pre-compact", { hook_event_name: "afterFileEdit", file_path: path.join(workspace, "a.js") }]]) {
    const { options } = runLauncher(t, { argv: [sub], stdin: cursor(fields), outcome, target: null });
    assert.equal(options.cwd, workspace, sub);
    assert.equal(JSON.parse(options.input).cwd, workspace, sub);
  }

  const allow = { status: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "" } }), stderr: "" };
  const read = runLauncher(t, { argv: ["pre-tool-use"], stdin: cursor({ hook_event_name: "beforeReadFile", file_path: path.join(workspace, "a.js"), content: "" }), outcome: allow, target: null });
  assert.equal(read.options.cwd, workspace);
  assert.equal(JSON.parse(read.options.input).tool_input.file_path, path.join(workspace, "a.js"));
  const scripts = path.join(workspace, "scripts");
  const shell = runLauncher(t, { argv: ["pre-tool-use"], stdin: cursor({ hook_event_name: "beforeShellExecution", command: "ls", cwd: scripts, sandbox: false }), outcome: allow, target: null });
  assert.equal(shell.options.cwd, scripts, "a shell command keeps its own directory");
  assert.equal(JSON.parse(shell.options.input).cwd, scripts);

  // A path that exists but is not a directory is never a working directory.
  const file = path.join(workspace, "package.json");
  const fileShell = runLauncher(t, { argv: ["pre-tool-use"], stdin: JSON.stringify({ conversation_id: "c-1", cursor_version: "1.7", workspace_roots: [file, workspace], command: "ls", cwd: file, sandbox: false }), outcome: allow, target: null });
  assert.equal(fileShell.options.cwd, workspace);
  assert.equal(JSON.parse(fileShell.options.input).cwd, workspace);

  const rootless = runLauncher(t, { argv: ["stop"], stdin: JSON.stringify({ conversation_id: "c-1", cursor_version: "1.7", workspace_roots: [missing, file] }), outcome, target: null });
  assert.equal(rootless.options.cwd, undefined, "without a root that exists the hook keeps its own directory");
});
