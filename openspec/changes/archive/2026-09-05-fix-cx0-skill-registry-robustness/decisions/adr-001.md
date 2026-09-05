# ADR-001: Single-Snapshot Read Pipeline and Empty-Content Hashing Degradation

- Status: proposed
- Change: fix-cx0-skill-registry-robustness
- Date: 2026-09-05

## Context
During session start, `discoverSkills` previously read skill files to extract metadata, discarding their contents, while `calculateFingerprint` performed a second filesystem read that threw on `EACCES` permission errors. This caused redundant I/O, potential TOCTOU inconsistencies if files changed during startup, and crashes when non-critical files were unreadable.

## Decision
Buffer all candidate skill and rule files in memory during discovery and pass their byte content in `fingerprintPaths` to `calculateFingerprint`. If any file cannot be read, log a warning to stderr, omit it from parsed skills, and hash it as empty bytes (`0` bytes) without throwing in either discovery or fingerprinting.

## Alternatives
- Re-read files during fingerprinting with broader try/catch: rejected because it retains redundant disk I/O and TOCTOU inconsistency.
- Throw fatal error on unreadable files: rejected because non-critical skill read failures should not crash session initialization.

## Consequences
Eliminates redundant disk reads during startup and guarantees deterministic cross-runtime SHA-256 fingerprinting that never crashes on unreadable files. Requires buffering small text files in memory (<100 KB total).
