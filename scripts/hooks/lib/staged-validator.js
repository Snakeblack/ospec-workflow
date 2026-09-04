"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const child_process = require("node:child_process");

/**
 * Obtiene la lista de archivos staged (agregados, copiados, modificados, renombrados).
 *
 * @param {string} repoRoot
 * @param {object} [deps]
 * @returns {string[]}
 */
function getStagedFiles(repoRoot, deps = {}) {
  const spawn = deps.spawnSync || child_process.spawnSync;
  try {
    const res = spawn("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (res.error || res.status !== 0) {
      return [];
    }
    return res.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Extrae el contenido de un archivo preparado en el índice de Git mediante `git show :<path>`.
 * Normaliza la ruta relativa a formato POSIX con '/' para compatibilidad multiplataforma.
 *
 * @param {string} repoRoot - Ruta absoluta de la raíz del repositorio.
 * @param {string} relativePath - Ruta relativa del archivo dentro del repositorio.
 * @param {object} [deps] - Inyección de dependencias para testing (spawnSync).
 * @returns {string|null} - Contenido UTF-8 del blob en el índice, o null si falla la lectura.
 */
function getStagedContent(repoRoot, relativePath, deps = {}) {
  if (!relativePath || typeof relativePath !== "string") {
    return null;
  }
  const spawn = deps.spawnSync || child_process.spawnSync;
  const rel = path.isAbsolute(relativePath) ? path.relative(repoRoot, relativePath) : relativePath;
  const posixPath = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!posixPath) {
    return null;
  }
  try {
    const res = spawn("git", ["show", `:${posixPath}`], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: false,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (res.error || res.status !== 0) {
      return null;
    }
    return res.stdout;
  } catch {
    return null;
  }
}

/**
 * Valida la sintaxis de los archivos staged (JS vía vm.Script en memoria, JSON vía JSON.parse).
 * Operación en memoria sin spawnear subprocesos, ultra-rápida (<1ms por archivo).
 *
 * @param {string[]} stagedFiles
 * @param {string} repoRoot
 * @param {object} [deps]
 * @returns {{ file: string, error: string, type: string }[]}
 */
function checkStagedSyntax(stagedFiles, repoRoot, deps = {}) {
  const errors = [];

  for (const file of stagedFiles) {
    const ext = path.extname(file).toLowerCase();
    if (ext !== ".js" && ext !== ".mjs" && ext !== ".cjs" && ext !== ".json") {
      continue;
    }

    const content = typeof deps.getStagedContent === "function"
      ? deps.getStagedContent(repoRoot, file, deps)
      : getStagedContent(repoRoot, file, deps);

    if (content === null || typeof content !== "string") continue;

    if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
      try {
        new vm.Script(content, { filename: file });
      } catch (err) {
        errors.push({ file, error: err.message, type: "js-syntax" });
      }
    } else if (ext === ".json") {
      try {
        JSON.parse(content);
      } catch (err) {
        errors.push({ file, error: err.message, type: "json-syntax" });
      }
    }
  }

  return errors;
}

function toPosixPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function isCoreInfraFile(normalizedPath) {
  const lower = normalizedPath.toLowerCase();
  if (lower === "scripts/check.js") return true;
  if (
    lower.startsWith("scripts/lib/") &&
    !lower.startsWith("scripts/lib/contract-checkers/")
  ) {
    return true;
  }
  return false;
}

/**
 * Mapea los archivos staged a los archivos de prueba que deben ejecutarse.
 *
 * @param {string[]} stagedFiles
 * @param {string} repoRoot
 * @param {object} [deps]
 * @returns {string[]}
 */
function findAffectedTests(stagedFiles, repoRoot, deps = {}) {
  for (const file of stagedFiles) {
    const normalized = toPosixPath(file);
    if (isCoreInfraFile(normalized)) {
      return ["scripts/**/*.test.js"];
    }
  }

  const fsImpl = deps.fs || fs;
  const testsToRun = new Set();
  let needsContractLint = false;
  let needsDocsLint = false;

  for (const file of stagedFiles) {
    const normalized = toPosixPath(file);
    const lower = normalized.toLowerCase();
    const base = path.basename(file).toLowerCase();

    // 1. Si el archivo staged es directamente un test
    if (base.endsWith(".test.js")) {
      const relPath = toPosixPath(path.relative(repoRoot, path.resolve(repoRoot, file)));
      testsToRun.add(relPath);
      continue;
    }

    // 2. Si es archivo de código JS, buscar su test correspondiente
    if (lower.endsWith(".js")) {
      const dir = path.dirname(normalized);
      const name = path.basename(normalized, ".js");

      const candidates = [
        path.posix.join(dir, `${name}.test.js`),
        path.posix.join("scripts", `${name}.test.js`),
      ];

      if (dir.startsWith("scripts/lib")) {
        const relativeSubdir = dir.slice("scripts/lib".length).replace(/^\//, "");
        if (relativeSubdir) {
          candidates.push(path.posix.join("scripts", relativeSubdir, `${name}.test.js`));
        }
      }

      for (const cand of candidates) {
        const candAbs = path.resolve(repoRoot, cand);
        if (fsImpl.existsSync(candAbs)) {
          testsToRun.add(cand);
        }
      }

      if (lower.startsWith("scripts/configure/")) {
        testsToRun.add("scripts/configure/cli.test.js");
      }
    }

    // 3. Si toca contratos, skills, agentes, reglas, openspec o hooks centrales
    if (
      lower.startsWith("agents/") ||
      lower.startsWith("skills/") ||
      lower.startsWith("rules/") ||
      lower.startsWith("openspec/") ||
      lower.startsWith("commands/") ||
      lower.startsWith("profiles/") ||
      lower === "package.json" ||
      lower === "hooks/hooks.json" ||
      lower.startsWith("scripts/lib/contract-checkers/")
    ) {
      needsContractLint = true;
      needsDocsLint = true;
    }

    // 4. Si toca documentación markdown
    if (lower.startsWith("docs/") || lower.endsWith(".md")) {
      needsDocsLint = true;
    }
  }

  if (needsContractLint) {
    testsToRun.add("scripts/contract-lint.test.js");
  }
  if (needsDocsLint) {
    testsToRun.add("scripts/docs-lint.test.js");
  }

  // Fallback seguro: si no se encontró ningún test específico o no hay archivos staged,
  // ejecutar el lint de contratos y documentación para garantizar integridad del workspace.
  if (testsToRun.size === 0) {
    testsToRun.add("scripts/contract-lint.test.js");
    testsToRun.add("scripts/docs-lint.test.js");
  }

  return Array.from(testsToRun);
}

const ALL_TARGETS = [
  "claude",
  "vscode",
  "github-copilot",
  "opencode",
  "codex",
  "cursor",
  "antigravity",
];

const SHARED_TARGET_INFRASTRUCTURE = [
  "scripts/configure/cli.js",
  "scripts/configure/install-engine.js",
  "scripts/configure/install-target.js",
  "scripts/configure/validate-phase.js",
  "scripts/lib/target-transform.js",
  "models.yaml",
];

function isSharedTargetInfra(normalizedPath) {
  const lower = normalizedPath.toLowerCase();
  if (SHARED_TARGET_INFRASTRUCTURE.includes(lower)) return true;
  if (lower.startsWith("scripts/lib/target-profiles/")) return true;
  return false;
}

/**
 * Identifica si algún archivo staged requiere validar la generación de un target específico.
 *
 * @param {string[]} stagedFiles
 * @returns {string[]}
 */
function findAffectedTargets(stagedFiles) {
  for (const file of stagedFiles) {
    const normalized = toPosixPath(file);
    if (isSharedTargetInfra(normalized)) {
      return [...ALL_TARGETS];
    }
  }

  const targets = new Set();
  for (const file of stagedFiles) {
    const lower = toPosixPath(file).toLowerCase();
    if (!lower.startsWith("scripts/configure/")) continue;

    // Mapeo específico por target en scripts/configure/
    // Nota: claude-marketplace, install-global-copilot e install-global-opencode divergen
    // del patrón estándar validate-*/install-* debido a la estructura histórica de scripts/configure.
    if (lower.includes("validate-antigravity") || lower.includes("install-antigravity")) targets.add("antigravity");
    if (lower.includes("validate-cursor") || lower.includes("install-cursor")) targets.add("cursor");
    if (lower.includes("validate-codex") || lower.includes("install-codex")) targets.add("codex");
    if (lower.includes("validate-github-copilot") || lower.includes("install-global-copilot")) targets.add("github-copilot");
    if (lower.includes("validate-opencode") || lower.includes("install-global-opencode")) targets.add("opencode");
    if (lower.includes("claude-marketplace") || lower.includes("install-claude")) targets.add("claude");
    if (lower.includes("validate-vscode") || lower.includes("install-vscode")) targets.add("vscode");
  }
  return Array.from(targets);
}

/**
 * Ejecuta la suite diferencial/staged completa:
 * 1. Sintaxis en memoria
 * 2. Pruebas afectadas
 * 3. Builds de target afectados (si aplica)
 *
 * @param {object} options
 * @param {object} [deps]
 * @returns {{ ok: boolean, stagedFiles: string[], testsRun: string[], targetsRun: string[] }}
 */
function runStagedChecks(options = {}, deps = {}) {
  const repoRoot = options.repoRoot || path.resolve(__dirname, "../../..");
  const run = deps.runStep || options.runStep;
  const generate = deps.generateTarget || options.generateTarget;

  // 1. Archivos staged
  const stagedFiles = options.stagedFiles || getStagedFiles(repoRoot, deps);

  // 2. Comprobación sintáctica en memoria
  const syntaxErrors = checkStagedSyntax(stagedFiles, repoRoot, deps);
  if (syntaxErrors.length > 0) {
    const details = syntaxErrors
      .map((e) => `  - ${e.file} [${e.type}]: ${e.error}`)
      .join("\n");
    throw new Error(`Error de sintaxis en archivos staged:\n${details}`);
  }

  // 3. Tests afectados
  const testsToRun = findAffectedTests(stagedFiles, repoRoot, deps);
  if (testsToRun.length > 0 && run) {
    run(`Targeted tests (${testsToRun.length} files)`, ["--test", ...testsToRun], deps);
  }

  // 4. Targets afectados (solo si scripts/configure fue modificado)
  const affectedTargets = findAffectedTargets(stagedFiles);
  for (const target of affectedTargets) {
    if (generate) {
      generate(target, true, deps);
    }
  }

  return {
    ok: true,
    stagedFiles,
    testsRun: testsToRun,
    targetsRun: affectedTargets,
  };
}

module.exports = {
  ALL_TARGETS,
  getStagedFiles,
  getStagedContent,
  checkStagedSyntax,
  findAffectedTests,
  findAffectedTargets,
  runStagedChecks,
};
