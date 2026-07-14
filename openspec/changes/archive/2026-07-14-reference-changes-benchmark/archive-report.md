# Archive Report — reference-changes-benchmark

**Change**: reference-changes-benchmark  
**Archived at**: 2026-07-14  
**Verification**: PASS — 19/19 escenarios; 0 CRITICAL, 0 WARNING, 0 SUGGESTION  
**Artifact store**: openspec

## Specs Synced

Updated `openspec/specs/orchestrator-evals/spec.md` from the delta specification:

- `REQ-orchestrator-evals-001`: updated the golden corpus contract and added the
  canonical nine-profile benchmark catalog scenario.
- `REQ-orchestrator-evals-003`: updated live benchmark scoring, identity, cache,
  recovery, publication, O1, diagnostic and optional-suite contracts; added the
  corresponding verification scenarios.
- Unmentioned requirements were preserved unchanged.

The stale-baseline check passed: the current SHA-256 for
`orchestrator-evals` is
`8CF7DF6FBA89F0D6A208E182E0ABEF4D2A1F4C6D4CFD4C585C7B053F49EF0000`, matching
`state.yaml`.

## Resolved Decisions and ADRs

Promoted the resolved architecture decision to:

- `docs/adr/adr-20260714-001-separate-infrastructure-delivery-from-live-baseline-operation.md`

The change-local ADR remains in the archived change as audit history, with status
updated to `accepted` in the promoted copy.

## Close Gate

The verification verdict is `PASS`. No warnings require acceptance or follow-up
conversion. `openspec/config.yaml` declares no active `quality_gates` policy, so no
additional quality-gate closure is required. The missing live baseline is explicitly
fail-closed operational follow-up and does not block archive readiness.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/reference-changes-benchmark/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

## Archive Copy

All artifacts in the active change folder, including this report, were copied to:
`openspec/changes/archive/2026-07-14-reference-changes-benchmark/`.

The active source folder remains present pending orchestrator-owned recursive inventory
verification and deletion.
