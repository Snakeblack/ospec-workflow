#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parseRoutingTable } = require("./lib/route-dispatcher.js");
const { validatePhaseTransition } = require("./lib/flow-validator.js");

function readPersistedRouteInfo(changeDir) {
  const statePath = path.join(changeDir, "state.yaml");
  if (!fs.existsSync(statePath)) {
    return { persistedRoute: null, routeSectionPresent: false };
  }
  const state = fs.readFileSync(statePath, "utf8");
  let routeSectionPresent = false;
  let persistedRoute = null;
  const lines = state.split(/\r?\n/);
  let inRouteBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = (line.match(/^\s*/) || [""])[0].length;
    if (indent === 0) {
      inRouteBlock = trimmed.startsWith("route:");
      if (inRouteBlock) routeSectionPresent = true;
    }
    if (inRouteBlock) {
      const match = line.replace(/\s+#.*$/, "").match(/^\s*actual_route:\s*(.+)$/);
      if (match) {
        const value = match[1].trim().replace(/^["']|["']$/g, "");
        if (value.length > 0) persistedRoute = value;
      }
    }
  }
  // Out-of-block actual_route is never authoritative (parity with extractStateRouteInfo).
  // Missing entire route: section remains the legacy pre-policy exception (routeSectionPresent=false).
  return { persistedRoute, routeSectionPresent };
}

function hasChangeLocalSpec(changeDir) {
  const specsDir = path.join(changeDir, "specs");
  if (!fs.existsSync(specsDir)) return false;
  const pending = [specsDir];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(candidate);
      if (entry.isFile() && entry.name === "spec.md") return true;
    }
  }
  return false;
}

/**
 * Resolve plugin/runtime root vs project workspace (parity with route-dispatch-run).
 * projectRoot: --workspace > OSPEC_PROJECT_ROOT > cwd
 * pluginRoot: directory containing scripts/ (parent of this file's dir)
 */
function resolveRoots(options = {}) {
  const argv = Array.isArray(options.argv) ? options.argv : [];
  const env = options.env && typeof options.env === "object" ? options.env : process.env;
  const cwd = options.cwd || process.cwd();
  const scriptDir = options.scriptDir || __dirname;

  let workspaceFlag = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--workspace=")) {
      workspaceFlag = arg.slice("--workspace=".length);
    } else if (arg === "--workspace" && i + 1 < argv.length) {
      workspaceFlag = argv[++i];
    }
  }

  const pluginRoot = path.resolve(scriptDir, "..");
  const projectRoot = path.resolve(
    workspaceFlag || env.OSPEC_PROJECT_ROOT || cwd,
  );
  return { pluginRoot, projectRoot };
}

function positionalArgs(argv) {
  return argv.filter((arg, index, all) => {
    if (arg.startsWith("-")) return false;
    if (index > 0 && (all[index - 1] === "--workspace" || all[index - 1] === "--context")) {
      return false;
    }
    return true;
  });
}

function main(argv = process.argv.slice(2), deps = {}) {
  const log = deps.log || console.log;
  const error = deps.error || console.error;
  const exit = deps.exit || ((code) => process.exit(code));
  const existsSync = deps.existsSync || fs.existsSync;
  const readFileSync = deps.readFileSync || fs.readFileSync;

  const positionals = positionalArgs(argv);
  if (positionals.length < 3) {
    error("Uso: node validate-phase.js <fase> <ruta> <cambio> [--workspace <dir>]");
    return exit(1);
  }
  const [phase, routeName, changeName] = positionals;
  const { pluginRoot, projectRoot } = resolveRoots({
    argv,
    cwd: deps.cwd,
    env: deps.env,
    scriptDir: deps.scriptDir,
  });

  const projectOpenspec = path.join(projectRoot, "openspec");
  const pluginOpenspec = path.join(pluginRoot, "openspec");
  const rootsDiffer = path.resolve(pluginRoot) !== path.resolve(projectRoot);

  // Collapsed global install: openspec only under plugin while project lacks it.
  if (
    rootsDiffer &&
    !existsSync(path.join(projectOpenspec, "config.yaml")) &&
    existsSync(path.join(pluginOpenspec, "config.yaml"))
  ) {
    error(
      "[ERROR DE TRANSICIÓN] Raíces colapsadas: openspec/ del proyecto no está bajo el workspace; " +
        "no se acepta openspec del plugin como autoridad del proyecto.",
    );
    return exit(1);
  }

  const configPath = path.join(projectOpenspec, "config.yaml");
  const changeDir = path.join(projectOpenspec, "changes", changeName);
  const { persistedRoute, routeSectionPresent } = readPersistedRouteInfo(changeDir);

  if (routeSectionPresent && !persistedRoute) {
    error(
      "[ERROR DE TRANSICIÓN] state.yaml declara route: sin actual_route no vacío (missing_actual_route).",
    );
    return exit(1);
  }

  if (persistedRoute && persistedRoute !== routeName) {
    error(
      `\x1b[31m[ERROR DE TRANSICIÓN] La ruta solicitada '${routeName}' no coincide con la ruta persistida '${persistedRoute}' en state.yaml.\x1b[0m`,
    );
    return exit(1);
  }
  const activeRoute = persistedRoute || routeName;
  if (activeRoute === "freeform") return exit(0);
  if (!existsSync(configPath)) {
    error("[ERROR DE TRANSICIÓN] Falta openspec/config.yaml; no se puede validar la ruta.");
    return exit(1);
  }
  let routePhases = [];
  try {
    const routingTable = parseRoutingTable(readFileSync(configPath, "utf8"));
    const matchedRoute = routingTable.find((r) => r.name === activeRoute);
    if (matchedRoute) routePhases = matchedRoute.phases || [];
  } catch (e) {
    error(`[ERROR DE TRANSICIÓN] No se pudo leer openspec/config.yaml: ${e.message}`);
    return exit(1);
  }
  if (routePhases.length === 0) {
    error(
      `[ERROR DE TRANSICIÓN] La ruta ${persistedRoute ? "persistida" : "solicitada"} '${activeRoute}' no está declarada con fases en openspec/config.yaml.`,
    );
    return exit(1);
  }
  const filesPresent = {};
  for (const filename of [
    "proposal.md",
    "proposal-lite.md",
    "design.md",
    "tasks.md",
    "apply-progress.md",
    "verify-report.md",
  ]) {
    filesPresent[filename] = existsSync(path.join(changeDir, filename));
  }
  filesPresent.specs = hasChangeLocalSpec(changeDir);
  const result = validatePhaseTransition(phase, routePhases, filesPresent, { routeName: activeRoute });
  if (!result.allowed) {
    error(`\x1b[31m[ERROR DE TRANSICIÓN] ${result.reason}\x1b[0m`);
    return exit(1);
  }
  log(`[OK] Transición a fase '${phase}' aprobada para la ruta '${activeRoute}'.`);
  return exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  resolveRoots,
  readPersistedRouteInfo,
  hasChangeLocalSpec,
  positionalArgs,
};
