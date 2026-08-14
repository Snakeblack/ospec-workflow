"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runConfigure } = require("./cli.js");
const { copyBinaryToTree } = require("./install-target.js");
const { validateInstalled: validateInstalledAntigravity } = require("./validate-antigravity.js");
const {
  MANIFEST_FILENAME,
  toPosix,
  assertPathSafe,
  createRollbackJournal,
  readOwnershipManifest,
  writeOwnershipManifest,
  pruneStaleFiles,
  mergeHooksDoc,
  syncTargetTree,
} = require("./install-engine.js");

function usage() {
  return "usage: install-antigravity [--dry-run] [--no-validate] [--source <sourceRepo>] [--dest <targetDir>]\n";
}

function parseArgs(argv) {
  const args = { dryRun: false, validate: true, source: undefined, dest: undefined };
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
    } else if (arg === "--dest") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args.error = "missing value for --dest";
        return args;
      }
      args.dest = next;
      i += 1;
    } else {
      args.error = `unknown argument: ${arg}`;
      return args;
    }
  }
  return args;
}

function renderHooksValue(value, antigravityRootPosix) {
  if (typeof value === "string") {
    return value.replace(/__OSPEC_ANTIGRAVITY_ROOT__/g, antigravityRootPosix);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => renderHooksValue(entry, antigravityRootPosix));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, renderHooksValue(v, antigravityRootPosix)]),
    );
  }
  return value;
}

function installHooksJson(outDir, antigravityRoot, deps = {}) {
  const fsImpl = deps.fs || fs;
  const dryRun = Boolean(deps.dryRun);
  const antigravityRootPosix =
    deps.antigravityRootPosix || toPosix(path.resolve(antigravityRoot));
  const sourcePath = path.join(outDir, "hooks.json");
  if (!fsImpl.existsSync(sourcePath)) {
    throw new Error(`generated hooks.json missing at ${sourcePath}`);
  }
  const generated = JSON.parse(fsImpl.readFileSync(sourcePath, "utf8"));
  const rendered = renderHooksValue(generated, antigravityRootPosix);
  const destPath = path.join(antigravityRoot, "hooks.json");

  if (dryRun) return;

  assertPathSafe(antigravityRoot, destPath, fsImpl);
  if (deps.journal) {
    deps.journal.captureDirectory(antigravityRoot);
    deps.journal.capture(destPath);
  }

  let existing = {};
  if (fsImpl.existsSync(destPath)) {
    try {
      existing = JSON.parse(fsImpl.readFileSync(destPath, "utf8"));
    } catch (error) {
      throw new Error(`Failed to parse existing hooks.json at ${destPath}: ${error.message}`);
    }
  }

  const merged = mergeHooksDoc(existing, rendered, "antigravity");
  fsImpl.mkdirSync(antigravityRoot, { recursive: true });
  fsImpl.writeFileSync(destPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
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
  const validateInstalled = deps.validateInstalled || validateInstalledAntigravity;

  if (args.error) {
    stderr.write(`${usage()}${args.error}\n`);
    return 2;
  }

  const sourceDir = path.resolve(args.source || cwd);
  const antigravityRoot = path.resolve(args.dest || path.join(homedir(), ".gemini", "config"));
  const outDir = path.join(sourceDir, "dist", "antigravity");

  try {
    assertPathSafe(antigravityRoot, antigravityRoot, fsImpl);
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }

  const result = runConfigureImpl({
    sourceDir,
    target: "antigravity",
    outDir,
    validate: args.validate,
  });
  if (result.validation?.stdout) stdout.write(result.validation.stdout);
  if (result.validation?.stderr) stderr.write(result.validation.stderr);
  if (result.exitCode !== 0) {
    stderr.write("\nbuild/validation failed; nothing installed\n");
    return result.exitCode || 1;
  }

  stdout.write(`install-antigravity -> ${antigravityRoot}${args.dryRun ? " (dry-run)" : ""}\n`);

  if (args.dryRun) {
    stdout.write("dry-run: no files written\n");
    return 0;
  }

  let journal = null;
  try {
    journal = createRollbackJournal(antigravityRoot, fsImpl);
    const previousManifest = readOwnershipManifest(antigravityRoot, fsImpl);

    copyBinary(outDir, "antigravity", sourceDir, {
      fs: fsImpl,
      stdout,
      stderr,
      required: false,
    });

    const syncResult = syncTargetTree(
      outDir,
      antigravityRoot,
      fsImpl,
      { updated: [], unchanged: [], ownedFiles: [] },
      new Set(["hooks.json"]),
      antigravityRoot,
      journal,
    );

    installHooksJson(outDir, antigravityRoot, { fs: fsImpl, dryRun: false, journal });

    const allOwned = Array.from(new Set([...syncResult.ownedFiles, "hooks.json", MANIFEST_FILENAME]));
    const pruneResult = pruneStaleFiles(antigravityRoot, previousManifest, allOwned, fsImpl, journal);

    const version = require(path.join(sourceDir, "package.json")).version;
    const manifest = {
      version,
      target: "antigravity",
      installedAt: new Date().toISOString(),
      files: allOwned,
    };
    writeOwnershipManifest(antigravityRoot, manifest, fsImpl, journal);

    const installedValidation = validateInstalled(antigravityRoot, { fs: fsImpl });
    if (installedValidation.errors.length > 0) {
      throw new Error(`installed Antigravity validation failed: ${installedValidation.errors.join("; ")}`);
    }

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
      `install-antigravity aborted: ${error.message || error}\n` +
        (rollbackError
          ? `${rollbackError.message || rollbackError}\nmanual recovery may be required\n`
          : "managed Antigravity changes were rolled back\n"),
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
  renderHooksValue,
  installHooksJson,
  main,
};
