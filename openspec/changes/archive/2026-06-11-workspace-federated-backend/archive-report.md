# Archive Report: Workspace-Federated Artifact Backend

Archived: 2026-06-11 · Verdict carried from verify: **PASS WITH WARNINGS** (`verified`).

## Outcome

Implemented the `workspace-federated` harness backend as an overlay over the single-repo
machinery, in three chained units — all applied, runtime suite **80/80 green**.

| Unit | Delivered |
|---|---|
| A — runtime core | `scripts/lib/workspace-atlas.js`, `artifact-store-modes.js`, `readBackendMode` in `ospec-state.js`, federated ops in `artifact-store.js` |
| B — harness wiring | `createArtifactStoreFromConfig`; four stateful hooks select the backend from config |
| C — prompt surfaces | `sdd-workspace` trio; orchestrator Workspace Federation section; persistence-contract, harness-runtime, README |

## Spec promotion

| Domain | Action | Main spec |
|---|---|---|
| `artifact-store-federated` | New | `openspec/specs/artifact-store-federated/spec.md` |
| `sdd-workspace` | New | `openspec/specs/sdd-workspace/spec.md` |
| `sdd-session-hooks` | Merged delta | Backend Selection Requirements appended to `openspec/specs/sdd-session-hooks/spec.md` |

## Verify findings carried forward

- **CRITICAL-1** (recency ordering of aggregated changes): RESOLVED during verify with a
  global `modifiedAt` sort and a regression test.
- **WARNING-1** (unknown backend does not record a warning): OPEN, non-blocking. Safe
  fallback to openspec is in place; only the observability sub-clause is deferred.
- **SUGGESTION-1** (federation.yaml reconciliation is prompt-only): accepted for v1.

## Follow-ups (next change)

1. Surface a `runtime_observability` warning when `artifact_store.backend` is unrecognized
   (`readBackendSelection → { mode, recognized }`).
2. Coordinated multi-repo **writes** (apply slices into member repos) — the deferred v2
   milestone; v1 is read-and-link only.
3. Optional `workspace-atlas` reconciliation helper for `federation.yaml` vs member state.

## Boundary preserved

v1 never writes into a member repo: `changeDirectory`/`readConfig`/`writeSessionSummary`
and the derived `.ospec/` surface stay coordinator-local. `openspec` behavior is
byte-identical by default.
