# Archive Report: Fix CX0 Skill Registry Robustness

**Change**: `fix-cx0-skill-registry-robustness`  
**Date**: 2026-09-05  
**Status**: Ready for Archive Transaction Commit (Plan-and-Report)  
**Verification Verdict**: `PASS` (0 critical issues, 0 warnings, 0 suggestions)

---

## Executive Summary

El cambio `fix-cx0-skill-registry-robustness` implementa mejoras integrales de resiliencia, rendimiento de I/O y protección contra fallos en el subsistema de descubrimiento y fingerprinting de habilidades (`skill-registry`) en Node.js y su espejo en Go:

1. **Pipeline de Lectura de Snapshot Único (`Single-Snapshot Read`)**:
   - `discoverSkills` realiza una única lectura de los archivos de habilidades y reglas en memoria (`scripts/lib/skill-registry.js` e `internal/skillreg`).
   - Los bytes recolectados se transmiten directamente en `fingerprintPaths` hacia `calculateFingerprint`, eliminando por completo la re-lectura redundante de disco y cerrando ventanas de inconsistencia TOCTOU.

2. **Degradación Elegante ante Errores de I/O (`EACCES` Resilience)**:
   - Si un archivo de habilidad no puede leerse durante el descubrimiento por permisos o fallos del sistema de archivos, se emite una advertencia en `stderr`, el archivo se excluye de la lista parseada `skills`, y se incluye en `fingerprintPaths` con contenido vacío (0 bytes).
   - Invocaciones directas a `calculateFingerprint` tratan archivos no legibles o desaparecidos como contenido vacío sin lanzar excepciones no controladas ni interrumpir el inicio de sesión.

3. **Guarda Fail-Closed con Validación de Anclas de Identidad OSpec**:
   - En roots externos o compartidos (e.g. `~/.agents/skills`), cuando `requireSkills: true` está activo, `discoverSkills` valida la presencia de al menos un ancla canónica de identidad OSpec (`skills/_shared/`, `skills/skill-registry/SKILL.md` o `.ospec-workflow-install.json`).
   - Evita la corrupción o blanqueo del caché del registro frente a herramientas de terceros que depositen sus propios `SKILL.md` en ubicaciones compartidas.

4. **Paridad Estricta Multi-Runtime**:
   - Validación completa de paridad de comportamiento y criptográfica (SHA-256) entre las implementaciones de Node.js y Go bajo todas las condiciones evaluadas (archivos legibles, inaccesibles, directos y con anclas).

---

## Verification & Quality Gates Summary

- **Verdict**: `PASS`
- **Tasks Complete**: 8 / 8 (100%)
- **Delta Scenarios Satisfied**: 7 / 7 (100% de cumplimiento con evidencia `runtime-test`)
- **Automated Tests**:
  - Suite Node.js: 59/59 tests passed (`scripts/lib/skill-registry.test.js`, `scripts/hooks/session-start.test.js`)
  - Suite Go: 2/2 paquetes passed (`internal/skillreg`, `internal/hooks`), pruebas de degradación y paridad cruzada exitosas
  - Pruebas completas del repositorio: `npm test` y `go test ./...` pasando limpiamente (0 fallos, 0 regresiones)
- **TDD Compliance**: 6/6 checks passed (Strict TDD verificado, fases RED/GREEN afirmadas)
- **Accepted Warnings**: Ninguno (0 warnings)

---

## Merged Specifications Summary (Change-Local Preparation)

Se preparó la especificación completa y fusionada para el dominio `skill-registry` bajo la carpeta local del cambio (`openspec/changes/fix-cx0-skill-registry-robustness/specs/skill-registry/spec.md`):

| Domain | Action | Requirements Modified / Added | Status |
|---|---|---|---|
| `skill-registry` | Prepared (Merged) | Modificado: `REQ-skill-registry-002` (guarda fail-closed reforzada con validación de anclas canónicas OSpec en roots externos/compartidos). Agregado: `REQ-skill-registry-004` (pipeline de lectura en snapshot único y resiliencia a errores de hashing con degradación a 0 bytes). Preservados: `REQ-skill-registry-001`, `REQ-skill-registry-003`, y los apartados normativos §1 a §10 completos. | ✅ Ready for runtime commit (`openspec/specs/skill-registry/spec.md`) |

---

## Proposed ADR Promotions

Se proponen las siguientes 2 decisiones arquitectónicas para su promoción formal a `docs/adr/` durante la ejecución de la transacción de archivo:

| Source | Proposed Target | Title |
|---|---|---|
| `decisions/adr-001.md` | `docs/adr/adr-20260905-005-single-snapshot-read-pipeline-and-empty-content-hashing-degradation.md` | Single-Snapshot Read Pipeline and Empty-Content Hashing Degradation |
| `decisions/adr-002.md` | `docs/adr/adr-20260905-006-fail-closed-ospec-identity-anchor-verification-for-shared-roots.md` | Fail-Closed OSpec Identity Anchor Verification for Shared Roots |

---

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/fix-cx0-skill-registry-robustness/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

---

## Change Inventory

El inventario de origen del cambio a preservar en el archivo histórico comprende:

- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `design.md`
- `proposal.md`
- `specs/skill-registry/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

---

## Archive Transaction & Closure Authority

1. Este reporte y el plan `archive-plan.json` han sido emitidos bajo el protocolo **Plan-and-Report**.
2. Ni este ejecutor ni el sub-agente realizan escrituras directas sobre `openspec/specs/**` o `docs/adr/**`, ni trasladan o eliminan el directorio activo de trabajo.
3. El orquestador ejecuta la transacción determinista llamando al runtime:
   ```bash
   node scripts/archive-transaction-run.js fix-cx0-skill-registry-robustness
   ```
   (precedido opcionalmente por `node .ospec/sync-archive-plan-hashes.js fix-cx0-skill-registry-robustness` para sincronización de digestión).
4. El recibo estructurado (`receipt.json`) con `outcome: "success"` emitido por el runtime es la única autoridad formal de cierre del cambio.
