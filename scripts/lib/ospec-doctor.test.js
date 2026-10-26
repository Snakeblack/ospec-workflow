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

// Spawn stub: `git check-ignore` answers from `ignored`, the hook launcher from
// `probe` (a healthy, silent PreToolUse by default), and every other command is
// absent unless listed in `commands` ("bin arg..." -> result).
function makeSpawn({ ignored = true, tracked = "", commands = {}, probe = {} } = {}) {
  const calls = [];
  const probes = [];
  const spawn = (bin, args, options = {}) => {
    const key = [bin, ...args].join(" ");
    calls.push(key);
    if (bin === "git" && args[0] === "check-ignore") return { status: ignored ? 0 : 1, stdout: "", stderr: "" };
    if (bin === "git" && args[0] === "ls-files") return { status: 0, stdout: tracked, stderr: "" };
    if (/ospec-hooks-launch\.js$/.test(String(args[0]))) {
      probes.push({ bin, args, options });
      return { status: 0, stdout: "", stderr: "", ...probe };
    }
    if (Object.hasOwn(commands, key)) return { status: 0, stdout: "", stderr: "", ...commands[key] };
    return { error: Object.assign(new Error(`spawn ${bin} ENOENT`), { code: "ENOENT" }) };
  };
  spawn.calls = calls;
  spawn.probes = probes;
  return spawn;
}

function installClaude(home, { version = "2.0.0", sdd = false, hooks = true, redaction = false, router = ROUTER, block = ROUTER, outside = "", extraInstall = null } = {}) {
  const installPath = path.join(home, ".claude", "plugins", "cache", "ospec-tools", "ospec-workflow", version);
  write(path.join(installPath, ".claude-plugin", "plugin.json"), { name: "ospec-workflow", version });
  write(path.join(installPath, "global-instructions", "CLAUDE.md"), router);
  write(path.join(installPath, "agents", "review-trust.md"), "reviewer\n");
  if (sdd) write(path.join(installPath, "agents", "sdd-explore.md"), "phase\n");
  if (hooks) {
    const launch = 'node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js"';
    write(path.join(installPath, "hooks", "hooks.json"), {
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: `${launch} session-start` }] }],
        PreToolUse: [{ hooks: [{ type: "command", command: `${launch} pre-tool-use${redaction ? " --output-redaction" : ""}`, timeout: 5 }] }],
      },
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

// E1.46 state-durability: --repair moves an unreadable state aside, without
// overwriting an earlier one, and the change resumes from its .bak or from a
// new intent with the same id.
test("--repair moves an unreadable IDD state aside and the change resumes", async (t) => {
  const env = setup(t);
  const dir = path.join(env.root, "idd", "broken");
  write(path.join(dir, "state.yaml"), "{ not json");
  write(path.join(dir, "change.md"), "# broken\n");
  write(path.join(env.root, "idd", "from-bak", "state.yaml"), "{ not json either");
  write(path.join(env.root, "idd", "from-bak", "state.yaml.bak"), { ...OPEN_STATE, change: "from-bak" });

  const plain = await doctor(env);
  assert.match(find(plain, "project", "idd-change", "broken").action, /ospec doctor --repair/);
  assert.ok(fs.existsSync(path.join(dir, "state.yaml")), "without --repair the doctor writes nothing");

  const repaired = await doctor(env, { repair: true });
  const check = find(repaired, "project", "idd-change", "broken");
  assert.equal(check.status, "warn");
  assertActionable(check);
  assert.match(check.cause, /state\.yaml\.corrupt-/);
  assert.match(check.action, /ospec record intent --change broken/);
  assert.match(check.action, /git checkout/);
  assert.equal(repaired.exit_code, 0);
  assert.equal(fs.existsSync(path.join(dir, "state.yaml")), false);
  const [aside] = fs.readdirSync(dir).filter((name) => name.startsWith("state.yaml.corrupt-"));
  assert.equal(fs.readFileSync(path.join(dir, aside), "utf8"), "{ not json");
  assert.equal(fs.readFileSync(path.join(dir, "change.md"), "utf8"), "# broken\n");

  const { mutateChange, readChange } = require("./idd-store.js");
  const { recordIntent } = require("./idd-record.js");
  const intent = { change: "broken", kind: "bug", summary: "Fix it.", acceptance: "It works.", noOpenFacts: true, basis: "The request settles it." };
  const { state } = await mutateChange(env.root, "broken", (current) => recordIntent(current, intent));
  assert.equal(state.status, "open");
  assert.equal(fs.readFileSync(path.join(dir, "change.md"), "utf8"), "# broken\n");
  assert.equal((await readChange(env.root, "from-bak")).change, "from-bak");

  write(path.join(dir, "state.yaml"), "{ broken again");
  await doctor(env, { repair: true });
  assert.equal(fs.readdirSync(dir).filter((name) => name.startsWith("state.yaml.corrupt-")).length, 2, "an earlier copy is never overwritten");
});

test("--repair leaves the archive, a symlinked state and a readable state alone", async (t) => {
  const env = setup(t);
  write(path.join(env.root, "idd", "archive", "2026-10-01-old", "state.yaml"), "{ not json");
  write(path.join(env.root, "idd", "add-export", "state.yaml"), OPEN_STATE);
  const outside = path.join(env.home, "outside.yaml");
  write(outside, "{ not json");
  let linked = true;
  try {
    fs.mkdirSync(path.join(env.root, "idd", "linked"), { recursive: true });
    fs.symlinkSync(outside, path.join(env.root, "idd", "linked", "state.yaml"));
  } catch {
    linked = false;
  }
  const before = treeDigest(env.root);

  const result = await doctor(env, { repair: true });

  assert.equal(treeDigest(env.root), before, "nothing outside the whitelist moves");
  assert.equal(find(result, "project", "idd-change", "add-export").status, "info");
  if (linked) {
    const check = find(result, "project", "idd-change", "linked");
    assert.equal(check.status, "error");
    assert.match(check.cause, /not a regular file/);
    assert.equal(fs.readFileSync(outside, "utf8"), "{ not json");
  }
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

test("an open IDD change without checks warns with approval guidance and writes nothing", async (t) => {
  const env = setup(t);
  write(path.join(env.root, "idd", OPEN_STATE.change, "state.yaml"), OPEN_STATE);
  write(path.join(env.root, "package.json"), { scripts: { test: "node verify.js" } });
  const before = treeDigest(env.root);
  const result = await doctor(env);
  const check = find(result, "project", "idd-checks");
  assert.equal(check.status, "warn");
  assertActionable(check);
  assert.match(check.cause, /no checks declared/);
  assert.match(check.action, /idd\/config.yaml/);
  assert.match(check.action, /npm test/);
  assert.match(check.action, /approval/i);
  assert.equal(result.exit_code, 0);
  assert.equal(treeDigest(env.root), before);

  write(path.join(env.root, "idd", "config.yaml"), "checks:\n");
  assert.equal(find(await doctor(env), "project", "idd-checks").status, "warn");
  write(path.join(env.root, "idd", "config.yaml"), "checks:\n  test: npm test\n");
  assert.equal(find(await doctor(env), "project", "idd-checks"), undefined);
});

test("missing checks do not warn for invalid config or only archived changes", async (t) => {
  const env = setup(t);
  write(path.join(env.root, "idd", "archive", "2026-10-08-add-export", "state.yaml"), { ...OPEN_STATE, status: "closed" });
  assert.equal(find(await doctor(env), "project", "idd-checks"), undefined);
  write(path.join(env.root, "idd", OPEN_STATE.change, "state.yaml"), OPEN_STATE);
  write(path.join(env.root, "idd", "config.yaml"), "mode: invalid\n");
  const result = await doctor(env);
  assert.equal(find(result, "project", "idd-config").status, "error");
  assert.equal(find(result, "project", "idd-checks"), undefined);
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

test("an IDD strict project without openspec no longer warns about the hook", async (t) => {
  const env = setup(t);
  write(path.join(env.root, "idd", "config.yaml"), "strict_tdd: true\n");
  write(path.join(env.root, ".git", "hooks", "pre-commit"), '#!/bin/sh\nnode "$(git rev-parse --show-toplevel)/scripts/hooks/pre-commit-hook.js"\n');
  fs.mkdirSync(path.join(env.root, ".ospec", "session"), { recursive: true });
  const result = await doctor(env, { spawn: makeSpawn({ ignored: false }) });
  assert.equal(find(result, "project", "strict-tdd-hook").status, "ok");
  const session = find(result, "project", "session-dir");
  assert.equal(session.status, "warn");
  assertActionable(session);
  assert.match(session.action, /\.gitignore/);
  assert.equal(result.exit_code, 0);
});

test("the doctor warns when the inactive Strict TDD source contradicts the active mode", async (t) => {
  const iddWins = setup(t);
  write(path.join(iddWins.root, "idd", "config.yaml"), "strict_tdd: false\n");
  write(path.join(iddWins.root, "openspec", "config.yaml"), "testing:\n  tdd_mode: strict\n");
  write(path.join(iddWins.root, ".git", "hooks", "pre-commit"), "node scripts/hooks/pre-commit-hook.js\n");
  const idd = find(await doctor(iddWins), "project", "strict-tdd-hook");
  assert.equal(idd.status, "warn");
  assert.match(idd.cause, /strict_tdd/);
  assert.match(idd.cause, /testing.tdd_mode/);
  assertActionable(idd);

  const sddWins = setup(t);
  write(path.join(sddWins.root, "idd", "config.yaml"), "mode: sdd\nstrict_tdd: true\n");
  write(path.join(sddWins.root, "openspec", "config.yaml"), "testing:\n  tdd_mode: focused\n");
  write(path.join(sddWins.root, ".git", "hooks", "pre-commit"), "node scripts/hooks/pre-commit-hook.js\n");
  const sdd = find(await doctor(sddWins), "project", "strict-tdd-hook");
  assert.equal(sdd.status, "warn");
  assert.match(sdd.cause, /testing.tdd_mode/);
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

test("a tracked .ospec/ is named with the command that untracks it", async (t) => {
  const env = setup(t);
  fs.mkdirSync(path.join(env.root, ".ospec", "session"), { recursive: true });
  const spawn = makeSpawn({ tracked: ".ospec/session/latest.md\n" });
  const session = find(await doctor(env, { spawn }), "project", "session-dir");
  assert.equal(session.status, "warn");
  assert.match(session.cause, /tracks/);
  assert.match(session.action, /git rm -r --cached \.ospec/);
  assert.equal(spawn.calls.some((call) => call.startsWith("git check-ignore")), false);
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
  for (const id of ["plugin", "hooks", "hook-responds", "router", "router-duplicate", "budget"]) {
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

test("the hook probe runs the installed PreToolUse launcher outside the project", async (t) => {
  const env = setup(t);
  const installPath = installClaude(env.home);
  const spawn = makeSpawn();
  const check = find(await doctor(env, { spawn, execPath: "/node" }), "claude", "hook-responds");
  assert.equal(check.status, "ok");
  assert.equal(spawn.probes.length, 1);
  const [{ bin, args, options }] = spawn.probes;
  assert.equal(bin, "/node");
  assert.deepEqual(args, [path.join(installPath, "scripts", "hooks", "ospec-hooks-launch.js"), "pre-tool-use"]);
  assert.equal(options.cwd, os.tmpdir());
  assert.equal(options.timeout, 5000);
  assert.equal(JSON.parse(options.input).tool_name, "Read");
});

test("a hook that fails, times out or is missing is an error with cause and action", async (t) => {
  const cases = [
    [{ stderr: "[ospec error] Hook pre-tool-use failed: exit 3\n", stdout: '{"hookSpecificOutput":{"permissionDecision":"ask"}}\n' }, /exit 3/],
    [{ status: null, signal: "SIGKILL", error: Object.assign(new Error("spawnSync node ETIMEDOUT"), { code: "ETIMEDOUT" }) }, /ETIMEDOUT/],
    [{ status: 1, stderr: "SyntaxError: Unexpected token\n" }, /exit 1.*SyntaxError/],
  ];
  for (const [probe, cause] of cases) {
    const env = setup(t);
    installClaude(env.home);
    const result = await doctor(env, { spawn: makeSpawn({ probe }) });
    const check = find(result, "claude", "hook-responds");
    assert.equal(check.status, "error");
    assertActionable(check);
    assert.match(check.cause, cause);
    assert.equal(result.exit_code, 1);
  }
  const env = setup(t);
  installClaude(env.home, { hooks: false });
  const spawn = makeSpawn();
  const result = await doctor(env, { spawn });
  assert.equal(find(result, "claude", "hook-responds"), undefined, "the hooks check already reports it");
  assert.equal(spawn.probes.length, 0);
});

test("the probe reads the real launcher's failure and writes nothing", async (t) => {
  const launcher = path.join(__dirname, "..", "hooks", "ospec-hooks-launch.js");
  for (const [child, status] of [["process.stdin.resume(); process.stdin.on('end', () => process.exit(0));\n", "ok"], ["process.exit(3);\n", "error"]]) {
    const env = setup(t);
    const installPath = installClaude(env.home);
    const hooksDir = path.join(installPath, "scripts", "hooks");
    fs.copyFileSync(launcher, path.join(hooksDir, "ospec-hooks-launch.js"));
    write(path.join(hooksDir, "pre-tool-use.js"), child);
    const stub = makeSpawn();
    const spawn = (bin, args, options) => (/ospec-hooks-launch\.js$/.test(String(args[0]))
      ? require("node:child_process").spawnSync(bin, args, { encoding: "utf8", ...options })
      : stub(bin, args, options));
    const before = [treeDigest(env.root), treeDigest(env.home)];
    const check = find(await doctor(env, { spawn, env: process.env }), "claude", "hook-responds");
    assert.equal(check.status, status, check.cause);
    if (status === "error") assert.match(check.cause, /exit 3/);
    assert.deepEqual([treeDigest(env.root), treeDigest(env.home)], before);
  }
});

test("output redaction warns unless Claude Code is 2.1.121 or later", async (t) => {
  const cases = [["2.1.308 (Claude Code)\n", "ok"], ["2.1.121 (Claude Code)\n", "ok"], ["2.1.13 (Claude Code)\n", "warn"], ["1.0.0 (Claude Code)\n", "warn"], [null, "warn"]];
  for (const [version, status] of cases) {
    const env = setup(t);
    installClaude(env.home, { redaction: true });
    const commands = version === null ? {} : { "claude --version": { stdout: version } };
    const check = find(await doctor(env, { spawn: makeSpawn({ commands }) }), "claude", "output-redaction");
    assert.equal(check.status, status, String(version));
    if (status === "warn") {
      assertActionable(check);
      assert.match(check.cause, version === null ? /could not be read/ : /2\.1\.121/);
    }
  }
  const env = setup(t);
  installClaude(env.home);
  const check = find(await doctor(env, { spawn: makeSpawn({ commands: { "claude --version": { stdout: "1.0.0\n" } } }) }), "claude", "output-redaction");
  assert.equal(check, undefined, "without redaction there is nothing to warn about");
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
