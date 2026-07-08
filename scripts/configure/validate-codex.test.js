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
    JSON.stringify({ skills: "skills/", mcpServers: ".mcp.json", apps: [], hooks: "hooks/hooks.json", interface: { displayName: "x", icon: "icon.png" } }, null, 2)
  );
  fs.writeFileSync(
    path.join(root, ".codex", "agents", "sdd-apply.toml"),
    'name = "sdd-apply"\ndescription = "d"\nsandbox_mode = "workspace-write"\ndeveloper_instructions = """clean"""\n'
  );
  fs.writeFileSync(path.join(root, "skills", "foo", "SKILL.md"), "clean\n");
  fs.writeFileSync(
    path.join(root, "hooks", "hooks.json"),
    JSON.stringify({ hooks: { SessionStart: [{ type: "command", command: hooksCommand, timeout: 5 }] } }, null, 2)
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

  assert.match(result.errors.join("\n"), /hooks\/hooks\.json SessionStart\[0\] command must quote the \$PLUGIN_ROOT path/);
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

test("validate-codex reports malformed hook entries", (t) => {
  const root = makeValidCodexTree(t);
  fs.writeFileSync(path.join(root, "hooks", "hooks.json"), JSON.stringify({ hooks: { SessionStart: ["bad-entry"] } }, null, 2));

  const result = validate(root);

  assert.match(result.errors.join("\n"), /hooks\/hooks\.json SessionStart\[0\] must be an object/);
});

test("validate-codex reports hook commands when command is not a string", (t) => {
  const root = makeValidCodexTree(t);
  fs.writeFileSync(
    path.join(root, "hooks", "hooks.json"),
    JSON.stringify({ hooks: { SessionStart: [{ type: "command", command: 5, timeout: 5 }] } }, null, 2)
  );

  const result = validate(root);

  assert.match(result.errors.join("\n"), /hooks\/hooks\.json SessionStart\[0\] command must be a string/);
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
