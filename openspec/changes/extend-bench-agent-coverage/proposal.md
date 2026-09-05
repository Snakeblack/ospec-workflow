# Proposal: Extend Bench Agent Coverage (canonical agent identity)

## Intent

The agent-coverability bench (token/CX0 advisory pipeline) only recognizes agents whose registered name is strictly `sdd-${phase}` (`scripts/evals/lib/benchmark.js`, `validCostRow`, line ~115). Two defects follow: (a) non-`sdd-` harness agents are invisible to coverage validation, and (b) even `sdd-*` agents fail recognition when the host/plugin registers them with a prefix (e.g. `plugin-host:sdd-spec`), because strict equality on the raw name breaks. We need agent identity to be a first-order concept: one canonicalization point from "registered agent name" → "harness canonical agent".

## Scope

### In Scope
- Canonical agent-name resolution shared by phase-cost emission (`scripts/hooks/subagent-stop.js`, Go parity in `internal/hooks/subagentstop.go`) and bench validation (`scripts/evals/lib/benchmark.js`).
- Replace strict `agent === \`sdd-${phase}\`` validation with canonical-resolution-based coverage check.
- Extend coverage to all harness-owned agents (sdd phases, review agents, and other first-party agents already handled by `derivePhaseKey`/`canonicalAgentPhase` logic).
- Regression tests for prefixed names (JS and Go, parity contract E1).

### Out of Scope
- Changing the O1 phase-cost row schema beyond what identity resolution requires (attestation format changes minimized).
- New agents, new benchmark profiles, or CX1+ roadmap items.
- Host/plugin behavior outside the harness.

## Capabilities

### New Capabilities
- `agent-identity`: Canonical resolution of a registered agent name (possibly host/plugin-prefixed) to a harness canonical agent, as a single shared authority consumed by hooks emission and bench validation.

### Modified Capabilities
- `hooks`: REQ-hooks-001 phase-cost recording now derives `agent` via canonical resolution instead of raw/prefix-string matching; Go/JS parity preserved.
- `orchestrator-evals`: bench coverage validation accepts any harness-owned canonical agent, not only `sdd-${phase}`.

## Approach

Introduce one canonicalization module (single point of truth) that maps a registered agent name to a canonical harness agent. Both producers (SubagentStop hook, Go mirror) and the consumer/validator (`benchmark.js` coverage check) call this same resolution instead of embedding string conventions at each site. Detailed design (exact placement, prefix grammar, failure semantics for unresolvable names) belongs to sdd-design. Keep it deliberately small: no plugin registry, no config surface — just resolution.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/evals/lib/benchmark.js` | Modified | `validCostRow` coverage check via canonical resolution |
| `scripts/hooks/subagent-stop.js` | Modified | `derivePhaseKey`/`canonicalAgentPhase` unified into shared resolution |
| `internal/hooks/subagentstop.go` (+ store if needed) | Modified | Go parity mirror |
| Tests: `benchmark.test.js`, `subagent-stop.test.js`, `store_test.go` | Modified | Regression coverage for prefixed names and non-sdd agents |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| O1 row attestation (`canonicalPersistedO1Row`) breaks if `agent` values change format | Med | Canonical value stays the resolved name; existing rows remain valid; add compatibility test |
| Go/JS parity drift on resolution rules | Med | Mirror the module in Go; parity tests (E1) |
| Over-broad acceptance lets foreign agents pass coverage | Low | Resolution returns a closed set of harness-owned canonical agents; unknown → rejected |

## Rollback Plan

Revert the resolution module and restore strict `sdd-${phase}` equality in `validCostRow` and previous `derivePhaseKey` behavior; no persisted-data migration required if canonical values match today's emitted values for unprefixed names.

## Dependencies

- None external. Coordinate with CX0 advisory consumers (`context-measurement` emission is additive and unaffected).

## Success Criteria

- [ ] A phase-cost row with a host-prefixed agent name (e.g. `host:sdd-spec`) passes bench validation.
- [ ] Non-sdd harness agents (review agents, etc.) are counted in coverage.
- [ ] Go and JS resolution behave identically (parity tests green).
- [ ] Existing O1 evidence and attestations remain valid under unchanged names.

**Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/extend-bench-agent-coverage main`). This note is SHOULD, not MUST.
