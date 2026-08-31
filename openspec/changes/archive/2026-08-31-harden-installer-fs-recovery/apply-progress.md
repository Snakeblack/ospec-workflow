# Apply Progress: Harden Installer Filesystem Recovery

## Batch 1 — size:exception

- [x] 1.1–1.5 — Contrato común implementado con matriz RED para `EPERM`, `EACCES` y `EBUSY`; GREEN en `install-engine.test.js`. La política conserva `code`/`cause`, usa backoff acotado e inyectable y enriquece el diagnóstico.
- [x] 2.1–2.6 — Migración transversal completada. Antigravity y Cursor reintentan hooks; Cursor delega el journal común; Codex usa la primitiva desde su transacción; VS Code protege el commit JSONC; `install-target` protege copy/remove/rollback. Copilot y OpenCode adoptan la tolerancia mediante el motor común. Los comandos externos de Claude permanecen fuera del retry.
- [x] 3.1 — Tests focales: `node --test` sobre los ocho módulos, 150/150 en verde.
- [x] 3.2 — Suite completa: `npm test`, exit code 0, “All checks passed”.
- [x] 3.3 — Inventario revisado con `rg`. Las mutaciones directas restantes de Codex están en helpers invocados a través del proxy transaccional resiliente o en la transacción especializada de `config.toml`; no se reintentan comandos externos.

## Evidencia RED/GREEN focal

- RED: `install-engine.test.js` falló 5 pruebas porque `withTransientFsRetries` aún no existía.
- GREEN: `install-engine.test.js` pasó 13/13 después de implementar el contrato; tras añadir rollback focal pasó dentro de la tanda final.
- Integración: `install-antigravity.test.js` prueba un primer `EPERM` en `hooks.json` y convergencia en el segundo intento sin lock real.

## Archivos afectados

- `scripts/configure/install-engine.js`
- `scripts/configure/install-engine.test.js`
- `scripts/configure/cli.js`
- `scripts/configure/install-antigravity.js`
- `scripts/configure/install-antigravity.test.js`
- `scripts/configure/install-cursor.js`
- `scripts/configure/install-codex.js`
- `scripts/configure/install-vscode.js`
- `scripts/configure/install-target.js`

## Desviaciones y riesgos

- Sin desviaciones del contrato causal de `exploration.md`.
- La entrega usa la excepción de tamaño aprobada (`size:exception`); diff productivo/test actual: 216 inserciones y 141 eliminaciones antes de artefactos OpenSpec.
- Los reintentos son deliberadamente acotados: un permiso permanente tarda unos pocos intentos y conserva el código original en el error final.

## Batch 2 — Remediation Batch (size:exception)

- [x] 4.1 — Remediación CRITICAL: en `scripts/configure/install-codex.js`, `restorePath` y `removePathIfPresent` envuelven todas las operaciones filesystem (`rmSync`, `rmdirSync`, `mkdirSync`, `writeFileSync`, `chmodSync`, `symlinkSync`) con `mutateFs` (`target: codex`) propagando `retryOptions` en llamadas recursivas y en `createFilesystemTransaction(fsImpl, retryOptions).rollback()`. Se agregaron tests en `install-codex.test.js` verificando la recuperación de rollback ante bloqueos transitorios `EPERM`, `EACCES` y `EBUSY`.
- [x] 4.2 — Remediación WARNING: en `scripts/configure/install-antigravity.js` y `scripts/configure/install-cursor.js`, se propaga `retryOptions` a `pruneStaleFiles`. Se agregaron pruebas en `install-antigravity.test.js` e `install-cursor.test.js` comprobando que el error enriquecido reporta explícitamente `target: "antigravity"` y `target: "cursor"` tras agotar reintentos.

## Evidencia RED/GREEN focal (Batch 2)

- RED: `install-codex.test.js` falló 3 pruebas de rollback para `EPERM`, `EACCES` y `EBUSY` al carecer de política resiliente en `restorePath`.
- RED: `install-antigravity.test.js` e `install-cursor.test.js` fallaron al emitir el target genérico `installer:` en lugar de `antigravity:` y `cursor:` durante agotamiento en `pruneStaleFiles`.
- GREEN: tras la propagación de `retryOptions` y envoltura con `mutateFs`, los 152 tests focales pasaron (152/152) y la suite completa `npm test` finalizó con exit code 0 ("All checks passed").

## Archivos modificados en Batch 2

- `scripts/configure/install-codex.js`
- `scripts/configure/install-codex.test.js`
- `scripts/configure/install-antigravity.js`
- `scripts/configure/install-antigravity.test.js`
- `scripts/configure/install-cursor.js`
- `scripts/configure/install-cursor.test.js`
- `openspec/changes/harden-installer-fs-recovery/tasks.md`
- `openspec/changes/harden-installer-fs-recovery/apply-progress.md`
- `openspec/changes/harden-installer-fs-recovery/state.yaml`

