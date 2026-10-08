"use strict";

// E1.7 (a) ospec doctor (openspec/specs/idd/spec.md, REQ-idd-019): every known
// installation and project failure is reported with its cause and action, and
// the doctor writes nothing.

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { DOCTOR_TARGETS, runDoctor, renderDoctor } = require("./ospec-doctor.js");

const BEGIN = "<!-- ospec-workflow:router:begin -->";
const END = "<!-- ospec-workflow:router:end -->";
const ROUTER = "# ospec-workflow\n\nIDD by default.\n";

function tempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
}

// Digest of every file under `dir`, so a test can prove the doctor wrote nothing.
function treeDigest(dir) {
  const hash = crypto.createHash("sha256");
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      hash.update(path.relative(dir, full));
      if (entry.isDirectory()) walk(full);
      else hash.update(fs.readFileSync(full));
    }
  };
  walk(dir);
  return hash.digest("hex");
}

// Spawn stub: `git check-ignore` answers from `ignored`, every other command is
// absent unless listed in `commands` ("bin arg..." -> result).
function makeSpawn({ ignored = true, commands = {} } = {}) {
  const calls = [];
  const spawn = (bin, args) => {
    const key = [bin, ...args].join(" ");
    calls.push(key);
    if (bin === "git" && args[0] === "check-ignore") return { status: ignored ? 0 : 1, stdout: "", stderr: "" };
    if (Object.hasOwn(commands, key)) return { status: 0, stdout: "", stderr: "", ...commands[key] };
    return { error: Object.assign(new Error(`spawn ${bin} ENOENT`), { code: "ENOENT" }) };
  };
  spawn.calls = calls;
  return spawn;
}

function installClaude(home, { version = "2.0.0", sdd = false, hooks = true, router = ROUTER, block = ROUTER, outside = "", extraInstall = null } = {}) {
  const installPath = path.join(home, ".claude", "plugins", "cache", "ospec-tools", "ospec-workflow", version);
  write(path.join(installPath, ".claude-plugin", "plugin.json"), { name: "ospec-workflow", version });
  write(path.join(installPath, "global-instructions", "CLAUDE.md"), router);
  write(path.join(installPath, "agents", "review-trust.md"), "reviewer\n");
  if (sdd) write(path.join(installPath, "agents", "sdd-explore.md"), "phase\n");
  if (hooks) {
    write(path.join(installPath, "hooks", "hooks.json"), {
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js" session-start' }] }] },
    });
    write(path.join(installPath, "scripts", "hooks", "ospec-hooks-launch.js"), "// launcher\n");
  }
  const installs = [{ scope: "user", installPath, version }];
  if (extraInstall) installs.push(extraInstall);
  write(path.join(home, ".claude", "plugins", "installed_plugins.json"), { version: 2, plugins: { "ospec-workflow@ospec-tools": installs } });
  if (block !== null) write(path.join(home, ".claude", "CLAUDE.md"), `${outside}${BEGIN}\n${block.trim()}\n${END}\n`);
  return installPath;
}

function setup(t) {
  return { root: tempDir(t, "ospec-doctor-project-"), home: tempDir(t, "ospec-doctor-home-") };
}

async function doctor({ root, home }, options = {}) {
  return runDoctor({ root, home, env: {}, platform: "linux", arch: "x64", spawn: makeSpawn(), ...options });
}

function find(result, scope, id, subject) {
  return result.checks.find((check) => check.scope === scope && check.id === id && (subject === undefined || check.subject === subject));
}

function assertActionable(check) {
  assert.ok(check, "check missing");
  assert.ok(check.cause, `${check.scope}/${check.id} needs a cause`);
  assert.ok(check.action, `${check.scope}/${check.id} needs an action`);
}

const OPEN_STATE = {
  schema: "idd-state/v1",
  change: "add-export",
  mode: "idd",
  status: "open",
  intent: { kind: "feature", summary: "Export.", acceptance: "A CSV." },
  facts: { basis: "The request settles it." },
  signals: [{ id: "always", reason: "every change with a resolved intent", source: "declaration" }],
  obligations: [{ id: "checks-pass", signal: "always", status: "pending", evidence: [] }],
  gates: [],
  evidence: [],
};

test("a clean project with no host installed passes and reports the runtime", async (t) => {
  const env = setup(t);
  const result = await doctor(env);
  assert.equal(result.exit_code, 0);
  assert.equal(result.summary.errors, 0);
  assert.equal(find(result, "runtime", "runtime").status, "info");
  assert.equal(find(result, "project", "mode").detail, "idd");
  assert.equal(result.checks.some((check) => check.scope === "claude"), false, "an absent host is skipped");
  assert.ok(DOCTOR_TARGETS.includes("claude"));
});

test("an interrupted write is reported for recovery and the doctor writes nothing", async (t) => {
  const env = setup(t);
  write(path.join(env.root, "idd", "add-export", "state.yaml.bak"), OPEN_STATE);
  const before = treeDigest(env.root);
  const result = await doctor(env);
  const check = find(result, "project", "idd-change", "add-export");
  assert.equal(check.status, "warn");
  assertActionable(check);
  assert.match(check.action, /ospec status/);
  assert.equal(treeDigest(env.root), before, "the project tree must be byte-identical");
  assert.ok(fs.existsSync(path.join(env.root, "idd", "add-export", "state.yaml.bak")));
});

test("IDD changes get the command that resumes them", async (t) => {
  const env = setup(t);
  write(path.join(env.root, "idd", "add-export", "state.yaml"), OPEN_STATE);
  write(path.join(env.root, "idd", "old-fix", "state.yaml"), { ...OPEN_STATE, change: "old-fix", status: "closed", closed_at: "2026-10-08T00:00:00Z" });
  write(path.join(env.root, "idd", "broken", "state.yaml"), "{ not json");
  const result = await doctor(env);
  const open = find(result, "project", "idd-change", "add-export");
  assert.equal(open.status, "info");
  assert.match(open.action, /ospec next --change add-export/);
  const closed = find(result, "project", "idd-change", "old-fix");
  assert.equal(closed.status, "warn");
  assertActionable(closed);
  assert.match(closed.action, /ospec close --change old-fix/);
  const broken = find(result, "project", "idd-change", "broken");
  assert.equal(broken.status, "error");
  assertActionable(broken);
  assert.equal(result.exit_code, 1);
});

test("an invalid idd/config.yaml is an error", async (t) => {
  const env = setup(t);
  write(path.join(env.root, "idd", "config.yaml"), "mode: waterfall\n");
  const result = await doctor(env);
  const check = find(result, "project", "idd-config");
  assert.equal(check.status, "error");
  assertActionable(check);
  assert.equal(result.exit_code, 1);
});

test("mode sdd without the SDD package fails and names --with-sdd", async (t) => {
  const env = setup(t);
  write(path.join(env.root, "idd", "config.yaml"), "mode: sdd\n");
  installClaude(env.home, { sdd: false });
  const result = await doctor(env);
  assert.equal(find(result, "project", "mode").detail, "sdd");
  const check = find(result, "project", "sdd-package");
  assert.equal(check.status, "error");
  assertActionable(check);
  assert.match(check.action, /--with-sdd/);
  assert.equal(result.exit_code, 1);
});

test("an SDD change in flight is resumable and warns when SDD is not installed", async (t) => {
  const env = setup(t);
  write(path.join(env.root, "openspec", "changes", "add-login", "state.yaml"), "change: add-login\nstatus: ready-for-apply\n");
  write(path.join(env.root, "openspec", "changes", "archive", "2026-01-01-old", "state.yaml"), "change: old\nstatus: archived\n");
  installClaude(env.home, { sdd: false });
  const result = await doctor(env);
  const change = find(result, "project", "sdd-change", "add-login");
  assert.equal(change.status, "info");
  assert.match(change.detail, /ready-for-apply/);
  assert.match(change.action, /\/sdd-continue add-login/);
  assert.equal(find(result, "project", "sdd-change", "old"), undefined, "archived changes are not in flight");
  const pkg = find(result, "project", "sdd-package");
  assert.equal(pkg.status, "warn");
  assert.match(pkg.action, /--with-sdd/);
  assert.equal(result.exit_code, 0);
});

test("the IDD/openspec asymmetries are reported as warnings", async (t) => {
  const env = setup(t);
  write(path.join(env.root, "idd", "config.yaml"), "strict_tdd: true\n");
  write(path.join(env.root, ".git", "hooks", "pre-commit"), '#!/bin/sh\nnode "$(git rev-parse --show-toplevel)/scripts/hooks/pre-commit-hook.js"\n');
  fs.mkdirSync(path.join(env.root, ".ospec", "session"), { recursive: true });
  const result = await doctor(env, { spawn: makeSpawn({ ignored: false }) });
  const tdd = find(result, "project", "strict-tdd-hook");
  assert.equal(tdd.status, "warn");
  assertActionable(tdd);
  const session = find(result, "project", "session-dir");
  assert.equal(session.status, "warn");
  assertActionable(session);
  assert.match(session.action, /\.gitignore/);
  assert.equal(result.exit_code, 0);
});

test("strict TDD declared in both places and an ignored .ospec/ are fine", async (t) => {
  const env = setup(t);
  write(path.join(env.root, "idd", "config.yaml"), "strict_tdd: true\n");
  write(path.join(env.root, "openspec", "config.yaml"), "testing:\n  tdd_mode: strict\n");
  write(path.join(env.root, ".git", "hooks", "pre-commit"), "node scripts/hooks/pre-commit-hook.js\n");
  fs.mkdirSync(path.join(env.root, ".ospec"), { recursive: true });
  const result = await doctor(env);
  assert.equal(find(result, "project", "strict-tdd-hook").status, "ok");
  assert.equal(find(result, "project", "session-dir").status, "ok");
});

test("disabled hook guards are named", async (t) => {
  const env = setup(t);
  const result = await doctor(env, { env: { DISABLE_AGENT_SHIELD: "true", DISABLE_TOKEN_ADVISOR: "true", DISABLE_OSPEC_PRECOMMIT: "false" } });
  const check = find(result, "project", "hook-guards");
  assert.equal(check.status, "warn");
  assertActionable(check);
  assert.match(check.detail, /DISABLE_AGENT_SHIELD/);
  assert.match(check.detail, /DISABLE_TOKEN_ADVISOR/);
  assert.doesNotMatch(check.detail, /DISABLE_OSPEC_PRECOMMIT/);
});

test("a healthy Claude installation passes every host check", async (t) => {
  const env = setup(t);
  const installPath = installClaude(env.home, { sdd: true });
  write(path.join(installPath, "scripts", "hooks", "ospec-hooks-linux-amd64"), "bin");
  const result = await doctor(env);
  for (const id of ["plugin", "hooks", "router", "router-duplicate", "budget"]) {
    assert.equal(find(result, "claude", id).status, "ok", `claude/${id}`);
  }
  assert.equal(find(result, "claude", "plugin").detail, "2.0.0");
  assert.equal(find(result, "claude", "engram").status, "info", "Engram is optional");
  assert.equal(result.exit_code, 0);
});

test("a broken or duplicated Claude installation is reported", async (t) => {
  const env = setup(t);
  installClaude(env.home, { hooks: false, extraInstall: { scope: "project", installPath: path.join(env.home, "gone"), version: "1.0.0" } });
  const result = await doctor(env);
  const plugin = find(result, "claude", "plugin");
  assert.equal(plugin.status, "error");
  assertActionable(plugin);
  assert.match(plugin.cause, /gone/);
  const hooks = find(result, "claude", "hooks");
  assert.equal(hooks.status, "error");
  assertActionable(hooks);
  assert.equal(result.exit_code, 1);
});

test("several Claude installations are a warning", async (t) => {
  const env = setup(t);
  const other = installClaude(path.join(env.home, "other"), { version: "1.0.0" });
  installClaude(env.home, { extraInstall: { scope: "project", installPath: other, version: "1.0.0" } });
  const plugin = find(await doctor(env), "claude", "plugin");
  assert.equal(plugin.status, "warn");
  assertActionable(plugin);
  assert.match(plugin.cause, /1\.0\.0/);
});

test("the router block is checked for presence, drift, duplicates and budget", async (t) => {
  const missing = setup(t);
  installClaude(missing.home, { block: null });
  const absent = find(await doctor(missing), "claude", "router");
  assert.equal(absent.status, "warn");
  assertActionable(absent);
  assert.match(absent.action, /npm run setup:claude|setup:claude/);

  const drift = setup(t);
  installClaude(drift.home, { block: "# old router\n" });
  const stale = find(await doctor(drift), "claude", "router");
  assert.equal(stale.status, "warn");
  assertActionable(stale);

  const dup = setup(t);
  installClaude(dup.home, { outside: "# Mine\n\nLoad the skill `ospec-workflow:sdd-orchestrator` for SDD.\n\n" });
  const duplicate = find(await doctor(dup), "claude", "router-duplicate");
  assert.equal(duplicate.status, "warn");
  assertActionable(duplicate);

  const big = setup(t);
  const huge = `${ROUTER}${"x".repeat(4100)}\n`;
  installClaude(big.home, { router: huge, block: huge });
  const budget = find(await doctor(big), "claude", "budget");
  assert.equal(budget.status, "warn");
  assertActionable(budget);
});

test("--target restricts the hosts and a missing installation is an error", async (t) => {
  const env = setup(t);
  const result = await doctor(env, { target: "claude" });
  const plugin = find(result, "claude", "plugin");
  assert.equal(plugin.status, "error");
  assertActionable(plugin);
  assert.equal(result.exit_code, 1);
  await assert.rejects(doctor(env, { target: "nope" }), (error) => error.code === "usage");
});

test("from the ospec-workflow checkout, drift and git hooks are checked", async (t) => {
  const env = setup(t);
  write(path.join(env.root, "package.json"), { name: "ospec-workflow", version: "2.1.0" });
  write(path.join(env.root, "scripts", "configure", "cli.js"), "// generator\n");
  fs.mkdirSync(path.join(env.root, ".git", "hooks"), { recursive: true });
  write(path.join(env.root, "dist", "claude-marketplace", "plugins", "ospec-workflow", ".claude-plugin", "plugin.json"), { version: "2.0.0" });
  installClaude(env.home, { version: "2.0.0" });
  const result = await doctor(env);
  const install = find(result, "checkout", "install-drift", "claude");
  assert.equal(install.status, "warn");
  assertActionable(install);
  assert.match(install.action, /npm run setup:claude/);
  const dist = find(result, "checkout", "dist-drift", "claude");
  assert.equal(dist.status, "warn");
  assertActionable(dist);
  const hooks = find(result, "checkout", "git-hooks");
  assert.equal(hooks.status, "warn");
  assert.match(hooks.action, /npm run setup:git-hooks/);
  assert.equal(result.exit_code, 0, "drift alone is a warning");
});

test("checkout checks are skipped in a consumer project", async (t) => {
  const env = setup(t);
  write(path.join(env.root, "package.json"), { name: "my-app", version: "1.0.0" });
  const result = await doctor(env);
  assert.equal(result.checks.some((check) => check.scope === "checkout"), false);
});

test("Engram detection is read-only and reports a partial setup", async (t) => {
  const env = setup(t);
  installClaude(env.home, { sdd: true });
  const spawn = makeSpawn({
    commands: {
      "engram version": { stdout: "engram 1.2.3\n" },
      "engram doctor --json": { stdout: '{"status":"ok"}' },
      "claude --version": { stdout: "2.0.0\n" },
      "claude plugin list": { stdout: "ospec-workflow@ospec-tools\n" },
      "claude mcp list": { stdout: "engram: engram mcp - connected\n" },
    },
  });
  const result = await doctor(env, { spawn });
  const engram = find(result, "claude", "engram");
  assert.equal(engram.status, "warn");
  assertActionable(engram);
  assert.match(engram.action, /engram setup claude-code/);
  assert.equal(spawn.calls.filter((call) => call === "engram doctor --json").length, 1, "explicit diagnosis keeps the store probe");
  assert.equal(spawn.calls.some((call) => / setup /.test(` ${call} `)), false, "no mutating command");
});

test("the text report names every warning and error with cause and action", async (t) => {
  const env = setup(t);
  write(path.join(env.root, "idd", "config.yaml"), "mode: waterfall\n");
  const text = renderDoctor(await doctor(env));
  assert.match(text, /error\s+project\/idd-config/);
  assert.match(text, /cause: /);
  assert.match(text, /action: /);
  assert.match(text, /1 error/);
});

test("on Windows the Claude CLI is found in its WinGet package, as setup:claude does", async (t) => {
  const env = setup(t);
  installClaude(env.home, { sdd: true });
  const local = tempDir(t, "ospec-doctor-local-");
  const exe = path.join(local, "Microsoft", "WinGet", "Packages", "Anthropic.ClaudeCode_x", "claude.exe");
  write(exe, "");
  const spawn = makeSpawn({
    commands: {
      "engram version": { stdout: "engram 1.2.3\n" },
      "engram doctor --json": { stdout: '{"status":"ok"}' },
      [`${exe} --version`]: { stdout: "2.0.0\n" },
      [`${exe} plugin list`]: { stdout: "engram@engram\n" },
      [`${exe} mcp list`]: { stdout: "plugin:engram:engram: engram mcp - connected\n" },
    },
  });
  const result = await doctor(env, { spawn, platform: "win32", env: { LOCALAPPDATA: local } });
  assert.equal(find(result, "claude", "engram").status, "ok");
});
