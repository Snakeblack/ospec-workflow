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

const { pathToFileURL } = require("node:url");

const { runConfigure } = require("./cli.js");
const { copyBinaryToTree } = require("./install-target.js");
const { safeParseJsonc, syncTargetTree } = require("./install-engine.js");

const OSPEC_MARKETPLACE = "snakeblack/ospec-workflow";
const OSPEC_PLUGIN_NAME = "ospec-workflow";
const OSPEC_PLUGIN_REL = "github.com/snakeblack/ospec-workflow";

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

function agentPluginHomes(deps = {}) {
  const home = deps.homedir ? deps.homedir() : os.homedir();
  const fsImpl = deps.fs || fs;
  const homes = [{ name: "VS Code", dir: path.join(home, ".vscode", "agent-plugins") }];
  if (fsImpl.existsSync(path.join(home, ".vscode-insiders"))) {
    homes.push({ name: "VS Code Insiders", dir: path.join(home, ".vscode-insiders", "agent-plugins") });
  }
  return homes;
}

function fileURI(absPath) {
  return pathToFileURL(path.resolve(absPath)).href;
}

function isOspecInstalledEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.name === OSPEC_PLUGIN_NAME && entry.marketplace === OSPEC_MARKETPLACE) return true;
  return String(entry.pluginUri || "").toLowerCase().includes("/github.com/snakeblack/ospec-workflow");
}

function upsertInstalledJSON(raw, pluginUri) {
  let doc = { version: 1, installed: [] };
  const trimmed = String(raw || "").trim();
  if (trimmed) {
    doc = JSON.parse(trimmed);
    if (!doc || !Array.isArray(doc.installed)) {
      throw new Error("installed.json inválido: falta installed[]");
    }
  }
  if (!doc.version) doc.version = 1;
  const entry = { pluginUri, marketplace: OSPEC_MARKETPLACE, name: OSPEC_PLUGIN_NAME };
  const idx = doc.installed.findIndex(isOspecInstalledEntry);
  if (idx >= 0) doc.installed[idx] = entry;
  else doc.installed.push(entry);
  return `${JSON.stringify(doc, null, "\t")}\n`;
}

function installIntoAgentPlugins(sourceDir, deps = {}) {
  const fsImpl = deps.fs || fs;
  const homes = agentPluginHomes(deps);
  let dest = "";
  let written = 0;
  for (const home of homes) {
    const pluginDest = path.join(home.dir, ...OSPEC_PLUGIN_REL.split("/"));
    if (typeof fsImpl.rmSync === "function" && fsImpl.existsSync(pluginDest)) {
      fsImpl.rmSync(pluginDest, { recursive: true, force: true });
    }
    fsImpl.mkdirSync(path.dirname(pluginDest), { recursive: true });
    syncTargetTree(sourceDir, pluginDest, fsImpl);
    const manifestPath = path.join(home.dir, "installed.json");
    let raw = "";
    if (fsImpl.existsSync(manifestPath)) {
      raw = fsImpl.readFileSync(manifestPath, "utf8");
    }
    fsImpl.mkdirSync(home.dir, { recursive: true });
    fsImpl.writeFileSync(manifestPath, upsertInstalledJSON(raw, fileURI(pluginDest)), "utf8");
    if (!dest) dest = pluginDest;
    written += 1;
  }
  return { dest, written };
}

function isPluginTree(dir, fsImpl) {
  const markers = [path.join(dir, ".plugin.json"), path.join(dir, "plugin.json")];
  for (const marker of markers) {
    try {
      if (!fsImpl.existsSync(marker)) continue;
      const raw = fsImpl.readFileSync(marker, "utf8");
      if (typeof raw === "string" && raw.includes('"name"')) return true;
    } catch {
      // mock or unreadable marker — treat as not a plugin tree
    }
  }
  return false;
}

function agentsLocation(pluginPath) {
  return String(pluginPath).replace(/\\/g, "/").replace(/\/+$/, "") + "/agents";
}

function locationListIncludes(value, pluginPath) {
  const locationsArray = Array.isArray(value) ? value : value ? [value] : [];
  return locationsArray.includes(pluginPath);
}

function objectHasTruePath(value, agentsPath) {
  const normalized = String(agentsPath).replace(/\\/g, "/");
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).some(
      ([key, enabled]) => enabled === true && String(key).replace(/\\/g, "/") === normalized,
    );
  }
  if (typeof value === "string") {
    return value.replace(/\\/g, "/") === normalized;
  }
  if (Array.isArray(value)) {
    return value.some((item) => String(item).replace(/\\/g, "/") === normalized);
  }
  return false;
}

function uniqueObjectBoolPaths(existing, agentsPath) {
  const out = [];
  const seen = new Set();
  const add = (value) => {
    const normalized = String(value).replace(/\\/g, "/");
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };
  if (typeof existing === "string") add(existing);
  else if (Array.isArray(existing)) existing.forEach(add);
  else if (existing && typeof existing === "object") {
    for (const [key, enabled] of Object.entries(existing)) {
      if (enabled === true) add(key);
    }
  }
  add(agentsPath);
  return out;
}

function formatObjectBoolBody(paths) {
  return `\n    ${paths.map((p) => `${JSON.stringify(p)}: true`).join(",\n    ")}\n  `;
}

function ensurePluginLocations(rawContent, pluginPath) {
  const parsed = safeParseJsonc(rawContent, "settings.json");
  if (locationListIncludes(parsed["chat.pluginLocations"], pluginPath)) {
    return { content: rawContent, updated: false };
  }

  let finalContent;
  const scalarRegex = /"chat\.pluginLocations"\s*:\s*("[^"]*"|[^,\}\]\s]+)/;
  const scalarMatch = rawContent.match(scalarRegex);
  if (scalarMatch && !rawContent.match(/"chat\.pluginLocations"\s*:\s*\[/)) {
    const existingVal = parsed["chat.pluginLocations"];
    const newLocations = [existingVal, pluginPath].filter(Boolean);
    const newArrayContent = `\n    ${newLocations.map((p) => JSON.stringify(p)).join(",\n    ")}\n  `;
    finalContent = rawContent.replace(scalarRegex, `"chat.pluginLocations": [${newArrayContent}]`);
  } else {
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

  const recheck = safeParseJsonc(finalContent, "settings.json (post-edit)");
  if (!locationListIncludes(recheck["chat.pluginLocations"], pluginPath)) {
    throw new Error("Failed to verify updated settings.json: plugin path missing in modified JSONC");
  }
  return { content: finalContent, updated: true };
}

function ensureAgentFilesLocations(rawContent, agentsPath) {
  const parsed = safeParseJsonc(rawContent, "settings.json");
  if (objectHasTruePath(parsed["chat.agentFilesLocations"], agentsPath)) {
    return { content: rawContent, updated: false };
  }

  let finalContent;
  const objectRegex = /"chat\.agentFilesLocations"\s*:\s*\{([\s\S]*?)\}/;
  const arrayRegex = /"chat\.agentFilesLocations"\s*:\s*\[([\s\S]*?)\]/;
  const scalarRegex = /"chat\.agentFilesLocations"\s*:\s*("[^"]*"|[^,\}\]\s]+)/;

  if (objectRegex.test(rawContent) && !/"chat\.agentFilesLocations"\s*:\s*\[/.test(rawContent)) {
    const match = rawContent.match(objectRegex);
    const body = match[1];
    const cleanBody = body.trim();
    let newBody;
    if (cleanBody === "") {
      newBody = `\n    ${JSON.stringify(agentsPath)}: true\n  `;
    } else {
      const bodyWithoutTrailingComma = body.replace(/,\s*$/, "");
      newBody = `${bodyWithoutTrailingComma.replace(/\s+$/, "")},\n    ${JSON.stringify(agentsPath)}: true\n  `;
    }
    finalContent = rawContent.replace(objectRegex, `"chat.agentFilesLocations": {${newBody}}`);
  } else if (scalarRegex.test(rawContent) && !/"chat\.agentFilesLocations"\s*:\s*[\[{]/.test(rawContent)) {
    const paths = uniqueObjectBoolPaths(parsed["chat.agentFilesLocations"], agentsPath);
    finalContent = rawContent.replace(scalarRegex, `"chat.agentFilesLocations": {${formatObjectBoolBody(paths)}}`);
  } else if (arrayRegex.test(rawContent)) {
    const paths = uniqueObjectBoolPaths(parsed["chat.agentFilesLocations"], agentsPath);
    finalContent = rawContent.replace(arrayRegex, `"chat.agentFilesLocations": {${formatObjectBoolBody(paths)}}`);
  } else {
    const firstBrace = rawContent.indexOf("{");
    const insertion = `\n  "chat.agentFilesLocations": {\n    ${JSON.stringify(agentsPath)}: true\n  },`;
    if (firstBrace !== -1) {
      finalContent = `${rawContent.slice(0, firstBrace + 1)}${insertion}${rawContent.slice(firstBrace + 1)}`;
    } else {
      finalContent = `{\n  "chat.agentFilesLocations": {\n    ${JSON.stringify(agentsPath)}: true\n  }\n}\n`;
    }
  }

  const recheck = safeParseJsonc(finalContent, "settings.json (post-edit)");
  if (!objectHasTruePath(recheck["chat.agentFilesLocations"], agentsPath)) {
    throw new Error("Failed to verify updated settings.json: agent files path missing in modified JSONC");
  }
  return { content: finalContent, updated: true };
}

function ensurePluginsEnabled(rawContent) {
  const parsed = safeParseJsonc(rawContent, "settings.json");
  if (parsed["chat.plugins.enabled"] === true) {
    return { content: rawContent, updated: false };
  }

  let finalContent;
  const keyRegex = /"chat\.plugins\.enabled"\s*:\s*(true|false)/;
  if (keyRegex.test(rawContent)) {
    finalContent = rawContent.replace(keyRegex, `"chat.plugins.enabled": true`);
  } else {
    const firstBrace = rawContent.indexOf("{");
    if (firstBrace !== -1) {
      finalContent = `${rawContent.slice(0, firstBrace + 1)}\n  "chat.plugins.enabled": true,${rawContent.slice(firstBrace + 1)}`;
    } else {
      finalContent = `{\n  "chat.plugins.enabled": true\n}\n`;
    }
  }

  const recheck = safeParseJsonc(finalContent, "settings.json (post-edit)");
  if (recheck["chat.plugins.enabled"] !== true) {
    throw new Error("Failed to verify updated settings.json: chat.plugins.enabled is not true");
  }
  return { content: finalContent, updated: true };
}

function ensurePluginsMarketplaces(rawContent, marketplace) {
  const parsed = safeParseJsonc(rawContent, "settings.json");
  const existing = parsed["chat.plugins.marketplaces"];
  if (Array.isArray(existing) && existing.includes(marketplace)) {
    return { content: rawContent, updated: false };
  }
  if (typeof existing === "string" && existing === marketplace) {
    return { content: rawContent, updated: false };
  }

  let finalContent;
  const keyRegex = /"chat\.plugins\.marketplaces"\s*:\s*\[([\s\S]*?)\]/;
  const match = rawContent.match(keyRegex);
  if (match) {
    const arrayBody = match[1];
    const cleanBody = arrayBody.trim();
    let newArrayContent;
    if (cleanBody === "") {
      newArrayContent = `\n    ${JSON.stringify(marketplace)}\n  `;
    } else {
      const bodyWithoutTrailingComma = arrayBody.replace(/,\s*$/, "");
      newArrayContent = `${bodyWithoutTrailingComma.replace(/\s+$/, "")},\n    ${JSON.stringify(marketplace)}\n  `;
    }
    finalContent = rawContent.replace(keyRegex, `"chat.plugins.marketplaces": [${newArrayContent}]`);
  } else {
    const firstBrace = rawContent.indexOf("{");
    if (firstBrace !== -1) {
      const prefix = rawContent.slice(0, firstBrace + 1);
      const suffix = rawContent.slice(firstBrace + 1);
      const insertion = `\n  "chat.plugins.marketplaces": [\n    ${JSON.stringify(marketplace)}\n  ],`;
      finalContent = `${prefix}${insertion}${suffix}`;
    } else {
      finalContent = `{\n  "chat.plugins.marketplaces": [\n    ${JSON.stringify(marketplace)}\n  ]\n}\n`;
    }
  }

  const recheck = safeParseJsonc(finalContent, "settings.json (post-edit)");
  const recheckMarketplaces = recheck["chat.plugins.marketplaces"];
  const recheckArray = Array.isArray(recheckMarketplaces) ? recheckMarketplaces : [recheckMarketplaces];
  if (!recheckArray.includes(marketplace)) {
    throw new Error("Failed to verify updated settings.json: marketplace missing in modified JSONC");
  }
  return { content: finalContent, updated: true };
}

function initialSettingsContent(pluginPath) {
  const agents = agentsLocation(pluginPath);
  return (
    `{\n` +
    `  "chat.plugins.enabled": true,\n` +
    `  "chat.plugins.marketplaces": [\n    ${JSON.stringify(OSPEC_MARKETPLACE)}\n  ],\n` +
    `  "chat.agentFilesLocations": {\n    ${JSON.stringify(agents)}: true\n  }\n` +
    `}\n`
  );
}

function updateSettingsJsoncPreservingComments(rawContent, pluginPath) {
  safeParseJsonc(rawContent, "settings.json");
  const parsed = safeParseJsonc(rawContent, "settings.json");
  let content = rawContent;
  let updated = false;
  if (parsed["chat.pluginLocations"] !== undefined) {
    const plugin = ensurePluginLocations(content, pluginPath);
    content = plugin.content;
    updated = plugin.updated;
  }
  const enabled = ensurePluginsEnabled(content);
  const agents = ensureAgentFilesLocations(enabled.content, agentsLocation(pluginPath));
  const marketplaces = ensurePluginsMarketplaces(agents.content, OSPEC_MARKETPLACE);
  return {
    content: marketplaces.content,
    updated: updated || enabled.updated || agents.updated || marketplaces.updated,
  };
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
  let registerPath = absPluginPath;
  const pluginMarker = isPluginTree(absPluginPath, fsImpl);
  if (!args.dryRun && pluginMarker) {
    const installed = installIntoAgentPlugins(absPluginPath, deps);
    if (installed.dest) {
      registerPath = installed.dest;
    }
  }
  stdout.write(`\nConfiguring VS Code to load plugin from: ${registerPath}${args.dryRun ? " (dry-run)" : ""}\n`);

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
        const { content: updatedContent, updated } = updateSettingsJsoncPreservingComments(raw, registerPath);
        preparedWrites.push({ file, content: updatedContent, updated, exists: true });
      } catch (err) {
        stderr.write(`  [error] Preflight check failed for ${file.name} settings.json: ${err.message}\n`);
        hasErrors = true;
      }
    } else if (fsImpl.existsSync(parentDir)) {
      const initialContent = initialSettingsContent(registerPath);
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
        `Add the following path to "chat.agentFilesLocations" and enable chat.plugins.enabled:\n` +
        `  "${registerPath}"\n`,
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
  ensurePluginsMarketplaces,
  upsertInstalledJSON,
  installIntoAgentPlugins,
  fileURI,
  main,
};
