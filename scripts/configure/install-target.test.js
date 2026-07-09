"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { assertSafeDest, hostBinarySuffix, copyBinaryToTree, parseArgs, main } = require("./install-target.js");

test("assertSafeDest: refuses filesystem root", () => {
  const root = path.parse(process.cwd()).root;
  assert.throws(
    () => assertSafeDest(root, process.cwd()),
    /refusing to sync into.*filesystem root/i
  );
});

test("assertSafeDest: refuses home directory", () => {
  const home = os.homedir();
  if (home) {
    assert.throws(
      () => assertSafeDest(home, process.cwd()),
      /refusing to sync into.*home directory/i
    );
  }
});

test("assertSafeDest: refuses exact source repository", () => {
  const source = process.cwd();
  assert.throws(
    () => assertSafeDest(source, source),
    /refusing to sync into.*equals the source repo/i
  );
});

if (process.platform === "win32") {
  test("assertSafeDest: refuses source repository with different drive letter casing on Windows", () => {
    const source = process.cwd();
    const driveLetter = source[0];
    const toggledDrive = driveLetter === driveLetter.toUpperCase() 
      ? driveLetter.toLowerCase() 
      : driveLetter.toUpperCase();
    const toggledSource = toggledDrive + source.slice(1);

    assert.throws(
      () => assertSafeDest(toggledSource, source),
      /refusing to sync into.*equals the source repo/i
    );
  });
}

test("assertSafeDest: refuses descendant directories (nested targets)", () => {
  const source = process.cwd();
  const nestedDest = path.join(source, "dist", "opencode");
  assert.throws(
    () => assertSafeDest(nestedDest, source),
    /refusing to sync into.*inside the source repository/i
  );
});

test("assertSafeDest: refuses ancestor directories that contain the source", () => {
  const source = process.cwd();
  const parent = path.dirname(source);
  // Only test if not root (e.g. users folder containing the dev folder)
  if (parent !== path.parse(parent).root) {
    assert.throws(
      () => assertSafeDest(parent, source),
      /refusing to sync into.*contains the source repository/i
    );
  }
});

test("assertSafeDest: resolves and blocks symlinked source repositories", (t) => {
  const source = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-symlink-test-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const linkPath = path.join(tempDir, "source-link");
  try {
    fs.symlinkSync(source, linkPath, "junction");
  } catch (e) {
    // Windows developer mode might block symlink creation without admin rights;
    // skip test if link creation fails.
    return;
  }

  assert.throws(
    () => assertSafeDest(linkPath, source),
    /refusing to sync into.*equals the source repo/i
  );
});

test("assertSafeDest: allows safe unrelated directories", () => {
  const tempDir = os.tmpdir();
  const source = process.cwd();
  assertSafeDest(tempDir, source);
});

test("hostBinarySuffix: returns valid object with os, arch, and ext", () => {
  const suffix = hostBinarySuffix();
  assert.equal(typeof suffix.os, "string");
  assert.equal(typeof suffix.arch, "string");
  assert.equal(typeof suffix.ext, "string");
  
  if (process.platform === "win32") {
    assert.equal(suffix.os, "windows");
    assert.equal(suffix.ext, ".exe");
  } else if (process.platform === "darwin") {
    assert.equal(suffix.os, "darwin");
    assert.equal(suffix.ext, "");
  } else {
    assert.equal(suffix.os, "linux");
    assert.equal(suffix.ext, "");
  }
});

test("parseArgs: parses commands and flags correctly", () => {
  const args = parseArgs(["opencode", "../dest", "--dry-run", "--no-validate", "--source", "/src"]);
  assert.equal(args.target, "opencode");
  assert.equal(args.dest, "../dest");
  assert.equal(args.dryRun, true);
  assert.equal(args.validate, false);
  assert.equal(args.source, "/src");
});

test("copyBinaryToTree: skips copy if source binary does not exist", () => {
  const stderrChunks = [];
  const fakeFs = {
    existsSync: () => false,
  };
  const fakeStderr = {
    write: (chunk) => stderrChunks.push(chunk),
  };

  copyBinaryToTree("/out", "opencode", "/src", {
    fs: fakeFs,
    stderr: fakeStderr,
  });

  assert.match(stderrChunks.join(""), /binary not found/i);
});

test("copyBinaryToTree: copies binary to correct destination directory", () => {
  const stdoutChunks = [];
  const createdDirs = [];
  const copiedFiles = [];
  
  const { os: goos, arch, ext } = hostBinarySuffix();
  const expectedSrc = path.join("/src", "release", "dist", `ospec-hooks-${goos}-${arch}${ext}`);
  const expectedDest = path.join("/out", "release", "dist", `ospec-hooks${ext}`);

  const fakeFs = {
    existsSync: (p) => p === expectedSrc,
    mkdirSync: (p) => createdDirs.push(p),
    copyFileSync: (src, dest) => copiedFiles.push({ src, dest }),
    chmodSync: () => {},
  };
  const fakeStdout = {
    write: (chunk) => stdoutChunks.push(chunk),
  };

  copyBinaryToTree("/out", "opencode", "/src", {
    fs: fakeFs,
    stdout: fakeStdout,
  });

  assert.equal(createdDirs.includes(path.dirname(expectedDest)), true);
  assert.equal(copiedFiles.length, 1);
  assert.equal(copiedFiles[0].src, expectedSrc);
  assert.equal(copiedFiles[0].dest, expectedDest);
});

test("main: aborts with error if arguments are invalid", () => {
  const stderrChunks = [];
  const exitObj = { exitCode: 0 };
  
  main([], {
    stderr: { write: (chunk) => stderrChunks.push(chunk) },
    exitCodeTarget: exitObj,
  });

  assert.equal(exitObj.exitCode, 2);
  assert.match(stderrChunks.join(""), /usage:/i);
});

test("main: aborts if destination directory does not exist", () => {
  const stderrChunks = [];
  const exitObj = { exitCode: 0 };
  const fakeFs = {
    existsSync: () => false,
  };

  main(["opencode", "/nonexistent"], {
    fs: fakeFs,
    stderr: { write: (chunk) => stderrChunks.push(chunk) },
    exitCodeTarget: exitObj,
  });

  assert.equal(exitObj.exitCode, 2);
  assert.match(stderrChunks.join(""), /destination is not an existing directory/i);
});
