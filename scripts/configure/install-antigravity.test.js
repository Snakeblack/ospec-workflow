"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  main,
  parseArgs,
  renderHooksValue,
  getHooksRootPosix,
  getDestinationRoots,
} = require("./install-antigravity.js");

test("parseArgs handles arguments cleanly", () => {
  assert.deepEqual(parseArgs(["--dry-run"]), {
    dryRun: true,
    validate: true,
    source: undefined,
    dest: undefined,
  });
  assert.deepEqual(parseArgs(["--dest", "/custom/dest"]), {
    dryRun: false,
    validate: true,
    source: undefined,
    dest: "/custom/dest",
  });
});

test("getHooksRootPosix translates paths properly", () => {
  assert.equal(
    getHooksRootPosix("/home/user/.gemini/config"),
    "/home/user/.gemini/config",
  );
  assert.equal(
    getHooksRootPosix("/mnt/c/Users/sn4ke/.gemini/config"),
    "C:/Users/sn4ke/.gemini/config",
  );
  assert.equal(
    getHooksRootPosix("/mnt/d/custom/path"),
    "D:/custom/path",
  );
});

test("getDestinationRoots returns explicit dest when provided", () => {
  const roots = getDestinationRoots("/custom/target", {
    fs: { existsSync: () => false },
  });
  assert.deepEqual(roots, [path.resolve("/custom/target")]);
});

test("getDestinationRoots discovers both WSL and Windows in WSL environment", () => {
  const fakeFs = {
    existsSync(p) {
      if (p === "/proc/version") return true;
      if (p === "/mnt/c/Users") return true;
      if (p === "/mnt/c/Users/sn4ke/.gemini/config") return true;
      return false;
    },
    readFileSync(p) {
      if (p === "/proc/version") return "Linux version 5.15.167.4-microsoft-standard-WSL2";
      return "";
    },
    readdirSync(p) {
      if (p === "/mnt/c/Users") return ["sn4ke", "Public", "Default"];
      return [];
    },
  };

  const roots = getDestinationRoots(undefined, {
    fs: fakeFs,
    homedir: () => "/home/sn4ke",
    platform: "linux",
    env: { WSL_DISTRO_NAME: "Ubuntu", USER: "sn4ke" },
  });

  assert.deepEqual(roots, [
    path.posix.resolve("/home/sn4ke/.gemini/config"),
    path.posix.resolve("/mnt/c/Users/sn4ke/.gemini/config"),
  ]);
});

test("renderHooksValue expands placeholder", () => {
  const rendered = renderHooksValue(
    "node __OSPEC_ANTIGRAVITY_ROOT__/scripts/hooks/ospec-hooks-launch.js session-start",
    "/home/user/.gemini/config",
  );
  assert.equal(
    rendered,
    "node /home/user/.gemini/config/scripts/hooks/ospec-hooks-launch.js session-start",
  );
});

test("pruneStaleFiles exhaustion diagnosis specifies target: antigravity", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "antigravity-prune-exhaust-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const sourceDir = path.join(root, "source");
  const destDir = path.join(root, "dest");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(destDir, { recursive: true });

  fs.writeFileSync(path.join(sourceDir, "package.json"), JSON.stringify({ name: "test", version: "1.0.0" }));
  fs.writeFileSync(path.join(sourceDir, "hooks.json"), JSON.stringify({ hooks: {} }));
  fs.writeFileSync(path.join(destDir, "stale-file.txt"), "stale");
  fs.writeFileSync(
    path.join(destDir, ".ospec-workflow-install.json"),
    JSON.stringify({ target: "antigravity", files: ["stale-file.txt"] }),
  );

  const stderr = [];
  const delays = [];
  const fsImpl = new Proxy(fs, {
    get(target, property) {
      if (property === "rmSync") {
        return (p, ...args) => {
          if (typeof p === "string" && p.includes("stale-file.txt")) {
            const err = new Error("locked stale file");
            err.code = "EPERM";
            throw err;
          }
          return target[property](p, ...args);
        };
      }
      return target[property];
    },
  });

  const exitCode = main(["--dest", destDir], {
    sourceDir,
    fs: fsImpl,
    outDir: sourceDir,
    runConfigure: () => ({ exitCode: 0, validation: { errors: [] } }),
    validateInstalled: () => ({ errors: [] }),
    copyBinaryToTree: () => {},
    syncTargetTree: () => ({ updated: [], unchanged: [], ownedFiles: [] }),
    installHooksJson: () => {},
    stdout: { write() {} },
    stderr: { write: (chunk) => stderr.push(chunk) },
    retryOptions: { maxRetries: 2, sleep: (d) => delays.push(d) },
  });

  assert.equal(exitCode, 1);
  const errOutput = stderr.join("");
  assert.match(errOutput, /antigravity:/i);
  assert.match(errOutput, /remove stale file failed/i);
  assert.match(errOutput, /after 3 attempts/i);
  assert.match(errOutput, /close the application/i);
});

