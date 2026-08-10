# ADR-003: Publish each generated destination transactionally

- Status: proposed
- Change: k3-readiness-remediation
- Date: 2026-08-09

## Context

The synchronous generator currently prunes and writes directly into each live destination, so a filesystem or validation failure can leave one of six managed targets partial. Directory replacement behavior also differs across Windows and POSIX.

## Decision

For each target independently, clone the prior complete destination into a process-owned sibling stage, mutate and validate the stage, then commit with `destination -> backup` and `stage -> destination` renames. Restore the backup synchronously if commit fails. Use same-parent temporary paths, an exclusive per-destination lock, exact-path cleanup, and deterministic internal fault seams.

## Alternatives

- In-place write plus file snapshots: duplicates managed-inventory logic and exposes partial state.
- Rename over the existing directory: not portable for non-empty directories.
- One transaction across all six targets: adds global coupling beyond the requirement.

## Consequences

Every visible target is old-complete, new-complete, or briefly absent, never partial; existing unmanaged files remain preserved through cloning. Publication uses more temporary disk and cannot promise crash-atomicity across the two renames, but failed synchronous operations restore the prior tree and retain an unrestored backup for manual recovery.
