# Apply Progress: Workspace-Federated Artifact Backend

## Unit A — Runtime core (PR #1) — DONE

Branch: `feat/federated-runtime-core`. Strict TDD (RED→GREEN). Suite: 75/75 green.

| Phase | Status | Output |
|-------|--------|--------|
| 1 `workspace-atlas.js` | done | `scripts/lib/workspace-atlas.js` + `workspace-atlas.test.js` (8 tests): `parseAtlas`, `resolveMembers`, `computeImpact` |
| 2 `readBackendMode()` | done | `scripts/lib/ospec-state.js` (+ 4 tests); modes extracted to leaf `scripts/lib/artifact-store-modes.js` to avoid an import cycle |
| 3 Federated store ops | done | `scripts/lib/artifact-store.js`: real `isInitialized`/`findActiveChanges` (aggregated, `source`-tagged, fail-open member skip); coordinator surface shared by both modes |

Notes:
- The federated door is no longer "not implemented" for reads. Coordinator-local
  `readConfig`/`changeDirectory`/`writeSessionSummary` are shared with the openspec mode;
  only `isInitialized` + `findActiveChanges` are federation-specific.
- No behavior change for existing repos: hooks still construct `openspec` by default.
  Backend selection is Unit B.

## Unit B — Harness wiring (PR #2) — PENDING

Phase 4: the four stateful hooks resolve `artifact_store.backend` via `readBackendMode`
and pass it to `createArtifactStore`. Regression suite must stay green.

## Unit C — Prompt surfaces (PR #3) — PENDING

Phases 5–6: `sdd-workspace` trio, orchestrator Impact Advisory, convention/docs.
