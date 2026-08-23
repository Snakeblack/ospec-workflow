# ADR-001: Baseline Content Storage and Authentic Standard Unified Diff Generation

- Status: proposed
- Change: k6a-runtime-boundary-closure
- Date: 2026-08-23

## Context
The execution runtime previously generated placeholder unified diffs with synthetic `-old` / `+new` hunks during WorkResult assembly. This prevented downstream tools from applying standard patches and broke cryptographic reproducibility between pre- and post-execution file states.

## Decision
Retain in-memory / registry baseline file contents during `materializeSourceSnapshot` and implement a standard unified diff algorithm in `generateUnifiedDiff`. Generate authentic context-aware hunks (`@@ -l,s +l,s @@`) comparing baseline contents against disk states, with standard headers `--- /dev/null / +++ b/{path}` for additions and `--- a/{path} / +++ /dev/null` for deletions.

## Alternatives
- *Disk-based temporary clone*: Rejected due to I/O overhead and complex cleanup semantics.
- *External git binary diffing*: Rejected because it introduces external CLI dependencies and non-deterministic environment variations.
- *Synthetic placeholder diffs*: Rejected because patches cannot be applied cleanly by downstream consumers.

## Consequences
- Authentic, standard unified diffs conform to patch specifications and can be applied cleanly.
- Preserved baseline contents increase in-memory footprint marginally per active workspace capsule.
- Easily reversible; diffing logic is self-contained in `scripts/lib/worker-executor.js`.
