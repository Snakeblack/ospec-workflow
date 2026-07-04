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
  KNOWN_TOKEN_PATTERNS,
  GENERIC_CREDENTIAL_REGEX,
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

test("classifySensitiveFile: archivos comunes → null", () => {
  for (const name of ["index.js", "README.md", "config.yaml", "id_card.md", "environment.ts"]) {
    assert.equal(classifySensitiveFile(path.join("repo", name)), null, name);
  }
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
];

for (const [expectedId, sample] of KNOWN_TOKEN_SAMPLES) {
  test(`scanContentForSecrets: detecta ${expectedId}`, () => {
    const result = scanContentForSecrets(sample);
    assert.equal(result.matched, true);
    assert.equal(result.patternId, expectedId);
  });
}

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
  'private_key: "-----BEGIN"',
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

test("GENERIC_CREDENTIAL_REGEX: keyword al inicio de línea posterior sí dispara", () => {
  const sample = 'línea uno\npassword: "superSecretAdmin123"';
  assert.equal(GENERIC_CREDENTIAL_REGEX.test(sample), true);
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
