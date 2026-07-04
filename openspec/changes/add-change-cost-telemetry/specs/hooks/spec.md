# Delta for hooks

## ADDED Requirements

### Requirement: SubagentStop Per-Dispatch Phase Cost Recording {#REQ-hooks-001}

`SubagentStop` (JS and Go, byte-for-byte parity) MUST append one estimated-cost record
per dispatch to `.ospec/session/{change}/phase-costs.jsonl`, a sibling artifact of the
existing `.ospec/session/{change}/token-events.jsonl` written by the Token Budget
Advisor. This step MUST run after the existing Result Envelope Parse/Validate/Persist
step (baseline §5.0) and MUST NOT alter its outcome.

The hook MUST:
1. Resolve the active change using the same `findActiveChanges` selection logic already
   used elsewhere in this hook (baseline §5.0, §4.2). If no active change resolves, the
   hook MUST skip this step entirely and MUST NOT create `.ospec/session/` paths.
2. Estimate a token count for the dispatch's result payload by reusing the existing
   `estimateTokens` heuristic (`scripts/hooks/pre-tool-use.js`, ~4 characters per
   token) — no new estimation algorithm is introduced.
3. Derive the phase key by stripping the `sdd-` prefix from the resolved agent name
   (baseline §5.0 extraction), mirroring the phase-key resolution already used for
   `state.yaml` summary persistence.
4. Append one JSON line with at least the fields `phase`, `agent`, `est_tokens`,
   `status` (the dispatch's resolved `status` when available, else `"unknown"`), and
   `ts` (ISO 8601 UTC), to `.ospec/session/{change}/phase-costs.jsonl` under the same
   advisory file-lock convention already used for `.ospec/runtime/subagent-events.jsonl`
   (baseline §5.3).
5. `.ospec/session/{change}/phase-costs.jsonl` joins the on-disk artifact layout
   (baseline §7) as an additional row: owner `SubagentStop`, write mode `Append
   (advisory lock)`.

This step MUST be strictly additive and fail-safe, mirroring the existing envelope-
persistence step (baseline §5.0): any error in change resolution, token estimation, or
the file append MUST be caught, MUST NOT affect `stdout` or the hook's `continue: true`
output, and MUST NOT throw or exit non-zero.

#### Scenario: Dispatch cost recorded for an active change

- GIVEN a subagent result payload resolves to agent `sdd-design` with `status: success`
- AND an active change `add-x` exists in the workspace
- WHEN `SubagentStop` runs after the envelope-persistence step
- THEN it appends one JSON line to `.ospec/session/add-x/phase-costs.jsonl` with
  `phase: "design"`, an `est_tokens` estimate, `status: "success"`, and a `ts` timestamp
- AND the hook's existing `skill_resolution` behavior (§5.1-§5.4) and stdout output are
  unaffected

#### Scenario: No active change — skip, no file created

- GIVEN no active OpenSpec change resolves in the workspace
- WHEN `SubagentStop` runs
- THEN it MUST NOT create `.ospec/session/` or write any `phase-costs.jsonl` file
- AND processing continues unchanged to the existing `skill_resolution` behavior

#### Scenario: Estimation or write failure — fail-safe, no crash

- GIVEN the token-estimation heuristic or the JSONL append throws (e.g. a filesystem
  error)
- WHEN `SubagentStop` attempts to persist the phase-cost record
- THEN the hook MUST catch the error, MUST NOT propagate it, MUST NOT set a non-zero
  exit code, and MUST still output `{"continue":true}` (or the existing degraded
  `systemMessage`) exactly as before this change

## MODIFIED Requirements

### Requirement: Go/JS Executable Parity Contract (E1)

The Go port of the hooks (`internal/hooks/*.go`, `cmd/ospec-hooks/`) is an out-of-domain
mirror consumer: its sources are not listed in this domain's manifest globs, so this
spec documents the contract from the JS side only. The Go suite is the mirror consumer
of the same fixtures described below, for **every** hook covered by this contract — not
only `PreToolUse`.

#### Fixture family table

| Hook | Fixture prefix | Spawned script | Fixture floor | JS Go mirror test |
|---|---|---|---|---|
| `PreToolUse` | `pre-tool-use-*.json` | `scripts/hooks/pre-tool-use.js` | 4 | `TestPreToolUse_ParityFixtures` |
| `SubagentStop` | `subagent-stop-*.json` | `scripts/hooks/subagent-stop.js` | 4 | `TestSubagentStop_ParityFixtures` |

(Previously: `SubagentStop` fixture floor was 2, covering only the valid-envelope and
malformed-envelope fixtures; the phase-cost recording step (§REQ-hooks-001) adds two
required fixtures — one covering the active-change case and one covering the
no-active-change case, as separate fixture files following the existing one-case-per-
fixture pattern — bringing the floor to 4.)

#### Shared golden fixtures

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
- The new `subagent-stop-phase-cost-*` fixture family (§REQ-hooks-001) consists of two
  required fixture files — one for the active-change case and one for the
  no-active-change case — and MUST assert `continue: true` in `expectedStdout`
  byte-for-byte, exactly as the other `SubagentStop` fixtures, and MUST NOT assert the
  resulting `phase-costs.jsonl` content byte-for-byte (that file is a disposable
  session artifact, not stdout).

#### Fixture set governance

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
- **SubagentStop phase-cost fixture — new required family**: GIVEN two separate
  `subagent-stop-phase-cost-<case>.json` fixture files under
  `internal/testdata/parity/` — one covering the active-change case and one covering
  the no-active-change case, each a single fixture file per the existing
  one-case-per-fixture pattern — WHEN the JS parity suite runs THEN both runtimes MUST
  produce `continue: true` byte-for-byte identical stdout for each of the two fixtures.
- **SubagentStop fixture set shrinks below floor — suite fails fast**: GIVEN fewer than
  4 files matching `subagent-stop-*.json` exist under `internal/testdata/parity/` WHEN
  the JS parity suite loads that hook's fixtures THEN it MUST fail the assertion before
  running any per-fixture test for `SubagentStop`.

## Clarifications

### Session 2026-07-04

- Q: ¿Cuál es el floor correcto y el número de fixtures nuevos para la familia `subagent-stop-phase-cost-*` dado que se exigen casos active-change y no-active-change por separado? → A: Floor = 4 (2 fixtures existentes + 2 nuevos: un archivo para el caso active-change y otro para no-active-change, como archivos separados siguiendo el patrón un-caso-por-fixture).
