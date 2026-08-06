# ADR-002: Candidate Freeze Restricted to Workspace/Staged Projections with File Mode and Untracked Digests

- Status: proposed
- Change: k3-identities-candidate-freeze
- Date: 2026-08-07

## Context
Candidates represent uncommitted integrated work products awaiting verification or attestation. Environments can differ in file permission bits (`100644` vs `100755`), untracked file accumulation, or projection types (`commit` vs `workspace`/`staged`), which can cause non-deterministic worker behavior if not captured in the candidate identity.

## Decision
Candidate freeze strictly permits `workspace` or `staged` projections (rejecting `commit` fail-closed) and computes `changed_paths_modes_digest` and `intended_untracked_digest`. Path mode changes, symlink modifications, case sensitivity shifts, and untracked entries directly alter `CandidateId`.

## Alternatives
- Allowing `commit` as a Candidate projection: Rejected because commits are base tree snapshot origins, not uncommitted candidate freeze projections.
- Digesting file contents without permission mode bits: Rejected because changing executable flags or symlink targets alters execution outcomes without changing raw text content.

## Consequences
- Prevents environment-dependent non-determinism across OS platforms during verification.
- Rejects candidate freeze requests with unsupported projections fail-closed.
