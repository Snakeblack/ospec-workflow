"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure } = require("./cli.js");
const { validate } = require("./validate-opencode.js");

const SOURCE = path.join(__dirname, "__fixtures__", "source");

function tmpOut(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-opencode-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("validate accepts generated opencode output", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false, withSdd: true });

  const result = validate(out);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("validate rejects Claude/Copilot layout residue and the standalone .mcp.json", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false, withSdd: true });
  fs.mkdirSync(path.join(out, ".claude-plugin"));
  fs.mkdirSync(path.join(out, ".github"));
  fs.writeFileSync(path.join(out, ".mcp.json"), JSON.stringify({ mcpServers: {} }, null, 2));

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("forbidden path present: .claude-plugin")));
  assert.ok(result.errors.some((error) => error.includes("forbidden path present: .github")));
  assert.ok(result.errors.some((error) => error.includes("forbidden path present: .mcp.json")));
});

test("validate requires a mode on every agent and rejects VS Code-only keys", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false, withSdd: true });
  fs.writeFileSync(
    path.join(out, ".opencode/agents/ghost.md"),
    "---\nname: ghost\ntarget: vscode\nuser-invocable: false\n---\n\nbody\n",
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("must declare mode: primary|subagent|all")));
  assert.ok(result.errors.some((error) => error.includes("must not include target frontmatter")));
  assert.ok(result.errors.some((error) => error.includes("must not include user-invocable frontmatter")));
});

test("validate rejects VS Code-only command frontmatter", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false, withSdd: true });
  fs.writeFileSync(
    path.join(out, ".opencode/commands/ghost.md"),
    "---\nname: ghost\ntools: ['read']\nargument-hint: \"<x>\"\n---\n\nbody\n",
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("must not include name frontmatter")));
  assert.ok(result.errors.some((error) => error.includes("must not include tools frontmatter")));
  assert.ok(result.errors.some((error) => error.includes("must not include argument-hint frontmatter")));
});

test("validate rejects a malformed opencode.json (bad mcp server, non-array instructions)", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false, withSdd: true });

  fs.writeFileSync(
    path.join(out, "opencode.json"),
    JSON.stringify(
      { $schema: "https://opencode.ai/config.json", mcp: { bad: { type: "local" } }, instructions: "x" },
      null,
      2,
    ),
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("(local) must have a non-empty command array")));
  assert.ok(result.errors.some((error) => error.includes("instructions must be an array of strings")));
});

test("validate rejects opencode.json without a $schema", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false, withSdd: true });
  fs.writeFileSync(path.join(out, "opencode.json"), JSON.stringify({ mcp: {} }, null, 2));

  assert.ok(validate(out).errors.some((error) => error.includes("must include a $schema")));
});

test("validate fails when the plugin is missing spawnSync invocation", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false, withSdd: true });
  assert.equal(validate(out).errors.length, 0);

  // Replace the plugin with a stub that lacks spawnSync — the new validator
  // checks for the binary invocation contract, not the old require() script references.
  fs.writeFileSync(path.join(out, ".opencode/plugins/ospec.js"), "// empty plugin stub\n");

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("must use spawnSync")));
  assert.ok(result.errors.some((error) => error.includes("must reference the ospec-hooks binary")));
});

test("validate fails when the plugin lacks the v2 default definition OpenCode needs", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false, withSdd: true });

  // A v1-only plugin: every binary-bridge string is present, so only the v2
  // default-definition check can catch the PluginModule.LoadError OpenCode
  // reports at startup (SchemaError: Missing key at ["default"]).
  fs.writeFileSync(
    path.join(out, ".opencode/plugins/ospec.js"),
    [
      "// v1-only stub",
      "export const OspecWorkflowPlugin = () => ({",
      '  "tool.execute.before": () => spawnSync("ospec-hooks", ["pre-tool-use", "session-start"]),',
      "});",
      "",
    ].join("\n"),
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("must default-export a v2 plugin definition")));
});

test("validate fails when the default plugin definition drops the v1 server or the setup entrypoint", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false, withSdd: true });

  fs.writeFileSync(
    path.join(out, ".opencode/plugins/ospec.js"),
    [
      'export default { id: "ospec" };',
      '// spawnSync("ospec-hooks", ["pre-tool-use", "session-start"]);',
      "",
    ].join("\n"),
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("must keep the v1 server: entrypoint")));
  assert.ok(result.errors.some((error) => error.includes("must declare setup: or effect:")));
});

test("validate fails when the plugin drops the bundle root or the workspace cwd", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false, withSdd: true });
  assert.equal(validate(out).errors.length, 0);

  // Every bridge string is present, but the plugin forgets plugin_root (so
  // session-start resolves skills/ against the plugin host's cwd) and pins no
  // workspace cwd (so the git collaboration guard sees the wrong repository).
  fs.writeFileSync(
    path.join(out, ".opencode/plugins/ospec.js"),
    [
      "// stub without the workspace contract",
      'export default { id: "ospec", server: 1, setup: 1 };',
      'spawnSync("ospec-hooks", ["pre-tool-use", "session-start"]);',
      "",
    ].join("\n"),
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("must pass plugin_root")));
  assert.ok(result.errors.some((error) => error.includes("must spawn the hooks with cwd at the session workspace")));
});

test("validate fails when the plugin collapses an ask verdict to a hard block", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false, withSdd: true });
  assert.equal(validate(out).errors.length, 0);

  // Every other bridge string is present, but the plugin has no native ask:
  // an ask verdict would collapse to a hard block instead of prompting.
  fs.writeFileSync(
    path.join(out, ".opencode/plugins/ospec.js"),
    [
      "// stub without the native ask surface",
      'export default { id: "ospec", server: 1, setup: 1 };',
      'spawnSync("ospec-hooks", ["pre-tool-use", "session-start"]);',
      "plugin_root; cwd: directory;",
      "",
    ].join("\n"),
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("must bridge the guard's ask verdict to ctx.permission.assert")));
  assert.ok(result.errors.some((error) => error.includes("must escalate the ospec action to ask in the permission evaluate hook")));
});

test("validate fails when the plugin does not count the end of a turn (E1.49)", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false, withSdd: true });
  assert.equal(validate(out).errors.length, 0);

  const file = path.join(out, ".opencode/plugins/ospec.js");
  const plugin = fs.readFileSync(file, "utf8");
  for (const dropped of ['runHook("stop"', '"session.idle"', '"session.execution.succeeded"', "parentID"]) {
    assert.ok(plugin.includes(dropped), dropped);
    fs.writeFileSync(file, plugin.split(dropped).join("dropped"));
    const result = validate(out);
    assert.ok(result.errors.some((error) => error.includes("must run the stop subcommand at the end of a turn of the root session")), dropped);
  }
});

test("validate requires the skills tree so agent skill references resolve", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false, withSdd: true });
  assert.equal(validate(out).errors.length, 0);
  fs.rmSync(path.join(out, "skills"), { recursive: true, force: true });

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("missing required path: skills")));
});

test("validate rejects residual ${input: placeholder in opencode.json", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false, withSdd: true });
  // Poison the generated opencode.json with an unresolved input placeholder.
  const cfg = JSON.parse(fs.readFileSync(path.join(out, "opencode.json"), "utf8"));
  cfg.mcp = cfg.mcp || {};
  cfg.mcp.svc = { type: "local", command: ["npx"], enabled: true, environment: { ["RESIDUAL_KEY"]: "${input:RESIDUAL_KEY}" } };
  fs.writeFileSync(path.join(out, "opencode.json"), JSON.stringify(cfg, null, 2));

  const result = validate(out);

  assert.ok(result.errors.length > 0, "must report at least one error");
  assert.ok(
    result.errors.some((error) => error.includes("${input:")),
    "at least one error must reference the residual placeholder",
  );
});

test("validate rejects an agent that references a skill the tree does not ship", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false, withSdd: true });
  fs.writeFileSync(
    path.join(out, ".opencode/agents/ghost.md"),
    "---\nname: ghost\nmode: subagent\n---\n\nRead `skills/ghost/SKILL.md` before work.\n",
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("references missing skill: skills/ghost/SKILL.md")));
});

test("INSTALL-026: attribution sentinels fail closed on a stale build", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false, withSdd: true });
  const dimensions = path.join(out, "scripts/lib/review-dimensions.js");
  fs.writeFileSync(dimensions, fs.readFileSync(dimensions, "utf8").split("kernel-contract-change").join("STALE-SENTINEL"));

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("attribution sentinel stale in scripts/lib/review-dimensions.js: missing kernel-contract-change")));
});

test("INSTALL-026: attribution sentinels fail closed on an unmapped kernel tool reference", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false, withSdd: true });
  fs.rmSync(path.join(out, "scripts/lib/review-gate-state.js"));

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("attribution sentinel missing (unmapped kernel tool reference): scripts/lib/review-gate-state.js")));
});
