"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const router = require("./claude-router.js");
const { BEGIN, END } = require("./router-block.js");

const ROUTER = "# ospec-workflow\n\nrouter v2\n";

function fixture(t, { version = "2.0.0", source = ROUTER } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-claude-router-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, "home");
  const pluginRoot = path.join(base, "plugin");
  const project = path.join(home, "work", "app");
  fs.mkdirSync(project, { recursive: true });
  if (source !== null) write(path.join(pluginRoot, "global-instructions", "CLAUDE.md"), source);
  write(path.join(pluginRoot, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "ospec-workflow", version }));
  const configDir = path.join(home, ".claude");
  return { base, home, pluginRoot, project, configDir, paths: router.userPaths(configDir), homedir: () => home };
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function readJson(file) {
  return JSON.parse(read(file));
}

function startup(f, extra = {}) {
  return router.sessionStartRouter({ input: { source: "startup", cwd: f.project, ...extra.input }, env: extra.env || {}, pluginRoot: f.pluginRoot, homedir: f.homedir });
}

test("the configuration directory is CLAUDE_CONFIG_DIR when set, else ~/.claude", () => {
  assert.equal(router.claudeConfigDir({ env: { CLAUDE_CONFIG_DIR: "/tmp/cfg" }, homedir: () => "/home/u" }), path.resolve("/tmp/cfg"));
  assert.equal(router.claudeConfigDir({ env: { CLAUDE_CONFIG_DIR: " " }, homedir: () => "/home/u" }), path.join("/home/u", ".claude"));
  assert.equal(router.claudeConfigDir({ env: {}, homedir: () => "/home/u" }), path.join("/home/u", ".claude"));
});

test("install writes the user rules file, records version and hash, and is idempotent", (t) => {
  const f = fixture(t);
  const first = router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir });
  assert.equal(first.changed, true);
  assert.equal(read(f.paths.rules), ROUTER);
  assert.deepEqual(readJson(f.paths.state), { schema: 1, declined: false, version: "2.0.0", sha256: router.digest(ROUTER) });
  const second = router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir });
  assert.equal(second.changed, false);
  assert.equal(router.status({ pluginRoot: f.pluginRoot, configDir: f.configDir }).user.file, "current");
});

test("install moves an old block out of CLAUDE.md and keeps the user's text", (t) => {
  const f = fixture(t);
  write(f.paths.claudeMd, `# Mine\n\n${BEGIN}\n# old router\n${END}\n`);
  const result = router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir });
  assert.equal(result.migrated, f.paths.claudeMd);
  assert.equal(read(f.paths.claudeMd), "# Mine\n");
  assert.equal(read(f.paths.rules), ROUTER);

  const only = fixture(t);
  write(only.paths.claudeMd, `${BEGIN}\n${ROUTER}${END}\n`);
  router.install({ pluginRoot: only.pluginRoot, configDir: only.configDir });
  assert.equal(fs.existsSync(only.paths.claudeMd), false, "a CLAUDE.md that held only the block goes");
});

test("a rules file edited by hand is refused without --force and replaced with it", (t) => {
  const f = fixture(t);
  router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir });
  write(f.paths.rules, `${ROUTER}\nmy own line\n`);
  assert.equal(router.status({ pluginRoot: f.pluginRoot, configDir: f.configDir }).user.file, "modified");
  assert.throws(() => router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir }), (error) => error.code === "router-modified" && /--force/.test(error.how));
  assert.match(read(f.paths.rules), /my own line/);
  router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir, force: true });
  assert.equal(read(f.paths.rules), ROUTER);

  const unknown = fixture(t);
  write(unknown.paths.rules, "# someone else's router\n");
  assert.throws(() => router.off({ pluginRoot: unknown.pluginRoot, configDir: unknown.configDir }), { code: "router-modified" });
  assert.ok(fs.existsSync(unknown.paths.rules), "a file ospec cannot vouch for is not deleted");
});

test("a begin marker without its end stops install before anything is written", (t) => {
  const f = fixture(t);
  write(f.paths.claudeMd, `# Mine\n${BEGIN}\nhalf a block\n`);
  assert.throws(() => router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir }), { code: "router-block-broken" });
  assert.equal(fs.existsSync(f.paths.rules), false);
  assert.equal(fs.existsSync(f.paths.state), false);
});

test("install from a tree without the built router is refused with the setup command", (t) => {
  const f = fixture(t, { source: null });
  assert.throws(() => router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir }), (error) => error.code === "router-source-missing" && /npm run setup:claude/.test(error.how));
});

test("off takes the router out and keeps the no; remove forgets it", (t) => {
  const f = fixture(t);
  write(f.paths.claudeMd, `# Mine\n\n${BEGIN}\n${ROUTER}${END}\n`);
  router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir });
  write(f.paths.claudeMd, `# Mine\n\n${BEGIN}\n${ROUTER}${END}\n`);
  const result = router.off({ pluginRoot: f.pluginRoot, configDir: f.configDir });
  assert.deepEqual(result.removed, [f.paths.rules, f.paths.claudeMd]);
  assert.equal(fs.existsSync(f.paths.rules), false);
  assert.equal(read(f.paths.claudeMd), "# Mine\n");
  assert.equal(readJson(f.paths.state).declined, true);
  assert.equal(startup(f).notice, null, "the no silences the notice");

  router.remove({ pluginRoot: f.pluginRoot, configDir: f.configDir });
  assert.equal(fs.existsSync(f.paths.state), false);
  assert.equal(startup(f).notice, router.NOTICE, "without the no the notice comes back");
});

test("a corrupt state reads as none", (t) => {
  const f = fixture(t);
  write(f.paths.state, "{not json");
  assert.equal(router.status({ pluginRoot: f.pluginRoot, configDir: f.configDir }).user.declined, false);
  assert.equal(startup(f).notice, router.NOTICE);
  router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir });
  assert.equal(readJson(f.paths.state).declined, false);
});

test("the notice shows only on startup, with no router, no no, no team file and no switch", (t) => {
  const f = fixture(t);
  assert.equal(startup(f).notice, router.NOTICE);
  for (const source of ["resume", "clear", "compact"]) assert.equal(startup(f, { input: { source } }).notice, null, source);
  assert.equal(startup(f, { env: { DISABLE_ROUTER_NOTICE: "true" } }).notice, null);

  const legacy = fixture(t);
  write(legacy.paths.claudeMd, `${BEGIN}\n# old router\n${END}\n`);
  assert.equal(startup(legacy).notice, null, "an old block counts as a router");
  assert.equal(read(legacy.paths.claudeMd), `${BEGIN}\n# old router\n${END}\n`, "the hook never migrates it");

  const team = fixture(t);
  write(path.join(team.home, "work", ".claude", "rules", "ospec-workflow.md"), ROUTER);
  assert.equal(startup(team).notice, null, "a team router in a parent directory counts");
  assert.equal(router.findProjectRouter(team.home, team.homedir), null, "the home directory is not a project");
});

test("CLAUDE_CONFIG_DIR moves the router and its state", (t) => {
  const f = fixture(t);
  const custom = path.join(f.base, "custom");
  router.install({ pluginRoot: f.pluginRoot, configDir: custom });
  assert.equal(startup(f, { env: { CLAUDE_CONFIG_DIR: custom } }).notice, null);
  assert.equal(startup(f).notice, router.NOTICE, "~/.claude still has none");
  assert.ok(fs.existsSync(path.join(custom, "plugins", "data", "ospec-workflow-ospec-tools", "router.json")));
});

test("the hook refreshes only what ospec wrote, and only from a newer plugin", (t) => {
  const f = fixture(t, { version: "2.0.0" });
  router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir });
  write(path.join(f.pluginRoot, "global-instructions", "CLAUDE.md"), "# ospec-workflow\n\nrouter v3\n");
  write(path.join(f.pluginRoot, ".claude-plugin", "plugin.json"), JSON.stringify({ version: "2.1.0" }));
  assert.deepEqual(startup(f), { notice: null, refreshed: true });
  assert.equal(read(f.paths.rules), "# ospec-workflow\n\nrouter v3\n");
  assert.equal(readJson(f.paths.state).version, "2.1.0");

  write(path.join(f.pluginRoot, "global-instructions", "CLAUDE.md"), "# ospec-workflow\n\nrouter v1\n");
  write(path.join(f.pluginRoot, ".claude-plugin", "plugin.json"), JSON.stringify({ version: "1.9.0" }));
  assert.deepEqual(startup(f), { notice: null, refreshed: false }, "an older plugin does not write back");
  assert.equal(read(f.paths.rules), "# ospec-workflow\n\nrouter v3\n");

  write(path.join(f.pluginRoot, ".claude-plugin", "plugin.json"), JSON.stringify({ version: "3.0.0" }));
  write(f.paths.rules, "# edited by hand\n");
  assert.deepEqual(startup(f), { notice: null, refreshed: false }, "an edited file is neither refreshed nor announced");
  assert.equal(read(f.paths.rules), "# edited by hand\n");
});

test("the hook reads a CRLF copy of what ospec wrote as current", (t) => {
  const f = fixture(t);
  router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir });
  write(f.paths.rules, ROUTER.replace(/\n/g, "\r\n"));
  assert.equal(router.status({ pluginRoot: f.pluginRoot, configDir: f.configDir }).user.file, "current");
});

test("--scope project writes the team router and declares the marketplace and the plugin", (t) => {
  const f = fixture(t);
  write(path.join(f.project, ".claude", "settings.json"), JSON.stringify({ permissions: { allow: ["Bash(npm test)"] }, enabledPlugins: { "other@x": false } }));
  write(f.paths.marketplaces, JSON.stringify({
    "ospec-tools": { source: { source: "git", url: "https://user:secret@github.com/snakeblack/ospec-workflow.git", ref: "release", headers: { Authorization: "x" } } },
  }));
  const result = router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir, root: f.project, scope: "project" });
  const paths = router.projectPaths(f.project);
  assert.equal(read(paths.rules), ROUTER);
  const settings = readJson(paths.settings);
  assert.deepEqual(settings.permissions, { allow: ["Bash(npm test)"] }, "other keys stay");
  assert.deepEqual(settings.enabledPlugins, { "other@x": false, "ospec-workflow@ospec-tools": true });
  assert.deepEqual(settings.extraKnownMarketplaces, { "ospec-tools": { source: { source: "git", url: "https://github.com/snakeblack/ospec-workflow.git", ref: "release" } } }, "no credentials, no headers");
  assert.equal(result.settings_changed, true);
  assert.equal(fs.existsSync(f.paths.rules), false, "the user scope is untouched");

  const again = router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir, root: f.project, scope: "project" });
  assert.equal(again.changed, false);
  assert.equal(again.settings_changed, false);
});

test("--scope project never copies a password, an http(s) user or a query string of the user's marketplace", (t) => {
  for (const [url, expected] of [
    ["ssh://git:s3cret@git.example.com/team/ospec-workflow.git", "ssh://git@git.example.com/team/ospec-workflow.git"],
    ["https://git.example.com/ospec-workflow.git?access_token=s3cret", "https://git.example.com/ospec-workflow.git"],
    ["https://s3cret@github.com/me/fork.git", "https://github.com/me/fork.git"],
    ["ssh://git@github.com/me/fork.git", "ssh://git@github.com/me/fork.git"],
    ["git@github.com:me/fork.git", "git@github.com:me/fork.git"],
  ]) {
    const f = fixture(t);
    write(f.paths.marketplaces, JSON.stringify({ "ospec-tools": { source: { source: "git", url } } }));
    const result = router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir, root: f.project, scope: "project" });
    const text = read(router.projectPaths(f.project).settings);
    assert.equal(JSON.parse(text).extraKnownMarketplaces["ospec-tools"].source.url, expected, url);
    assert.doesNotMatch(`${text}${JSON.stringify(result)}`, /s3cret/, url);
  }
});

test("--scope project falls back to the public release for a local marketplace and keeps a declared one", (t) => {
  const f = fixture(t);
  write(f.paths.marketplaces, JSON.stringify({ "ospec-tools": { source: { source: "directory", path: "/src/ospec/dist/claude-marketplace" } } }));
  router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir, root: f.project, scope: "project" });
  const settings = readJson(router.projectPaths(f.project).settings);
  assert.deepEqual(settings.extraKnownMarketplaces["ospec-tools"].source, router.PUBLIC_MARKETPLACE);

  const declared = fixture(t);
  const own = { source: { source: "github", repo: "me/fork" } };
  write(path.join(declared.project, ".claude", "settings.json"), JSON.stringify({ extraKnownMarketplaces: { "ospec-tools": own } }));
  router.install({ pluginRoot: declared.pluginRoot, configDir: declared.configDir, root: declared.project, scope: "project" });
  assert.deepEqual(readJson(router.projectPaths(declared.project).settings).extraKnownMarketplaces["ospec-tools"], own);
});

test("--scope project with an invalid settings file writes nothing", (t) => {
  const f = fixture(t);
  const paths = router.projectPaths(f.project);
  write(paths.settings, "{ // comment\n}");
  assert.throws(() => router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir, root: f.project, scope: "project" }), { code: "settings-invalid" });
  write(paths.settings, JSON.stringify({ enabledPlugins: ["ospec-workflow@ospec-tools"] }));
  assert.throws(() => router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir, root: f.project, scope: "project" }), { code: "settings-invalid" });
  assert.equal(fs.existsSync(paths.rules), false);
});

test("remove --scope project deletes the team router and keeps the settings", (t) => {
  const f = fixture(t);
  router.install({ pluginRoot: f.pluginRoot, configDir: f.configDir, root: f.project, scope: "project" });
  const paths = router.projectPaths(f.project);
  const result = router.remove({ pluginRoot: f.pluginRoot, configDir: f.configDir, root: f.project, scope: "project" });
  assert.deepEqual(result.removed, [paths.rules]);
  assert.ok(fs.existsSync(paths.settings));

  write(paths.rules, "# team edits\n");
  assert.throws(() => router.remove({ pluginRoot: f.pluginRoot, configDir: f.configDir, root: f.project, scope: "project" }), { code: "router-modified" });
  router.remove({ pluginRoot: f.pluginRoot, configDir: f.configDir, root: f.project, scope: "project", force: true });
  assert.equal(fs.existsSync(paths.rules), false);
});

test("versions compare numerically", () => {
  assert.equal(router.isNewer("2.10.0", "2.9.9"), true);
  assert.equal(router.isNewer("2.9.9", "2.10.0"), false);
  assert.equal(router.isNewer("2.0.0", "2.0.0"), false);
  assert.equal(router.isNewer(null, "2.0.0"), true);
});
