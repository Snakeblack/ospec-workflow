# lifecycle-kernel-runtime Specification

## Purpose

Specify the phase completion reducer (`scripts/lib/lifecycle-kernel/phase-completion-reducer.js`),
the pure projection of phase results into `state.yaml` that `ospec-state` uses.
The K2 lifecycle runtime this domain also described (status derivation,
transitions, permits, budgets and recovery) was retired in E1.5 (v2.97.0).

## Requirements

### Requirement: PhaseCompletionReducer Pure State Reduction {#REQ-lifecycle-kernel-028}

The lifecycle kernel runtime MUST provide a pure `PhaseCompletionReducer` function that computes next change state (`state.yaml` and lifecycle state nodes) from current normalized state and a validated phase completion payload (`result-envelope/v1`). The reducer MUST be deterministic and pure: given identical current state and envelope payload, it MUST return identical projected state, ordered journal entries, and explicit effect intents. The reducer MUST NOT execute filesystem or clock I/O directly, and MUST NOT infer or fabricate uncommitted gate approvals, decisions, or phase advances.

When processing completion payloads for the `verify` phase, the reducer MUST condition advancing top-level `status` to `"verified"` exclusively on the explicit presence of a positive `verify_outcome` (`PASS` or `PASS WITH WARNINGS`). If `phase` is `"verify"` and `verify_outcome` is `"FAIL"`, absent, undefined, or unallowlisted, the reducer MUST NOT set `status: "verified"`; it MUST project top-level `status: "blocked"` and record the verification failure in `blocking_questions`, regardless of whether the outer envelope status is `"success"`.

(Previously: PhaseCompletionReducer defaulted the verify phase to status: verified whenever envelope status was success unless an explicit FAIL outcome was recognized, projecting verified even when verify_outcome was omitted.)

#### Scenario: Reducer computes valid phase advance from success envelope

- GIVEN a valid current change state in phase `design`
- AND a validated `result-envelope/v1` payload with `status: "success"`, summary, and artifacts
- WHEN `PhaseCompletionReducer` executes
- THEN it MUST project `phases.design.status: "done"`, `phases.design.summary`, and `phases.design.artifacts`
- AND MUST advance the lifecycle node without fabricating downstream phase completions

#### Scenario: Reducer projects blocked status with questions and blocker metadata

- GIVEN a current change state in phase `apply`
- AND a validated `result-envelope/v1` payload with `status: "blocked"`, `question_gate`, and `blocker_type`
- WHEN `PhaseCompletionReducer` executes
- THEN top-level state MUST become `status: "blocked"`
- AND `blocking_questions` MUST capture the gate questions without advancing phase status to `done`

#### Scenario: Reducer rejects synthetic gate passes and uncommitted approvals

- GIVEN an envelope payload asserting gate passage or user approvals not present in current state
- WHEN `PhaseCompletionReducer` evaluates the payload
- THEN it MUST reject the unverified approval assertion
- AND MUST NOT commit synthetic gate passes to projected state

#### Scenario: Reducer advances to verified only with positive explicit verify_outcome

- GIVEN a current change state in phase `verify`
- AND a validated envelope with `status: "success"` and `verify_outcome: "PASS"` or `"PASS WITH WARNINGS"`
- WHEN `PhaseCompletionReducer` executes
- THEN `phases.verify.status` MUST be `"done"`
- AND top-level state MUST become `status: "verified"`

#### Scenario: Reducer projects blocked when verify_outcome is FAIL or omitted

- GIVEN a current change state in phase `verify`
- AND an envelope with `status: "success"` where `verify_outcome` is `"FAIL"`, omitted, or invalid
- WHEN `PhaseCompletionReducer` executes
- THEN top-level state MUST become `status: "blocked"`
- AND `blocking_questions` MUST capture the verification failure reason
### Requirement: CAS and Replay Determinism for Phase State Projection {#REQ-lifecycle-kernel-029}

State projections produced by `PhaseCompletionReducer` and committed to durable storage MUST enforce Compare-And-Swap (CAS) revision matching under advisory file locking (`withFileLock`). Replaying an identical phase completion payload against an already projected state MUST be idempotent: the kernel runtime MUST detect the replay through payload hashing or journal matching and return the converged state without advancing revision counters or duplicating journal records.

When a durable state record stores a payload hash produced by the v2.67.0–v2.67.3 frozen-key-order serialization of an already committed completion payload, the runtime MUST treat a replay of that same payload as a zero-delta idempotent convergence in both Node and Go only when the envelope's key order matches the frozen contract: `schema_version` first on the top-level envelope, with nested `question_gate` / question / option key orders already pinned by that contract. Recognition of that historical hash form MUST NOT bump `revision`, MUST NOT re-apply state mutations, and MUST NOT append duplicate journal records. The runtime MUST also continue to recognize the current canonical payload hash as an identical zero-delta replay.

A payload that is semantically equal to a prior completion but whose insertion/key order differs from the frozen v2.67.0–v2.67.3 contract MUST NOT be promised as a legacy noop solely by that semantic equality; its hash MUST NOT match the frozen legacy digest unless the frozen order is used. The runtime MUST NOT require preserving original JSON bytes of historical envelopes. A payload whose stored hash matches neither the current canonical form nor the frozen v2.67.0–v2.67.3 key-order form MUST NOT be treated as that prior completion's replay solely on hash equality.

(Previously: Accepted any v2.67.0–v2.67.3 insertion-order `JSON.stringify` hash as a zero-delta noop without limiting the promise to the frozen key order, so a semantically equal envelope with a different insertion order could be treated as compatibility.)

#### Scenario: Concurrent projection conflict triggers CAS conflict rejection

- GIVEN a projection commit attempt with expected revision R
- WHEN storage head revision has advanced to R+1 due to a concurrent write
- THEN the commit MUST fail closed with a CAS conflict
- AND authoritative state MUST remain unchanged

#### Scenario: Replaying identical phase completion payload produces zero-delta idempotent convergence

- GIVEN a change state that already committed completion payload P under the current canonical hash
- WHEN the runtime reconciles or replays payload P
- THEN the runtime MUST recognize the completed operation
- AND MUST NOT re-execute state mutations or append duplicate journal records
- AND MUST NOT advance `revision`

#### Scenario: v2.67 frozen-key-order hash replay is a zero-delta noop in Node and Go

- GIVEN durable state that already committed completion payload P with a stored hash from the v2.67.0–v2.67.3 frozen-key-order form (`schema_version` first; nested `question_gate`/question/option orders pinned)
- WHEN the Node runtime and the Go runtime each reconcile or replay the same payload P in that frozen key order
- THEN both runtimes MUST recognize the completed operation as a zero-delta replay
- AND MUST NOT bump `revision`, re-apply mutations, or append duplicate journal records

#### Scenario: Semantically equal envelope with different key order is not a promised legacy noop

- GIVEN durable state that records the frozen v2.67.0–v2.67.3 key-order hash for payload P
- AND a semantically equal envelope P′ whose top-level or nested key insertion order differs from that frozen contract
- WHEN the runtime evaluates P′ for legacy noop recognition
- THEN it MUST NOT treat P′ as a promised v2.67 legacy zero-delta replay solely because it is semantically equal to P
- AND MUST NOT require that original historical JSON bytes of P be preserved

#### Scenario: Unrelated payload hash is not treated as prior completion replay

- GIVEN durable state that records a completion hash for payload P
- AND a distinct completion payload Q whose hash matches neither the current canonical hash of P nor the frozen v2.67.0–v2.67.3 key-order hash of P
- WHEN the runtime evaluates Q against that stored record
- THEN it MUST NOT treat Q as an idempotent replay of P solely by hash equality

#### Scenario: Recovery from interrupted write restores valid state without corruption

- GIVEN an interrupted write during state projection
- WHEN the runtime initializes or re-executes projection
- THEN it MUST recover from backup (`.bak`) or journal state safely
- AND MUST restore a consistent, non-corrupted state

### Requirement: Legacy Envelope Adapter and Normalization {#REQ-lifecycle-kernel-030}

The lifecycle kernel runtime MUST provide a legacy envelope adapter that normalizes unversioned fenced `json:result-envelope` blocks and legacy prose-adjacent envelopes into canonical `result-envelope/v1` payloads before invocation of `PhaseCompletionReducer`. The adapter MUST map legacy fields (`executive_summary`, `summary`, `key_decisions`, `status`, `next_recommended`) accurately, assign `schema_version: 1`, and fail-safely reject unparseable payloads without corrupting kernel state.

#### Scenario: Adapter normalizes unversioned fenced envelope to v1 payload

- GIVEN a subagent return containing an unversioned `json:result-envelope` fence
- WHEN the legacy envelope adapter processes the input
- THEN it MUST extract field values and produce a valid `result-envelope/v1` structure
- AND assign `schema_version: 1`

#### Scenario: Adapter normalizes legacy prose-adjacent envelope

- GIVEN a phase return lacking a JSON fence but carrying standard plain-prose envelope lines
- WHEN the adapter processes the return
- THEN it MUST extract status, summary, and artifacts into canonical `result-envelope/v1` format
- AND pass the normalized payload to `PhaseCompletionReducer`

#### Scenario: Malformed legacy payload is rejected fail-safely

- GIVEN an unparseable or completely missing envelope payload
- WHEN the adapter attempts normalization
- THEN it MUST return a structured validation error without throwing
- AND the kernel MUST NOT mutate authoritative state

### Requirement: Phase Projection Without SubagentStop {#REQ-lifecycle-kernel-031}

Cursor, Antigravity, OpenCode and VS Code have no `SubagentStop`, and the hook skips a workspace with more than one active change, so a phase could finish without `state.yaml` ever learning it and `sdd-archive` could never see `phases.verify.verdict`. `scripts/phase-completion-run.js <change> --phase <phase> --envelope-file <file> [--workspace <path>]` MUST project a phase through the same `projectPhaseCompletion` the hook uses. `--phase` takes the phase key or its `sdd-*` agent, plain or host-prefixed; a review agent or any other name is a usage error. The file holds the subagent's final message, read like the hook reads `last_assistant_message` (REQ-hooks-033), or the bare envelope JSON. The runner MUST validate the envelope for that phase before projecting, MUST print one JSON line with `change`, `phase`, `ok` and `outcome` (`advanced`, `blocked`, `noop-replay`, `no-envelope`, `invalid-envelope` with its `errors`, `unreadable-envelope-file`, or the projection's failure, such as `malformed-state`, with its `error`), and MUST exit 0 only when `ok` is true. A usage error exits 1 with the usage on stderr. Nothing but a successful projection changes `state.yaml`. A file under `.ospec/` leaves `.ospec/.gitignore` in place (REQ-hooks-028). The orchestrator runs it after every phase on every host; where `SubagentStop` already projected the same envelope, the replay hash (REQ-lifecycle-kernel-029) makes it a `noop-replay`. Phase skills never write `phases.*`.

- GIVEN a `ready-for-verify` change and a file with the `sdd-verify` final message whose envelope says `verify_outcome: PASS` THEN the runner MUST exit 0 with `advanced`, `state.yaml` MUST hold `status: verified` and `phases.verify.verdict: "PASS"`, and the archive gate MUST read the verdict as satisfied.
- GIVEN the same file again THEN the outcome MUST be `noop-replay` and `state.yaml` MUST be byte for byte the same.
- GIVEN an envelope with an invalid `status`, or a message with no envelope THEN the runner MUST exit 1 with `invalid-envelope` or `no-envelope` and `state.yaml` MUST be unchanged.
- GIVEN a `state.yaml` the projector refuses THEN the runner MUST exit 1 with `malformed-state`.
- GIVEN an unsafe change name, a missing `--phase` or `--envelope-file`, or `--phase review-trust` THEN the runner MUST exit 1 without touching `state.yaml`.

### Requirement: The Projector Tolerates Block And Multi-Line Scalars {#REQ-lifecycle-kernel-032}

The Node and Go projectors (`scripts/lib/ospec-state.js`, `internal/hooks/phase-completion-reducer.go`) write `state.yaml` line by line, yet a block scalar (`|` or `>`, with chomping and indentation indicators) or a plain or quoted scalar that starts on its key's line and continues on more indented lines is valid YAML a human or an agent may write, for example `route_rationale: >`. Both projectors MUST treat those continuation lines as opaque: validation MUST accept them, parsing MUST NOT read a key inside them, and projection MUST leave them byte for byte. A key the projector rewrites (`status`, `last_updated`, `revision` or a projected phase field) MUST lose its continuation lines and be written on one line; the parser reads its one-line form, the continuation joined by single spaces. A quoted scalar that never closes, or whose continuation is not more indented than its key, MUST still be `malformed-state`, as MUST a tab on any line. A value that starts on the line after its key is not supported. Only lines at exactly four spaces under a phase are phase fields, and a blank line never ends a phase block.

- GIVEN `route_rationale: >` with a content line `status: …`, a plain and a double- and single-quoted scalar over two lines, and a phase field `notes: |` whose content holds `status: fake` and `summary: fake` THEN a projection MUST succeed and leave all of them byte for byte.
- GIVEN `status: >` over two lines, `last_updated` as a two-line quoted scalar and `phases.design.summary: |` THEN after a design projection each MUST be on one line, with no trace of their old continuation.
- GIVEN `summary: "unterminated` at the end of the file, or `summary: 'open` followed by a less indented line THEN the projection MUST fail with `malformed-state` and leave the bytes unchanged.

### Requirement: No State Reader Reads Inside A Scalar {#REQ-lifecycle-kernel-033}

Every line reader of a change's `state.yaml` MUST skip the continuation lines that REQ-lifecycle-kernel-032 admits, with the same scan the projectors use (`scripts/lib/yaml-lite.js`, `internal/yamllite`): the archive gate facts and lineages (`scripts/lib/archive-transaction.js`), the persisted route and the classification and impact of the dispatcher (`scripts/lib/route-dispatcher.js`, `scripts/route-dispatch-run.js`), the change status (`readStatus` in Node, `store.ReadStatus` in Go), the YAML-lite reader of the hooks (`scripts/hooks/pre-compact.js`, `internal/yamllite`) and the active change of the token budget in PreToolUse. A key written inside a scalar MUST read as absent. A tag or an anchor before a value (`!!str |`, `&a >-`, `!!str "…`) does not change its kind, and a flow collection that continues on more indented lines is opaque until its brackets close; one that never closes is malformed like an unclosed quoted scalar, for the projectors (`malformed-state`) and for the archive gate. A value that starts on the line after its key, which the projectors still refuse, is opaque to the readers with its key's line as owner, nested `- - ` items and a value of only tags or anchors (`notes: !!str` followed by `|`) included. A line that opens a flow collection is a value even when its first line looks like an entry (`{x: 1,`). The scan reads a key as YAML does, quoted (`"a: b": |`) or plain up to the first colon a space, a tab or the end of the line follows, so `verdict:PASS` and a colon followed by a Unicode space are text, never a key, in Node as in Go, and it scans any line in linear time. The archive gate reads `verdict` only as a phase field, at exactly four spaces under `phases.verify`. A value that continues on more indented lines is read from its key's line alone. A `state.yaml` with a quoted scalar that never closes MUST NOT satisfy the archive gates; the other readers read the lines after the error as they are. The active change of the PreToolUse token budget is the first whose status reads `active`, never one whose file merely holds the text `status: active`.

- GIVEN `phases.verify.verdict: "FAIL"` and a `notes: |` whose content holds `verdict: PASS`, or failed quality gates and an approval whose block scalar holds `gate: quality-gates` and `decision: override` THEN the archive gates MUST NOT be satisfied.
- GIVEN `summary: "never closes` before `phases.verify.verdict: PASS` THEN the archive gates MUST NOT be satisfied.
- GIVEN `verdict: "FAIL"` and a later `notes: !!str |`, `notes: &a >-`, `notes: !!str "…` or `notes: [one,` whose continuation holds `verdict: PASS` THEN the Node and Go readers MUST read `FAIL`; GIVEN `notes: [one,` followed by a less indented line THEN the archive gates MUST NOT be satisfied and a projection MUST fail with `malformed-state`.
- GIVEN `verdict: "FAIL"` and a later `notes:` whose next line opens `|`, `>`, a double-quoted scalar or `- - |` holding `verdict: PASS` THEN the Node and Go readers MUST read `FAIL` and the archive gates MUST NOT be satisfied.
- GIVEN `verdict: "FAIL"` and a later `notes: text` continued by `verdict:PASS`, `notes:` followed by `classification:trivial`, `"k: v": |` holding `verdict: PASS`, or `notes: !!str` followed by `|` holding `verdict: PASS` THEN no reader MUST read the inner key, in Node and in Go, and a `verdict` nested deeper than a phase field MUST NOT count for the archive gate.
- GIVEN failed quality gates and an approval whose `reason:` opens on the next line a flow mapping `{x: 1,` holding `gate: quality-gates` and `decision: override`, or whose plain multi-line `reason` holds `decision:<NBSP>override` THEN the archive gates MUST NOT be satisfied, in Node and in Go; GIVEN a line of 200,000 spaces between two characters THEN the scan MUST finish in well under a second.
- GIVEN a block scalar holding `status: archived` before `status: active`, or under a `change:` mapping before its `status: active` THEN the Node and Go readers MUST read `active` and the hooks MUST keep the change active.
- GIVEN a block scalar holding `classification: trivial` and `auth_security: true` before `classification: high`, or a `route:` whose block scalar holds `actual_route: dev` THEN the dispatcher MUST read `high`, no impact, and only the direct `actual_route`.
- GIVEN a done change whose file holds `status: active` inside a block scalar or as a phase field, and an active change THEN PreToolUse MUST pick the active change, in Node and in Go.

### Requirement: No Configuration Reader Reads Inside A Value {#REQ-lifecycle-kernel-034}

Every line reader of `openspec/config.yaml` MUST skip the lines of a value with the scan of REQ-lifecycle-kernel-033 (`scripts/lib/yaml-lite.js`, `internal/yamllite`), or read its key path with `readYamlScalar`, which counts only the direct child of each section: the artifact store backend (`readBackendMode` and the hooks launcher), the baseline state (`readBaselineState` in Node, `store.ReadBaselineState` in Go), the routing table, the route defaults (`extractConfigDefaults`), the quality review attribution override, the declared capabilities and the SDD team profile. A key written inside a value MUST read as absent, and a value that continues on more indented lines is read from its key's line alone. The route defaults `project.status`, `baseline.status` and `artifact_store.backend` are the direct child of their top-level section. A value of the attribution override written on more lines (a block scalar, a multi-line quoted or flow scalar, a value on the line after its key) MUST leave the override invalid, with an error that names the field, and the keys inside it MUST NOT count. With a quoted scalar or a flow collection that never closes, the readers read the lines after the error as they are. These readers, `readYamlScalar` and the scan MUST read any line in linear time, a long run of spaces inside a value or a flow mapping included, also when a lone CR, a U+2028 or another space follows it: where Go has `.`, their patterns take any character but a line feed, so Node reads such a line as Go does, a block scalar header whose comment holds a lone CR, U+2028 or U+2029 and a quoted key with a backslash before one included.

- GIVEN `artifact_store:` with a `notes: |` holding `backend: workspace-federated` before `backend: openspec` THEN `readBackendMode` and the hooks launcher MUST read `openspec`, and the launcher MUST keep the native binary for `session-start`.
- GIVEN a `domains_done` item `- |` whose content holds `- fake` THEN the Node and Go baseline readers MUST NOT list `fake`.
- GIVEN a route whose `conditions:` holds `note: |` with `auth_security: true` inside, or a phase item `- |` holding `- fake` THEN the routing table MUST NOT hold that condition or that phase.
- GIVEN a `project:` section with a block scalar holding `status: archived` before `status: paused`, and a `subbaseline:` section with `status: pending` THEN the route defaults MUST be `paused` and `done`; GIVEN a `project:` section of fifteen indented lines without `status` THEN they MUST be read in well under a second.
- GIVEN an attribution override whose `justification: |` holds `scope:` and `- "**"`, or whose justification is only `|` THEN the override MUST be invalid, its scope MUST stay the declared one and an error MUST say `justification must be written on one line`.
- GIVEN a capability with a `notes: |` before its `version`, or a `team:` whose block scalar holds `size: multi-team` beside `size: solo` THEN the capability MUST keep its version and the team size MUST be `solo`.
- GIVEN a value or a one-line flow mapping holding 100,000 spaces between two characters, or followed by `b`, a lone CR and `c`, by `b`, U+2028 and `c`, or by `b c`, or a value of 50,000 ` #` pairs followed by a lone CR or U+2028 THEN every reader MUST finish in well under a second, and a comment on a line without them MUST still be stripped. GIVEN `a: b` CR `c` or `k: v` U+2028 `w` followed by a more indented line THEN Node and Go MUST keep the key's line and blank the next one; GIVEN `test: | # c` with a lone CR, U+2028 or U+2029 and `x`, or the key `"a\` CR `b": |`, followed by `lint: x` THEN Node and Go MUST read a block scalar and blank `lint: x`, and `idd/config.yaml` MUST refuse it with `config-invalid`.

### Requirement: State Readers Read In Linear Time And Node And Go Agree On White Space {#REQ-lifecycle-kernel-035}

The line readers of a change's `state.yaml` (`readStatus` and the parser, validator and writer of the Node projector in `scripts/lib/ospec-state.js`, `extractStateRouteInfo`, `parsePersistedRouteSection` and the YAML-lite reader of `scripts/hooks/pre-compact.js`) MUST read any line in linear time, a long run of spaces right after a key's colon or of ` #` pairs included, also when a lone CR or a U+2028 follows it: where Go has `.`, their patterns take any character but a line feed, so Node reads a lone CR inside a value as part of it, as Go does. The scan of REQ-lifecycle-kernel-032 to -034, in Node and in Go, trims a line or a value only of the space and the tab of YAML and the CR of a line break: a line of only those is blank, and U+0085, U+FEFF, U+00A0 and every other Unicode space are text. Both scans MUST leave the same lines opaque over the corpus `internal/testdata/yaml-lite-scan/cases.json`, which `scripts/lib/yaml-lite.test.js` and `internal/yamllite/yamllite_test.go` share. The validator, parser and writer of both projectors, and the state readers that pick a status or a field (`readStatus` and the pre-compact reader in Node, the YAML-lite reader of `internal/yamllite` behind `store.ReadStatus` in Go), read a line, a key and a value the same way: trimmed like the scan, a mapping line split at its first colon, spaces and tabs counted as indentation (a tab is malformed anywhere but in a comment), and a comment after ASCII white space. `readStatus` is that reader's `change.status`, else the first top-level `status`, lower-cased one code point at a time as `store.ReadStatus` does (U+0130 gives a plain `i` and a final capital sigma U+03C3, in both runtimes). The projectors refuse a line the scan reads as no key (a value on the line after its key, or a colon that a space or a tab does not follow), which no reader reads either; in them `change` and `status` hold a non-empty scalar and `phases` holds nothing on its line, a comment or an empty quoted scalar included. The readers MUST read the same status, and the projectors MUST reach the same outcome and write the same bytes, over the corpus `internal/testdata/state-projection/cases.json`, which `scripts/lib/ospec-state.test.js` and `internal/hooks/phase-completion-reducer_test.go` share. The phase statuses that `pre-compact.js` reads to resolve the current phase skip the lines of a value, as REQ-lifecycle-kernel-033 requires.

- GIVEN `status`, `classification`, `actual_route`, an approval `id`, a phase field or a pre-compact field whose value holds a run of 20,000 to 60,000 spaces right after its colon followed by `b`, a lone CR and `c`, or by `b`, U+2028 and `c`, or a run of ` #` pairs followed by a lone CR THEN every reader and a projection MUST finish in well under a second; GIVEN `status: a` CR `b` THEN `readStatus` MUST read `a` CR `b`, as `store.ReadStatus` does.
- GIVEN `a: |` with a content line, then a line of only U+0085, U+FEFF, U+00A0 or U+2028, then `  evil: y` THEN Node and Go MUST end the block at that line and keep `  evil: y`, and a projection of such a `state.yaml` MUST fail with `malformed-state` in Node and in Go; GIVEN a line of only spaces and tabs, or of only a lone CR THEN it MUST stay blank inside the block.
- GIVEN a top-level key that starts with U+00A0, U+000B or U+2028, or a `status:` of only U+FEFF or U+00A0 THEN both projectors MUST advance, reading that character as part of the key or the value; GIVEN a first key `change` that starts with U+FEFF, a `status` key that starts with U+00A0 as the only status, text after a closed double-quoted status, `status: ""`, `phases: # c`, `phases: ""` or `phases: ''` THEN both MUST fail with `malformed-state` and leave the bytes unchanged.
- GIVEN `status:`, `revision:`, `phases:`, a phase key or a phase field written with a leading U+00A0 before the real key THEN both projectors MUST rewrite the real key and keep the other line byte for byte, and `readStatus`, the pre-compact reader and `store.ReadStatus` MUST read the real status; a key with a leading U+00A0 after `blocking_questions` MUST survive the projection, and a comment that starts with a tab inside `blocking_questions` or before the projected phase MUST count as indented in both.
- GIVEN `status:archived`, or `status:` followed by U+00A0, U+FEFF or U+000B and `archived`, after `status: planning` THEN every reader MUST read `planning` and both projectors MUST fail with `malformed-state`; GIVEN `status : archived` THEN every reader and both projectors MUST read `archived`; GIVEN `status: planning` or a phase `status: pending` followed by a lone CR or a form feed and `# c` THEN every reader and both projectors MUST strip the comment and write the same bytes; GIVEN two top-level `status` keys THEN `readStatus` and `store.ReadStatus` MUST read the first.
- GIVEN `- ` followed by U+0085 or U+FEFF and `|`, or `a: |` followed by one of them THEN Node and Go MUST read a plain scalar, not a block header; GIVEN `notes:` followed by a lone CR, or a quoted scalar closed before a lone CR THEN they MUST still read a key and report no error.
- GIVEN a lite route, `phases.proposal.status: pending` and a `notes: |` under `phases` holding `status: done` THEN pre-compact MUST resolve `proposal` as the current phase.
