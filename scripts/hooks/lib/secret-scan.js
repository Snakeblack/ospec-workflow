"use strict";

/**
 * Agent-shield secret scanning — fuente única de verdad en JS para la
 * clasificación de archivos sensibles y el escaneo de contenido en busca de
 * credenciales. Consumido por scripts/hooks/pre-tool-use.js.
 *
 * PARIDAD: internal/hooks/secretscan.go espeja estos patrones y umbrales.
 * Cualquier cambio aquí debe replicarse allí (ver docs/harness-go-js-parity.md).
 */

const fs = require("node:fs");
const path = require("node:path");

/** Límite de tamaño para el escaneo de contenido (archivos mayores se omiten). */
const MAX_SCAN_SIZE_BYTES = 1024 * 1024;

/**
 * Tokens de proveedores conocidos, con formato propio de alta especificidad.
 * `id` es estable y sirve para telemetría/tests; nunca exponer el match.
 */
const KNOWN_TOKEN_PATTERNS = [
  { id: "openai-api-key", regex: /sk-[a-zA-Z0-9]{48}/ },
  { id: "google-api-key", regex: /AIzaSy[a-zA-Z0-9-_]{33}/ },
  { id: "aws-access-key", regex: /AKIA[A-Z0-9]{16}/ },
  { id: "slack-token", regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/ },
  { id: "jwt", regex: /eyJ[a-zA-Z0-9-_]+\.eyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+/ },
];

/**
 * Asignación genérica de credencial: `password = "..."` o similares.
 *
 * Endurecido contra falsos positivos:
 * - `(?:^|[^a-z])` exige que la keyword no sea sufijo de otra palabra
 *   ("monkey:", "turkey =") pero admite prefijos con `_`/`-` ("db_password",
 *   "api-key"). Se usa en lugar de lookbehind porque RE2 (Go) no lo soporta.
 * - `[ \t]*` (en vez de `\s*`) y `[^"'\n]` obligan a que keyword y valor
 *   convivan en la misma línea; el regex original cruzaba saltos de línea y
 *   combinaba texto sin relación (p.ej. "Key rule:" en un doc con un JSON de
 *   ejemplo párrafos después).
 */
const GENERIC_CREDENTIAL_REGEX =
  /(?:^|[^a-z])(?:password|passwd|pass|contrase[nñ]a|secret|key|token|private_key)[ \t]*[:=][ \t]*["'][^"'\n]{6,}["']/i;

/**
 * Clasifica un path por nombre de archivo.
 *
 * @returns {{action: "deny"|"ask", kind: string}|null}
 *   deny → private-key | git-config | npmrc
 *   ask  → env-file | secrets-file
 */
function classifySensitiveFile(filePath) {
  const filename = path.basename(String(filePath || "")).toLowerCase();
  const ext = path.extname(filename);

  const isSshKey =
    filename.startsWith("id_") &&
    (ext === "" || ext === ".key" || ext === ".pem" ||
      filename === "id_rsa" || filename === "id_ecdsa" || filename === "id_ed25519");
  if (isSshKey) return { action: "deny", kind: "private-key" };

  if (filename === "config" && String(filePath).includes(path.join(".git", "config"))) {
    return { action: "deny", kind: "git-config" };
  }
  if (filename === ".npmrc") return { action: "deny", kind: "npmrc" };

  if (filename.startsWith(".env")) return { action: "ask", kind: "env-file" };
  if (filename === "secrets.json" || filename === "credentials") {
    return { action: "ask", kind: "secrets-file" };
  }
  return null;
}

/**
 * Escanea contenido en memoria.
 *
 * @returns {{matched: boolean, patternId: string|null}}
 */
function scanContentForSecrets(content) {
  if (typeof content !== "string" || content.length === 0) {
    return { matched: false, patternId: null };
  }
  for (const { id, regex } of KNOWN_TOKEN_PATTERNS) {
    if (regex.test(content)) return { matched: true, patternId: id };
  }
  if (GENERIC_CREDENTIAL_REGEX.test(content)) {
    return { matched: true, patternId: "generic-credential" };
  }
  return { matched: false, patternId: null };
}

/**
 * Escanea un archivo en disco. Nunca lanza: los errores de stat/lectura y los
 * archivos que exceden MAX_SCAN_SIZE_BYTES se reportan como `skipped`.
 *
 * @returns {{matched: boolean, patternId: string|null, skipped?: "too-large"|"unreadable"}}
 */
function scanFileForSecrets(filePath) {
  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch (err) {
    return { matched: false, patternId: null, skipped: "unreadable" };
  }
  if (stats.size >= MAX_SCAN_SIZE_BYTES) {
    return { matched: false, patternId: null, skipped: "too-large" };
  }
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    return { matched: false, patternId: null, skipped: "unreadable" };
  }
  return scanContentForSecrets(content);
}

module.exports = {
  classifySensitiveFile,
  scanContentForSecrets,
  scanFileForSecrets,
  KNOWN_TOKEN_PATTERNS,
  GENERIC_CREDENTIAL_REGEX,
  MAX_SCAN_SIZE_BYTES,
};
