# Apply Progress: fix-phase-cost-runtime-telemetry

## Bounded apply handoff

- Change: `fix-phase-cost-runtime-telemetry`
- Mode: Strict TDD
- Delivery: `exception-ok` / `size:exception`
- Scope: six implementation/test files only; `docs/roadmap.md` was not edited by this batch.
- Status: ready for verify

The batch makes Codex runtime synchronization content-aware and idempotent, and makes
phase-cost no-op/fallback outcomes observable through bounded metadata containing only
phase, reason, host-binding status, and boolean field presence. Persisted cost rows do
not contain result/transcript payload content.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 1.2 / 2.1 | `scripts/hooks/subagent-stop.test.js` | Unit/integration | 70 JS tests passed before edits | ✅ New no-active-change diagnostic test failed (`undefined`) | ✅ Focused JS run passed: 71/71 | ✅ Active row asserts observed fields and redaction; no-op path uses a different setup | ✅ Shared field-presence helper; existing `continue:true` contract unchanged | No payload values are included in diagnostics. |
| 1.3 / 2.2 | `internal/hooks/subagentstop_test.go` | Unit/integration | `go test ./internal/hooks` passed before edits | ✅ New test failed to compile (`PhaseCostDiagnostic` missing) | ✅ Focused Go run passed | ✅ Active fallback row and no-active path cover distinct branches | ✅ `gofmt` applied; Go mirrors JS field-presence semantics where applicable | Parity fixtures were not changed in this bounded batch. |
| 1.4 / 2.3 | `scripts/configure/install-codex.test.js` | Unit/integration | 27 installer tests passed before edits | ✅ New sync test failed (`copyCodexRuntime` returned no result) | ✅ Focused JS run passed: 71/71 total across both focused files | ✅ source-v1 → source-v2 → unchanged third sync | ✅ Content-aware tree sync reuses existing safe path handling | Supported installer refreshed changed runtime bytes. |

## Verification evidence

Focused commands executed successfully:

```text
node --test scripts/hooks/subagent-stop.test.js scripts/configure/install-codex.test.js
  71 tests, 71 passed
go test ./internal/hooks -run 'TestSubagentStop_(PhaseCostDiagnostic|PersistPhaseCost)'
  passed
```

The full `npm test` command is intentionally deferred to `sdd-verify` as requested.

Supported setup was run once through `npm run setup:codex -- --no-validate` and completed
successfully. The first npm-wrapped dry-run attempt did not propagate its flags (it
reported a normal completion), so the one effective dry-run was run directly through
the supported installer entrypoint:

```text
node scripts/configure/install-codex.js --dry-run --no-validate
  [dry-run] Codex agents and AGENTS.md prepared; no files were written.
```

After setup, source and installed `subagent-stop.js` matched:

```text
source   SHA-256 5EFEFFFCE15806B2C4BBDEA18B7A9D958A1B04950A2D15B8DCF71AD51E69476B
installed SHA-256 5EFEFFFCE15806B2C4BBDEA18A9D958A1B04950A2D15B8DCF71AD51E69476B
```

## Live row evidence

The requested current-workspace path
`.ospec/session/fix-phase-cost-runtime-telemetry/phase-costs.jsonl` was absent when
apply evidence was collected. Therefore no live row hash is fabricated or claimed in
this batch. The earlier host proof described by the orchestrator is not re-asserted as
a new apply result.

Explicitly: the post-return `sdd-apply` row is not yet claimed. A fresh host-attested
row remains a verify task.

## Remaining work

- Full `npm test`, runtime parity/archive checks, and any live-row evidence belong to verify.
- No archive was run.
- A pre-existing working-tree diff exists in `docs/roadmap.md`; this batch did not touch it and does not claim that roadmap cleanliness requirement.

## Final focused check

```text
go test ./internal/hooks
  passed (package-level focused verification)
```

## Continuation: remediation after failed verification

- Change: `fix-phase-cost-runtime-telemetry`
- Scope: repaired the three `code-bug` findings from `verify-report.md`; no archive was run.
- Status: ready for `sdd-verify` after focused checks.
- Full `npm test` was not run in this bounded continuation; it remains a verify gate.

### TDD Cycle Evidence — remediation batch

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 2.5 | `scripts/hooks/subagent-stop.test.js`, `internal/testdata/codex-token-count-shape.json` | Unit/integration | Existing regression from verify | ✅ Regression captured before repair | ✅ Focused JS suite passed | ✅ Nested token-count, absent fields, and redacted row cases | ✅ Shared numeric normalizer; no raw payload persistence | Fixture contains sanitized field structure only. |
| 2.6 | `scripts/evals/lib/benchmark.test.js`, `scripts/hooks/subagent-stop.test.js` | Integration/contract | Existing archive/O1 contract tests | ✅ Consumer rejection reproduced by verify | ✅ Focused JS suite passed | ✅ Legacy row and row with cost metadata | ✅ Consumer accepts bounded metadata without widening payload capture | Full archive remains pending. |
| 2.7 | `scripts/hooks/pre-tool-use.test.js` | Unit/integration | Existing cleanup behavior | ✅ Full-suite evidence showed repository `.ospec` deletion | ✅ Focused changed tests passed | ✅ Fixture-root cleanup and repository-root preservation | ✅ Cleanup targets isolated roots | Full `npm test` must confirm no regression. |
| 2.8 | `scripts/hooks/subagent-stop.test.js`, `internal/hooks/subagentstop_test.go`, `internal/store/store.go` | Unit/integration | Prior append/lock tests | ✅ Missing nested/parity coverage identified | ✅ 89 JS tests passed; Go packages passed | ✅ Append, idempotency, and Go parity cases | ✅ Append-only lock path retained | No fabricated live-host claim. |

### Bounded continuation evidence

```text
node --test scripts/hooks/subagent-stop.test.js scripts/configure/install-codex.test.js scripts/evals/lib/benchmark.test.js
  89 passed, 0 failed
go test ./internal/hooks ./internal/store
  passed
internal/testdata/codex-token-count-shape.json
  present; sanitized fixture
```

At the time of this handoff, the full `npm test`, `go test ./...`, and fresh host
row were still pending; the final runtime evidence below records their later results.

## Continuation: Go test cleanup isolation

- The remaining cleanup defect was in `internal/hooks/pretooluse_test.go`, which
  recursively removed the repository-root `.ospec` directory.
- The test now runs in `t.TempDir()` with `t.Chdir()` and keeps a sentinel under a
  separate phase-cost directory; repository-owned telemetry is never a cleanup target.

### TDD Cycle Evidence — Go cleanup slice

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 2.9 | `internal/hooks/pretooluse_test.go` | Integration/filesystem | `go test ./internal/hooks` passed before edit | ✅ Repository-root cleanup identified by failed artifact-preservation evidence | ✅ `go test ./internal/hooks` passed; sentinel assertion passes | ✅ Active change fixture plus unrelated sentinel path | ✅ `t.TempDir()`/`t.Chdir()` removes global cleanup risk | `go test ./...` also passed after the fix. |

### Final runtime evidence before verify

```text
npm test
  exit 0; All checks passed.
go test ./...
  exit 0; all packages passed.
phase-cost artifact after both gates
  .ospec/session/fix-phase-cost-runtime-telemetry/phase-costs.jsonl present
```

## Continuation: CRITICAL-only remediation (2026-07-15)

The latest 4R review identified three CRITICAL defects. Only those defects were
changed; existing warnings and suggestions remain intentionally documented for
the bounded follow-up requested by the user.

- Go now reads `token_count` from the root `OSPEC_CODEX_EVENTS_PATH` only when
  it resolves to the workspace `.eval-capture/codex-events.jsonl` and
  `OSPEC_BENCHMARK_RUN_ID` is present, matching the JS producer guard.
- JS and Go phase-cost appenders scan every existing non-empty row before
  assigning `row_index`, so `apply -> design -> apply` cannot reuse an index.
- Go lock contention now returns `errLockContended` after retries and never
  invokes the callback without ownership.

### TDD Cycle Evidence — CRITICAL remediation

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 2.10 | `internal/hooks/subagentstop_test.go` | Integration/host-source | Existing root binding tests | ✅ Go root fallback absent | ✅ `go test ./internal/hooks` passes with prompt=321/output=27 | ✅ Workspace path + run-id guard + sanitized JSONL | ✅ Reused stable root reader and existing normalizer | No transcript content is persisted. |
| 2.11 | `scripts/lib/ospec-state.test.js`, `internal/store/store_test.go` | Unit/append contract | Existing JSONL append tests | ✅ Duplicate index after later phase | ✅ JS and Go focused tests pass | ✅ apply → design → apply yields indexes 0,1,2,3 | ✅ Changed only the premature scan exits | Malformed-row recovery remains out of scope. |
| 2.12 | `internal/store/lock_test.go` | Unit/error path | Existing lock retry budget | ✅ Callback could run after contention exhaustion | ✅ `go test ./internal/store` passes; callback remains false | ✅ Fresh lock contention is exercised | ✅ Returns the existing typed contention error | No lock policy expansion. |

### Focused runtime evidence

```text
node --test scripts/lib/ospec-state.test.js scripts/hooks/subagent-stop.test.js
  107 passed, 0 failed
go test ./internal/hooks ./internal/store
  exit 0
```
