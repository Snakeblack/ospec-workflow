"use strict";

// One-shot, idempotent installer for VS Code target. Builds the vscode target,
// copies platform-appropriate hooks binaries, and modifies user's settings.json
// cleanly using fail-closed JSONC merger.
//
// Usage:
//   node scripts/configure/install-vscode.js [--dry-run] [--no-validate] [--with-extras] [--with-sdd|--no-sdd] [--source <sourceRepo>] [--verbose]

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { runConfigure } = require("./cli.js");
const { runEngramStep, withEngramStep } = require("./engram-setup.js");
const { copyBinaryToTree } = require("./install-target.js");
const { renderRuntimeDir, renderSharedDir, runtimeDirValue, sharedDirValue } = require("./shared-dir.js");
const { safeParseJsonc, mutateFs } = require("./install-engine.js");
const { parseSddFlag, previousInstallHasSdd, resolveWithSdd } = require("./sdd-package.js");
const { packagesRow, reportBuildFailure, reporterFor } = require("./install-output.js");

const PHASES = { build: "Generar y validar", prepare: "Preparar el plugin", register: "Registrar en VS Code" };

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

function install(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  const cwd = deps.cwd || process.cwd();
  const fsImpl = deps.fs || fs;
  const reporter = reporterFor("vscode", deps);
  const stdout = reporter.out;
  const stderr = reporter.err;
  const runConfigureImpl = deps.runConfigure || runConfigure;
  const copyBinary = deps.copyBinaryToTree || copyBinaryToTree;

  if (args.error) {
    stderr.write(`uso: install-vscode [--dry-run] [--no-validate] [--with-extras] [--with-sdd|--no-sdd] [--source <sourceRepo>] [--verbose]\n${args.error}\n`);
    return 2;
  }

  const sourceDir = path.resolve(args.source || cwd);
  const outDir = path.join(sourceDir, "dist", "vscode");
  const absPluginPath = path.resolve(outDir);
  reporter.plan(args.dryRun ? [PHASES.build] : [PHASES.build, PHASES.prepare, PHASES.register]);

  // 1. Build the target vscode to dist/vscode. VS Code loads that tree, so the
  //    previous build tells whether the SDD package was installed (E1.6 d2).
  reporter.begin(PHASES.build);
  const withSdd = resolveWithSdd(args, () => previousInstallHasSdd({ agentDirs: [path.join(outDir, "agents")], fs: fsImpl }));
  const result = runConfigureImpl({ sourceDir, target: "vscode", outDir, validate: args.validate, withExtras: Boolean(args.withExtras), withSdd });
  if (reportBuildFailure(reporter, result)) return result.exitCode;
  reporter.set("Destino", absPluginPath);
  reporter.set("Paquetes", packagesRow(args, withSdd));
  // E1.9: VS Code holds dist/vscode open, so the build may have been written in place.
  if (result.publication === "in-place") reporter.set("Publicación", "en su sitio (VS Code tenía dist/vscode abierto)");

  if (args.dryRun) {
    reporter.set("Modo", "simulación (--dry-run): no se ha tocado ningún settings.json");
    return 0;
  }

  reporter.begin(PHASES.prepare);
  // Copy compiler hooks binary if present in release/dist/
  copyBinary(outDir, "vscode", sourceDir, {
    fs: fsImpl,
    stdout: reporter.detail,
    stderr,
    required: false,
  });

  // E0.4 (b): VS Code loads the dist tree itself, so the orchestrator's
  // _shared marker is rendered there and stays rendered.
  renderSharedDir(outDir, sharedDirValue(path.join(absPluginPath, "skills")), fsImpl);
  renderRuntimeDir(outDir, runtimeDirValue(absPluginPath), fsImpl);

  reporter.begin(PHASES.register);
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
        stderr.write(`error: el settings.json de ${file.name} no es válido: ${err.message}\n`);
        hasErrors = true;
      }
    } else if (fsImpl.existsSync(parentDir)) {
      const initialContent = `{\n  "chat.pluginLocations": [\n    ${JSON.stringify(absPluginPath)}\n  ]\n}\n`;
      preparedWrites.push({ file, content: initialContent, updated: true, exists: false });
    }
  }

  if (hasErrors) {
    stderr.write("No se ha modificado ningún settings.json: corrige el fichero inválido y reintenta.\n");
    return 1;
  }

  if (preparedWrites.length === 0) {
    stderr.write(
      "No se encontró el directorio de ajustes de VS Code. Instala VS Code o añade a mano esta ruta a \"chat.pluginLocations\" en settings.json:\n" +
        `  "${absPluginPath}"\n`,
    );
    return 1;
  }

  const states = [];
  for (const writeItem of preparedWrites) {
    if (writeItem.updated) {
      mutateFs(
        "write settings",
        writeItem.file.path,
        () => fsImpl.writeFileSync(writeItem.file.path, writeItem.content, "utf8"),
        { target: "vscode", ...(deps.retryOptions || {}) },
      );
      states.push(`${writeItem.file.name}: ${writeItem.exists ? "actualizado" : "creado"}`);
    } else {
      states.push(`${writeItem.file.name}: ya configurado`);
    }
  }
  reporter.set("settings.json", states.join(" · "));
  reporter.next("Reinicia VS Code para cargar los cambios.");
  return 0;
}

// Optional Engram session memory runs after a successful global install
// (engram-per-target, adr-20261003-001); `--no-engram` turns it off.
const main = withEngramStep("vscode", install, {
  eligible(argv) {
    const args = parseArgs(argv);
    return !args.error && !args.dryRun;
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
  getSettingsPaths,
  parseArgs,
  updateSettingsJsoncPreservingComments,
  main,
};
