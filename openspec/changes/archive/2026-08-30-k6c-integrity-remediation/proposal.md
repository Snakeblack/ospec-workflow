# Proposal: K6c Integrity Remediation

## Intent

Cerrar fallos de integridad en K6c sin cambiar su catálogo ni selección proporcional. Planes y resultados deben quedar ligados al `Candidate` congelado, nodo, estrategia y `PolicySnapshot`; ningún bypass debe producir aprobación.

## Scope

### In Scope

- Validar schemas, hashes, bindings y cardinalidad; rechazar resultados ausentes, duplicados o extranjeros.
- Exigir plan cuando policy/estrategia lo ordenen, capabilities del ejecutor, timeout real y cancelación.
- Derivar scope focal del diff congelado; ejecutar aisladamente con digest pre/post.
- Proyectar plan/resultados en Assurance Graph y probar adversarialmente cada bypass.
- Mantener K6d bloqueado hasta verificación terminal satisfactoria.

### Out of Scope

- Rediseñar K6c, cambiar el catálogo o conferir autoridad de lifecycle/delivery.
- Implementar K6d u otras fases posteriores del kernel.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `adversarial-challenges`: bindings, planificación requerida, capabilities, aislamiento, timeout y scope autoritativo.
- `independent-verification`: cobertura exacta del plan y rechazo de incoherencias.
- `assurance-graph`: proyección reproducible no autoritativa de planes/resultados.
- `kernel-contract-schemas`: contratos K6c cerrados y fixtures negativos.

## Approach

Conservar APIs y selección, añadiendo una puerta común que valide schemas y recompute identidades antes de planificar, ejecutar, verificar o proyectar. Ejecutar cada selección una vez en un workspace efímero creado desde el Candidate; exigir su capability, derivar scope del diff, cancelar al vencer el plazo y comparar digest pre/post. El verifier exigirá cobertura exacta; el projector incorporará registros validados a su preimagen.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `scripts/lib/adversarial-challenges/**` | Modified | Planificación/ejecución |
| `scripts/lib/independent-verifier/**` | Modified | Gate fail-closed |
| `scripts/lib/assurance-graph/**` | Modified | Proyección/replay |
| `schemas/kernel/{challenge-plan,challenge-result}/**` | Modified | Contratos/fixtures |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Payloads K6c permisivos incompatibles | High | Rechazo explícito; sin fallback |
| Fuga o mutación del Candidate | Med | Workspace efímero, scope derivado y doble digest |
| Proceso huérfano tras timeout | Med | Cancelación propagada y prueba no cooperativa |

## Rollback Plan

Revertir atómicamente runtime, schemas y specs a v2.56.0; mantener K6d bloqueado.

## Dependencies

- Candidate v2, Execution Graph, `PolicySnapshot` y Assurance Graph.

## Success Criteria

- [ ] Cada bypass tiene regresión adversarial RED/GREEN.
- [ ] Ningún challenge requerido puede omitirse, duplicarse, falsificarse, salir del diff o sobrevivir al timeout.
- [ ] Digest pre/post coincide y la proyección es determinista.
- [ ] Suite completa y `sdd-verify` terminal pasan; K6d no comienza antes.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
