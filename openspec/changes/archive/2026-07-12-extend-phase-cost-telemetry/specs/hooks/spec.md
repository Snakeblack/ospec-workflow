# Delta for hooks

## MODIFIED Requirements

### Requirement: SubagentStop Per-Dispatch Phase Cost Recording {#REQ-hooks-001}

`SubagentStop` (JS and Go, with semantic parity across normalized fields) MUST append one normalized
estimated-cost record per `sdd-*` dispatch to
`.ospec/session/{change}/phase-costs.jsonl`, a sibling artifact of the existing
`.ospec/session/{change}/token-events.jsonl`. This step MUST run after the existing
Result Envelope Parse/Validate/Persist step (baseline §5.0) and MUST NOT alter its
outcome.

Each new record MUST contain `phase`, `agent`,
`estimated_prompt_tokens`, `estimated_artifact_tokens`,
`estimated_tool_output_tokens`, `estimated_output_tokens`, `duration_ms`,
`model_tier`, `status`, `relaunch`, and `ts`. `phase` MUST be the phase key obtained
by stripping the `sdd-` prefix from `agent`; `agent` MUST retain the resolved agent
name. The four token fields and `duration_ms` MUST be non-negative integer estimates.
`model_tier` MUST identify the observed tier from `models.yaml` or be `"unknown"`;
`status` MUST use the valid envelope status, the dispatch status fallback, or
`"unknown"`; `relaunch` MUST be boolean; and `ts` MUST be an ISO 8601 UTC
timestamp. New records MUST use `estimated_output_tokens`; `est_tokens` is a C3
legacy field accepted only when reading old records.

JS and Go MUST first normalize host-specific payloads into the same canonical
dispatch context. For each token category, a valid non-negative integer supplied by
the host MUST take precedence; when it is absent or invalid, the writer MUST apply
the shared UTF-8 per-segment heuristic `ceil(UTF-8 byte length / 4)` to the
corresponding canonical prompt, artifact, tool-output, or output segment. A missing
or invalid segment MUST produce `0`. `duration_ms` MUST come from the normalized
context and use `0` when absent or invalid. `model_tier` MUST be resolved from the
observed model through `models.yaml`, otherwise it MUST be `"unknown"`. `status`
MUST resolve in this order: valid envelope status, dispatch status fallback, then
`"unknown"`.

When an optional input is absent or invalid, the writer MUST preserve the complete
shape using `0` for each unavailable token category and `duration_ms`,
`"unknown"` for unavailable tier or status, and `false` for a relaunch that cannot
be confirmed. A token estimate MUST remain explicitly heuristic; it MUST NOT be
presented as exact tokenization or billing.

The hook MUST:
1. Resolve the active change using the same `findActiveChanges` selection logic
   already used elsewhere in this hook (baseline §5.0, §4.2). If no active change
   resolves, it MUST skip this step entirely and MUST NOT create `.ospec/session/`
   paths.
2. While holding the same advisory lock used for the append, mark the first
   successfully persisted dispatch for a `{change, phase}` pair with
   `relaunch: false` and every later successfully persisted dispatch for that pair
   with `relaunch: true`. A failed append MUST NOT consume the first position or
   change the relaunch value of a later successful append.
3. Append the record under the same advisory file-lock convention already used for
   `.ospec/runtime/subagent-events.jsonl` (baseline §5.3).
4. Include `.ospec/session/{change}/phase-costs.jsonl` in the on-disk artifact layout
   (baseline §7) as an additional `SubagentStop` row with append/advisory-lock mode.

This step MUST be strictly additive and fail-safe, mirroring the existing envelope-
persistence step (baseline §5.0): any error in change resolution, context
normalization, token estimation, relaunch detection, or file append MUST be caught,
MUST NOT affect `stdout` or the hook's `continue: true` output, and MUST NOT throw or
exit non-zero.

(Previously: C3 persisted one aggregate `est_tokens` estimate for the result payload,
without separate token categories, duration, model tier, or relaunch metadata.)

#### Scenario: Dispatch cost recorded with the complete shape

- GIVEN a subagent result resolves to `sdd-design` with `status: success` and an active change `add-x` exists
- AND the dispatch context supplies prompt 120, artifact 80, tool-output 30, output 240 estimated tokens, duration 18000 ms, and tier `premium`
- WHEN `SubagentStop` runs after envelope persistence
- THEN it appends one JSON line with `phase: "design"`, `agent: "sdd-design"`, all four token fields, `duration_ms: 18000`, `model_tier: "premium"`, `status: "success"`, `relaunch: false`, and an ISO 8601 UTC `ts`
- AND the hook's existing `skill_resolution` behavior and stdout output are unaffected

#### Scenario: Missing optional context uses explicit fallbacks

- GIVEN an active change resolves for an `sdd-*` dispatch whose token, duration, tier, status, and relaunch context is absent or invalid
- WHEN `SubagentStop` persists the phase-cost record
- THEN it still writes every required field with zero token/duration values, `model_tier: "unknown"`, `status: "unknown"`, and boolean `relaunch: false`
- AND the record remains parseable JSON without changing the hook result

#### Scenario: A repeated dispatch is marked as a relaunch

- GIVEN `.ospec/session/add-x/phase-costs.jsonl` already contains one recorded dispatch for phase `apply`
- WHEN `SubagentStop` records another `sdd-apply` dispatch for the same active change
- THEN the new row contains `relaunch: true` while retaining the complete normalized shape

#### Scenario: No active change — skip, no file created

- GIVEN no active OpenSpec change resolves in the workspace
- WHEN `SubagentStop` runs
- THEN it MUST NOT create `.ospec/session/` or write any `phase-costs.jsonl` file
- AND processing continues unchanged to the existing `skill_resolution` behavior

#### Scenario: Estimation or write failure — fail-safe, no crash

- GIVEN context normalization, estimation, relaunch detection, or the JSONL append throws (for example, a filesystem error)
- WHEN `SubagentStop` attempts to persist the phase-cost record
- THEN the hook MUST catch the error, MUST NOT propagate it, MUST NOT set a non-zero exit code, and MUST still output `{"continue":true}` or the existing degraded `systemMessage`

### Requirement: Go/JS Executable Parity Contract (E1)

The Go port of the hooks (`internal/hooks/*.go`, `cmd/ospec-hooks/`) is an out-of-domain
mirror consumer: its sources are not listed in this domain's manifest globs, so this
spec documents the contract from the JS side only. The Go suite is the semantic mirror
consumer of the same fixtures described below, for **every** hook covered by this
contract — not only `PreToolUse`. Persisted phase-cost rows MUST match on every
normalized field except `ts`; `ts` MUST independently be valid ISO 8601 UTC, and JSON
member order MUST NOT be part of the parity contract.

(Previously: parity fixtures compared hook stdout, while phase-cost fixtures did not
assert the persisted record's shape or values.)

#### Fixture family table

| Hook | Fixture prefix | Spawned script | Fixture floor | JS Go mirror test |
|---|---|---|---|---|
| `PreToolUse` | `pre-tool-use-*.json` | `scripts/hooks/pre-tool-use.js` | 4 | `TestPreToolUse_ParityFixtures` |
| `SubagentStop` | `subagent-stop-*.json` | `scripts/hooks/subagent-stop.js` | 4 | `TestSubagentStop_ParityFixtures` |

(Previously: `SubagentStop` fixture floor was 2, covering only the valid-envelope and
malformed-envelope fixtures; the C3 phase-cost recording step added two required
fixtures — one active-change and one no-active-change case — bringing the floor to 4.)

#### Shared golden fixtures

Given `internal/testdata/parity/*.json` fixture files (each holding `description`,
`stdin`, and `expectedStdout`),
When either implementation's parity test suite runs,
Then, for each hook in the fixture family table:
- The JS suite (`scripts/hooks/parity-contract.test.js`) MUST spawn the real spawned
  script via `child_process.spawnSync`, with all `DISABLE_*` bypass env vars stripped,
  against each fixture's `stdin` and assert the process exits 0.
- The JS suite MUST assert that the hook's fixture set contains at least the fixture
  floor listed in the table; the set MUST NOT shrink below it.
- For every fixture EXCEPT a documented fail-open fixture, the JS suite MUST assert
  `actual === expectedStdout` byte-for-byte.
- For a documented fail-open fixture (identified for `PreToolUse` by
  `permissionDecisionReason` starting with `"The safety hook could not inspect this
  tool call:"`; for `SubagentStop` by a fixture with a missing/malformed
  `json:result-envelope` fence), the JS suite MUST compare stable,
  implementation-independent fields exactly and MUST assert only a stable prefix for
  implementation-specific message text.
- For each active-change `SubagentStop` phase-cost fixture, both runtimes MUST also
  write one phase-cost row with the required normalized field names and equal values
  for `phase`, `agent`, all four token fields, `duration_ms`, `model_tier`, `status`,
  and `relaunch`. The `ts` field MUST be valid ISO 8601 UTC in both rows; it MAY be
  excluded from row comparison when generated dynamically, and JSON member order MUST
  NOT be compared. Shared UTF-8 inputs MUST produce equal estimates in both runtimes.
  The phase-cost fixture family MUST contain two separate files: one active-change
  case and one no-active-change case.

#### Fixture set governance

Adding a fixture under `internal/testdata/parity/` extends the contract for both
runtimes simultaneously (both suites read the same directory). A parity mismatch MUST
NOT be resolved by editing only the fixture: the canonical behavior MUST be decided
first, the lagging implementation changed to match, and the fixture updated only if
the contract itself changed.

#### Scenarios

- **Byte-for-byte match on a DENY fixture**: GIVEN `pre-tool-use-deny.json` fixture with
  `stdin: {"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}` WHEN the JS
  parity suite runs THEN the spawned hook's stdout MUST equal `expectedStdout` exactly.
- **Parse-error fixture — prefix-only comparison**: GIVEN a fixture whose
  `expectedStdout` reason starts with `"The safety hook could not inspect this tool
  call:"` WHEN the JS parity suite runs THEN it MUST assert `hookEventName` and
  `permissionDecision` exactly AND only a shared prefix on the reason string.
- **PreToolUse fixture set shrinks below floor — suite fails fast**: GIVEN fewer than
  4 files matching `pre-tool-use-*.json` exist under `internal/testdata/parity/` WHEN
  the parity suite loads `PreToolUse` fixtures THEN it MUST fail before per-fixture tests.
- **SubagentStop valid-envelope fixture — byte-for-byte match**: GIVEN
  `subagent-stop-valid-envelope.json` carries a valid `json:result-envelope` fence
  WHEN the parity suite runs THEN the spawned `subagent-stop.js` stdout MUST equal
  `expectedStdout` exactly, including any degraded-resolution `systemMessage`.
- **SubagentStop malformed-fence fixture — fail-open**: GIVEN
  `subagent-stop-malformed-envelope.json` has a fence that fails schema validation
  WHEN the parity suite runs THEN it MUST assert `continue: true` and MUST NOT assert
  that a `state.yaml` write occurred.
- **SubagentStop active phase-cost fixture — normalized parity**: GIVEN the shared
  active-change fixture contains a UTF-8 dispatch with deterministic context values
  WHEN JS and Go parity suites run THEN both MUST emit `continue: true` byte-for-byte
  and equivalent normalized phase-cost fields, including zero fallbacks where context
  is intentionally absent, while `ts` is checked only for ISO 8601 UTC validity and
  JSON member order is ignored.
- **SubagentStop no-active-change fixture — no side effect**: GIVEN the no-active-change
  fixture resolves no OpenSpec change WHEN both runtimes run THEN both MUST emit
  `continue: true` byte-for-byte and MUST NOT create a phase-cost file.
- **SubagentStop fixture set shrinks below floor — suite fails fast**: GIVEN fewer than
  4 files matching `subagent-stop-*.json` exist under `internal/testdata/parity/` WHEN
  the parity suite loads `SubagentStop` fixtures THEN it MUST fail before per-fixture tests.

## Clarifications

### Session 2026-07-11

- Q: ¿Qué contrato y precedencia debe usar `SubagentStop` para normalizar contexto, tokens, duración, tier y status entre hosts? → A: JS y Go usan un contexto canónico con precedencia explícita; los enteros del host tienen prioridad y la heurística UTF-8 por segmento es el fallback; el tier se resuelve desde `models.yaml` y el status sigue envelope → dispatch → `unknown`.
- Q: ¿Qué debe contar como `relaunch` ante concurrencia o fallo de escritura? → A: Se decide bajo el mismo advisory lock por `{change, phase}`; la primera fila persistida es `false`, las siguientes `true`, y un append fallido no cuenta.
- Q: ¿Qué nivel de paridad JS/Go es normativo para `phase-costs.jsonl`? → A: La paridad es semántica para todos los campos salvo `ts`, que sólo debe ser ISO 8601 UTC; el orden JSON no es contrato.

---
