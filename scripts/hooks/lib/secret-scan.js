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
 * La censura de salidas (secret-redact.js) sustituye cada match por su id, así
 * que un patrón debe cubrir el token entero.
 *
 * `\b` delante: un prefijo dentro de otra palabra ("desk-…") no es el token.
 * `\b` detrás solo cuando el alfabeto no admite `-`: con `-` no hay frontera
 * de palabra tras el último carácter.
 */
const KNOWN_TOKEN_PATTERNS = [
  { id: "openai-api-key", regex: /\bsk-[a-zA-Z0-9]{48}\b/ },
  { id: "google-api-key", regex: /\bAIzaSy[a-zA-Z0-9_-]{33}/ },
  { id: "aws-access-key", regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { id: "slack-token", regex: /\bxox[abposr]-[0-9A-Za-z-]{10,}/ },
  { id: "jwt", regex: /\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/ },
  { id: "private-key-header", regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/ },
  { id: "github-token", regex: /\bgh[pousr]_[A-Za-z0-9]{36}\b/ },
  { id: "github-fine-grained-token", regex: /\bgithub_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}\b/ },
  { id: "anthropic-api-key", regex: /\bsk-ant-[a-z]+\d{2}-[A-Za-z0-9_-]{80,}/ },
  { id: "openai-project-key", regex: /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}/ },
  { id: "stripe-secret-key", regex: /\b[sr]k_(?:live|test)_[0-9A-Za-z]{24,}\b/ },
  { id: "npm-token", regex: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { id: "gitlab-token", regex: /\bglpat-[A-Za-z0-9_-]{20,}/ },
  { id: "huggingface-token", regex: /\bhf_[A-Za-z]{34}\b/ },
  { id: "sendgrid-api-key", regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/ },
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
  if (isSshKey || ext === ".key") return { action: "deny", kind: "private-key" };

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
