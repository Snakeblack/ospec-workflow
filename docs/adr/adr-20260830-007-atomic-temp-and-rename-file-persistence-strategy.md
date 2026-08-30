# Architecture Decision Record (ADR-003)

## Context
Writing configuration files in interactive applications carries the risk of data loss or corruption if the process crashes, the disk fills up, or another process accesses the file concurrently during a partial write.

## Decision
All persistence operations in `internal/config/` MUST use atomic file writing:
1. Write the YAML payload to a temporary file (`.<filename>.tmp.<random>`) in the exact same directory (ensuring same filesystem boundary for atomic rename).
2. Sync the file descriptor to disk via `file.Sync()`.
3. Atomically replace the destination file using `os.Rename`.
4. Ensure cleanup of the temporary file via `defer` in case of failure.

## Consequences
- Guaranteed file integrity without partial writes or zero-byte truncated files.
- Original permissions are maintained.
