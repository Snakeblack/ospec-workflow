"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  assertCursorPathSafe,
  expandCursorHooksPlaceholder,
  syncTreeByContent,
  installHooksJson,
  parseArgs,
  main,
} = require("./install-cursor.js");

function makeTempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
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
