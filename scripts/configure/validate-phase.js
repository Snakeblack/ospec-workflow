#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parseRoutingTable } = require("../lib/route-dispatcher.js");
const { validatePhaseTransition } = require("../lib/flow-validator.js");

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

  const repoRoot = path.resolve(__dirname, "../..");
  const configPath = path.join(repoRoot, "openspec", "config.yaml");
  const changeDir = path.join(repoRoot, "openspec", "changes", changeName);
  const persistedRoute = readPersistedRoute(changeDir);

  if (persistedRoute && persistedRoute !== routeName) {
    console.error(
      `\x1b[31m[ERROR DE TRANSICIÓN] La ruta solicitada '${routeName}' no coincide con la ruta persistida '${persistedRoute}' en state.yaml.\x1b[0m`,
    );
    process.exit(1);
  }

  const activeRoute = persistedRoute || routeName;

  // Ruta especial "freeform" o vacía: no se valida nada cuando no contradice state.yaml.
  if (activeRoute === "freeform" || activeRoute === "" || activeRoute === "None" || activeRoute === "null") {
    process.exit(0);
  }

  // Leer y parsear config.yaml para obtener las fases de la ruta
  let routePhases = [];
  try {
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, "utf8");
      const routingTable = parseRoutingTable(configContent);
      const matchedRoute = routingTable.find((r) => r.name === activeRoute);
      if (matchedRoute) {
        routePhases = matchedRoute.phases || [];
      }
    }
  } catch (e) {
    console.error(`Advertencia: no se pudo parsear config.yaml (${e.message}). Se usará validación básica.`);
  }

  // Si la ruta no se encuentra o no tiene fases definidas, permitir transición
  if (routePhases.length === 0) {
    if (persistedRoute) {
      console.error(
        `\x1b[31m[ERROR DE TRANSICIÓN] La ruta persistida '${persistedRoute}' no está declarada con fases en openspec/config.yaml.\x1b[0m`,
      );
      process.exit(1);
    }
    process.exit(0);
  }

  // Mapear archivos presentes en la carpeta del cambio activo
  const filesToCheck = ["proposal.md", "proposal-lite.md", "design.md", "tasks.md", "apply-progress.md", "verify-report.md"];
  const filesPresent = {};

  for (const filename of filesToCheck) {
    const filePath = path.join(changeDir, filename);
    filesPresent[filename] = fs.existsSync(filePath);
  }
  filesPresent.specs = hasChangeLocalSpec(changeDir);

  // Ejecutar validación
  const result = validatePhaseTransition(phase, routePhases, filesPresent, { routeName: activeRoute });

  if (!result.allowed) {
    console.error(`\x1b[31m[ERROR DE TRANSICIÓN] ${result.reason}\x1b[0m`);
    process.exit(1);
  }

  console.log(`[OK] Transición a fase '${phase}' aprobada para la ruta '${activeRoute}'.`);
  process.exit(0);
}

main();
