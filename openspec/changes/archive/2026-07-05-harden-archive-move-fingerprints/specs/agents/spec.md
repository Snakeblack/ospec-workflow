# Delta for agents

## ADDED Requirements

### Requirement: Orchestrator-Owned Archive Move Completion {#REQ-agents-008}

After the `sdd-archive` executor returns `status: success`, the ORCHESTRATOR — never
the executor — decides, verifies, and performs completion of the archive-folder move.
Before deleting the source change directory `openspec/changes/{change-name}/`, the
orchestrator MUST recursively diff the destination folder's inventory
(`openspec/changes/archive/{YYYY-MM-DD}-{change-name}/`) against the source folder's
inventory, file-by-file (both path presence and content match, e.g. via hash or byte
comparison), using the copy-inventory list the executor reported in its return
envelope (see skills domain spec, `sdd-archive` Copy-and-Report Contract) as the
starting manifest to verify against the actual filesystem state.

Deletion of the source directory is a decision, an action, and a completion claim
reserved exclusively to the orchestrator. The `sdd-archive` executor MUST NOT decide
to delete the source, MUST NOT perform a delete, and MUST NOT self-certify that the
move is "complete" or that the source directory no longer exists — its responsibility
ends at baseline sync (Step 2), archive-report persistence (Step 3), and copying
artifacts to the destination path (Step 5, copy-only).

On a full inventory match, the orchestrator deletes the source directory — this is the
only filesystem step that makes the operation a true move. On any mismatch or copy
failure (missing destination file, content diff, partial copy), the orchestrator MUST
halt with the source directory left intact and surface the mismatch to the user; it
MUST NOT delete the source under a mismatch condition, and MUST NOT proceed to close
the archive route silently.

#### Scenario: Inventory match — orchestrator completes the move by deleting the source

- GIVEN `sdd-archive` returns `status: success` having copied all artifacts to
  `openspec/changes/archive/{YYYY-MM-DD}-{change-name}/`
- WHEN the orchestrator recursively diffs destination inventory against source
  inventory file-by-file
- AND every source file is present at the destination with matching content
- THEN the orchestrator deletes the source directory
  `openspec/changes/{change-name}/`
- AND only then does the orchestrator consider the archive route complete
- Evidence: agent-instruction prose; verified via a static contract-test anchor on the
  load-bearing "orchestrator deletes" / "verification-before-delete" strings, not a
  runtime execution trace.

#### Scenario: Inventory mismatch — halt with source intact, no deletion

- GIVEN `sdd-archive` returns `status: success` but the destination is missing one or
  more files present in the source (partial copy)
- WHEN the orchestrator performs the recursive inventory diff
- THEN it detects the mismatch and MUST NOT delete the source directory
- AND it halts and surfaces the mismatch to the user instead of closing the route
- AND the source directory remains fully intact for later recovery
- Evidence: agent-instruction prose; verified via a static contract-test anchor on the
  load-bearing "halt with source intact" / "mismatch or copy failure" strings, not a
  runtime execution trace.

#### Scenario: Executor never deletes or self-certifies completion

- GIVEN the `sdd-archive` skill instructions are inspected
- WHEN the Step 5 contract is read
- THEN it MUST state that the executor's responsibility ends at baseline sync,
  archive-report persistence, and copying artifacts
- AND it MUST NOT instruct the executor to delete the source directory or to declare
  the move "complete" while the source still exists
- Evidence: static contract-test anchor on the `sdd-archive` SKILL.md source text
  (agent-instruction prose; this scenario is about the instructions themselves, not a
  runtime trace of executor behavior).

---

### Requirement: Orchestrator-Computed Baseline Fingerprints {#REQ-agents-009}

Immediately after `sdd-spec` returns `status: success`, the orchestrator — never
`sdd-spec` itself — MUST compute and write `baseline_fingerprints` (the SHA-256 of each
touched baseline domain's current `openspec/specs/{domain}/spec.md`, or `null` when no
baseline exists yet) into `state.yaml`. The orchestrator sources the list of domains to
fingerprint from the `touched_baseline_domains` list `sdd-spec` declares in its return
envelope (see skills domain spec, Baseline Fingerprint Recording and Verification);
`sdd-spec` itself MUST NOT compute or write these hashes, since it has no execute tool
capable of hashing files.

This computation step is a standing orchestrator responsibility that MUST run for
every change touching at least one baseline domain — it is no longer a per-change gap
requiring a manual `assumptions:` ledger entry. No `assumptions:` entry documenting a
"fingerprint not yet recorded" gap is needed or permitted going forward; the
orchestrator's post-`sdd-spec` computation step closes that gap structurally for every
change.

#### Scenario: sdd-spec declares touched domains — orchestrator computes fingerprints

- GIVEN `sdd-spec` writes a delta spec for domain `auth` and returns `status: success`
  with `touched_baseline_domains: [auth]` in its envelope
- WHEN the orchestrator processes the `sdd-spec` return
- THEN it computes the SHA-256 of the current `openspec/specs/auth/spec.md` and writes
  it to `state.yaml.baseline_fingerprints.auth`
- AND `sdd-spec` itself never touches `baseline_fingerprints` in `state.yaml`
- Evidence: agent-instruction prose; verified via a static contract-test anchor on the
  "orchestrator computes" / "sdd-spec declares, never computes" strings, not a runtime
  execution trace.

#### Scenario: New domain with no existing baseline — orchestrator writes null

- GIVEN `sdd-spec` declares a touched domain that has no existing
  `openspec/specs/{domain}/spec.md` file yet
- WHEN the orchestrator runs the post-`sdd-spec` fingerprint step
- THEN it writes `null` for that domain under `state.yaml.baseline_fingerprints`
  instead of attempting to hash a non-existent file
- Evidence: agent-instruction prose; verified via a static contract-test anchor, not a
  runtime execution trace.

#### Scenario: No per-change fingerprint assumption entry needed

- GIVEN a change touches one or more baseline domains during `sdd-spec`
- WHEN the orchestrator's standing post-`sdd-spec` fingerprint step runs
- THEN no entry is written to `state.yaml`'s `assumptions:` ledger describing a
  "fingerprint not recorded" gap for this change
- Evidence: static contract-test anchor on the orchestrator instruction text (asserts
  the per-change-assumption pattern text has been removed); agent-instruction prose,
  not a runtime execution trace.
