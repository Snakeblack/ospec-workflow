# Verify Report: Workspace-Federated Artifact Backend

**Verdict: PASS WITH WARNINGS** → `verified`

Test evidence: `node --test "scripts/**/*.test.js"` → **80/80 green**.

## Spec conformance

### `artifact-store-federated` (JS runtime)

| Requirement | Status | Evidence |
|---|---|---|
| Atlas Resolution (init true only with parsed members; absent → false, no throw) | PASS | `isInitialized` + tests `isInitialized reflects atlas presence` |
| Member Resolution (path + default `openspec_root`; missing/no-`changes` skipped) | PASS | `workspace-atlas.resolveMembers` + tests; reachability via `changes/` stat |
| Aggregated Active Changes (union, `source` tags, member parity, recency order) | PASS | `findActiveChanges` + tests `unions … source tags`, `orders … by recency` |
| Coordinator-Scoped Canonical Writes (`changeDirectory`/`readConfig` coordinator-local) | PASS | shared `createCoordinatorSurface` + test `changeDirectory … coordinator-local` |
| Atlas Parsing Subset (members/contracts list-of-maps; unsupported ignored; `node:*`) | PASS | `parseAtlas` + tests `ignores unsupported nested shapes` |
| Contract Impact Graph (provider + consumers; leaf → self; pure) | PASS | `computeImpact` + tests |

### `sdd-session-hooks` (backend selection delta)

| Requirement | Status | Evidence |
|---|---|---|
| Backend Resolution From Config (absent/malformed → openspec; explicit override) | PASS | `createArtifactStoreFromConfig` + `readBackendMode` + hook tests |
| Backend Resolution — unknown value falls back to openspec **with a recorded warning** | PARTIAL | Fallback to openspec is met (no throw); the warning is **not** surfaced — see WARNING-1 |
| Federated Session Continuity (most recent change across members; coordinator-local writes) | PASS | recency sort fix + hook tests `selects the federated backend …` |
| Non-Regression For openspec | PASS | full pre-existing suite green; openspec output unchanged |

### `sdd-workspace` (prompt layer)

| Requirement | Status | Evidence |
|---|---|---|
| Atlas Initialization (scan siblings, confirm before write, update-not-overwrite) | PASS (review) | `skills/sdd-workspace/SKILL.md` Execution Steps + Hard Rules |
| Aggregated Status (per-member active changes, unreachable flag) | PASS (review) | SKILL `status` step backed by federated `findActiveChanges` |
| Impact Analysis (provider + consumers) | PASS (review) | SKILL `impact` step backed by `computeImpact` |
| Read-Only Guarantee (no member writes) | PASS (review) | Hard Rules + agent Required artifacts; runtime store never writes members |

## Findings

### CRITICAL-1 — Aggregated changes not ordered by recency (RESOLVED)

`findActiveChanges` concatenated coordinator-then-member changes without a global
order, so `[0]` (consumed by the hooks as the active change) could be an older
coordinator change instead of the newest member change — violating
`sdd-session-hooks` Federated Session Continuity. **Fixed during verify**: the union is
now sorted by `modifiedAt` desc (tie-break by name); added test
`orders aggregated changes by recency across members`. Re-verified green.

### WARNING-1 — Unknown backend does not record a warning (OPEN, non-blocking)

`sdd-session-hooks` requires an unknown `artifact_store.backend` to fall back to
openspec **with a recorded warning**. `readBackendMode` performs the safe fallback but
collapses the unknown value silently, so no warning is surfaced. Impact is limited to
observability of a misconfiguration; behavior is safe and never throws. **Follow-up**:
expose the unrecognized value (e.g. a `readBackendSelection` returning `{ mode, recognized }`)
and emit a `runtime_observability` warning through `createArtifactStoreFromConfig`.

### SUGGESTION-1 — federation.yaml reconciliation is prompt-only

`sdd-workspace status` is specified to reconcile coordinator `federation.yaml` slices
against each member's actual active changes. v1 implements this at the prompt layer
(SKILL guidance) without a runtime cross-check helper. Acceptable for the read-and-link
v1 boundary; consider a `workspace-atlas` reconciliation helper if drift appears.

## Routing

No `spec-gap`/`design-gap`/`tasks-gap`. CRITICAL-1 was a `code-bug` fixed in place.
WARNING-1 and SUGGESTION-1 are non-blocking follow-ups recorded for a future change.
Verdict supports archive.
