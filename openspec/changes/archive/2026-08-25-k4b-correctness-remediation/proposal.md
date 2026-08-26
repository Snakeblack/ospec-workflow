# Proposal: K4b Correctness Remediation

## Intent

Corregir la implementación K4b publicada en v2.48.0 para que cumpla realmente sus criterios de cierre: despacho exclusivo por K6a, integración autorizada y determinista, propagación material de dependencias, comparación completa y registro auditable. K4b permanecerá no terminado hasta archivar esta remediación; K6b no se abre en este cambio.

## Scope

### In Scope
- Corregir la llamada a `executeWorkOrder({ workOrder, workspace, ... })`, eliminar `executorFn` y limitar opciones seguras sin permitir sobrescribir autoridad.
- Validar líneas de contexto/eliminación, modos de archivo y `WorkOrder.allowed_paths` por cada `WorkResult`.
- Propagar resultados integrados a dependientes mediante una base shadow derivada, conservando un workspace nuevo por nodo.
- Comparar obligatoriamente steps, dependencies, diffs, inventory, obligations, invariants y execution metrics.
- Persistir `repair-shadow-execution/v1`, vinculando CandidateId, ExecutionGraph y PolicySnapshot mediante el store existente.
- Corregir spec baseline, E2E real K6a, roadmap y ADRs promovidos.

### Out of Scope
- K6b, Assurance Graph, K9, promoción de candidatos o nuevos kernels.
- Incorporar el policy digest en CandidateId.
- Compartir un workspace mutable entre nodos.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `repair-shadow-orchestration`: endurece despacho K6a, propagación material, integración/autorización, comparación y persistencia auditable.

## Approach

Ejecutar cada nodo con K6a real y opciones autorizadas; integrar su `WorkResult` contra la base efectiva validando hunks, modos y rutas del WorkOrder; derivar de forma determinista la base material para cada dependiente sin reutilizar workspaces. Al finalizar, congelar Candidate v2, evaluar todas las dimensiones requeridas y guardar un registro versionado en `filesystem-store`.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `scripts/lib/repair-shadow/**` | Modified | Orquestación, integración, comparación, API y tests |
| `scripts/k4b-repair-shadow-e2e.test.js` | Modified | N1 añade `multiply()`; N2 lo importa y ejecuta mediante K6a real |
| `openspec/specs/repair-shadow-orchestration/spec.md` | Modified | Firma correcta y requisitos remediados |
| `docs/roadmaps/harness-evolution.md`, `docs/adr/adr-20260825-00{6,7}-*.md` | Modified | Estado K4b y metadatos ADR coherentes |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Derivación incorrecta o no determinista entre nodos | High | E2E material obligatorio y digests reproducibles |
| Escalada de autoridad por opciones o parches | High | Allowlist de opciones, autoridad del WorkOrder y validación fail-closed |
| Registro incompleto o divergente | Medium | Esquema v1, bindings explícitos y pruebas de replay/auditoría |

## Rollback Plan

Revertir atómicamente código, spec y documentación de esta remediación. Mantener K4b como no terminado y K6b bloqueado; no migrar ni promover registros/candidatos parciales.

## Dependencies

- K3 Candidate v2, K4a ExecutionGraph/PolicySnapshot, K6a WorkerTransport/WorkerIsolation y `filesystem-store`.
- Aprobación vinculante: `material-dependency-propagation`; excepción de tamaño aceptada.

## Success Criteria

- [ ] No existe `executorFn`; todo nodo usa `executeWorkOrder` con la firma de objeto y autoridad no sobreescribible.
- [ ] Hunk, modo y `allowed_paths` incorrectos fallan cerrados; los modos afectan Candidate v2.
- [ ] El E2E obligatorio demuestra que N2 ejecuta código `multiply()` producido por N1 usando K6a real y aislamiento probado.
- [ ] Las siete dimensiones se evalúan sin omisiones y el registro `repair-shadow-execution/v1` es consultable.
- [ ] Tests pasan y spec, roadmap y ADRs quedan reconciliados; K6b solo resulta elegible tras archive.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
