# Design: k6b-semantic-integrity-remediation

## Technical Approach

Harden the existing CommonJS verifier and Assurance Graph pipeline in place. The change adds three ordered gates before a successful verdict: canonical contract binding, strategy semantics (non-aliased roles and temporal order), and token-level MUST coverage. Persisted `assessment/v1` records gain the required `evidence_requirements_satisfied` field; the sorted unique value participates in `assessment_id`. `evidence/v2`, `verification/v2`, and all K1 v1 bytes/pins remain unchanged.

The Assurance Graph projector will validate resolved canonical inputs before hashing. Replay will schema-validate and recompute every assessment before projection. Reconcile will validate the entire stored payload and independently recompute its declared `graph_id`, rather than trusting `graph_id` plus edges.

This confirms `sdd-propose-001` and `sdd-spec-001`: coverage stays on `assessment/v1`, the exact field is `evidence_requirements_satisfied`, and it is schema-required.

## Architecture Decisions

### Decision: Required canonical coverage on `assessment/v1` (ADR-001)

**Choice**: Add required `evidence_requirements_satisfied` to `assessment/v1`; canonicalize it and include it in `assessment_id`.

**Alternatives considered**: Mutating frozen `evidence/v2`; keeping coverage ephemeral; publishing a parallel assessment version.

**Rationale**: Coverage belongs to an evidence/role/obligation binding. Persisting it makes partial coverage and tampering replay-verifiable, at the cost of regenerating old partial assessments.

### Decision: Strategy role identity and order are evaluated before MUST coverage (ADR-002)

**Choice**: Use normalized EvidenceIds and `rawEvidence` order. Distinct roles cannot share one id; `bug` requires RED* < PATCH* < GREEN* and `strict-tdd` RED* < GREEN*.

**Alternatives considered**: A role Set, which loses identity/order; timestamps, which mutate frozen evidence and create clock authority; digest ordering, which has no chronology.

**Rationale**: The existing input is ordered and repeated evidence for one role can remain valid. Strategy violations fail before the MUST walk.

### Decision: One canonical integrity path for project, replay, and reconcile (ADR-003)

**Choice**: Share canonical-input and graph-id helpers across project, replay, and reconcile.

**Alternatives considered**: Hardening only `verifyCandidate`; retaining graph-id-plus-edges comparison; trusting recomputed assessment ids without graph binding checks.

**Rationale**: Direct graph APIs are public. Project rejects bad digests, replay validates assessments, and reconcile recomputes and compares the complete stored payload.

## Data Flow

```text
verifyCandidate
  -> validateBindings
       -> input.contract.contract_digest == executionGraph.contract_digest
  -> normalize rawEvidence in caller-supplied list order
       -> evidence/v2 (unchanged) + role/obligation/coverage binding metadata
  -> evaluateStrategy
       -> one EvidenceId cannot cover distinct strategy roles
       -> bug: RED* < PATCH* < GREEN*; strict-tdd: RED* < GREEN*
  -> walkMustObligations
       -> union evidence_requirements_satisfied per obligation
       -> required_evidence subset check
       -> emit assessment/v1 for each contributing tuple
  -> emit verification/v2
  -> projectAssuranceGraph
       -> validate canonical digests -> canonical nodes/edges -> graph_id
```

```text
persisted candidate + graph + evidence + assessments + verification
  -> replayAssuranceGraph
       -> schema + assessment_id + candidate/policy/evidence/node/obligation checks
       -> token-level MUST coverage check
       -> projectAssuranceGraph
  -> reconcileAssuranceGraph(stored, canonical input)
       -> recompute stored graph_id from stored payload
       -> compare full stored payload with current canonical projection
       -> any mismatch: GRAPH_DIVERGENCE
```

All four resolved canonical values must be SHA-256 strings; supplied values must equal authoritative Graph/contract bindings. For coverage, the MUST walk intersects each binding's tokens with the obligation requirements, persists relevant sorted tokens, and checks their union. Missing tokens return `UNFULFILLED_MUST`; existing codes remain for unknown obligations, wrong nodes, and provenance failure.

## File Changes

| File | Action | Description |
| --- | --- | --- |
| `scripts/lib/independent-verifier/{bindings,evidence,strategy-policy}.js` | Modify | Contract gate; normalized coverage; role identity and sequence. |
| `scripts/lib/independent-verifier/{assessment,obligation-coverage,index}.js` | Modify | Canonical assessment validation, token-subset walk, ordered facade gates. |
| `scripts/lib/assurance-graph/{projector,index}.js` | Modify | Strict canonical inputs, assessment replay, full stored-graph reconciliation. |
| `schemas/kernel/assessment/v1.schema.json` | Modify | Require closed-array field `evidence_requirements_satisfied`. |
| `schemas/kernel/contract-claims.json` | Modify | Add the field to assessment required claims; leave manifest `$id` unchanged. |
| `schemas/kernel/assessment/fixtures/{valid,invalid}/*.json` | Modify/Create | Complete/four-role coverage; verdict, cross-family, and missing-coverage failures. |
| `scripts/lib/independent-verifier/*.test.js` | Modify | Identity, subset, aliasing, digest, and sequence adversaries. |
| `scripts/lib/assurance-graph/index.test.js` | Modify | Input, assessment, replay, and stored-payload tampering. |
| `scripts/lib/k6b-schema-fixtures.test.js` | Modify | Claims/fixtures and frozen-contract pins. |
| `scripts/k6b-verifier-assurance-graph-e2e.test.js` | Modify | Complete verify/project/replay/reconcile path. |
| `docs/architecture/harness-evolution.md` | Modify | Mark K6b `revise` and K6c blocked until remediation archive. |
| `docs/roadmaps/harness-evolution.md` | Modify | Apply the same temporary dependency status at roadmap checkpoints. |

## Interfaces / Contracts

```javascript
// Raw verifier binding metadata; evidence/v2 remains unchanged.
{
  role: "acceptance",
  obligation_ids: ["req-repair-001"],
  evidence_requirements_satisfied: ["ev:test-pass"],
  bytes, origin, node_id
}

// ospec://schemas/kernel/assessment/v1
{
  schema_version: 1,
  kind: "assessment/v1",
  assessment_id,
  evidence_id,
  role,
  obligation_id,
  node_id,
  candidate_id,
  policy_snapshot_id,
  evidence_requirements_satisfied: ["ev:test-pass"]
}
```

`computeAssessmentId` fingerprints every field above except `assessment_id`, with coverage sorted and deduplicated first. The assessment schema remains `additionalProperties: false` and forbids `verdict`. Direct schema validation of four same-evidence role records remains valid; `verifyCandidate` rejects their combined semantic use because schema validity is not strategy admissibility.

## Requirement Allocation

| Requirement/scenarios | Component allocation |
| --- | --- |
| REQ-independent-verification-008 digest mismatch | `bindings.js` before `selectStrategy`; facade test proves no verdict. |
| REQ-independent-verification-005 unknown obligation/wrong node/partial `[A,B]` coverage | `evidence.js` binding metadata + `obligation-coverage.js` subset walk. |
| REQ-independent-verification-006 aliasing and order adversaries | `strategy-policy.js`; `assessment.js` retains distinct tuple identities. |
| REQ-kernel-contract-schemas-027 complete/missing/cross-family/frozen pins | assessment schema/fixtures, contract claims, K6b schema fixture tests. |
| REQ-assurance-graph-007 contradiction/null digest | `projector.js` canonical binding validator before graph-id construction. |
| REQ-assurance-graph-006 tampered/schema/candidate/policy/evidence/obligation/node replay | `assessment.js` validator + `assurance-graph/index.js` replay preflight. |
| REQ-assurance-graph-008 nodes/canonical inputs/candidate/kind/schema/stored-id divergence | stored-payload graph-id recomputation and full canonical comparison in `assurance-graph/index.js`. |

## Testing Strategy

| Layer | What to Test | Approach |
| --- | --- | --- |
| Unit | Contract digest gate | C1 graph/C2 contract returns before strategy and emits no PASS. |
| Unit | Strategy semantics | Same id for distinct roles; GREEN before RED; RED after PATCH; valid ordered distinct ids. |
| Unit | Coverage and assessment identity | `[A,B]` with A only fails; multiple bindings union to `[A,B]`; coverage mutation changes id. |
| Contract | `assessment/v1` | Valid complete/four-role fixtures; omitted coverage, verdict, and cross-family fail; frozen pins unchanged. |
| Unit | Projector | Contradictory provided/authoritative digests and null resolved digest return `GRAPH_DIVERGENCE`. |
| Integration | Replay | Tamper schema, id, candidate, policy, evidence reference, obligation, node, or coverage and fail closed. |
| Integration | Reconcile | Tamper nodes, canonical inputs, candidate, kind/schema, or stored graph id and return `GRAPH_DIVERGENCE`. |
| E2E | Full K6b pipeline | Valid token-complete evidence verifies, projects twice deterministically, replays byte-identically, and rejects stored mutations. |

## Migration / Rollout

No data migration or feature flag. Existing partial `assessment/v1` payloads without coverage are intentionally invalid and must be regenerated from canonical verifier inputs; they are not upgraded in place. Apply schema, verifier, projector/replay/reconcile, fixtures, tests, and temporary roadmap status as one rollback unit. Archive may restore K6b `done` and K6c `next-eligible` only after verification. Frozen `evidence/v2`, `verification/v2`, and K1 baselines must remain byte-identical throughout.

## Open Questions

None.
