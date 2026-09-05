# Delta for hooks

## MODIFIED Requirements

### Requirement: SubagentStop Per-Dispatch Phase Cost Recording {#REQ-hooks-001}

`SubagentStop` (JS and Go, with semantic and byte-parity across normalized fields) MUST append one normalized estimated-cost record per supported dispatch to `.ospec/session/{change}/phase-costs.jsonl`, after the existing Result Envelope Parse/Validate/Persist step and without altering its outcome. Supported dispatches are every `sdd-*` agent and exactly these review lifecycle agents: `review-change`, `review-trust`, `review-runtime`, `review-evolution`, `review-efficiency`, and `review-correction`. Arbitrary `review-*` names MUST be unsupported and MUST NOT write a phase-cost record.

Each new record MUST contain `phase`, `agent`, `estimated_prompt_tokens`, `estimated_artifact_tokens`, `estimated_tool_output_tokens`, `estimated_output_tokens`, `duration_ms`, `model_tier`, `status`, `relaunch`, and `ts`. Supported dispatch classification and the recorded `agent` value MUST be derived through the shared canonical agent resolution (agent-identity): the emitter MUST resolve the registered agent name — tolerating a host/plugin prefix — and MUST record the resolved canonical agent in `agent`. For `sdd-*`, `phase` MUST remain the key obtained by stripping `sdd-` from the canonical agent; for an allowlisted review agent, `phase` MUST be the exact allowlisted agent name. An `unresolved` name MUST NOT produce a phase-cost record. The four token fields and `duration_ms` MUST be non-negative integer estimates; `model_tier`, `status`, `relaunch`, and `ts` MUST retain their existing normalization and fallback semantics. New records MUST use `estimated_output_tokens`; `est_tokens` is accepted only when reading old records.

JS and Go MUST first normalize host-specific payloads into the same canonical dispatch context. For each token category, a valid non-negative integer supplied by the host MUST take precedence; when absent or invalid, the writer MUST apply the shared UTF-8 per-segment heuristic `ceil(UTF-8 byte length / 4)` to the corresponding canonical prompt, artifact, tool-output, or output segment. A missing or invalid segment MUST produce `0`. `duration_ms` MUST come from the normalized context and use `0` when absent or invalid. `model_tier` MUST be resolved from the observed model through `models.yaml`, otherwise it MUST be `"unknown"`. `status` MUST resolve in this order: valid envelope status, dispatch status fallback, then `"unknown"`.

When optional input is absent or invalid, the writer MUST preserve the complete shape using `0`, `"unknown"`, and `false` fallbacks. The hook MUST resolve the active change with its existing selection logic; append under its existing advisory lock; calculate relaunch only from prior successful records for the same `{change, phase}`; and include the artifact in the on-disk layout. This addition MUST be strictly additive and fail-safe: an error in agent resolution, review-agent classification, normalization, estimation, relaunch detection, or append MUST be caught, MUST NOT affect stdout or `continue: true`, and MUST NOT throw or exit non-zero.

(Previously: `agent` and dispatch classification used raw-name/prefix-string matching via per-site `derivePhaseKey`/`canonicalAgentPhase` logic; prefixed registered names failed recognition.)

#### Scenario: Allowlisted quality specialist is recorded identically

- GIVEN an active change and a `review-runtime` dispatch with valid normalized context
- WHEN JS and Go persist phase cost
- THEN both MUST append byte-identical records with `phase` and `agent` equal to `review-runtime`
- AND existing `sdd-design` phase-key behavior MUST remain `design`

#### Scenario: Missing optional context uses explicit fallbacks

- GIVEN an active change resolves for an allowlisted review or `sdd-*` dispatch whose token, duration, tier, status, and relaunch context is absent or invalid
- WHEN `SubagentStop` persists the phase-cost record
- THEN it MUST still write every required field with zero token/duration values, `model_tier: "unknown"`, `status: "unknown"`, and boolean `relaunch: false`
- AND the record MUST remain parseable JSON without changing the hook result

#### Scenario: A repeated dispatch is marked as a relaunch

- GIVEN `.ospec/session/add-x/phase-costs.jsonl` already contains one recorded dispatch for phase `review-correction`
- WHEN `SubagentStop` records another `review-correction` dispatch for the same active change
- THEN the new row MUST contain `relaunch: true` while retaining the complete normalized shape

#### Scenario: No active change — skip, no file created

- GIVEN no active OpenSpec change resolves in the workspace
- WHEN `SubagentStop` runs
- THEN it MUST NOT create `.ospec/session/` or write any `phase-costs.jsonl` file
- AND processing MUST continue unchanged to the existing `skill_resolution` behavior

#### Scenario: Retired 4R agent name is ignored fail-safely

- GIVEN an active change and an agent named `review-reliability`
- WHEN `SubagentStop` classifies the dispatch under the allowlist and canonical resolution
- THEN it MUST NOT append a phase-cost record
- AND it MUST continue existing envelope and skill-resolution behavior without error

#### Scenario: Arbitrary review name is ignored fail-safely

- GIVEN an active change and an agent named `review-invented`
- WHEN `SubagentStop` classifies the dispatch
- THEN it MUST NOT append a phase-cost record
- AND it MUST continue existing envelope and skill-resolution behavior without error

#### Scenario: Estimation or write failure — fail-safe, no crash

- GIVEN context normalization, agent resolution, review-agent classification, estimation, relaunch detection, or the JSONL append throws
- WHEN `SubagentStop` attempts to persist the phase-cost record
- THEN the hook MUST catch the error, MUST NOT propagate it, MUST NOT set a non-zero exit code
- AND it MUST still output `{\"continue\":true}` or the existing degraded `systemMessage`

#### Scenario: Host-prefixed sdd name is recognized and recorded canonically

- GIVEN an active change and a dispatch whose registered agent name is `plugin-host:sdd-spec`
- WHEN JS and Go resolve the name through the shared canonical resolution
- THEN both MUST append a record with `agent: "sdd-spec"` and `phase: "spec"`
- AND the row values MUST equal the values emitted today for the unprefixed name `sdd-spec` (regression guard for the previously unrecognized prefixed name)

#### Scenario: Unprefixed names remain byte-compatible (O1 attestation)

- GIVEN an unprefixed registered name that today yields specific `phase` and `agent` values
- WHEN the emitter uses canonical resolution instead of raw matching
- THEN the emitted `phase` and `agent` MUST be identical to today's values
- AND existing O1 rows and attestations MUST remain valid without migration
