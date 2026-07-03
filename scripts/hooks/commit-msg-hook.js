"use strict";

const fs = require("node:fs");

/**
 * Regex that matches any forbidden AI/model attribution in a commit message.
 * Mirrors the pattern from rules/no-model-attribution.instructions.md.
 */
const FORBIDDEN_ATTRIBUTION_RE =
  /co-authored-by|generated (?:with|by)|🤖|claude|anthropic|opus|sonnet|haiku|fable|gpt|chatgpt|openai|codex|copilot|gemini|bard|llama|mistral|cohere/i;

/**
 * Scans a commit message for forbidden AI/model attribution patterns.
 * Returns the matching line or null if the message is clean.
 */
function findAttribution(message) {
  const lines = message.split(/\r?\n/);
  for (const line of lines) {
    if (FORBIDDEN_ATTRIBUTION_RE.test(line)) {
      return line.trim();
    }
  }
  return null;
}

/** Matches the Ospec-Change / Ospec-Task traceability trailers (B3). */
const OSPEC_CHANGE_TRAILER_RE = /^Ospec-Change:\s*(\S+)\s*$/m;
const OSPEC_TASK_TRAILER_RE = /^Ospec-Task:\s*[0-9]+(?:\.[0-9]+)*(?:\s*,\s*[0-9]+(?:\.[0-9]+)*)*\s*$/m;

/** Commits that never need traceability trailers. */
const TRAILER_EXEMPT_RE = /^(?:Merge |Revert |fixup!|squash!)/;

/**
 * Validates the B3 traceability trailers against the active change.
 * Pure function — the caller resolves the active change name (or null).
 * Returns { status: "ok" | "missing" | "missing-task" | "mismatch", detail }.
 */
function checkTraceabilityTrailers(message, activeChangeName) {
  if (!activeChangeName) {
    return { status: "ok", detail: "no active change" };
  }
  if (TRAILER_EXEMPT_RE.test(message)) {
    return { status: "ok", detail: "exempt commit type" };
  }
  const changeMatch = message.match(OSPEC_CHANGE_TRAILER_RE);
  if (!changeMatch) {
    return {
      status: "missing",
      detail: `Falta el trailer 'Ospec-Change: ${activeChangeName}' (y 'Ospec-Task: N.N') con un change activo.`,
    };
  }
  if (changeMatch[1] !== activeChangeName) {
    return {
      status: "mismatch",
      detail: `El trailer nombra '${changeMatch[1]}' pero el change activo es '${activeChangeName}'.`,
    };
  }
  if (!OSPEC_TASK_TRAILER_RE.test(message)) {
    return {
      status: "missing-task",
      detail: "Ospec-Change presente pero falta 'Ospec-Task: N.N' (números de task, separados por coma).",
    };
  }
  return { status: "ok", detail: "trailers valid" };
}

/** Resolves the active (status: active) change name from openspec/changes, or null. */
function findActiveChangeNameSync() {
  const path = require("node:path");
  const changesRoot = path.join(process.cwd(), "openspec", "changes");
  try {
    if (!fs.existsSync(changesRoot)) return null;
    for (const entry of fs.readdirSync(changesRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "archive") {
        const statePath = path.join(changesRoot, entry.name, "state.yaml");
        if (fs.existsSync(statePath) && fs.readFileSync(statePath, "utf8").includes("status: active")) {
          return entry.name;
        }
      }
    }
  } catch (err) {
    // fail-open: traceability must never break commits on I/O errors
  }
  return null;
}

/** Reads whether config declares trailers as required (default: advisory). */
function trailersRequiredSync() {
  try {
    const content = fs.readFileSync("openspec/config.yaml", "utf8");
    return /^traceability:\s*$[\s\S]*?^\s+trailers:\s*required\s*$/m.test(content);
  } catch (err) {
    return false;
  }
}

function runCommitMsg(msgFilePath) {
  // 1. Bypass por variable de entorno
  if (process.env.DISABLE_OSPEC_ATTRIBUTION_CHECK === "true") {
    process.exit(0);
    return;
  }

  if (!msgFilePath) {
    // Git passes the message file path as the first argument
    msgFilePath = process.argv[2];
  }

  if (!msgFilePath) {
    console.error("OSPEC-COMMIT-MSG: No se recibió la ruta del archivo de mensaje de commit.");
    process.exit(1);
    return;
  }

  let message;
  try {
    message = fs.readFileSync(msgFilePath, "utf8");
  } catch (err) {
    console.warn(`OSPEC-COMMIT-MSG [Warning]: No se pudo leer el archivo de mensaje: ${err.message}`);
    // Ante un error de lectura, dejar pasar para no bloquear innecesariamente
    process.exit(0);
    return;
  }

  const offendingLine = findAttribution(message);
  if (offendingLine) {
    console.error("\n======================================================================");
    console.error("OSPEC-COMMIT-MSG ERROR: Atribución AI/modelo detectada en el mensaje de commit.");
    console.error(`  Línea ofensiva: "${offendingLine}"`);
    console.error("");
    console.error("Regla: Nunca añadir 'Co-Authored-By', nombres de modelo, ni créditos a");
    console.error("herramientas AI en commits. Usa Conventional Commits sin atribución.");
    console.error("");
    console.error("Solución:");
    console.error("  1. Edita el mensaje eliminando las líneas de atribución AI.");
    console.error("  2. Si es un falso positivo legítimo, omite esta verificación con:");
    if (process.platform === "win32") {
      console.error('     $env:DISABLE_OSPEC_ATTRIBUTION_CHECK="true"; git commit ...  (PowerShell)');
      console.error('     o: set DISABLE_OSPEC_ATTRIBUTION_CHECK=true && git commit ... (CMD)');
    } else {
      console.error('     DISABLE_OSPEC_ATTRIBUTION_CHECK=true git commit ...');
    }
    console.error("======================================================================\n");
    process.exit(1);
    return;
  }

  // B3 — Traceability trailers: advisory by default, required via config
  // (`traceability:` → `trailers: required`). Never blocks unless required.
  const activeChange = findActiveChangeNameSync();
  const trailerResult = checkTraceabilityTrailers(message, activeChange);
  if (trailerResult.status !== "ok") {
    const required = trailersRequiredSync();
    const label = required ? "ERROR" : "Advisory";
    console.warn(`OSPEC-COMMIT-MSG [${label}]: trazabilidad — ${trailerResult.detail}`);
    if (required) {
      console.error("Config declara 'trailers: required'. Añade los trailers y reintenta,");
      console.error("o cambia la política en openspec/config.yaml (traceability).");
      process.exit(1);
      return;
    }
  }

  process.exit(0);
}

if (require.main === module) {
  runCommitMsg();
}

module.exports = {
  FORBIDDEN_ATTRIBUTION_RE,
  findAttribution,
  checkTraceabilityTrailers,
  runCommitMsg,
};
