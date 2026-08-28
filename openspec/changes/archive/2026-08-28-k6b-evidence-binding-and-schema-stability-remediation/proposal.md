# Proposal: K6b Evidence Binding and Schema Stability Remediation

## Intent

Remediación quirúrgica de la estabilidad de esquemas, integridad semántica del enlace de evidencia y validación estricta de replay en K6b para asegurar que las observaciones físicas queden desacopladas de los metadatos de confianza, se prevenga divergencia de grafo y se proyecte el Assurance Graph sin afirmaciones no verificadas.

## Scope

### In Scope
- Publicar `schemas/kernel/assessment/v2.schema.json` (`$id: ospec://schemas/kernel/assessment/v2`, `schema_version: 2`) con `evidence_requirements_satisfied` obligatorio (rechazando arrays vacíos para claims de satisfacción) y restaurar `assessment/v1.schema.json` al contrato retrocompatible v2.51.0.
- Separar observación física (`rawEvidence`: bytes, provenance, origin, node_id, execution_sequence) de metadatos semánticos de confianza (`role`, `obligation_ids`, `evidence_requirements_satisfied`), derivados exclusivamente por el verifier/harness contra el Execution Graph y runner receipts.
- Validación estricta y autoritativa de `openspec_input_digest` en `resolveCanonicalInputDigests()`, fallando con `GRAPH_DIVERGENCE` ante cualquier discordancia con el digest canónico recomputado.
- Revalidación integral en replay para `evidence/v2` (esquema, candidate binding, digest recomputado, suficiencia de provenance) y `verification/v2` (esquema, verification_id recomputado, candidate binding, subset de evidence_ids).
- Proyección determinista de Assurance Graph: emitir arista `satisfies` únicamente si `evidence_requirements_satisfied.length > 0`.
- Matriz de incompatibilidad de roles de evidencia (permitiendo compatibilidad ej. `integration` + `acceptance`, pero bloqueando `red` ↔ `green`, `characterization-before` ↔ `characterization-after`, etc.).
- Validación de precedencia cronológica para refactor (`characterization-before` -> `characterization-after`) mediante `execution_sequence` / ordinal / `previous_evidence_id`.
- Limpieza de comentarios obsoletos, actualización de manifest/contract-claims y corrección de metadatos.

### Out of Scope
- Challenges adversariales K6c (revert, mutation, test inspection) y análisis de complejidad K6d.
- Attestation formal de evaluación de entrega K8 o autorizaciones de release K10.
- Reescritura del compilador de Execution Graph o del reducer general del ciclo de vida.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `kernel-contract-schemas`: Publicación canónica de `assessment/v2`, restauración retrocompatible de `assessment/v1`, registro en `manifest.json` y `contract-claims.json`.
- `independent-verification`: Desacoplamiento de `rawEvidence` y metadatos de confianza, matriz de incompatibilidad de roles de evidencia, y validación de precedencia cronológica para refactor.
- `assurance-graph`: Validación autoritativa de `openspec_input_digest` con error `GRAPH_DIVERGENCE`, revalidación integral en replay de `evidence/v2` y `verification/v2`, y proyección de aristas `satisfies` condicionada a satisfacción no vacía.

## Approach

Introducir `assessment/v2.schema.json` y mantener `assessment/v1` intacto. Modificar el arnés de verificación para computar y vincular semántica de evidencia desde runner receipts y el Execution Graph en vez de confiar en inputs del invocador. Aplicar chequeo de paridad estricto en `resolveCanonicalInputDigests()` para detonar `GRAPH_DIVERGENCE`. Enriquecer el motor de replay para revalidar evidencias y verificaciones v2. Modelar la matriz de incompatibilidad de roles con reglas deterministas y validar la secuencia temporal de evidencias de caracterización. Proyectar aristas `satisfies` en el Assurance Graph condicional a satisfacción no vacía.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `schemas/kernel/assessment/**` | New/Modified | Publicación v2 con `evidence_requirements_satisfied` y restore retrocompatible v1 |
| `schemas/kernel/evidence/**`, `schemas/kernel/verification/**` | Modified | Contratos v2 y fixtures de no-aliasing |
| `schemas/kernel/manifest.json`, `contract-claims.json` | Modified | Registro canónico de esquemas v2 |
| `scripts/lib/execution-graph/**` | Modified | `resolveCanonicalInputDigests`, chequeo `GRAPH_DIVERGENCE`, replay v2 |
| `scripts/lib/verify-*`, `scripts/lib/assurance-*` | New/Modified | Binding de evidencia, matriz de roles, precedencia cronológica, Assurance Graph |
| `openspec/specs/**` | New/Modified | Especificaciones para `evidence-binding-and-assurance`, `kernel-contract-schemas`, `execution-graph-compiler` |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Ruptura de consumidores legacy de `assessment/v1` | Low | Restaurar contrato exacto v2.51.0 y tests de compatibilidad |
| Falso positivo `GRAPH_DIVERGENCE` por ordenamiento no canónico | Low | Canonicidad estricta de serialización y hashing de inputs |
| Falso rechazo al compartir evidencias legítimas entre roles | Low | Matriz formal de incompatibilidad en lugar de prohibición global de reuso |

## Rollback Plan

Revertir los esquemas `assessment/v2`, `evidence/v2` y `verification/v2`, restaurar los archivos en `scripts/lib/` y volver a los baselines de validación previos sin alterar los baselines K4b o K6a archivados.

## Dependencies

- Baselines K3, K4a, K4b, K6a aprobados y archivados; Node.js 22+ y suite de tests `npm test`.

## Success Criteria

- [ ] `assessment/v2` publicado exigiendo `evidence_requirements_satisfied` no vacío y `assessment/v1` restablecido en compatibilidad v2.51.0.
- [ ] Metadatos semánticos derivados autoritativamente por el harness y aislados de `rawEvidence`.
- [ ] `resolveCanonicalInputDigests()` falla con `GRAPH_DIVERGENCE` ante digest canónico no coincidente.
- [ ] Replay revalida exhaustivamente contratos, identidades, bindings y provenance de `evidence/v2` y `verification/v2`.
- [ ] Assurance Graph emite aristas `satisfies` solo con satisfacción efectiva (`length > 0`).
- [ ] Matriz de incompatibilidad previene conflictos (ej. red ↔ green) mientras permite sharing no conflictivo (ej. integration + acceptance).
- [ ] Precedencia `characterization-before` -> `characterization-after` validada cronológicamente.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
