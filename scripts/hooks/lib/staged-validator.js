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
 * @throws {Error} Si el comando git diff --cached falla o reporta código no cero.
 */
function getStagedFiles(repoRoot, deps = {}) {
  const spawn = deps.spawnSync || child_process.spawnSync;
  const res = spawn("git", ["-c", "core.quotepath=false", "diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (res.error) {
    throw new Error(`Error de Git al obtener archivos staged: ${res.error.message}`);
  }
  if (res.status !== 0) {
    const stderr = (res.stderr || "").trim();
    throw new Error(`git diff --cached falló con código ${res.status}: ${stderr}`);
  }
  return res.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Obtiene el tamaño en bytes de un blob staged en el índice mediante git cat-file -s.
 * Permite omitir archivos grandes antes de extraer su contenido en memoria.
 *
 * @param {string} repoRoot
 * @param {string} relativePath
 * @param {object} [deps]
 * @returns {number} Tamaño en bytes o 0 si no se puede determinar.
 */
function getStagedBlobSize(repoRoot, relativePath, deps = {}) {
  if (!relativePath || typeof relativePath !== "string") return 0;
  const clean = toPosixPath(path.isAbsolute(relativePath) ? path.relative(repoRoot, relativePath) : relativePath);
  if (!clean) return 0;
  const spawn = deps.spawnSync || child_process.spawnSync;
  try {
    const res = spawn("git", ["cat-file", "-s", `:${clean}`], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: false,
    });
    if (res.status === 0 && res.stdout) {
      const size = parseInt(res.stdout.trim(), 10);
      return Number.isFinite(size) ? size : 0;
    }
  } catch {
    return 0;
  }
  return 0;
}

/**
 * Extrae el contenido de un archivo preparado en el índice de Git mediante `git show :<path>`.
 * Normaliza la ruta relativa a formato POSIX con '/' para compatibilidad multiplataforma.
 *
 * @param {string} repoRoot - Ruta absoluta de la raíz del repositorio.
 * @param {string} relativePath - Ruta relativa del archivo dentro del repositorio.
 * @param {object} [deps] - Inyección de dependencias para testing (spawnSync).
 * @returns {string|null} - Contenido UTF-8 del blob en el índice, o null para submódulos.
 * @throws {Error} Si el argumento es inválido o git show :<path> falla.
 */
function getStagedContent(repoRoot, relativePath, deps = {}) {
  if (!relativePath || typeof relativePath !== "string") {
    throw new Error("Ruta relativa vacía o inválida para getStagedContent");
  }
  const clean = relativePath.replace(/\\/g, "/").replace(/^(\.\/|\/)+/, "");
  if (!clean) {
    throw new Error("Ruta relativa normalizada vacía para getStagedContent");
  }
  const rel = path.isAbsolute(relativePath) ? path.relative(repoRoot, relativePath) : clean;
  const posixPath = toPosixPath(rel);
  if (!posixPath) {
    throw new Error("Ruta relativa normalizada vacía para getStagedContent");
  }
  const spawn = deps.spawnSync || child_process.spawnSync;
  const res = spawn("git", ["show", `:${posixPath}`], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (res.error) {
    if (res.error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      throw new Error(`El archivo staged :${posixPath} excede el límite máximo de búfer de 10 MB`);
    }
    throw new Error(`Error al invocar git show para :${posixPath}: ${res.error.message}`);
  }
  if (res.status !== 0) {
    const stderr = (res.stderr || "").trim();
    if (stderr.includes("is a commit, not a blob")) {
      return null;
    }
    throw new Error(`git show :${posixPath} falló con código ${res.status}: ${stderr}`);
  }
  return res.stdout;
}

/**
 * Valida la sintaxis de un módulo ESM staged materializándolo en un archivo
 * temporal .mjs y ejecutando `node --check` (que parsea según la extensión).
 * vm.Script no soporta sintaxis de módulos (import/export), por eso .mjs
 * requiere este camino en lugar del fast path en memoria.
 *
 * @param {string} repoRoot
 * @param {string} file
 * @param {string} content
 * @param {object} deps
 * @returns {{ file: string, error: string, type: string }|null}
 */
function checkMjsSyntax(repoRoot, file, content, deps) {
  const fsImpl = deps.fs || fs;
  const os = require("node:os");
  const tmpDir = fsImpl.mkdtempSync(path.join(os.tmpdir(), "ospec-mjs-"));
  const tmpFile = path.join(tmpDir, "staged-check.mjs");
  try {
    fsImpl.writeFileSync(tmpFile, content, "utf8");
    const spawn = deps.spawnSync || child_process.spawnSync;
    const res = spawn(process.execPath, ["--check", tmpFile], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: false,
    });
    if (res.error) {
      throw new Error(`Error al invocar node --check para ${file}: ${res.error.message}`);
    }
    if (res.status !== 0) {
      const stderr = (res.stderr || "").trim();
      const lines = stderr.split(/\r?\n/).filter((l) => l.trim());
      // node --check emite la ruta del temporal y un caret antes del mensaje
      // útil; se prefiere la línea con el diagnóstico real.
      const diagLine = lines.find((l) => l.includes("SyntaxError")) || lines[0] || stderr;
      return { file, error: diagLine, type: "mjs-syntax" };
    }
    return null;
  } finally {
    try {
      fsImpl.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // El cleanup del temporal es best-effort; no debe enmascarar el resultado.
    }
  }
}

/**
 * Valida la sintaxis de los archivos staged (JS vía vm.Script en memoria, JSON vía JSON.parse,
 * .mjs vía node --check sobre el blob materializado).
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
    if (ext !== ".js" && ext !== ".cjs" && ext !== ".mjs" && ext !== ".json") {
      continue;
    }

    const content = typeof deps.getStagedContent === "function"
      ? deps.getStagedContent(repoRoot, file, deps)
      : getStagedContent(repoRoot, file, deps);

    if (content === null || typeof content !== "string") continue;

    if (ext === ".js" || ext === ".cjs") {
      try {
        new vm.Script(content, { filename: file });
      } catch (err) {
        const isEsmModeError =
          err.message.includes("Cannot use import statement outside a module") ||
          err.message.includes("Unexpected token 'export'");
        if (isEsmModeError && ext === ".js") {
          // .js: el contenido puede ser ESM legítimo; validar como módulo real
          // vía node --check (el mismo camino de .mjs). Un error real cancela.
          const esmError = checkMjsSyntax(repoRoot, file, content, deps);
          if (esmError) {
            errors.push({ ...esmError, type: "js-esm-syntax" });
          }
          continue;
        }
        errors.push({ file, error: err.message, type: "js-syntax" });
      }
    } else if (ext === ".mjs") {
      const mjsError = checkMjsSyntax(repoRoot, file, content, deps);
      if (mjsError) errors.push(mjsError);
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
  return String(filePath || "")
    .replace(/\\/g, "/")
    .replace(/^(\.\/|\/)+/, "");
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

const CANONICAL_SHARED_FILES = new Set([
  ".mcp.json",
  ".claude-plugin/plugin.json",
  "models.yaml",
  "scripts/configure/cli.js",
  "scripts/configure/install-engine.js",
  "scripts/configure/install-target.js",
  "scripts/configure/validate-phase.js",
  "scripts/lib/target-transform.js",
  "scripts/lib/frontmatter.js",
  "scripts/lib/model-resolver.js",
]);

const CANONICAL_SHARED_PREFIXES = [
  "agents/",
  "commands/",
  "rules/",
  "skills/",
  "hooks/",
  "schemas/kernel/",
  "scripts/lib/target-profiles/",
  "scripts/hooks/",
];

// Los módulos de scripts/lib/** se distribuyen dentro del runtime generado de los
// targets (gatherRuntimeScripts + dependencias transitivas de require). Cualquier
// lib de producción cambiada invalida todos los targets; sólo se excluyen tests
// y helpers de testing, que no forman parte del runtime distribuido.
function isProductionSharedLib(lower) {
  if (!lower.startsWith("scripts/lib/")) return false;
  if (lower.startsWith("scripts/lib/test-support/")) return false;
  if (lower.endsWith(".test.js")) return false;
  return true;
}

function isCanonicalOrSharedSource(normalizedPath) {
  const lower = normalizedPath.toLowerCase();
  if (CANONICAL_SHARED_FILES.has(lower)) return true;
  if (isProductionSharedLib(lower)) return true;
  for (const prefix of CANONICAL_SHARED_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  return false;
}

const isSharedTargetInfra = isCanonicalOrSharedSource;

/**
 * Identifica si algún archivo staged requiere validar la generación de un target específico.
 *
 * @param {string[]} stagedFiles
 * @returns {string[]}
 */
function findAffectedTargets(stagedFiles) {
  for (const file of stagedFiles) {
    const normalized = toPosixPath(file);
    if (isCanonicalOrSharedSource(normalized)) {
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
  getStagedBlobSize,
  getStagedContent,
  checkStagedSyntax,
  findAffectedTests,
  findAffectedTargets,
  runStagedChecks,
};
