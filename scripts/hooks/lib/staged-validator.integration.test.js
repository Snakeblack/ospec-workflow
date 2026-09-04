"use strict";

const assert = require("node:assert/strict");
const child_process = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  ALL_TARGETS,
  getStagedFiles,
  getStagedContent,
  checkStagedSyntax,
  runStagedChecks,
} = require("./staged-validator.js");

const PRE_COMMIT_HOOK_PATH = path.resolve(__dirname, "../pre-commit-hook.js");

let activeRepos = [];

function setupEphemeralRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-precommit-integration-"));
  activeRepos.push(tmpDir);

  child_process.spawnSync("git", ["init"], { cwd: tmpDir });
  child_process.spawnSync("git", ["config", "user.name", "Test User"], { cwd: tmpDir });
  child_process.spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: tmpDir });
  child_process.spawnSync("git", ["config", "commit.gpgsign", "false"], { cwd: tmpDir });

  // Scaffold minimal scripts/check.js so pre-commit-hook can execute it in tmpDir
  const scriptsDir = path.join(tmpDir, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  const validatorPath = path.resolve(__dirname, "staged-validator.js").replace(/\\/g, "/");
  fs.writeFileSync(
    path.join(scriptsDir, "check.js"),
    `"use strict";
const { runStagedChecks } = require(${JSON.stringify(validatorPath)});
const fs = require("node:fs");
const path = require("node:path");

const generatedTargets = [];
try {
  runStagedChecks({
    repoRoot: process.cwd(),
    runStep: () => {},
    generateTarget: (target) => {
      generatedTargets.push(target);
    },
  });
  if (generatedTargets.length > 0) {
    fs.writeFileSync(path.join(process.cwd(), ".generated-targets.json"), JSON.stringify(generatedTargets));
  }
  process.exit(0);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
`
  );

  return tmpDir;
}

function cleanupEphemeralRepo(tmpDir) {
  if (tmpDir && fs.existsSync(tmpDir)) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignorar errores transitorios de bloqueo en Windows
    }
  }
}

function runHook(tmpDir) {
  return child_process.spawnSync(process.execPath, [PRE_COMMIT_HOOK_PATH], {
    cwd: tmpDir,
    encoding: "utf8",
    env: {
      ...process.env,
      OSPEC_REPO_ROOT: tmpDir,
    },
  });
}

test.afterEach(() => {
  for (const repo of activeRepos) {
    cleanupEphemeralRepo(repo);
  }
  activeRepos = [];
});

test("setupEphemeralRepo creates a valid git repository with scaffolded check.js", () => {
  const tmpDir = setupEphemeralRepo();
  assert.ok(fs.existsSync(path.join(tmpDir, ".git")));
  assert.ok(fs.existsSync(path.join(tmpDir, "scripts", "check.js")));
});

test("integration: rejects commit when staged JS has broken syntax and working tree is clean [REQ-git-precommit-hook-003]", () => {
  const tmpDir = setupEphemeralRepo();
  const filePath = path.join(tmpDir, "index.js");

  // 1. Escribir sintaxis rota y agregar al stage
  fs.writeFileSync(filePath, "const broken = ;", "utf8");
  child_process.spawnSync("git", ["add", "index.js"], { cwd: tmpDir });

  // 2. Corregir el archivo en el working tree sin preparar (unstaged)
  fs.writeFileSync(filePath, "const valid = 1;\nconsole.log(valid);", "utf8");

  // 3. Ejecutar el flujo de pre-commit
  const res = runHook(tmpDir);
  assert.equal(res.status, 1, `Expected exit code 1 but got ${res.status}. Output: ${res.stdout}\nStderr: ${res.stderr}`);
  assert.match(
    res.stderr + res.stdout,
    /Error de sintaxis en archivos staged/i,
    "Expected syntax error message in pre-commit output"
  );
});

test("integration: permits commit when staged JS has valid syntax and working tree has broken syntax [REQ-git-precommit-hook-003]", () => {
  const tmpDir = setupEphemeralRepo();
  const filePath = path.join(tmpDir, "app.js");

  // 1. Escribir sintaxis válida y agregar al stage
  fs.writeFileSync(filePath, "const valid = 42;\nfunction getAnswer() { return valid; }\n", "utf8");
  child_process.spawnSync("git", ["add", "app.js"], { cwd: tmpDir });

  // 2. Introducir sintaxis rota en working tree sin preparar
  fs.writeFileSync(filePath, "const broken = ;;;", "utf8");

  // 3. Ejecutar el flujo de pre-commit
  const res = runHook(tmpDir);
  assert.equal(res.status, 0, `Expected exit code 0 but got ${res.status}. Output: ${res.stdout}\nStderr: ${res.stderr}`);
  assert.match(
    res.stdout,
    /Validación completada\. Commit permitido\./,
    "Expected success message in pre-commit output"
  );
});

test("integration: blocks commit when API secret is staged and working tree is clean [REQ-agent-shield-security-001]", () => {
  const tmpDir = setupEphemeralRepo();
  const filePath = path.join(tmpDir, "config.json");

  // 1. Escribir archivo con secreto de OpenAI y preparar en índice
  const secretKey = "sk-" + "x".repeat(48);
  fs.writeFileSync(filePath, JSON.stringify({ configItem: secretKey }, null, 2), "utf8");
  child_process.spawnSync("git", ["add", "config.json"], { cwd: tmpDir });

  // 2. Limpiar el archivo en working tree sin agregarlo a stage
  fs.writeFileSync(filePath, JSON.stringify({ configItem: "clean-no-secret" }, null, 2), "utf8");

  // 3. Ejecutar pre-commit
  const res = runHook(tmpDir);
  assert.equal(res.status, 1, `Expected exit code 1 but got ${res.status}. Output: ${res.stdout}\nStderr: ${res.stderr}`);
  assert.match(
    res.stderr,
    /Se detectó una credencial o clave secreta en archivo staged/i,
    "Expected secret banner in pre-commit error output"
  );
});

test("integration: permits commit when staged file is clean and secret is in working tree [REQ-agent-shield-security-001]", () => {
  const tmpDir = setupEphemeralRepo();
  const filePath = path.join(tmpDir, "config.json");

  // 1. Escribir archivo limpio y preparar en índice
  fs.writeFileSync(filePath, JSON.stringify({ configItem: "clean-initial-value" }, null, 2), "utf8");
  child_process.spawnSync("git", ["add", "config.json"], { cwd: tmpDir });

  // 2. Añadir secreto en working tree sin preparar en índice
  const secretKey = "sk-" + "x".repeat(48);
  fs.writeFileSync(filePath, JSON.stringify({ configItem: secretKey }, null, 2), "utf8");

  // 3. Ejecutar pre-commit
  const res = runHook(tmpDir);
  assert.equal(res.status, 0, `Expected exit code 0 but got ${res.status}. Output: ${res.stdout}\nStderr: ${res.stderr}`);
  assert.match(
    res.stdout,
    /Validación completada\. Commit permitido\./,
    "Expected success message in pre-commit output"
  );
});

test("integration: fail-closed blocks commit when Git staged blob is unreadable or corrupted [REQ-git-precommit-hook-003, REQ-agent-shield-security-001]", () => {
  const tmpDir = setupEphemeralRepo();
  const filePath = path.join(tmpDir, "blob-to-corrupt.txt");
  fs.writeFileSync(filePath, "valid content before corruption", "utf8");
  child_process.spawnSync("git", ["add", "blob-to-corrupt.txt"], { cwd: tmpDir });

  // Corrupt the staged blob object in .git/objects
  const lsRes = child_process.spawnSync("git", ["ls-files", "-s", "blob-to-corrupt.txt"], {
    cwd: tmpDir,
    encoding: "utf8",
  });
  const parts = lsRes.stdout.trim().split(/\s+/);
  const hash = parts[1];
  assert.ok(hash, "Expected object hash for staged file");

  const objDir = path.join(tmpDir, ".git", "objects", hash.slice(0, 2));
  const objFile = path.join(objDir, hash.slice(2));
  assert.ok(fs.existsSync(objFile), "Expected loose object file to exist");
  try {
    fs.chmodSync(objFile, 0o666);
  } catch {
    // ignore
  }
  fs.writeFileSync(objFile, "corrupted-git-object");

  const res = runHook(tmpDir);
  assert.equal(res.status, 1, `Expected exit code 1. Output: ${res.stdout}\nStderr: ${res.stderr}`);
  assert.match(
    res.stderr + res.stdout,
    /OSPEC-PRECOMMIT ERROR: No se pudo inspeccionar el contenido staged de blob-to-corrupt\.txt/,
    "Expected fail-closed error banner for unreadable staged blob"
  );
});

test("integration: fail-closed blocks commit when Git index is corrupted [REQ-git-precommit-hook-003, REQ-agent-shield-security-001]", () => {
  const tmpDir = setupEphemeralRepo();
  const filePath = path.join(tmpDir, "file.txt");
  fs.writeFileSync(filePath, "content", "utf8");
  child_process.spawnSync("git", ["add", "file.txt"], { cwd: tmpDir });

  // Corrupt .git/index
  const indexPath = path.join(tmpDir, ".git", "index");
  fs.writeFileSync(indexPath, "CORRUPT_GIT_INDEX_DATA");

  const res = runHook(tmpDir);
  assert.equal(res.status, 1, `Expected exit code 1. Output: ${res.stdout}\nStderr: ${res.stderr}`);
  assert.match(
    res.stderr + res.stdout,
    /OSPEC-PRECOMMIT ERROR/,
    "Expected fail-closed error when Git index is corrupted"
  );
});

test("integration: staging canonical generator input triggers ALL_TARGETS build in ephemeral repo [REQ-git-precommit-hook-001, REQ-git-precommit-hook-003]", () => {
  const tmpDir = setupEphemeralRepo();
  const agentDir = path.join(tmpDir, "agents");
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(agentDir, "test.agent.md"), "# Test Agent\n", "utf8");
  child_process.spawnSync("git", ["add", "agents/test.agent.md"], { cwd: tmpDir });

  const res = runHook(tmpDir);
  assert.equal(res.status, 0, `Expected exit code 0. Output: ${res.stdout}\nStderr: ${res.stderr}`);

  const targetsRecord = path.join(tmpDir, ".generated-targets.json");
  assert.ok(fs.existsSync(targetsRecord), "Expected .generated-targets.json to be generated");
  const targets = JSON.parse(fs.readFileSync(targetsRecord, "utf8"));
  assert.deepEqual(targets, ALL_TARGETS, "Expected all 7 targets to be generated when canonical generator input is staged");
});

test("integration: staging isolated target validator triggers only that target in ephemeral repo [REQ-git-precommit-hook-001, REQ-git-precommit-hook-003]", () => {
  const tmpDir = setupEphemeralRepo();
  const cfgDir = path.join(tmpDir, "scripts", "configure");
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(path.join(cfgDir, "validate-cursor.js"), "const x = 1;\n", "utf8");
  child_process.spawnSync("git", ["add", "scripts/configure/validate-cursor.js"], { cwd: tmpDir });

  const res = runHook(tmpDir);
  assert.equal(res.status, 0, `Expected exit code 0. Output: ${res.stdout}\nStderr: ${res.stderr}`);

  const targetsRecord = path.join(tmpDir, ".generated-targets.json");
  assert.ok(fs.existsSync(targetsRecord), "Expected .generated-targets.json to be generated");
  const targets = JSON.parse(fs.readFileSync(targetsRecord, "utf8"));
  assert.deepEqual(targets, ["cursor"], "Expected only cursor to be generated for isolated validator");
});
