"use strict";

// E1.7 (b) ospec doctor for the hosts other than Claude Code
// (openspec/specs/idd/spec.md, REQ-idd-019): Codex, Cursor, Antigravity,
// OpenCode, GitHub Copilot CLI and VS Code. Every known installation failure is
// reported with its cause and action, and the doctor writes nothing.

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { DOCTOR_TARGETS, runDoctor } = require("./ospec-doctor.js");

const BEGIN = "<!-- ospec-workflow:router:begin -->";
const END = "<!-- ospec-workflow:router:end -->";
const ROUTER = "# ospec-workflow\n\nIDD by default.\n";
const SKILL = "---\nname: idd\n---\n\nRun `node \"/home/dev/.cursor/scripts/ospec.js\"`.\n";

function tempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
}

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

function makeSpawn({ commands = {} } = {}) {
  const calls = [];
  const spawn = (bin, args) => {
    const key = [bin, ...args].join(" ");
    calls.push(key);
    if (bin === "git" && args[0] === "check-ignore") return { status: 0, stdout: "", stderr: "" };
    if (Object.hasOwn(commands, key)) return { status: 0, stdout: "", stderr: "", ...commands[key] };
    return { error: Object.assign(new Error(`spawn ${bin} ENOENT`), { code: "ENOENT" }) };
  };
  spawn.calls = calls;
  return spawn;
}

// Where each installer leaves its files (scripts/configure/install-*.js).
const LAYOUTS = {
  codex: { root: [".codex"], runtime: "ospec-workflow/scripts/ospec.js", router: "AGENTS.md", hooks: "hooks.json", sdd: "agents/sdd-explore.toml", skills: [".agents", "skills"] },
  cursor: { root: [".cursor"], runtime: "scripts/ospec.js", router: "rules/ospec-router.mdc", hooks: "hooks.json", sdd: "agents/sdd-explore.md" },
  antigravity: { root: [".gemini", "config"], runtime: "scripts/ospec.js", router: "rules/ospec-router.instructions.md", hooks: "hooks.json", sdd: "agents/sdd-explore.agent.md" },
  opencode: { root: [".config", "opencode"], runtime: "scripts/ospec.js", router: "instructions/ospec-router.instructions.md", hooks: "plugins/ospec.js", sdd: "agents/sdd-explore.md" },
  "github-copilot": { root: [".copilot"], runtime: "scripts/ospec.js", router: "instructions/ospec-router.instructions.md", hooks: "hooks/hooks.json", sdd: "agents/sdd-explore.agent.md" },
};
const SCRIPTS = { codex: "setup:codex", cursor: "setup:cursor", antigravity: "setup:antigravity", opencode: "setup:opencode", "github-copilot": "setup:copilot", vscode: "setup:vscode" };

function install(home, target, { version = "2.0.0", runtime = true, router = ROUTER, hooks = true, sdd = false, skill = SKILL } = {}) {
  const layout = LAYOUTS[target];
  const root = path.join(home, ...layout.root);
  const skills = layout.skills ? path.join(home, ...layout.skills) : path.join(root, "skills");
  write(path.join(root, ".ospec-workflow-install.json"), { version, target, installedAt: "2026-10-08T00:00:00.000Z", files: [] });
  if (runtime) write(path.join(root, layout.runtime), "// ospec CLI\n");
  if (router !== null) {
    write(path.join(root, layout.router), target === "codex" ? `# Mine\n\n${BEGIN}\n${router.trim()}\n${END}\n` : router);
  }
  if (target === "opencode") write(path.join(root, "opencode.json"), { instructions: ["instructions/*.md"] });
  if (hooks) write(path.join(root, layout.hooks), "{}\n");
  write(path.join(root, "agents", target === "codex" ? "review-trust.toml" : "review-trust.md"), "reviewer\n");
  if (sdd) write(path.join(root, layout.sdd), "phase\n");
  if (skill !== null) write(path.join(skills, "idd", "SKILL.md"), skill);
  return root;
}

// A VS Code plugin tree as setup:vscode leaves it (dist/vscode, rendered).
function vscodeBuild(dir, { version = "2.0.0", sdd = false, skill = SKILL } = {}) {
  write(path.join(dir, ".claude-plugin", "plugin.json"), { name: "ospec-workflow", version });
  write(path.join(dir, "scripts", "ospec.js"), "// ospec CLI\n");
  write(path.join(dir, "rules", "ospec-router.instructions.md"), ROUTER);
  write(path.join(dir, "hooks", "hooks.json"), "{}\n");
  write(path.join(dir, "agents", "review-trust.md"), "reviewer\n");
  if (sdd) write(path.join(dir, "agents", "sdd-explore.md"), "phase\n");
  write(path.join(dir, "skills", "idd", "SKILL.md"), skill);
  return dir;
}

function vscodeSettings(home, settings) {
  write(path.join(home, ".config", "Code", "User", "settings.json"), typeof settings === "string" ? settings : settings);
}

function setup(t) {
  return { root: tempDir(t, "ospec-doctor-project-"), home: tempDir(t, "ospec-doctor-home-") };
}

function doctor({ root, home }, options = {}) {
  return runDoctor({ root, home, env: {}, platform: "linux", arch: "x64", spawn: makeSpawn(), ...options });
}

function find(result, scope, id, subject) {
  return result.checks.find((check) => check.scope === scope && check.id === id && (subject === undefined || check.subject === subject));
}

function assertActionable(check, label) {
  assert.ok(check, `${label}: check missing`);
  assert.ok(check.cause, `${label}: ${check.scope}/${check.id} needs a cause`);
  assert.ok(check.action, `${label}: ${check.scope}/${check.id} needs an action`);
}

test("the doctor covers all seven hosts", () => {
  assert.deepEqual([...DOCTOR_TARGETS].sort(), ["antigravity", "claude", "codex", "cursor", "github-copilot", "opencode", "vscode"]);
});

test("a healthy installation of each manifest host passes every host check", async (t) => {
  for (const target of Object.keys(LAYOUTS)) {
    const env = setup(t);
    install(env.home, target, { sdd: true });
    const result = await doctor(env);
    for (const id of ["install", "runtime", "markers", "router", "budget", "hooks"]) {
      assert.equal(find(result, target, id)?.status, "ok", `${target}/${id}: ${JSON.stringify(find(result, target, id))}`);
    }
    assert.equal(find(result, target, "install").detail, "2.0.0");
    assert.equal(find(result, target, "engram").status, "info", `${target}: Engram is optional`);
    assert.equal(result.exit_code, 0, target);
  }
});

test("a missing runtime, an unrendered marker or missing hooks is an error; a missing router is a warning", async (t) => {
  for (const target of Object.keys(LAYOUTS)) {
    const env = setup(t);
    install(env.home, target, { runtime: false, hooks: false, router: null, skill: "Run `node \"__OSPEC_RUNTIME_DIR__/scripts/ospec.js\"`.\n" });
    const result = await doctor(env);
    const runtime = find(result, target, "runtime");
    assert.equal(runtime.status, "error", `${target}/runtime`);
    assertActionable(runtime, target);
    assert.match(runtime.action, new RegExp(`npm run ${SCRIPTS[target]}`));
    const markers = find(result, target, "markers");
    assert.equal(markers.status, "error", `${target}/markers`);
    assertActionable(markers, target);
    assert.match(markers.cause, /__OSPEC_RUNTIME_DIR__/);
    assert.match(markers.cause, /idd/);
    const hooks = find(result, target, "hooks");
    assert.equal(hooks.status, "error", `${target}/hooks`);
    assertActionable(hooks, target);
    const router = find(result, target, "router");
    assert.equal(router.status, "warn", `${target}/router`);
    assertActionable(router, target);
    assert.equal(result.exit_code, 1, target);
  }
});

test("a manifest left by a stub install (version 0.0.0) is a broken installation", async (t) => {
  const env = setup(t);
  install(env.home, "github-copilot", { version: "0.0.0", runtime: false, router: null, hooks: false, skill: null });
  const result = await doctor(env);
  const check = find(result, "github-copilot", "install");
  assert.equal(check.status, "error");
  assertActionable(check, "copilot");
  assert.match(check.cause, /0\.0\.0/);
  assert.match(check.action, /npm run setup:copilot/);
  assert.equal(find(result, "github-copilot", "runtime").status, "error");
});

test("an unreadable manifest is an error", async (t) => {
  const env = setup(t);
  const root = install(env.home, "cursor");
  write(path.join(root, ".ospec-workflow-install.json"), "{ nope");
  const check = find(await doctor(env), "cursor", "install");
  assert.equal(check.status, "error");
  assertActionable(check, "cursor");
});

test("Codex: a pre-E0.4 orchestrator copy in AGENTS.md and an oversized router are warnings", async (t) => {
  const legacy = setup(t);
  const root = install(legacy.home, "codex");
  write(path.join(root, "AGENTS.md"), "# SDD Orchestrator\n\nYou coordinate phases.\n");
  const router = find(await doctor(legacy), "codex", "router");
  assert.equal(router.status, "warn");
  assertActionable(router, "codex legacy");
  assert.match(router.cause, /orchestrator/i);

  const big = setup(t);
  install(big.home, "codex", { router: `${ROUTER}${"x".repeat(4100)}\n` });
  const budget = find(await doctor(big), "codex", "budget");
  assert.equal(budget.status, "warn");
  assertActionable(budget, "codex budget");
});

test("Codex honours CODEX_HOME", async (t) => {
  const env = setup(t);
  const custom = path.join(env.home, "managed");
  install(env.home, "codex");
  fs.renameSync(path.join(env.home, ".codex"), custom);
  const result = await doctor(env, { env: { CODEX_HOME: custom } });
  assert.equal(find(result, "codex", "install").status, "ok");
});

test("OpenCode without the instructions glob in opencode.json does not load the router", async (t) => {
  const env = setup(t);
  const root = install(env.home, "opencode");
  write(path.join(root, "opencode.json"), { instructions: [] });
  const router = find(await doctor(env), "opencode", "router");
  assert.equal(router.status, "warn");
  assertActionable(router, "opencode");
  assert.match(router.cause, /instructions\/\*\.md/);
});

test("VS Code: a healthy dist/vscode entry passes, in array or object form", async (t) => {
  for (const shape of ["array", "object"]) {
    const env = setup(t);
    const build = vscodeBuild(path.join(env.home, "src", "ospec-workflow", "dist", "vscode"), { sdd: true });
    vscodeSettings(env.home, { "chat.pluginLocations": shape === "array" ? [build] : { [build]: true } });
    const result = await doctor(env);
    for (const id of ["plugin-locations", "runtime", "markers", "router", "budget", "hooks"]) {
      assert.equal(find(result, "vscode", id)?.status, "ok", `${shape} vscode/${id}: ${JSON.stringify(find(result, "vscode", id))}`);
    }
    assert.equal(find(result, "vscode", "plugin-locations").detail, "2.0.0");
    assert.equal(result.exit_code, 0, shape);
  }
});

test("VS Code: several ospec entries warn; the source checkout or a missing path is an error", async (t) => {
  const env = setup(t);
  const build = vscodeBuild(path.join(env.home, "a", "dist", "vscode"));
  const other = vscodeBuild(path.join(env.home, "b", "dist", "vscode"), { version: "1.0.0" });
  const checkout = path.join(env.home, "src", "ospec-workflow");
  write(path.join(checkout, "package.json"), { name: "ospec-workflow", version: "2.0.0" });
  write(path.join(checkout, ".plugin.json"), { name: "ospec-workflow", version: "2.0.0" });
  write(path.join(checkout, "scripts", "configure", "cli.js"), "// generator\n");
  const gone = path.join(env.home, "old", "ospec-workflow", "dist", "vscode");
  vscodeSettings(env.home, `{\n  // mine\n  "chat.pluginLocations": [${[build, other, checkout, gone, path.join(env.home, "unrelated")].map((p) => JSON.stringify(p)).join(", ")}],\n}\n`);
  const result = await doctor(env);
  const checks = result.checks.filter((check) => check.scope === "vscode" && check.id === "plugin-locations");
  const duplicate = checks.find((check) => check.status === "warn");
  assertActionable(duplicate, "vscode duplicate");
  assert.match(duplicate.cause, /1\.0\.0/);
  const source = checks.find((check) => check.status === "error" && check.subject === checkout);
  assertActionable(source, "vscode source");
  assert.match(source.action, /npm run setup:vscode/);
  const missing = checks.find((check) => check.status === "error" && check.subject === gone);
  assertActionable(missing, "vscode missing");
  assert.equal(checks.some((check) => check.subject === path.join(env.home, "unrelated")), false, "other plugins are not ours");
  assert.equal(result.exit_code, 1);
});

test("VS Code: chat.agentFilesLocations pointing into the ospec plugin loads its agents twice", async (t) => {
  const env = setup(t);
  const build = vscodeBuild(path.join(env.home, "dist", "vscode"));
  vscodeSettings(env.home, { "chat.pluginLocations": [build], "chat.agentFilesLocations": { [path.join(build, "agents")]: true } });
  const check = find(await doctor(env), "vscode", "agent-files");
  assert.equal(check.status, "warn");
  assertActionable(check, "vscode agent files");
});

test("--target checks one host and a missing installation is an error", async (t) => {
  for (const target of [...Object.keys(LAYOUTS), "vscode"]) {
    const env = setup(t);
    const result = await doctor(env, { target });
    const check = result.checks.find((entry) => entry.scope === target && entry.status === "error");
    assertActionable(check, target);
    assert.match(check.action, new RegExp(`npm run ${SCRIPTS[target]}`));
    assert.equal(result.exit_code, 1, target);
  }
  const env = setup(t);
  install(env.home, "cursor");
  const only = await doctor(env, { target: "codex" });
  assert.equal(only.checks.some((check) => check.scope === "cursor"), false, "--target skips the other hosts");
});

test("from the checkout, every installed host is compared with its version", async (t) => {
  const env = setup(t);
  write(path.join(env.root, "package.json"), { name: "ospec-workflow", version: "2.1.0" });
  write(path.join(env.root, "scripts", "configure", "cli.js"), "// generator\n");
  install(env.home, "cursor", { version: "2.0.0" });
  install(env.home, "opencode", { version: "2.1.0" });
  const build = vscodeBuild(path.join(env.root, "dist", "vscode"), { version: "2.0.0" });
  vscodeSettings(env.home, { "chat.pluginLocations": [build] });
  const result = await doctor(env);
  const cursor = find(result, "checkout", "install-drift", "cursor");
  assert.equal(cursor.status, "warn");
  assertActionable(cursor, "cursor drift");
  assert.match(cursor.action, /npm run setup:cursor/);
  assert.equal(find(result, "checkout", "install-drift", "opencode").status, "ok");
  const vscode = find(result, "checkout", "install-drift", "vscode");
  assert.equal(vscode.status, "warn");
  assert.match(vscode.action, /npm run setup:vscode/);
  assert.equal(result.exit_code, 0, "drift alone is a warning");
});

test("mode sdd names every installed host without the SDD package", async (t) => {
  const env = setup(t);
  write(path.join(env.root, "idd", "config.yaml"), "mode: sdd\n");
  install(env.home, "cursor", { sdd: false });
  install(env.home, "codex", { sdd: true });
  const result = await doctor(env);
  const check = find(result, "project", "sdd-package");
  assert.equal(check.status, "error");
  assert.match(check.cause, /cursor/);
  assert.doesNotMatch(check.cause, /codex/);
  assert.match(check.action, /--with-sdd/);
});

test("a repository Codex install without the IDD protocol is a warning, unless the global install provides it", async (t) => {
  const repo = setup(t);
  write(path.join(repo.root, "AGENTS.md"), `${BEGIN}\n${ROUTER}${END}\n`);
  write(path.join(repo.root, ".codex", "agents", "review-trust.toml"), "reviewer\n");
  const bare = find(await doctor(repo), "project", "codex-repo");
  assert.equal(bare.status, "warn");
  assertActionable(bare, "codex repo");
  assert.match(bare.action, /npm run setup:codex/);

  install(repo.home, "codex");
  const covered = find(await doctor(repo), "project", "codex-repo");
  assert.equal(covered.status, "info");

  const none = setup(t);
  assert.equal(find(await doctor(none), "project", "codex-repo"), undefined);
});

test("Engram is probed for each host with one shared probe of the binary", async (t) => {
  const env = setup(t);
  install(env.home, "cursor");
  install(env.home, "antigravity");
  write(path.join(env.home, ".cursor", "engram-memory-protocol.md"), "protocol\n");
  write(path.join(env.home, ".cursor", "mcp.json"), { mcpServers: { engram: {} } });
  const spawn = makeSpawn({
    commands: {
      "engram version": { stdout: "engram 1.2.3\n" },
      "engram doctor --json": { stdout: '{"status":"ok"}' },
    },
  });
  const result = await doctor(env, { spawn });
  assert.equal(find(result, "cursor", "engram").status, "ok");
  const antigravity = find(result, "antigravity", "engram");
  assert.equal(antigravity.status, "warn");
  assertActionable(antigravity, "antigravity engram");
  assert.match(antigravity.action, /engram setup antigravity-cli/);
  assert.equal(spawn.calls.filter((call) => call === "engram version").length, 1);
  assert.equal(spawn.calls.filter((call) => call === "engram doctor --json").length, 1);
  assert.equal(spawn.calls.some((call) => / setup /.test(` ${call} `)), false, "no mutating command");
});

test("the doctor writes nothing under the home directory", async (t) => {
  const env = setup(t);
  for (const target of Object.keys(LAYOUTS)) install(env.home, target, { runtime: false });
  vscodeSettings(env.home, { "chat.pluginLocations": [vscodeBuild(path.join(env.home, "dist", "vscode"))] });
  const before = treeDigest(env.home);
  await doctor(env);
  assert.equal(treeDigest(env.home), before);
});

// E1.14: the repository install carries the IDD protocol and its runtime; the
// check is ok only when the runtime the protocol names exists.
test("a repository Codex install is ok when its IDD protocol names a runtime that exists", async (t) => {
  const repo = setup(t);
  write(path.join(repo.root, "AGENTS.md"), `${BEGIN}\n${ROUTER}${END}\n`);
  write(path.join(repo.root, ".agents", "skills", "idd", "SKILL.md"), "---\nname: idd\n---\n\n`ospec` below means `node \".codex/ospec-workflow/scripts/ospec.js\"`, run from the project root.\n");
  const missing = find(await doctor(repo), "project", "codex-repo");
  assert.equal(missing.status, "warn");
  assertActionable(missing, "codex repo runtime");
  assert.match(missing.cause, /\.codex\/ospec-workflow\/scripts\/ospec\.js/);
  assert.match(missing.action, /install:codex -- <repo>/);

  write(path.join(repo.root, ".codex", "ospec-workflow", "scripts", "ospec.js"), "// ospec CLI\n");
  assert.equal(find(await doctor(repo), "project", "codex-repo").status, "ok");
});
