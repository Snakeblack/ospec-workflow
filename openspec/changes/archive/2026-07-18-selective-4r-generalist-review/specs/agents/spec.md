# Delta for Agents

## ADDED Requirements

### Requirement: Generalist-First Read-Only Review {#REQ-agents-012}

When `4r-review-gate` fires, the orchestrator MUST launch `review-change` before any specialist. The generalist MUST receive the verified change artifacts and real diff as read-only context, and the orchestrator MUST validate its structured decision before merging it with classifier output. The generalist MUST NOT write files, remediate code, or replace a specialist review.

#### Scenario: Generalist clears a basic change

- GIVEN the verified normal change has no specialist signal
- WHEN `review-change` returns `status: "clear"`, an empty specialist list, and a reason
- THEN the orchestrator MAY dispatch zero specialists
- AND it MUST persist the generalist decision and four dimension reasons

#### Scenario: Generalist requests specialists

- GIVEN the generalist detects evidence requiring risk and reliability expertise
- WHEN it returns a valid `needs-specialist` decision
- THEN the orchestrator MUST merge those candidates with classifier candidates
- AND MUST apply the normal cap or high-risk override before dispatch

### Requirement: Selective Specialist Dispatch with Existing Remediation {#REQ-agents-013}

The orchestrator MUST dispatch only dimensions selected by the validated review decision: zero to two for normal changes and all four for high-risk changes. Multiple selected specialists MUST retain the target's existing parallel-preferred, serial-fallback behavior; this change MUST NOT introduce a new concurrency policy. Existing specialist prompts, finding envelopes, severity taxonomy, user escalation, and remediation ownership MUST remain unchanged.

Each selected specialist MUST execute exactly once in a review lineage. After findings are frozen, the orchestrator MUST NOT relaunch the generalist or any specialist; correction checks MUST use targeted validation limited to the frozen finding IDs and regressions caused by the correction. A skipped reviewer MUST NOT be fabricated as having returned no findings.

#### Scenario: Normal change dispatches two selected specialists

- GIVEN the final normal decision selects `risk` and `reliability` and skips the other dimensions
- WHEN the orchestrator dispatches specialists
- THEN it MUST launch only `review-risk` and `review-reliability`
- AND skipped dimensions MUST remain audit decisions, not synthetic reviewer envelopes

#### Scenario: Specialist remediation does not reopen discovery

- GIVEN `review-reliability` reports a critical finding and the user approves remediation
- WHEN the correction is ready for validation
- THEN the orchestrator MUST validate the frozen finding ID without rerunning `review-reliability`
- AND any unrelated late observation MUST become a non-blocking follow-up

### Requirement: Bounded Review Lineage {#REQ-agents-015}

Before the first specialist dispatch, the orchestrator MUST freeze one auditable lineage containing a deterministic candidate identity, genesis paths, classification, selected dimensions, correction budget, and initial evidence. Each selected dimension MUST run exactly once in that lineage, and its initial findings MUST receive stable IDs that cannot be deleted, renumbered, or expanded by correction validation.

Corrections MUST reference only frozen finding IDs and MUST NOT expand the genesis paths. A lineage MUST allow at most three failed correction attempts; exhaustion MUST terminate or explicitly escalate that lineage without resetting its budget or reviewers. Making a late observation blocking MUST require an explicit successor lineage or successor change.

#### Scenario: Correction attempts are exhausted

- GIVEN a lineage has recorded three failed targeted correction attempts
- WHEN another correction is requested
- THEN the orchestrator MUST terminate or escalate the lineage
- AND MUST NOT reset its attempts, budget, candidate, or reviewer executions

#### Scenario: Successor authority is explicit

- GIVEN targeted validation observes a concern unrelated to every frozen finding ID
- WHEN that concern requires blocking authority
- THEN the current lineage MUST record it only as a non-blocking follow-up
- AND a distinct successor lineage or change MUST be created before specialist discovery resumes

### Requirement: Review Agent Target Parity {#REQ-agents-014}

The source generalist agent, its allowlist/model registration, selective dispatch instructions, validation contract, and audit semantics MUST be generated equivalently for every supported target, including claude, vscode, github-copilot, opencode, and codex. Target-native syntax MAY differ, but identical evidence MUST yield the same selected dimensions, reasons, cap, failure behavior, and severity/remediation outcome.

#### Scenario: Generated targets select identically

- GIVEN identical normal-change evidence and a valid generalist escalation in every supported target
- WHEN each target executes the gate
- THEN every target MUST select the same zero-to-two dimensions with equivalent reasons
- AND contract/parity validation MUST detect a missing generalist or dispatch contract

## MODIFIED Requirements

### Requirement: 4R Review Gate Dispatch

Given an active route reaches the post-verify `4r-review-gate`, the orchestrator MUST run one validated read-only generalist, derive the final four dimension decisions, and dispatch only the selected specialist reviewers. It MUST collect every dispatched envelope before evaluating findings. It MUST surface `BLOCKER` and `CRITICAL` findings through the existing target-specific user question mechanism without automatic halt; `WARNING` and `SUGGESTION` MUST be recorded without interruption. Gate hook points remain after successful verify for `bugfix`, `refactor`, and `standard` when the route lists the gate.

(Previously: the orchestrator launched and collected all four specialist reviewers unconditionally, preferring parallel dispatch, before applying the same severity policy.)

#### Scenario: High-risk preserves full specialist coverage

- GIVEN the active change is high-risk and verify succeeds
- WHEN the gate runs
- THEN the generalist MUST run first and all four specialists MUST subsequently be dispatched
- AND the existing severity escalation policy MUST remain unchanged

#### Scenario: Malformed decision prevents unsafe dispatch

- GIVEN review decision validation fails
- WHEN the orchestrator reaches specialist dispatch
- THEN it MUST block for contract remediation
- AND it MUST dispatch neither a partial arbitrary subset nor unconditional fallback reviewers
