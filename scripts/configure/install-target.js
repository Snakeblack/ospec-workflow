"use strict";

// Build + sync installer for the targets that have NO plugin marketplace:
// opencode and github-copilot. Unlike Claude Code (register marketplace +
// `plugin install`), these tools consume the workflow by having the generated
// tree copied into the ROOT of a destination repo, where they auto-discover it
// (.opencode/ + opencode.json for opencode; .github/ + .mcp.json for copilot).
//
// This collapses "build to dist/, then copy the right folders by hand" into one
// command:
//   node scripts/configure/install-target.js opencode <destRepo>
//   node scripts/configure/install-target.js github-copilot <destRepo>
//
// Copy semantics: overwrite. Generated entries are copied over the destination,
// replacing files of the same path; unrelated files in the destination are left
// untouched. Pass --dry-run to preview without writing.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { runConfigure } = require("./cli.js");
const { mutateFs } = require("./install-engine.js");

const TARGETS = new Set(["opencode", "github-copilot"]);

// Detect the host platform suffix used in CI-compiled binary names.
function hostBinarySuffix() {
  const platform = process.platform;
  const archName = process.arch;
  const goos = platform === "win32" ? "windows" : platform === "darwin" ? "darwin" : "linux";
  const arch = archName === "x64" ? "amd64" : archName === "arm64" ? "arm64" : archName;
  const ext = platform === "win32" ? ".exe" : "";
  return { os: goos, arch, ext };
}

// Automatically compile the ospec-hooks Go binary if missing and go is installed
function ensureRuntimeBinary(sourceDir, deps = {}) {
  const fsImpl = deps.fs || fs;
  const stdout = deps.stdout || process.stdout;
  const spawnSyncImpl = deps.spawnSync || spawnSync;
  const { os: goos, arch, ext } = hostBinarySuffix();
  const distDir = path.join(sourceDir, "release", "dist");
  const srcBin = path.join(distDir, `ospec-hooks-${goos}-${arch}${ext}`);

  if (fsImpl.existsSync(srcBin)) {
    return srcBin;
  }

  const cmdDir = path.join(sourceDir, "cmd", "ospec-hooks");
  if (fsImpl.existsSync(cmdDir)) {
    try {
      const probe = spawnSyncImpl("go", ["version"], { stdio: "ignore", shell: false });
      if (!probe.error && probe.status === 0) {
        stdout.write(`  * Compiling ospec-hooks binary for ${goos}-${arch} with local Go toolchain...\n`);
        fsImpl.mkdirSync(distDir, { recursive: true });
        const buildResult = spawnSyncImpl("go", ["build", "-o", srcBin, "./cmd/ospec-hooks"], {
          cwd: sourceDir,
          stdio: "inherit",
          shell: false,
        });
        if (buildResult.status === 0 && fsImpl.existsSync(srcBin)) {
          stdout.write(`  + Successfully compiled ${srcBin}\n`);
          return srcBin;
        }
      }
    } catch {
      // Best-effort Go compilation failed
    }
  }

  return null;
}

// Copy the platform-appropriate ospec-hooks binary into the generated output
// tree. For claude/vscode/github-copilot the binary lands in scripts/hooks/;
// for opencode it lands in release/dist/ (where the plugin's resolveBinary()
// looks first). If the source binary is absent (pre-CI dev environment),
// attempt automatic compilation with local Go or print a warning / fail.
function copyBinaryToTree(outDir, target, sourceDir, deps = {}) {
  const fsImpl = deps.fs || fs;
  const stdout = deps.stdout || process.stdout;
  const stderr = deps.stderr || process.stderr;
  const required = Boolean(deps.required);
  const { os: goos, arch, ext } = hostBinarySuffix();
  let srcBin = path.join(sourceDir, "release", "dist", `ospec-hooks-${goos}-${arch}${ext}`);

  if (!fsImpl.existsSync(srcBin)) {
    const compiledBin = ensureRuntimeBinary(sourceDir, deps);
    if (compiledBin) {
      srcBin = compiledBin;
    }
  }

  if (!fsImpl.existsSync(srcBin)) {
    const message = `ospec-hooks binary not found at ${srcBin}`;
    if (required) {
      throw new Error(`required ${message}`);
    }
    stderr.write(
      `[warn] ${message}; skipping copy.\n` +
        `       Run the CI build (build-hooks.yml) or 'npm run build:hooks' first.\n`,
    );
    return;
  }

  // Destination paths differ per target:
  //   opencode   -> release/dist/ospec-hooks[.exe]  (plugin resolveBinary priority 1)
  //   everything -> scripts/hooks/ospec-hooks[.exe]  (CLAUDE_PLUGIN_ROOT-relative shell hook)
  const destinations = [];
  if (target === "opencode") {
    destinations.push(path.join(outDir, "release", "dist", `ospec-hooks${ext}`));
  } else {
    destinations.push(path.join(outDir, "scripts", "hooks", `ospec-hooks${ext}`));
  }

  for (const dest of destinations) {
    try {
      const retryOptions = { target, ...(deps.retryOptions || {}) };
      mutateFs("mkdir", path.dirname(dest), () => fsImpl.mkdirSync(path.dirname(dest), { recursive: true }), retryOptions);
      mutateFs("copy binary", dest, () => fsImpl.copyFileSync(srcBin, dest), retryOptions);
      // Set executable bit on POSIX systems so the shell can invoke the binary.
      if (process.platform !== "win32") {
        fsImpl.chmodSync(dest, 0o755);
      }
      stdout.write(`  + ospec-hooks${ext} -> ${path.relative(outDir, dest)}\n`);
    } catch (err) {
      if (required) {
        throw err;
      }
      stderr.write(`[warn] failed to copy binary to ${dest}: ${err.message}. Continuing sync.\n`);
    }
  }
}

function parseArgs(argv) {
  const args = { dryRun: false, validate: true };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--no-validate") args.validate = false;
    else if (arg === "--source") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--source requires a value");
      }
      args.source = value;
      i += 1;
    }
    else positional.push(arg);
  }
  [args.target, args.dest] = positional;
  return args;
}

function syncEntriesTransactional(outDir, destDir, entries, fsImpl, retryOptions = {}) {
  const backupRoot = fsImpl.mkdtempSync(path.join(os.tmpdir(), "ospec-target-sync-"));
  const manifest = [];
  let primaryError = null;
  let preserveBackup = false;

  try {
    // Snapshot every destination entry before the first mutation. Unrelated
    // destination entries are deliberately absent from the manifest.
    for (const entry of entries) {
      const destination = path.join(destDir, entry);
      const existed = fsImpl.existsSync(destination);
      const backup = path.join(backupRoot, entry);
      if (existed) {
        mutateFs("snapshot", backup, () => fsImpl.cpSync(destination, backup, { recursive: true, force: true, preserveTimestamps: true }), retryOptions);
      }
      manifest.push({ entry, destination, backup, existed });
    }

    for (const { entry, destination } of manifest) {
      mutateFs("copy entry", destination, () => fsImpl.cpSync(path.join(outDir, entry), destination, { recursive: true, force: true }), retryOptions);
    }
  } catch (error) {
    primaryError = error;
    const rollbackErrors = [];
    for (const item of [...manifest].reverse()) {
      try {
        mutateFs("rollback remove", item.destination, () => fsImpl.rmSync(item.destination, { recursive: true, force: true }), retryOptions);
        if (item.existed) {
          mutateFs("rollback restore", item.destination, () => fsImpl.cpSync(item.backup, item.destination, {
            recursive: true,
            force: true,
            preserveTimestamps: true,
          }), retryOptions);
        }
      } catch (rollbackError) {
        rollbackErrors.push(`${item.entry}: ${rollbackError.message}`);
      }
    }
    if (rollbackErrors.length > 0) {
      preserveBackup = true;
      throw new Error(`${error.message}; rollback failed: ${rollbackErrors.join("; ")}; recovery backup preserved at ${backupRoot}`);
    }
    throw new Error(`${error.message}; changes rolled back`);
  } finally {
    try {
      // A failed restoration leaves the snapshot as the user's recovery copy.
      if (!preserveBackup) {
        mutateFs("cleanup transaction", backupRoot, () => fsImpl.rmSync(backupRoot, { recursive: true, force: true }), retryOptions);
      }
    } catch (cleanupError) {
      if (!primaryError) {
        throw new Error(`failed to clean transaction backup: ${cleanupError.message}`);
      }
    }
  }
}

// Refuse to copy a generated tree on top of paths we must never clobber: the
// filesystem root, the home dir, and — critically — the source repo itself.
// The copilot tree carries `.github/` and `scripts/`, so syncing into our own
// repo would overwrite the real harness. Compare resolved paths.
function assertSafeDest(destDir, sourceDir) {
  const abs = path.resolve(destDir);
  const refuse = (reason) => {
    throw new Error(`refusing to sync into ${abs}: ${reason}`);
  };

  let canonicalAbs = abs;
  let canonicalSrc = path.resolve(sourceDir);
  try {
    canonicalAbs = fs.realpathSync(abs);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  try {
    canonicalSrc = fs.realpathSync(canonicalSrc);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }

  const isCaseInsensitive = process.platform === "win32" || process.platform === "darwin";

  // Enforce safety checks on canonical paths to prevent symlink bypasses
  if (canonicalAbs === path.parse(canonicalAbs).root) refuse("filesystem root");
  const home = os.homedir();
  if (home) {
    let canonicalHome = path.resolve(home);
    try {
      canonicalHome = fs.realpathSync(canonicalHome);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const equalsHome = isCaseInsensitive
      ? canonicalAbs.toLowerCase() === canonicalHome.toLowerCase()
      : canonicalAbs === canonicalHome;
    if (equalsHome) refuse("home directory");
  }

  const equalsSrc = isCaseInsensitive
    ? canonicalAbs.toLowerCase() === canonicalSrc.toLowerCase()
    : canonicalAbs === canonicalSrc;

  if (equalsSrc) {
    refuse("equals the source repo (would overwrite the harness)");
  }

  // Prevent directory recursion or nested overwrites
  const relative = path.relative(canonicalSrc, canonicalAbs);
  const isDescendant = relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  if (isDescendant) {
    refuse("inside the source repository (nested target write)");
  }

  const relativeBack = path.relative(canonicalAbs, canonicalSrc);
  const isAncestor = relativeBack && !relativeBack.startsWith("..") && !path.isAbsolute(relativeBack);
  if (isAncestor) {
    refuse("contains the source repository (would overwrite the harness root)");
  }
}

function main(argv, deps = {}) {
  const fsImpl = deps.fs || fs;
  const stdout = deps.stdout || process.stdout;
  const stderr = deps.stderr || process.stderr;
  const runConfigureImpl = deps.runConfigure || runConfigure;
  const exitCodeTarget = deps.exitCodeTarget || process;

  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    stderr.write(`${error.message}\n`);
    exitCodeTarget.exitCode = 2;
    return;
  }
  const sourceDir = path.resolve(args.source || process.cwd());

  if (!TARGETS.has(args.target) || !args.dest) {
    stderr.write(
      "usage: install-target <opencode|github-copilot> <destRepo> [--dry-run] [--no-validate]\n" +
        "  e.g. npm run install:opencode -- ../my-project\n",
    );
    exitCodeTarget.exitCode = 2;
    return;
  }

  const destDir = path.resolve(args.dest);
  assertSafeDest(destDir, sourceDir);
  if (!fsImpl.existsSync(destDir) || !fsImpl.statSync(destDir).isDirectory()) {
    stderr.write(`destination is not an existing directory: ${destDir}\n`);
    exitCodeTarget.exitCode = 2;
    return;
  }

  // Build into dist/<target>. The opencode/copilot validators are pure Node, so
  // validation is safe to run here (no external CLI needed, unlike claude).
  const outDir = path.join(sourceDir, "dist", args.target);
  const result = runConfigureImpl({ sourceDir, target: args.target, outDir, validate: args.validate });

  if (result.validation?.stdout) stdout.write(result.validation.stdout);
  if (result.validation?.stderr) stderr.write(result.validation.stderr);
  if (result.exitCode !== 0) {
    stderr.write("\nbuild/validation failed; nothing synced\n");
    exitCodeTarget.exitCode = result.exitCode;
    return;
  }

  // Copy the platform binary into the generated tree before syncing. This is
  // best-effort: if the binary is absent (pre-CI dev), a warning is printed and
  // the rest of the sync proceeds normally.
  copyBinaryToTree(outDir, args.target, sourceDir, deps);

  // Copy each top-level generated entry (including dotfiles) into the dest root,
  // overwriting same-path files. force:true replaces; recursive walks dirs.
  const entries = fsImpl.readdirSync(outDir);
  stdout.write(`\n${args.dryRun ? "[dry-run] would sync" : "sync"} ${outDir} -> ${destDir}\n`);
  for (const entry of entries) {
    stdout.write(`  ${args.dryRun ? "·" : "+"} ${entry}\n`);
  }

  if (args.dryRun) {
    stdout.write("\n[dry-run] no files written.\n");
  } else {
    try {
      syncEntriesTransactional(outDir, destDir, entries, fsImpl, {
        target: args.target,
        ...(deps.retryOptions || {}),
      });
    } catch (error) {
      stderr.write(`\nsync failed: ${error.message}\n`);
      exitCodeTarget.exitCode = 2;
      return;
    }
    stdout.write(`\nDone. ${args.target} workflow synced into ${destDir}.\n`);
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { main, assertSafeDest, parseArgs, copyBinaryToTree, ensureRuntimeBinary, hostBinarySuffix, syncEntriesTransactional };
