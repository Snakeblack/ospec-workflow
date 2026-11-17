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
 *   no censurar etiquetas (`"password": "Contraseña"`);
 * - el valor de un `key` a secas (`"Key"` en un appsettings) solo cuando es
 *   un token opaco: 16 caracteres alfanuméricos seguidos o más. Un `key` con
 *   un prefijo que no califica (`cache_key`, `root_cause_key`) no se censura;
 * - los pares `nombre=valor` de una cadena de conexión (`Password=…`,
 *   `AccountKey=…`), también con una contraseña solo de letras cuando el par
 *   va entre `;` y la línea tiene otra clave de conexión (`Server=`, `Host=`);
 * - en un fichero de configuración (isConfigFile), además, las asignaciones
 *   sin comillas en minúsculas con la misma forma (`api_key: …`) y una
 *   contraseña de 4 caracteres o más aunque sea solo de letras
 *   (`password: …`, `"Password": "…"`).
 *
 * PARIDAD: internal/hooks/secretredact.go es el espejo Go; ambos pasan el
 * corpus internal/testdata/secret-redaction/cases.json. Las expresiones evitan
 * lookbehind, retrorreferencias y `\s` para comportarse igual en RE2.
 */

const {
  KNOWN_TOKEN_PATTERNS,
  MARKER_PREFIX,
  classifySensitiveFile,
  findGenericCredentials,
  isConfigFile,
  isOpaqueToken,
  isPlaceholder,
  isStrictSecret,
  keyWordClass,
  keyWords,
  scanContentForSecrets,
} = require("./secret-scan.js");

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
// En un fichero de configuración el valor sin comillas llega hasta el blanco:
// `#`, `;` y `,` son parte de él, y solo tras un blanco abren un comentario.
// Una comilla lo descarta: es el texto de una cadena, no un valor.
const CONFIG_FILE_ASSIGN = /(^|[\t :|→])([A-Za-zñÑ_][A-Za-z0-9ñÑ_.-]*)([ \t]*[:=][ \t]*)([^ \t\f"'#][^ \t\f"']*)([ \t]+[#;].*|[ \t]*)$/g;
const QUOTED_ASSIGN = /(^|[^A-Za-z0-9ñÑ_.$-])(?:"([A-Za-zñÑ_][A-Za-z0-9ñÑ_.-]*)"|'([A-Za-zñÑ_][A-Za-z0-9ñÑ_.-]*)'|([A-Za-zñÑ_][A-Za-z0-9ñÑ_.-]*))[ \t]*(?::=|=>|:|=)[ \t]*(?:"([^"]*)"|'([^']*)')/g;
// Un par `nombre=valor` sin espacios ni comillas: los de una cadena de
// conexión (`Server=db;Password=…`), las opciones separadas por comas de Redis
// y un `password=…` en minúsculas. El valor acaba en el separador.
const CONNECTION_PAIR = /(^|[;,"' \t])([A-Za-z][A-Za-z0-9_.]*)=([^;,"' \t(){}[\]<>&]+)/g;
// Otra clave de una cadena de conexión en la misma línea.
const CONNECTION_KEY = /(?:^|[;"' \t])(?:server|data source|host|hostname|database|initial catalog|user id|uid|user|username|accountname|endpoint|defaultendpointsprotocol)[ \t]*=/i;

/**
 * Por la última palabra: `DB_PASSWORD`, `apiKey` o `client_secret` sí;
 * `max_tokens`, `primary_key` o `passwordField` no. Con `anyWord` (un `.env`)
 * basta cualquier palabra: `SECRET_KEY_BASE`.
 */
function isSensitiveKey(key, anyWord = false) {
  const words = keyWords(key);
  if (words.length === 0) return false;
  const sensitive = (index) => ["human", "machine"].includes(keyWordClass(words, index));
  return anyWord ? words.some((_word, index) => sensitive(index)) : sensitive(words.length - 1);
}

/**
 * Un `key` a secas (`key`, `"Key"`). Con `unqualified` (el pre-commit) también
 * un `key` con un prefijo desconocido (`azure_openai_key`).
 */
function isGenericKey(key, unqualified = false) {
  const words = keyWords(key);
  const kind = words.length > 0 ? keyWordClass(words, words.length - 1) : null;
  return kind === "generic" || (unqualified && kind === "unqualified");
}

/** Asignación en código o configuración: el valor debe tener la forma que pide el nombre. */
function isAssignedSecret(key, value, unqualified = false) {
  return (isSensitiveKey(key) && isStrictSecret(value)) || (isGenericKey(key, unqualified) && isOpaqueToken(value));
}

/**
 * Un nombre de contraseña: lo que elige una persona. `secret` queda fuera,
 * porque también nombra un objeto (el `existingSecret` de un chart), y sigue
 * pidiendo forma de secreto.
 */
function isPasswordKey(key) {
  const words = keyWords(key);
  const last = words.length - 1;
  return last >= 0 && keyWordClass(words, last) === "human" && !words[last].endsWith("secret");
}

/**
 * Contraseña de un fichero de configuración: 4 caracteres o más, sin blancos
 * (una frase es una etiqueta) y que no sea referencia ni placeholder. Como en
 * un `.env`, un valor que contiene `password` o `secret` sí cuenta.
 */
function isConfigPassword(value) {
  return [...value].length >= 4 && !/[ \t]/.test(value) && !isPlaceholder(value, false);
}

/** Asignación de un fichero de configuración: la de código, o una contraseña. */
function isConfigSecret(key, value, unqualified = false) {
  return isAssignedSecret(key, value, unqualified) || (isPasswordKey(key) && isConfigPassword(value));
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

function unquote(value) {
  const quote = value[0];
  return (quote === '"' || quote === "'") && value.length >= 2 && value[value.length - 1] === quote
    ? { quote, inner: value.slice(1, -1) }
    : { quote: "", inner: value };
}

function redactLine(line, note, { sensitiveFile, unqualified, configFile }) {
  let out = line;
  if (configFile || sensitiveFile) {
    out = out.replace(CONFIG_FILE_ASSIGN, (match, _prefix, key, _separator, value, trailing) => {
      if (!isConfigSecret(key, value, unqualified)) return match;
      note("assigned-secret");
      return `${match.slice(0, match.length - value.length - trailing.length)}${marker("assigned-secret")}${trailing}`;
    });
  }
  out = out.replace(DOTENV_ASSIGN, (match, prefix, _export, key, value) => {
    const { quote, inner } = unquote(value);
    // Dentro de una cadena o una lista ("API_KEY=x" en un test, el Env de
    // docker inspect) no es un .env: el valor debe parecer un secreto.
    const embedded = prefix !== "" && `"'[{,;`.includes(prefix);
    const secret = embedded
      ? isAssignedSecret(key, inner, unqualified)
      : (isSensitiveKey(key, true) && isEnvSecret(inner)) || (isGenericKey(key, unqualified) && isOpaqueToken(inner));
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
    if (!isAssignedSecret(key, value, unqualified)) return match;
    note("assigned-secret");
    return `${match.slice(0, match.length - value.length - trailing.length)}${marker("assigned-secret")}${trailing}`;
  });
  out = out.replace(CONNECTION_PAIR, (match, prefix, key, value, offset, whole) => {
    if (!isSensitiveKey(key)) return match;
    const delimited = prefix === ";" || whole[offset + match.length] === ";";
    const secret = delimited && CONNECTION_KEY.test(whole) ? isEnvSecret(value) : isStrictSecret(value);
    if (!secret) return match;
    note("assigned-secret");
    return `${match.slice(0, match.length - value.length)}${marker("assigned-secret")}`;
  });
  return out.replace(QUOTED_ASSIGN, (match, _prefix, dq, sq, bare, dv, sv) => {
    const key = dq ?? sq ?? bare;
    const value = dv ?? sv;
    const secret = isAssignedSecret(key, value, unqualified)
      || (sensitiveFile && ((isSensitiveKey(key, true) && isEnvSecret(value)) || isOpaqueValue(value)))
      || (configFile && isPasswordKey(key) && isConfigPassword(value));
    if (!secret) return match;
    note("assigned-secret");
    return `${match.slice(0, match.length - value.length - 1)}${marker("assigned-secret")}${match[match.length - 1]}`;
  });
}

/**
 * Censura los secretos de un texto. `sensitiveFile` (el texto viene de un
 * fichero que classifySensitiveFile marca por nombre) añade las asignaciones
 * sin comillas en minúsculas y los valores aleatorios de cualquier clave.
 * `configFile` (el texto viene de un fichero de configuración, isConfigFile)
 * añade solo las asignaciones sin comillas a un nombre sensible y las
 * contraseñas solo de letras: el resto del fichero se lee entero.
 * `unqualifiedKeys` es del pre-commit, no de la censura de salida: trata el
 * `key` con un prefijo desconocido como el `key` a secas.
 *
 * @returns {{text: *, kinds: string[]}} `kinds` lista cada tipo censurado una
 *   vez, en el orden en que se censuró. Un no-string vuelve tal cual.
 */
function redactSecrets(text, { sensitiveFile = false, configFile = false, unqualifiedKeys = false } = {}) {
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
      return redactLine(cr ? line.slice(0, -1) : line, note, { sensitiveFile, configFile, unqualified: unqualifiedKeys }) + cr;
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
  return findGenericCredentials(text).every(containsRedactionMarker);
}

/**
 * Lo que el pre-commit bloquea en una línea: lo que marca el escáner o
 * censura la censura en modo normal. Para el commit, la censura cuenta además
 * el `key` con un prefijo desconocido y un token opaco en todas sus formas
 * (clave entre comillas, `NOMBRE=valor`, `NOMBRE: valor`), que el escáner solo
 * ve con el nombre sin comillas y el valor entre comillas. Con `configFile`
 * (la línea es de un fichero de configuración) cuenta lo que la censura ve
 * en ese modo.
 *
 * @returns {string|null} el id del patrón o el tipo censurado
 */
function detectSecret(text, { configFile = false } = {}) {
  return scanContentForSecrets(text).patternId || redactSecrets(text, { unqualifiedKeys: true, configFile }).kinds[0] || null;
}

/**
 * Las opciones de censura de un texto que viene de estos ficheros, por sus
 * nombres: modo de fichero sensible si la clasificación marca alguno (un
 * directorio `id_service/` no es una clave) y modo de fichero de configuración.
 */
// The keys of a tool call PostToolUse takes the redaction mode from.
const REDACTION_PATH_KEYS = ["file_path", "filePath", "path", "notebook_path"];

function redactionOptionsFor(files, isDirectory = () => false) {
  return {
    sensitiveFile: files.some((file) => classifySensitiveFile(file, { directory: isDirectory(file) }) !== null),
    configFile: files.some(isConfigFile),
  };
}

module.exports = {
  MARKER_PREFIX,
  REDACTION_PATH_KEYS,
  containsRedactionMarker,
  detectSecret,
  isCoveredByRedaction,
  redactDeep,
  redactSecrets,
  redactionOptionsFor,
};
