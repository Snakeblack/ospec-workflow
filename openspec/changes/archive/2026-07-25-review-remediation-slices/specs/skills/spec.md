# Delta for skills

## MODIFIED Requirements

### Requirement: One-Shot Review and Slice-Targeted Validation Boundary {#REQ-skills-007}

The review lifecycle MUST distinguish the initial read-only discovery sweep from correction validation. The generalist and each selected specialist MUST execute at most once per lineage. A targeted validator MUST receive only the active slice's frozen finding IDs, correction delta, permitted genesis paths, immutable candidate/lineage state, and prior slice state needed to decide `resolved` or `unresolved` and identify correction-caused regressions. It MUST NOT run a new general review, emit unrelated blocking findings, expand paths, or consume another slice's budget.

A validator MUST preserve resolved findings and passed slices monotonically. It MAY invalidate a passed slice only for a genuine regression explicitly evidenced against that slice's frozen findings or permitted paths; unrelated late observations MUST remain non-blocking follow-ups. It MUST not request or imply ordinary successor creation for a failed or exhausted slice; successor discovery remains reserved for explicitly approved new authority, scope, or candidate lineage.

The same one-shot and slice-targeted validation boundary MUST be present in every supported target without changing specialist finding or severity contracts.

(Previously: the validator received frozen finding IDs and lineage state without an active-slice isolation and monotonic-resolution contract.)

#### Scenario: Validator encounters an unrelated concern

- GIVEN targeted validation of an active slice observes an unrelated concern
- WHEN it returns the correction outcome
- THEN it MUST keep that concern outside the frozen blocking finding set
- AND MUST record it as a non-blocking follow-up for an explicit successor

#### Scenario: Passed slice remains resolved

- GIVEN a prior slice is passed and a different active slice fails validation
- WHEN the validator returns the failed result
- THEN it MUST preserve the prior slice and its findings as resolved
- AND it MUST report only an explicitly evidenced regression as a basis to invalidate that prior slice

#### Scenario: Reviewer relaunch is rejected

- GIVEN a selected dimension is already recorded as executed in the lineage
- WHEN orchestration requests the same reviewer again after correction
- THEN the lifecycle contract MUST reject the relaunch
- AND MUST preserve the original reviewer result and every slice budget
