# Proposal: K4b Integration Invariants Remediation

## Intent

Cerrar cinco defectos de borde de K4b publicados en v2.48.1 para recuperar integración fail-closed, cápsulas mínimas K6a, semántica DAG correcta, persistencia repetible y comparación canónica. Esta remediación hace elegible el inicio posterior de K6b; no lo implementa.

## Scope

### In Scope
- Rechazar parches no vacíos sin archivos/hunks válidos como `MALFORMED_UNIFIED_DIFF`, salvo diffs exclusivamente de modo.
- Decisión fijada: Option A. WorkOrder v2 declarará `capsule_inputs`; K4a lo emitirá/derivará y K4b materializará `EffectiveShadowBase ∩ capsule_inputs`.
- Permitir solapamientos ancestro→descendiente y rechazar conflictos incompatibles entre predecesores DAG incomparables.
- Guardar N registros de ejecución por Candidate mediante clave interna, deduplicando registros byte-idénticos sin crear una quinta identidad de dominio.
- Proyectar desde `executionGraph` steps por `node_id`, dependencias, obligaciones e invariantes, junto con Candidate, WorkResults y telemetría.

### Out of Scope
- K6b Assurance Graph, promoción productiva o rediseño del pipeline K4a→K4b→K6a→WorkResult→integrate→K3.
- Option B (árbol efectivo completo), nuevas identidades universales y correcciones `executorFn`/firma ya cerradas.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `repair-shadow-orchestration`: integración fail-closed, conflictos DAG, registros 1:N y proyección canónica del comparador.
- `execution-graph-compiler`: emisión/derivación determinista de `capsule_inputs`.
- `worker-isolation`: materialización estricta de la intersección de cápsula.
- `kernel-contract-schemas`: WorkOrder v2 reconcilia `capsule_inputs` con contrato cerrado.

## Approach

Endurecer parser/integrador antes de congelar Candidate; clasificar conflictos mediante alcanzabilidad DAG; separar CandidateId de la clave interna de almacenamiento; construir un adaptador canónico del grafo para las siete dimensiones. Actualizar schema, compilador y materialización como una sola cadena contractual de Option A, con regresiones unitarias e integración.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `scripts/lib/repair-shadow/**` | Modified | Integración, DAG, store, proyección y tests |
| `scripts/lib/worker-workspace.js`, compilador K4a | Modified | Cápsula mínima efectiva |
| `schemas/kernel/work-order/v2.schema.json` | Modified | `capsule_inputs` cerrado |
| `openspec/specs/{repair-shadow-orchestration,execution-graph-compiler,worker-isolation,kernel-contract-schemas}/spec.md` | Modified | Deltas normativos |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Rechazar diffs legítimos | Medium | Casos de contenido, create/delete, `@@` y mode-only |
| Cápsula omite dependencia necesaria | High | Derivación determinista y E2E de cadena |
| Clave interna colisiona o duplica | Medium | Fingerprint canónico y deduplicación byte-exacta |

## Rollback Plan

Revertir conjuntamente schema, compilador, runtime K4b/K6a y tests. Mantener K4b en v2.48.1 como no conforme y K6b bloqueado; no migrar registros parciales.

## Dependencies

- Baselines K3, K4a, K4b y K6a existentes; Node.js 22+ y `npm test`.

## Success Criteria

- [ ] Las cuatro regresiones de parche fallan cerradas y mode-only sigue válido.
- [ ] Solo `capsule_inputs` efectivos se materializan.
- [ ] Cadena solapada pasa; diamante paralelo incompatible falla.
- [ ] Un Candidate admite N ejecuciones y deduplica igualdad byte-exacta.
- [ ] Las siete dimensiones reciben proyección canónica por `node_id`.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
