"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  SUBCOMMANDS,
  hostBinarySuffix,
  binaryCandidates,
  resolveBinary,
  resolveInvocation,
  normalizeCodexHookOutput,
} = require("./ospec-hooks-launch.js");

const HOOKS_DIR = path.join("plugins", "ospec-workflow", "scripts", "hooks");

test("SUBCOMMANDS covers exactly the five hook events", () => {
  assert.deepEqual(
    [...SUBCOMMANDS].sort(),
    ["pre-compact", "pre-tool-use", "session-start", "stop", "subagent-stop"],
  );
});

test("hostBinarySuffix maps node platform/arch to Go tuples", () => {
  assert.deepEqual(hostBinarySuffix("win32", "x64"), {
    goos: "windows",
    goarch: "amd64",
    ext: ".exe",
  });
  assert.deepEqual(hostBinarySuffix("darwin", "arm64"), {
    goos: "darwin",
    goarch: "arm64",
    ext: "",
  });
  assert.deepEqual(hostBinarySuffix("linux", "x64"), {
    goos: "linux",
    goarch: "amd64",
    ext: "",
  });
});

test("binaryCandidates lists per-platform then release/dist then generic", () => {
  const suffix = { goos: "windows", goarch: "amd64", ext: ".exe" };
  const candidates = binaryCandidates(HOOKS_DIR, suffix);
  assert.deepEqual(candidates, [
    path.join(HOOKS_DIR, "ospec-hooks-windows-amd64.exe"),
    path.join("plugins", "ospec-workflow", "release", "dist", "ospec-hooks-windows-amd64.exe"),
    path.join(HOOKS_DIR, "ospec-hooks.exe"),
  ]);
});

test("resolveBinary returns the first existing candidate", () => {
  const suffix = { goos: "linux", goarch: "amd64", ext: "" };
  const generic = path.join(HOOKS_DIR, "ospec-hooks");
  const exists = (p) => p === generic; // only the generic local binary is present
  assert.equal(resolveBinary(HOOKS_DIR, suffix, exists), generic);
});

test("resolveBinary returns null when no candidate exists", () => {
  const suffix = { goos: "linux", goarch: "amd64", ext: "" };
  assert.equal(resolveBinary(HOOKS_DIR, suffix, () => false), null);
});

test("resolveInvocation runs the native binary when present", () => {
  const suffix = { goos: "linux", goarch: "amd64", ext: "" };
  const platform = path.join(HOOKS_DIR, "ospec-hooks-linux-amd64");
  const invocation = resolveInvocation("stop", HOOKS_DIR, suffix, (p) => p === platform);
  assert.deepEqual(invocation, { command: platform, args: ["stop"] });
});

test("resolveInvocation falls back to node <sub>.js when no binary ships", () => {
  const suffix = { goos: "linux", goarch: "amd64", ext: "" };
  const invocation = resolveInvocation("pre-tool-use", HOOKS_DIR, suffix, () => false);
  assert.deepEqual(invocation, {
    command: process.execPath,
    args: [path.join(HOOKS_DIR, "pre-tool-use.js")],
  });
});

test("resolveInvocation bypasses binary and returns node fallback for session-start when backend is workspace-federated", () => {
  const suffix = { goos: "linux", goarch: "amd64", ext: "" };
  const platform = path.join(HOOKS_DIR, "ospec-hooks-linux-amd64");
  const configPath = path.join(process.cwd(), "openspec", "config.yaml");
  
  const exists = (p) => p === platform || p === configPath;
  const readFileSync = (p) => {
    if (p === configPath) {
      return "artifact_store:\n  backend: workspace-federated\n";
    }
    throw new Error(`Unexpected read of: ${p}`);
  };

  const invocation = resolveInvocation("session-start", HOOKS_DIR, suffix, exists, readFileSync);
  assert.deepEqual(invocation, {
    command: process.execPath,
    args: [path.join(HOOKS_DIR, "session-start.js")],
  });
});

test("resolveInvocation does not read config and uses binary for pre-tool-use even under federated backend (hot path optimization)", () => {
  const suffix = { goos: "linux", goarch: "amd64", ext: "" };
  const platform = path.join(HOOKS_DIR, "ospec-hooks-linux-amd64");
  
  const exists = (p) => p === platform;
  const readFileSync = (p) => {
    throw new Error(`Should not read filesystem/config on hot path! Attempted read of: ${p}`);
  };

  const invocation = resolveInvocation("pre-tool-use", HOOKS_DIR, suffix, exists, readFileSync);
  assert.deepEqual(invocation, {
    command: platform,
    args: ["pre-tool-use"],
  });
});

test("resolveInvocation handles missing config file gracefully, defaulting to openspec backend and using Go binary", () => {
  const suffix = { goos: "linux", goarch: "amd64", ext: "" };
  const platform = path.join(HOOKS_DIR, "ospec-hooks-linux-amd64");
  const configPath = path.join(process.cwd(), "openspec", "config.yaml");
  
  const exists = (p) => p === platform; // configPath does not exist
  const readFileSync = (p) => {
    throw new Error(`Should not attempt read since config does not exist! Attempted read of: ${p}`);
  };

  const invocation = resolveInvocation("session-start", HOOKS_DIR, suffix, exists, readFileSync);
  assert.deepEqual(invocation, {
    command: platform,
    args: ["session-start"],
  });
});

test("normalizeCodexHookOutput wraps SessionStart context in the native hook shape", () => {
  const output = normalizeCodexHookOutput("session-start", {
    status: "ok",
    ospecDetected: true,
    systemMessage: "Read the workspace state.",
  });

  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: "Read the workspace state.",
    },
  });
});

test("normalizeCodexHookOutput emits PreToolUse context for advisory decisions and no allow decision", () => {
  const advisory = normalizeCodexHookOutput("pre-tool-use", {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Review this command.",
    },
  });
  const allow = normalizeCodexHookOutput("pre-tool-use", {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: "Safe command.",
    },
  });

  assert.deepEqual(advisory, {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: "Review this command.",
    },
  });
  assert.deepEqual(allow, {});
});

test("main passes OSPEC_PLUGIN_ROOT env var when spawning", (t) => {
  const cp = require("node:child_process");
  const origSpawnSync = cp.spawnSync;
  
  let spawnedOptions = null;
  cp.spawnSync = (command, args, options) => {
    spawnedOptions = options;
    return { status: 0, stdout: '{"continue":true}', stderr: "" };
  };
  
  t.after(() => {
    cp.spawnSync = origSpawnSync;
  });

  // Clear require cache so it re-reads the mocked spawnSync
  delete require.cache[require.resolve("./ospec-hooks-launch.js")];
  const { main } = require("./ospec-hooks-launch.js");
  const fs = require("node:fs");
  const origReadFileSync = fs.readFileSync;
  fs.readFileSync = (fd, encoding) => {
    if (fd === 0) return '{"cwd":"/workspace"}';
    return origReadFileSync(fd, encoding);
  };
  t.after(() => {
    fs.readFileSync = origReadFileSync;
    delete require.cache[require.resolve("./ospec-hooks-launch.js")];
  });

  main(["stop"], __dirname);

  assert.ok(spawnedOptions);
  assert.ok(spawnedOptions.env);
  assert.equal(spawnedOptions.env.OSPEC_PLUGIN_ROOT, path.resolve(__dirname, "../.."));
});



