"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runConfigure } = require("./cli.js");
const { copyBinaryToTree } = require("./install-target.js");
const { validateInstalled: validateInstalledCursor } = require("./validate-cursor.js");
const {
  MANIFEST_FILENAME,
  toPosix,
  readOwnershipManifest,
  writeOwnershipManifest,
  pruneStaleFiles,
  mergeHooksDoc,
  mergeJsonFile,
  createRollbackJournal: createCommonRollbackJournal,
  mutateFs,
} = require("./install-engine.js");

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
  journal = null,
  retryOptions = {},
) {
  // Per-destination safety (Codex parity): refuse nested symlinks that escape root.
  assertCursorPathSafe(cursorRoot, destDir, fsImpl);
  if (journal) journal.captureDirectory(destDir);
  mutateFs("mkdir", destDir, () => fsImpl.mkdirSync(destDir, { recursive: true }), retryOptions);
  for (const entry of fsImpl.readdirSync(sourceDir, { withFileTypes: true })) {
    if (skipNames.has(entry.name)) {
      continue;
    }
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      syncTreeByContent(source, destination, fsImpl, result, skipNames, cursorRoot, journal, retryOptions);
    } else if (entry.isFile()) {
      assertCursorPathSafe(cursorRoot, destination, fsImpl);
      if (filesMatch(source, destination, fsImpl)) {
        result.unchanged.push(destination);
      } else {
        if (journal) journal.capture(destination);
        mutateFs("mkdir", path.dirname(destination), () => fsImpl.mkdirSync(path.dirname(destination), { recursive: true }), retryOptions);
        mutateFs("copy", destination, () => fsImpl.copyFileSync(source, destination), retryOptions);
        result.updated.push(destination);
      }
    }
  }
  return result;
}

function quoteCursorHookPath(value) {
  const escaped = String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
  return `"${escaped}"`;
}

// Expand __OSPEC_CURSOR_ROOT__ to an absolute POSIX-slashed cursor home.
// Always quote the expanded path so metacharacters in $HOME cannot inject shell.
function expandCursorHooksPlaceholder(command, cursorRootPosix) {
  if (typeof command !== "string" || !command.includes("__OSPEC_CURSOR_ROOT__")) {
    return command;
  }
  return command.replace(/__OSPEC_CURSOR_ROOT__(\/[^\s"]*)?/g, (_match, rest = "") => {
    const full = cursorRootPosix + (rest || "");
    return quoteCursorHookPath(full);
  });
}

function createRollbackJournal(cursorRoot, fsImpl = fs, retryOptions = {}) {
  return createCommonRollbackJournal(cursorRoot, fsImpl, { target: "cursor", ...retryOptions });
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

// Cursor's generic preToolUse / subagentStart only accept allow|deny. Mirror the
// PreToolUse launcher commands onto those events at install time so Task/MCP
// never run without the ask→allow adapter in ospec-hooks-launch.
function ensureCursorGenericHookEvents(hooksDoc) {
  if (!hooksDoc || typeof hooksDoc !== "object" || Array.isArray(hooksDoc)) {
    return hooksDoc;
  }
  const hooks = hooksDoc.hooks;
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) {
    return hooksDoc;
  }
  const next = { ...hooksDoc, hooks: { ...hooks } };
  const shellHooks = next.hooks.beforeShellExecution;
  if (Array.isArray(shellHooks) && shellHooks.length > 0) {
    if (!Array.isArray(next.hooks.preToolUse) || next.hooks.preToolUse.length === 0) {
      next.hooks.preToolUse = shellHooks;
    }
    if (!Array.isArray(next.hooks.subagentStart) || next.hooks.subagentStart.length === 0) {
      next.hooks.subagentStart = shellHooks;
    }
  }
  const editHooks = next.hooks.afterFileEdit;
  if (Array.isArray(editHooks) && editHooks.length > 0) {
    if (!Array.isArray(next.hooks.preCompact) || next.hooks.preCompact.length === 0) {
      next.hooks.preCompact = editHooks;
    }
  }
  return next;
}

function sanitizeCursorMcpServers(mcpServers, env = process.env) {
  if (!mcpServers || typeof mcpServers !== "object") return {};
  const result = {};
  for (const [name, server] of Object.entries(mcpServers)) {
    if (!server || typeof server !== "object") {
      result[name] = server;
      continue;
    }
    const cleanServer = { ...server };
    if (cleanServer.env && typeof cleanServer.env === "object") {
      const cleanEnv = {};
      for (const [key, val] of Object.entries(cleanServer.env)) {
        if (typeof val === "string") {
          const match = val.match(/^\$\{input:([A-Za-z0-9_]+)\}$/);
          if (match) {
            const varName = match[1];
            if (env && env[varName]) {
              cleanEnv[key] = env[varName];
            }
          } else {
            cleanEnv[key] = val;
          }
        } else {
          cleanEnv[key] = val;
        }
      }
      cleanServer.env = cleanEnv;
    }
    result[name] = cleanServer;
  }
  return result;
}

function installMcpJson(sourceDir, cursorRoot, deps = {}) {
  const fsImpl = deps.fs || fs;
  const dryRun = Boolean(deps.dryRun);
  const env = deps.env || process.env;
  const mcpSourcePath = path.join(sourceDir, ".mcp.json");
  if (!fsImpl.existsSync(mcpSourcePath)) {
    return;
  }
  const sourceMcp = JSON.parse(fsImpl.readFileSync(mcpSourcePath, "utf8"));
  const destPath = path.join(cursorRoot, "mcp.json");
  if (dryRun) return;

  const sanitizedServers = sanitizeCursorMcpServers(sourceMcp?.mcpServers, env);

  assertCursorPathSafe(cursorRoot, destPath, fsImpl);
  mergeJsonFile(
    destPath,
    (existingDoc) => {
      const next = { ...existingDoc };
      next.mcpServers = { ...(existingDoc?.mcpServers || {}), ...sanitizedServers };
      return next;
    },
    { fs: fsImpl, journal: deps.journal, retryOptions: { target: "cursor", ...(deps.retryOptions || {}) } },
  );
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
  const withGenericEvents = ensureCursorGenericHookEvents(generated);
  const rendered = renderHooksValue(withGenericEvents, cursorRootPosix);
  const destPath = path.join(cursorRoot, "hooks.json");
  if (dryRun) {
    return;
  }
  assertCursorPathSafe(cursorRoot, destPath, fsImpl);
  if (deps.journal) deps.journal.captureDirectory(cursorRoot);
  if (deps.journal) deps.journal.capture(destPath);

  let existing = {};
  if (fsImpl.existsSync(destPath)) {
    try {
      existing = JSON.parse(fsImpl.readFileSync(destPath, "utf8"));
    } catch (error) {
      throw new Error(`Failed to parse existing hooks.json at ${destPath}: ${error.message}`);
    }
  }

  const merged = mergeHooksDoc(existing, rendered, "cursor");
  const retryOptions = { target: "cursor", ...(deps.retryOptions || {}) };
  mutateFs("mkdir", cursorRoot, () => fsImpl.mkdirSync(cursorRoot, { recursive: true }), retryOptions);
  const content = JSON.stringify(merged, null, 2) + "\n";
  mutateFs("write hooks", destPath, () => fsImpl.writeFileSync(destPath, content), retryOptions);
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
  const installMcp = deps.installMcpJson || installMcpJson;
  const validateInstalled = deps.validateInstalled || validateInstalledCursor;

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

  let journal = null;
  try {
    const retryOptions = { target: "cursor", ...(deps.retryOptions || {}) };
    journal = createRollbackJournal(cursorRoot, fsImpl, retryOptions);
    const previousManifest = readOwnershipManifest(cursorRoot, fsImpl);

    // Cursor requires its native hook binary. Stage it in the generated tree
    // before touching the home directory so absence/copy failure is fail-closed.
    copyBinary(outDir, "cursor", sourceDir, {
      fs: fsImpl,
      stdout,
      stderr,
      required: true,
    });
    const syncResult = syncTree(
      outDir,
      cursorRoot,
      fsImpl,
      { updated: [], unchanged: [] },
      new Set(["hooks.json"]),
      cursorRoot,
      journal,
      retryOptions,
    );
    installHooks(outDir, cursorRoot, { fs: fsImpl, dryRun: false, journal, retryOptions });
    installMcp(sourceDir, cursorRoot, { fs: fsImpl, dryRun: false, journal, retryOptions });

    const installedValidation = validateInstalled(cursorRoot, { fs: fsImpl });
    if (installedValidation.errors.length > 0) {
      throw new Error(`installed Cursor validation failed: ${installedValidation.errors.join("; ")}`);
    }

    let version = "0.0.0";
    try {
      version = JSON.parse(fsImpl.readFileSync(path.join(sourceDir, "package.json"), "utf8")).version;
    } catch {
      // Test fixtures may omit package.json
    }
    const allOwned = Array.from(
      new Set(
        [...syncResult.updated, ...syncResult.unchanged]
          .map((p) => toPosix(path.relative(cursorRoot, p)))
          .concat(["hooks.json", "mcp.json", MANIFEST_FILENAME]),
      ),
    ).sort();

    const pruneResult = pruneStaleFiles(cursorRoot, previousManifest, allOwned, fsImpl, journal, retryOptions);

    const isIdentical =
      previousManifest &&
      JSON.stringify(previousManifest.files?.slice().sort()) === JSON.stringify(allOwned.slice().sort()) &&
      syncResult.updated.length === 0 &&
      pruneResult.deleted.length === 0;

    const installedAt = isIdentical && previousManifest.installedAt
      ? previousManifest.installedAt
      : new Date().toISOString();

    writeOwnershipManifest(
      cursorRoot,
      { version, target: "cursor", installedAt, files: allOwned },
      fsImpl,
      journal,
      retryOptions,
    );

    stdout.write(
      `  updated ${syncResult.updated.length}, unchanged ${syncResult.unchanged.length}, pruned ${pruneResult.deleted.length}\n`,
    );
    return 0;
  } catch (error) {
    let rollbackError = null;
    if (journal) {
      try {
        journal.rollback();
      } catch (failure) {
        rollbackError = failure;
      }
    }
    stderr.write(
      `install-cursor aborted: ${error.message || error}\n` +
        (rollbackError
          ? `${rollbackError.message || rollbackError}\nmanual recovery may be required\n`
          : "managed Cursor changes were rolled back\n"),
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
  quoteCursorHookPath,
  expandCursorHooksPlaceholder,
  ensureCursorGenericHookEvents,
  createRollbackJournal,
  syncTreeByContent,
  installHooksJson,
  installMcpJson,
  sanitizeCursorMcpServers,
  main,
};
