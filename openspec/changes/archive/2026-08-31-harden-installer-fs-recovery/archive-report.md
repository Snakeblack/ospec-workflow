# Archive Report: Harden Installer Filesystem Recovery

**Change**: `harden-installer-fs-recovery`
**Date**: 2026-08-31
**Status**: Ready for Archive Transaction Commit (Plan-and-Report)
**Verification Verdict**: `PASS` (0 critical issues, 0 warnings, 0 suggestions)

---

## Executive Summary

El cambio `harden-installer-fs-recovery` endurece de manera integral la infraestructura de instalación y distribución de `ospec-workflow` frente a bloqueos y errores transitorios del sistema de archivos (`EPERM`, `EACCES`, `EBUSY`), garantizando resiliencia en mutaciones leaf, rollback tolerante y diagnósticos enriquecidos con identidad de target:

1. **Primitiva Centralizada de Reintentos Transitorios (`withTransientFsRetries` / `mutateFs`)**:
   - Centralización de la política de reintentos acotados (hasta 5 intentos, por defecto 3 reintentos) con backoff incremental e inyección de `sleep` en `scripts/configure/install-engine.js`.
   - Aplicación estricta sobre mutaciones atómicas leaf (`mkdir`, `write`, `copy`, `remove`, `chmod`, `symlink`), ejecutando parses, merges y comandos externos fuera de los bucles de reintento.
   - Fallo inmediato (sin retries) ante errores permanentes o no transitorios (`ENOENT`, `ENOSPC`, sintaxis corrupta).

2. **Rollback Resiliente en Journals y Transacciones de Codex**:
   - Integración de `mutateFs` en cada acción individual de restauración y limpieza de `createRollbackJournal` y `createFilesystemTransaction.rollback()` / `restorePath`.
   - Agregación y reporte explícito de rutas no restauradas ante agotamiento de reintentos, eliminando el enmascaramiento silencioso de fallos de rollback.

3. **Diagnóstico Accionable y Preservación de Identidad de Target**:
   - Enriquecimiento estructurado de errores con propiedades `code`, `cause`, `attempts`, `operation`, `path`, y `target`.
   - Propagación explícita de `retryOptions` (`{ target: ... }`) a `pruneStaleFiles` en Antigravity, Cursor y Codex, preservando la identidad del instalador frente a la etiqueta genérica.

---

## Verification & Quality Gates Summary

- **Verdict**: `PASS`
- **Tasks Complete**: 16 / 16 (100%)
- **Scenarios Satisfied**: 8 / 8 (100% de cumplimiento con pruebas automatizadas `runtime-test`)
- **Focal Automated Tests**: 154 passed / 0 failed (suites `install-engine`, `install-antigravity`, `install-codex`, `install-cursor`, `install-target`, `install-vscode`, `install-global-copilot`, `install-global-opencode`)
- **Full Repository Test Suite (`npm test`)**: Exit code 0 (100% test suites passed, "All checks passed")
- **Contract Lint / Build**: 0 offenders
- **Accepted Warnings**: Ninguno (0 warnings)

---

## Merged Specifications Summary (Change-Local Preparation)

Se preparó la especificación del dominio `install` integrando las nuevas capacidades y requisitos delta sobre la especificación principal `openspec/specs/install/spec.md`:

| Domain | Action | Requirements Modified / Added | Status |
|--------|--------|--------------------------------|--------|
| `install` | Prepared (Merged) | Se agregaron `REQ-install-016` (resiliencia ante errores transitorios en mutaciones leaf), `REQ-install-017` (rollback resiliente ante locks transitorios) y `REQ-install-018` (diagnósticos accionables y preservación de target en poda); se preservaron intactos los requisitos `REQ-install-001` a `REQ-install-015`. | ✅ Ready for runtime commit |

---

## Proposed ADR Promotions

Se proponen las siguientes decisiones arquitectónicas para su promoción formal a `docs/adr/` durante la ejecución de la transacción de archivo:

| Source | Proposed Target | Title |
|--------|-----------------|-------|
| `decisions/adr-001.md` | `docs/adr/adr-20260831-001-centralized-transient-filesystem-retries.md` | Centralized Transient Filesystem Retries |
| `decisions/adr-002.md` | `docs/adr/adr-20260831-002-resilient-rollback-in-journals-and-codex-transactions.md` | Resilient Rollback in Journals and Codex Transactions |
| `decisions/adr-003.md` | `docs/adr/adr-20260831-003-target-context-propagation-in-stale-file-pruning.md` | Target Context Propagation in Stale File Pruning |

---

## Cost

No per-phase cost data was recorded for this change (`.ospec/session/harden-installer-fs-recovery/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

---

## Change Inventory

- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`
- `design.md`
- `exploration.md`
- `proposal.md`
- `specs/install/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

---

## Archive Transaction & Closure Authority

1. Este reporte y el plan `archive-plan.json` han sido emitidos bajo el protocolo **Plan-and-Report**.
2. Las escrituras finales en `openspec/specs/**` y `docs/adr/**`, así como el traslado atómico de la carpeta activa a `openspec/changes/archive/2026-08-31-harden-installer-fs-recovery` y la eliminación del directorio de origen tras verificación íntegra, son responsabilidad exclusiva del runtime determinista de transacción:
   ```bash
   node scripts/archive-transaction-run.js harden-installer-fs-recovery
   ```
3. El recibo estructurado (`receipt.json`) con `outcome: "success"` emitido por el runtime es la única autoridad de cierre para el cambio.
