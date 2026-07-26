# Delta for agents

## MODIFIED Requirements

### Requirement: Orchestrator-Owned Archive Move Completion {#REQ-agents-008}

After the `sdd-archive` executor returns `status: success`, the ORCHESTRATOR — never
the executor — decides and completes archive-folder closure by invoking the
deterministic archive transaction runtime with the executor-emitted
`archive-plan.json` (see `archive-plan-contract` and `archive-transaction-runtime`).
The orchestrator MUST NOT perform an ad-hoc recursive diff-and-delete of the source
change directory as the completion mechanism.

The runtime owns staging, inventory copy, origin↔staging↔destination comparison,
atomic commit, journal/resume/rollback, and delete-after-full-match. The orchestrator
MUST treat a runtime success receipt as the sole authority that the archive move
completed. On any runtime failure, mismatch, or absent/unsuccessful receipt, the
orchestrator MUST halt with the source directory left intact (or restored per
runtime rollback) and MUST surface the failure to the user; it MUST NOT delete the
source itself outside the runtime, and MUST NOT close the archive route silently.

Deletion of the source directory remains a completion claim the executor MUST NOT
make. The `sdd-archive` executor MUST NOT decide to delete the source, MUST NOT
perform a delete, and MUST NOT self-certify that the move is "complete" or that the
source directory no longer exists — its responsibility ends at semantic preparation
(delta interpretation, prepared spec content, ADR promotion proposals, accepted
warnings, archive report) and emission of a validated-shape `archive-plan.json`
(see skills domain, `sdd-archive` Plan-and-Report Contract). The executor MUST NOT
write live `openspec/specs/**` or `docs/adr/**` targets as the closure write path;
those commits belong to the runtime transaction.

(Previously: orchestrator completed the move via ad-hoc recursive inventory diff
against a copy-inventory list, then deleted the source; executor copied artifacts
to the archive destination path.)

#### Scenario: Runtime success receipt — orchestrator closes the archive route

- GIVEN `sdd-archive` returns `status: success` with an `archive-plan.json` artifact
- WHEN the orchestrator invokes the archive transaction runtime
- AND the runtime returns a success receipt after full match and origin delete
- THEN the orchestrator considers the archive route complete
- AND it MUST NOT require a separate ad-hoc recursive diff before closing

#### Scenario: Runtime failure — halt with source intact, no orchestrator delete

- GIVEN `sdd-archive` returns `status: success` but the runtime fails preflight,
  compare, or commit (hash mismatch, missing reference, or I/O error)
- WHEN the orchestrator observes a non-success receipt or runtime error
- THEN it MUST NOT delete the source directory itself
- AND it halts and surfaces the failure to the user instead of closing the route
- AND the source directory remains intact or is restored per runtime rollback

#### Scenario: Executor never deletes or self-certifies completion

- GIVEN the `sdd-archive` skill instructions are inspected
- WHEN the Plan-and-Report contract is read
- THEN it MUST state that the executor emits a plan and MUST NOT delete the source
- AND it MUST NOT instruct the executor to declare the move "complete" while the
  source still exists or without a runtime success receipt
- Evidence: static contract-test anchor on the `sdd-archive` SKILL.md source text
  (agent-instruction prose; this scenario is about the instructions themselves, not a
  runtime trace of executor behavior).
