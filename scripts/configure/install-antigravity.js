"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { runConfigure } = require("./cli.js");
const { runEngramStep, withEngramStep } = require("./engram-setup.js");
const { copyBinaryToTree } = require("./install-target.js");
const { renderRuntimeDir, renderSharedDir } = require("./shared-dir.js");
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
const { parseSddFlag, previousInstallHasSdd, resolveWithSdd } = require("./sdd-package.js");
const { DRY_RUN_ROW, PHASE_BUILD, PHASE_FILES, filesRow, packagesRow, reportAborted, reportBuildFailure, reportModels, reporterFor, restartHint } = require("./install-output.js");
const { commandsFromSourceMcp, warnIfUvxMissing } = require("./mcp-prereqs.js");

const PLUGIN_SUBDIR = path.join("plugins", "ospec-workflow");
const WORKSPACE_PLUGIN_REL = ".agents/plugins/ospec-workflow";

function usage() {
  return "uso: install-antigravity [--dry-run] [--no-validate] [--with-extras] [--with-sdd|--no-sdd] [--source <sourceRepo>] [--dest <targetDir> | --workspace <repoDir>] [--out <buildDir>] [--model <tier>=<modelo>] [--verbose]\n";
}

function parseArgs(argv) {
  const args = { dryRun: false, validate: true, source: undefined, dest: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--no-validate") args.validate = false;
    else if (arg === "--with-extras") args.withExtras = true;
    else if (parseSddFlag(arg, args)) {
      if (args.error) return args;
    } else if (arg === "--source") {
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
    } else if (arg === "--workspace") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) return { ...args, error: "missing value for --workspace" };
      args.workspace = next;
      i += 1;
    } else if (arg === "--out") {
      // The build directory, by default <source>/dist/antigravity.
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args.error = "missing value for --out";
        return args;
      }
      args.out = next;
      i += 1;
    } else {
      args.error = `unknown argument: ${arg}`;
      return args;
    }
  }
  if (args.dest && args.workspace) {
    args.error = "--dest and --workspace cannot be combined";
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

function resolveInstallTargets(args, deps = {}) {
  if (args.dest) {
    return [{ pluginRoot: path.resolve(args.dest), legacyRoot: null, journalRoot: path.resolve(args.dest), relativePosix: null }];
  }
  if (args.workspace) {
    const workspaceRoot = path.resolve(deps.cwd || process.cwd(), args.workspace);
    return [{
      pluginRoot: path.join(workspaceRoot, ".agents", "plugins", "ospec-workflow"),
      legacyRoot: null,
      journalRoot: workspaceRoot,
      relativePosix: WORKSPACE_PLUGIN_REL,
    }];
  }
  return getDestinationRoots(undefined, deps).map((configRoot) => ({
    pluginRoot: path.join(configRoot, PLUGIN_SUBDIR),
    legacyRoot: configRoot,
    journalRoot: configRoot,
    relativePosix: null,
  }));
}

function migrateLegacyAntigravityInstall(legacyRoot, fsImpl, journal, retryOptions) {
  const legacyManifest = readOwnershipManifest(legacyRoot, fsImpl);
  if (!legacyManifest || (legacyManifest.target && legacyManifest.target !== "antigravity") || !Array.isArray(legacyManifest.files)) return { deleted: [] };
  const legacyFiles = new Set(legacyManifest.files.map((file) => toPosix(file)));
  const deleted = [];
  const legacyHooksPath = path.join(legacyRoot, "hooks.json");
  if (fsImpl.existsSync(legacyHooksPath)) {
    let parsed;
    try { parsed = JSON.parse(fsImpl.readFileSync(legacyHooksPath, "utf8")); }
    catch (error) { throw new Error(`Failed to parse legacy hooks.json at ${legacyHooksPath}: ${error.message}`); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`Failed to parse legacy hooks.json at ${legacyHooksPath}: expected JSON object`);
    if (Object.keys(parsed).some((key) => key.startsWith("ospec-"))) {
      assertPathSafe(legacyRoot, legacyHooksPath, fsImpl);
      if (journal) journal.capture(legacyHooksPath);
      const remaining = Object.fromEntries(Object.entries(parsed).filter(([key]) => !key.startsWith("ospec-")));
      if (Object.keys(remaining).length > 0) mutateFs("write legacy hooks.json", legacyHooksPath, () => fsImpl.writeFileSync(legacyHooksPath, JSON.stringify(remaining, null, 2) + "\n", "utf8"), retryOptions);
      else if (legacyFiles.has("hooks.json")) { mutateFs("remove legacy hooks.json", legacyHooksPath, () => fsImpl.rmSync(legacyHooksPath, { force: true }), retryOptions); deleted.push("hooks.json"); }
      else mutateFs("write legacy hooks.json", legacyHooksPath, () => fsImpl.writeFileSync(legacyHooksPath, "{}\n", "utf8"), retryOptions);
    }
  }
  const filesToPrune = [...legacyFiles].filter((file) => file !== "hooks.json" && file !== MANIFEST_FILENAME && file !== "plugins/ospec-workflow" && !file.startsWith("plugins/ospec-workflow/"));
  const pruned = pruneStaleFiles(legacyRoot, { files: filesToPrune }, [], fsImpl, journal, retryOptions);
  const legacyManifestPath = path.join(legacyRoot, MANIFEST_FILENAME);
  assertPathSafe(legacyRoot, legacyManifestPath, fsImpl);
  if (journal) journal.capture(legacyManifestPath);
  mutateFs("remove legacy manifest", legacyManifestPath, () => fsImpl.rmSync(legacyManifestPath, { force: true }), retryOptions);
  return { deleted: [...deleted, ...pruned.deleted] };
}

function installAntigravityRoot(target, outDir, sourceDir, args, deps) {
  const { pluginRoot, legacyRoot, journalRoot, relativePosix } = typeof target === "string"
    ? { pluginRoot: target, legacyRoot: null, journalRoot: target, relativePosix: null }
    : target;
  const fsImpl = deps.fs || fs;
  const reporter = reporterFor("antigravity", deps);
  const stderr = reporter.err;
  const copyBinary = deps.copyBinaryToTree || copyBinaryToTree;
  const validateInstalled = deps.validateInstalled || validateInstalledAntigravity;

  try {
    assertPathSafe(journalRoot, journalRoot, fsImpl);
    assertPathSafe(journalRoot, pluginRoot, fsImpl);
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }

  if (args.dryRun) return 0;

  let journal = null;
  try {
    const retryOptions = { target: "antigravity", ...(deps.retryOptions || {}) };
    journal = createRollbackJournal(journalRoot, fsImpl, retryOptions);
    if (journalRoot !== pluginRoot) {
      for (let dir = path.dirname(pluginRoot); path.resolve(dir) !== path.resolve(journalRoot); dir = path.dirname(dir)) {
        journal.captureDirectory(dir);
      }
    }
    const previousManifest = readOwnershipManifest(pluginRoot, fsImpl);

    copyBinary(outDir, "antigravity", sourceDir, {
      fs: fsImpl,
      stdout: reporter.detail,
      stderr,
      required: false,
    });

    // E0.4 (b) / E1.6 (a) / E1.45: workspace installs keep portable relative
    // paths under `.agents/plugins/ospec-workflow`; global/dest installs render
    // the host path (Windows drive slashes for a WSL root).
    const pluginRootPosix = relativePosix || getHooksRootPosix(pluginRoot);
    const shared = renderSharedDir(outDir, `${pluginRootPosix}/skills/_shared`, fsImpl);
    const hostPlatform = !relativePosix && /^[A-Za-z]:\//.test(pluginRootPosix) ? "win32" : deps.platform || process.platform;
    const runtime = renderRuntimeDir(outDir, pluginRootPosix, fsImpl, { platform: hostPlatform });
    let syncResult;
    try {
      syncResult = syncTargetTree(
        outDir,
        pluginRoot,
        fsImpl,
        { updated: [], unchanged: [], ownedFiles: [] },
        new Set(),
        journalRoot,
        journal,
        "",
        retryOptions,
      );
    } finally {
      // Last rendered, first restored: one file can carry both markers.
      runtime.restore();
      shared.restore();
    }

    const allOwned = Array.from(new Set([...syncResult.ownedFiles, MANIFEST_FILENAME]));
    const pruneResult = pruneStaleFiles(pluginRoot, previousManifest, allOwned, fsImpl, journal, retryOptions);

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
    writeOwnershipManifest(pluginRoot, manifest, fsImpl, journal, retryOptions);

    const installedValidation = validateInstalled(pluginRoot, { fs: fsImpl });
    if (installedValidation.errors.length > 0) {
      throw new Error(`installed Antigravity validation failed: ${installedValidation.errors.join("; ")}`);
    }

    const legacyPruned = legacyRoot
      ? migrateLegacyAntigravityInstall(legacyRoot, fsImpl, journal, retryOptions)
      : { deleted: [] };

    const counts = deps.counts || { updated: 0, unchanged: 0, pruned: 0 };
    counts.updated += syncResult.updated.length;
    counts.unchanged += syncResult.unchanged.length;
    counts.pruned += pruneResult.deleted.length + legacyPruned.deleted.length;
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
    reportAborted(reporter, error, rollbackError);
    return 1;
  }
}

function install(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  const cwd = deps.cwd || process.cwd();
  const reporter = reporterFor("antigravity", deps);
  const stderr = reporter.err;
  const runConfigureImpl = deps.runConfigure || runConfigure;

  if (args.error) {
    stderr.write(`${usage()}${args.error}\n`);
    return 2;
  }

  const sourceDir = path.resolve(args.source || deps.sourceDir || cwd);
  const outDir = args.out ? path.resolve(cwd, args.out) : deps.outDir || path.join(sourceDir, "dist", "antigravity");
  const targets = resolveInstallTargets(args, deps);
  const manifestRoots = targets.flatMap((t) => (t.legacyRoot ? [t.pluginRoot, t.legacyRoot] : [t.pluginRoot]));

  reporter.plan(args.dryRun ? [PHASE_BUILD] : [PHASE_BUILD, PHASE_FILES]);
  reporter.begin(PHASE_BUILD);
  const withSdd = resolveWithSdd(args, () => previousInstallHasSdd({ manifestRoots, fs: deps.fs || fs }));
  const result = runConfigureImpl({
    sourceDir,
    target: "antigravity",
    outDir,
    validate: args.validate,
    withExtras: Boolean(args.withExtras),
    withSdd,
    userModels: deps.models?.userModels,
  });
  if (reportBuildFailure(reporter, result)) return result.exitCode || 1;
  if (deps.models) reportModels(reporter, deps.models, "antigravity");
  reporter.set("Destino", targets.map((t) => t.pluginRoot).join(" · "));
  reporter.set("Paquetes", packagesRow(args, withSdd));
  if (args.dryRun) {
    reporter.set("Modo", DRY_RUN_ROW);
    return 0;
  }

  reporter.begin(PHASE_FILES);
  const counts = { updated: 0, unchanged: 0, pruned: 0 };
  let exitCode = 0;
  for (const target of targets) {
    const code = installAntigravityRoot(target, outDir, sourceDir, args, { ...deps, reporter, counts });
    if (code !== 0) {
      exitCode = code;
    }
  }
  if (exitCode === 0) {
    reporter.set("Ficheros", filesRow(counts));
    restartHint(reporter);
    warnIfUvxMissing(commandsFromSourceMcp(sourceDir, { fs: deps.fs }), { stderr, spawnSync: deps.spawnSync });
  }
  return exitCode;
}

// Optional Engram session memory runs after a successful global install
// (engram-per-target, adr-20261003-001); `--no-engram` turns it off.
const main = withEngramStep("antigravity", install, {
  eligible(argv) {
    const args = parseArgs(argv);
    return !args.error && !args.dryRun && !args.dest && !args.workspace;
  },
});

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2), { engramStep: runEngramStep });
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
