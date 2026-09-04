"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

/**
 * Obtiene la lista de archivos staged (agregados, copiados, modificados, renombrados).
 *
 * @param {string} repoRoot
 * @param {object} [deps]
 * @returns {string[]}
 */
function getStagedFiles(repoRoot, deps = {}) {
  const spawn = deps.spawnSync || spawnSync;
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
 * Valida la sintaxis de los archivos staged (JS vía vm.Script en memoria, JSON vía JSON.parse).
 * Operación en memoria sin spawnear subprocesos, ultra-rápida (<1ms por archivo).
 *
 * @param {string[]} stagedFiles
 * @param {string} repoRoot
 * @param {object} [deps]
 * @returns {{ file: string, error: string, type: string }[]}
 */
function checkStagedSyntax(stagedFiles, repoRoot, deps = {}) {
  const fsImpl = deps.fs || fs;
  const errors = [];

  for (const file of stagedFiles) {
    const absPath = path.isAbsolute(file) ? file : path.join(repoRoot, file);
    if (!fsImpl.existsSync(absPath)) continue;

    const ext = path.extname(file).toLowerCase();
    if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
      try {
        const code = fsImpl.readFileSync(absPath, "utf8");
        new vm.Script(code, { filename: file });
      } catch (err) {
        errors.push({ file, error: err.message, type: "js-syntax" });
      }
    } else if (ext === ".json") {
      try {
        const content = fsImpl.readFileSync(absPath, "utf8");
        JSON.parse(content);
      } catch (err) {
        errors.push({ file, error: err.message, type: "json-syntax" });
      }
    }
  }

  return errors;
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
  const fsImpl = deps.fs || fs;
  const testsToRun = new Set();
  let needsContractLint = false;
  let needsDocsLint = false;

  for (const file of stagedFiles) {
    const normalized = file.replace(/\\/g, "/");
    const lower = normalized.toLowerCase();
    const base = path.basename(file).toLowerCase();

    // 1. Si el archivo staged es directamente un test
    if (base.endsWith(".test.js")) {
      const relPath = path.relative(repoRoot, path.resolve(repoRoot, file)).replace(/\\/g, "/");
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
        const sub = dir.slice("scripts/lib".length).replace(/^\//, "");
        if (sub) {
          candidates.push(path.posix.join("scripts", sub, `${name}.test.js`));
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

/**
 * Identifica si algún archivo staged requiere validar la generación de un target específico.
 *
 * @param {string[]} stagedFiles
 * @returns {string[]}
 */
function findAffectedTargets(stagedFiles) {
  const targets = new Set();
  for (const file of stagedFiles) {
    const lower = file.replace(/\\/g, "/").toLowerCase();
    if (!lower.startsWith("scripts/configure/")) continue;

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
  getStagedFiles,
  checkStagedSyntax,
  findAffectedTests,
  findAffectedTargets,
  runStagedChecks,
};
