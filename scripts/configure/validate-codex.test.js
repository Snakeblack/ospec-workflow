"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { validate } = require("./validate-codex.js");

function makeValidCodexTree(t, hooksCommand = 'node "$PLUGIN_ROOT/scripts/hooks/ospec-hooks-launch.js" session-start') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "validate-codex-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.join(root, ".codex-plugin"), { recursive: true });
  fs.mkdirSync(path.join(root, ".codex", "agents"), { recursive: true });
  fs.mkdirSync(path.join(root, "skills", "foo"), { recursive: true });
  fs.mkdirSync(path.join(root, "hooks"), { recursive: true });

  fs.writeFileSync(
    path.join(root, ".codex-plugin", "plugin.json"),
    JSON.stringify(
      {
        skills: "./skills/",
        mcpServers: "./.mcp.json",
        apps: [],
        hooks: "./hooks/hooks.json",
        name: "ospec-workflow",
        version: "1.0.0",
        description: "fixture",
        interface: { displayName: "x", icon: "icon.png" },
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(root, ".mcp.json"),
    JSON.stringify({ mcpServers: { context7: { type: "stdio", command: "npx" } } }, null, 2)
  );
  fs.writeFileSync(
    path.join(root, ".codex", "agents", "sdd-apply.toml"),
    'name = "sdd-apply"\ndescription = "d"\nsandbox_mode = "workspace-write"\ndeveloper_instructions = """clean"""\n'
  );
  fs.writeFileSync(path.join(root, "skills", "foo", "SKILL.md"), "clean\n");
  // REQ-hooks-004: wrapper shape { matcher, hooks:[{type,command,commandWindows,timeout}] }.
  fs.writeFileSync(
    path.join(root, "hooks", "hooks.json"),
    JSON.stringify(
      { hooks: { SessionStart: [{ matcher: ".*", hooks: [{ type: "command", command: hooksCommand, commandWindows: hooksCommand, timeout: 10 }] }] } },
      null,
      2
    )
  );

  return root;
}

test("validate-codex reports unreadable files during forbidden-text scanning instead of skipping them", (t) => {
  const root = makeValidCodexTree(t);
  const realReadUtf8 = (base, rel) => fs.readFileSync(path.join(base, rel), "utf8");
  fs.writeFileSync(path.join(root, "README.md"), "safe text\n");

  const result = validate(root, {
    readUtf8: (base, rel) => {
      if (rel === "README.md") {
        throw new Error("EACCES: permission denied");
      }
      return realReadUtf8(base, rel);
    },
  });

  assert.match(result.errors.join("\n"), /README\.md could not be read: EACCES: permission denied/);
});

test("validate-codex rejects unquoted $PLUGIN_ROOT hook commands", (t) => {
  const root = makeValidCodexTree(t, "node $PLUGIN_ROOT/scripts/hooks/ospec-hooks-launch.js session-start");

  const result = validate(root);

  assert.match(result.errors.join("\n"), /hooks\/hooks\.json SessionStart\[0\]\.hooks\[0\] command must quote the \$PLUGIN_ROOT path/);
});

test("validate-codex accepts quoted $PLUGIN_ROOT hook commands", (t) => {
  const root = makeValidCodexTree(t);

  const result = validate(root);

  assert.deepEqual(result.errors, []);
});

test("validate-codex reports hooks when hooks/hooks.json declares hooks as a non-object", (t) => {
  for (const hooksValue of [null, []]) {
    const root = makeValidCodexTree(t);
    fs.writeFileSync(path.join(root, "hooks", "hooks.json"), JSON.stringify({ hooks: hooksValue }, null, 2));

    const result = validate(root);

    assert.match(result.errors.join("\n"), /hooks\/hooks\.json must declare hooks as a non-null object/);
  }
});

test("validate-codex reports hook events when an event entry is not an array", (t) => {
  const root = makeValidCodexTree(t);
  fs.writeFileSync(
    path.join(root, "hooks", "hooks.json"),
    JSON.stringify({ hooks: { SessionStart: { type: "command", command: 'node "$PLUGIN_ROOT/scripts/hooks/ospec-hooks-launch.js" session-start', timeout: 5 } } }, null, 2)
  );

  const result = validate(root);

  assert.match(result.errors.join("\n"), /hooks\/hooks\.json SessionStart must be an array/);
});

test("validate-codex reports malformed wrapper group entries", (t) => {
  const root = makeValidCodexTree(t);
  fs.writeFileSync(path.join(root, "hooks", "hooks.json"), JSON.stringify({ hooks: { SessionStart: ["bad-entry"] } }, null, 2));

  const result = validate(root);

  assert.match(result.errors.join("\n"), /hooks\/hooks\.json SessionStart\[0\] must be an object/);
});

test("validate-codex reports when a wrapper group's hooks field is not an array", (t) => {
  const root = makeValidCodexTree(t);
  fs.writeFileSync(
    path.join(root, "hooks", "hooks.json"),
    JSON.stringify({ hooks: { SessionStart: [{ matcher: ".*", hooks: "not-an-array" }] } }, null, 2)
  );

  const result = validate(root);

  assert.match(result.errors.join("\n"), /hooks\/hooks\.json SessionStart\[0\]\.hooks must be an array/);
});

test("validate-codex reports malformed inner hook entries", (t) => {
  const root = makeValidCodexTree(t);
  fs.writeFileSync(
    path.join(root, "hooks", "hooks.json"),
    JSON.stringify({ hooks: { SessionStart: [{ matcher: ".*", hooks: ["bad-entry"] }] } }, null, 2)
  );

  const result = validate(root);

  assert.match(result.errors.join("\n"), /hooks\/hooks\.json SessionStart\[0\]\.hooks\[0\] must be an object/);
});

test("validate-codex reports hook commands when command is not a string", (t) => {
  const root = makeValidCodexTree(t);
  fs.writeFileSync(
    path.join(root, "hooks", "hooks.json"),
    JSON.stringify({ hooks: { SessionStart: [{ matcher: ".*", hooks: [{ type: "command", command: 5, timeout: 10 }] }] } }, null, 2)
  );

  const result = validate(root);

  assert.match(result.errors.join("\n"), /hooks\/hooks\.json SessionStart\[0\]\.hooks\[0\] command must be a string/);
});

test("validate-codex reports unreadable agent TOML files as validation errors", (t) => {
  const root = makeValidCodexTree(t);
  const realReadUtf8 = (base, rel) => fs.readFileSync(path.join(base, rel), "utf8");
  let agentReads = 0;

  const result = validate(root, {
    readUtf8: (base, rel) => {
      if (rel === ".codex/agents/sdd-apply.toml" && agentReads > 0) {
        throw new Error("EPERM: locked by another process");
      }
      if (rel === ".codex/agents/sdd-apply.toml") {
        agentReads += 1;
      }
      return realReadUtf8(base, rel);
    },
  });

  assert.match(result.errors.join("\n"), /\.codex\/agents\/sdd-apply\.toml could not be read: EPERM: locked by another process/);
});

test("validate-codex reports unreadable skill markdown files as validation errors", (t) => {
  const root = makeValidCodexTree(t);
  const realReadUtf8 = (base, rel) => fs.readFileSync(path.join(base, rel), "utf8");
  let skillReads = 0;

  const result = validate(root, {
    readUtf8: (base, rel) => {
      if (rel === "skills/foo/SKILL.md" && skillReads > 0) {
        throw new Error("EACCES: permission denied");
      }
      if (rel === "skills/foo/SKILL.md") {
        skillReads += 1;
      }
      return realReadUtf8(base, rel);
    },
  });

  assert.match(result.errors.join("\n"), /skills\/foo\/SKILL\.md could not be read: EACCES: permission denied/);
});

test("validate-codex degrades unreadable .codex/agents traversal into validation errors", (t) => {
  const root = makeValidCodexTree(t);
  const realReaddirSync = fs.readdirSync;

  fs.readdirSync = function patchedReaddirSync(targetPath, ...rest) {
    if (targetPath === path.join(root, ".codex", "agents")) {
      const error = new Error("EACCES: permission denied");
      error.code = "EACCES";
      throw error;
    }
    return realReaddirSync.call(this, targetPath, ...rest);
  };

  t.after(() => {
    fs.readdirSync = realReaddirSync;
  });

  const result = validate(root);

  assert.match(result.errors.join("\n"), /\.codex\/agents could not be enumerated: EACCES: permission denied/);
});

test("validate-codex degrades unreadable skills traversal into validation errors", (t) => {
  const root = makeValidCodexTree(t);
  const realReaddirSync = fs.readdirSync;

  fs.readdirSync = function patchedReaddirSync(targetPath, ...rest) {
    if (targetPath === path.join(root, "skills")) {
      const error = new Error("EPERM: locked by another process");
      error.code = "EPERM";
      throw error;
    }
    return realReaddirSync.call(this, targetPath, ...rest);
  };

  t.after(() => {
    fs.readdirSync = realReaddirSync;
  });

  const result = validate(root);

  assert.match(result.errors.join("\n"), /skills could not be enumerated: EPERM: locked by another process/);
});

test("validate-codex rejects invalid JSON in plugin.json", (t) => {
  const root = makeValidCodexTree(t);
  fs.writeFileSync(path.join(root, ".codex-plugin", "plugin.json"), "{ invalid json ");

  const result = validate(root);
  assert.match(result.errors.join("\n"), /\.codex-plugin\/plugin\.json is not valid JSON/);
});

test("validate-codex rejects plugin.json with out-of-schema keys", (t) => {
  const root = makeValidCodexTree(t);
  fs.writeFileSync(
    path.join(root, ".codex-plugin", "plugin.json"),
    JSON.stringify({ skills: "skills/", invalidKey: 123 }, null, 2)
  );

  const result = validate(root);
  assert.match(result.errors.join("\n"), /\.codex-plugin\/plugin\.json contains out-of-schema key: invalidKey/);
});

test("validate-codex rejects agent TOML with missing required keys", (t) => {
  const root = makeValidCodexTree(t);
  fs.writeFileSync(
    path.join(root, ".codex", "agents", "sdd-apply.toml"),
    'description = "description missing name"\n'
  );

  const result = validate(root);
  assert.match(result.errors.join("\n"), /\.codex\/agents\/sdd-apply\.toml missing required TOML key: name/);
});

test("validate-codex rejects agent TOML with invalid sandbox_mode", (t) => {
  const root = makeValidCodexTree(t);
  fs.writeFileSync(
    path.join(root, ".codex", "agents", "sdd-apply.toml"),
    'name = "sdd-apply"\ndescription = "d"\nsandbox_mode = "invalid-mode"\n'
  );

  const result = validate(root);
  assert.match(result.errors.join("\n"), /\.codex\/agents\/sdd-apply\.toml has invalid sandbox_mode: invalid-mode/);
});

test("validate-codex rejects skill configurations carrying agent routing key", (t) => {
  const root = makeValidCodexTree(t);
  fs.writeFileSync(path.join(root, "skills", "foo", "SKILL.md"), "agent: sdd-apply\n");

  const result = validate(root);
  assert.match(result.errors.join("\n"), /skills\/foo\/SKILL\.md must not carry an agent: routing key/);
});

test("validate-codex accepts metadata keys (name/version/description) on plugin.json", (t) => {
  const root = makeValidCodexTree(t);

  const result = validate(root);

  assert.deepEqual(result.errors, []);
});

test("validate-codex rejects a .mcp.json MCP id containing a slash", (t) => {
  const root = makeValidCodexTree(t);
  fs.writeFileSync(
    path.join(root, ".mcp.json"),
    JSON.stringify({ mcpServers: { "io.github.upstash/context7": { type: "stdio", command: "npx" } } }, null, 2)
  );

  const result = validate(root);

  assert.match(result.errors.join("\n"), /\.mcp\.json declares an invalid MCP server id: io\.github\.upstash\/context7/);
});

test("validate-codex rejects a .mcp.json MCP id containing a space", (t) => {
  const root = makeValidCodexTree(t);
  fs.writeFileSync(
    path.join(root, ".mcp.json"),
    JSON.stringify({ mcpServers: { "bad id": { type: "stdio", command: "npx" } } }, null, 2)
  );

  const result = validate(root);

  assert.match(result.errors.join("\n"), /\.mcp\.json declares an invalid MCP server id: bad id/);
});

test("validate-codex accepts conformant MCP ids matching ^[a-zA-Z0-9_-]+$", (t) => {
  const root = makeValidCodexTree(t);
  fs.writeFileSync(
    path.join(root, ".mcp.json"),
    JSON.stringify({ mcpServers: { context7: { type: "stdio", command: "npx" }, markitdown: { type: "stdio", command: "uvx" } } }, null, 2)
  );

  const result = validate(root);

  assert.deepEqual(result.errors, []);
});

test("validate-codex rejects a plugin.json component path that is not ./-relative", (t) => {
  const root = makeValidCodexTree(t);
  const plugin = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
  plugin.skills = "skills/";
  fs.writeFileSync(path.join(root, ".codex-plugin", "plugin.json"), JSON.stringify(plugin, null, 2));

  const result = validate(root);

  assert.match(result.errors.join("\n"), /\.codex-plugin\/plugin\.json field "skills" must be a safe .\/-relative path: skills\//);
});

test("validate-codex rejects a plugin.json component path with a .. traversal segment", (t) => {
  const root = makeValidCodexTree(t);
  const plugin = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
  plugin.mcpServers = "../.mcp.json";
  fs.writeFileSync(path.join(root, ".codex-plugin", "plugin.json"), JSON.stringify(plugin, null, 2));

  const result = validate(root);

  assert.match(result.errors.join("\n"), /\.codex-plugin\/plugin\.json field "mcpServers" must be a safe .\/-relative path: \.\.\/\.mcp\.json/);
});

test("validate-codex rejects a plugin.json component path that is absolute", (t) => {
  const root = makeValidCodexTree(t);
  const plugin = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
  plugin.hooks = "/hooks/hooks.json";
  fs.writeFileSync(path.join(root, ".codex-plugin", "plugin.json"), JSON.stringify(plugin, null, 2));

  const result = validate(root);

  assert.match(result.errors.join("\n"), /\.codex-plugin\/plugin\.json field "hooks" must be a safe .\/-relative path: \/hooks\/hooks\.json/);
});

test("validate-codex rejects a generated config.toml", (t) => {
  const root = makeValidCodexTree(t);
  fs.writeFileSync(path.join(root, ".codex", "config.toml"), 'model = "unsupported"\n');

  const result = validate(root);

  assert.match(result.errors.join("\n"), /forbidden path present: \.codex\/config\.toml/);
});
