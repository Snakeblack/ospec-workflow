"use strict";

// Idempotent installer to register the ospec-workflow globally under ~/.config/opencode/
// directory. Builds the opencode target, copies agents, commands, instructions,
// plugins, and skills to the global directories, merges the MCP config fail-closed,
// tracks ownership manifest, and prunes stale files.
//
// Usage:
//   node scripts/configure/install-global-opencode.js [--dry-run] [--no-validate] [--source <sourceRepo>] [--dest <targetDir>]

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { runConfigure } = require("./cli.js");
const { copyBinaryToTree } = require("./install-target.js");
const {
  MANIFEST_FILENAME,
  toPosix,
  assertPathSafe,
  createRollbackJournal,
  readOwnershipManifest,
  writeOwnershipManifest,
  pruneStaleFiles,
  mergeJsonFile,
  syncTargetTree,
} = require("./install-engine.js");

function usage() {
  return "usage: install-global-opencode [--dry-run] [--no-validate] [--source <sourceRepo>] [--dest <targetDir>]\n";
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

function main(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  const cwd = deps.cwd || process.cwd();
  const fsImpl = deps.fs || fs;
  const stdout = deps.stdout || process.stdout;
  const stderr = deps.stderr || process.stderr;
  const homedir = deps.homedir || os.homedir;
  const runConfigureImpl = deps.runConfigure || runConfigure;
  const copyBinary = deps.copyBinaryToTree || copyBinaryToTree;

  if (args.error) {
    stderr.write(`${usage()}${args.error}\n`);
    return 2;
  }

  const sourceDir = path.resolve(args.source || cwd);
  const globalDir = path.resolve(args.dest || path.join(homedir(), ".config", "opencode"));
  const outDir = path.join(sourceDir, "dist", "opencode");

  try {
    assertPathSafe(globalDir, globalDir, fsImpl);
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }

  const result = runConfigureImpl({
    sourceDir,
    target: "opencode",
    outDir,
    validate: args.validate,
  });
  if (result.validation?.stdout) stdout.write(result.validation.stdout);
  if (result.validation?.stderr) stderr.write(result.validation.stderr);
  if (result.exitCode !== 0) {
    stderr.write("\nbuild/validation failed; nothing installed\n");
    return result.exitCode || 1;
  }

  stdout.write(`install-global-opencode -> ${globalDir}${args.dryRun ? " (dry-run)" : ""}\n`);

  if (args.dryRun) {
    stdout.write("dry-run: no files written\n");
    return 0;
  }

  let journal = null;
  try {
    journal = createRollbackJournal(globalDir, fsImpl);
    const previousManifest = readOwnershipManifest(globalDir, fsImpl);

    // Enforce required binary presence (fail-closed if missing)
    copyBinary(outDir, "opencode", sourceDir, {
      fs: fsImpl,
      stdout,
      stderr,
      required: true,
    });

    const syncResult = { updated: [], unchanged: [], ownedFiles: [] };

    // Remap .opencode/ subfolders into global root
    const remappings = [
      { src: path.join(outDir, ".opencode", "agents"), dest: path.join(globalDir, "agents"), destRel: "agents" },
      { src: path.join(outDir, ".opencode", "commands"), dest: path.join(globalDir, "commands"), destRel: "commands" },
      { src: path.join(outDir, ".opencode", "instructions"), dest: path.join(globalDir, "instructions"), destRel: "instructions" },
      { src: path.join(outDir, ".opencode", "plugins"), dest: path.join(globalDir, "plugins"), destRel: "plugins" },
      { src: path.join(outDir, "skills"), dest: path.join(globalDir, "skills"), destRel: "skills" },
      { src: path.join(outDir, "scripts"), dest: path.join(globalDir, "scripts"), destRel: "scripts" },
    ];

    if (fsImpl.existsSync(path.join(outDir, "release"))) {
      remappings.push({ src: path.join(outDir, "release"), dest: path.join(globalDir, "release"), destRel: "release" });
    }

    for (const remap of remappings) {
      if (fsImpl.existsSync(remap.src)) {
        syncTargetTree(remap.src, remap.dest, fsImpl, syncResult, new Set(), globalDir, journal, remap.destRel);
      }
    }

    // Merge opencode.json configurations fail-closed
    const globalConfigPath = path.join(globalDir, "opencode.json");
    const generatedConfigPath = path.join(outDir, "opencode.json");
    let generatedConfig = {};
    if (fsImpl.existsSync(generatedConfigPath)) {
      generatedConfig = JSON.parse(fsImpl.readFileSync(generatedConfigPath, "utf8"));
    }

    mergeJsonFile(
      globalConfigPath,
      (existingDoc) => {
        const next = { ...existingDoc };
        next.mcp = { ...(existingDoc.mcp || {}), ...(generatedConfig.mcp || {}) };
        next.instructions = Array.isArray(existingDoc.instructions)
          ? [...existingDoc.instructions]
          : [];
        const globalGlob = "instructions/*.md";
        if (!next.instructions.includes(globalGlob)) {
          next.instructions.push(globalGlob);
        }
        return next;
      },
      { fs: fsImpl, journal },
    );

    let version = "0.0.0";
    try {
      version = JSON.parse(fsImpl.readFileSync(path.join(sourceDir, "package.json"), "utf8")).version;
    } catch {
      // Stub fixtures may lack package.json
    }

    const allOwned = Array.from(new Set([...syncResult.ownedFiles, "opencode.json", MANIFEST_FILENAME])).sort();
    const pruneResult = pruneStaleFiles(globalDir, previousManifest, allOwned, fsImpl, journal);

    const isIdentical =
      previousManifest &&
      JSON.stringify(previousManifest.files?.slice().sort()) === JSON.stringify(allOwned.slice().sort()) &&
      syncResult.updated.length === 0 &&
      pruneResult.deleted.length === 0;

    const installedAt = isIdentical && previousManifest.installedAt
      ? previousManifest.installedAt
      : new Date().toISOString();

    writeOwnershipManifest(
      globalDir,
      { version, target: "opencode", installedAt, files: allOwned },
      fsImpl,
      journal,
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
      `install-global-opencode aborted: ${error.message || error}\n` +
        (rollbackError
          ? `${rollbackError.message || rollbackError}\nmanual recovery may be required\n`
          : "managed OpenCode changes were rolled back\n"),
    );
    return 1;
  }
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`fatal: ${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  main,
};
