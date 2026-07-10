"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { validate } = require("./validate-codex.js");

function makeValidCodexTree(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "validate-codex-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.join(root, ".codex", "agents"), { recursive: true });
  fs.mkdirSync(path.join(root, "skills", "foo"), { recursive: true });

  fs.writeFileSync(
    path.join(root, "agent.md"),
    "# Orchestrator Instructions\n"
  );
  fs.writeFileSync(
    path.join(root, ".codex", "agents", "sdd-apply.toml"),
    'name = "sdd-apply"\ndescription = "d"\nsandbox_mode = "workspace-write"\ndeveloper_instructions = """clean"""\n'
  );
  fs.writeFileSync(path.join(root, "skills", "foo", "SKILL.md"), "clean\n");

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

test("validate-codex rejects bundled MCP configuration to prevent duplicate Codex processes", (t) => {
  const root = makeValidCodexTree(t);
  fs.writeFileSync(
    path.join(root, ".mcp.json"),
    JSON.stringify({ context7: { command: "npx" } }, null, 2)
  );

  const result = validate(root);

  assert.match(result.errors.join("\n"), /forbidden path present: \.mcp\.json/);
});

test("validate-codex rejects a generated config.toml", (t) => {
  const root = makeValidCodexTree(t);
  fs.writeFileSync(path.join(root, ".codex", "config.toml"), 'model = "unsupported"\n');

  const result = validate(root);

  assert.match(result.errors.join("\n"), /forbidden path present: \.codex\/config\.toml/);
});

test("validate-codex rejects missing agent.md", (t) => {
  const root = makeValidCodexTree(t);
  fs.rmSync(path.join(root, "agent.md"));
  const result = validate(root);
  assert.match(result.errors.join("\n"), /missing required file: agent.md/);
});

test("validate-codex rejects forbidden plugin.json and hooks paths", (t) => {
  const root = makeValidCodexTree(t);
  fs.mkdirSync(path.join(root, ".codex-plugin"), { recursive: true });
  fs.writeFileSync(path.join(root, ".codex-plugin", "plugin.json"), "{}");
  fs.mkdirSync(path.join(root, "hooks"), { recursive: true });
  fs.writeFileSync(path.join(root, "hooks", "hooks.json"), "{}");

  const result = validate(root);
  const errors = result.errors.join("\n");
  assert.match(errors, /forbidden path present: \.codex-plugin/);
  assert.match(errors, /forbidden path present: hooks/);
});
