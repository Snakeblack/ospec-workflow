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

test("parseArgs: rejects --source without a value or followed by another flag", () => {
  assert.throws(() => parseArgs(["opencode", "../dest", "--source"]), /--source requires a value/i);
  assert.throws(
    () => parseArgs(["opencode", "../dest", "--source", "--dry-run"]),
    /--source requires a value/i,
  );
});

test("main: rejects an invalid --source before configuring", () => {
  let configured = false;
  const stderrChunks = [];
  const exitCodeTarget = { exitCode: 0 };

  main(["opencode", "../dest", "--source", "--no-validate"], {
    runConfigure() {
      configured = true;
      return { exitCode: 0 };
    },
    stderr: { write(chunk) { stderrChunks.push(chunk); } },
    exitCodeTarget,
  });

  assert.equal(configured, false);
  assert.equal(exitCodeTarget.exitCode, 2);
  assert.match(stderrChunks.join(""), /--source requires a value/i);
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

test("copyBinaryToTree: required mode throws when the source binary is missing", () => {
  assert.throws(
    () => copyBinaryToTree("/out", "cursor", "/src", { fs: { existsSync: () => false }, required: true }),
    /required.*binary|binary.*not found/i,
  );
});

test("copyBinaryToTree: required mode propagates copy failures", () => {
  const fakeFs = {
    existsSync: () => true,
    mkdirSync() {},
    copyFileSync() {
      throw new Error("copy denied");
    },
  };
  assert.throws(
    () => copyBinaryToTree("/out", "cursor", "/src", { fs: fakeFs, required: true }),
    /copy denied/i,
  );
});

test("copyBinaryToTree: non-required mode reports copy failures and continues", () => {
  const stderrChunks = [];
  assert.doesNotThrow(() =>
    copyBinaryToTree("/out", "cursor", "/src", {
      fs: {
        existsSync: () => true,
        mkdirSync() {},
        copyFileSync() {
          throw new Error("optional copy denied");
        },
      },
      stderr: { write(chunk) { stderrChunks.push(chunk); } },
    }),
  );
  assert.match(stderrChunks.join(""), /optional copy denied.*Continuing sync/is);
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

test("main: builds and syncs a generated tree into a safe destination", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "install-target-main-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const sourceDir = path.join(base, "source");
  const destination = path.join(base, "destination");
  fs.mkdirSync(sourceDir);
  fs.mkdirSync(destination);
  const exitObj = { exitCode: 0 };

  main(["github-copilot", destination, "--source", sourceDir], {
    runConfigure({ outDir }) {
      fs.mkdirSync(path.join(outDir, ".github"), { recursive: true });
      fs.writeFileSync(path.join(outDir, ".github", "agent.md"), "agent\n");
      return { exitCode: 0, validation: { stdout: "0 errors, 0 warnings\n", stderr: "" } };
    },
    stdout: { write() {} },
    stderr: { write() {} },
    exitCodeTarget: exitObj,
  });

  assert.equal(exitObj.exitCode, 0);
  assert.equal(fs.readFileSync(path.join(destination, ".github", "agent.md"), "utf8"), "agent\n");
});

test("main: dry-run reports generated entries without syncing them", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "install-target-dry-run-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const sourceDir = path.join(base, "source");
  const destination = path.join(base, "destination");
  fs.mkdirSync(sourceDir);
  fs.mkdirSync(destination);
  const stdoutChunks = [];

  main(["opencode", destination, "--dry-run", "--source", sourceDir], {
    runConfigure({ outDir }) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "opencode.json"), "{}\n");
      return { exitCode: 0, validation: null };
    },
    stdout: { write(chunk) { stdoutChunks.push(chunk); } },
    stderr: { write() {} },
    exitCodeTarget: { exitCode: 0 },
  });

  assert.equal(fs.existsSync(path.join(destination, "opencode.json")), false);
  assert.match(stdoutChunks.join(""), /dry-run.*opencode\.json.*no files written/is);
});

test("main: validation failure forwards diagnostics and leaves destination untouched", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "install-target-build-fail-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const sourceDir = path.join(base, "source");
  const destination = path.join(base, "destination");
  fs.mkdirSync(sourceDir);
  fs.mkdirSync(destination);
  const stdoutChunks = [];
  const stderrChunks = [];
  const exitCodeTarget = { exitCode: 0 };

  main(["opencode", destination, "--source", sourceDir], {
    runConfigure: () => ({
      exitCode: 7,
      validation: { stdout: "validator summary\n", stderr: "validator detail\n" },
    }),
    stdout: { write(chunk) { stdoutChunks.push(chunk); } },
    stderr: { write(chunk) { stderrChunks.push(chunk); } },
    exitCodeTarget,
  });

  assert.equal(exitCodeTarget.exitCode, 7);
  assert.match(stdoutChunks.join(""), /validator summary/);
  assert.match(stderrChunks.join(""), /validator detail.*nothing synced/is);
  assert.deepEqual(fs.readdirSync(destination), []);
});

test("main: a later sync failure rolls back replaced and new entries and cleans its backup", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "install-target-rollback-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const sourceDir = path.join(base, "source");
  const destination = path.join(base, "destination");
  fs.mkdirSync(sourceDir);
  fs.mkdirSync(path.join(destination, ".github"), { recursive: true });
  const originalAgent = path.join(destination, ".github", "agent.md");
  const preservedNestedExtra = path.join(destination, ".github", "local-only.md");
  const preservedTopLevelExtra = path.join(destination, "local-only.txt");
  fs.writeFileSync(originalAgent, Buffer.from([0x00, 0x01, 0xfe, 0xff]));
  fs.writeFileSync(preservedNestedExtra, "nested extra\n");
  fs.writeFileSync(preservedTopLevelExtra, "top-level extra\n");
  fs.chmodSync(originalAgent, 0o600);
  const originalMode = fs.statSync(originalAgent).mode;

  let generatedScripts;
  const rollbackDirs = [];
  const fsImpl = Object.create(fs);
  fsImpl.cpSync = (src, dest, options) => {
    if (generatedScripts && path.resolve(src) === path.resolve(generatedScripts)) {
      throw new Error("synthetic later-entry copy failure");
    }
    return fs.cpSync(src, dest, options);
  };
  fsImpl.mkdtempSync = (prefix) => {
    const created = fs.mkdtempSync(prefix);
    rollbackDirs.push(created);
    return created;
  };
  const stderrChunks = [];
  const exitCodeTarget = { exitCode: 0 };

  main(["github-copilot", destination, "--source", sourceDir], {
    fs: fsImpl,
    runConfigure({ outDir }) {
      fs.mkdirSync(path.join(outDir, ".github"), { recursive: true });
      fs.writeFileSync(path.join(outDir, ".github", "agent.md"), "replacement\n");
      fs.writeFileSync(path.join(outDir, "new-entry.txt"), "new\n");
      generatedScripts = path.join(outDir, "scripts");
      fs.mkdirSync(generatedScripts, { recursive: true });
      fs.writeFileSync(path.join(generatedScripts, "hook.js"), "hook\n");
      return { exitCode: 0, validation: null };
    },
    stdout: { write() {} },
    stderr: { write(chunk) { stderrChunks.push(chunk); } },
    exitCodeTarget,
  });

  assert.equal(exitCodeTarget.exitCode, 2);
  assert.match(stderrChunks.join(""), /synthetic later-entry copy failure.*rolled back/is);
  assert.deepEqual(fs.readFileSync(originalAgent), Buffer.from([0x00, 0x01, 0xfe, 0xff]));
  assert.equal(fs.statSync(originalAgent).mode, originalMode);
  assert.equal(fs.readFileSync(preservedNestedExtra, "utf8"), "nested extra\n");
  assert.equal(fs.readFileSync(preservedTopLevelExtra, "utf8"), "top-level extra\n");
  assert.equal(fs.existsSync(path.join(destination, "new-entry.txt")), false);
  assert.equal(fs.existsSync(path.join(destination, "scripts")), false);
  assert.ok(rollbackDirs.length > 0);
  assert.ok(rollbackDirs.every((dir) => !fs.existsSync(dir)), "all rollback directories must be cleaned");
});
