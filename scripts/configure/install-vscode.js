"use strict";

// One-shot, idempotent installer for VS Code target. Builds the vscode target,
// copy platform-appropriate hooks binaries, and modifies user's settings.json
// to add the plugin location.
//
// Usage:
//   node scripts/configure/install-vscode.js

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { runConfigure } = require("./cli.js");
const { copyBinaryToTree } = require("./install-target.js");

function getSettingsPaths() {
  const home = os.homedir();
  const paths = [];

  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
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
  } else if (process.platform === "darwin") {
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

// Strip block and line comments to safely parse JSONC
function parseJsonc(content) {
  const cleaned = content.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, "$1");
  return JSON.parse(cleaned);
}

function main() {
  const sourceDir = path.resolve(__dirname, "..", "..");
  const outDir = path.join(sourceDir, "dist", "vscode");

  // 1. Build the target vscode to dist/vscode
  const result = runConfigure({ sourceDir, target: "vscode", outDir, validate: true });
  if (result.exitCode !== 0) {
    process.stderr.write("\nBuild/validation failed; aborting vscode install\n");
    process.exitCode = result.exitCode;
    return;
  }

  // Copy compiler hooks binary if present in release/dist/
  copyBinaryToTree(outDir, "vscode", sourceDir);

  const absPluginPath = path.resolve(outDir);
  process.stdout.write(`\nConfiguring VS Code to load plugin from: ${absPluginPath}\n`);

  const settingsFiles = getSettingsPaths();
  let configuredAny = false;

  for (const file of settingsFiles) {
    if (fs.existsSync(file.path)) {
      try {
        const rawContent = fs.readFileSync(file.path, "utf8");
        // Parse current config (stripping comments)
        const config = parseJsonc(rawContent);

        config["chat.pluginLocations"] = config["chat.pluginLocations"] || [];
        if (!Array.isArray(config["chat.pluginLocations"])) {
          config["chat.pluginLocations"] = [config["chat.pluginLocations"]];
        }

        // Add absolute path if not already present
        if (!config["chat.pluginLocations"].includes(absPluginPath)) {
          // Backup original file
          const backupPath = `${file.path}.bak`;
          fs.copyFileSync(file.path, backupPath);
          process.stdout.write(`  + Created backup at ${backupPath}\n`);

          config["chat.pluginLocations"].push(absPluginPath);
          fs.writeFileSync(file.path, JSON.stringify(config, null, 2), "utf8");
          process.stdout.write(`  + Successfully updated ${file.name} settings.json\n`);
        } else {
          process.stdout.write(`  · ${file.name} settings.json already configured.\n`);
        }
        configuredAny = true;
      } catch (err) {
        process.stderr.write(`  [warn] Failed to parse/update ${file.name} settings.json: ${err.message}\n`);
      }
    }
  }

  if (!configuredAny) {
    process.stdout.write(
      `\nTo complete setup, please configure your VS Code settings.json manually:\n` +
      `Add the following path to "chat.pluginLocations":\n` +
      `  "${absPluginPath}"\n`
    );
  } else {
    process.stdout.write("\nDone. VS Code setup completed successfully. Restart VS Code to apply.\n");
  }
}

if (require.main === module) {
  main();
}
