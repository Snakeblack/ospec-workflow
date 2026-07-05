# Delta for skills

## MODIFIED Requirements

### Requirement: Baseline Fingerprint Recording and Verification

`sdd-spec` MUST declare, for each delta domain it writes (Step 5b), the domain name
under a `touched_baseline_domains:` list in its return envelope — it MUST NOT compute
or write the SHA-256 fingerprint itself, since it has no execute tool capable of
hashing files. Immediately after `sdd-spec` returns `status: success`, the
ORCHESTRATOR MUST compute the SHA-256 fingerprint of each declared domain's current
baseline `openspec/specs/{domain}/spec.md` (or `null` if no baseline exists yet) and
write it into `state.yaml`'s `baseline_fingerprints:` block (see agents domain spec,
Orchestrator-Computed Baseline Fingerprints). `sdd-archive` MUST, before merging each
delta (Step 2), re-hash the current baseline and compare it against the recorded
fingerprint; a mismatch means another change moved the baseline first, and
`sdd-archive` MUST NOT blind-merge — it returns `status: blocked` with
`blocker_type: stale-baseline` naming the domain instead. A missing
`baseline_fingerprints` block (pre-feature changes) skips the check silently.

#### Scenario: sdd-spec declares a touched domain without computing a hash

- GIVEN `sdd-spec` writes a delta for domain `auth`
- WHEN Step 5b runs
- THEN `sdd-spec` adds `auth` to `touched_baseline_domains` in its return envelope
- AND `sdd-spec` does NOT compute or write any SHA-256 value itself
- AND `state.yaml.baseline_fingerprints` is left untouched by `sdd-spec`

#### Scenario: Fingerprint computed by the orchestrator after spec returns

- GIVEN `sdd-spec` returned `status: success` with `touched_baseline_domains: [auth]`
- WHEN the orchestrator processes the return
- THEN `state.yaml.baseline_fingerprints.auth` holds the SHA-256 of the current
  baseline spec (or `null` if no baseline exists yet), written by the orchestrator

#### Scenario: Stale baseline detected at archive

- GIVEN another change already merged into `openspec/specs/auth/spec.md` after this
  change's fingerprint was recorded
- WHEN `sdd-archive` re-hashes the baseline before merging
- THEN the hashes mismatch
- AND `sdd-archive` returns `status: blocked` with `blocker_type: stale-baseline`
  naming the domain, without merging

## ADDED Requirements

### Requirement: sdd-archive Copy-and-Report Contract

`sdd-archive`'s Step 5 (archive-folder relocation) MUST be scoped to what the executor
can actually perform: syncing delta specs into main specs (Step 2), persisting the
archive report (Step 3), and copying every artifact from the active change folder to
the destination archive path
(`openspec/changes/archive/{YYYY-MM-DD}-{change-name}/`). The executor MUST NOT delete
the source directory `openspec/changes/{change-name}/`, and MUST NOT claim in its
return envelope or report that the move is "complete" or that the source no longer
exists while the source directory still exists on disk — completion of the move
(inventory verification and source deletion) is the orchestrator's responsibility (see
agents domain spec, Orchestrator-Owned Archive Move Completion), not the executor's.

To make orchestrator-side verification possible, `sdd-archive` MUST report a copy
inventory — the list of files it copied to the destination path — in its return
envelope, so the orchestrator can diff that manifest against the actual destination
and source filesystem state before deciding whether to delete the source.

#### Scenario: Executor reports copy inventory instead of claiming completion

- GIVEN `sdd-archive` finishes copying artifacts to the destination archive path
- WHEN it composes its return envelope
- THEN the envelope includes a copy-inventory list of the files copied
- AND the envelope does NOT assert that the source directory has been deleted or that
  the "move is complete"

#### Scenario: Partial copy is reported, not concealed

- GIVEN `sdd-archive`'s file tools can only copy (no delete capability) and it copies
  fewer files than exist in the source (e.g. 2 of 12)
- WHEN it returns to the orchestrator
- THEN the copy-inventory list in the return envelope reflects only the files actually
  copied
- AND the executor does not report or imply that the archive operation is finished
- Evidence: agent-instruction prose; verified via a static contract-test anchor on the
  Step 5 "copy inventory" / "MUST NOT claim moved" strings, not a runtime execution
  trace of a real partial-copy scenario.

#### Scenario: Source directory left intact by the executor in all cases

- GIVEN `sdd-archive` completes Steps 2–5 (sync, report, copy)
- WHEN the executor's run ends
- THEN the source directory `openspec/changes/{change-name}/` still exists on disk
- AND no instruction in the `sdd-archive` skill directs the executor to delete it
- Evidence: static contract-test anchor on the `sdd-archive` SKILL.md source text
  (agent-instruction prose, not a runtime execution trace).
