# Proposal: Strict Result Envelope (C5)

## Intent

Today the phase Result Contract is "JSON inside markdown by convention" (`sdd-phase-common.md` §D returns a prose block). The orchestrator parses each phase's return envelope with the LLM (tokens + fragility), and `SubagentStop` cannot reliably validate structure or persist the Phase Summary Block — it only extracts `skill_resolution`. This change makes the envelope a **strict, machine-validatable JSON block**: phases emit it as a delimited fence (```` ```json:result-envelope ````), `SubagentStop` validates it against a schema and persists the summary to `state.yaml`, and the orchestrator consumes fields instead of prose. This hardens C1 (the Phase Summary Block stops depending on the LLM writing it correctly) and gives us a second hook with an executable Go/JS parity contract.

## Scope

### In Scope
- Define a canonical envelope schema (the §D fields: `status`, `executive_summary`, `artifacts`, `next_recommended`, `risks`, `skill_resolution`, optional `blocker_type`/`question_gate`/`assumptions`).
- Phase agents/skills emit the envelope as a ```` ```json:result-envelope ```` fenced block; `executive_summary` stays prose for the human.
- New dependency-free CommonJS schema validator (`scripts/lib/`), mirrored in Go.
- `SubagentStop` parses + validates the block and persists the phase `summary`/`key_decisions` into `state.yaml` (fail-safe, non-blocking).
- Go mirror parity: `internal/hooks/subagentstop.go` + new `internal/testdata/parity/subagent-stop-*.json` fixtures following the E1 pattern.

### Out of Scope
- Removing prose from `executive_summary` or reworking `question_gate` (already structured JSON).
- Migrating other hooks/phases to strict parsing.
- Changing the meaning of any existing envelope field.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `hooks`: `SubagentStop` gains envelope parse/validate + `state.yaml` summary persistence; parity contract (§8a) extended to a second hook.
- `agents`: orchestrator Result Contract consumes validated fields; phase templates emit the fenced block.
- `skills`: `sdd-phase-common.md` §D specifies the strict emission format and schema.

## Approach

Keep the emission additive: phases append a ```` ```json:result-envelope ```` fence carrying the structured envelope while `executive_summary` remains readable prose. A shared manual validator (no external deps) checks required fields, enum values, and the Assumption Entry schema. `SubagentStop` extracts the fence from the subagent result, validates it, and (when valid) writes `summary`/`key_decisions` into the change's `state.yaml` — the same shape C1 defines — before its existing degraded-resolution handling. All hook behavior stays fail-safe: a missing/invalid block degrades to today's behavior (no crash, `continue: true`). The Go mirror and shared golden fixtures enforce byte-for-byte parity.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `skills/_shared/sdd-phase-common.md` (§D) | Modified | Strict emission format + schema |
| `scripts/lib/result-envelope.js` (new) | New | Dependency-free schema validator |
| `scripts/hooks/subagent-stop.js` | Modified | Parse/validate block, persist summary |
| `internal/hooks/subagentstop.go` | Modified | Go mirror of parse/validate/persist |
| `internal/testdata/parity/subagent-stop-*.json` (new) | New | Shared golden fixtures (E1 pattern) |
| `scripts/hooks/parity-contract.test.js` | Modified | Cover subagent-stop fixtures |
| `agents/sdd-orchestrator.agent.md` (Result Contract) | Modified | Consume fields, not prose |
| `openspec/specs/hooks/spec.md` (§5, §8a) | Modified | SubagentStop + parity contract deltas |
| `openspec/specs/agents/spec.md` (§6.1) | Modified | Envelope emission format |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| LLM emits malformed/absent fence | Med | Fail-safe: degrade to current behavior, `continue: true`; validator never throws |
| Hook writing `state.yaml` races the phase agent's own write | Med | Design decision (defer to design phase): atomic write + last-writer-wins, or hook writes only when agent omitted summary |
| Go/JS validator divergence | Med | Shared golden fixtures + parity test enforce byte-for-byte |
| Schema drift vs. §D / agents §6.1 | Low | Single canonical schema referenced by all three specs |

## Rollback Plan

The change is additive and fail-safe. To revert: (1) remove the ```` ```json:result-envelope ```` emission instruction from `sdd-phase-common.md` §D and phase templates; (2) revert `subagent-stop.js`/`subagentstop.go` to `skill_resolution`-only; (3) delete `scripts/lib/result-envelope.js` and the `subagent-stop-*.json` fixtures. Because emission is layered alongside existing prose and the hook degrades gracefully, a partial rollback (leaving emission, disabling persistence) is also safe. No data migration required — `state.yaml` shape is unchanged.

## Dependencies

- None external. Reuses the E1 parity harness (`parity-contract.test.js`, `internal/testdata/parity/`) and the existing `state.yaml` summary shape from C1.

## Success Criteria

- [ ] A canonical envelope schema is documented and referenced by §D, hooks §5, and agents §6.1.
- [ ] Every phase emits a valid ```` ```json:result-envelope ```` block; a golden fixture proves validation passes and malformed input degrades safely.
- [ ] `SubagentStop` persists `summary`/`key_decisions` to `state.yaml` without the LLM having to write them.
- [ ] Go and JS suites verify the second hook against shared fixtures (byte-for-byte, E1 pattern); `npm test` green.
