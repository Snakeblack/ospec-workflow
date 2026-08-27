# Proposal: k6b-verification-integrity-remediation

## Intent

Cerrar seis defectos verificados del verifier y Assurance Graph de K6b (v2.50.0) sin reabrir el macro-slice ni iniciar K6c–K8. `evaluateStrategy()` solo comprueba roles: **strategy satisfied ≠ Execution Graph satisfied**. PASS exige evidencia admisible por cada MUST, bound al nodo correcto, con binding persistible y proyección fail-closed.

## Scope

### In Scope
- Walk MUST / Obligation Manifest / `required_evidence`; PASS solo con evidencia admisible en el `node_id` correcto.
- Binding aditivo persistible (assessment o verification evolucionada); no mutar `evidence/v2` ni K1 v1.
- Provenance fuerte derivada del collector/transport (digest ≠ origen; sin PKI).
- `graph_id` fingerprinta contract digest, policy snapshot, execution-graph digest e input OpenSpec; replay persistido.
- Proyección fallida ⇒ `GRAPH_DIVERGENCE` / `GRAPH_PROJECTION_FAILED`; facade no retorna `ok: true` sin grafo.
- `rejectForbidden` por kind/namespace, no substring del id.
- Tests adversariales (MUST sin evidencia, obligation_id inexistente, nodo incorrecto, un EvidenceId en cuatro roles, provenance reclasificada, replay, cambio de contract/policy).
- Roadmap: K6b `revise`; K6c `blocked-by-K6b-remediation` hasta archive; luego K6b `done`, K6c `next-eligible`.

### Out of Scope
- Macro-slice K6b; K6c/K6d/K7/K8; PKI; mutar `evidence/v2` o K1 v1; cambiar el compilador K4a.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `independent-verification`: cobertura MUST, assessment persistible, provenance de collector, proyección fail-closed.
- `assurance-graph`: fingerprint de canonicalInputs, replay persistido, `rejectForbidden` por kind.
- `kernel-contract-schemas`: familia aditiva de assessment/binding; pins `evidence/v2`, `verification/v2` y K1 v1 intactos.

## Approach

Tras strategy, evaluar MUST no diferidas con assessments persistibles (role + obligation + node + policy). `evidence/v2` permanece observación; el assessment id evita colapsar cuatro roles. Mapear collector/transport a clase fuerte; payload sin canal de confianza falla cerrado. Incluir canonicalInputs en `graph_id`. Si `projectAssuranceGraph` falla, el facade falla cerrado. Docs: K6b `revise`, K6c blocked.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/independent-verifier/` | Modified | Walk MUST, binding, provenance, fail-closed |
| `scripts/lib/assurance-graph/projector.js` | Modified | canonicalInputs; kind/namespace |
| `schemas/kernel/` | New (additive) | Assessment/binding + fixtures |
| `scripts/k6b-verifier-assurance-graph-e2e.test.js` | Modified | Replay persistido |
| `openspec/specs/{independent-verification,assurance-graph,kernel-contract-schemas}/` | Modified | Deltas |
| `docs/{architecture,roadmaps}/harness-evolution.md` | Modified | K6b revise; K6c blocked |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Consumers leen solo `evidence/v2` | High | Schema aditivo + E2E persistido |
| Unique-sort oculta roles | High | Assessment id incluye role+obligation |
| Collector mal mapeado | Med | Allowlist fail-closed |
| Docs dejan K6c next-eligible | Med | Roadmap en este change |

## Rollback Plan

Revertir runtime, schema aditivo, tests y docs como unidad. Conservar `evidence/v2`, `verification/v2` y pins K1. No migrar assessments parciales. K6b queda `revise` y K6c bloqueado hasta archive conforme.

## Dependencies

- K6b archivado (`2026-08-27-k6b-verifier-evidence-assurance-graph`); Obligation Manifest K4a; schemas `evidence/v2`, `verification/v2`, `assurance-graph/v1`, `execution-graph/v1`. Delivery: `exception-ok`.

## Success Criteria

- [ ] MUST sin evidencia, `obligation_id` inexistente o nodo incorrecto ⇒ FAIL cerrado.
- [ ] Cuatro roles sobre la misma observación producen assessments distintos.
- [ ] Provenance fuerte no se acepta solo desde el payload.
- [ ] Replay desde salidas persistidas; cambio de contract/policy cambia digest y reconcilia.
- [ ] Proyección fallida ⇒ `ok: false` (`GRAPH_DIVERGENCE` o `GRAPH_PROJECTION_FAILED`).
- [ ] `REQ-add-authorization-header` no se rechaza por substring.
- [ ] Roadmap: K6b `revise` y K6c `blocked-by-K6b-remediation` hasta archive.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
