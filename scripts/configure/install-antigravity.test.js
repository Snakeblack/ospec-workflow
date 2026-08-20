"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

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
