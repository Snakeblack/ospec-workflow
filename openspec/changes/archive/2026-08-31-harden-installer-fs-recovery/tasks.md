# Tasks: Harden Installer Filesystem Recovery

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-install-016 / Transient lock succeeds within retry budget | MUST | `scripts/configure/install-engine.js`, `withTransientFsRetries` / `mutateFs` | covered-by-design | Reintentos acotados (hasta 5, default 3) con backoff incremental sobre mutaciones leaf. |
| REQ-install-016 / Permanent error fails immediately without retries | MUST | `scripts/configure/install-engine.js`, `withTransientFsRetries` | covered-by-design | Falla inmediatamente ante errores no transitorios (ENOENT, ENOSPC, etc.) preservando `code` y `cause`. |
| REQ-install-016 / Transient lock exhaustion fails closed | MUST | `scripts/configure/install-engine.js`, `withTransientFsRetries` | covered-by-design | Lanza error enriquecido preservando `code` y `cause` originales tras agotar reintentos. |
| REQ-install-017 / Rollback succeeds despite transient lock on restored file | MUST | `scripts/configure/install-engine.js` (`createRollbackJournal`), `scripts/configure/install-codex.js` (`restorePath`) | covered-by-design | Aplica la política resiliente a la restauración de ficheros y directorios durante rollback. |
| REQ-install-017 / Rollback removes newly created paths under transient lock | MUST | `scripts/configure/install-engine.js` (`createRollbackJournal`), `scripts/configure/install-codex.js` (`removePathIfPresent`) | covered-by-design | Aplica `mutateFs` a la limpieza de ficheros y directorios creados. |
| REQ-install-017 / Exhausted rollback surfaces unrestored paths | MUST | `scripts/configure/install-engine.js` (`createRollbackJournal`), `scripts/configure/install-codex.js` | covered-by-design | Agrega y reporta rutas no restauradas con causas de fallo. |
| REQ-install-018 / Mutation exhaustion emits structured diagnostic with target name and remedy | MUST | `scripts/configure/install-engine.js`, `withTransientFsRetries` / `mutateFs` | covered-by-design | Enriquecimiento con target, operación, ruta, intentos y recomendación de cerrar aplicaciones. |
| REQ-install-018 / Stale file pruning exhaustion preserves target identity | MUST | `scripts/configure/install-engine.js` (`pruneStaleFiles`), `install-antigravity.js`, `install-cursor.js`, `install-codex.js` | covered-by-design | Propagación explícita de `retryOptions` (`{ target: ... }`) en llamadas de poda. |

### Reconciliation Verdict

- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none; los valores de intentos y backoff son internos, acotados e inyectables.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 550–850 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Contrato común → migración de targets → integración/regresión → remediación |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Primitiva resiliente, diagnóstico y rollback común con tests | PR única | Base del resto; verificable con `install-engine.test.js`. |
| 2 | Migrar targets y retirar duplicación | PR única | Conserva protocolos especiales por target. |
| 3 | Integración transversal y regresión | PR única | Evidencia final bajo la excepción aprobada. |
| 4 | Remediación de rollback en Codex y preservación de target en poda | PR única | Cierra hallazgos de verificación bajo la misma excepción. |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Contrato común test-first

- [x] 1.1 RED: ampliar `scripts/configure/install-engine.test.js` con una matriz inyectada para éxito tras `EPERM`/`EACCES`/`EBUSY`, agotamiento, error permanente sin retry, backoff/conteo y preservación de `code`/`cause`. [REQ-install-016, REQ-install-018]
- [x] 1.2 RED: añadir en `scripts/configure/install-engine.test.js` escenarios de rollback que superan un lock transitorio y que, al agotarse, agregan solo las rutas no restauradas y distinguen recuperación incompleta. [REQ-install-017]
- [x] 1.3 GREEN: implementar en `scripts/configure/install-engine.js` la primitiva común de mutación resiliente con política acotada, `sleep` inyectable y error enriquecido con target, operación, ruta, intentos y acción correctiva. [REQ-install-016, REQ-install-018]
- [x] 1.4 GREEN: aplicar la primitiva a las mutaciones idempotentes y a cada paso de `createRollbackJournal()`, manteniendo el contenido calculado fuera del retry y sin reejecutar merges completos. [REQ-install-016, REQ-install-017]
- [x] 1.5 REFACTOR: hacer que `scripts/configure/cli.js` consuma/reexporte la política común y eliminar su implementación divergente sin cambiar el staging/swap existente. [REQ-install-016]

## Phase 2: Migración transversal test-first

- [x] 2.1 RED/GREEN: cubrir hooks bloqueados y migrar `scripts/configure/install-antigravity.js` + `install-antigravity.test.js` y `install-cursor.js` + `install-cursor.test.js`; retirar o delegar el journal duplicado de Cursor. [REQ-install-016, REQ-install-017]
- [x] 2.2 RED/GREEN: cubrir configuración/manifiesto bloqueado y verificar adopción común en `install-global-copilot.js`/`.test.js` y `install-global-opencode.js`/`.test.js`. [REQ-install-016, REQ-install-017]
- [x] 2.3 RED/GREEN: actualizar `install-codex.js` + `install-codex.test.js` para importar la primitiva común y envolver sus mutaciones mínimas sin debilitar el protocolo transaccional de `config.toml` ni sus controles de identidad. [REQ-install-016, REQ-install-017]
- [x] 2.4 RED/GREEN: actualizar `install-vscode.js` + `install-vscode.test.js` para reintentar el commit de `settings.json` preservando JSONC y cambios ajenos. [REQ-install-016, REQ-install-017]
- [x] 2.5 RED/GREEN: actualizar `install-target.js` + `install-target.test.js` para cubrir copy/remove/rollback en instalaciones de repositorio y copia de binarios. [REQ-install-016, REQ-install-017]
- [x] 2.6 Revisar mutaciones locales de Claude y demás consumidores del motor; adoptar la primitiva solo donde sean filesystem e idempotentes, y no reintentar comandos externos de marketplace. [REQ-install-016]

## Phase 3: Verificación y limpieza

- [x] 3.1 Ejecutar los tests focales de los ocho módulos modificados y corregir cualquier regresión manteniendo pruebas deterministas sin locks reales del sistema operativo. [REQ-install-016, REQ-install-017, REQ-install-018]
- [x] 3.2 Ejecutar `npm test` y confirmar que instalación exitosa, rollback completo/incompleto y mensajes finales conservan compatibilidad para todos los targets. [REQ-install-016, REQ-install-017, REQ-install-018]
- [x] 3.3 Buscar con `rg` escrituras/copias/borrados directos restantes en `scripts/configure/install-*.js`; justificar las no migradas como no idempotentes o fuera del contrato y eliminar helpers duplicados/dead code. [REQ-install-016]

## Phase 4: Remediation of verification findings

- [x] 4.1 RED/GREEN: wrap `restorePath` mutations in `scripts/configure/install-codex.js` with `mutateFs` / `withTransientFsRetries` using `target: codex`, propagate `retryOptions` during directory recursion, and add unit test verifying recovery from transient `EPERM`, `EACCES`, `EBUSY` during Codex transaction rollback. [REQ-install-016, REQ-install-017]
- [x] 4.2 RED/GREEN: propagate `retryOptions` in `scripts/configure/install-antigravity.js` and `scripts/configure/install-cursor.js` to `pruneStaleFiles`, and test that exhaustion diagnostic reports the exact target name (`antigravity` and `cursor`). [REQ-install-018]
