# Archive Report: Precommit Invalidation and Failclosed

**Change**: `precommit-invalidation-and-failclosed`
**Date**: 2026-09-04
**Status**: Ready for Archive Transaction Commit (Plan-and-Report)
**Verification Verdict**: `PASS` (0 critical issues, 0 warnings, 0 suggestions)

---

## Executive Summary

El cambio `precommit-invalidation-and-failclosed` implementa un blindaje robusto en la cadena de validación pre-commit en Git (`ospec-workflow`), corrigiendo deficiencias en la invalidación diferencial de targets e instaurando un comportamiento estrictamente fail-closed ante errores de Git y en el escaneo de seguridad:

1. **Frontera Exhaustiva de Invalidación en `findAffectedTargets`**:
   - Se asegura la regeneración de todos los targets (`ALL_TARGETS`: `claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`, `antigravity`) ante cambios en entradas canónicas del generador (`agents/**`, `commands/**`, `rules/**`, `skills/**`, `hooks/**`, `schemas/kernel/**`, `.mcp.json`, `.claude-plugin/plugin.json`, `models.yaml`), implementaciones y helpers compartidos (`cli.js`, `install-engine.js`, `install-target.js`, `validate-phase.js`, `target-transform.js`, `frontmatter.js`, `model-resolver.js`, `target-profiles/**`) y hooks de runtime distribuidos (`scripts/hooks/**`).
   - Mantiene la validación aislada únicamente para modificaciones acotadas a validadores o instaladores específicos de un target (`validate-codex.js`, `install-cursor.js`, etc.).

2. **Política Fail-Closed ante Errores de Git (`getStagedFiles` y `getStagedContent`)**:
   - `getStagedFiles` lanza un `Error` explicativo ante fallos o código de salida distinto de cero en `git diff --cached`, eliminando el retorno de arreglos vacíos `[]` silenciosos.
   - `getStagedContent` lanza un `Error` explicativo si `git show :<path>` falla o termina con error, eliminando el retorno permisivo de `null`.

3. **Bloqueo Fail-Closed en Escaneo de Secretos (`pre-commit-hook.js`)**:
   - Captura cualquier excepción al inspeccionar blobs staged en el índice de Git durante el escaneo de AgentShield y aborta inmediatamente con código de salida 1 (`process.exit(1)`), emitiendo el mensaje diagnóstico `"OSPEC-PRECOMMIT ERROR: No se pudo inspeccionar el contenido staged de <path>"` y explicando los mecanismos explícitos de bypass (`DISABLE_AGENT_SHIELD=true`, `--no-verify`).
   - Se asegura de no permitir commits inadvertidos con secretos o código corrupto ante índices bloqueados o blobs ilegibles.

---

## Verification & Quality Gates Summary

- **Verdict**: `PASS`
- **Tasks Complete**: 17 / 17 (100%)
- **Scenarios Satisfied**: 14 / 14 (100% de cumplimiento con pruebas automatizadas `runtime-test`)
- **Automated Tests**: 56 passed / 0 failed / 0 skipped (47 unitarias, 9 de integración en repositorios Git efímeros reales; `npm test` al 100%)
  - `staged-validator.test.js`: 28 passed / 0 failed
  - `pre-commit-hook.test.js`: 19 passed / 0 failed
  - `staged-validator.integration.test.js`: 9 passed / 0 failed
  - `scripts/check.js --staged`: 5 passed / 0 failed
  - `npm test`: Todos los cheques pasaron con código 0
- **Manual Verification**: No requerida (cobertura total con pruebas unitarias y de integración sobre Git real)
- **Accepted Warnings**: Ninguno (0 warnings)

---

## Merged Specifications Summary (Change-Local Preparation)

Se prepararon las especificaciones para los dominios modificados bajo la ruta local del cambio, integrando los requisitos y escenarios delta con las especificaciones base:

| Domain | Action | Requirements Modified / Added | Status |
|--------|--------|--------------------------------|--------|
| `git-precommit-hook` | Prepared (Merged) | Modificado: `Validación de consistencia de OpenSpec` (política fail-closed en `getStagedFiles` y `getStagedContent`). Modificado: `REQ-git-precommit-hook-001` (detección conservadora de targets con `ALL_TARGETS` ante entradas canónicas, generadores, helpers y hooks de runtime). Preservados: `Instalación del hook de Git`, `Validación de Strict TDD`, `Mecanismo de Bypass`, `REQ-git-precommit-hook-002`, `REQ-git-precommit-hook-003`. | ✅ Ready for runtime commit |
| `agent-shield-security` | Prepared (Merged) | Modificado: `REQ-agent-shield-security-001` (escaneo preventivo de secretos en pre-commit con comportamiento fail-closed ante errores de lectura de blobs staged). Preservados: `Escaneo automático en SessionStart`, `Interceptación y bloqueo de lectura de secretos en PreToolUse`, `Desactivación por variable de entorno`. | ✅ Ready for runtime commit |

---

## Proposed ADR Promotions

Se proponen las siguientes 2 decisiones arquitectónicas para su promoción formal a `docs/adr/` durante la ejecución de la transacción de archivo:

| Source | Proposed Target | Title |
|--------|-----------------|-------|
| `decisions/adr-001.md` | `docs/adr/adr-20260904-005-frontera-exhaustiva-de-invalidacion-de-targets-con-fallback-a-all-targets.md` | Frontera exhaustiva de invalidación de targets con fallback a `ALL_TARGETS` |
| `decisions/adr-002.md` | `docs/adr/adr-20260904-006-politica-fail-closed-estricta-ante-errores-de-git-en-acceso-al-indice-y-escaneo-de-secretos.md` | Política fail-closed estricta ante errores de Git en acceso al índice y escaneo de secretos |

---

## Cost

No per-phase cost data was recorded for this change (`.ospec/session/precommit-invalidation-and-failclosed/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

---

## Change Inventory

- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `design.md`
- `proposal.md`
- `specs/agent-shield-security/spec.md`
- `specs/git-precommit-hook/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

---

## Archive Transaction & Closure Authority

1. Este reporte y el plan `archive-plan.json` han sido emitidos bajo el protocolo **Plan-and-Report**.
2. Las escrituras finales en `openspec/specs/**` y `docs/adr/**`, así como el traslado atómico de la carpeta activa a `openspec/changes/archive/2026-09-04-precommit-invalidation-and-failclosed` y la eliminación del directorio de origen tras verificación íntegra, son responsabilidad exclusiva del runtime determinista de transacción:
   ```bash
   node scripts/archive-transaction-run.js precommit-invalidation-and-failclosed
   ```
3. El recibo estructurado (`receipt.json`) con `outcome: "success"` emitido por el runtime es la única autoridad de cierre para el cambio.
