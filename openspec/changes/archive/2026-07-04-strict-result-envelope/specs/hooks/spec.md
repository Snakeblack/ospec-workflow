# Delta for hooks

## ADDED Requirements

### Requirement: SubagentStop Result Envelope Parse, Validate, and Persist {#REQ-hooks-001}

Before its existing `skill_resolution` evaluation (baseline §5.1-§5.4), `SubagentStop`
MUST attempt to extract a fenced ```` ```json:result-envelope ```` block from the
subagent's result payload, using the same field-search order already defined in §5.2
(`input.skill_resolution`-style priority: `result`, `output`, `response`,
`final_output`, `final_result`, `message`, `content`, then `transcript_path` fallback).

When the fence is present, the hook MUST validate its content against the canonical
Result Envelope Schema (skills domain, `sdd-phase-common.md` §D) using the shared,
dependency-free validator (`scripts/lib/result-envelope.js`). The validator MUST NOT
throw on malformed input; it MUST return a structured `{valid: boolean, errors: [...]}`
result.

When validation succeeds, the hook MUST resolve the active change (reusing the
`findActiveChanges` selection logic already used by PreCompact/Stop, §4.2) and the
target phase key by stripping the `sdd-` prefix from the resolved agent name (§5.2
extraction — e.g. `sdd-design` → `design`), then read-merge-update that phase's
`state.yaml` entry with the envelope's `summary` and `key_decisions` fields, per the
Phase Summary Block shape (skills domain §12).

When the fence is absent, malformed, fails schema validation, or no active change can
be resolved, the hook MUST skip persistence entirely, MUST NOT throw, and MUST proceed
unchanged to the existing `skill_resolution` behavior (§5.1-§5.4) — this step is
strictly additive and fail-safe.

When the target phase's `state.yaml` entry already carries a non-empty `summary` for
this batch (the phase agent already wrote its own Phase Summary Block), the hook MUST
NOT destructively overwrite it with conflicting content. The exact merge strategy
(atomic last-writer-wins vs. hook-writes-only-when-agent-omitted) is an open design
decision deferred to `sdd-design` for this change; this requirement only fixes the
invariant that no summary data is silently lost.

#### Scenario: Valid envelope persisted to state.yaml

- GIVEN a subagent result payload contains a valid ```` ```json:result-envelope ````
  fence with `summary: "..."` for agent `sdd-design`
- WHEN `SubagentStop` runs
- THEN it validates the fence, resolves the active change and the `design` phase key
- AND read-merge-updates `state.yaml phases.design.summary` with the envelope's summary
- AND processing continues to the existing `skill_resolution` steps afterward

#### Scenario: Missing fence — fail-safe, no persistence

- GIVEN a subagent result payload contains no ```` ```json:result-envelope ```` fence
- WHEN `SubagentStop` runs
- THEN it MUST NOT write to `state.yaml` for this step
- AND it MUST proceed to the existing `skill_resolution` extraction (§5.1) unaffected
- AND stdout MUST still contain `{"continue":true}` (or the existing degraded
  `systemMessage`) exactly as before this change

#### Scenario: Malformed fence — validation fails safely

- GIVEN a fence is present but its JSON is invalid or missing a required field
  (e.g. `status`)
- WHEN `SubagentStop` validates it
- THEN the validator MUST return `valid: false` without throwing
- AND the hook MUST skip persistence and continue with existing behavior, never
  producing a non-zero exit code or blocking the subagent's turn

#### Scenario: Agent's own summary already present — no destructive overwrite

- GIVEN `state.yaml phases.design.summary` already holds a non-empty value written
  earlier in the same batch
- WHEN `SubagentStop` attempts to persist the envelope's summary
- THEN it MUST NOT silently replace it with conflicting content in a way that loses
  information (exact resolution strategy deferred to `sdd-design`)

## MODIFIED Requirements

### Requirement: Go/JS Executable Parity Contract (E1)

The Go port of the hooks (`internal/hooks/*.go`, `cmd/ospec-hooks/`) is an out-of-domain
mirror consumer: its sources are not listed in this domain's manifest globs, so this
spec documents the contract from the JS side only. The Go suite is the mirror consumer
of the same fixtures described below, for **every** hook covered by this contract — not
only `PreToolUse`.

(Previously: scoped exclusively to `PreToolUse` and `pre-tool-use-*.json` fixtures;
now generalized to cover a second hook, `SubagentStop`, per the fixture-family table
below. The per-hook floor and spawned-script requirements are unchanged for
`PreToolUse`.)

#### Fixture family table

| Hook | Fixture prefix | Spawned script | Fixture floor | JS Go mirror test |
|---|---|---|---|---|
| `PreToolUse` | `pre-tool-use-*.json` | `scripts/hooks/pre-tool-use.js` | 4 | `TestPreToolUse_ParityFixtures` |
| `SubagentStop` | `subagent-stop-*.json` | `scripts/hooks/subagent-stop.js` | 2 | `TestSubagentStop_ParityFixtures` |

#### 8a.1 Shared golden fixtures

Given `internal/testdata/parity/*.json` fixture files (each holding `description`,
`stdin`, and `expectedStdout`),
When either implementation's parity test suite runs,
Then, for each hook in the fixture family table:
- The JS suite (`scripts/hooks/parity-contract.test.js`) MUST spawn the real spawned
  script (via `child_process.spawnSync`, with all `DISABLE_*` bypass env vars stripped)
  against each of that hook's fixtures' `stdin` and assert the process exits 0.
- The JS suite MUST assert that hook's fixture set contains at least the fixture floor
  listed in the table (the set MUST NOT shrink below it).
- For every fixture EXCEPT a documented fail-open fixture, the JS suite MUST assert
  `actual === expectedStdout` byte-for-byte.
- For a documented fail-open fixture (identified for `PreToolUse` by
  `permissionDecisionReason` starting with `"The safety hook could not inspect this
  tool call:"`; for `SubagentStop` by a fixture with a missing/malformed
  `json:result-envelope` fence), the JS suite MUST compare the stable, implementation-
  independent fields exactly, and MUST assert only that any implementation-specific
  message text (e.g. a JSON-parser error suffix) shares a stable prefix — never a
  full byte-for-byte match on that text.

#### 8a.2 Fixture set governance

Adding a fixture under `internal/testdata/parity/` extends the contract for both
runtimes simultaneously (both suites read the same directory). A parity mismatch MUST
NOT be resolved by editing only the fixture: the canonical behavior MUST be decided
first, the lagging implementation changed to match, and the fixture updated only if the
contract itself changed.

#### Scenarios

- **Byte-for-byte match on a DENY fixture**: GIVEN `pre-tool-use-deny.json` fixture with
  `stdin: {"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}` WHEN the JS parity
  suite runs THEN the spawned hook's stdout MUST equal the fixture's `expectedStdout`
  exactly.
- **Parse-error fixture — prefix-only comparison**: GIVEN a fixture whose
  `expectedStdout` reason starts with `"The safety hook could not inspect this tool
  call:"` WHEN the JS parity suite runs THEN it MUST assert `hookEventName` and
  `permissionDecision` match exactly AND MUST assert only a shared prefix on the reason
  string, tolerating a divergent parser-error suffix.
- **Fixture set shrinks below floor — suite fails fast**: GIVEN fewer than 4 files
  matching `pre-tool-use-*.json` exist under `internal/testdata/parity/` WHEN the JS
  parity suite loads fixtures THEN it MUST fail the assertion `fixtureFiles.length >= 4`
  before running any per-fixture test.
- **SubagentStop valid-envelope fixture — byte-for-byte match**: GIVEN
  `subagent-stop-valid-envelope.json` fixture whose `stdin` carries a valid
  `json:result-envelope` fence WHEN the JS parity suite runs THEN the spawned
  `subagent-stop.js` stdout MUST equal `expectedStdout` exactly, including the
  degraded-resolution `systemMessage` (if any) unaffected by envelope persistence.
- **SubagentStop malformed-fence fixture — fail-open, prefix-only where applicable**:
  GIVEN `subagent-stop-malformed-envelope.json` fixture whose fence fails schema
  validation WHEN the JS parity suite runs THEN it MUST assert `continue: true` is
  present in `expectedStdout` AND MUST NOT assert any state.yaml write occurred.
- **SubagentStop fixture set shrinks below floor — suite fails fast**: GIVEN fewer than
  2 files matching `subagent-stop-*.json` exist under `internal/testdata/parity/` WHEN
  the JS parity suite loads that hook's fixtures THEN it MUST fail the assertion before
  running any per-fixture test for `SubagentStop`.
