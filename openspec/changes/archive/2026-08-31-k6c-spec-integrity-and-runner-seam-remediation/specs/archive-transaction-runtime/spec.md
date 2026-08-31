# Delta for archive-transaction-runtime

## MODIFIED Requirements

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
