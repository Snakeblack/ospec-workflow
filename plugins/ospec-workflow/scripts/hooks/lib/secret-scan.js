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

const MARKER_PREFIX = "[REDACTED:";

/**
 * Nombres sensibles, por palabras (`DB_PASSWORD`, `apiKey`, `client-secret`).
 * La clase de la palabra decide qué valor cuenta como secreto, y es la misma
 * para el escáner y para la censura (secret-redact.js):
 * - `human`: una contraseña la elige una persona y puede ser solo letras;
 * - `machine`: un token o una clave generados tienen forma de secreto;
 * - `generic`: un `key` a secas suele ser un identificador (el `key` de JSX)
 *   y solo cuenta con un token opaco;
 * - `unqualified`: un `key` con un prefijo desconocido (`azure_openai_key`,
 *   `root_cause_key`) puede ser la clave de un proveedor o un hash. El
 *   escáner lo marca con un token opaco, porque un secreto en el historial
 *   cuesta más que añadir el marcador a una línea; la censura no lo toca,
 *   porque ocultaría identificadores que el modelo necesita leer.
 *
 * Con un prefijo que nombra un dato que no es secreto (`cache_key`, `sortKey`,
 * `public_key`) el nombre no es sensible.
 */
const HUMAN_WORDS = new Set(["password", "passwd", "passphrase", "secret", "contraseña", "contrasena"]);
const HUMAN_ENDINGS = ["password", "passwd", "secret"];
const MACHINE_WORDS = new Set(["pwd", "token", "apikey", "credential", "credentials", "privatekey"]);
const MACHINE_ENDINGS = ["token", "apikey"];
const KEY_QUALIFIERS = new Set([
  "api", "access", "secret", "private", "auth", "encryption", "signing", "master", "client",
  "account", "jwt", "hmac", "security", "subscription",
]);
const PLAIN_KEY_QUALIFIERS = new Set([
  "cache", "sort", "partition", "primary", "foreign", "idempotency", "dedupe", "hash", "object", "row",
  "public", "publishable", "anon", "site", "cause",
]);

function keyWords(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().split(/[_.-]+/).filter(Boolean);
}

/** @returns {"human"|"machine"|"generic"|"unqualified"|null} */
function keyWordClass(words, index) {
  const word = words[index];
  if (HUMAN_WORDS.has(word)) return "human";
  // `pass` a secas es ambiguo ("first pass"); con prefijo (`db_pass`) no.
  if (word === "pass") return words.length === 1 ? "machine" : "human";
  if (MACHINE_WORDS.has(word)) return "machine";
  if (word === "key") {
    const qualifier = words[index - 1] || "";
    if (KEY_QUALIFIERS.has(qualifier)) return "machine";
    if (words.length === 1) return "generic";
    return PLAIN_KEY_QUALIFIERS.has(qualifier) ? null : "unqualified";
  }
  if (HUMAN_ENDINGS.some((ending) => word.endsWith(ending))) return "human";
  if (MACHINE_ENDINGS.some((ending) => word.endsWith(ending))) return "machine";
  return null;
}

const PLACEHOLDER_WORDS = new Set([
  "null", "nil", "none", "undefined", "true", "false", "yes", "no", "on", "off", "empty",
  "changeme", "password", "passwd", "secret", "token", "example", "sample", "dummy",
  "placeholder", "redacted", "todo", "tbd", "fixme", "test",
  "pass", "pwd", "contraseña", "contrasena", "clave",
]);
// Un valor que nombra lo que es ("superSecretAdmin123", "password123",
// "token-123") es un ejemplo: un secreto generado nunca contiene esas palabras.
const PLACEHOLDER_PARTS = [
  "your", "example", "placeholder", "changeme", "change_me", "change-me", "dummy", "xxxx", "****", "replace", "...",
  "password", "passwd", "secret", "token",
];
const DESCRIPTIVE_PARTS = new Set(["password", "passwd", "secret", "token"]);
// `env(NOMBRE)` es la referencia de config.toml de Supabase.
const REFERENCE_PARTS = ["${", "$(", "{{", "process.env", "os.environ", "getenv", "secrets.", "env(", "ENC["];

/** 16 caracteres alfanuméricos seguidos o más, con letra y con dígito. */
function hasOpaqueRun(value) {
  return (value.match(/[A-Za-z0-9]{16,}/g) || []).some((run) => /[A-Za-z]/.test(run) && /[0-9]/.test(run));
}

function isRepeatedChar(value) {
  const chars = [...value];
  return chars.every((ch) => ch === chars[0]);
}

/**
 * Referencias, plantillas, placeholders, URLs, rutas, números y nombres de
 * constante o de propiedad. Sin `descriptive` (un `.env`), un valor que
 * contiene `password` o `secret` sí cuenta como secreto: ahí nadie escribe
 * ejemplos. Un valor con puntos y un tramo opaco es un token (`a.b.c` de un
 * bot), no el nombre de una propiedad.
 */
function isPlaceholder(value, descriptive = true) {
  if (!value || value.startsWith(MARKER_PREFIX) || value.startsWith("$") || value.startsWith("{")) return true;
  if (REFERENCE_PARTS.some((part) => value.includes(part))) return true;
  if (/<[^>]*>/.test(value) || /^%[A-Za-z0-9_]+%$/.test(value) || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)) return true;
  const lower = value.toLowerCase();
  const parts = descriptive ? PLACEHOLDER_PARTS : PLACEHOLDER_PARTS.filter((part) => !DESCRIPTIVE_PARTS.has(part));
  if (PLACEHOLDER_WORDS.has(lower) || parts.some((part) => lower.includes(part))) return true;
  if (/^[0-9]+$/.test(value) || isRepeatedChar(value)) return true;
  if (/^(?:\/|\.{1,2}\/|~\/|[A-Za-z]:[\\/])/.test(value) || /\.(?:pem|key|crt|cer|p12|pfx|json|txt|ya?ml|env)$/i.test(value)) return true;
  if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(value)) return true;
  return /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/.test(value) && !hasOpaqueRun(value);
}

/**
 * Forma de secreto de un valor en código o configuración. Los separadores de
 * identificador (`-`, `_`, `.`) no cuentan como símbolo ("user-owned"), un
 * `:` delata un id con espacio de nombres ("opaque:t1"), salvo que lleve un
 * tramo opaco (el token de un bot, `<id>:<token>`), y un `-` inicial, un
 * argumento de CLI ("--node-id=n1").
 */
function isStrictSecret(value) {
  return [...value].length >= 8
    && !/[ \t]/.test(value)
    && (!value.includes(":") || hasOpaqueRun(value))
    && !value.startsWith("-")
    && /[A-Za-z]/.test(value)
    && /[0-9!-,/;-@[-^`{-~]/.test(value)
    && !isPlaceholder(value);
}

/**
 * Token opaco: 16 caracteres alfanuméricos seguidos o más, con letra y con
 * dígito. Un identificador con separadores ("app_v2_storage_state") o un UUID
 * no lo son.
 */
function isOpaqueToken(value) {
  return !/[ \t]/.test(value) && !isPlaceholder(value) && hasOpaqueRun(value);
}

/**
 * Asignación genérica de credencial: un nombre sin comillas pegado a `:` o `=`
 * y un valor entre comillas de 6 caracteres o más, en la misma línea. El
 * nombre se clasifica por su última palabra (keyWordClass): `monkey:` o
 * `compass =` no son sensibles, `db_password`, `api-key` y `apiKey` sí.
 *
 * El nombre tiene tope de longitud: sin él, una tira larga de base64 costaría
 * un tiempo cuadrático en V8. RE2 (Go) no necesita el tope, pero lo comparte.
 */
const GENERIC_ASSIGNMENT_REGEX = /([A-Za-zñÑ_][A-Za-z0-9ñÑ_.-]{0,80})[ \t]*[:=][ \t]*["']([^"'\n]{6,})["']/g;

/**
 * Las asignaciones genéricas de `content` que cuentan como credencial: nombre
 * `human` con cualquier valor, `machine` con forma de secreto, y `generic` o
 * `unqualified` con un token opaco.
 *
 * @returns {string[]} el texto de cada asignación
 */
function findGenericCredentials(content) {
  const found = [];
  const regex = new RegExp(GENERIC_ASSIGNMENT_REGEX.source, "g");
  let match;
  while ((match = regex.exec(content)) !== null) {
    const words = keyWords(match[1]);
    const kind = words.length > 0 ? keyWordClass(words, words.length - 1) : null;
    const value = match[2];
    if (kind === "human" || (kind === "machine" && isStrictSecret(value)) || ((kind === "generic" || kind === "unqualified") && isOpaqueToken(value))) {
      found.push(match[0]);
    } else {
      // El valor de un nombre corriente puede contener otra asignación.
      regex.lastIndex = match.index + match[1].length;
    }
  }
  return found;
}

/** El último tramo de una ruta, con cualquiera de las dos barras, en minúsculas. */
function lastSegment(filePath) {
  return String(filePath || "").split(/[\\/]/).filter(Boolean).pop()?.toLowerCase() || "";
}

/** Un fichero bajo un directorio `.ssh`, a cualquier profundidad. */
function underSshDirectory(filePath) {
  return /(?:^|[\\/])\.ssh[\\/]+[^\\/]/i.test(String(filePath || ""));
}

/**
 * Lo que un directorio `.ssh` guarda sin ser una clave privada, además de los
 * `*.pub`. Cualquier otro fichero bajo `.ssh` cuenta como clave, se llame como
 * se llame (`aws-prod.pem`, `deploy_key`, `github`), y también un comodín o
 * una expansión, que pueden nombrar una (`*.pem`, `known_*`, `$KEY`), y el
 * propio directorio, porque leerlo entero lee sus claves (`grep -r … ~/.ssh`).
 */
const SSH_PUBLIC_NAMES = new Set([
  "config", "known_hosts", "known_hosts.old", "authorized_keys", "authorized_keys2",
  "environment", "rc", "allowed_signers", "revoked_keys",
]);

/**
 * Ficheros de configuración: ahí `password: valor` es una asignación, no una
 * expresión ni un tipo, y la censura y el pre-commit la ven sin comillas y con
 * una contraseña solo de letras. De los JSON solo entran los de configuración
 * por nombre: en el resto viven las etiquetas (`"password": "Contraseña"`).
 * Por lo mismo queda fuera una traducción: un fichero bajo un directorio de
 * traducciones (`locales/es.yml`, `locale/de-DE.ini`) o un bundle de Java con
 * sufijo de idioma (`messages_es.properties`).
 */
const TRANSLATION_DIRECTORY = /(?:^|[\\/])(?:locales?|i18n|l10n|langs?|translations?)[\\/]/i;
const TRANSLATION_BUNDLE = /_[a-z]{2}(?:_[a-z]{2})?\.properties$/;
const CONFIG_EXTENSIONS = new Set([".yml", ".yaml", ".ini", ".properties", ".toml", ".conf", ".cfg"]);
const CONFIG_JSON_NAME = /^(?:appsettings.*|local\.settings|config(?:\.[^.]+)?|settings)\.json$/;

function isConfigFile(filePath) {
  const filename = lastSegment(filePath);
  if (TRANSLATION_DIRECTORY.test(String(filePath || "")) || TRANSLATION_BUNDLE.test(filename)) return false;
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
  return CONFIG_EXTENSIONS.has(ext) || CONFIG_JSON_NAME.test(filename);
}

/**
 * Clasifica un path por nombre de archivo. Un directorio (`directory`, o una
 * ruta que acaba en barra) no es una clave por llamarse `id_service` o
 * `certs.key`; `.ssh` y lo que hay bajo él sí cuentan, porque leerlos lee sus
 * claves.
 *
 * @returns {{action: "deny"|"ask", kind: string}|null}
 *   deny → private-key | git-config | npmrc
 *   ask  → env-file | secrets-file
 */
function classifySensitiveFile(filePath, { directory = false } = {}) {
  const filename = path.basename(String(filePath || "")).toLowerCase();
  // From the last dot, as filepath.Ext does in Go: `.key` is an extension too.
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";

  const isSshKey =
    filename.startsWith("id_") &&
    (ext === "" || ext === ".key" || ext === ".pem" ||
      filename === "id_rsa" || filename === "id_ecdsa" || filename === "id_ed25519");
  const isDirectory = directory || /[\\/]$/.test(String(filePath || ""));
  if ((isSshKey || ext === ".key") && !isDirectory) return { action: "deny", kind: "private-key" };
  const name = lastSegment(filePath);
  if (name === ".ssh" || (underSshDirectory(filePath) && !SSH_PUBLIC_NAMES.has(name) && !name.endsWith(".pub"))) {
    return { action: "deny", kind: "private-key" };
  }

  // With either separator, as filepath.ToSlash does in Go: on Windows a
  // command names `.git/config` and a resolved path `.git\config`.
  if (filename === "config" && String(filePath).split(path.sep).join("/").includes(".git/config")) {
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
  if (findGenericCredentials(content).length > 0) {
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
  isConfigFile,
  underSshDirectory,
  scanContentForSecrets,
  scanFileForSecrets,
  findGenericCredentials,
  isOpaqueToken,
  isPlaceholder,
  isStrictSecret,
  keyWordClass,
  keyWords,
  KNOWN_TOKEN_PATTERNS,
  MARKER_PREFIX,
  MAX_SCAN_SIZE_BYTES,
};
