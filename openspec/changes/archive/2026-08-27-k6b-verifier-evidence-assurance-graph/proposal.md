# Proposal: k6b-verifier-evidence-assurance-graph

## Intent

Abrir K6b con un verifier independiente que evalúe un `CandidateId` congelado mediante evidencia suficiente y trazable, sin confiar en narrativa del worker. Materializar el Assurance Graph como proyección content-addressed reproducible para invalidar solo evidencia dependiente ante un successor.

## Scope

### In Scope
- Verifier sobre contract, Execution Graph, repo, raw evidence y `CandidateId`; rechazo de `WorkResult` no integrado o Candidate no congelado.
- Estrategias bug/feature/refactor/migration/config-docs, evidencia mínima/negativa y fallback Strict TDD por defecto.
- Provenance obligatoria por evidence node y policy de suficiencia.
- `AssuranceEdge` (`verified-by`, `satisfies`, `derived-from`, `invalidates`) e invalidación por closure que conserva evidencia independiente.
- Equivalence manifest preparado para evaluación K9, sin promover equivalencia.

### Out of Scope
- Autoridad lifecycle/approval/delivery para Assurance Graph.
- K7 review/findings, K8 attestation, K6c challenges, first-match routing, Change Program y Quality Attribute identities.

## Capabilities

### New Capabilities
- `independent-verification`: selección de estrategia, validación de Candidate congelado, provenance, suficiencia y verdict separado de evidencia.
- `assurance-graph`: proyección content-addressed, edges reproducibles e invalidación selectiva por successor o cambio de sujeto fuente.

### Modified Capabilities
- `kernel-contract-schemas`: endurecer `evidence/v1` y `verification/v1`, añadir contratos/fixtures del Assurance Graph y mantener evidencia ≠ verdict.
- `harness-authority-canon`: reconocer Assurance Graph únicamente como proyección derivada de OpenSpec/Git/Candidate.

## Approach

1. Extender schemas K1 sin reemplazar familias ni pins existentes.
2. Implementar módulos puros para estrategia, verifier, digest/edges y closure de invalidación.
3. Validar bindings canónicos antes de verificar; provenance insuficiente, stale, foreign o fabricada falla cerrada.
4. Probar determinismo, negativos y successor con Strict TDD; generar manifest de equivalencia no autoritativo.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `schemas/kernel/{evidence,verification,assurance-graph}/` | Modified/New | Contratos y fixtures |
| `scripts/lib/independent-verifier/` | New | Estrategias y verdict |
| `scripts/lib/assurance-graph/` | New | Proyección, digest y closure |
| `scripts/k6b-*.test.js` | New | Conformance e integración |
| `openspec/specs/{kernel-contract-schemas,harness-authority-canon}/` | Modified | Deltas normativos |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Reutilizar evidencia stale/transitiva | High | Closure conservadora y fixtures adversariales |
| Convertir proyección en autoridad | Med | APIs read-only, reconciliación canónica y boundary tests |
| Confundir evidencia con verdict | Med | Schemas, digests y validadores separados |

## Rollback Plan

Revertir módulos, schemas/fixtures y deltas K6b como una unidad; conservar K1/K3/K4b/K6a, Strict TDD y defaults actuales sin migrar artefactos ni promover el manifest.

## Dependencies

- K4b, K6a y K3 archivados; Execution Graph/PolicySnapshot K4a y schemas K1.

## Success Criteria

- [ ] Verifier rechaza `WorkResult`, Candidate no congelado y evidencia fabricada/stale/foreign.
- [ ] Cada strategy declara mínimos, negativos y provenance admisible; Strict TDD sigue por defecto.
- [ ] Mismos inputs producen mismo digest/edges; successor invalida solo closure y conserva evidencia independiente.
- [ ] Ningún consumer trata Assurance Graph como autoridad; manifest queda listo para K9.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
