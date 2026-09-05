#!/usr/bin/env node

"use strict";

/**
 * CLI de despacho de rutas en vivo para el orquestador SDD.
 * Uso: node scripts/route-dispatch-run.js [change-name] [opciones]
 *
 * Salida: JSON estructurado en stdout con el resultado de selectRoute().
 * Códigos de salida:
 *   0 -> status: "success"
 *   2 -> status: "blocked" (needs_user_decision)
 *   1 -> error (conflicto de clasificación, config ausente, argumentos inválidos)
 */

const fs = require("node:fs");
const path = require("node:path");
const { parseRoutingTable, selectRoute, ClassificationConflictError } = require("./lib/route-dispatcher.js");
const { isSafeChangeName } = require("./lib/archive-plan.js");

function parseArgs(argv) {
  const flags = {
    changeName: null,
    classification: null,
    changeClassification: null,
    persistedRoute: null,
    authSecurity: false,
    dataMigration: false,
    publicApi: false,
    impactJson: null,
    workspace: process.cwd(),
    configFile: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--classification=")) {
      flags.classification = arg.slice("--classification=".length);
    } else if (arg.startsWith("--change.classification=")) {
      flags.changeClassification = arg.slice("--change.classification=".length);
    } else if (arg.startsWith("--persisted-route=")) {
      flags.persistedRoute = arg.slice("--persisted-route=".length);
    } else if (arg === "--auth_security" || arg === "--auth-security") {
      flags.authSecurity = true;
    } else if (arg === "--data_migration" || arg === "--data-migration") {
      flags.dataMigration = true;
    } else if (arg === "--public_api" || arg === "--public-api") {
      flags.publicApi = true;
    } else if (arg.startsWith("--impact=")) {
      flags.impactJson = arg.slice("--impact=".length);
    } else if (arg.startsWith("--workspace=")) {
      flags.workspace = arg.slice("--workspace=".length);
    } else if (arg === "--workspace" && i + 1 < argv.length) {
      flags.workspace = argv[++i];
    } else if (arg.startsWith("--config=")) {
      flags.configFile = arg.slice("--config=".length);
    } else if (!arg.startsWith("-") && flags.changeName === null) {
      flags.changeName = arg;
    }
  }

  return flags;
}

function extractStateRouteInfo(stateContent) {
  const info = {
    persistedRoute: null,
    classification: null,
    impact: {},
  };

  if (!stateContent || typeof stateContent !== "string") return info;

  const lines = stateContent.split(/\r?\n/);
  let inRouteBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const lineWithoutInlineComment = line.replace(/\s+#.*$/, "");
    const indent = line.match(/^\s*/)[0].length;
    if (indent === 0) {
      inRouteBlock = trimmed.startsWith("route:");
    }

    if (inRouteBlock) {
      const match = lineWithoutInlineComment.match(/^\s*actual_route:\s*(.+)$/);
      if (match) {
        info.persistedRoute = match[1].trim().replace(/^["']|["']$/g, "");
      }
    }

    const classMatch = lineWithoutInlineComment.match(/^\s*classification:\s*(.+)$/);
    if (classMatch && !info.classification) {
      info.classification = classMatch[1].trim().replace(/^["']|["']$/g, "");
    }

    const authMatch = lineWithoutInlineComment.match(/^\s*auth_security:\s*["']?true["']?\s*$/i);
    if (authMatch) {
      info.impact.auth_security = true;
    }
    const migrationMatch = lineWithoutInlineComment.match(/^\s*data_migration:\s*["']?true["']?\s*$/i);
    if (migrationMatch) {
      info.impact.data_migration = true;
    }
    const apiMatch = lineWithoutInlineComment.match(/^\s*public_api:\s*["']?true["']?\s*$/i);
    if (apiMatch) {
      info.impact.public_api = true;
    }
  }

  if (!info.persistedRoute) {
    const fallbackRouteMatch = stateContent.match(/route:\s*(?:\r?\n)(?:[ \t]+[^\r\n]+(?:\r?\n))*?[ \t]+actual_route:\s*([^\r\n#]+)/);
    if (fallbackRouteMatch) {
      info.persistedRoute = fallbackRouteMatch[1].trim().replace(/^["']|["']$/g, "");
    }
  }

  return info;
}

function extractConfigDefaults(configContent) {
  const defaults = {
    "project.status": "active",
    "baseline.status": "done",
    "artifact_store.backend": "openspec",
  };

  if (!configContent || typeof configContent !== "string") return defaults;

  const projStatusMatch = configContent.match(/project:\s*(?:\r?\n)(?:[ \t]+[^\r\n]+(?:\r?\n))*?[ \t]+status:\s*([^\r\n#]+)/);
  if (projStatusMatch) {
    defaults["project.status"] = projStatusMatch[1].trim().replace(/^["']|["']$/g, "");
  }

  const baselineMatch = configContent.match(/baseline:\s*(?:\r?\n)(?:[ \t]+[^\r\n]+(?:\r?\n))*?[ \t]+status:\s*([^\r\n#]+)/);
  if (baselineMatch) {
    defaults["baseline.status"] = baselineMatch[1].trim().replace(/^["']|["']$/g, "");
  }

  const backendMatch = configContent.match(/artifact_store:\s*(?:\r?\n)(?:[ \t]+[^\r\n]+(?:\r?\n))*?[ \t]+backend:\s*([^\r\n#]+)/);
  if (backendMatch) {
    defaults["artifact_store.backend"] = backendMatch[1].trim().replace(/^["']|["']$/g, "");
  }

  return defaults;
}

function main(argv = process.argv.slice(2), deps = {}) {
  const log = deps.log || console.log;
  const error = deps.error || console.error;
  const exit = deps.exit || ((code) => process.exit(code));

  const flags = parseArgs(argv);
  const workspace = path.resolve(flags.workspace);
  const configPath = flags.configFile
    ? path.resolve(workspace, flags.configFile)
    : path.join(workspace, "openspec", "config.yaml");

  if (!fs.existsSync(configPath)) {
    error(JSON.stringify({ error: `Configuration file not found: ${configPath}` }));
    return exit(1);
  }

  const configContent = fs.readFileSync(configPath, "utf8");
  const routes = parseRoutingTable(configContent);
  const configDefaults = extractConfigDefaults(configContent);

  let stateInfo = { persistedRoute: null, classification: null, impact: {} };
  if (flags.changeName) {
    if (!isSafeChangeName(flags.changeName)) {
      error(JSON.stringify({ error: `Invalid change-name: '${flags.changeName}'` }));
      return exit(1);
    }
    const statePath = path.join(workspace, "openspec", "changes", flags.changeName, "state.yaml");
    if (fs.existsSync(statePath)) {
      const stateContent = fs.readFileSync(statePath, "utf8");
      stateInfo = extractStateRouteInfo(stateContent);
    }
  }

  const ctx = {
    ...configDefaults,
  };

  if (flags.classification) {
    ctx.classification = flags.classification;
  } else if (stateInfo.classification) {
    ctx.classification = stateInfo.classification;
  }

  if (flags.changeClassification) {
    ctx["change.classification"] = flags.changeClassification;
  }

  const impact = { ...stateInfo.impact };
  if (flags.authSecurity) impact.auth_security = true;
  if (flags.dataMigration) impact.data_migration = true;
  if (flags.publicApi) impact.public_api = true;

  if (flags.impactJson) {
    try {
      const parsedImpact = JSON.parse(flags.impactJson);
      Object.assign(impact, parsedImpact);
    } catch (e) {
      error(JSON.stringify({ error: `Invalid JSON for --impact: ${e.message}` }));
      return exit(1);
    }
  }

  if (Object.keys(impact).length > 0) {
    ctx.impact = impact;
  }

  const persistedRoute = flags.persistedRoute || stateInfo.persistedRoute || null;
  const options = {};
  if (persistedRoute) {
    options.persistedRoute = persistedRoute;
  }

  try {
    const result = selectRoute(routes, ctx, options);
    log(JSON.stringify(result, null, 2));
    if (result.status === "blocked") {
      return exit(2);
    }
    return exit(0);
  } catch (err) {
    if (err instanceof ClassificationConflictError) {
      error(JSON.stringify({
        status: "error",
        error: err.message,
        code: err.code,
      }, null, 2));
      return exit(1);
    }
    error(JSON.stringify({
      status: "error",
      error: err.message,
    }, null, 2));
    return exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  parseArgs,
  extractStateRouteInfo,
  extractConfigDefaults,
};
