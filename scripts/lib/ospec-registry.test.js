"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const { runSessionStart, CACHE_RELATIVE_PATH } = require("../hooks/session-start.js");
const { RegistryError, renderRegistry, runRegistry } = require("./ospec-registry.js");
const { registryGaps, resolveSkillsRoot } = require("./skill-registry.js");

const CLI = path.resolve(__dirname, "..", "ospec.js");
const NOW = () => new Date("2026-11-23T10:00:00.000Z");

function skill(name, { description = `${name} skill. Trigger: ${name} work`, capabilities, rules = true } = {}) {
  return [
    "---",
    `name: ${name}`,
    `description: "${description}"`,
    ...(capabilities ? [`capabilities: [${capabilities}]`] : []),
    "---",
    "",
    ...(rules ? ["## Rules", "", `- Follow ${name}.`, ""] : ["## Steps", "", "1. Do it.", ""]),
  ].join("\n");
}

async function createFixture(t, { withOpenSpec = true, skills = { example: skill("example") } } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ospec-registry-"));
  const pluginRoot = path.join(root, "plugin");
  const workspace = path.join(root, "workspace");
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await fs.mkdir(path.join(pluginRoot, "skills", "_shared"), { recursive: true });
  await fs.writeFile(path.join(pluginRoot, "skills", "_shared", "runtime.md"), "Shared runtime contract.\n");
  for (const [name, content] of Object.entries(skills)) {
    await fs.mkdir(path.join(pluginRoot, "skills", name), { recursive: true });
    await fs.writeFile(path.join(pluginRoot, "skills", name, "SKILL.md"), content);
  }
  await fs.mkdir(workspace, { recursive: true });
  if (withOpenSpec) {
    await fs.mkdir(path.join(workspace, "openspec"), { recursive: true });
    await fs.writeFile(path.join(workspace, "openspec", "config.yaml"), "strict_tdd: true\n");
  }
  return { pluginRoot, workspace, cachePath: path.join(workspace, ...CACHE_RELATIVE_PATH.split("/")) };
}

const readCache = async (cachePath) => JSON.parse(await fs.readFile(cachePath, "utf8"));

test("registry: without OpenSpec it writes nothing and says why", async (t) => {
  const { pluginRoot, workspace, cachePath } = await createFixture(t, { withOpenSpec: false });

  const result = await runRegistry({ root: workspace, pluginRoot, now: NOW });

  assert.deepEqual(result, { status: "skipped", path: CACHE_RELATIVE_PATH, reason: "openspec-not-initialized" });
  await assert.rejects(fs.stat(cachePath), { code: "ENOENT" });
  await assert.rejects(fs.stat(path.join(workspace, ".ospec")), { code: "ENOENT" });
  assert.match(renderRegistry(result), /^registry: skipped \(OpenSpec is not initialized in this project\)\nIDD does not use the skill registry/);
});

test("registry: it generates the cache, then reuses it until a skill changes", async (t) => {
  const { pluginRoot, workspace, cachePath } = await createFixture(t);

  const first = await runRegistry({ root: workspace, pluginRoot, now: NOW });
  assert.deepEqual(first, { status: "generated", path: CACHE_RELATIVE_PATH, skills: 1, with_rules: 1 });
  const written = await readCache(cachePath);
  assert.equal(written.version, 2);
  assert.equal(written.generated_at, "2026-11-23T10:00:00.000Z");
  assert.deepEqual(written.skills.map((entry) => entry.id), ["example"]);

  const second = await runRegistry({ root: workspace, pluginRoot, now: () => new Date("2027-01-01T00:00:00.000Z") });
  assert.equal(second.status, "reused");
  assert.deepEqual(await readCache(cachePath), written, "a reused cache is not rewritten");

  await fs.writeFile(path.join(pluginRoot, "skills", "example", "SKILL.md"), skill("example").replace("Follow example.", "Follow the example."));
  const third = await runRegistry({ root: workspace, pluginRoot, now: NOW });
  assert.equal(third.status, "generated");
  assert.deepEqual((await readCache(cachePath)).skills[0].compact_rules, ["Follow the example."]);
});

test("registry: the command and the SessionStart hook build the same cache", async (t) => {
  const byHook = await createFixture(t);
  const byCommand = await createFixture(t);

  const hook = await runSessionStart({ input: { cwd: byHook.workspace }, pluginRoot: byHook.pluginRoot, now: NOW });
  const command = await runRegistry({ root: byCommand.workspace, pluginRoot: byCommand.pluginRoot, now: NOW });

  assert.equal(hook.registry.status, "generated");
  assert.equal(command.status, "generated");
  assert.deepEqual(await readCache(byCommand.cachePath), await readCache(byHook.cachePath));

  // Each one reuses what the other wrote.
  assert.equal((await runRegistry({ root: byHook.workspace, pluginRoot: byHook.pluginRoot, now: NOW })).status, "reused");
  const hookAfter = await runSessionStart({ input: { cwd: byCommand.workspace }, pluginRoot: byCommand.pluginRoot, now: NOW });
  assert.equal(hookAfter.registry.status, "reused");
});

test("registry: a hand-written cache of another version is replaced", async (t) => {
  const { pluginRoot, workspace, cachePath } = await createFixture(t);
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify({ version: 1, skills: [{ id: "by-hand" }], project_conventions: [] }));

  const result = await runRegistry({ root: workspace, pluginRoot, now: NOW });

  assert.equal(result.status, "generated");
  const cache = await readCache(cachePath);
  assert.equal(cache.version, 2);
  assert.deepEqual(cache.skills.map((entry) => entry.id), ["example"]);
  assert.equal(cache.project_conventions, undefined);
});

test("registry: it warns of the skills that give a delegation no rules or match by name only", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t, {
    skills: {
      complete: skill("complete"),
      "by-capability": skill("by-capability", { description: "Stack knowledge.", capabilities: "angular" }),
      "name-only": skill("name-only", { description: "Loaded by name." }),
      procedure: skill("procedure", { rules: false }),
      silent: skill("silent", { description: "Says nothing.", rules: false }),
    },
  });

  const result = await runRegistry({ root: workspace, pluginRoot, now: NOW });

  assert.equal(result.skills, 5);
  assert.equal(result.with_rules, 3);
  assert.deepEqual(result.warnings, [
    { id: "name-only", missing: ["trigger"] },
    { id: "procedure", missing: ["rules"] },
    { id: "silent", missing: ["rules", "trigger"] },
  ]);
  assert.equal(
    renderRegistry(result),
    [
      `registry: generated (${CACHE_RELATIVE_PATH})`,
      "skills: 5, 3 with rules",
      "no rules for sub-agents: procedure, silent",
      "matched by name only: name-only, silent",
    ].join("\n"),
  );
});

test("registry: a registry without gaps carries no warnings", () => {
  const complete = { id: "a", triggers: ["a work"], compact_rules: ["Do a."], capabilities: [] };
  assert.deepEqual(registryGaps([complete]), []);
  assert.equal(renderRegistry({ status: "reused", path: CACHE_RELATIVE_PATH, skills: 1, with_rules: 1 }), `registry: reused (${CACHE_RELATIVE_PATH})\nskills: 1, 1 with rules`);
});

test("registry: missing installed skills are a refusal that keeps the existing cache", async (t) => {
  const { pluginRoot, workspace, cachePath } = await createFixture(t);
  await runRegistry({ root: workspace, pluginRoot, now: NOW });
  const before = await fs.readFile(cachePath, "utf8");
  await fs.rm(path.join(pluginRoot, "skills"), { recursive: true });

  await assert.rejects(runRegistry({ root: workspace, pluginRoot, now: NOW }), (error) => {
    assert.ok(error instanceof RegistryError);
    assert.equal(error.code, "registry-skills-missing");
    assert.match(error.message, /No SKILL\.md files found in required skills root/);
    return true;
  });
  assert.equal(await fs.readFile(cachePath, "utf8"), before);
});

test("registry: a global Codex install reads its skills from ~/.agents/skills, any other from its own root", () => {
  const homeDir = path.join(os.tmpdir(), "ospec-registry-home");
  const installed = path.join(homeDir, ".codex", "ospec-workflow");

  assert.equal(resolveSkillsRoot({ pluginRoot: installed, target: "codex", homeDir }), path.join(homeDir, ".agents", "skills"));
  assert.equal(resolveSkillsRoot({ pluginRoot: installed, target: "claude", homeDir }), path.join(installed, "skills"));
  const elsewhere = path.join(os.tmpdir(), "ospec-registry-plugin");
  assert.equal(resolveSkillsRoot({ pluginRoot: elsewhere, target: "codex", homeDir }), path.join(elsewhere, "skills"));
  const codexHome = path.join(os.tmpdir(), "ospec-registry-codex-home");
  assert.equal(
    resolveSkillsRoot({ pluginRoot: path.join(codexHome, "ospec-workflow"), target: "codex", homeDir, codexHome }),
    path.join(homeDir, ".agents", "skills"),
  );
});

test("registry: the CLI prints the result as text and as --json, with exit 0", async (t) => {
  const { workspace } = await createFixture(t, { withOpenSpec: false });
  const run = (...args) => spawnSync(process.execPath, [CLI, "registry", "--root", workspace, ...args], { encoding: "utf8" });

  const text = run();
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /^registry: skipped \(OpenSpec is not initialized in this project\)\n/);

  const json = run("--json");
  assert.equal(json.status, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout), {
    ok: true,
    command: "registry",
    status: "skipped",
    path: CACHE_RELATIVE_PATH,
    reason: "openspec-not-initialized",
  });
});
