# Proposal: K3 — Execution Identities, Candidate Freeze, and Initial Candidate Relations

## Intent

Implement K3 of the harness evolution roadmap (`docs/roadmaps/harness-evolution.md`). K3 absorbs and supersedes P9, existing O4/O5 identity specs, and O6A fingerprints, establishing an explicit separation invariant across four execution identities: `SourceSnapshotId`, `WorkOrderId`, `WorkResultId`, and `CandidateId`. It introduces Candidate freeze (`workspace` | `staged`) before verification, enforces determinism and fail-closed candidate relation semantics (`exact`, `changed`, `ambiguous`, `unknown`), and rejects fail-closed any attempt to confuse work results or mutable working trees with frozen candidates or attestations/authorizations.

## Scope

### In Scope
- Stable schemas and digests for the four distinct execution identities (`SourceSnapshotId`, `WorkOrderId`, `WorkResultId`, `CandidateId`) preventing alias/collision treatment.
- `SourceSnapshot` specification: `repositoryId`, `baseTreeDigest`, `projection` (`workspace` | `staged` | `commit`), and `dependencyDigests`.
- `WorkOrder` specification: execution contract bound to `SourceSnapshotId`.
- `WorkResult` specification: raw unapproved worker outcome bound to `WorkOrderId` + `SourceSnapshotId`.
- Candidate Freeze specification: integrated patch over authorized base, restricted strictly to `workspace` | `staged` projections, canonicalized paths, `repository_id`, diff hash, `changed_paths_modes_digest`, `intended_untracked_digest`, symlinks, case-sensitivity, and selector handling.
- Deterministic fail-closed candidate initial relations: `exact` (validate), `changed` (re-evaluate), `ambiguous` (`decide`/`stop`), `unknown` (`stop`).
- Strict separation invariants and fail-closed negative fixtures demonstrating `WorkResult ≠ Candidate`, `Candidate ≠ EvaluationAttestation`, and `EvaluationAttestation ≠ DeliveryAuthorization`.
- Prohibition of attestations or delivery authorizations pointing to mutable branches or working trees.

### Out of Scope
- Evaluation Attestation execution logic (deferred to K8).
- Delivery Authorization enforcement gates (deferred to K10-delivery).
- Advanced/experimental relations (`compatible-base-advance` experimental until K9; `provable-contraction` deferred to later phases).
- O6A `ArchiveTransactionReceipt` or legacy `receipt/v1` changes (K3 does not block these).

## Capabilities

### New Capabilities
- `execution-identities`: Canonical contract and freeze pipeline for the four distinct execution identities (`SourceSnapshotId`, `WorkOrderId`, `WorkResultId`, `CandidateId`), candidate freeze semantics (`workspace` | `staged`), modes digest, selector ambiguity resolution, and initial fail-closed candidate relation evaluation (`exact`, `changed`, `ambiguous`, `unknown`).

### Modified Capabilities
- `kernel-contract-schemas`: Add versioned JSON Schemas and valid/invalid fixtures for `SourceSnapshot`, `WorkOrder`, `WorkResult`, and `Candidate` families, guaranteeing `$id` stability and identity separation.

## Approach

Define formal schema definitions and digest algorithms in `scripts/lib/` and schema registries. Implement candidate integration and freeze functions enforcing path canonicalization, file mode tracking (`changed_paths_modes_digest`), untracked file tracking (`intended_untracked_digest`), and projection enforcement (`workspace` | `staged` only). Create initial relation evaluator for candidate comparisons (`exact`, `changed`, `ambiguous`, `unknown`) with fail-closed semantics. Add negative fixture test suites to verify that `WorkResult` is never accepted as `Candidate`, and `Candidate` is never accepted as `EvaluationAttestation` or `DeliveryAuthorization`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/` | New/Modified | Execution identity digest computation, candidate freeze, and candidate relation logic |
| `openspec/specs/kernel-contract-schemas/` | Modified | Delta spec for new identity schemas and fixtures |
| `openspec/specs/execution-identities/` | New | New spec for identity invariants, candidate freeze, and fail-closed relation rules |
| `scripts/**/*.test.js` | New/Modified | Negative confusion tests, digest stability tests, edge cases (symlink, mode, case, untracked) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Workspace vs staged projection confusion in dirty repos | Med | Enforce strict projection separation in digest computation and add explicit edge-case fixtures |
| Case-sensitivity or symlink inconsistencies across OS platforms | Med | Normalize path canonicalization and record OS-neutral mode/symlink digests in freeze pipeline |
| False positive candidate matches when base tree advances | Low | Restrict initial relation set to fail-closed `exact`/`changed`/`ambiguous`/`unknown` (`compatible-base-advance` stays experimental) |

## Rollback Plan

Revert the commit/PR introducing K3 identity schemas and freeze modules. Since K3 introduces new identity data structures without mutating existing persistent workspace state or legacy receipt structures, reverting returns the system cleanly to pre-K3 behavior without data corruption.

## Dependencies

- Prerequisites: K2a (completed).

## Success Criteria

- [ ] Schemas and digest algorithms defined and validated for all 4 execution identities with negative confusion fixtures.
- [ ] Changing 1 byte in source snapshot, candidate content, or file modes produces a distinct digest ID.
- [ ] Candidate freeze restricts projections to `workspace | staged` and handles symlinks, file modes, case sensitivity, and untracked digests correctly.
- [ ] Initial candidate relation evaluator cleanly classifies `exact`, `changed`, `ambiguous`, and `unknown` with fail-closed behavior on ambiguity.
- [ ] Test suite confirms `WorkResult ≠ Candidate`, `Candidate ≠ EvaluationAttestation`, and `EvaluationAttestation ≠ DeliveryAuthorization`.
