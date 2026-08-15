# Archive Report

**Change**: k4a-execution-graph-compiler-replay
**Branch**: main
**Archive date (planned)**: 2026-08-15
**Planned destination**: `openspec/changes/archive/2026-08-15-k4a-execution-graph-compiler-replay/`
**Verify verdict**: PASS
**4R lineage**: approved — `terminal_reason: all-dimensions-passed-without-blocking-findings`
**Plan contract**: schema v1 (`archive-plan.json`)

## Summary

Hybrid archive (Plan-and-Report): the executor prepared four spec writes (one new domain `execution-graph-compiler`, three modified domains `kernel-contract-schemas`, `contract-lint`, `lifecycle-model-conformance`), six ADR promotions, and a full origin inventory fingerprint. Live writes to `openspec/specs/**` and `docs/adr/**`, the archive-folder move, and origin deletion are **pending** — owned by the deterministic archive transaction runtime (`node scripts/archive-transaction-run.js k4a-execution-graph-compiler-replay`).

The source directory `openspec/changes/k4a-execution-graph-compiler-replay/` **still exists** at report time.

## Verification Close Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS (61/61 MUST scenarios at 100% `runtime-test`) |
| CRITICAL issues | None (0 BLOCKER, 0 CRITICAL, 0 WARNING, 2 SUGGESTION) |
| 4R lineage | approved (`all-dimensions-passed-without-blocking-findings`) |
| Tasks complete | 33/33 |
| Quality gates | Done / Verified (2209 unit & regression tests passing) |

## Specs Prepared (change-local)

| Domain | Action | Details |
|--------|--------|---------|
| execution-graph-compiler | ADD | New domain — full specification (`specs/execution-graph-compiler/spec.md`) |
| kernel-contract-schemas | MODIFIED | REQ-001 and REQ-012 modified; REQ-015, REQ-016, REQ-017 added (`specs/kernel-contract-schemas/spec.md`) |
| contract-lint | MODIFIED | REQ-012 and REQ-013 added (`specs/contract-lint/spec.md`) |
| lifecycle-model-conformance | MODIFIED | REQ-003 and REQ-004 modified; REQ-010 added (`specs/lifecycle-model-conformance/spec.md`) |

### Baseline Fingerprints (from state.yaml)

| Domain | target_before_sha256 |
|--------|----------------------|
| execution-graph-compiler | `null` (new) |
| kernel-contract-schemas | `sha256:c2c8f895e0b41cd1573a569491c0ace531c277c702ba66778dc41434b3c4147b` |
| contract-lint | `sha256:7a06cb225a7e05251d4872b66ceed2ff80bf3910e1c11298bd81306afd58eb30` |
| lifecycle-model-conformance | `sha256:bb3f2fe2b3a2f3f089f36948c5e420efb257831e030e368b53f2408a8c397f30` |

## ADR Promotions (runtime-owned commit)

| Source | Target |
|--------|--------|
| `decisions/adr-001.md` | `docs/adr/adr-20260815-001-obligation-manifest-as-an-embedded-view-in-execution-graph.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260815-002-deterministic-graphid-coupled-to-contract-policy-bundle-and-sourcesnapshot-digests.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260815-003-typed-clarifyevent-with-descendant-scoped-transitive-invalidation.md` |
| `decisions/adr-004.md` | `docs/adr/adr-20260815-004-declarative-work-order-compilation-and-fixture-replay-without-live-runtime-authority.md` |
| `decisions/adr-005.md` | `docs/adr/adr-20260815-005-workorder-v2-as-the-k4a-public-compilation-contract.md` |
| `decisions/adr-006.md` | `docs/adr/adr-20260815-006-atomic-graph-and-provenance-validation-in-compileworkordersv2.md` |

Change-local `decisions/` copies remain in the audit trail; live `docs/adr/` writes occur only when the archive transaction runtime commits.

## Archive Inventory (plan summary)

Origin paths listed in `archive-plan.json` `archive_inventory[]` (17 entries at plan emission, excluding `archive-plan.json` from fingerprint identity):

- `apply-progress.md`
- `archive-report.md` (this report)
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`
- `decisions/adr-004.md`
- `decisions/adr-005.md`
- `decisions/adr-006.md`
- `design.md`
- `proposal.md`
- `specs/contract-lint/spec.md`
- `specs/execution-graph-compiler/spec.md`
- `specs/kernel-contract-schemas/spec.md`
- `specs/lifecycle-model-conformance/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

`archive-plan.json` is emitted alongside this report and is copied by the runtime but excluded from `source_fingerprint` (self-hash avoidance).

## Archive Report Contents

| Artifact | Status |
|----------|--------|
| proposal.md | present ✅ |
| specs/ (1 new domain + 3 prepared merges) | present ✅ |
| design.md | present ✅ |
| tasks.md | present ✅ (33/33 complete) |
| apply-progress.md | present ✅ |
| verify-report.md | present ✅ (PASS) |
| decisions/ (6 ADRs) | present ✅ |
| archive-report.md | present ✅ |
| archive-plan.json | emitted (pending runtime) |

## Live Specs / ADR Commit Pending (runtime-owned)

Live `openspec/specs/**` and `docs/adr/**` writes are applied only by the archive transaction runtime during commit — not by this executor.

## Move Completion Pending (orchestrator-owned)

The source directory `openspec/changes/k4a-execution-graph-compiler-replay/` still exists. Closure authority requires a runtime success receipt from:

```text
node scripts/archive-transaction-run.js k4a-execution-graph-compiler-replay
```

Do not treat this report as proof that the archive move completed.

## Cost

Estimated token cost per phase, aggregated from `.ospec/session/k4a-execution-graph-compiler-replay/phase-costs.jsonl`. Figures are heuristic estimates (~4 bytes/token), not exact metering.

| Phase | Invocations | Re-launches | Duration | Model Tiers | Statuses | Estimated Prompt Tokens | Estimated Artifact Tokens | Estimated Tool Output Tokens | Estimated Output Tokens |
|-------|-------------|-------------|----------|-------------|----------|-------------------------|---------------------------|------------------------------|-------------------------|
| review-change | 6 | 5 | 0ms | unknown | success, unknown | 644777 (estimated) | 0 (estimated) | 0 (estimated) | 2648 (estimated) |
| review-risk | 4 | 3 | 0ms | unknown | success, unknown | 563030 (estimated) | 0 (estimated) | 0 (estimated) | 1631 (estimated) |
| review-resilience | 4 | 3 | 0ms | unknown | success | 565337 (estimated) | 0 (estimated) | 0 (estimated) | 613 (estimated) |
| review-reliability | 4 | 3 | 0ms | unknown | success, unknown | 565385 (estimated) | 0 (estimated) | 0 (estimated) | 1809 (estimated) |
| review-readability | 4 | 3 | 0ms | unknown | success | 577649 (estimated) | 0 (estimated) | 0 (estimated) | 3613 (estimated) |
| apply | 9 | 8 | 0ms | unknown | success | 1137197 (estimated) | 0 (estimated) | 0 (estimated) | 8109 (estimated) |
| review-correction | 6 | 5 | 0ms | unknown | success, unknown | 967769 (estimated) | 0 (estimated) | 0 (estimated) | 3241 (estimated) |
| spec | 1 | 0 | 0ms | unknown | success | 206366 (estimated) | 0 (estimated) | 0 (estimated) | 663 (estimated) |
| design | 1 | 0 | 0ms | unknown | success | 209874 (estimated) | 0 (estimated) | 0 (estimated) | 21 (estimated) |
| tasks | 1 | 0 | 0ms | unknown | success | 41036 (estimated) | 0 (estimated) | 0 (estimated) | 1073 (estimated) |

**Total user questions asked**: 0
