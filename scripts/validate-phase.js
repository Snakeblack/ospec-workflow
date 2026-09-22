#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parseRoutingTable } = require("./lib/route-dispatcher.js");
const { validatePhaseTransition } = require("./lib/flow-validator.js");

function readPersistedRoute(changeDir) {
  const statePath = path.join(changeDir, "state.yaml");
  if (!fs.existsSync(statePath)) return null;
  const state = fs.readFileSync(statePath, "utf8");
  const match = state.match(/^\s*actual_route:\s*["']?([^\s"'#]+)["']?\s*(?:#.*)?$/m);
  return match ? match[1] : null;
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

function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error("Uso: node validate-phase.js <fase> <ruta> <cambio>");
    process.exit(1);
  }
  const [phase, routeName, changeName] = args;
  const repoRoot = path.resolve(__dirname, "..");
  const configPath = path.join(repoRoot, "openspec", "config.yaml");
  const changeDir = path.join(repoRoot, "openspec", "changes", changeName);
  const persistedRoute = readPersistedRoute(changeDir);
  if (persistedRoute && persistedRoute !== routeName) {
    console.error(`\x1b[31m[ERROR DE TRANSICIÓN] La ruta solicitada '${routeName}' no coincide con la ruta persistida '${persistedRoute}' en state.yaml.\x1b[0m`);
    process.exit(1);
  }
  const activeRoute = persistedRoute || routeName;
  if (activeRoute === "freeform") process.exit(0);
  if (!fs.existsSync(configPath)) {
    console.error("[ERROR DE TRANSICIÓN] Falta openspec/config.yaml; no se puede validar la ruta.");
    process.exit(1);
  }
  let routePhases = [];
  try {
    const routingTable = parseRoutingTable(fs.readFileSync(configPath, "utf8"));
    const matchedRoute = routingTable.find((r) => r.name === activeRoute);
    if (matchedRoute) routePhases = matchedRoute.phases || [];
  } catch (e) {
    console.error(`[ERROR DE TRANSICIÓN] No se pudo leer openspec/config.yaml: ${e.message}`);
    process.exit(1);
  }
  if (routePhases.length === 0) {
    console.error(`[ERROR DE TRANSICIÓN] La ruta ${persistedRoute ? "persistida" : "solicitada"} '${activeRoute}' no está declarada con fases en openspec/config.yaml.`);
    process.exit(1);
  }
  const filesPresent = {};
  for (const filename of ["proposal.md", "proposal-lite.md", "design.md", "tasks.md", "apply-progress.md", "verify-report.md"]) {
    filesPresent[filename] = fs.existsSync(path.join(changeDir, filename));
  }
  filesPresent.specs = hasChangeLocalSpec(changeDir);
  const result = validatePhaseTransition(phase, routePhases, filesPresent, { routeName: activeRoute });
  if (!result.allowed) {
    console.error(`\x1b[31m[ERROR DE TRANSICIÓN] ${result.reason}\x1b[0m`);
    process.exit(1);
  }
  console.log(`[OK] Transición a fase '${phase}' aprobada para la ruta '${activeRoute}'.`);
  process.exit(0);
}

main();
