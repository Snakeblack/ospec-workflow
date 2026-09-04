# Proposal: Claude CX0 Telemetry Adapter

## Intent

Claude Code sessions (including those backed by GLM models via Z.AI or Anthropic-compatible endpoints) currently emit `unavailable: host-field-unavailable` for CX0 token metrics. This change implements a Claude Code telemetry adapter that extracts host-observed token counters (`input_tokens`, `output_tokens`, `cached_input_tokens`) from Claude's session transcript upon `SubagentStop`, populating `context-measurements.jsonl` with real measurements and derived KPIs (`uncached_input_tokens`, `amplification/v1`). Additionally, `ospec-hooks-launch.js` must route `subagent-stop` to the Node.js runtime under Claude Code to prevent shadowing by an unported Go binary.

## Scope

### In Scope
- Parse Claude Code session transcripts (`transcript_path` / `agent_transcript_path`) in `scripts/hooks/subagent-stop.js` to extract host token usage (`input_tokens`, `output_tokens`, `cached_input_tokens` / cache read/write counters).
- Support standard Anthropic and Anthropic-compatible/GLM transcript event and usage formats.
- Populate `context-measurements.jsonl` with `available` host-observed metrics and derive `uncached_input_tokens`, `unique_context`, `duplicated_context`, and `amplification/v1`.
- Ensure host dimension resolves to `claude` (or explicit target/host) instead of defaulting to `unknown-host`.
- Update `scripts/hooks/ospec-hooks-launch.js` to route `subagent-stop` to Node.js runtime for Claude Code.
- Maintain strict fail-safe error isolation: corrupt or unreadable transcripts degrade gracefully to `unavailable` without blocking `SubagentStop`.

### Out of Scope
- Porting transcript parsing to the Go binary (`cmd/ospec-hooks`).
- Modifying CX0 schema definition (`ospec-context-measurement/v1`) or existing cohort percentiles.
- Altering semantic authorities, verification gates, routing, or dispatch logic.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `context-measurement`: Clarify host-observed token counter extraction and coverage expectations for Claude Code sessions and compatible endpoints.
- `hooks`: Specify transcript-based token extraction for `subagent-stop` on Claude Code and define launcher routing to the Node.js runtime.

## Approach

1. **Transcript Extraction**: In `scripts/hooks/subagent-stop.js`, read the JSONL transcript identified by `transcript_path` (or `agent_transcript_path`), scanning recent message turns for usage objects containing input, output, and cache counters.
2. **Metric Normalization**: Feed extracted counters into `contextMetricObservations`, mapping them to `available` host-observed metrics and computing runtime-derived `uncached_input_tokens` (`input - cached`) and context KPIs (`amplification/v1`).
3. **Host Resolution**: Recognize Claude Code sessions via environment (`CLAUDE_PLUGIN_ROOT`, `OSPEC_TARGET=claude`), input properties, or transcript signatures, setting `host: "claude"`.
4. **Launcher Routing**: In `scripts/hooks/ospec-hooks-launch.js`, add an explicit branch in `resolveInvocation` for `subagent-stop` under Claude Code to execute `subagent-stop.js` directly via Node.js, mirroring the Codex precedent.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/hooks/subagent-stop.js` | Modified | Claude transcript parsing, token extraction, and CX0 normalization |
| `scripts/hooks/ospec-hooks-launch.js` | Modified | Routing `subagent-stop` to Node.js runtime for Claude Code |
| `openspec/specs/context-measurement/spec.md` | Modified | Spec requirements for Claude host observation and metrics |
| `openspec/specs/hooks/spec.md` | Modified | Spec requirements for SubagentStop transcript telemetry and launcher routing |
| `scripts/hooks/subagent-stop.test.js` | Modified | Unit tests for Claude transcript parsing and CX0 emission |
| `scripts/hooks/ospec-hooks-launch.test.js` | Modified | Unit tests for launcher routing under Claude Code |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Transcript schema variations between Anthropic and GLM/Z.AI endpoints | Medium | Support both Anthropic cache fields (`cache_read_input_tokens`, `cache_creation_input_tokens`) and standard `cached_input_tokens` |
| Large transcript file I/O overhead | Low | Read from end of file or scan recent entries only; wrap in try/catch with fail-safe fallback |
| Shadowing by compiled Go binary | High | Enforce Node.js invocation routing in `ospec-hooks-launch.js` for Claude Code |

## Rollback Plan

Revert changes to `scripts/hooks/ospec-hooks-launch.js` and `scripts/hooks/subagent-stop.js` via git revert. Telemetry will safely degrade back to `unavailable: host-field-unavailable` without breaking sessions.

## Dependencies

- Existing CX0 telemetry schema (`ospec-context-measurement/v1`).
- Existing `resolveInvocation` mechanism in `scripts/hooks/ospec-hooks-launch.js`.

## Success Criteria

- [ ] SubagentStop extracts `input_tokens`, `output_tokens`, and `cached_input_tokens` from Claude Code session transcripts.
- [ ] CX0 records in `context-measurements.jsonl` record status `available` for token counters with source `host-observed`.
- [ ] `uncached_input_tokens` and `amplification/v1` are successfully derived when valid token usage is present.
- [ ] `ospec-hooks-launch.js` reliably dispatches `subagent-stop` to Node.js on Claude Code.
- [ ] Corrupted/missing transcripts degrade fail-safely to `unavailable` with reason `host-field-unavailable`.
- [ ] All tests pass via `npm test`.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST.
