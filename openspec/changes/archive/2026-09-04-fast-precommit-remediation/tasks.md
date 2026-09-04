# Tasks: Remediación del Hook Pre-commit Diferencial

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| Validación consistencia OpenSpec / Escenario Sintaxis rota staged con working tree limpio | MUST | `scripts/hooks/lib/staged-validator.js`: `getStagedContent`, `checkStagedSyntax` | covered-by-design | Evalúa blob en memoria vía `vm.Script` y `JSON.parse` |
| Validación consistencia OpenSpec / Escenario Staged limpio con working tree roto | MUST | `scripts/hooks/lib/staged-validator.js`: `getStagedContent` | covered-by-design | No lee working tree; ignora sintaxis rota unstaged |
| REQ-git-precommit-hook-001 / Escenario Target aislado | MUST | `scripts/hooks/lib/staged-validator.js`: `findAffectedTargets` | covered-by-design | Retorna solo target modificado en `scripts/configure/` |
| REQ-git-precommit-hook-001 / Escenario Fallback a ALL_TARGETS por generador compartido | MUST | `scripts/hooks/lib/staged-validator.js`: `ALL_TARGETS`, `isSharedTargetInfra` | covered-by-design | Retorna los 7 targets ante cambios en `cli.js`, perfiles, etc. |
| REQ-git-precommit-hook-001 / Escenario Fallback a ALL_TARGETS por perfil o models.yaml | MUST | `scripts/hooks/lib/staged-validator.js`: `ALL_TARGETS`, `isSharedTargetInfra` | covered-by-design | Retorna los 7 targets ante cambios en `target-profiles/*` o `models.yaml` |
| REQ-git-precommit-hook-002 / Escenario Fallback suite completa por módulo en scripts/lib | MUST | `scripts/hooks/lib/staged-validator.js`: `findAffectedTests`, `isCoreInfraFile` | covered-by-design | Retorna `["scripts/**/*.test.js"]` ante cambios en `scripts/lib/` |
| REQ-git-precommit-hook-002 / Escenario Fallback suite completa por check.js | MUST | `scripts/hooks/lib/staged-validator.js`: `findAffectedTests`, `isCoreInfraFile` | covered-by-design | Retorna `["scripts/**/*.test.js"]` si se modifica `scripts/check.js` |
| REQ-git-precommit-hook-002 / Escenario Ejecución dirigida para módulo aislado | MUST | `scripts/hooks/lib/staged-validator.js`: `findAffectedTests` | covered-by-design | Retorna únicamente prueba directa correspondiente |
| REQ-git-precommit-hook-003 / Escenario Integración staged roto con working tree limpio | MUST | `scripts/hooks/lib/staged-validator.integration.test.js` | covered-by-design | Repositorio efímero con `git init` valida rechazo de commit |
| REQ-git-precommit-hook-003 / Escenario Integración staged limpio con working tree roto | MUST | `scripts/hooks/lib/staged-validator.integration.test.js` | covered-by-design | Repositorio efímero valida autorización de commit |
| REQ-agent-shield-security-001 / Escenario Bloqueo por secreto staged en Git index | MUST | `scripts/hooks/pre-commit-hook.js`: `getStagedContent`, `scanContentForSecrets` | covered-by-design | Inspecciona blob de `git show` aunque working tree esté limpio |
| REQ-agent-shield-security-001 / Escenario Commit permitido cuando secreto es unstaged | MUST | `scripts/hooks/pre-commit-hook.js`: `getStagedContent` | covered-by-design | Ignora secretos en working tree si no están preparados en stage |
| REQ-agent-shield-security-001 / Escenario Integración secreto staged con working tree limpio | MUST | `scripts/hooks/lib/staged-validator.integration.test.js` | covered-by-design | Repositorio efímero valida bloqueo ante clave staged |
| Bypass de seguridad activo / Escenario DISABLE_AGENT_SHIELD en pre-commit | MUST | `scripts/hooks/pre-commit-hook.js` | covered-by-design | Omite escaneo preventivo si variable está presente |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~280 - 350 líneas |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (remediación unificada) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Utilidad getStagedContent, validación sintáctica y escaneo de secretos sobre Git index | PR 1 | Base `main`; pruebas unitarias en `staged-validator.test.js` y `pre-commit-hook.test.js` |
| 2 | Fallbacks conservadores de targets y pruebas (`ALL_TARGETS`, suite completa) | PR 1 | Misma rama; cobertura completa de infraestructura compartida |
| 3 | Suite de pruebas de integración con repositorio Git efímero y verificación e2e | PR 1 | `staged-validator.integration.test.js` y ejecución de `npm test` |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: getStagedContent Helper (Foundation)

- [x] 1.1 [RED] Escribir pruebas unitarias para `getStagedContent` en `scripts/hooks/lib/staged-validator.test.js` cubriendo normalización POSIX de rutas en Windows/Unix, invocación de `git show :<path>`, manejo de salidas de error y buffer UTF-8.
- [x] 1.2 [GREEN] Implementar y exportar `getStagedContent(repoRoot, relativePath, deps)` en `scripts/hooks/lib/staged-validator.js` ejecutando `spawnSync("git", ["show", `:${posixPath}`])` con `shell: false` y normalización de backslashes.
- [x] 1.3 [REFACTOR] Limpiar gestión de errores y encapsulamiento de dependencias inyectables (`deps.spawnSync`) en `getStagedContent`.

## Phase 2: Staged Syntax & Secret Scanning Integration

- [x] 2.1 [RED] Añadir pruebas unitarias en `scripts/hooks/lib/staged-validator.test.js` para `checkStagedSyntax` validando blobs provistos por `getStagedContent` (staged roto con working tree limpio, y staged limpio con working tree roto).
- [x] 2.2 [GREEN] Actualizar `checkStagedSyntax` en `scripts/hooks/lib/staged-validator.js` para consumir el contenido retornado por `getStagedContent` en lugar de `fsImpl.readFileSync`.
- [x] 2.3 [RED] Añadir pruebas unitarias en `scripts/hooks/pre-commit-hook.test.js` verificando que el escaneo preventivo de secretos inspecciona blobs preparados vía `getStagedContent` (o `git show :<path>`) aun cuando el archivo en disco haya sido modificado o eliminado [REQ-agent-shield-security-001].
- [x] 2.4 [GREEN] Actualizar el escaneo de secretos en `scripts/hooks/pre-commit-hook.js` para extraer y evaluar el contenido staged mediante `getStagedContent` antes de invocar `scanContentForSecrets` [REQ-agent-shield-security-001].
- [x] 2.5 [REFACTOR] Eliminar lecturas directas del working tree (`fs.readFileSync`) en las rutas de validación staged, preservando el límite `MAX_SCAN_SIZE_BYTES` y mensajes de banner.

## Phase 3: Conservative Fallbacks for Targets and Test Suites

- [x] 3.1 [RED] Añadir pruebas unitarias en `scripts/hooks/lib/staged-validator.test.js` verificando que `findAffectedTargets` retorne `ALL_TARGETS` ante modificaciones en generadores (`cli.js`, `install-engine.js`, `install-target.js`, `validate-phase.js`), perfiles (`target-profiles/*.js`), `target-transform.js` o `models.yaml`, y target único en archivos aislados [REQ-git-precommit-hook-001].
- [x] 3.2 [GREEN] Implementar la constante `ALL_TARGETS` y la función de inspección `isSharedTargetInfra` en `scripts/hooks/lib/staged-validator.js`, actualizando `findAffectedTargets` y exportando `ALL_TARGETS` [REQ-git-precommit-hook-001].
- [x] 3.3 [RED] Añadir pruebas unitarias en `scripts/hooks/lib/staged-validator.test.js` verificando que `findAffectedTests` retorne el patrón de suite completa `["scripts/**/*.test.js"]` ante cambios en `scripts/check.js` o módulos en `scripts/lib/` fuera de `contract-checkers/` [REQ-git-precommit-hook-002].
- [x] 3.4 [GREEN] Actualizar `findAffectedTests` en `scripts/hooks/lib/staged-validator.js` incorporando la detección de infraestructura central (`isCoreInfraFile`) con fallback a suite completa [REQ-git-precommit-hook-002].
- [x] 3.5 [REFACTOR] Consolidar y unificar la lógica de normalización de rutas POSIX entre los selectores de targets y pruebas.

## Phase 4: Ephemeral Git Integration Testing Suite

- [x] 4.1 [RED] Crear la estructura base de pruebas de integración en `scripts/hooks/lib/staged-validator.integration.test.js` con utilidades de repositorio temporal (`setupEphemeralRepo`, `cleanupEphemeralRepo`) usando `fs.mkdtempSync` y `git init` [REQ-git-precommit-hook-003, REQ-agent-shield-security-001].
- [x] 4.2 [GREEN] Implementar casos de prueba de integración reales cubriendo:
  - Archivo JS con sintaxis rota staged y working tree limpio -> validación rechazada (código 1) [REQ-git-precommit-hook-003].
  - Archivo JS con sintaxis válida staged y working tree corrupto unstaged -> validación aprobada (código 0) [REQ-git-precommit-hook-003].
  - Archivo con secreto de API preparado en index y working tree limpio -> commit bloqueado por seguridad [REQ-agent-shield-security-001].
  - Archivo preparado sin secretos y secreto en working tree unstaged -> commit autorizado [REQ-agent-shield-security-001].
- [x] 4.3 [REFACTOR] Asegurar limpieza garantizada de directorios temporales en hooks `afterEach` con `fs.rmSync(tmpDir, { recursive: true, force: true })`.

## Phase 5: Verification and End-to-End Validation

- [x] 5.1 Ejecutar la suite completa de pruebas de Node del repositorio (`npm test`) y comprobar 0 fallos en tests unitarios, de integración y de contratos.
- [x] 5.2 Ejecutar la validación diferencial local en el espacio de trabajo (`node scripts/check.js --staged`) comprobando el funcionamiento sin regresiones.
- [x] 5.3 Revisar la consistencia de archivos modificados con `git status` y verificar la matriz de trazabilidad de requisitos.
