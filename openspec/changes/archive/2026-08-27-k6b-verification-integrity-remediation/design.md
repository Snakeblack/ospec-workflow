# Design: k6b-verification-integrity-remediation

## Technical Approach

Remediate six K6b integrity defects in the existing CommonJS verifier and projector. Do not reopen the macro-slice. `evaluateStrategy()` stays a role-shape gate. A new MUST walk over the Obligation Manifest, persistable `assessment/v1` bindings, collector-derived provenance, canonical `graph_id` fingerprinting, fail-closed projection, and kind/namespace `rejectForbidden` close the gaps. `evidence/v2` remains the physical observation; `verification/v2` remains the verdict. Roadmap status is a documentation edit only.

Resolves assumption `sdd-propose-001` via ADR-001.

## Architecture Decisions

### Decision: Additive assessment family `$id` (ADR-001)

| Option | Tradeoff | Decision |
| --- | --- | --- |
| Mutate `evidence/v2` with `role` / `obligation_id` | Collapses observation identity; forbidden by intent. | Rejected |
| Evolve `verification/v3` to embed bindings | Unique-sort of `evidence_ids` still hides roles; mutates verdict family. | Rejected |
| `ospec://schemas/kernel/assessment-binding/v1` | Explicit but breaks `{noun}/vN` `$id` pattern. | Rejected |
| `ospec://schemas/kernel/assessment/v1` | Additive, pinnable, distinct `kind`. | **Chosen** |

**Rationale**: Matches `evidence/v2` and `verification/v2`. Manifest key `assessment` (first version, like `assurance-graph`). `kind: "assessment/v1"`. Path `schemas/kernel/assessment/v1.schema.json`.

### Decision: MUST walk after strategy, assessments ≠ EvidenceId (ADR-002)

| Option | Tradeoff | Decision |
| --- | --- | --- |
| Fold obligations into `evaluateStrategy` | Mixes role policy with graph coverage; harder to reason codes. | Rejected |
| Walk MUST first | Wastes work when strategy already fails. | Rejected |
| Strategy then MUST walk; assessment id includes role+obligation | Fail-fast role check; persistable coverage. | **Chosen** |

**Rationale**: Strategy satisfied ≠ Execution Graph satisfied. `computeEvidenceId` is unchanged (no role). Assessment identity fingerprints role, obligation, node, evidence, candidate, and policy snapshot.

### Decision: Collector/transport allowlist, no PKI (ADR-003)

| Option | Tradeoff | Decision |
| --- | --- | --- |
| Trust payload `provenance` | Current defect; worker can claim `runtime-observed`. | Rejected |
| Require signatures / PKI | Out of scope. | Rejected |
| Harness-supplied collector+transport allowlist | Fail-closed; digest ≠ origin. | **Chosen** |

**Rationale**: Strong class is derived from the channel the harness invoked. Unknown or absent collector cannot produce a strong class.

### Decision: Canonical `graph_id` + facade fail-closed (ADR-004)

| Option | Tradeoff | Decision |
| --- | --- | --- |
| Keep `graph_id` = candidate+nodes+edges | Contract/policy drift is invisible. | Rejected |
| Return `ok: true` without a graph | Current facade defect. | Rejected |
| Fingerprint canonicalInputs; `ok: true` requires projection | Replayable; fail-closed. | **Chosen** |

**Rationale**: `satisfies` edges rebuild from persistable assessments, never from ephemeral `obligation_ids`.

## Data Flow

### Verification sequence (MUST walk vs strategy)

```text
Caller              verifyCandidate         strategy-policy          obligation-coverage         projector
  | verify(input)         |                       |                         |                      |
  |---------------------->| validateBindings      |                         |                      |
  |                       | selectStrategy------->|                         |                      |
  |                       | normalizeEvidence     |  collector → class      |                      |
  |                       | evaluateStrategy----->|  roles only             |                      |
  |                       |                       |  ok ≠ graph covered     |                      |
  |                       | walk MUST-------------------------------------->|                      |
  |                       |                       |  skip approved deferred |                      |
  |                       |                       |  emit assessment/v1     |                      |
  |                       | projectAssuranceGraph------------------------------------------------>|
  |                       |                       |  graph_id includes canonicalInputs            |
  |                       |                       |  satisfies ← assessments only                 |
  |                       | if !projected.ok → ok:false, no PASS, no graph                         |
  |                       | emit verification/v2 (unique-sort evidence_ids still one E)            |
  |<----------------------| evidence, assessments, verification, assurance_graph                   |
```

**Order**: bindings → strategy selection → normalize (collector class) → `evaluateStrategy` → MUST walk → project → (optional reconcile) → emit verdict. Strategy failure short-circuits; MUST walk never upgrades a failed strategy.

**Deferred**: skip a `must` item only when `deferred.reason` and `deferred.approved_by` are both non-empty (same predicate as K4a `obligation-manifest.js`). Partial deferral is not deferred. `should` / `may` are not required for PASS.

**Coverage unit**: a non-deferred MUST is satisfied when ≥1 persistable assessment binds admissible evidence to that `obligation_id` and a `node_id` ∈ `implemented_by`. Join key is `obligation_id`, not echoing K4a tokens such as `ev:test-pass` onto `evidence/v2`. Any binding whose `node_id` is outside `implemented_by` fails closed even if another binding is valid. Empty `required_evidence` on a non-deferred MUST fails closed.

| Condition | reason_code |
| --- | --- |
| Non-deferred MUST with no admissible assessment | `UNFULFILLED_MUST` (identifies `obligation_id`) |
| Binding `obligation_id` absent from manifest | `UNKNOWN_OBLIGATION_ID` |
| Binding `node_id` ∉ `implemented_by` | `WRONG_IMPLEMENTING_NODE` |
| Strong class claimed/needed without trusted collector | `UNTRUSTED_COLLECTOR` |
| Weak/model class vs runtime obligation | `INSUFFICIENT_PROVENANCE` |
| Projection cannot materialize | `GRAPH_PROJECTION_FAILED` |
| Stored graph ≠ recompute from persistable inputs | `GRAPH_DIVERGENCE` |

### Collector mapping (strong provenance)

| `collector.id` + `transport` | Derived class |
| --- | --- |
| `node-test` \| `npm-test` \| `node:test` + `tool-execution-transport` | `runtime-observed` |
| `tool-execution` + `tool-execution-transport` | `tool-produced` |
| `host-adapter` + `execution-transport` | `host-attested` |
| `worker` / `worker-transport` / absent / unknown | never strong (`model-reported` if worker; else fail for strong claims) |

Stored `evidence.provenance` is the derived class. Payload digest is content identity, not origin. Payload string `runtime-observed` without a matching allowlisted collector → `UNTRUSTED_COLLECTOR`. No PKI.

### `graph_id` preimage and replay

```text
graph_id = sha256Fingerprint("assurance-graph/v1", {
  candidate_id,
  contract_digest,
  policy_snapshot_id,
  execution_graph_digest,   // executionGraph.graph_id
  openspec_input_digest,    // fingerprint of canonical OpenSpec/Git input
  nodes, edges              // canonical sorted sets
})
```

Persist `canonical_inputs` on the projected graph (additive optional on `assurance-graph/v1`). Replay calls `projectAssuranceGraph` with stored assessments, evidence, verification, and those digests — never ephemeral projector `obligation_ids`. Changing any canonical input yields a new `graph_id`; reconcile of the old graph returns `GRAPH_DIVERGENCE`.

`rejectForbidden`: allow-list `kind`; reject forbidden `kind` / optional in-memory `namespace` (`finding`, `attestation`, `authorization`, `evaluation-attestation`). Never scan `id`. `REQ-add-authorization-header` with `kind: "requirement"` stays valid.

`verifyCandidate`: if projection fails, return `ok: false` with `GRAPH_PROJECTION_FAILED` (or `GRAPH_DIVERGENCE` on stored mismatch), omit `assurance_graph`, do not emit `PASS` / `PASS WITH WARNINGS`. Projector missing-candidate / cannot-build uses `GRAPH_PROJECTION_FAILED` (today it misuses `GRAPH_DIVERGENCE`).

## File Changes

| File | Action | Description |
| --- | --- | --- |
| `schemas/kernel/assessment/v1.schema.json` | Create | Closed `assessment/v1`; no `verdict`. |
| `schemas/kernel/assessment/fixtures/valid/v1-complete.json` | Create | Full binding fixture. |
| `schemas/kernel/assessment/fixtures/valid/v1-four-roles.json` | Create | Four payloads, one `evidence_id`, distinct roles. |
| `schemas/kernel/assessment/fixtures/invalid/v1-missing-required.json` | Create | Missing required fields. |
| `schemas/kernel/assessment/fixtures/invalid/v1-with-verdict.json` | Create | `verdict` rejected. |
| `schemas/kernel/assessment/fixtures/invalid/v1-evidence-alias.json` | Create | Assessment must not validate as `evidence/v2`. |
| `schemas/kernel/manifest.json` | Modify | Register family `assessment`. |
| `schemas/kernel/contract-claims.json` | Modify | Additive claims; do not replace v2 claims. |
| `schemas/kernel/assurance-graph/v1.schema.json` | Modify | Optional persistable `canonical_inputs`. Do **not** touch `evidence/v2`, `verification/v2`, K1 v1. |
| `scripts/lib/independent-verifier/collector-provenance.js` | Create | Allowlist mapper. |
| `scripts/lib/independent-verifier/assessment.js` | Create | `computeAssessmentId`, emit/validate. |
| `scripts/lib/independent-verifier/obligation-coverage.js` | Create | MUST walk, deferral, reason codes. |
| `scripts/lib/independent-verifier/index.js` | Modify | Order, fail-closed projection, return `assessments`. |
| `scripts/lib/independent-verifier/evidence.js` | Modify | Derive class from collector; keep `computeEvidenceId` observation-only. |
| `scripts/lib/assurance-graph/projector.js` | Modify | Canonical fingerprint; satisfies from assessments; typed `rejectForbidden`; export it. |
| `scripts/lib/assurance-graph/index.js` | Modify | Replay from persistable outputs. |
| `scripts/lib/k6b-schema-fixtures.test.js` | Modify | Assessment fixtures, pin freeze, four-role distinctness. |
| `scripts/lib/independent-verifier/index.test.js` | Modify | Adversarial MUST / collector / facade cases; add collector on existing harness evidence. |
| `scripts/lib/assurance-graph/index.test.js` | Modify | `graph_id` inputs, replay, substring-id, structured kind. |
| `scripts/k6b-verifier-assurance-graph-e2e.test.js` | Modify | Persist assessments + canonical_inputs; replay equality; contract/policy churn. |
| `docs/roadmaps/harness-evolution.md` | Modify | K6b `revise`; K6c `blocked-by-K6b-remediation` during apply. |
| `docs/architecture/harness-evolution.md` | Modify | Same status flip (no runtime module). |

Archive of this change (not apply) restores K6b `done` and K6c `next-eligible`.

## Interfaces / Contracts

```javascript
// $id: ospec://schemas/kernel/assessment/v1
{
  schema_version: 1, kind: "assessment/v1",
  assessment_id, // sha256Fingerprint("assessment/v1", { schema_version, kind, evidence_id, role,
                 //   obligation_id, node_id, candidate_id, policy_snapshot_id })
  evidence_id, role, obligation_id, node_id, candidate_id, policy_snapshot_id
} // additionalProperties: false; no verdict

verifyCandidate({ ..., rawEvidence: [{ role, bytes, origin, node_id, obligation_id,
  collector: { id, transport }, provenance /* claim only */ }] })
// -> { ok, strategy, evidence, assessments, verification, assurance_graph }
// unique-sort(verification.evidence_ids) may list one E; assessments.length may be 4

projectAssuranceGraph({ canonicalInputs, candidate, executionGraph, evidence, assessments, verification })
```

Raw `collector` is harness metadata, never copied onto `evidence/v2`.

## Requirement Allocation

| MUST scenario | Allocation |
| --- | --- |
| MUST without evidence / unknown `obligation_id` / wrong node | `obligation-coverage.js` |
| Four roles → four assessments; unique-sort still one E | `assessment.js` + `verdict.js` (unchanged unique-sort) |
| Facade fail-closed without graph | `independent-verifier/index.js` |
| Collector-derived strong class; payload-only strong fails; model-reported insufficient; stale/foreign/fabricated | `collector-provenance.js` + `evidence.js` |
| PASS requires strategy **and** MUST coverage | `index.js` after both gates |
| Evidence with `verdict` rejected | existing `evidence.js` / schema (unchanged) |
| `rejectForbidden` by kind/namespace; `REQ-add-authorization-header` valid | `projector.js` |
| Replay from persistable outputs; `satisfies` from assessments | `assurance-graph/index.js` + projector |
| Canonical inputs in `graph_id`; contract/policy change → divergence | `projector.js` `sha256Fingerprint` preimage |
| Matching inputs project; forbidden relations | existing projector + typed reject |
| Assessment fixtures, cross-family, four-role ids, frozen v2/K1 pins | `assessment/v1.schema.json` + `k6b-schema-fixtures.test.js` |
| Inventory includes assessment without mutating K6b v2 pins | `manifest.json` / `contract-claims.json` |
| Roadmap K6b revise / K6c blocked | both `harness-evolution.md` files |

## Testing Strategy

`testing.tdd_mode` stays `focused`. Each apply task is RED → GREEN → triangulate (adversarial) → REFACTOR.

| Layer | What to Test | Approach |
| --- | --- | --- |
| Unit | MUST walk, deferral, unknown id, wrong node | Graph with extra MUST and no assessment; deferred skip; alien `obligation_id`. |
| Unit | Four-role assessments | Same bytes/node/provenance, four roles → one `evidence_id`, four `assessment_id`. |
| Unit | Collector allowlist | Payload `runtime-observed` without collector fails; allowlisted `node-test` passes. |
| Unit | `rejectForbidden` | `REQ-add-authorization-header` + `kind: requirement` ok; `kind: authorization` fails. |
| Contract | `assessment/v1` | Valid complete; missing fields; `verdict`; cross-family vs evidence/verification; byte-identical `evidence/v2`, `verification/v2`, K1 pins. |
| Unit | `graph_id` preimage | Flip contract, policy, execution-graph, or OpenSpec digest → new id; order permutation unchanged. |
| Integration | Facade | Stub projector failure → `ok: false`, `GRAPH_PROJECTION_FAILED`, no PASS. |
| E2E | Replay | Persist assessments + `canonical_inputs`; replay byte-identical; C1→C2 / P1→P2 → `GRAPH_DIVERGENCE`. |

## Migration / Rollout

No data migration. Additive schema + runtime gates. Existing verifier tests must supply `collector` on raw evidence that claims a strong class. `graph_id` values change (preimage expansion); static schema fixtures stay valid (pattern-only). Rollback reverts this change as a unit; v2 and K1 pins never move.

## Open Questions

None. `sdd-propose-001` is resolved as `ospec://schemas/kernel/assessment/v1`.
