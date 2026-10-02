# ADR-003: Orchestrator-only Engram saves; recall after state.yaml routing; no ospec hook changes

- Status: proposed
- Change: add-engram-session-memory
- Date: 2026-10-02

## Context
Phase agents have `tools: ['read','search','edit']` and skills declare `mcp: false`, so they cannot call `mem_*`. Non-authority (REQ-session-memory-002/007) must hold even though upstream hooks inject memory automatically. ospec's PreToolUse has no matcher and returns an explicit `allow` for tools without a `command` payload, mem_* included. SessionStart, PreCompact and Stop write to stores separate from Engram's.

## Decision
- The orchestrator saves exactly one pointer per `success`/`partial` phase return, after the `state.yaml` projection succeeds: `topic_key: sdd/{change}/{phase}`, `capture_prompt: false`, summary plus repo-relative paths.
- On `/sdd-continue` or after compaction, the orchestrator resolves the next phase from `state.yaml` first and recalls `sdd/{change}/` only as a hint, contrasted against live OpenSpec/git.
- All of this applies only when mem_* tools are present. Errors are ignored without retry.
- ospec hooks stay unchanged. The addendum forbids bare file paths as mem_* field values so the PreToolUse path probe never fires on them.
- A contract test bans `engram`/`mem_*` across runtime code and shared prompts.

## Alternatives
- Phase agents save: would grant MCP to read-only workers and widen trust.
- New ospec memory hooks: double registration, and they leak to other targets.
- Recall before routing: lets untrusted data influence the decision.

## Consequences
Non-authority holds by ordering plus the scan test. It is not mechanically enforced inside the model. Upstream sub-agent capture remains a documented residual risk. Reversible by deleting the addendum.
