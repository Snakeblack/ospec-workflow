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
const { safeParseJsonc, mergeJsoncFile } = require("./install-engine.js");

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

function updateSettingsJsoncPreservingComments(rawContent, pluginPath) {
  // Validate that rawContent is parseable JSONC
  const parsed = safeParseJsonc(rawContent, "settings.json");
  const currentLocations = parsed["chat.pluginLocations"] || [];
  const locationsArray = Array.isArray(currentLocations) ? currentLocations : [currentLocations];
  if (locationsArray.includes(pluginPath)) {
    return { content: rawContent, updated: false };
  }

  let finalContent;

  // Check if chat.pluginLocations is present as a scalar property
  const scalarRegex = /"chat\.pluginLocations"\s*:\s*("[^"]*"|[^,\}\]\s]+)/;
  const scalarMatch = rawContent.match(scalarRegex);
  if (scalarMatch && !rawContent.match(/"chat\.pluginLocations"\s*:\s*\[/)) {
    const existingVal = parsed["chat.pluginLocations"];
    const newLocations = [existingVal, pluginPath].filter(Boolean);
    const newArrayContent = `\n    ${newLocations.map((p) => JSON.stringify(p)).join(",\n    ")}\n  `;
    finalContent = rawContent.replace(scalarRegex, `"chat.pluginLocations": [${newArrayContent}]`);
  } else {
    // If chat.pluginLocations key is present as array in text
    const keyRegex = /"chat\.pluginLocations"\s*:\s*\[([\s\S]*?)\]/;
    const match = rawContent.match(keyRegex);
    if (match) {
      const arrayBody = match[1];
      const cleanBody = arrayBody.trim();
      let newArrayContent;
      if (cleanBody === "") {
        newArrayContent = `\n    ${JSON.stringify(pluginPath)}\n  `;
      } else {
        const bodyWithoutTrailingComma = arrayBody.replace(/,\s*$/, "");
        newArrayContent = `${bodyWithoutTrailingComma.replace(/\s+$/, "")},\n    ${JSON.stringify(pluginPath)}\n  `;
      }
      finalContent = rawContent.replace(keyRegex, `"chat.pluginLocations": [${newArrayContent}]`);
    } else {
      // Otherwise, insert after first opening {
      const firstBrace = rawContent.indexOf("{");
      if (firstBrace !== -1) {
        const prefix = rawContent.slice(0, firstBrace + 1);
        const suffix = rawContent.slice(firstBrace + 1);
        const insertion = `\n  "chat.pluginLocations": [\n    ${JSON.stringify(pluginPath)}\n  ],`;
        finalContent = `${prefix}${insertion}${suffix}`;
      } else {
        finalContent = `{\n  "chat.pluginLocations": [\n    ${JSON.stringify(pluginPath)}\n  ]\n}\n`;
      }
    }
  }

  // Roundtrip validation: ensure modified content is 100% valid JSONC containing the plugin
  const recheck = safeParseJsonc(finalContent, "settings.json (post-edit)");
  const recheckLocations = recheck["chat.pluginLocations"] || [];
  const recheckArray = Array.isArray(recheckLocations) ? recheckLocations : [recheckLocations];
  if (!recheckArray.includes(pluginPath)) {
    throw new Error("Failed to verify updated settings.json: plugin path missing in modified JSONC");
  }

  return { content: finalContent, updated: true };
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
  if (result.exitCode !== 0) {
    stderr.write(`\nVS Code configuration build failed with exit code ${result.exitCode}\n`);
    return result.exitCode;
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
  const preparedWrites = [];
  let hasErrors = false;

  // Preflight validation of all candidate settings files before modifying any file on disk
  for (const file of settingsFiles) {
    const parentDir = path.dirname(file.path);
    if (fsImpl.existsSync(file.path)) {
      try {
        const raw = fsImpl.readFileSync(file.path, "utf8");
        const { content: updatedContent, updated } = updateSettingsJsoncPreservingComments(raw, absPluginPath);
        preparedWrites.push({ file, content: updatedContent, updated, exists: true });
      } catch (err) {
        stderr.write(`  [error] Preflight check failed for ${file.name} settings.json: ${err.message}\n`);
        hasErrors = true;
      }
    } else if (fsImpl.existsSync(parentDir)) {
      const initialContent = `{\n  "chat.pluginLocations": [\n    ${JSON.stringify(absPluginPath)}\n  ]\n}\n`;
      preparedWrites.push({ file, content: initialContent, updated: true, exists: false });
    }
  }

  if (hasErrors) {
    stderr.write("\nVS Code installation failed due to invalid configuration file(s).\n");
    return 1;
  }

  if (preparedWrites.length === 0) {
    stderr.write(
      `\nVS Code settings directory not found on host. Please ensure VS Code is installed or configure settings.json manually:\n` +
        `Add the following path to "chat.pluginLocations":\n` +
        `  "${absPluginPath}"\n`,
    );
    return 1;
  }

  for (const writeItem of preparedWrites) {
    if (writeItem.updated) {
      fsImpl.writeFileSync(writeItem.file.path, writeItem.content, "utf8");
      stdout.write(`  + ${writeItem.exists ? "Updated" : "Created"} ${writeItem.file.name} settings.json\n`);
    } else {
      stdout.write(`  · ${writeItem.file.name} settings.json already configured\n`);
    }
  }

  stdout.write("\nDone. VS Code setup completed successfully. Restart VS Code to apply.\n");
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
  updateSettingsJsoncPreservingComments,
  main,
};
