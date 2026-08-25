# ADR-001: Immutable Captured Sandbox Policy

- Status: proposed
- Change: k6a-isolation-frontier-hardening
- Date: 2026-08-25

## Context
After preload load, `confineChildEnv` copies `OSPEC_SANDBOX_*` from live `process.env`. A worker can mutate those variables and then `spawn` / `execFile` / `fork`, expanding child `allowed_paths`. `enforced` is a software boundary, not an OS jail.

## Decision
Capture `{workspaceRoot, allowedPaths}` once in the preload closure. `confineChildEnv` reconstructs child `OSPEC_SANDBOX_*` and `NODE_OPTIONS` from that snapshot and the preload path. It MUST NOT read live `process.env` for those keys. Host-side `executeSandboxedCommand` passes its own argument snapshot for the first spawn.

## Alternatives
- *Re-read live `process.env` at each spawn*: Loses P0-1; policy follows attacker-controlled env.
- *Re-parse env on every wrapper call*: Same mutability; extra work, no freeze.
- *OS/container jail as `enforced`*: Rejected by architecture-001.

## Consequences
Nested children stay on original `allowed_paths` after env mutation. Callers of `confineChildEnv` must pass a snapshot object, not a parent env bag. Reversible by restoring the old signature; confinement tests must move with it.
