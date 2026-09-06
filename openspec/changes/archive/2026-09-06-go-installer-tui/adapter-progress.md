# Adapter apply progress

## Completed adapter slice

- [x] 1.1 `scripts/configure/installer-adapter.js` provides a versioned, read-only plan for all seven `PROFILES`, uses the canonical `agents/*.agent.md` roster, and exposes native scalar, array, and Codex-object choices through opaque deterministic IDs.
- [x] 1.1 `install` re-creates the plan, requires exact version/target/selections fields and every selectable default, rejects stale/unknown/inherited selections before dispatch, and invokes exactly one selected installer as `main([], deps)` with an ephemeral `runConfigure` override wrapper.
- [x] Adapter portion of 1.4 covers read-only planning, native values, inheritance, fresh validation, all seven target dispatch entries, JSON-only `plan` output, and exit status `2` for invalid install input using temporary sources and injected installer mains.

## Verification

- `node --test scripts/configure/installer-adapter.test.js` — 7 passing tests.
- `node --test scripts/configure/installer-adapter.test.js scripts/configure/cli.test.js scripts/lib/model-resolver.test.js scripts/configure/install-claude.test.js scripts/configure/claude-marketplace.test.js` — 64 passing tests.
- A live read-only catalog check returned `claude,vscode,github-copilot,opencode,codex,cursor,antigravity`.
- The seven real installer mains each received the temporary source and override wrapper exactly once, then synchronously returned the injected generator failure code `23` before destination writes.
- Promise and object installer results are rejected with exit status `1`; they cannot be normalized to success.

## Scope and handoff

The adapter consumes the confirmed flat `modelOverrides` contract: `{ agentId: scalar | array | codexObject }`. It makes no filesystem changes beyond the existing selected installer and does not alter `models.yaml`. Shared task status, apply progress, and state remain owned by the coordinating worker.
