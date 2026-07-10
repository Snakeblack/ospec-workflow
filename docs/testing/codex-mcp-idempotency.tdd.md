# Codex MCP idempotency — TDD evidence

## Source and user journeys

No plan file was used; the journeys came from the reported Codex installation failure.

- As a Codex user, I can run `npm run setup:codex` repeatedly without duplicate MCP processes or marketplace entries.
- As a plugin user, I do not receive an invalid `microsoft/markitdown` startup warning from the Codex payload.
- As a user with existing MCP or marketplace configuration, installation preserves it instead of overwriting it.

## Task report

| Behavior | RED evidence | GREEN evidence | Guarantee |
| --- | --- | --- | --- |
| Codex payload omits bundled MCP config | `node --test scripts/lib/target-transform.test.js scripts/configure/install-codex.test.js` failed 5 tests: manifest still contained `mcpServers`, `.mcp.json` survived, and MCP installer helpers were absent | Same target passed 114/114 after implementation | Plugin installation cannot start a second bundled copy of Context7 or MarkItDown |
| Validator blocks MCP regression | `node --test scripts/configure/validate-codex.test.js` failed the two new no-bundle assertions | Validator target passed 25/25 | `.mcp.json` and manifest `mcpServers` fail Codex payload validation |
| Stale generated MCP is removed | `node --test scripts/configure/cli.test.js` left a prior `.mcp.json` in place | CLI target passed 24/24 | Rebuilding an old `dist/codex` converges to the MCP-free payload |
| Existing MCP identities are reused | New installer tests initially failed because `ensureCodexMcps` did not exist | Installer target passed 29/29, including legacy slash-name normalization and identity deduplication | Matching `command` + ordered `args` is registered at most once |
| Existing marketplace source is preserved | Live Codex 0.144.1 returned `marketplace 'ospec-tools' is already added from a different source` | Isolated live smoke: first run added one marketplace/two MCPs; second run printed `preserving existing marketplace` and reused both MCPs, with exit 0 | Local setup coexists with a prior remote or local `ospec-tools` source |

## Test specification

| # | What is guaranteed | Test or command | Type | Result |
| --- | --- | --- | --- | --- |
| 1 | Legacy `microsoft/markitdown` and `io.github.upstash/context7` become valid Codex names | `install-codex.test.js: readCodexMcpDefinitions normalizes legacy slash-qualified names` | unit | PASS |
| 2 | Equivalent pre-existing MCPs are reused even under another name | `install-codex.test.js: ensureCodexMcps skips equivalent pre-existing servers` | unit | PASS |
| 3 | Re-running setup adds no second MCP identity | `install-codex.test.js: main global install is idempotent` | integration | PASS |
| 4 | Codex output contains neither `.mcp.json` nor `mcpServers` | `target-transform.test.js` + `validate-codex.test.js` | unit/integration | PASS |
| 5 | The local marketplace uses `.agents/plugins/marketplace.json` | `install-codex.test.js: buildCodexMarketplace wraps dist/codex` | integration | PASS |
| 6 | The whole repository remains green | `node scripts/check.js` | regression | PASS (all checks) |

## Coverage and known gaps

`node --test --experimental-test-coverage scripts/configure/install-codex.test.js scripts/configure/validate-codex.test.js scripts/configure/cli.test.js scripts/lib/target-transform.test.js` passed 165/165 with 86.01% lines, 80.44% branches, and 91.36% functions overall.

Remote plugin installation cannot mutate user-level MCP configuration. It therefore ships no bundled MCPs and documents the two explicit `codex mcp add` commands; `setup:codex` performs that registration automatically and idempotently.

No checkpoint commits were created because the worktree already contained user-owned changes outside this task; RED/GREEN evidence is preserved here instead of committing unrelated state.
