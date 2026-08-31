# archive-transaction-runtime Specification

## Purpose

Deterministic filesystem transaction that applies a validated `archive-plan.json`: preflight → staging → inventory copy → origin↔staging↔destination byte/hash compare → atomic commit → delete origin only after full match. Owns journal, rollback, interrupted recovery, and receipt. JS/Go parity is N/A (`cmd/ospec-hooks` has no archive responsibility; no Go runtime is required).

## Requirements

### Requirement: Transaction Lifecycle and Delete-After-Full-Match {#REQ-archive-transaction-runtime-001}

The runtime MUST execute archive closure in order: (1) preflight — verify verify-verdict, quality gates, approvals, `baseline_fingerprints`, plan validation (including input hashes), AND spec content integrity (verifying no prepared spec writes contain `undefined` tokens or undeclared dropped requirement IDs from `target_before`); (2) write staging; (3) copy the full `archive_inventory` into staging/destination staging area; (4) byte/hash-compare origin ↔ staging ↔ destination; (5) atomic commit/rename of staged results into live paths when comparison succeeds; (6) delete the origin change folder **only** after a full three-way match. The runtime MUST NOT delete origin on any preflight, spec integrity, hash, inventory, or compare failure. Spec/ADR live writes MUST occur only via this commit path, never by the archive agent.

(Previously: preflight checked gates and hashes without verifying spec content integrity and requirement retention.)

#### Scenario: Failure before commit leaves origin intact

- GIVEN preflight or staging fails (invalid plan, gate failure, spec integrity failure, or I/O error before commit)
- WHEN the runtime returns failure
- THEN `openspec/changes/{change-name}/` remains fully intact
- AND no live `openspec/specs/**` or `docs/adr/**` target is partially committed

#### Scenario: No delete before full match

- GIVEN staging completed but origin↔staging↔destination comparison reports any mismatch
- WHEN the runtime evaluates deletion
- THEN it MUST NOT delete the origin change folder
- AND it MUST fail closed with a mismatch outcome

#### Scenario: Full match commits then deletes origin

- GIVEN preflight passed and origin↔staging↔destination fully match
- WHEN the runtime completes commit
- THEN live targets reflect staged bytes
- AND only then is the origin change folder deleted
- AND a success receipt is emitted

#### Scenario: Preflight halts on spec content integrity failure

- GIVEN an archive plan whose prepared spec content contains `undefined` or undeclared dropped requirement IDs
- WHEN the transaction runtime executes preflight
- THEN preflight MUST reject the plan fail-closed
- AND no staging files, live spec commits, or origin deletions MUST take place

### Requirement: Journal, Resume, and Rollback {#REQ-archive-transaction-runtime-002}

The runtime MUST persist a transaction journal that records enough state to resume after interruption past staging. Re-invoking the runtime for the same change MUST either resume from the journal, complete as a no-op if already committed, or roll back to the pre-transaction state when rollback is required. Rollback strategy for schema v1 MUST be `staging-rename`: discard/replace via staging without rewriting archived audit history. Rollback behavior MUST be demonstrable with filesystem fixtures.

#### Scenario: Failure after staging is resumable

- GIVEN a journal shows staging completed and commit not yet acknowledged
- WHEN the runtime is re-invoked for the same change
- THEN it resumes from the journal without requiring the agent to re-emit a new plan identity
- AND it does not corrupt an already-valid staging tree

#### Scenario: Rollback restores pre-transaction safety

- GIVEN a fixture transaction that fails after staging and requests rollback
- WHEN rollback completes
- THEN origin remains intact (or is restored to pre-transaction content)
- AND staging artifacts do not leave live targets half-applied
- AND the archived audit trail under `openspec/changes/archive/` is never rewritten

#### Scenario: Idempotent re-run after successful commit

- GIVEN a journal/receipt already records a successful commit for the change
- WHEN the runtime is invoked again with the same plan identity
- THEN the operation is a no-op success (or explicit already-complete)
- AND origin is not re-deleted from a missing path in a destructive loop

### Requirement: Atomic Commit Across Windows and Linux {#REQ-archive-transaction-runtime-003}

Directory/file commit MUST use atomic rename semantics where the filesystem provides them. On Windows, when rename fails with `EPERM` or `EEXIST`, the runtime MUST apply the same class of fallback used by the repository's atomic-write helper (replace-via-backup/retry) rather than leaving dual live trees. Fixtures MUST cover both Windows and Linux expectations for commit and rollback.

#### Scenario: Windows rename fallback keeps single live target

- GIVEN a commit rename raises `EPERM` or `EEXIST` on Windows
- WHEN the runtime applies its fallback
- THEN exactly one live target remains with the committed bytes
- AND origin is still not deleted until full match is reconfirmed

#### Scenario: Linux atomic rename commits cleanly

- GIVEN a POSIX filesystem where rename replaces atomically
- WHEN commit runs after a full match
- THEN the live target switches to staged content without a readable partial mix of old and new bytes

### Requirement: Receipt Emission {#REQ-archive-transaction-runtime-004}

On terminal success or fail-closed abort after preflight acceptance, the runtime MUST emit a receipt containing at least: inventory actually committed (or empty on abort), cost aggregation for the change (from session cost telemetry when present, else an explicit empty/fallback marker), and outcome (`success` | `failed` | `rolled-back` | `resumed-success`). The orchestrator MUST treat a success receipt — not agent prose — as the authority that the archive move completed. JS/Go parity for receipt modules is N/A for this change.

#### Scenario: Success receipt closes the route

- GIVEN the runtime finished delete-after-full-match
- WHEN it emits the receipt
- THEN `outcome` is `success`
- AND inventory lists committed archive paths
- AND cost is present or explicitly marked unavailable

#### Scenario: Hash mismatch receipt does not authorize delete

- GIVEN compare fails on hash mismatch
- WHEN the runtime emits the receipt
- THEN `outcome` is `failed`
- AND the receipt MUST NOT claim origin deletion
