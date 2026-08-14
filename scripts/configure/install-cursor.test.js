"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  assertCursorPathSafe,
  createRollbackJournal,
  expandCursorHooksPlaceholder,
  ensureCursorGenericHookEvents,
  syncTreeByContent,
  installHooksJson,
  sanitizeCursorMcpServers,
  parseArgs,
  main,
} = require("./install-cursor.js");
const { hostBinarySuffix } = require("./install-target.js");
const { validate, validateInstalled } = require("./validate-cursor.js");

const ROOT = path.resolve(__dirname, "..", "..");

function makeTempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(root, rel, content) {
  const destination = path.join(root, rel);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
}

function stageRealSource(t, sandbox, { withBinary = true } = {}) {
  const sourceDir = path.join(sandbox, "source");
  fs.mkdirSync(sourceDir, { recursive: true });
  for (const rel of ["agents", "commands", "rules", "skills", "hooks", "scripts/hooks", "scripts/lib"]) {
    fs.cpSync(path.join(ROOT, rel), path.join(sourceDir, rel), { recursive: true });
  }
  for (const rel of [".claude-plugin/plugin.json", ".mcp.json", "models.yaml", "AGENTS.md"]) {
    const source = path.join(ROOT, rel);
    if (fs.existsSync(source)) {
      fs.mkdirSync(path.dirname(path.join(sourceDir, rel)), { recursive: true });
      fs.copyFileSync(source, path.join(sourceDir, rel));
    }
  }
  if (withBinary) {
    const { os: goos, arch, ext } = hostBinarySuffix();
    write(sourceDir, path.join("release", "dist", `ospec-hooks-${goos}-${arch}${ext}`), "cursor-binary-fixture");
  }
  return sourceDir;
}

function treeSnapshot(root, ignored = new Set()) {
  const snapshot = {};
  function visit(dir, rel = "") {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (ignored.has(childRel)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute, childRel);
      else if (entry.isFile()) snapshot[childRel] = fs.readFileSync(absolute).toString("base64");
    }
  }
  visit(root);
  return snapshot;
}

function sandboxedFs(sandbox) {
  const resolvedSandbox = path.resolve(sandbox);
  const inside = (candidate) => {
    const rel = path.relative(resolvedSandbox, path.resolve(candidate));
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };
  const mutationTargets = {
    mkdirSync: [0],
    writeFileSync: [0],
    copyFileSync: [1],
    chmodSync: [0],
  };
  return new Proxy(fs, {
    get(target, property) {
      const value = target[property];
      if (typeof value !== "function") return value;
      return (...args) => {
        for (const index of mutationTargets[property] || []) {
          if (!inside(args[index])) throw new Error(`write outside sandbox: ${args[index]}`);
        }
        return value.apply(target, args);
      };
    },
  });
}

test("assertCursorPathSafe refuses filesystem root", () => {
  const root = path.parse(process.cwd()).root;
  assert.throws(() => assertCursorPathSafe(root), /filesystem root|refusing/i);
});

test("assertCursorPathSafe allows a normal ~/.cursor path", (t) => {
  const home = makeTempDir(t, "cursor-home-");
  const cursorRoot = path.join(home, ".cursor");
  assert.doesNotThrow(() => assertCursorPathSafe(cursorRoot));
});

test("assertCursorPathSafe refuses path that escapes the managed root", (t) => {
  const home = makeTempDir(t, "cursor-escape-");
  const cursorRoot = path.join(home, ".cursor");
  fs.mkdirSync(cursorRoot, { recursive: true });
  assert.throws(
    () => assertCursorPathSafe(cursorRoot, path.join(home, "outside.txt")),
    /escape|refusing/i,
  );
});

test("assertCursorPathSafe refuses a symlinked managed root", (t) => {
  const base = makeTempDir(t, "cursor-symlink-");
  const real = path.join(base, "real-cursor");
  const link = path.join(base, "link-cursor");
  fs.mkdirSync(real, { recursive: true });
  try {
    fs.symlinkSync(real, link, "junction");
  } catch (error) {
    t.skip(`symlink unavailable: ${error.message}`);
    return;
  }
  assert.throws(() => assertCursorPathSafe(link), /symlink/i);
});

test("expandCursorHooksPlaceholder always quotes the expanded path", () => {
  const plain = expandCursorHooksPlaceholder(
    "node __OSPEC_CURSOR_ROOT__/scripts/hooks/ospec-hooks-launch.js session-start",
    "C:/Users/sn4ke/.cursor",
  );
  assert.equal(
    plain,
    'node "C:/Users/sn4ke/.cursor/scripts/hooks/ospec-hooks-launch.js" session-start',
  );

  const spaced = expandCursorHooksPlaceholder(
    "node __OSPEC_CURSOR_ROOT__/scripts/hooks/ospec-hooks-launch.js stop",
    "C:/Users/Name Surname/.cursor",
  );
  assert.equal(
    spaced,
    'node "C:/Users/Name Surname/.cursor/scripts/hooks/ospec-hooks-launch.js" stop',
  );

  const meta = expandCursorHooksPlaceholder(
    "node __OSPEC_CURSOR_ROOT__/scripts/hooks/ospec-hooks-launch.js stop",
    "C:/Users/evil;id/.cursor",
  );
  assert.equal(
    meta,
    'node "C:/Users/evil;id/.cursor/scripts/hooks/ospec-hooks-launch.js" stop',
  );
});

test("expandCursorHooksPlaceholder is a no-op without the marker", () => {
  assert.equal(expandCursorHooksPlaceholder("node ./x.js", "C:/Users/a/.cursor"), "node ./x.js");
});

test("ensureCursorGenericHookEvents mirrors shell hooks onto preToolUse and subagentStart", () => {
  const shell = [{ command: "node __OSPEC_CURSOR_ROOT__/scripts/hooks/ospec-hooks-launch.js pre-tool-use" }];
  const edit = [{ command: "node __OSPEC_CURSOR_ROOT__/scripts/hooks/ospec-hooks-launch.js pre-compact" }];
  const ensured = ensureCursorGenericHookEvents({
    version: 1,
    hooks: {
      beforeShellExecution: shell,
      beforeReadFile: shell,
      afterFileEdit: edit,
    },
  });
  assert.deepEqual(ensured.hooks.preToolUse, shell);
  assert.deepEqual(ensured.hooks.subagentStart, shell);
  assert.deepEqual(ensured.hooks.preCompact, edit);
  assert.deepEqual(ensured.hooks.beforeShellExecution, shell);
});

test("expandCursorHooksPlaceholder shell-quotes quotes, backslashes, dollars, and backticks exactly", () => {
  const cursorRoot = 'C:/Users/a"b\\c$d`e/.cursor';
  assert.equal(
    expandCursorHooksPlaceholder(
      "node __OSPEC_CURSOR_ROOT__/scripts/hooks/ospec-hooks-launch.js stop",
      cursorRoot,
    ),
    'node "C:/Users/a\\"b\\\\c\\$d\\`e/.cursor/scripts/hooks/ospec-hooks-launch.js" stop',
  );
});

test("installHooksJson expands placeholder and dry-run writes nothing", (t) => {
  const outDir = makeTempDir(t, "cursor-hooks-src-");
  const destRoot = makeTempDir(t, "cursor-hooks-dest-");
  fs.writeFileSync(
    path.join(outDir, "hooks.json"),
    JSON.stringify({
      version: 1,
      hooks: {
        stop: [{ command: "node __OSPEC_CURSOR_ROOT__/scripts/hooks/ospec-hooks-launch.js stop" }],
      },
    }),
  );

  installHooksJson(outDir, destRoot, { dryRun: true, cursorRootPosix: "C:/Users/x/.cursor" });
  assert.ok(!fs.existsSync(path.join(destRoot, "hooks.json")));

  installHooksJson(outDir, destRoot, { dryRun: false, cursorRootPosix: "C:/Users/x/.cursor" });
  const installed = JSON.parse(fs.readFileSync(path.join(destRoot, "hooks.json"), "utf8"));
  assert.equal(
    installed.hooks.stop[0].command,
    'node "C:/Users/x/.cursor/scripts/hooks/ospec-hooks-launch.js" stop',
  );
  assert.doesNotMatch(installed.hooks.stop[0].command, /__OSPEC_CURSOR_ROOT__/);
});

test("installHooksJson fails closed when generated hooks.json is missing", (t) => {
  const outDir = makeTempDir(t, "cursor-hooks-missing-");
  const destRoot = makeTempDir(t, "cursor-hooks-dest-missing-");
  assert.throws(
    () => installHooksJson(outDir, destRoot, { dryRun: false }),
    /hooks\.json missing|refusing/i,
  );
});

test("syncTreeByContent refuses nested symlink destinations under the cursor root", (t) => {
  const src = makeTempDir(t, "cursor-sync-src-sl-");
  const dest = makeTempDir(t, "cursor-sync-dest-sl-");
  const outside = makeTempDir(t, "cursor-sync-outside-");
  fs.mkdirSync(path.join(src, "agents"), { recursive: true });
  fs.writeFileSync(path.join(src, "agents", "a.md"), "payload\n");
  fs.mkdirSync(dest, { recursive: true });
  const nestedLink = path.join(dest, "agents");
  try {
    fs.symlinkSync(outside, nestedLink, "junction");
  } catch (error) {
    t.skip(`symlink unavailable: ${error.message}`);
    return;
  }
  assert.throws(() => syncTreeByContent(src, dest, fs, { updated: [], unchanged: [] }, new Set(), dest), /symlink|escape|refusing/i);
});

test("main non-dry-run aborts with exit 1 when installHooksJson throws after configure", (t) => {
  const sourceDir = makeTempDir(t, "cursor-main-fail-src-");
  const homeDir = makeTempDir(t, "cursor-main-fail-home-");
  const fakeRunConfigure = () => ({
    files: [],
    summary: [],
    exitCode: 0,
    validation: { status: 0, stdout: "", stderr: "" },
  });
  const code = main(["--source", sourceDir], {
    homedir: () => homeDir,
    runConfigure: fakeRunConfigure,
    syncTreeByContent() {
      return { updated: ["x"], unchanged: [] };
    },
    installHooksJson() {
      throw new Error("hooks boom");
    },
    copyBinaryToTree() {
      throw new Error("should not reach binary");
    },
    stdout: { write() {} },
    stderr: { write() {} },
  });
  assert.equal(code, 1);
});

test("syncTreeByContent is idempotent on second run", (t) => {
  const src = makeTempDir(t, "cursor-sync-src-");
  const dest = makeTempDir(t, "cursor-sync-dest-");
  fs.mkdirSync(path.join(src, "agents"), { recursive: true });
  fs.writeFileSync(path.join(src, "agents", "a.md"), "v1\n");
  fs.writeFileSync(path.join(src, "notes.txt"), "keep-me\n");

  const first = syncTreeByContent(src, dest);
  assert.ok(first.updated.length >= 1);
  fs.writeFileSync(path.join(dest, "user-file.txt"), "user\n");

  const second = syncTreeByContent(src, dest);
  assert.equal(second.updated.length, 0);
  assert.ok(second.unchanged.length >= 1);
  assert.equal(fs.readFileSync(path.join(dest, "user-file.txt"), "utf8"), "user\n");
});

test("parseArgs understands dry-run and no-validate", () => {
  assert.deepEqual(parseArgs([]), { dryRun: false, validate: true, source: undefined });
  assert.deepEqual(parseArgs(["--dry-run", "--no-validate", "--source", "../src"]), {
    dryRun: true,
    validate: false,
    source: "../src",
  });
});

test("main --dry-run with injected deps writes nothing under cursor home", (t) => {
  const sourceDir = makeTempDir(t, "cursor-main-src-");
  const homeDir = makeTempDir(t, "cursor-main-home-");
  const cursorRoot = path.join(homeDir, ".cursor");
  const writes = [];

  // Minimal source so runConfigure can succeed when injected.
  const fakeRunConfigure = () => ({
    files: [{ path: "agents/x.md", content: "x" }],
    summary: ["agents/x.md"],
    exitCode: 0,
    validation: { status: 0, stdout: "0 errors, 0 warnings\n", stderr: "" },
  });

  const code = main(["--dry-run", "--source", sourceDir], {
    homedir: () => homeDir,
    runConfigure: fakeRunConfigure,
    copyBinaryToTree() {
      writes.push("binary");
    },
    syncTreeByContent() {
      writes.push("sync");
      return { updated: [], unchanged: [] };
    },
    installHooksJson() {
      writes.push("hooks");
    },
    stdout: { write() {} },
    stderr: { write() {} },
  });

  assert.equal(code, 0);
  assert.deepEqual(writes, []);
  assert.ok(!fs.existsSync(cursorRoot) || fs.readdirSync(cursorRoot).length === 0);
});

test("main performs a real isolated generate-validate-install round-trip and converges on rerun", (t) => {
  const sandbox = makeTempDir(t, "cursor-roundtrip-");
  const sourceDir = stageRealSource(t, sandbox);
  const homeDir = path.join(sandbox, "home");
  const cursorRoot = path.join(homeDir, ".cursor");
  const foreignRel = "user-owned/notes.txt";
  write(cursorRoot, foreignRel, "do-not-touch\n");
  const stdout = { write() {} };
  const stderrChunks = [];
  const deps = {
    fs: sandboxedFs(sandbox),
    homedir: () => homeDir,
    stdout,
    stderr: { write(chunk) { stderrChunks.push(chunk); } },
  };

  assert.equal(main(["--source", sourceDir], deps), 0, stderrChunks.join(""));
  const outDir = path.join(sourceDir, "dist", "cursor");
  assert.deepEqual(validate(outDir).errors, []);
  assert.deepEqual(validateInstalled(cursorRoot).errors, []);

  const installedHooks = fs.readFileSync(path.join(cursorRoot, "hooks.json"), "utf8");
  const cursorRootPosix = path.resolve(cursorRoot).split(path.sep).join("/");
  assert.doesNotMatch(installedHooks, /__OSPEC_CURSOR_ROOT__/);
  assert.match(installedHooks, new RegExp(cursorRootPosix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const { ext } = hostBinarySuffix();
  assert.equal(
    fs.readFileSync(path.join(cursorRoot, "scripts", "hooks", `ospec-hooks${ext}`), "utf8"),
    "cursor-binary-fixture",
  );
  const beforeSecondRun = treeSnapshot(cursorRoot, new Set([foreignRel]));

  assert.equal(main(["--source", sourceDir], deps), 0, stderrChunks.join(""));
  assert.deepEqual(treeSnapshot(cursorRoot, new Set([foreignRel])), beforeSecondRun);
  assert.equal(fs.readFileSync(path.join(cursorRoot, foreignRel), "utf8"), "do-not-touch\n");
});

test("main fails closed before writing Cursor home when the required binary is absent", (t) => {
  const sandbox = makeTempDir(t, "cursor-required-binary-");
  const sourceDir = stageRealSource(t, sandbox, { withBinary: false });
  const homeDir = path.join(sandbox, "home");
  const cursorRoot = path.join(homeDir, ".cursor");
  const stderrChunks = [];
  const code = main(["--source", sourceDir], {
    fs: sandboxedFs(sandbox),
    homedir: () => homeDir,
    stdout: { write() {} },
    stderr: { write() {} },
  });
  assert.equal(code, 1);
  assert.equal(fs.existsSync(cursorRoot), false);
});

test("main returns 1 when installed-layout validation fails", (t) => {
  const sandbox = makeTempDir(t, "cursor-installed-invalid-");
  const sourceDir = path.join(sandbox, "source");
  const outDir = path.join(sourceDir, "dist", "cursor");
  fs.mkdirSync(outDir, { recursive: true });
  write(outDir, "hooks.json", JSON.stringify({ version: 1, hooks: {} }));
  const code = main(["--source", sourceDir], {
    homedir: () => path.join(sandbox, "home"),
    runConfigure: () => ({ files: [], summary: [], exitCode: 0, validation: null }),
    copyBinaryToTree() {},
    syncTreeByContent: () => ({ updated: [], unchanged: [] }),
    installHooksJson() {},
    validateInstalled: () => ({ errors: ["installed layout corrupt"], warnings: [] }),
    stdout: { write() {} },
    stderr: { write() {} },
  });
  assert.equal(code, 1);
});

function rollbackTreeState(root) {
  const state = {};
  if (!fs.existsSync(root)) return state;
  function visit(dir, rel = "") {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute, childRel);
      else if (entry.isFile()) {
        const stat = fs.statSync(absolute);
        state[childRel] = { bytes: fs.readFileSync(absolute).toString("base64"), mode: stat.mode & 0o777 };
      }
    }
  }
  visit(root);
  return state;
}

function rollbackFixture(t, failureStage) {
  const sandbox = makeTempDir(t, `cursor-rollback-${failureStage}-`);
  const sourceDir = path.join(sandbox, "source");
  const outDir = path.join(sourceDir, "dist", "cursor");
  const homeDir = path.join(sandbox, "home");
  const cursorRoot = path.join(homeDir, ".cursor");
  write(outDir, "agents/a.md", "new-agent\n");
  write(outDir, "commands/new.md", "new-command\n");
  write(
    outDir,
    "hooks.json",
    JSON.stringify({
      version: 1,
      hooks: { stop: [{ command: "node __OSPEC_CURSOR_ROOT__/scripts/hooks/ospec-hooks-launch.js stop" }] },
    }),
  );
  write(cursorRoot, "agents/a.md", "old-agent\n");
  write(cursorRoot, "hooks.json", JSON.stringify({ version: 1, hooks: { stop: [{ command: "old-hooks" }] } }) + "\n");
  write(cursorRoot, "user-owned/notes.txt", "preserve-extra\n");
  fs.chmodSync(path.join(cursorRoot, "agents", "a.md"), 0o600);
  const before = rollbackTreeState(cursorRoot);
  const stderrChunks = [];
  const realFs = sandboxedFs(sandbox);
  let injectedHooksFailure = false;
  const failingFs = new Proxy(realFs, {
    get(target, property) {
      const value = target[property];
      if (property === "copyFileSync") {
        return (source, destination) => {
          if (
            failureStage === "sync" &&
            path.resolve(destination) === path.resolve(cursorRoot, "commands", "new.md")
          ) {
            throw new Error("injected sync failure");
          }
          const result = value(source, destination);
          if (path.resolve(destination) === path.resolve(cursorRoot, "agents", "a.md")) {
            target.chmodSync(destination, 0o666);
          }
          return result;
        };
      }
      if (failureStage === "hooks" && property === "writeFileSync") {
        return (destination, ...args) => {
          if (
            !injectedHooksFailure &&
            path.resolve(destination) === path.resolve(cursorRoot, "hooks.json")
          ) {
            injectedHooksFailure = true;
            throw new Error("injected hooks failure");
          }
          return value(destination, ...args);
        };
      }
      return value;
    },
  });

  const code = main(["--source", sourceDir], {
    fs: failingFs,
    homedir: () => homeDir,
    runConfigure: () => ({ files: [], summary: [], exitCode: 0, validation: null }),
    copyBinaryToTree(destination) {
      const { ext } = hostBinarySuffix();
      write(destination, path.join("scripts", "hooks", `ospec-hooks${ext}`), "new-binary");
    },
    validateInstalled: () =>
      failureStage === "postvalidate" ? { errors: ["injected validation failure"] } : { errors: [] },
    stdout: { write() {} },
    stderr: { write(chunk) { stderrChunks.push(chunk); } },
  });
  return { code, before, after: rollbackTreeState(cursorRoot), stderr: stderrChunks.join("") };
}

for (const failureStage of ["sync", "hooks", "postvalidate"]) {
  test(`main rolls back bytes, modes, and new managed files after ${failureStage} failure`, (t) => {
    const result = rollbackFixture(t, failureStage);
    assert.equal(result.code, 1);
    assert.match(result.stderr, new RegExp(`injected ${failureStage === "postvalidate" ? "validation" : failureStage} failure`));
    assert.deepEqual(result.after, result.before);
  });
}

test("main removes a newly-created empty Cursor root when initial sync traversal fails", (t) => {
  const sandbox = makeTempDir(t, "cursor-rollback-empty-root-");
  const sourceDir = path.join(sandbox, "source");
  const outDir = path.join(sourceDir, "dist", "cursor");
  const homeDir = path.join(sandbox, "home");
  const cursorRoot = path.join(homeDir, ".cursor");
  fs.mkdirSync(outDir, { recursive: true });
  const baseFs = sandboxedFs(sandbox);
  let injected = false;
  const failingFs = new Proxy(baseFs, {
    get(target, property) {
      const value = target[property];
      if (property === "readdirSync") {
        return (candidate, ...args) => {
          if (!injected && path.resolve(candidate) === path.resolve(outDir)) {
            injected = true;
            throw new Error("initial traversal failure");
          }
          return value(candidate, ...args);
        };
      }
      return value;
    },
  });

  const code = main(["--source", sourceDir], {
    fs: failingFs,
    homedir: () => homeDir,
    runConfigure: () => ({ files: [], summary: [], exitCode: 0, validation: null }),
    copyBinaryToTree() {},
    stdout: { write() {} },
    stderr: { write() {} },
  });

  assert.equal(code, 1);
  assert.equal(fs.existsSync(cursorRoot), false);
});

test("rollback removes managed-new empty directories and preserves preexisting empty directories", (t) => {
  const sandbox = makeTempDir(t, "cursor-rollback-empty-dirs-");
  const sourceDir = path.join(sandbox, "source");
  const outDir = path.join(sourceDir, "dist", "cursor");
  const homeDir = path.join(sandbox, "home");
  const cursorRoot = path.join(homeDir, ".cursor");
  fs.mkdirSync(path.join(outDir, "managed-new", "nested"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "managed-existing"), { recursive: true });
  write(
    outDir,
    "hooks.json",
    JSON.stringify({
      version: 1,
      hooks: { stop: [{ command: "node __OSPEC_CURSOR_ROOT__/scripts/hooks/ospec-hooks-launch.js stop" }] },
    }),
  );
  fs.mkdirSync(path.join(cursorRoot, "managed-existing"), { recursive: true });
  fs.mkdirSync(path.join(cursorRoot, "user-owned-empty"), { recursive: true });

  const code = main(["--source", sourceDir], {
    fs: sandboxedFs(sandbox),
    homedir: () => homeDir,
    runConfigure: () => ({ files: [], summary: [], exitCode: 0, validation: null }),
    copyBinaryToTree() {},
    validateInstalled: () => ({ errors: ["injected post-sync failure"] }),
    stdout: { write() {} },
    stderr: { write() {} },
  });

  assert.equal(code, 1);
  assert.equal(fs.existsSync(path.join(cursorRoot, "managed-new")), false);
  assert.equal(fs.statSync(path.join(cursorRoot, "managed-existing")).isDirectory(), true);
  assert.equal(fs.statSync(path.join(cursorRoot, "user-owned-empty")).isDirectory(), true);
});

test("rollback refuses a symlink substituted for a managed-new directory", (t) => {
  const sandbox = makeTempDir(t, "cursor-rollback-dir-symlink-");
  const cursorRoot = path.join(sandbox, ".cursor");
  const managedDir = path.join(cursorRoot, "managed-new");
  const outside = path.join(sandbox, "outside");
  fs.mkdirSync(cursorRoot);
  fs.mkdirSync(outside);
  write(outside, "sentinel.txt", "outside-preserved\n");
  const journal = createRollbackJournal(cursorRoot);
  journal.captureDirectory(managedDir);
  try {
    fs.symlinkSync(outside, managedDir, "junction");
  } catch (error) {
    t.skip(`symlink unavailable: ${error.message}`);
    return;
  }

  assert.throws(() => journal.rollback(), /symlink|rollback incomplete/i);
  assert.equal(fs.readFileSync(path.join(outside, "sentinel.txt"), "utf8"), "outside-preserved\n");
});

test("sanitizeCursorMcpServers resolves or strips ${input:...} placeholders", () => {
  const mcpServers = {
    context7: {
      command: "npx",
      args: ["-y", "@context7/mcp-server"],
      env: {
        CONTEXT7_API_KEY: "${input:CONTEXT7_API_KEY}",
        STATIC_VAR: "literal_value",
      },
    },
  };

  // When env variable is unset in environment: placeholder stripped
  const sanitizedUnset = sanitizeCursorMcpServers(mcpServers, {});
  assert.equal(sanitizedUnset.context7.env.CONTEXT7_API_KEY, undefined);
  assert.equal(sanitizedUnset.context7.env.STATIC_VAR, "literal_value");

  // When env variable is set: expanded with value
  const sanitizedSet = sanitizeCursorMcpServers(mcpServers, { CONTEXT7_API_KEY: "secret-key-123" });
  assert.equal(sanitizedSet.context7.env.CONTEXT7_API_KEY, "secret-key-123");
  assert.equal(sanitizedSet.context7.env.STATIC_VAR, "literal_value");
});

