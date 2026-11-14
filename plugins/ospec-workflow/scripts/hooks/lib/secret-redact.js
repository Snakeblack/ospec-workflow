"use strict";

/**
 * Censura de secretos en la salida de las herramientas (E1.27): el hook
 * PostToolUse entrega al modelo el resultado con cada secreto sustituido por
 * `[REDACTED:<tipo>]` y el resto intacto. El fichero real no cambia.
 *
 * Solo censura lo que tiene forma inequívoca de secreto, para no destruir
 * contexto con falsos positivos:
 * - tokens de proveedor con prefijo y longitud propios (KNOWN_TOKEN_PATTERNS);
 * - el cuerpo de un bloque PEM de clave privada;
 * - la contraseña de una URL `esquema://usuario:contraseña@host`;
 * - el token de una cabecera `Authorization: Bearer|Basic|Token`;
 * - el valor asignado a un nombre que termina en una palabra sensible
 *   (`DB_PASSWORD`, `apiKey`, `client_secret`), cuando el valor no es una
 *   referencia, un placeholder, una ruta ni un número. Fuera de un `.env`
 *   (`NOMBRE=valor` en mayúsculas) el valor además debe parecer un secreto:
 *   8 caracteres o más, sin espacios, con letra y con dígito o símbolo. Una
 *   contraseña solo de letras en código queda sin censurar: es el precio de
 *   no censurar etiquetas (`"password": "Contraseña"`).
 *
 * PARIDAD: internal/hooks/secretredact.go es el espejo Go; ambos pasan el
 * corpus internal/testdata/secret-redaction/cases.json. Las expresiones evitan
 * lookbehind, retrorreferencias y `\s` para comportarse igual en RE2.
 */

const { KNOWN_TOKEN_PATTERNS, GENERIC_CREDENTIAL_REGEX } = require("./secret-scan.js");

const MARKER_PREFIX = "[REDACTED:";
const MARKER_RE = /\[REDACTED:[a-z0-9-]+\]/;

function marker(kind) {
  return `${MARKER_PREFIX}${kind}]`;
}

// La cabecera sola no es secreta: el bloque se censura con PRIVATE_KEY_BLOCK.
const TOKEN_RULES = KNOWN_TOKEN_PATTERNS
  .filter(({ id }) => id !== "private-key-header")
  .map(({ id, regex }) => ({ id, regex: new RegExp(regex.source, `g${regex.flags}`) }));

// Sin pie (salida truncada) el bloque llega hasta el final del texto. Los
// saltos pueden venir escapados (`\n` literal): una clave dentro de un JSON,
// como la `private_key` de una cuenta de servicio.
const PRIVATE_KEY_BLOCK = /(-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----)((?:\r?\n|(?:\\r)?\\n)[\s\S]*?)((?:\r?\n|(?:\\r)?\\n)-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g;
// Un cuerpo de clave tiene al menos una línea larga de base64.
const KEY_BODY = /[A-Za-z0-9+/=]{40,}/;
// Corchetes fuera: `https://[^:]+:[^@]+@` es una expresión regular, no una URL.
const URL_CREDENTIALS = /\b([A-Za-z][A-Za-z0-9+.-]*:\/\/[^ \t\r\n:/@"'<>[\]]*:)([^ \t\r\n@/"'<>[\]]+)@/g;
const AUTH_HEADER = /\b((?:proxy-)?authorization[ \t]*[:=][ \t]*["']?(?:bearer|basic|token)[ \t]+)([A-Za-z0-9._~+/=-]{16,})/gi;

// Reglas por línea: el texto se parte en "\n" y se quita el "\r" final.
const DOTENV_ASSIGN = /(^|[\t :|→"'[{,;])((?:export[ \t]+)?)([A-Z][A-Z0-9_]*)=("[^"]*"|'[^']*'|[^ \t\f"'#=][^ \t\f"'#]*)/g;
const UPPER_COLON_ASSIGN = /(^|[\t :|→])([A-Z][A-Z0-9_]*):[ \t]+([^ \t\f"'#;,(){}[\]<>`$%]+)([ \t]*)$/g;
// Solo en un fichero sensible por nombre (`.env*`, `credentials`,
// `secrets.json`): cualquier `clave = valor` o `clave: valor` sin comillas,
// también en minúsculas (INI de AWS, YAML).
const SENSITIVE_FILE_ASSIGN = /(^|[\t :|→])((?:export[ \t]+)?)([A-Za-z_][A-Za-z0-9_.-]*)([ \t]*[:=][ \t]*)("[^"]*"|'[^']*'|[^ \t\f"'#;,]+)([ \t]*(?:#.*)?)$/g;
const QUOTED_ASSIGN = /(^|[^A-Za-z0-9_.$-])(?:"([A-Za-z_][A-Za-z0-9_.-]*)"|'([A-Za-z_][A-Za-z0-9_.-]*)'|([A-Za-z_][A-Za-z0-9_.-]*))[ \t]*(?::=|=>|:|=)[ \t]*(?:"([^"]*)"|'([^']*)')/g;

const SENSITIVE_WORDS = new Set(["password", "passwd", "passphrase", "pass", "pwd", "secret", "token", "apikey", "credential", "credentials", "privatekey"]);
const SENSITIVE_ENDINGS = ["password", "passwd", "secret", "token", "apikey"];
const KEY_QUALIFIERS = new Set(["api", "access", "secret", "private", "auth", "encryption", "signing", "master", "client"]);
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
const REFERENCE_PARTS = ["${", "$(", "{{", "process.env", "os.environ", "getenv", "secrets."];

function isSensitiveWord(words, index) {
  const word = words[index];
  if (SENSITIVE_WORDS.has(word)) return true;
  if (word === "key" && KEY_QUALIFIERS.has(words[index - 1] || "")) return true;
  return SENSITIVE_ENDINGS.some((ending) => word.endsWith(ending));
}

/**
 * Por la última palabra: `DB_PASSWORD`, `apiKey` o `client_secret` sí;
 * `max_tokens`, `primary_key` o `passwordField` no. Con `anyWord` (un `.env`)
 * basta cualquier palabra: `SECRET_KEY_BASE`.
 */
function isSensitiveKey(key, anyWord = false) {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().split(/[_.-]+/).filter(Boolean);
  if (words.length === 0) return false;
  if (!anyWord) return isSensitiveWord(words, words.length - 1);
  return words.some((_word, index) => isSensitiveWord(words, index));
}

function isRepeatedChar(value) {
  const chars = [...value];
  return chars.every((ch) => ch === chars[0]);
}

/**
 * Referencias, plantillas, placeholders, URLs, rutas, números y nombres de
 * constante. Sin `descriptive` (un `.env`), un valor que contiene `password`
 * o `secret` sí cuenta como secreto: ahí nadie escribe ejemplos.
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
  return /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/.test(value);
}

/** Valor de un `.env`: cualquier valor que no sea placeholder, de 4 caracteres o más. */
function isEnvSecret(value) {
  return [...value].length >= 4 && !isPlaceholder(value, false);
}

/**
 * Valor opaco en un fichero sensible, sea cual sea su clave: todo lo que no es
 * placeholder, URL sin credenciales, frase ni un valor simple de palabras de
 * hasta 10 caracteres (`production`, `db.internal`, `eu-west-1`).
 */
function isOpaqueValue(value) {
  return [...value].length >= 4
    && !/[ \t]/.test(value)
    && !/^[A-Za-z0-9]{1,10}(?:[-_.][A-Za-z0-9]{1,10})*$/.test(value)
    && !isPlaceholder(value, false);
}

/**
 * Valor en código o configuración: además debe parecer un secreto. Los
 * separadores de identificador (`-`, `_`, `.`) no cuentan como símbolo
 * ("user-owned"), un `:` delata un id con espacio de nombres ("opaque:t1") y
 * un `-` inicial, un argumento de CLI ("--node-id=n1").
 */
function isStrictSecret(value) {
  return [...value].length >= 8
    && !/[ \t:]/.test(value)
    && !value.startsWith("-")
    && /[A-Za-z]/.test(value)
    && /[0-9!-,/;-@[-^`{-~]/.test(value)
    && !isPlaceholder(value);
}

function unquote(value) {
  const quote = value[0];
  return (quote === '"' || quote === "'") && value.length >= 2 && value[value.length - 1] === quote
    ? { quote, inner: value.slice(1, -1) }
    : { quote: "", inner: value };
}

function redactLine(line, note, sensitiveFile) {
  let out = line.replace(DOTENV_ASSIGN, (match, prefix, _export, key, value) => {
    const { quote, inner } = unquote(value);
    // Dentro de una cadena o una lista ("API_KEY=x" en un test, el Env de
    // docker inspect) no es un .env: el valor debe parecer un secreto.
    const embedded = prefix !== "" && `"'[{,;`.includes(prefix);
    const secret = embedded ? isSensitiveKey(key) && isStrictSecret(inner) : isSensitiveKey(key, true) && isEnvSecret(inner);
    if (!secret && !(sensitiveFile && isOpaqueValue(inner))) return match;
    note("assigned-secret");
    return `${match.slice(0, match.length - value.length)}${quote}${marker("assigned-secret")}${quote}`;
  });
  if (sensitiveFile) {
    out = out.replace(SENSITIVE_FILE_ASSIGN, (match, _prefix, _export, key, _separator, value, trailing) => {
      const { quote, inner } = unquote(value);
      if (!(isSensitiveKey(key, true) && isEnvSecret(inner)) && !isOpaqueValue(inner)) return match;
      note("assigned-secret");
      return `${match.slice(0, match.length - value.length - trailing.length)}${quote}${marker("assigned-secret")}${quote}${trailing}`;
    });
  }
  out = out.replace(UPPER_COLON_ASSIGN, (match, _prefix, key, value, trailing) => {
    if (!isSensitiveKey(key) || !isStrictSecret(value)) return match;
    note("assigned-secret");
    return `${match.slice(0, match.length - value.length - trailing.length)}${marker("assigned-secret")}${trailing}`;
  });
  return out.replace(QUOTED_ASSIGN, (match, _prefix, dq, sq, bare, dv, sv) => {
    const key = dq ?? sq ?? bare;
    const value = dv ?? sv;
    const secret = (isSensitiveKey(key) && isStrictSecret(value))
      || (sensitiveFile && ((isSensitiveKey(key, true) && isEnvSecret(value)) || isOpaqueValue(value)));
    if (!secret) return match;
    note("assigned-secret");
    return `${match.slice(0, match.length - value.length - 1)}${marker("assigned-secret")}${match[match.length - 1]}`;
  });
}

/**
 * Censura los secretos de un texto. `sensitiveFile` (el texto viene de un
 * fichero que classifySensitiveFile marca por nombre) añade las asignaciones
 * sin comillas en minúsculas y los valores aleatorios de cualquier clave.
 *
 * @returns {{text: *, kinds: string[]}} `kinds` lista cada tipo censurado una
 *   vez, en el orden en que se censuró. Un no-string vuelve tal cual.
 */
function redactSecrets(text, { sensitiveFile = false } = {}) {
  const kinds = [];
  if (typeof text !== "string" || text === "") return { text, kinds };
  const note = (kind) => {
    if (!kinds.includes(kind)) kinds.push(kind);
  };

  let out = text.replace(PRIVATE_KEY_BLOCK, (match, header, body, footer) => {
    if (!KEY_BODY.test(body)) return match;
    note("private-key");
    const newline = ["\r\n", "\n", "\\r\\n", "\\n"].find((candidate) => body.startsWith(candidate));
    return `${header}${newline}${marker("private-key")}${footer}`;
  });
  for (const { id, regex } of TOKEN_RULES) {
    out = out.replace(regex, () => {
      note(id);
      return marker(id);
    });
  }
  out = out.replace(URL_CREDENTIALS, (match, userPart, password) => {
    if (isPlaceholder(password)) return match;
    note("url-password");
    return `${userPart}${marker("url-password")}@`;
  });
  out = out.replace(AUTH_HEADER, (match, scheme, token) => {
    if (isPlaceholder(token)) return match;
    note("bearer-token");
    return `${scheme}${marker("bearer-token")}`;
  });
  out = out
    .split("\n")
    .map((line) => {
      const cr = line.endsWith("\r") ? "\r" : "";
      return redactLine(cr ? line.slice(0, -1) : line, note, sensitiveFile) + cr;
    })
    .join("\n");
  return { text: out, kinds };
}

/**
 * Censura cada string de un valor JSON y conserva su forma: el host descarta
 * una salida reescrita que no coincide con la de la herramienta. Devuelve el
 * mismo objeto cuando no hay nada que censurar.
 */
function redactDeep(value, options = {}) {
  const kinds = [];
  const walk = (current) => {
    if (typeof current === "string") {
      const result = redactSecrets(current, options);
      for (const kind of result.kinds) if (!kinds.includes(kind)) kinds.push(kind);
      return result.text;
    }
    if (Array.isArray(current)) {
      const next = current.map(walk);
      return next.some((item, index) => item !== current[index]) ? next : current;
    }
    if (current && typeof current === "object") {
      let changed = false;
      const next = {};
      for (const [key, item] of Object.entries(current)) {
        next[key] = walk(item);
        if (next[key] !== item) changed = true;
      }
      return changed ? next : current;
    }
    return current;
  };
  return { value: walk(value), kinds };
}

function containsRedactionMarker(text) {
  return typeof text === "string" && MARKER_RE.test(text);
}

/**
 * True cuando, tras censurar `content`, el escáner de secret-scan.js no
 * encuentra nada fuera de los marcadores: la censura cubre todo lo que antes
 * pedía confirmación. PreToolUse solo deja de preguntar en ese caso. Una clave
 * privada nunca queda cubierta: una lectura parcial (offset, Grep) devuelve
 * líneas del cuerpo sin la cabecera que las delata.
 */
function isCoveredByRedaction(content, options = {}) {
  const { text, kinds } = redactSecrets(content, options);
  if (kinds.includes("private-key")) return false;
  for (const { regex } of KNOWN_TOKEN_PATTERNS) {
    if (regex.test(text)) return false;
  }
  const generic = new RegExp(GENERIC_CREDENTIAL_REGEX.source, "gi");
  for (const match of text.matchAll(generic)) {
    if (!containsRedactionMarker(match[0])) return false;
  }
  return true;
}

module.exports = {
  MARKER_PREFIX,
  containsRedactionMarker,
  isCoveredByRedaction,
  redactDeep,
  redactSecrets,
};
