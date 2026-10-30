"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { runConfigure } = require("./cli.js");
const { copyCodexRuntime, syncCodexSkills, installCodexHooks, main } = require("./install-codex.js");

const SOURCE = path.resolve(__dirname, "../..");
let generated;
test.before(() => {
  generated = fs.mkdtempSync(path.join(os.tmpdir(), "codex-shell-build-"));
  runConfigure({ sourceDir: SOURCE, target: "codex", outDir: generated, validate: false });
});
test.after(() => fs.rmSync(generated, { recursive: true, force: true }));

function fixture(t, isolated = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex shell fixture-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, "user profile");
  const codexRoot = isolated ? path.join(root, "Orca", "runtime home") : path.join(home, ".codex");
  const runtime = path.join(codexRoot, "ospec-workflow");
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(path.join(workspace, "openspec"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "openspec", "config.yaml"), "project:\n  name: fixture\n");
  copyCodexRuntime(generated, runtime);
  syncCodexSkills(generated, path.join(home, ".agents", "skills"));
  installCodexHooks(generated, codexRoot, runtime);
  const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: codexRoot };
  for (const name of ["OSPEC_TARGET", "OSPEC_CODEX_WRAPPER", "OSPEC_PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT", "CURSOR_AGENT"]) delete env[name];
  return { root, home, codexRoot, runtime, workspace, env };
}

function shells() {
  if (process.platform !== "win32") return [
    { name: "sh", program: "/bin/sh", args: ["-c"] },
    { name: "bash", program: "/bin/bash", args: ["-c"] },
  ];
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const result = [
    { name: "cmd", program: process.env.ComSpec || path.join(systemRoot, "System32", "cmd.exe"), cmd: true },
    { name: "Windows PowerShell", program: path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), args: ["-NoProfile", "-NonInteractive", "-Command"] },
  ];
  const pwsh = path.join(process.env.ProgramFiles || "C:\\Program Files", "PowerShell", "7", "pwsh.exe");
  if (fs.existsSync(pwsh)) result.push({ name: "PowerShell 7", program: pwsh, args: ["-NoProfile", "-NonInteractive", "-Command"] });
  const bash = path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe");
  if (fs.existsSync(bash)) result.push({ name: "Git Bash", program: bash, args: ["-c"], posix: true });
  return result;
}

function runHook(shell, command, input, fixture) {
  // A hang guard: a cold Windows PowerShell start outlasted 60 s under the
  // rest of the suite.
  const options = { cwd: fixture.workspace, env: fixture.env, input: JSON.stringify(input), encoding: "utf8", timeout: 180000 };
  return shell.cmd
    ? spawnSync(command, { ...options, shell: shell.program })
    : spawnSync(shell.program, [...shell.args, command], options);
}

// Windows only: a hook child that outlasts the launcher's own 4 s deadline
// under the rest of the suite (#321) runs once more, and the first failure
// stays in the TAP diagnostics. A broken rule or shell still fails.
const LAUNCHER_DEADLINE = /\[ospec error\] Hook [\w-]+ failed: ETIMEDOUT/;

function runHookOnceMore(t, shell, command, input, fixture) {
  const result = runHook(shell, command, input, fixture);
  if (process.platform !== "win32" || !LAUNCHER_DEADLINE.test(`${result.stdout}${result.stderr}`)) return result;
  t.diagnostic(`retrying ${shell.name} after the launcher deadline: ${`${result.stderr}${result.stdout}`.trim()}`);
  return runHook(shell, command, input, fixture);
}

test("generated installed Codex hooks run in real shells without ambient target markers", async (t) => {
  const f = fixture(t);
  const hooks = JSON.parse(fs.readFileSync(path.join(f.codexRoot, "hooks.json"), "utf8")).hooks;
  for (const shell of shells()) await t.test(shell.name, (st) => {
    for (const event of ["SessionStart", "PreToolUse"]) {
      const hook = hooks[event][0].hooks[0];
      const command = process.platform === "win32" && !shell.posix ? hook.commandWindows : hook.command;
      const input = { hook_event_name: event, cwd: f.workspace, source: "startup", tool_name: "Bash", tool_input: { command: "git status --short" } };
      const result = runHookOnceMore(st, shell, command, input, f);
      assert.equal(result.error, undefined, `${shell.name}: ${result.error}`);
      assert.equal(result.status, 0, `${shell.name} ${event}: ${result.stderr || result.stdout}`);
      const output = JSON.parse(result.stdout);
      if (event === "SessionStart") {
        assert.equal(output.hookSpecificOutput?.hookEventName, "SessionStart");
        assert.match(output.hookSpecificOutput.additionalContext, /registry/);
      } else {
        assert.deepEqual(output, {}, "safe calls must preserve Codex's normal approval flow");
        // Only a hook payload: the denied command is never executed.
        const deniedCommand = ["git", "push", "--force", "origin", "main"].join(" ");
        const denied = runHookOnceMore(st, shell, command, { ...input, tool_input: { command: deniedCommand } }, f);
        assert.equal(denied.status, 0, denied.stderr);
        assert.equal(JSON.parse(denied.stdout).hookSpecificOutput?.permissionDecision, "deny", "portable launch must retain blocking rules");
      }
    }
  });
});

test("reinstall migrates legacy commands once and preserves Orca and user hooks", (t) => {
  const f = fixture(t);
  const hooksPath = path.join(f.codexRoot, "hooks.json");
  const orca = { hooks: [{ type: "command", command: "C:/Orca/agent-hooks/codex-hook.cmd", timeout: 10 }] };
  const user = { matcher: "Bash", hooks: [{ type: "command", command: "user-hook" }] };
  const legacy = { matcher: ".*", hooks: [{ type: "command", command: `OSPEC_TARGET=codex OSPEC_CODEX_WRAPPER=1 node "${f.runtime}/scripts/hooks/ospec-hooks-launch.js" pre-tool-use` }] };
  fs.writeFileSync(hooksPath, JSON.stringify({ hooks: { PreToolUse: [orca, user, legacy] } }));
  installCodexHooks(generated, f.codexRoot, f.runtime);
  const first = fs.readFileSync(hooksPath, "utf8");
  installCodexHooks(generated, f.codexRoot, f.runtime);
  assert.equal(fs.readFileSync(hooksPath, "utf8"), first);
  assert.deepEqual(JSON.parse(first).hooks.PreToolUse.slice(0, 2), [orca, user]);
  assert.equal(JSON.parse(first).hooks.PreToolUse.length, 3);
  assert.doesNotMatch(first, /OSPEC_TARGET=codex|set OSPEC_TARGET/);
});

test("installed hooks discover shared skills from an isolated CODEX_HOME", (t) => {
  const f = fixture(t, true);
  const hook = JSON.parse(fs.readFileSync(path.join(f.codexRoot, "hooks.json"), "utf8")).hooks.SessionStart[0].hooks[0];
  const shell = shells()[0];
  const command = process.platform === "win32" ? hook.commandWindows : hook.command;
  const result = runHookOnceMore(t, shell, command, { cwd: f.workspace, source: "startup", hook_event_name: "SessionStart" }, f);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput?.hookEventName, "SessionStart");
});

test("migration preserves a third-party hook inside a mixed group", (t) => {
  const f = fixture(t);
  const hooksPath = path.join(f.codexRoot, "hooks.json");
  const foreign = { type: "command", command: "C:/Orca/agent-hooks/codex-hook.cmd" };
  const old = { type: "command", command: `OSPEC_TARGET=codex node "${f.runtime}/scripts/hooks/ospec-hooks-launch.js" pre-tool-use` };
  fs.writeFileSync(hooksPath, JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [foreign, old] }] } }));
  installCodexHooks(generated, f.codexRoot, f.runtime);
  const groups = JSON.parse(fs.readFileSync(hooksPath, "utf8")).hooks.PreToolUse;
  assert.deepEqual(groups[0], { matcher: "Bash", hooks: [foreign] });
  assert.equal(groups.length, 2);
});

test("global setup respects an isolated CODEX_HOME and leaves the default home hooks intact", (t) => {
  const f = fixture(t);
  const activeHome = path.join(f.root, "Orca", "runtime home");
  const previous = fs.readFileSync(path.join(f.codexRoot, "hooks.json"), "utf8");
  let errors = "";
  const exit = main(["--no-engram", "--no-validate"], {
    cwd: SOURCE, homedir: () => f.home, env: { ...f.env, CODEX_HOME: activeHome },
    outDir: path.join(f.root, "setup output"),
    findCodexBin: () => null, stdout: { write() {} }, stderr: { write(value) { errors += value; } },
    runConfigure({ outDir }) { fs.cpSync(generated, outDir, { recursive: true }); return { exitCode: 0, files: [] }; },
  });
  assert.equal(exit, 0, errors);
  assert.ok(fs.existsSync(path.join(activeHome, "hooks.json")), "setup must update the host's active configuration");
  assert.equal(fs.readFileSync(path.join(f.codexRoot, "hooks.json"), "utf8"), previous);
});

test("managed home preserves an AGENTS.md link to the regular global user file", (t) => {
  const f = fixture(t);
  const activeHome = path.join(f.root, "Orca", "runtime home");
  fs.mkdirSync(activeHome, { recursive: true });
  const sharedAgents = path.join(f.codexRoot, "AGENTS.md");
  const linkedAgents = path.join(activeHome, "AGENTS.md");
  fs.writeFileSync(sharedAgents, "# User instructions\n");
  try {
    fs.symlinkSync(sharedAgents, linkedAgents, "file");
  } catch (error) {
    if (!["EPERM", "EACCES"].includes(error.code)) throw error;
    t.skip("file symlink creation unavailable");
    return;
  }
  const parentAlias = path.join(f.root, "parent alias");
  fs.symlinkSync(f.root, parentAlias, "junction");
  const homeAlias = path.join(parentAlias, path.basename(f.home));
  let errors = "";
  const deps = {
    cwd: SOURCE, homedir: () => homeAlias, env: { ...f.env, CODEX_HOME: activeHome },
    outDir: path.join(f.root, "setup output"),
    findCodexBin: () => null, stdout: { write() {} }, stderr: { write(value) { errors += value; } },
    runConfigure({ outDir }) { fs.cpSync(generated, outDir, { recursive: true }); return { exitCode: 0, files: [] }; },
  };
  assert.equal(main(["--no-engram", "--no-validate"], deps), 0, errors);
  assert.ok(fs.lstatSync(linkedAgents).isSymbolicLink());
  assert.match(fs.readFileSync(sharedAgents, "utf8"), /^# User instructions\n/);
  assert.match(fs.readFileSync(sharedAgents, "utf8"), /ospec-workflow:router:begin/);
  const installed = fs.readFileSync(sharedAgents, "utf8");
  assert.equal(main(["--no-engram", "--no-validate"], deps), 0, errors);
  assert.equal(fs.readFileSync(sharedAgents, "utf8"), installed);

  // A different file is never authorized just because a host linked it.
  fs.unlinkSync(linkedAgents);
  const foreign = path.join(f.root, "foreign-instructions.md");
  fs.writeFileSync(foreign, "foreign bytes\n");
  fs.symlinkSync(foreign, linkedAgents, "file");
  assert.equal(main(["--no-engram", "--no-validate"], deps), 1);
  assert.equal(fs.readFileSync(foreign, "utf8"), "foreign bytes\n");
  assert.equal(fs.readFileSync(sharedAgents, "utf8"), installed);

  fs.unlinkSync(linkedAgents);
  fs.unlinkSync(sharedAgents);
  fs.symlinkSync(foreign, sharedAgents, "file");
  fs.symlinkSync(sharedAgents, linkedAgents, "file");
  assert.equal(main(["--no-engram", "--no-validate"], deps), 1);
  assert.equal(fs.readFileSync(foreign, "utf8"), "foreign bytes\n");
});

// E1.49: Codex loads <repo>/.codex/hooks.json and runs it from the session's
// directory, which may be a subdirectory, so a repository install names its
// runtime from the git root and counts the end of a turn in the repository.
test("a repository install's hooks count the end of a turn in the repository from any of its directories", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex repo hooks-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, "repo");
  const home = path.join(root, "home");
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.mkdirSync(home);
  spawnSync("git", ["init", "-q"], { cwd: repo });
  const hooksPath = path.join(repo, ".codex", "hooks.json");
  const user = { matcher: "Bash", hooks: [{ type: "command", command: "user-hook" }] };
  fs.mkdirSync(path.dirname(hooksPath));
  fs.writeFileSync(hooksPath, JSON.stringify({ hooks: { PreToolUse: [user] } }));
  const install = () => main([repo, "--no-validate"], {
    cwd: SOURCE, homedir: () => home, outDir: path.join(root, "out"),
    findCodexBin: () => null, stdout: { write() {} }, stderr: { write() {} },
    runConfigure({ outDir }) { fs.cpSync(generated, outDir, { recursive: true }); return { exitCode: 0, files: [] }; },
  });
  assert.equal(install(), 0);
  const installed = fs.readFileSync(hooksPath, "utf8");
  assert.equal(install(), 0);
  assert.equal(fs.readFileSync(hooksPath, "utf8"), installed, "a second install converges");
  const hooks = JSON.parse(installed).hooks;
  assert.deepEqual(hooks.PreToolUse[0], user, "the repository's own hooks are kept");
  assert.doesNotMatch(installed, new RegExp(`__OSPEC_|${repo.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}`), "the shared file names no local path");

  const hook = hooks.Stop[0].hooks[0];
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  for (const name of ["OSPEC_TARGET", "OSPEC_CODEX_WRAPPER", "OSPEC_PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT", "CURSOR_AGENT"]) delete env[name];
  let turns = 0;
  for (const shell of shells()) await t.test(shell.name, (st) => {
    const command = process.platform === "win32" && !shell.posix ? hook.commandWindows : hook.command;
    const result = runHookOnceMore(st, shell, command, { hook_event_name: "Stop", cwd: repo }, { workspace: path.join(repo, "src"), env });
    assert.equal(result.status, 0, `${shell.name}: ${result.stderr || result.stdout}`);
    turns += 1;
    assert.equal(fs.readFileSync(path.join(repo, ".ospec", "turns"), "utf8"), `${turns}\n`);
  });
});
