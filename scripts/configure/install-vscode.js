"use strict";

// One-shot, idempotent installer for VS Code target. Builds the vscode target,
// copies platform-appropriate hooks binaries, and modifies user's settings.json
// cleanly using fail-closed JSONC merger.
//
// Usage:
//   node scripts/configure/install-vscode.js [--dry-run] [--no-validate] [--source <sourceRepo>]

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { runConfigure } = require("./cli.js");
const { copyBinaryToTree } = require("./install-target.js");
const { mergeJsoncFile } = require("./install-engine.js");

function getSettingsPaths(deps = {}) {
  const home = deps.homedir ? deps.homedir() : os.homedir();
  const env = deps.env || process.env;
  const platform = deps.platform || process.platform;
  const paths = [];

  if (platform === "win32") {
    const appData = env.APPDATA;
    if (appData) {
      paths.push({
        name: "VS Code",
        path: path.join(appData, "Code", "User", "settings.json"),
      });
      paths.push({
        name: "VS Code Insiders",
        path: path.join(appData, "Code - Insiders", "User", "settings.json"),
      });
    }
  } else if (platform === "darwin") {
    paths.push({
      name: "VS Code",
      path: path.join(home, "Library", "Application Support", "Code", "User", "settings.json"),
    });
    paths.push({
      name: "VS Code Insiders",
      path: path.join(home, "Library", "Application Support", "Code - Insiders", "User", "settings.json"),
    });
  } else {
    // Linux
    paths.push({
      name: "VS Code",
      path: path.join(home, ".config", "Code", "User", "settings.json"),
    });
    paths.push({
      name: "VS Code Insiders",
      path: path.join(home, ".config", "Code - Insiders", "User", "settings.json"),
    });
  }
  return paths;
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

function main(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  const cwd = deps.cwd || process.cwd();
  const fsImpl = deps.fs || fs;
  const stdout = deps.stdout || process.stdout;
  const stderr = deps.stderr || process.stderr;
  const runConfigureImpl = deps.runConfigure || runConfigure;
  const copyBinary = deps.copyBinaryToTree || copyBinaryToTree;

  if (args.error) {
    stderr.write(`usage: install-vscode [--dry-run] [--no-validate] [--source <sourceRepo>]\n${args.error}\n`);
    return 2;
  }

  const sourceDir = path.resolve(args.source || cwd);
  const outDir = path.join(sourceDir, "dist", "vscode");

  // 1. Build the target vscode to dist/vscode
  const result = runConfigureImpl({ sourceDir, target: "vscode", outDir, validate: args.validate });
  if (result.validation?.stdout) stdout.write(result.validation.stdout);
  if (result.validation?.stderr) stderr.write(result.validation.stderr);
  if (result.exitCode !== 0) {
    stderr.write("\nbuild/validation failed; aborting vscode install\n");
    return result.exitCode || 1;
  }

  // Copy compiler hooks binary if present in release/dist/
  copyBinary(outDir, "vscode", sourceDir, {
    fs: fsImpl,
    stdout,
    stderr,
    required: false,
  });

  const absPluginPath = path.resolve(outDir);
  stdout.write(`\nConfiguring VS Code to load plugin from: ${absPluginPath}${args.dryRun ? " (dry-run)" : ""}\n`);

  if (args.dryRun) {
    stdout.write("dry-run: no files modified\n");
    return 0;
  }

  const settingsFiles = getSettingsPaths(deps);
  let configuredAny = false;

  for (const file of settingsFiles) {
    if (fsImpl.existsSync(file.path)) {
      try {
        mergeJsoncFile(
          file.path,
          (config) => {
            const next = { ...config };
            next["chat.pluginLocations"] = next["chat.pluginLocations"] || [];
            if (!Array.isArray(next["chat.pluginLocations"])) {
              next["chat.pluginLocations"] = [next["chat.pluginLocations"]];
            }
            if (!next["chat.pluginLocations"].includes(absPluginPath)) {
              next["chat.pluginLocations"].push(absPluginPath);
            }
            return next;
          },
          { fs: fsImpl },
        );
        stdout.write(`  + Updated ${file.name} settings.json\n`);
        configuredAny = true;
      } catch (err) {
        stderr.write(`  [warn] Failed to parse/update ${file.name} settings.json: ${err.message}\n`);
      }
    }
  }

  if (!configuredAny) {
    stdout.write(
      `\nTo complete setup, please configure your VS Code settings.json manually:\n` +
        `Add the following path to "chat.pluginLocations":\n` +
        `  "${absPluginPath}"\n`,
    );
  } else {
    stdout.write("\nDone. VS Code setup completed successfully. Restart VS Code to apply.\n");
  }
  return 0;
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
  getSettingsPaths,
  parseArgs,
  main,
};
