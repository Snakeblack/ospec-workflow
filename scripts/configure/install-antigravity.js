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
  withTransientFsRetries,
  mutateFs,
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

function getHooksRootPosix(targetDir) {
  let posixPath = toPosix(targetDir);
  const winMntMatch = posixPath.match(/^[a-zA-Z]:\/mnt\/([a-zA-Z])\/(.*)$/);
  if (winMntMatch) {
    return `${winMntMatch[1].toUpperCase()}:/${winMntMatch[2]}`;
  }
  const wslMatch = posixPath.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (wslMatch) {
    const drive = wslMatch[1].toUpperCase();
    const rest = wslMatch[2];
    return `${drive}:/${rest}`;
  }
  return posixPath;
}

function getDestinationRoots(argsDest, deps = {}) {
  const fsImpl = deps.fs || fs;
  const homedir = deps.homedir || os.homedir;
  const env = deps.env || process.env;
  const platform = deps.platform || process.platform;
  const pathImpl = deps.path || (platform === "linux" ? path.posix : (platform === "win32" ? path.win32 : path));

  if (argsDest) {
    return [pathImpl.resolve(argsDest)];
  }

  const roots = [];
  const primaryRoot = pathImpl.resolve(pathImpl.join(homedir(), ".gemini", "config"));
  roots.push(primaryRoot);

  // If in WSL, detect Windows user .gemini/config
  const isWsl =
    platform === "linux" &&
    (Boolean(env.WSL_DISTRO_NAME) ||
      Boolean(env.WSL_INTEROP) ||
      (typeof fsImpl.existsSync === "function" &&
        fsImpl.existsSync("/proc/version") &&
        fsImpl.readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft")));

  if (isWsl) {
    const candidateUsers = new Set();
    if (env.USER) candidateUsers.add(env.USER);
    if (env.LOGNAME) candidateUsers.add(env.LOGNAME);

    const mntCUsers = "/mnt/c/Users";
    if (typeof fsImpl.existsSync === "function" && fsImpl.existsSync(mntCUsers)) {
      try {
        const entries = fsImpl.readdirSync(mntCUsers);
        for (const entry of entries) {
          if (entry !== "Public" && entry !== "Default" && entry !== "All Users") {
            candidateUsers.add(entry);
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    for (const user of candidateUsers) {
      const winConfigDir = pathImpl.join("/mnt/c/Users", user, ".gemini", "config");
      const winGeminiDir = pathImpl.join("/mnt/c/Users", user, ".gemini");
      if (
        typeof fsImpl.existsSync === "function" &&
        (fsImpl.existsSync(winConfigDir) || fsImpl.existsSync(winGeminiDir))
      ) {
        const resolvedWin = pathImpl.resolve(winConfigDir);
        if (!roots.includes(resolvedWin)) {
          roots.push(resolvedWin);
        }
      }
    }
  }

  return roots;
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
    deps.antigravityRootPosix || getHooksRootPosix(antigravityRoot);
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
  mutateFs("mkdir", antigravityRoot, () => fsImpl.mkdirSync(antigravityRoot, { recursive: true }), deps.retryOptions);
  mutateFs("write hooks.json", destPath, () => fsImpl.writeFileSync(destPath, JSON.stringify(merged, null, 2) + "\n", "utf8"), deps.retryOptions);
}

function installAntigravityRoot(antigravityRoot, outDir, sourceDir, args, deps) {
  const fsImpl = deps.fs || fs;
  const stdout = deps.stdout || process.stdout;
  const stderr = deps.stderr || process.stderr;
  const copyBinary = deps.copyBinaryToTree || copyBinaryToTree;
  const validateInstalled = deps.validateInstalled || validateInstalledAntigravity;

  try {
    assertPathSafe(antigravityRoot, antigravityRoot, fsImpl);
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }

  stdout.write(`install-antigravity -> ${antigravityRoot}${args.dryRun ? " (dry-run)" : ""}\n`);

  if (args.dryRun) {
    stdout.write("dry-run: no files written\n");
    return 0;
  }

  let journal = null;
  try {
    const retryOptions = { target: "antigravity", ...(deps.retryOptions || {}) };
    journal = createRollbackJournal(antigravityRoot, fsImpl, retryOptions);
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
      "",
      retryOptions,
    );

    const antigravityRootPosix = getHooksRootPosix(antigravityRoot);
    installHooksJson(outDir, antigravityRoot, {
      fs: fsImpl,
      dryRun: false,
      journal,
      antigravityRootPosix,
      retryOptions,
    });

    const allOwned = Array.from(new Set([...syncResult.ownedFiles, "hooks.json", MANIFEST_FILENAME]));
    const pruneResult = pruneStaleFiles(antigravityRoot, previousManifest, allOwned, fsImpl, journal, retryOptions);

    let version = "0.0.0";
    if (fsImpl.existsSync(path.join(sourceDir, "package.json"))) {
      version = JSON.parse(fsImpl.readFileSync(path.join(sourceDir, "package.json"), "utf8")).version;
    }
    const manifest = {
      version,
      target: "antigravity",
      installedAt: new Date().toISOString(),
      files: allOwned,
    };
    writeOwnershipManifest(antigravityRoot, manifest, fsImpl, journal, retryOptions);

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

function main(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  const cwd = deps.cwd || process.cwd();
  const stdout = deps.stdout || process.stdout;
  const stderr = deps.stderr || process.stderr;
  const runConfigureImpl = deps.runConfigure || runConfigure;

  if (args.error) {
    stderr.write(`${usage()}${args.error}\n`);
    return 2;
  }

  const sourceDir = path.resolve(args.source || cwd);
  const outDir = path.join(sourceDir, "dist", "antigravity");
  const targetRoots = getDestinationRoots(args.dest, deps);

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

  let exitCode = 0;
  for (const root of targetRoots) {
    const code = installAntigravityRoot(root, outDir, sourceDir, args, deps);
    if (code !== 0) {
      exitCode = code;
    }
  }
  return exitCode;
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
  getHooksRootPosix,
  getDestinationRoots,
  renderHooksValue,
  installHooksJson,
  main,
};
