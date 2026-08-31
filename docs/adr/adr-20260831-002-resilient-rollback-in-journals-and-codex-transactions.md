# ADR-002: Resilient Rollback in Journals and Codex Transactions

- Status: proposed
- Change: harden-installer-fs-recovery
- Date: 2026-08-31

## Context
When an installation aborts, recovery steps may encounter transient locks on restored or deleted files. Unretried rollback mutations fail immediately, leaving destinations in inconsistent states.

## Decision
Execute all individual rollback actions (`mkdir`, `write`, `chmod`, `rmSync`, `rmdirSync`, `symlink`) through `mutateFs` with retry options in both `createRollbackJournal` and Codex's `createFilesystemTransaction.rollback()` / `restorePath`. Surface unrestored paths on persistent exhaustion.

## Alternatives
- Ignore errors during rollback: Rejected because partial rollbacks leave corrupt files silently.
- Full staging and swap of destination directories: Rejected due to cross-device rename limitations across home directory mounts.

## Consequences
Ensures reliable recovery from aborted installations even under concurrent process locks, and provides exact diagnostic paths if rollback retries exhaust.
