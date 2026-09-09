# Archive Report: Modernize Installer Model Selection

**Change**: `modernize-installer-model-selection`  
**Date**: 2026-09-09  
**Status**: Ready for Archive Transaction Commit (Plan-and-Report)  
**Verification Verdict**: `PASS` (0 critical issues, 0 warnings, 45/45 scenarios verified with `runtime-test`)

---

## Executive Summary

El cambio `modernize-installer-model-selection` moderniza el flujo de selección de modelos y la arquitectura de configuración del instalador, garantizando compatibilidad multiplataforma, validación cerrada de capacidades y reconciliación resiliente de linajes:

1. **Catálogo Canónico, Presets y Protocolo v2**:
   - Se introducen presets (`default`, `quality`, `budget`), grupos por fase y capacidades de razonamiento finitas (`effort`, `model_reasoning_effort`, `variant`) en `models.yaml`.
   - Se implementa el protocolo privado JSON v2 en `scripts/configure/installer-adapter.js` con soporte estricto para selecciones de modelo opacas y validación de planes frescos.
   - Destinos con configuración fija o heredada (Antigravity y GitHub Copilot) mantienen su comportamiento canónico sin filtración de metadatos no soportados.

2. **TUI Guiada en Go con Búsqueda y Navegación Reversible**:
   - Flujo interactivo estructurado: Target -> Preset -> Personalización opcional por Agente -> Revisión -> Instalación Explícita.
   - Búsqueda insensible a mayúsculas/minúsculas y navegación "Back" con preservación determinista de estado y selecciones entre destinos.
   - La pantalla de revisión garantiza la frontera "No-Write Pre-Install": ningún instalador ni mutación en disco se ejecuta antes de pulsar `Install`.

3. **Generador Seguro y Emisión Nativa de Razonamiento**:
   - Validación cerrada previa a la escritura en `scripts/lib/target-transform.js`: los campos de razonamiento (`effort` en Claude, `model_reasoning_effort` en Codex, `variant` en OpenCode) solo se emiten si el perfil destino los declara compatibles.
   - Limpieza determinista de valores previos o huérfanos (por ejemplo, variantes vacías explícitas en OpenCode para evitar fugas en fusiones profundas).

4. **Recuperación Auditada de Linajes y Reconciliación de Sucesores**:
   - Se implementa `candidate-recovery-audit/v1` (`REQ-verify-lineage-013`) y sucesor vinculado a snapshots (`REQ-verify-lineage-014`) ante pérdida de referencias de árbol base.
   - Preservación inmutable de operaciones no reconciliables (`REQ-verify-lineage-015`) y sucesor de reconciliación fresco (`REQ-verify-lineage-016` a `REQ-verify-lineage-018`) para rechecks dirigidos con presupuesto congelado e invariante de no-replay.

---

## Verification & Quality Gates Summary

- **Verdict**: `PASS`
- **Tasks Complete**: 28 / 28 (Fases 1 a 7 completadas al 100%)
- **Delta Scenarios Satisfied**: 45 / 45 (100% de cumplimiento con nivel de evidencia `runtime-test`)
- **Automated Tests**:
  - Suite Go: `go test ./internal/installer -count=1` (aprobado, 0 fallos)
  - Suite Node (adapter, protocol, cli, resolver, transform): 144 pruebas pasadas, 0 fallos
  - Suite Node (lineage, candidate store, recheck, recovery): 42 pruebas pasadas, 0 fallos
  - Suite completa de regresión (`npm test`): validación de targets, guardas K1, lints y esquemas aprobados sin discrepancias.
- **Lineage Route**: Reconciliación determinista hacia `supersede-and-discovery` vía la ruta autorizada `candidate-code-changed` bajo aprobación `harness-root-scope-001`.
- **Assumption Reconciliation**: Cero asunciones pendientes; todas confirmadas formalmente en `state.yaml`.
- **Quality Review Gate**:
  - Estado: `done` / `approved`
  - Hallazgos bloqueantes: 0
  - Advertencias: 0

---

## Merged Specifications Summary (Change-Local Preparation)

Se prepararon las especificaciones fusionadas de forma change-local en `specs/**/spec.md`, preservando la totalidad de los requisitos preexistentes e incorporando los requisitos del delta:

| Domain | Action | Requirements Modified / Added | Status |
|---|---|---|---|
| `generator` | Prepared (Merged) | Preservados: `REQ-generator-001` a `REQ-generator-014`. Agregados: `REQ-generator-015` (Model Catalog Presets and Target Capabilities) y `REQ-generator-016` (Target-Compatible Reasoning Metadata and Stale-Value Safety). | ✅ Ready for runtime commit (`openspec/specs/generator/spec.md`) |
| `install` | Prepared (Merged) | Preservados: `REQ-install-001` a `REQ-install-018` y `REQ-install-023`. Modificados: `REQ-install-019` a `REQ-install-022`. Agregados: `REQ-install-024` (Per-Agent Interactive Model/Effort Selection) y `REQ-install-025` (Bounded Codex and OpenCode Discovery with Static Fallback). | ✅ Ready for runtime commit (`openspec/specs/install/spec.md`) |
| `verify-lineage` | Prepared (Merged) | Preservados: `REQ-VL-K3-001` a `REQ-VL-K3-008`, `REQ-VL-FINAL-001` a `REQ-VL-FINAL-009`, y `REQ-verify-lineage-010` a `REQ-verify-lineage-012`. Agregados: `REQ-verify-lineage-013` a `REQ-verify-lineage-018` (Audited irrecoverable recovery, snapshot-bound successor, immutable operation disposition, reconciliation successor, completion persistence, recipe reduction). | ✅ Ready for runtime commit (`openspec/specs/verify-lineage/spec.md`) |

---

## Proposed ADR Promotions

Se proponen cuatro Decisiones de Arquitectura (ADR) para su promoción al catálogo permanente en `docs/adr/`:

| Source | Proposed Target | Title |
|---|---|---|
| `decisions/adr-001.md` | `docs/adr/adr-20260909-001-canonical-model-policy-and-private-protocol-v2.md` | Canonical model policy and private protocol v2 |
| `decisions/adr-002.md` | `docs/adr/adr-20260909-002-profile-owned-selection-and-reasoning-emission.md` | Profile-owned selection and reasoning emission |
| `decisions/adr-003.md` | `docs/adr/adr-20260909-003-audited-terminal-predecessor-and-snapshot-bound-verify-successor.md` | Audited terminal predecessor and snapshot-bound verify successor |
| `decisions/adr-004.md` | `docs/adr/adr-20260909-004-immutable-operation-disposition-and-audited-reconciliation-successor.md` | Immutable operation disposition and audited reconciliation successor |

---

## Cost

Estimated token cost per phase, aggregated from `.ospec/session/modernize-installer-model-selection/phase-costs.jsonl`. Figures are heuristic estimates (~4 bytes/token), not exact metering.

| Phase | Invocations | Re-launches | Duration | Model Tiers | Statuses | Estimated Prompt Tokens | Estimated Artifact Tokens | Estimated Tool Output Tokens | Estimated Output Tokens |
|-------|-------------|-------------|----------|-------------|----------|-------------------------|---------------------------|------------------------------|-------------------------|
| propose | 1 | 0 | 0ms | unknown | unknown | 72166 (estimated) | 0 (estimated) | 0 (estimated) | 489 (estimated) |
| spec | 3 | 2 | 0ms | unknown | success, unknown | 380932 (estimated) | 0 (estimated) | 0 (estimated) | 1051 (estimated) |
| design | 3 | 2 | 0ms | unknown | success | 398701 (estimated) | 0 (estimated) | 0 (estimated) | 657 (estimated) |
| tasks | 5 | 4 | 0ms | unknown | success, unknown | 687523 (estimated) | 0 (estimated) | 0 (estimated) | 2068 (estimated) |
| apply | 8 | 7 | 0ms | unknown | success, unknown | 989440 (estimated) | 0 (estimated) | 0 (estimated) | 2441 (estimated) |
| verify | 2 | 0 | 0ms | unknown | unknown, success | 233299 (estimated) | 0 (estimated) | 0 (estimated) | 125 (estimated) |

**Total user questions asked**: 0

---

## Operative Memory

- `open_decisions`: Ausente en `state.yaml` para este cambio; no se registraron nuevas decisiones en `openspec/memory/decisions.md`.

---

## Change Inventory

El inventario de origen del cambio a preservar en el archivo histórico comprende 47 artefactos (excluyendo el plan autorreferencial `archive-plan.json`):

- `.candidate-recovery-audit-379dc283648d3146c0e62a239b54d5b999ea8b65d405c557033d41e1a776710a.json`
- `.reconciliation-successor-audit-39b932450ce14d1e13bc3cc5b39237b2a38bc48bb8399e1b984c40b08e0dc645.json`
- `.verify-lineage-candidate-2d73dafc9986d29d6eac1861e77a86d7a36176c7d272870bc5e5c0b2fb097ab8.json`
- `.verify-lineage-candidate-804aa809bbe6d601b8b7d6a8aa41561032fd47547e07564a1b5945de5643499d.json`
- `.verify-lineage-candidate-8d50441dbc331ab348515efb52f5ad6ea5f8da8100726ed36cdd4007bf8c3ce6.json`
- `.verify-lineage-candidate-8ead0a691ae04a1594f4a42cccbafdd0c7289c107bd61c83bd9308e7c9f8afca.json`
- `.verify-lineage-candidate-a2770acb8fb45561f472356522c94483326b626bf7b8cd6748808e38b388940c.json`
- `.verify-lineage-candidate-aa6ca23c70b2c58743c97a890535321d782658ac22600e14b2c16321a5c0d0c1.json`
- `.verify-lineage-candidate-b1337d654753fa7817b75a72b325dcc4da4433838f8ad3e314ced667e979cc42.json`
- `.verify-lineage-candidate-e03ba54e2be5f229f2365ffba9189edcba11e7bcf41d9655943c36b09447199b.json`
- `.verify-lineage-operation-1b48778553e5a75741328de32c2d18d1d3fce9010c3803508a49970e72c4454e.json`
- `.verify-lineage-operation-1c477ed5c1082904eabc55d7d54830068ad1b3dfcad9df311349d2726396d0ac.json`
- `.verify-lineage-operation-62b101116c5ced0f554a8792d6d1f6fa7d651fcce8e5f295963337f0d10172d5.json`
- `.verify-lineage-operation-636de5b48cc1ccc37426df6179ecd855fc6217e897fc628faf279a86ab9ff3cf.json`
- `.verify-lineage-operation-6dd8ad0bff081e52dce249cf0b8d541e97a630ed730d9a05c7364366d8085e01.json`
- `.verify-lineage-operation-d7d1c409aee500bf2efb28ded1200caa1cb286eb4c7fd1d318ad3a59494dfb6a.json`
- `.verify-lineage-operation-disposition-073bf36e3e50f677e56867f231ebc436c584de21f274c982755255357cf3f75f.json`
- `.verify-lineage-operation-disposition-28e670237a37f0c6df305e25db459941529095b040a260a3aacbca24e3f01aaa.json`
- `.verify-lineage-operation-disposition-330d00a597455b2752f97b8471302a5b3f2cad138a87b1100380d9f907626677.json`
- `.verify-lineage-operation-disposition-346563260ee898e2af0a5113cdd620be099039de1996c563cf28bc299e9fb00b.json`
- `.verify-lineage-operation-disposition-5f595c284393b40321c22495c4ee91a035653cbbf7cea9ddd199cae2246fee96.json`
- `.verify-lineage-operation-disposition-a9cbcf6ecd8d213a1572c37f331129c9673f4a0d6485f383647049434128d2c7.json`
- `.verify-lineage-operation-f172b213382cd03ce0b9eadcf30e4026050e1eda3564a6148437fdcbdb9fe5b3.json`
- `.verify-lineage-operation-f640504b408227274332b5626fb035d93c6f018a3ef9a0660c682d24c2655f12.json`
- `.verify-lineage-operation-result-da5171bbef1263688c87cdb092536a3a622cc78147b7202efda7deb84d0ef1f4.json`
- `.verify-lineage-operation-result-ddfb44421bc2ed2e34ff71c4cba442f78f8ce6ca7e0b9c73e72aaab72b51495a.json`
- `.verify-lineage-predecessor-45f06a4a7607a6f9e992bd8361f1031997cd0138c7990f7e2a5a2d52cd18336a.json`
- `.verify-lineage-snapshot-11ada8bb1d9ebd5459cc01cc75b045f5f5737c3130673c693795eb31a369c396.json`
- `.verify-lineage-snapshot-6d534d4599bb03eb0cba9bad4e61fde2e4843462e625d0ec92a45e23ce6bc69c.json`
- `.verify-lineage-snapshot-71f2ff91e031b5d2b57236318ed618ead6de869ea261e77fc07acce5f491b49e.json`
- `.verify-lineage-snapshot-ab09831a6c51e27ba7ef5ea5939e219aa27985afda0774cd8236c23fb9da1d9c.json`
- `.verify-lineage-snapshot-f23e2a1527cdb24304ee85f865cec55f402592449cefa185a2ce4ca588311220.json`
- `.verify-lineage-snapshot-f63be389a572cb1533558795e9676297829133c72b35520bdb080400da42972d.json`
- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`
- `decisions/adr-004.md`
- `design.md`
- `proposal.md`
- `specs/generator/spec.md`
- `specs/install/spec.md`
- `specs/verify-lineage/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

---

## Archive Transaction & Closure Authority

1. Este reporte y el plan `archive-plan.json` han sido emitidos bajo el protocolo **Plan-and-Report**.
2. Ni este ejecutor ni el sub-agente realizan escrituras directas sobre las especificaciones vivas en `openspec/specs/**` o `docs/adr/**`, ni trasladan o eliminan el directorio de trabajo activo.
3. El orquestador ejecuta la transacción determinista llamando al runtime:
   ```bash
   node scripts/archive-transaction-run.js modernize-installer-model-selection
   ```
   (precedido opcionalmente por `node .ospec/sync-archive-plan-hashes.js modernize-installer-model-selection` para sincronización de digestión criptográfica).
4. El recibo estructurado (`receipt.json`) con `outcome: "success"` emitido por el runtime es la única autoridad formal de cierre del cambio.
