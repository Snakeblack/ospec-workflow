# ADR-20260710-003: Codex hook adaptation reuses baseline mechanisms

- Status: accepted
- Change: codex-target-phase-2
- Date: 2026-07-10
- Archive Date: 2026-07-10

## Context
Codex needs `matcher`+`hooks` wrapper groups, a Windows command variant, `ask`-free
`PreToolUse`, and `agent_transcript_path` for `SubagentStop`. The baseline already has a
`bypassPermissions` ask-degradation path (§3.4.1) and a §5.2 transcript-fallback. The task
mandates reuse, not a new adapter.

## Decision
Emit per-event `{ matcher: ".*", hooks: [ { type, command, commandWindows, timeout } ] }`
from `codexHooks`. Signal Codex to the runtime via `OSPEC_TARGET=codex`; `pre-tool-use.js`
treats that as bypass-equivalent and routes every `ask` branch through the existing
`applyPermissionMode` (`allow` + `systemMessage`), leaving DENY intact. `subagent-stop.js`
reads `input.agent_transcript_path` as an alias for `input.transcript_path`. `SessionStart`
logic is unchanged (contract is target-independent, REQ-hooks-007). `PLUGIN_DATA` is
inherited by the launched process untouched.

### Addendum (4R review remediation, CRITICAL-1): dual env-var gate

`OSPEC_TARGET=codex` alone is process-wide state that can leak into an unrelated session
(leftover shell export, CI env var, repo `.env`), silently degrading every ASK-class hook
decision there too. `applyPermissionMode`/`codexWrapper` in both `pre-tool-use.js` and
`pretooluse.go` now require BOTH `OSPEC_TARGET=codex` AND `OSPEC_CODEX_WRAPPER=1`.
`OSPEC_CODEX_WRAPPER=1` is inlined directly into the `command`/`commandWindows` strings
`codexHooks` generates (`OSPEC_CODEX_WRAPPER=1 node ...` / `set OSPEC_CODEX_WRAPPER=1&& node
...`), so it is a per-invocation signal set fresh by the wrapper's own generated command line
for that single hook call, not inherited ambient session state. DENY stays undegraded either
way.

## Alternatives
- Standalone `codex-hook-adapter.js` translating the full wire contract — rejected:
  reinvents `applyPermissionMode`, duplicates parity-tested logic.

## Consequences
Cross-cutting pattern: hooks become target-aware via env flags; Go/JS parity fixtures
assert against the published payload. Reversible per hook. Affects the hook output contract
on the codex target only.

## Implementation Details
- File: `scripts/lib/target-transform.js` — `codexHooks` emits wrapper structure with `matcher`/`hooks`/`commandWindows`/timeout
- File: `scripts/hooks/pre-tool-use.js` — `applyPermissionMode()` checks `OSPEC_TARGET=codex && OSPEC_CODEX_WRAPPER=1` for dual-signal gate
- File: `scripts/hooks/subagent-stop.js` — `resolveTranscriptPath()` accepts `agent_transcript_path` alias
- File: `internal/hooks/pretooluse.go` — Go parity implementation with dual-signal gate
- File: `internal/hooks/subagentstop.go` — Go parity implementation with `agent_transcript_path` alias
- Tests: `scripts/lib/target-transform.test.js`, `scripts/hooks/pre-tool-use.test.js`, `scripts/hooks/subagent-stop.test.js`, Go tests

## Resolved By Specs
- REQ-hooks-004: Codex Wrapper Matcher and Hooks Generation With Cross-Platform Adapter
- REQ-hooks-005: Codex PreToolUse Deny/Allow/Advisory Without ASK
- REQ-hooks-006: Codex SubagentStop Reads agent_transcript_path
- REQ-hooks-007: Codex SessionStart Context Contract

## 4R Review Remediation Record
Approval ID: approval-003 (2026-07-10T13:45:00Z)  
Remediations: 2 CRITICAL findings  
- CRITICAL-1: Dual-signal ASK→allow gate (`OSPEC_TARGET=codex` + `OSPEC_CODEX_WRAPPER=1`)  
- CRITICAL-2: AI-attribution DENY guard ported to Go  
Re-verification: PASS clean (2026-07-10T15:00:00Z)
