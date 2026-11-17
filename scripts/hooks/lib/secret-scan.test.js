"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  classifySensitiveFile,
  scanContentForSecrets,
  scanFileForSecrets,
  findGenericCredentials,
  keyWordClass,
  keyWords,
  KNOWN_TOKEN_PATTERNS,
  MAX_SCAN_SIZE_BYTES,
} = require("./secret-scan.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withTempFile(t, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "secret-scan-"));
  const filePath = path.join(dir, "sample.txt");
  fs.writeFileSync(filePath, content, "utf8");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return filePath;
}

// ---------------------------------------------------------------------------
// classifySensitiveFile — deny/ask por nombre de archivo
// ---------------------------------------------------------------------------

test("classifySensitiveFile: claves SSH privadas → deny private-key", () => {
  for (const name of ["id_rsa", "id_ecdsa", "id_ed25519", "id_deploy.pem", "id_deploy.key"]) {
    const result = classifySensitiveFile(path.join("/home/user/.ssh", name));
    assert.deepEqual(result, { action: "deny", kind: "private-key" }, name);
  }
});

test("classifySensitiveFile: .git/config del workspace → deny git-config", () => {
  const result = classifySensitiveFile(path.join("repo", ".git", "config"));
  assert.deepEqual(result, { action: "deny", kind: "git-config" });
});

test("classifySensitiveFile: en Windows .git/config cuenta con cualquiera de las dos barras", (t) => {
  if (path.sep === "/") assert.equal(classifySensitiveFile(".git\\config/config"), null);
  // Las funciones de ruta que el hook usa en Windows.
  const { sep } = path;
  t.after(() => { path.sep = sep; });
  path.sep = path.win32.sep;
  t.mock.method(path, "basename", path.win32.basename);
  t.mock.method(path, "join", path.win32.join);
  for (const file of [".git/config", "repo\\.git\\config", "C:\\repo\\.git/config"]) {
    assert.deepEqual(classifySensitiveFile(file), { action: "deny", kind: "git-config" }, file);
  }
  assert.equal(classifySensitiveFile("repo\\config"), null);
});

test("classifySensitiveFile: .npmrc → deny npmrc", () => {
  const result = classifySensitiveFile("/home/user/.npmrc");
  assert.deepEqual(result, { action: "deny", kind: "npmrc" });
});

test("classifySensitiveFile: archivos .env* → ask env-file", () => {
  for (const name of [".env", ".env.local", ".env.production"]) {
    const result = classifySensitiveFile(path.join("repo", name));
    assert.deepEqual(result, { action: "ask", kind: "env-file" }, name);
  }
});

test("classifySensitiveFile: secrets.json y credentials → ask secrets-file", () => {
  for (const name of ["secrets.json", "credentials"]) {
    const result = classifySensitiveFile(path.join("repo", name));
    assert.deepEqual(result, { action: "ask", kind: "secrets-file" }, name);
  }
});

test("classifySensitiveFile: cualquier .key es clave privada; un .pem suelto no", () => {
  assert.deepEqual(classifySensitiveFile(path.join("repo", "server.key")), { action: "deny", kind: "private-key" });
  assert.equal(classifySensitiveFile(path.join("repo", "server.pem")), null);
  assert.equal(classifySensitiveFile(path.join("repo", "public.pem")), null);
});

test("classifySensitiveFile: archivos comunes → null", () => {
  for (const name of ["index.js", "README.md", "config.yaml", "id_card.md", "environment.ts"]) {
    assert.equal(classifySensitiveFile(path.join("repo", name)), null, name);
  }
});

test("scanContentForSecrets: una cabecera de clave privada pide revisión; un certificado no", () => {
  const header = (label = "") => `-----BEGIN ${label}PRIVATE KEY-----`;
  for (const content of [
    `${header()}\nabc\n-----END PRIVATE KEY-----`,
    header("RSA "),
    header("OPENSSH "),
    header("EC "),
  ]) {
    assert.deepEqual(scanContentForSecrets(content), { matched: true, patternId: "private-key-header" }, content);
  }
  assert.deepEqual(
    scanContentForSecrets("-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----"),
    { matched: false, patternId: null },
  );
});

test("classifySensitiveFile: config fuera de .git no es git-config", () => {
  assert.equal(classifySensitiveFile(path.join("repo", "nginx", "config")), null);
});

// ---------------------------------------------------------------------------
// scanContentForSecrets — tokens conocidos
// ---------------------------------------------------------------------------

const KNOWN_TOKEN_SAMPLES = [
  ["openai-api-key", "const k = 'sk-" + "a".repeat(48) + "';"],
  ["google-api-key", "key=AIzaSy" + "B".repeat(33)],
  ["aws-access-key", "AWS_KEY=AKIA" + "Z".repeat(16)],
  ["slack-token", "token xoxb-1234567890abcd"],
  ["jwt", "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123-_"],
  // Construidos en tiempo de ejecución: un literal con formato real activaría
  // el push protection de GitHub.
  ...["p", "o", "u", "s", "r"].map((kind) => ["github-token", `GH_TOKEN=gh${kind}_${"aB3".repeat(12)}`]),
  ["github-fine-grained-token", `token: github_pat_${"A1b".repeat(7)}C_${"x9Y".repeat(19)}Zq`],
  ["anthropic-api-key", `ANTHROPIC_API_KEY=sk-ant-api03-${"Ab9_-".repeat(19)}AA`],
  ["openai-project-key", `OPENAI_API_KEY=sk-proj-${"Qw3-_e".repeat(10)}`],
];

for (const [expectedId, sample] of KNOWN_TOKEN_SAMPLES) {
  test(`scanContentForSecrets: detecta ${expectedId}`, () => {
    const result = scanContentForSecrets(sample);
    assert.equal(result.matched, true);
    assert.equal(result.patternId, expectedId);
  });
}

test("scanContentForSecrets: prefijos de token sin cuerpo válido no disparan", () => {
  for (const sample of [
    "ghp_short",
    "see the sk-project-plan document",
    `prefixghp_${"aB3".repeat(12)}`,
    `ghp_${"aB3".repeat(12)}x`,
    "sk-ant-api03-short",
    "github_pat_tooShort",
  ]) {
    assert.deepEqual(scanContentForSecrets(sample), { matched: false, patternId: null }, sample);
  }
});

test("KNOWN_TOKEN_PATTERNS: cada patrón tiene id y regex", () => {
  assert.ok(KNOWN_TOKEN_PATTERNS.length >= 5);
  for (const entry of KNOWN_TOKEN_PATTERNS) {
    assert.equal(typeof entry.id, "string");
    assert.ok(entry.regex instanceof RegExp);
  }
});

// ---------------------------------------------------------------------------
// scanContentForSecrets — credencial genérica (verdaderos positivos)
// ---------------------------------------------------------------------------

const GENERIC_TRUE_POSITIVES = [
  'password: "superSecretAdmin123"',
  "db_password = \"superSecretAdmin123\"",
  "api_key = 'abcdef123456'",
  'token: "abcdef123456"',
  'contraseña = "miClaveSegura"',
  // Una clave generada tiene forma de secreto: se construye en ejecución.
  'private_key: "' + "0x4c0883a6".repeat(4) + '"',
  'SECRET="deploy-secret-value"',
];

for (const sample of GENERIC_TRUE_POSITIVES) {
  test(`scanContentForSecrets: credencial genérica → matched: ${sample}`, () => {
    const result = scanContentForSecrets(sample);
    assert.equal(result.matched, true, sample);
    assert.equal(result.patternId, "generic-credential");
  });
}

// ---------------------------------------------------------------------------
// scanContentForSecrets — falsos positivos que NO deben disparar
// ---------------------------------------------------------------------------

const GENERIC_FALSE_POSITIVES = [
  // Keyword como substring de otra palabra (línea única)
  'monkey: "bananabanana"',
  'turkey = "deliciosa comida"',
  'compass: "north-north-west"',
  // Keyword y valor entre comillas en líneas distintas (docs/markdown)
  'Key rule: inject compact rules text when available.\n\nSee "skills/angular/SKILL.md" for details.',
  'The token budget advisor\nuses "150k-token" thresholds.',
  // Valor demasiado corto
  'secret = "short"',
  // Sin comillas
  "password = superSecretAdmin123",
];

for (const sample of GENERIC_FALSE_POSITIVES) {
  test(`scanContentForSecrets: no dispara falso positivo: ${JSON.stringify(sample).slice(0, 60)}`, () => {
    const result = scanContentForSecrets(sample);
    assert.equal(result.matched, false, sample);
  });
}

test("scanContentForSecrets: contenido vacío o no-string → no match", () => {
  assert.equal(scanContentForSecrets("").matched, false);
  assert.equal(scanContentForSecrets(null).matched, false);
  assert.equal(scanContentForSecrets(undefined).matched, false);
});

test("scanContentForSecrets: keyword al inicio de línea posterior sí dispara", () => {
  const sample = 'línea uno\npassword: "superSecretAdmin123"';
  assert.equal(scanContentForSecrets(sample).patternId, "generic-credential");
});

test("keyWordClass: la última palabra del nombre decide la regla del valor", () => {
  const classOf = (name) => {
    const words = keyWords(name);
    return keyWordClass(words, words.length - 1);
  };
  for (const [name, expected] of [
    ["password", "human"], ["dbPassword", "human"], ["DB_PASSWD", "human"], ["client-secret", "human"], ["contraseña", "human"],
    ["db_pass", "human"], ["pass", "machine"], ["accessToken", "machine"], ["API_KEY", "machine"], ["apikey", "machine"],
    ["private_key", "machine"], ["storage_account_key", "machine"], ["pwd", "machine"], ["credentials", "machine"],
    ["jwt_key", "machine"], ["key", "generic"], ["STORAGE_KEY", "unqualified"], ["azure_openai_key", "unqualified"],
    ["sortKey", null], ["cache_key", null], ["publicKey", null],
    ["monkey", null], ["compass", null], ["keyword", null], ["max_tokens", null], ["passwordField", null],
  ]) {
    assert.equal(classOf(name), expected, name);
  }
});

test("findGenericCredentials: una asignación dentro del valor de un nombre corriente también cuenta", () => {
  // Por partes: la línea entera tendría la forma que el pre-commit bloquea.
  const inner = ["password", "=", `'${"hunter".repeat(2)}'`].join(" ");
  assert.deepEqual(findGenericCredentials(`title = "the ${inner}"`), [inner]);
});

test("findGenericCredentials: una tira larga de caracteres de nombre no cuesta tiempo cuadrático", () => {
  const started = Date.now();
  assert.deepEqual(findGenericCredentials("aB3_".repeat(100000)), []);
  assert.ok(Date.now() - started < 5000);
});

// ---------------------------------------------------------------------------
// scanFileForSecrets — integración con filesystem
// ---------------------------------------------------------------------------

test("scanFileForSecrets: archivo con credencial → matched", (t) => {
  const filePath = withTempFile(t, 'db_password = "superSecretAdmin123"');
  const result = scanFileForSecrets(filePath);
  assert.equal(result.matched, true);
  assert.equal(result.patternId, "generic-credential");
});

test("scanFileForSecrets: archivo limpio → no matched", (t) => {
  const filePath = withTempFile(t, "console.log('hola mundo');");
  assert.equal(scanFileForSecrets(filePath).matched, false);
});

test("scanFileForSecrets: archivo inexistente → skipped unreadable, no throw", () => {
  const result = scanFileForSecrets(path.join(os.tmpdir(), "no-existe-" + Date.now()));
  assert.equal(result.matched, false);
  assert.equal(result.skipped, "unreadable");
});

test("scanFileForSecrets: archivo mayor al límite → skipped too-large", (t) => {
  const filePath = withTempFile(t, "x".repeat(MAX_SCAN_SIZE_BYTES + 1));
  const result = scanFileForSecrets(filePath);
  assert.equal(result.matched, false);
  assert.equal(result.skipped, "too-large");
});

test("MAX_SCAN_SIZE_BYTES: es 1MB (contrato de paridad con Go)", () => {
  assert.equal(MAX_SCAN_SIZE_BYTES, 1024 * 1024);
});
