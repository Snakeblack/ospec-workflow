# Design: K6b Independent Verifier, Evidence, and Assurance Graph

## Technical Approach

K6b adds two CommonJS packages: `scripts/lib/independent-verifier/` evaluates a frozen Candidate v2; `scripts/lib/assurance-graph/` projects evidence and verification. The verifier consumes K3/K4a bindings, K4b's integrated Candidate, repository bytes, and raw evidence. It never invokes K6a or accepts a `WorkResult` as subject; upstream modules remain unaware of K6b.

Verification is fail-closed: validate Candidate and graph bindings, select one strategy, normalize `evidence/v2`, evaluate provenance/sufficiency, then emit separate `verification/v2`. The graph package canonicalizes and hashes the projection, reconciles canonical inputs, and computes selective invalidation.

## Architecture Decisions

### Decision: Publish additive v2 evidence and verification contracts (ADR-001)

| Option | Tradeoff | Decision |
|---|---|---|
| Mutate v1 | Fewer versions, but breaks K1 pins and consumers. | Rejected. |
| Add `evidence/v2` and `verification/v2` | Preserves compatibility while making provenance and identity explicit. | **Chosen.** |

**Rationale**: This follows the Candidate/WorkOrder v2 precedent. `evidence/v1`, `verification/v1`, their fixtures, and `K1_SCHEMA_BASELINE` remain byte-identical; registry entries are additive.

### Decision: Independent verifier with policy-driven strategies (ADR-002)

| Option | Tradeoff | Decision |
|---|---|---|
| Trust worker narrative | Cannot establish independent sufficiency. | Rejected. |
| Re-run every check | Wasteful and not strategy-specific. | Rejected. |
| Pure verifier over Candidate and raw evidence | Requires explicit policy tables and bindings; preserves role separation. | **Chosen.** |

**Rationale**: `strategy-policy.js` declares minimum, negative, and provenance sets for the five strategies. Missing strategy selects `strict-tdd`, requiring runtime RED then GREEN evidence. Selection never rewrites `openspec/config.yaml`; an equivalence manifest is K9 input only.

### Decision: Assurance Graph is a deterministic projection with closure invalidation (ADR-003)

| Option | Tradeoff | Decision |
|---|---|---|
| Mutable graph store as authority | Fast queries, but creates split-brain state. | Rejected. |
| Full re-verification on every successor | Simple, but discards independent evidence. | Rejected. |
| Recomputable projection plus dependent closure | More careful edge direction, but deterministic and selective. | **Chosen.** |

**Rationale**: Nodes and edges are sorted and deduplicated before hashing. Reconciliation recomputes from canonical inputs. Invalidation traverses dependencies from changed subjects; anything outside the closure remains reusable.

## Data Flow

### Independent verification sequence

```text
Caller        Verifier         K3/K4a bindings      Strategy policy       Graph projector
  | verify(input) |                    |                    |                    |
  |-------------->| validate Candidate|                    |                    |
  |                |------------------>|                    |                    |
  |                | reconcile repo + Execution Graph      |                    |
  |                |------------------>|                    |                    |
  |                | select exactly one strategy---------->|                    |
  |                | normalize raw bytes -> evidence/v2    |                    |
  |                | evaluate obligations/provenance------>|                    |
  |                | emit verification/v2 (PASS/WARN/FAIL) |                    |
  |                |----------------------------------------------------------->|
  |                |                    | canonical nodes/edges + graph digest  |
  |<---------------| verification, evidence, graph (all read-only projections) |
```

Binding, digest, subject, staleness, fabrication, or provenance failures return `{ok:false, reason_code}` before a positive verdict. Worker prose is only `model-reported` evidence and cannot satisfy stronger provenance.

### Successor invalidation closure

```text
changed source/Candidate
        |
        v
 seed matching subject nodes
        |
        v
 traverse derived-from / verified-by / satisfies / invalidates
        |
        +----> dependent evidence + decisions: invalidated
        |
        `----> unreachable evidence: preserved
```

Traversal is cycle-safe and sorted. Evidence reachable through transitive `invalidates` is rejected.

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/lib/independent-verifier/index.js` | Create | Public `verifyCandidate(input)` facade and exports. |
| `scripts/lib/independent-verifier/bindings.js` | Create | Candidate, repository, Execution Graph, node, raw-byte, and stale-subject gates using K3/K4a APIs. |
| `scripts/lib/independent-verifier/strategy-policy.js` | Create | Closed strategy table, exact-one selection, provenance admission, and Strict TDD fallback. |
| `scripts/lib/independent-verifier/evidence.js` | Create | Canonical evidence normalization/digest and obligation sufficiency evaluation. |
| `scripts/lib/independent-verifier/verdict.js` | Create | Deterministic verification record; never embeds verdict in evidence. |
| `scripts/lib/assurance-graph/index.js` | Create | Public projection, reconciliation, invalidation, and manifest exports. |
| `scripts/lib/assurance-graph/projector.js` | Create | Canonical read-only nodes/edges and graph digest. |
| `scripts/lib/assurance-graph/invalidation.js` | Create | Selective dependent-closure computation and transitive stale checks. |
| `schemas/kernel/{evidence,verification}/v2.schema.json` | Create | Additive closed v2 contracts. |
| `schemas/kernel/assurance-graph/v1.schema.json` | Create | Graph and optional distinct equivalence-manifest contract. |
| `schemas/kernel/{evidence,verification,assurance-graph}/fixtures/{valid,invalid}/*.json` | Create | Positive, negative, malformed, provenance, relation, and non-aliasing cases. |
| `schemas/kernel/{manifest.json,contract-claims.json}` | Modify | Register additive families/versions and claims. |
| `scripts/lib/k6b-schema-fixtures.test.js` | Create | Schema registration, fixtures, pin preservation, and cross-family rejection. |
| `scripts/lib/independent-verifier/index.test.js` | Create | Binding, strategy, provenance, sufficiency, and verdict tests. |
| `scripts/lib/assurance-graph/index.test.js` | Create | Digest order independence, reconciliation, closure, and manifest tests. |
| `scripts/k6b-verifier-assurance-graph-e2e.test.js` | Create | K4b Candidate → independent verify → graph → successor invalidation flow. |
| `scripts/lib/roadmap-boundary.test.js` | Modify | Assert K3/K4a/K4b/K6a do not import or reference K6b modules. |
| `docs/{architecture,roadmaps}/harness-evolution.md` | Modify | Mark only K6b verifier/provenance/projection implemented; retain graph authority and K6c/K7/K8 as target/experimental. |

## Interfaces / Contracts

```javascript
verifyCandidate({
  candidate, executionGraph, sourceSnapshot, policySnapshot,
  repository, contract, rawEvidence, declaredStrategy, priorAssuranceGraph
})
// -> { ok, strategy, evidence, verification, reason_code? }

projectAssuranceGraph({
  canonicalInputs, candidate, executionGraph, evidence, verification
})
// -> assurance-graph/v1; graph_id = sha256Fingerprint("assurance-graph/v1", canonicalProjection)

computeInvalidationClosure(graph, {
  predecessorCandidate, successorCandidate, changedSubjectIds
})
// -> { invalidated_node_ids: [...sorted], preserved_evidence_ids: [...sorted], edges: [...] }
```

`evidence_id` digests all evidence/v2 fields except itself plus exact raw bytes; `digest` binds those bytes. `verification_id` digests CandidateId, verdict, and sorted unique evidence IDs. The graph permits only the four specified relations. APIs return new objects and expose no write-through authority.

## Requirement Allocation

| MUST scenarios | Allocation |
|---|---|
| REQ-independent-verification-001 | `bindings.js`: K3 Candidate v2 kind/schema/recompute, K4a bindings, repository reconciliation; explicit WorkResult/unfrozen rejection. |
| REQ-independent-verification-002 | `strategy-policy.js`: per-strategy minimum/negative rules and immutable Strict TDD fallback. |
| REQ-independent-verification-003/004 | `evidence.js` + `verdict.js`: raw digest, Candidate/node/staleness/provenance checks; separate evidence and verdict records. |
| REQ-assurance-graph-001/002 | `projector.js`: canonical recomputation, sorted edge set, allowed relations/subjects, read-only fail-closed reconciliation. |
| REQ-assurance-graph-003 | `invalidation.js`: successor/source seeds, transitive closure, selective preservation, stale reuse rejection. |
| REQ-assurance-graph-004 | `index.js` + graph schema: Candidate/graph-bound, non-promotional manifest with non-aliasing fixtures. |
| REQ-kernel-contract-schemas-024/025/026 | Three schemas, fixtures, registry/claims, and `k6b-schema-fixtures.test.js`; v1 byte pins asserted unchanged. |
| REQ-harness-authority-canon-010/011 and modified 001 | Read-only API/boundary tests plus precise maturity updates in both harness-evolution documents. |

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Bindings, strategies, fallback, provenance, verdict separation | Fixtures cover WorkResult subject, forged Candidate, model-only claim, stale/foreign/digest mismatch, and required negatives. |
| Unit | Projection determinism and closure | Permute nodes/edges, duplicate edges, introduce forbidden relations, graph divergence, cycles, transitive invalidation, and independent evidence. |
| Contract | v2/v1 schemas and non-aliasing | Load by `$id`, validate all fixtures, compare frozen v1 bytes/pins, reject evidence↔verification↔attestation/authorization substitution. |
| Integration | End-to-end K6b | Use a real K4b-frozen Candidate and K4a graph; verify, project twice, create successor, invalidate only affected evidence. |
| Architecture | Unidirectional imports and authority | Static boundary assertions ensure upstream modules never import K6b and graph APIs expose no mutating authority. |

Strict TDD governs implementation task-by-task (RED, GREEN, adversarial triangulation, refactor) without changing `testing.tdd_mode: focused`.

## Migration / Rollout

No data migration or default promotion is required. Publish and register additively, run focused tests plus `npm test`, then update maturity docs. Rollback removes K6b additions as one unit; v1 bytes and K1 pins never move. The manifest stays non-authoritative until K9; K6c/K7/K8/K10 remain inactive.

## Open Questions

None.
