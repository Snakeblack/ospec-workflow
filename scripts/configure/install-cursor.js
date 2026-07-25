"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runConfigure } = require("./cli.js");
const { copyBinaryToTree } = require("./install-target.js");

function usage() {
  return "usage: install-cursor [--dry-run] [--no-validate] [--source <sourceRepo>]\n";
}

function parseArgs(argv) {
  const args = { dryRun: false, validate: true, source: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--no-validate") args.validate = false;
    else if (arg === "--source") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args.error = "missing value for --source";
        return args;
      }
      args.source = next;
      i += 1;
    } else {
      args.error = `unknown argument: ${arg}`;
      return args;
    }
  }
  return args;
}

function lstatIfExists(targetPath, fsImpl = fs) {
  try {
    return fsImpl.lstatSync(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function realpathIfExists(targetPath, fsImpl = fs) {
  try {
    return fsImpl.realpathSync(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return path.resolve(targetPath);
    }
    throw error;
  }
}

// ADR-004 / REQ-install-005: allow ~/.cursor (unlike assertSafeDest which refuses
// $HOME). Refuse filesystem roots, symlinked root/dest, and canonical escape.
function assertCursorPathSafe(cursorRoot, managedPath = cursorRoot, fsImpl = fs) {
  const resolvedRoot = path.resolve(cursorRoot);
  if (resolvedRoot === path.parse(resolvedRoot).root) {
    throw new Error(`refusing to sync into filesystem root: ${resolvedRoot}`);
  }

  const rootStat = lstatIfExists(resolvedRoot, fsImpl);
  if (rootStat && rootStat.isSymbolicLink()) {
    throw new Error(`refusing symlinked Cursor root: ${resolvedRoot}`);
  }

  const resolvedManaged = path.resolve(managedPath);
  const managedStat = lstatIfExists(resolvedManaged, fsImpl);
  if (managedStat && managedStat.isSymbolicLink()) {
    throw new Error(`refusing symlinked Cursor destination: ${resolvedManaged}`);
  }

  const canonicalRoot = realpathIfExists(resolvedRoot, fsImpl);
  const parentOfManaged = path.dirname(resolvedManaged);
  const canonicalManagedParent = realpathIfExists(parentOfManaged, fsImpl);
  // When checking the root itself, managed == root; otherwise ensure managed
  // stays under the approved cursor root.
  if (path.resolve(managedPath) !== resolvedRoot) {
    const relative = path.relative(canonicalRoot, path.join(canonicalManagedParent, path.basename(resolvedManaged)));
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`refusing path that escapes the approved Cursor root: ${resolvedManaged}`);
    }
  }
}

function filesMatch(source, destination, fsImpl = fs) {
  try {
    return fsImpl.readFileSync(source).equals(fsImpl.readFileSync(destination));
  } catch {
    return false;
  }
}

function syncTreeByContent(
  sourceDir,
  destDir,
  fsImpl = fs,
  result = { updated: [], unchanged: [] },
  skipNames = new Set(),
  cursorRoot = destDir,
) {
  // Per-destination safety (Codex parity): refuse nested symlinks that escape root.
  assertCursorPathSafe(cursorRoot, destDir, fsImpl);
  fsImpl.mkdirSync(destDir, { recursive: true });
  for (const entry of fsImpl.readdirSync(sourceDir, { withFileTypes: true })) {
    if (skipNames.has(entry.name)) {
      continue;
    }
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      syncTreeByContent(source, destination, fsImpl, result, skipNames, cursorRoot);
    } else if (entry.isFile()) {
      assertCursorPathSafe(cursorRoot, destination, fsImpl);
      if (filesMatch(source, destination, fsImpl)) {
        result.unchanged.push(destination);
      } else {
        fsImpl.mkdirSync(path.dirname(destination), { recursive: true });
        fsImpl.copyFileSync(source, destination);
        result.updated.push(destination);
      }
    }
  }
  return result;
}

// Expand __OSPEC_CURSOR_ROOT__ to an absolute POSIX-slashed cursor home.
// Always quote the expanded path so metacharacters in $HOME cannot inject shell.
function expandCursorHooksPlaceholder(command, cursorRootPosix) {
  if (typeof command !== "string" || !command.includes("__OSPEC_CURSOR_ROOT__")) {
    return command;
  }
  return command.replace(/__OSPEC_CURSOR_ROOT__(\/[^\s"]*)?/g, (_match, rest = "") => {
    const full = cursorRootPosix + (rest || "");
    return `"${full}"`;
  });
}

function renderHooksValue(value, cursorRootPosix) {
  if (typeof value === "string") {
    return expandCursorHooksPlaceholder(value, cursorRootPosix);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => renderHooksValue(entry, cursorRootPosix));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, renderHooksValue(child, cursorRootPosix)]),
    );
  }
  return value;
}

function installHooksJson(outDir, cursorRoot, deps = {}) {
  const fsImpl = deps.fs || fs;
  const dryRun = Boolean(deps.dryRun);
  const cursorRootPosix =
    deps.cursorRootPosix || path.resolve(cursorRoot).split(path.sep).join("/");
  const sourcePath = path.join(outDir, "hooks.json");
  if (!fsImpl.existsSync(sourcePath)) {
    throw new Error(`generated hooks.json missing at ${sourcePath}; refusing to leave ~/.cursor hooks stale`);
  }
  const generated = JSON.parse(fsImpl.readFileSync(sourcePath, "utf8"));
  const rendered = renderHooksValue(generated, cursorRootPosix);
  const destPath = path.join(cursorRoot, "hooks.json");
  if (dryRun) {
    return;
  }
  assertCursorPathSafe(cursorRoot, destPath, fsImpl);
  fsImpl.mkdirSync(cursorRoot, { recursive: true });
  fsImpl.writeFileSync(destPath, JSON.stringify(rendered, null, 2) + "\n");
}

function main(argv, deps = {}) {
  const args = parseArgs(argv);
  const cwd = deps.cwd || process.cwd();
  const fsImpl = deps.fs || fs;
  const stdout = deps.stdout || process.stdout;
  const stderr = deps.stderr || process.stderr;
  const homedir = deps.homedir || os.homedir;
  const runConfigureImpl = deps.runConfigure || runConfigure;
  const copyBinary = deps.copyBinaryToTree || copyBinaryToTree;
  const syncTree = deps.syncTreeByContent || syncTreeByContent;
  const installHooks = deps.installHooksJson || installHooksJson;

  if (args.error) {
    stderr.write(`${usage()}${args.error}\n`);
    return 2;
  }

  const sourceDir = path.resolve(args.source || cwd);
  const cursorRoot = path.join(homedir(), ".cursor");
  const outDir = path.join(sourceDir, "dist", "cursor");

  try {
    assertCursorPathSafe(cursorRoot, cursorRoot, fsImpl);
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }

  const result = runConfigureImpl({
    sourceDir,
    target: "cursor",
    outDir,
    validate: args.validate,
  });
  if (result.validation?.stdout) stdout.write(result.validation.stdout);
  if (result.validation?.stderr) stderr.write(result.validation.stderr);
  if (result.exitCode !== 0) {
    stderr.write("\nbuild/validation failed; nothing installed\n");
    return result.exitCode || 1;
  }

  stdout.write(`install-cursor -> ${cursorRoot}${args.dryRun ? " (dry-run)" : ""}\n`);

  if (args.dryRun) {
    stdout.write("dry-run: no files written\n");
    return 0;
  }

  // Re-check immediately before any write (closes TOCTOU vs the pre-configure check).
  try {
    assertCursorPathSafe(cursorRoot, cursorRoot, fsImpl);
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }

  try {
    const syncResult = syncTree(
      outDir,
      cursorRoot,
      fsImpl,
      { updated: [], unchanged: [] },
      new Set(["hooks.json"]),
      cursorRoot,
    );
    installHooks(outDir, cursorRoot, { fs: fsImpl, dryRun: false });
    const binaryDest = path.join(cursorRoot, "scripts", "hooks");
    assertCursorPathSafe(cursorRoot, binaryDest, fsImpl);
    copyBinary(cursorRoot, "cursor", sourceDir, { fs: fsImpl, stdout, stderr });
    stdout.write(`  updated ${syncResult.updated.length}, unchanged ${syncResult.unchanged.length}\n`);
    return 0;
  } catch (error) {
    stderr.write(
      `install-cursor aborted after partial work: ${error.message || error}\n` +
        "re-run setup:cursor after fixing the error; no automatic rollback is performed\n",
    );
    return 1;
  }
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`fatal: ${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  assertCursorPathSafe,
  expandCursorHooksPlaceholder,
  syncTreeByContent,
  installHooksJson,
  main,
};
