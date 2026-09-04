# Design: Invalidación Completa de Targets y Modo Fail-Closed en Pre-commit

## Technical Approach

Este diseño técnico aborda las dos deficiencias identificadas en el hook pre-commit diferencial:
1. **Frontera exhaustiva de invalidación de targets (`findAffectedTargets`)**: Garantiza la compilación y validación de todos los targets soportados (`ALL_TARGETS`) ante modificaciones en cualquier entrada canónica del generador (`agents/**`, `commands/**`, `rules/**`, `skills/**`, `hooks/**`, `schemas/kernel/**`, `.mcp.json`, `.claude-plugin/plugin.json`, `models.yaml`), implementaciones y helpers compartidos (`scripts/configure/{cli,install-engine,install-target,validate-phase}.js`, `scripts/lib/{target-transform,frontmatter,model-resolver}.js`, `scripts/lib/target-profiles/**`) y hooks de runtime distribuidos (`scripts/hooks/**`). Solo cambios estrictamente limitados a instaladores o validadores de un único target en `scripts/configure/` procesarán un target aislado.
2. **Política Fail-Closed estricta en operaciones Git e inspección de secretos**: Modifica `getStagedFiles` y `getStagedContent` en `scripts/hooks/lib/staged-validator.js` para que ante cualquier fallo de Git (`git diff --cached`, `git show :<path>`) lancen excepciones `Error` explícitas en lugar de retornar colecciones vacías (`[]`) o `null`. En `scripts/hooks/pre-commit-hook.js`, se elimina el silenciamiento de fallos en el escaneo de secretos de AgentShield y Strict TDD, abortando la ejecución con código 1 y banner de error diagnóstico ante fallos al leer blobs o consultar el índice.

Esta solución mapea directamente a los requerimientos `REQ-git-precommit-hook-001`, `REQ-git-precommit-hook-003` y `REQ-agent-shield-security-001`.

---

## Architecture Decisions

### Decision: Frontera exhaustiva de invalidación de targets con fallback a ALL_TARGETS (ADR-001)

| Opción | Trade-off | Decisión |
|---|---|---|
| **Matriz canónica exhaustiva con fallback a ALL_TARGETS** | Compila los 7 targets ante cambios canónicos (~1-2s adicionales), pero garantiza paridad total en `dist/`. | **Seleccionada** |
| Análisis estático de grafos de dependencia por target | Menos builds pero altamente frágil ante cambios dinámicos; riesgo crítico de rotura silente. | Rechazada |
| Regenerar siempre todos los targets en cualquier commit | Elimina complejidad diferencial pero degrada severamente commits rápidos de documentación y fixes. | Rechazada |

- **Elección**: Agrupar en `staged-validator.js` un conjunto de prefijos canónicos (`agents/`, `commands/`, `rules/`, `skills/`, `hooks/`, `schemas/kernel/`, `scripts/lib/target-profiles/`, `scripts/hooks/`) y archivos raíz compartidos (`.mcp.json`, `.claude-plugin/plugin.json`, `models.yaml`, `scripts/lib/frontmatter.js`, `scripts/lib/model-resolver.js`, `scripts/lib/target-transform.js`, y generadores compartidos en `scripts/configure/`). Si algún archivo preparado coincide con estos patrones, `findAffectedTargets` retorna una copia de `ALL_TARGETS`.
- **Alternativas consideradas**: Detección granular archivo por archivo (descartada por fragilidad) o forzar full rebuild incondicional (descartada por impacto en la experiencia de desarrollo).
- **Razón**: Cualquier cambio en especificaciones canónicas de agentes o skills impacta a todos los artefactos empaquetados en `dist/`. La regeneración diferencial solo es segura si asume `ALL_TARGETS` ante cualquier cambio en el núcleo.

### Decision: Política fail-closed estricta ante errores de Git y blobs inaccesibles (ADR-002)

| Opción | Trade-off | Decisión |
|---|---|---|
| **Lanzar excepciones y abortar con código 1 (Fail-Closed)** | Commits bloqueados si el índice está corrupto o Git falla; previene bypass inadvertido de seguridad. | **Seleccionada** |
| Retornar `[]` y `null` con warnings en stderr (Fail-Open) | Permite continuar commits ante fallos de Git pero expone el repositorio a filtración de credenciales. | Rechazada |
| Reintentar operaciones de Git en bucle | Añade latencia sin solucionar errores deterministas de blobs o índices dañados. | Rechazada |

- **Elección**: Hacer que `getStagedFiles` lance un `Error` si `git diff --cached` falla o retorna código no cero; hacer que `getStagedContent` lance un `Error` si la ruta es inválida o `git show :<path>` falla. En `pre-commit-hook.js`, capturar fallos de `getStagedContent` durante el escaneo de secretos y abortar con código 1 emitiendo el mensaje `"OSPEC-PRECOMMIT ERROR: No se pudo inspeccionar el contenido staged de <path>"`. Se preservan los bypasses de emergencia explícitos (`DISABLE_AGENT_SHIELD=true`, `DISABLE_OSPEC_PRECOMMIT=true`, `git commit --no-verify`).
- **Alternativas consideradas**: Captura silenciosa con `continue` o warnings que no bloqueen el commit.
- **Razón**: La seguridad de AgentShield y la integridad de OpenSpec no admiten confirmación ciega si el subsistema de Git no puede garantizar qué contenido se está incluyendo.

---

## Data Flow

### Flujo General de Pre-commit (Fail-Closed & Invalidation)

```
git commit
    │
    ▼
pre-commit-hook.js
    │
    ├──> [Env Bypass]: DISABLE_OSPEC_PRECOMMIT === "true"? ──(Sí)──> exit(0)
    │
    ├──> [AgentShield]: getStagedFiles(repoRoot)
    │        │
    │        ├── Git diff falla? ──(Sí: Lanza Error)──> Banner diagnóstico ──> exit(1)
    │        │
    │        └── Para cada archivo staged:
    │                ├── classifySensitiveFile (.env, id_rsa, etc.) ──(Match)──> exit(1)
    │                └── getStagedContent(repoRoot, file)
    │                        ├── Git show falla? ──(Sí: Lanza Error)──> exit(1) con banner
    │                        │                                          "No se pudo inspeccionar..."
    │                        └── scanContentForSecrets(content) ──(Match)──> exit(1)
    │
    ├──> [OpenSpec Check]: node scripts/check.js --staged
    │        │
    │        └── runStagedChecks()
    │                ├── getStagedFiles() ──(Git Error)──> Lanza Error ──> check.js exit(1)
    │                ├── checkStagedSyntax()
    │                │       └── getStagedContent() ──(Git Error)──> Lanza Error ──> exit(1)
    │                ├── findAffectedTests() ──> Ejecuta targeted tests
    │                └── findAffectedTargets()
    │                        ├── ¿Cambio en canonical / core infra / hooks? ──(Sí)──> ALL_TARGETS
    │                        ├── ¿Cambio en validate-<target>.js aislado? ──(Sí)──> [target]
    │                        └── ¿Otro archivo? ──(Sí)──> []
    │                        └── Genera/valida targets resultantes
    │
    └──> [Strict TDD]: getStagedFiles() / diffResult ──(Git Error)──> exit(1)
             │
             └── Archivos de producción sin tests ni tasks.md? ──(Sí)──> exit(1)
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/hooks/lib/staged-validator.js` | Modify | - Expande `findAffectedTargets` para reconocer entradas canónicas (`agents/**`, `skills/**`, etc.), helpers de transform y hooks de runtime, retornando `ALL_TARGETS`.<br>- Actualiza `getStagedFiles` para lanzar `Error` si `git diff --cached` falla o reporta `status !== 0`.<br>- Actualiza `getStagedContent` para validar inputs y lanzar `Error` si `git show :<path>` falla o reporta `status !== 0`. |
| `scripts/hooks/pre-commit-hook.js` | Modify | - En AgentShield (escaneo de secretos), captura fallos de `getStagedContent` y aborta inmediatamente con código 1 y banner de error explícito.<br>- En caso de fallo de `git diff` al enumerar archivos staged en AgentShield o Strict TDD, aborta con código 1 en lugar de ignorar o salir con código 0. |
| `scripts/hooks/lib/staged-validator.test.js` | Modify | - Reemplaza pruebas que verificaban retorno de `[]` y `null` por aserciones de excepción (`assert.throws`).<br>- Añade casos de prueba para cada familia de entradas canónicas (`agents/`, `skills/`, `rules/`, `hooks/`, `schemas/kernel/`, `.mcp.json`, `.claude-plugin/plugin.json`, `models.yaml`, `frontmatter.js`, `model-resolver.js`, `scripts/hooks/**`). |
| `scripts/hooks/pre-commit-hook.test.js` | Modify | - Añade pruebas unitarias para fallo cerrado ante excepciones en `getStagedContent` durante escaneo de secretos.<br>- Verifica la emisión del banner `"OSPEC-PRECOMMIT ERROR: No se pudo inspeccionar el contenido staged de <path>"` y salida con código 1. |
| `scripts/hooks/lib/staged-validator.integration.test.js` | Modify | - Añade escenario de integración en repositorio Git efímero donde la consulta de un blob corrupto o comando Git fallido bloquea el commit con código 1. |
| `openspec/changes/precommit-invalidation-and-failclosed/decisions/adr-001.md` | Create | ADR formal para la frontera exhaustiva de invalidación con fallback a `ALL_TARGETS`. |
| `openspec/changes/precommit-invalidation-and-failclosed/decisions/adr-002.md` | Create | ADR formal para la política fail-closed estricta en Git index y escaneo de secretos. |

---

## Interfaces / Contracts

### 1. `findAffectedTargets` y Matriz Canónica

```javascript
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

function isCanonicalOrSharedSource(normalizedPath) {
  const lower = normalizedPath.toLowerCase();
  if (CANONICAL_SHARED_FILES.has(lower)) return true;
  for (const prefix of CANONICAL_SHARED_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  return false;
}
```

### 2. Contratos Fail-Closed de Git

```javascript
/**
 * Obtiene la lista de archivos staged.
 * @throws {Error} Si el comando git diff --cached falla o reporta código no cero.
 */
function getStagedFiles(repoRoot, deps = {}) {
  const spawn = deps.spawnSync || child_process.spawnSync;
  const res = spawn("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
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
 * Extrae el contenido de un archivo staged desde el índice de Git.
 * @throws {Error} Si el argumento es inválido o git show :<path> falla.
 */
function getStagedContent(repoRoot, relativePath, deps = {}) {
  if (!relativePath || typeof relativePath !== "string") {
    throw new Error("Ruta relativa vacía o inválida para getStagedContent");
  }
  const rel = path.isAbsolute(relativePath) ? path.relative(repoRoot, relativePath) : relativePath;
  const posixPath = rel.replace(/\\/g, "/").replace(/^(\.\/|\/)+/, "");
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
    throw new Error(`Error al invocar git show para :${posixPath}: ${res.error.message}`);
  }
  if (res.status !== 0) {
    const stderr = (res.stderr || "").trim();
    throw new Error(`git show :${posixPath} falló con código ${res.status}: ${stderr}`);
  }
  return res.stdout;
}
```

### 3. Manejo Diagnóstico en `pre-commit-hook.js`

```javascript
try {
  content = getStagedContent(repoRoot, file);
} catch (err) {
  console.error("\n======================================================================");
  console.error(`OSPEC-PRECOMMIT ERROR: No se pudo inspeccionar el contenido staged de ${file}`);
  console.error(`  Detalle: ${err.message}`);
  console.error("");
  console.error("Para omitir esta verificación (emergencias):");
  console.error("  DISABLE_AGENT_SHIELD=true git commit ...");
  console.error("  o: git commit --no-verify");
  console.error("======================================================================\n");
  process.exit(1);
  return;
}
```

---

## Testing Strategy

| Capa | Qué probar | Enfoque |
|---|---|---|
| **Unit** (`staged-validator.test.js`) | - `getStagedFiles`: lanza error ante código no cero o error de spawn.<br>- `getStagedContent`: lanza error ante código no cero, error de spawn o ruta vacía.<br>- `findAffectedTargets`: retorna `ALL_TARGETS` ante modificaciones en `agents/**`, `skills/**`, `rules/**`, `commands/**`, `hooks/**`, `schemas/kernel/**`, `.mcp.json`, `.claude-plugin/plugin.json`, `models.yaml`, `frontmatter.js`, `model-resolver.js`, `target-transform.js`, `scripts/hooks/**`.<br>- `findAffectedTargets`: retorna target aislado para `scripts/configure/validate-codex.js`. | Pruebas unitarias nativas con inyección de dobles `spawnSync` en memoria. |
| **Unit** (`pre-commit-hook.test.js`) | - Falla con código 1 y banner descriptivo cuando `getStagedContent` lanza error durante el escaneo de secretos.<br>- Falla con código 1 cuando `git diff --cached` falla al enumerar archivos.<br>- Permite bypass deliberado con `DISABLE_AGENT_SHIELD=true` o `DISABLE_OSPEC_PRECOMMIT=true`. | Mocks nativos (`t.mock.method`) sobre `child_process.spawnSync` y `process.exit`. |
| **Integration** (`staged-validator.integration.test.js`) | - Repositorio Git temporal real: commit bloqueado con código 1 cuando un blob staged está corrupto o `git show` no puede extraerlo.<br>- Commit bloqueado cuando hay secretos staged con working tree limpio.<br>- Commit permitido cuando secretos o errores sintácticos solo residen en el working tree sin preparar. | Invocación real de subprocesos Git y Node en carpetas temporales (`fs.mkdtempSync`). |

---

## Migration / Rollout

No se requiere migración de datos ni cambios en artefactos de configuración existentes. Los desarrolladores se benefician automáticamente de la detección integral de targets y de la protección fail-closed sin alterar su flujo habitual de Git. En caso de repositorios con índices Git corrompidos o situaciones de emergencia durante despliegues urgentes, se mantienen intactos los mecanismos de bypass documentados en los banners de error (`DISABLE_OSPEC_PRECOMMIT=true`, `DISABLE_AGENT_SHIELD=true`, `git commit --no-verify`).

---

## Open Questions

None. La especificación cubre exhaustivamente la frontera canónica de invalidación y la política fail-closed.
