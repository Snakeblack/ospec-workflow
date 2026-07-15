# Verification Report: fix-phase-cost-runtime-telemetry

## Verdict

**PASS WITH WARNINGS**

The phase-cost artifact is now created by the installed Codex hook, accepts the
observed nested `token_count` event shape, preserves rows through the JavaScript
and Go test suites, and is accepted by the canonical O1 consumer. The remaining
warnings are honest host limitations: this run did not expose phase duration or a
model tier, and the two historical assumptions remain unresolved by design.

## Evidence and test results

| Check | Result | Evidence level |
|---|---|---|
| Focused JS hook/installer/benchmark tests | 89 passed, 0 failed | runtime-test |
| PreToolUse cleanup regression | 52 passed, 0 failed | runtime-test |
| Full `npm test` | exit 0; `All checks passed.` | runtime-test |
| Go `internal/hooks` and `internal/store` | passed | runtime-test |
| Go `go test ./...` | exit 0; all 9 packages passed | runtime-test |
| Native runtime synchronization | setup exit 0; source/installed SHA-256 equal | runtime-test |
| Real SubagentStop artifact | JSONL exists after both full gates | manual-proof |
| CRITICAL remediation regression suite | 107 JS tests passed; focused Go packages passed | runtime-test |
| Selective resilience review | No findings within the three CRITICAL items | reviewer |

## Live phase-cost evidence

`.ospec/session/fix-phase-cost-runtime-telemetry/phase-costs.jsonl` contains a
host-attested row with `phase: apply`, `agent: sdd-apply`,
`estimated_prompt_tokens: 187750`, `estimated_output_tokens: 67`,
`cost_observability.reason: codex-token-count-observed`, and all five
`token_count_presence` flags true. The row has `row_index: 0`, a valid
`row_attestation_sha256`, and no transcript or payload content.

The artifact remained present after `npm test` and `go test ./...`. The Go
PreToolUse test now runs in `t.TempDir()`/`t.Chdir()` and asserts an independent
phase-cost sentinel survives, so test cleanup cannot remove repository telemetry.

## Completeness

| Area | Status | Notes |
|---|---|---|
| Nested Codex token normalization | PASS | `event_msg.payload.info.last_token_usage`, with `total_token_usage` fallback. |
| Numeric validation and redaction | PASS | Invalid counts are not claimed; raw transcript content is not persisted. |
| O1 producer/consumer contract | PASS | `cost_observability` is allowlisted and included in v3 attestation; v1/v2 rows remain valid. |
| Append/idempotency | PASS | Locking, row indexes, relaunch handling, and prior rows are covered. |
| CRITICAL root token fallback | PASS | Go reads the guarded workspace root Codex event stream and normalizes non-zero input/output counts; regression evidence uses 321/27. |
| CRITICAL global row index | PASS | JS and Go cover `apply -> design -> apply` without index reuse. |
| CRITICAL lock fail-closed | PASS | Go returns contention after exhaustion and the callback remains uncalled. |
| JS/Go parity | PASS | Focused and full Go suites pass. |
| Native installed runtime | PASS | Source and installed hook bytes match after `setup:codex`. |
| Archive Cost block | PASS (contract) | Archive parser/contract tests and skill inspection pass; archive itself is intentionally not run yet. |

## Strict TDD compliance

| Check | Result |
|---|---|
| TDD evidence table present | PASS |
| Coding tasks mapped to tests | PASS |
| RED evidence recorded | PASS |
| GREEN focused and full gates | PASS |
| Triangulation | PASS |
| Cleanup sentinel regression | PASS |
| Assertion quality | PASS; no tautologies, ghost loops, or zero-assertion tests found |

## Assumption reconciliation

| ID | Outcome |
|---|---|
| `sdd-explore-001` | `leave-unresolved`: historical hook configuration is not provable. |
| `sdd-explore-002` | `leave-unresolved`: historical payload is unavailable and is not used for the current verdict. |

## Warnings

- `duration_ms` is `0` because the host did not expose phase duration; no duration
  was fabricated.
- `model_tier` is `unknown` for the host row; this is not used to claim savings.
- The real archive phase remains pending; this report verifies its input contract,
  not an archive execution.
- The selective reliability reviewer was attempted three times but the host did
  not return an envelope; this is recorded as an execution limitation, not as a
  passing review claim. The completed resilience review and runtime evidence
  cover the three requested CRITICAL paths.

## Final recommendation

Proceed to archive. No CRITICAL/BLOCKER remains in the requested remediation
scope; warnings above are explicitly accepted for this bounded change.
