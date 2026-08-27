# Proposal: k6b-semantic-integrity-remediation

## Intent

Cerrar seis defectos semánticos post-v2.51.0 (B1–B3, H1–H3) sin reabrir el macro-slice K6b ni iniciar K6c. Un Set de roles no equivale a evidencia no aliasable; `required_evidence.length > 0` no equivale a cobertura token a token; projector, replay y reconcile no fallan cerrados ante inputs contradictorios o payloads tampered.

## Scope

### In Scope
- **B1 (corrección de REQ-006):** roles incompatibles MUST NOT compartir un EvidenceId; Strict TDD es RED → GREEN (no un Set); GREEN-before-RED y RED-after-PATCH fallan. `assessment_id` distintos por tupla `(evidence, role, obligation)`; la misma observación no satisface roles incompatibles.
- **B2:** MUST-walk exige `required_evidence ⊆ evidence_requirements_satisfied` (como K4a). Persistir cobertura en assessment/binding (campo aditivo; nombre design-owned).
- **B3:** Antes de strategy, `input.contract.contract_digest === executionGraph.contract_digest`; divergencia fail-closed.
- **H1:** `projectAssuranceGraph` fail-closed si canonicalInputs contradicen Graph/contract/policy o si la preimage admite digests null.
- **H2:** Replay revalida schema y recomputa `assessment_id`/`candidate_id`/`policy_snapshot_id`; evidencia, obligation, nodo implementador y `node_id`.
- **H3:** Reconcile también nodes, canonical_inputs, candidate_id y kind/schema (o recompute `graph_id` del stored).
- Tests adversariales. Docs: K6b `revise`; K6c `blocked-by-K6b-remediation` hasta archive.

### Out of Scope
- Macro-slice K6b; K6c/K6d/K7/K8; PKI; mutar `evidence/v2` o K1 v1; rediseñar K6b; provenance v2.51.0.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `independent-verification`: REQ-006 deja de exigir relabeling de cuatro roles sobre el mismo EvidenceId; cobertura token a token; gate de digests contract ↔ Execution Graph antes de strategy.
- `assurance-graph`: projector, replay y reconcile fail-closed (H1–H3).
- `kernel-contract-schemas`: campo aditivo de cobertura en assessment/binding; pins `evidence/v2`, `verification/v2` y K1 v1 intactos.

## Approach

Corregir spec y runtime juntos. Strategy exige EvidenceIds distintos para roles incompatibles y orden temporal Strict TDD. MUST-walk consume cada token y persiste refs aditivas. Gate previo a strategy iguala contract digests. El projector público rechaza canonicalInputs contradictorios y preimages con digest null. Replay revalida assessments; reconcile compara el stored payload (o su `graph_id` recompute). Schema solo aditivo.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/independent-verifier/` | Modified | B1–B3 + invertir REQ-006 |
| `scripts/lib/assurance-graph/` | Modified | H1–H3 |
| `schemas/kernel/assessment/` | Modified (additive) | Coverage field + fixtures |
| `openspec/specs/{independent-verification,assurance-graph,kernel-contract-schemas}/` | Modified | Deltas |
| `docs/{architecture,roadmaps}/harness-evolution.md` | Modified | K6b revise; K6c blocked |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Tests/spec v2.51.0 exigen aliasing de cuatro roles | High | Corrección conjunta spec+test+runtime |
| Campo aditivo leído como mutación de `evidence/v2` | Med | Familia assessment/binding; pins byte-identical |
| Docs dejan K6c `next-eligible` | Med | Roadmap en este change |

## Rollback Plan

Revertir runtime, schema aditivo, tests y docs como unidad. Conservar `evidence/v2`, `verification/v2` y pins K1. No migrar assessments parciales. K6b queda `revise` y K6c bloqueado hasta archive conforme.

## Dependencies

- Integridad K6b v2.51.0 (`2026-08-27-k6b-verification-integrity-remediation`); Obligation Manifest K4a; schemas `assessment/v1`, `evidence/v2`, `assurance-graph/v1`. Delivery: `exception-ok`.

## Success Criteria

- [ ] Mismo EvidenceId como RED+GREEN ⇒ FAIL.
- [ ] GREEN before RED ⇒ FAIL.
- [ ] RED after PATCH ⇒ FAIL.
- [ ] `required_evidence = [A,B]` y solo A ⇒ FAIL.
- [ ] Graph.contract=C1 y input.contract=C2 ⇒ FAIL.
- [ ] Graph=C1 y canonicalInputs=C2 ⇒ `GRAPH_DIVERGENCE`.
- [ ] `assessment_id` tampered ⇒ `GRAPH_DIVERGENCE` / invalid assessment.
- [ ] Stored nodes tampered ⇒ `GRAPH_DIVERGENCE`.
- [ ] Roadmap: K6b `revise`; K6c `blocked-by-K6b-remediation` hasta archive.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
