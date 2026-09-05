# Routing — Baseline Spec

**Domain**: routing
**Source**: `scripts/lib/route-dispatcher.js`, `openspec/config.yaml::routing`, `docs/sdd-routing.md`
**Baseline commit**: 59fbfe8

---

## 1. Overview

The routing domain is the intent-based dispatch layer of the SDD orchestrator. It resolves which workflow profile (route) to run for a given change by evaluating a declarative routing table stored in `openspec/config.yaml`. The implementation is entirely contained in `scripts/lib/route-dispatcher.js`, which exports five pure functions and six constant arrays. The module has zero side effects: it performs no file I/O and mutates no global state.

---

## 2. Concepts

| Concept | Definition |
|---------|-----------|
| **Route** | A named workflow profile combining an ordered list of phases and a set of gate hook points. Represents a distinct user intent. |
| **Phase** | A delegated SDD sub-agent that produces a single artifact. Phases run in the declared order within a route. |
| **Gate** | A check or advisory that runs at a specific hook point within a route. Does not produce a main artifact; records its outcome in `state.yaml.gates`. |
| **Context (ctx)** | A plain JavaScript object of key-value pairs describing the current change environment. Supplied by the orchestrator from config, file-system signals, and user input. |
| **Derived signal** | A boolean ctx key computed deterministically by the orchestrator (e.g. `specs_empty_with_code`) without user input. |

A route represents a **distinct user intent**. Routes MUST NOT be added to vary a single configuration toggle; gates or phase options MUST be used instead.

---

## 3. Known-Name Constants

All constants are exported from `route-dispatcher.js` and MUST be treated as the authoritative allowlist for validation.

### 3.1 KNOWN_PHASES

Ordered list of valid SDD phase names:

```
sdd-foundation, sdd-baseline, sdd-workspace, sdd-explore,
sdd-propose, sdd-spec, sdd-design, sdd-tasks,
sdd-apply, sdd-verify, sdd-archive
```

(11 entries)

### 3.2 KNOWN_GATES

Valid gate names:

```
clarify, review-workload, impact, brownfield-advisory, quality-review-gate
```

(5 entries; `4r-review-gate` is valid only in explicitly legacy schema v1 state — no unqualified aliasing)

### 3.3 KNOWN_REVIEWERS

Valid quality-domain reviewer sub-agent labels:

```
review-trust, review-runtime, review-evolution, review-efficiency
```

(4 entries; plus lifecycle agents `review-change` and `review-correction`)

### 3.4 KNOWN_CLASSES

Valid change classification values:

```
trivial, small, normal, high-risk
```

### 3.5 KNOWN_COSTS

Valid cost tier labels:

```
low, medium, high
```

### 3.6 KNOWN_DERIVED_SIGNALS

Signals that the orchestrator computes deterministically from the file system. When present in `conditions`, their values MUST be boolean:

```
specs_empty_with_code, code_without_specs
```

### 3.7 KNOWN_BOOLEAN_FIELDS

Top-level route fields that MUST be coerced from YAML string literals to native JavaScript booleans during parsing:

```
experimental
```

---

## 4. The Routing Table (openspec/config.yaml::routing)

The `routing:` block in `openspec/config.yaml` declares the ordered list of routes. Routes are evaluated top-to-bottom; the **first matching route wins**. No further routes are evaluated after a match.

### 4.1 The Six Canonical Routes

| # | Name | classification | Key condition | Phases | Gates | Cost |
|---|------|---------------|---------------|--------|-------|------|
| 1 | `foundation` | `[trivial, small, normal, high-risk]` | `project.status: empty` | `[sdd-foundation]` | `[]` | medium |
| 2 | `federated` | `[trivial, small, normal, high-risk]` | `artifact_store.backend: workspace-federated` | `[sdd-workspace, sdd-propose, sdd-spec, sdd-design, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]` | `[impact, clarify]` | high |
| 3 | `bugfix` | `[small, normal]` | `explicit_bugfix_intent: true` | `[sdd-explore, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]` | `[quality-review-gate]` | medium |
| 4 | `brownfield` | `[trivial, small, normal, high-risk]` | `baseline.status: pending` | `[sdd-baseline]` | `[brownfield-advisory]` | medium |
| 5 | `refactor` | `[small, normal]` | `explicit_refactor_intent: true` | `[sdd-design, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]` | `[quality-review-gate]` | medium |
| 6 | `hotfix` | `[trivial, small]` | `explicit_hotfix_intent: true` | `[sdd-apply, sdd-verify, sdd-archive]` | `[]` | low |
| 7 | `standard` | `[normal, high-risk]` | `project.status: active` | `[sdd-propose, sdd-spec, sdd-design, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]` | `[clarify, quality-review-gate]` | high |
| 8 | `lite` | `[trivial, small]` | `project.status: active` | `[sdd-propose, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]` | `[]` | low |

### 4.2 Route-Specific Behaviors

**foundation**: Stops after `sdd-foundation` completes. MUST NOT auto-chain into the standard SDD flow.

**bugfix**: Is explicit-only. The user MUST signal bugfix intent (e.g., "fix bug", "bugfix", "quick fix"). The orchestrator MUST NOT auto-route to `bugfix` from classification signals alone.

**brownfield**: The `brownfield-advisory` gate runs first. `sdd-baseline` runs only on user consent. The route then re-routes to the underlying change route.

**refactor**: Is explicit-only. The user MUST signal refactor intent. It skips propose/spec phases, preserving existing functional behavior.

**hotfix**: Is explicit-only. Used for emergency patches. Applies fixes directly without planning overhead, but forces verification and archival.

**standard**: Lists `quality-review-gate` in `gates` to enable optional 4R review after a successful `sdd-verify`. Removing it from the list disables 4R for this route.

**lite**: Omits the `clarify` gate. That gate is skipped when `route=lite` AND `class` is in `{trivial, small}` AND there is no `residual_ambiguity` from `sdd-spec`. Runs archival at the end.

### 4.3 Route Entry Schema

A route entry is a YAML map with the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | non-empty string | REQUIRED | Unique route identifier |
| `classification` | string or string[] of KNOWN_CLASSES | REQUIRED | Change classes this route serves |
| `conditions` | object | REQUIRED | Conditions map (see §6) |
| `phases` | non-empty string[] of KNOWN_PHASES | REQUIRED | Ordered phases to execute |
| `gates` | string[] of KNOWN_GATES (may be empty) | REQUIRED | Gate hook points enabled for this route |
| `description` | non-empty string | REQUIRED | Human-readable purpose summary |
| `cost` | one of KNOWN_COSTS | OPTIONAL | Relative workflow cost |
| `experimental` | boolean | OPTIONAL | Marks the route as experimental |

Unknown fields at the entry level are stored on the parsed object without error (forward-compatibility tolerance).

---

## 5. `parseRoutingTable(content)` — YAML Subset Parser

### 5.1 Purpose

Parses the `routing:` block from the full text content of `openspec/config.yaml`. Returns an array of route entry objects. Is pure: no file I/O, no global mutation.

### 5.2 Supported YAML Subset

The parser handles a constrained YAML subset defined by fixed indentation levels:

| Level | Indent | Content |
|-------|--------|---------|
| Top-level key | 0 spaces | `routing:` or other config keys |
| Entry start | 2 spaces | `- name: value` (first field MAY be inlined) |
| Entry field | 4 spaces | `key: value` |
| Sub-field / list item | 6 spaces | `key: value` inside `conditions:`, or `- item` in block sequences |

Supported constructs:
- **Scalar fields**: `name: standard`, `cost: high`
- **Inline arrays**: `[a, b, c]` or `[]` for `phases`, `gates`, `classification`, and others
- **Block sequences**: `- item` lines at 6-space indent for array fields
- **Nested `conditions:` map**: `key: value` pairs at 6-space indent; keys MAY contain dots
- **Comments** (`# ...`) and **blank lines** are silently ignored anywhere in the block
- **Inline trailing comments** are stripped from scalar values

NOT supported (silently ignored or produces unexpected output):
- Multi-line scalar values (`|` and `>` block scalars)
- Nested sequences inside `conditions:`
- YAML anchors and aliases (`&anchor`, `*alias`)
- YAML multi-document (`---`)
- Numeric values (parsed as strings)

### 5.3 Value Coercion Rules

| Location | Condition | Coercion applied |
|----------|-----------|------------------|
| `conditions:` sub-map, any key except `match` | String value `"true"` or `"false"` | Coerced to native boolean `true` / `false` |
| `conditions:` sub-map, key `match` | Any string | Kept as string (`"any"` or `"all"`); NOT boolean-coerced |
| `conditions:` sub-map, any key | Inline array `[a, b]` | Parsed to JavaScript string array |
| Top-level entry field in `KNOWN_BOOLEAN_FIELDS` (`experimental`) | String `"true"` or `"false"` | Coerced to native boolean |
| All other top-level entry fields | Any string | Kept as string |

### 5.4 Return Value

Returns an array of plain JavaScript objects. An absent or empty `routing:` block returns `[]`. Each returned object is a fresh instance; mutations to one result do not affect another call's result (output isolation). Calls to `parseRoutingTable` with identical input are deterministic.

### Scenarios

**Scenario: inline array phases round-trip**
```
Given: a routing block with `phases: [sdd-propose, sdd-tasks, sdd-apply, sdd-verify]`
When: parseRoutingTable is called with that content
Then: the returned entry's `phases` is the JavaScript array `["sdd-propose", "sdd-tasks", "sdd-apply", "sdd-verify"]`
```

**Scenario: block sequence phases**
```
Given: a routing block with phases as block sequence items under `phases:` at 6-space indent
When: parseRoutingTable is called
Then: the returned entry's `phases` is a JavaScript array in declaration order
```

**Scenario: conditions boolean coercion**
```
Given: a conditions map containing `specs_empty_with_code: true`
When: parseRoutingTable is called
Then: `entry.conditions.specs_empty_with_code` is native boolean `true`, typeof === "boolean"
```

**Scenario: match key preserved as string**
```
Given: a conditions map containing `match: any`
When: parseRoutingTable is called
Then: `entry.conditions.match` is the string `"any"`, not boolean
```

**Scenario: top-level experimental coercion**
```
Given: a route entry with `experimental: true` (YAML string)
When: parseRoutingTable is called
Then: `entry.experimental` is native boolean `true`
```

**Scenario: absent routing block**
```
Given: config content with no `routing:` key
When: parseRoutingTable is called
Then: returns `[]`
```

**Scenario: output isolation**
```
Given: two calls to parseRoutingTable with identical YAML content
When: the first result's entry is mutated
Then: the second result's entry is unaffected
```

---

## 6. `matchConditions(conditions, ctx)` — Condition Evaluation

### 6.1 Purpose

Evaluates a route's `conditions` map against a caller-supplied context object. Returns a boolean. Is pure: no I/O, no global mutation.

### 6.2 Semantics

| Conditions structure | Semantics |
|---------------------|-----------|
| `match` key absent or `"all"` (default) | AND logic: every condition key MUST match |
| `match: "any"` | OR logic: at least one condition key MUST match |
| Empty key set, `match: "all"` | Vacuously true |
| Empty key set, `match: "any"` | False |
| Array value for a condition key | ANY-of: ctx[key] MUST equal at least one array element |
| Scalar / boolean value for a condition key | Strict equality: ctx[key] === expected |
| ctx key absent | `undefined !== expected` → fails the condition |

The `match` meta-key itself is excluded from condition evaluation.

### Scenarios

**Scenario: AND mode both keys match**
```
Given: conditions `{ "project.status": "active", "baseline.status": "pending" }`
  And: ctx `{ "project.status": "active", "baseline.status": "pending" }`
When: matchConditions is called
Then: returns true
```

**Scenario: AND mode one key fails**
```
Given: conditions `{ "project.status": "active", "baseline.status": "pending" }`
  And: ctx has `baseline.status: "done"` instead
When: matchConditions is called
Then: returns false
```

**Scenario: OR mode one key matches**
```
Given: conditions `{ match: "any", "project.status": "empty", "baseline.status": "pending" }`
  And: ctx `{ "project.status": "empty" }`
When: matchConditions is called
Then: returns true
```

**Scenario: OR mode no key matches**
```
Given: conditions `{ match: "any", "project.status": "empty", "baseline.status": "pending" }`
  And: ctx has neither value matching
When: matchConditions is called
Then: returns false
```

**Scenario: array value ANY-of match**
```
Given: conditions `{ "baseline.status": ["pending", "partial"] }`
  And: ctx `{ "baseline.status": "partial" }`
When: matchConditions is called
Then: returns true
```

**Scenario: array value no match**
```
Given: conditions `{ "baseline.status": ["pending", "partial"] }`
  And: ctx `{ "baseline.status": "done" }`
When: matchConditions is called
Then: returns false
```

**Scenario: derived boolean signal match**
```
Given: conditions `{ specs_empty_with_code: true }`
  And: ctx `{ specs_empty_with_code: true }`
When: matchConditions is called
Then: returns true
```

**Scenario: absent ctx key fails**
```
Given: conditions `{ specs_empty_with_code: true }`
  And: ctx `{}` (key absent)
When: matchConditions is called
Then: returns false (undefined !== true)
```

**Scenario: brownfield any-of full pattern**
```
Given: conditions `{ match: "any", "baseline.status": ["pending", "partial"], specs_empty_with_code: true, code_without_specs: true }`
  And: ctx `{ "baseline.status": "done", specs_empty_with_code: false, code_without_specs: false }`
When: matchConditions is called
Then: returns false (done-baseline suppression: no signal fires)
```

---

## 7. `validateRoute(entry)` — Single Route Validation

### 7.1 Purpose

Validates one route entry object for well-formedness. Returns `{ valid: boolean, errors: string[] }`. Advisory-only: the orchestrator MAY proceed even when `valid` is false. Is pure.

### 7.2 Required Fields

The six required fields are: `name`, `classification`, `conditions`, `phases`, `gates`, `description`. Missing any required field produces an error string mentioning that field. When any required field is absent the function returns early to avoid cascade errors.

### 7.3 Per-Field Rules

| Field | Rule |
|-------|------|
| `name` | MUST be a non-empty string |
| `classification` | Each value (string or string[] element) MUST be in KNOWN_CLASSES |
| `conditions` | MUST be a plain object; if `match` key present, its value MUST be `"all"` or `"any"`; KNOWN_DERIVED_SIGNALS keys MUST have boolean values |
| `phases` | MUST be a non-empty array; each element MUST be in KNOWN_PHASES |
| `gates` | MUST be an array (may be empty); each element MUST be in KNOWN_GATES |
| `description` | MUST be a non-empty string |
| `cost` (optional) | MUST be in KNOWN_COSTS when present |
| `experimental` (optional) | MUST be a native boolean when present |

Unknown fields not in the above list are silently tolerated (forward-compatibility).

### 7.4 Input Immutability

`validateRoute` MUST NOT mutate its input. Frozen input objects MUST NOT cause a TypeError.

### Scenarios

**Scenario: valid route accepted**
```
Given: a route entry with all six required fields set to valid values
When: validateRoute is called
Then: returns `{ valid: true, errors: [] }`
```

**Scenario: missing required field**
```
Given: a route entry missing the `phases` field
When: validateRoute is called
Then: returns `{ valid: false, errors: [...] }` with at least one error string mentioning "phases"
```

**Scenario: empty phases array**
```
Given: a route entry with `phases: []`
When: validateRoute is called
Then: returns `{ valid: false }` with error matching "phases must not be empty"
```

**Scenario: unknown phase name**
```
Given: a route entry with `phases: ["sdd-spec", "nonexistent-phase"]`
When: validateRoute is called
Then: returns `{ valid: false }` with error naming "nonexistent-phase"
```

**Scenario: unknown gate name**
```
Given: a route entry with `gates: ["clarify", "ghost-gate"]`
When: validateRoute is called
Then: returns `{ valid: false }` with error naming "ghost-gate"
```

**Scenario: invalid match value**
```
Given: a conditions map with `match: "or"`
When: validateRoute is called
Then: returns `{ valid: false }` with error mentioning "match"
```

**Scenario: derived signal with non-boolean value**
```
Given: a conditions map with `specs_empty_with_code: "yes"` (string, not boolean)
When: validateRoute is called
Then: returns `{ valid: false }` with error naming "specs_empty_with_code"
```

**Scenario: frozen input does not throw**
```
Given: a valid route entry wrapped in Object.freeze()
When: validateRoute is called
Then: does not throw; returns `{ valid: true, errors: [] }`
```

---

## 8. `validateRouteTable(routes)` — Full Table Validation

### 8.1 Purpose

Validates an array of route entry objects. Applies `validateRoute` to each entry and additionally checks for duplicate route names. Returns `{ valid: boolean, errors: string[] }`. Is pure.

### 8.2 Rules

- Input MUST be an array; if not, returns `{ valid: false, errors: ["routing table must be an array"] }`.
- Per-entry errors from `validateRoute` are aggregated into the returned `errors` array.
- Duplicate `name` values (case-sensitive, trimmed) produce an error string naming the duplicate.
- A table with any per-entry errors OR any duplicate-name errors returns `{ valid: false }`.
- It does NOT lint for residual boolean-like strings in `conditions`. Callers seeking that check MUST invoke `detectResidualBooleanStrings(entry.conditions)` separately.

### Scenarios

**Scenario: valid unique table accepted**
```
Given: an array of route entries each passing validateRoute with unique names
When: validateRouteTable is called
Then: returns `{ valid: true, errors: [] }`
```

**Scenario: duplicate name rejected**
```
Given: two route entries with the same name value
When: validateRouteTable is called
Then: returns `{ valid: false }` with an error string naming the duplicate route
```

**Scenario: per-entry errors aggregated**
```
Given: a table containing one valid entry and one entry with `phases: []`
When: validateRouteTable is called
Then: returns `{ valid: false }` with error matching "phases must not be empty"
```

---

## 9. `classifyChange(ctx)` — Signal Confidence Classification

### 9.1 Purpose

Determines whether the change context contains deterministic or advisory routing signals. Returns `{ classification: string|null, confidence: "deterministic"|"advisory" }`. Is pure.

### 9.2 Deterministic Signals

These keys, when present in ctx, yield `confidence: "deterministic"` without user input:

```
classification, project.status, baseline.status, artifact_store.backend,
specs_empty_with_code, code_without_specs
```

When `ctx.classification` is a string, `classifyChange` returns it as the `classification` field. Other deterministic signals return `classification: null`.

### 9.3 Advisory Signals

Any ctx that contains no deterministic signal returns `confidence: "advisory"`. The orchestrator MUST NOT auto-route when confidence is `"advisory"`; it MUST surface the ambiguity via user questions first.

### 9.4 Priority Order

Explicit `classification` key takes highest priority. Other deterministic signal keys are checked next. Advisory is the fallback.

### 9.5 Input Immutability

`classifyChange` MUST NOT mutate its input. Returned result objects MUST be independent on repeated calls (not a shared cached reference).

### Scenarios

**Scenario: explicit classification**
```
Given: ctx `{ classification: "normal" }`
When: classifyChange is called
Then: returns `{ classification: "normal", confidence: "deterministic" }`
```

**Scenario: project.status deterministic**
```
Given: ctx `{ "project.status": "empty" }`
When: classifyChange is called
Then: returns `{ classification: null, confidence: "deterministic" }`
```

**Scenario: advisory fallback**
```
Given: ctx `{ user_message: "add some logs" }`
When: classifyChange is called
Then: returns `{ classification: null, confidence: "advisory" }`
```

**Scenario: empty context is advisory**
```
Given: ctx `{}`
When: classifyChange is called
Then: returns `{ confidence: "advisory" }`
```

---

## 10. Route Evaluation Semantics

### 10.1 First-Match-Wins

The orchestrator MUST walk the routing table in declaration order (top to bottom). The first route whose `conditions` block is fully satisfied by `matchConditions(route.conditions, ctx)` is selected. No further routes are evaluated after a match.

### 10.2 4R Gate Hook and Advisory Policy

The `4r-review-gate` MUST run after successful `sdd-verify` only when listed by the active `bugfix`, `refactor`, or `standard` route. It MUST run the read-only generalist before the selected specialists and MUST preserve the existing advisory severity policy: `BLOCKER` or `CRITICAL` findings are surfaced to the user without automatic route halt, while `WARNING` and `SUGGESTION` are recorded without interruption. Routes without the gate MUST skip all generalist and specialist dispatch.

(Previously: the gate dispatched all four specialists unconditionally after successful verify and applied the same advisory severity policy.)

#### Scenario: Route without gate keeps prior no-op behavior

- GIVEN the active route does not list `4r-review-gate`
- WHEN verify succeeds
- THEN neither the generalist nor any specialist MUST be dispatched

#### Scenario: Selected specialist preserves severity behavior

- GIVEN a selected specialist returns a `CRITICAL` finding
- WHEN the gate evaluates collected selected-reviewer envelopes
- THEN the finding MUST be surfaced through the existing user decision gate
- AND the route MUST NOT auto-halt solely because of that severity

---

## 11. Module Purity Contract

All exported functions from `route-dispatcher.js` are **pure**:
- No file I/O at any call site.
- No global state mutation.
- Frozen input objects do not cause errors.
- Repeated calls with identical arguments return equal results.
- Returned object graphs are independent across calls (no shared internal references).

This purity is tested by the test suite in `scripts/lib/route-dispatcher.test.js` (84 tests as of baseline commit 59fbfe8).

---

## 12. Quality Gate Policy Audit and Dispatch

### Requirement: Quality Gate Audit Block in state.yaml

When `sdd-verify` evaluates a `quality_gates:` policy, it MUST write a
`quality-gates` entry under `state.yaml.gates` immediately after evaluation
completes and before the phase returns. The entry shape is:

```yaml
gates:
  quality-gates:
    status: pass | fail | skipped
    evaluated_at: <ISO 8601 UTC timestamp>
    override:                              # present only when user forced archive with written justification
      timestamp: <ISO 8601 UTC timestamp>
      justification: "<verbatim user text>"
    gates:
      tests:
        status: pass | fail | skipped
        required: true
        on_fail: halt
        detail: "coverage 72% < minimum 80%"   # present only when informative
      lint:
        status: fail
        required: true
        on_fail: halt
      architecture:
        status: skipped
        required: false
        on_fail: advisory
        detail: "command not configured"
      security:
        status: pass
        required: false
        on_fail: advisory
```

Top-level `gates.quality-gates.status` aggregation rules:

| Condition | Top-level status |
|-----------|----------------|
| Any gate with `required: true, on_fail: halt` has status `fail` | `fail` |
| No halt-required failure; at least one gate `pass` or `skipped` | `pass` |
| All gates skipped (no commands) OR policy was absent | `skipped` |

When `quality_gates:` is absent, the `gates.quality-gates` key MUST NOT be written.

#### Scenario: Policy evaluated — audit block written with correct top-level status

- GIVEN `quality_gates:` declares `lint` with `required: true, on_fail: halt`
  AND the lint command fails
- WHEN `sdd-verify` completes evaluation
- THEN `state.yaml.gates.quality-gates.status` is `fail`
- AND `state.yaml.gates.quality-gates.gates.lint.status` is `fail`

#### Scenario: All gates pass — top-level status is pass

- GIVEN all configured gates pass their commands
- WHEN `sdd-verify` writes the audit block
- THEN `state.yaml.gates.quality-gates.status` is `pass`

#### Scenario: All commands absent — top-level status is skipped

- GIVEN `quality_gates:` declares gates but none have a `command` set
- WHEN `sdd-verify` evaluates the policy
- THEN `state.yaml.gates.quality-gates.status` is `skipped`

#### Scenario: Policy absent — no audit block written

- GIVEN `config.yaml` has no `quality_gates:` key
- WHEN `sdd-verify` completes
- THEN `state.yaml` contains no `gates.quality-gates` entry

---

### Requirement: Archive Dispatch Block on Failed Halt Gate

Before dispatching `sdd-archive`, the orchestrator MUST read
`state.yaml.gates.quality-gates.status`. If the value is `fail`, the orchestrator
MUST NOT dispatch `sdd-archive` and MUST surface the blocking gate(s) to the user
via the standard question gate before offering remediation options (fix and re-run
verify, or explicit override with written justification).

When the user provides a written justification to force archive despite a failed halt gate,
the orchestrator MUST:

1. Record the override in `state.yaml` under `gates.quality-gates.override` with:
   - `timestamp`: UTC ISO 8601 timestamp of the override decision.
   - `justification`: verbatim text provided by the user.
2. Append an Override section to `verify-report.md` containing the same `timestamp` and
   `justification` text.
3. Only after BOTH audit entries are persisted MUST the orchestrator dispatch `sdd-archive`.

If the key is absent, `pass`, or `skipped`, the orchestrator MUST proceed with archive
dispatch normally.

#### Scenario: Failed halt gate blocks archive

- GIVEN `state.yaml.gates.quality-gates.status: fail`
- WHEN the orchestrator reaches the sdd-archive dispatch point
- THEN it MUST NOT dispatch `sdd-archive`
- AND MUST surface the blocking gate detail to the user via `vscode/askQuestions`
- AND MUST offer remediation options: fix and re-run verify, or override with written justification

#### Scenario: User overrides blocked archive with written justification

- GIVEN `state.yaml.gates.quality-gates.status: fail`
- AND the user provides a written justification to force archive
- WHEN the orchestrator records the override
- THEN it writes `gates.quality-gates.override.timestamp` (UTC ISO 8601) and `gates.quality-gates.override.justification` (verbatim) to `state.yaml`
- AND appends an Override section with the same timestamp and justification to `verify-report.md`
- AND dispatches `sdd-archive` only after both audit entries are persisted

#### Scenario: Passing quality gates do not block archive

- GIVEN `state.yaml.gates.quality-gates.status: pass`
- WHEN the orchestrator reaches the sdd-archive dispatch point
- THEN archive dispatch proceeds normally

#### Scenario: Quality gates absent — archive dispatch unchanged

- GIVEN `state.yaml` has no `gates.quality-gates` key
- WHEN the orchestrator reaches the sdd-archive dispatch point
- THEN it proceeds with archive dispatch as in the pre-quality-gates baseline

---

## 13. Lifecycle Hook Dispatch at Phase Boundaries

The orchestrator MUST read the `hooks:` block from `openspec/config.yaml` before
beginning route execution and MUST dispatch matching lifecycle hook actions at each
phase boundary during the selected route's execution.

Dispatch rules:

- The orchestrator MUST evaluate the `hooks:` block once per change session (at
  route start). Subsequent per-boundary evaluations use the cached block.
- For each phase boundary reached, the orchestrator MUST run all declared actions
  for the matching event key in declaration order, applying the `on_failure` policy
  per the `lifecycle-hooks` spec.
- `run-command` actions MUST be issued as ordinary orchestrator tool calls and MUST
  receive the existing PreToolUse DENY/ASK evaluation. The orchestrator MUST NOT
  issue them through any bypass channel.
- A `halt` action failure at any boundary MUST prevent the orchestrator from
  dispatching the phase or crossing that boundary. The orchestrator MUST surface
  the failure to the user.
- When the `hooks:` block is absent, the orchestrator MUST proceed without firing
  any actions; no change to existing route execution behavior.

### Scenario: Hook fires before apply dispatch

- GIVEN the active route includes `sdd-apply` and `hooks.before-implementation` declares one action
- WHEN the orchestrator reaches the `sdd-apply` dispatch point
- THEN it MUST run the `before-implementation` action(s) to completion before dispatching `sdd-apply`
- AND the action outcome MUST be recorded in `lifecycle_hooks:` before dispatch

### Scenario: `halt` failure blocks phase dispatch

- GIVEN `hooks.before-verify` declares an action with `on_failure: halt` that fails
- WHEN the orchestrator reaches the `sdd-verify` dispatch point
- THEN it MUST NOT dispatch `sdd-verify`
- AND MUST surface the failure to the user via the standard question gate

### Scenario: No `hooks:` block — route unchanged

- GIVEN `openspec/config.yaml` has no `hooks:` key
- WHEN the orchestrator executes any route
- THEN route execution is identical to the pre-lifecycle-hooks baseline
- AND the `lifecycle_hooks:` audit block MAY be absent from `state.yaml`

---

## 14. `lifecycle_hooks:` Audit Persistence

The orchestrator MUST persist a `lifecycle_hooks:` block to
`openspec/changes/{change-name}/state.yaml` recording the outcome of every
lifecycle event encountered during route execution. The block shape and field
semantics are defined in the `lifecycle-hooks` spec.

The audit block MUST be written (or merged) into `state.yaml` at the same time
the orchestrator updates any other phase status field — it MUST NOT be deferred
to route end. Each event entry MUST be written immediately after that event's
actions complete.

### Scenario: Audit block written incrementally

- GIVEN `before-change` fires and completes before any other phase
- WHEN the orchestrator writes the state after `before-change`
- THEN `state.yaml` MUST contain `lifecycle_hooks.before-change` with correct status
- AND the remaining event entries MUST be absent (not yet written) until those events fire

### Scenario: Skipped events are recorded

- GIVEN the active route is `foundation` (no `sdd-verify` phase) and `hooks.before-verify` is declared
- WHEN the route completes
- THEN `state.yaml` MUST contain `lifecycle_hooks.before-verify.status: skipped`

---

## 15. `detectResidualBooleanStrings(conditions)` — Residual Boolean Verification

### 15.1 Purpose

Advisory pre-check function that scans a conditions map for keys whose value is still the literal residual string `"true"` or `"false"` instead of a native boolean. It is pure: reads only its argument, no I/O, no global mutation.

### 15.2 Rules

- The function accepts a `conditions` object.
- It returns an array of keys (strings) whose value is the residual string `"true"` or `"false"`.
- If the input is null, not an object, or an array, it returns an empty array `[]`.
- The `match` meta-key is always excluded from the returned list of keys.

### Scenarios

**Scenario: detect residual boolean strings**
Given: a conditions map `{ "specs_empty_with_code": "true", "match": "any" }`
When: detectResidualBooleanStrings is called
Then: returns `["specs_empty_with_code"]`

## 16. Evidence-Derived Review Dimensions and Bounded Lineage

### Requirement: Evidence-Derived Review Dimensions {#REQ-routing-001}

At the Quality Review Gate, the system MUST normalize evidence, derive deterministic facts attributable to each affected behavioral capability, map facts to exactly four quality domains (`trust`, `runtime`, `evolution`, `efficiency`), and evaluate sufficiency per capability and globally. Each domain decision MUST record `selected: true|false` with non-empty ordered reasons when persisted. Signals MUST inform routing but MUST NOT be treated as findings. Evidence precedence MUST remain deterministic: high-risk override; verify findings; real-diff facts; design/dependency risks; declared paths, capabilities, dependencies, operation types, and design risks.

(Previously: derived four 4R dimensions `risk`, `reliability`, `resilience`, `readability`.)

#### Scenario: Network retry selects runtime only

- GIVEN normalized evidence shows retry semantics in production code
- WHEN domains are derived
- THEN `runtime` MUST be selected with deterministic reasons
- AND `efficiency` MUST NOT be selected without efficiency evidence

#### Scenario: Signals recorded but not findings

- GIVEN the classifier records fact `network-flow`
- WHEN specialist dispatch completes
- THEN the fact MUST appear in routing audit
- AND MUST NOT automatically create a specialist finding

### Requirement: Classification Caps and High-Risk Override {#REQ-routing-002}

Normal selection MUST set `selected_domains` to the union of positively signalled domains plus any domains `review-change` adds from residual evidence. The `normal-signal-overflow` rule that dispatched a fourth specialist when three domains were positive MUST be removed. Three positive domains MUST NOT implicitly select the fourth without efficiency evidence or explicit full-review policy. A `high-risk` change MUST select all four quality domains regardless of lower-precedence signals. Zero to four specialists MUST be legal for normal changes.

(Previously: three positive 4R signals escalated to mandatory full four-dimension review.)

#### Scenario: Three domains do not overflow to four

- GIVEN positive signals for `trust`, `runtime`, and `evolution` only
- WHEN normal selection completes
- THEN exactly those three domains MUST be selected
- AND `efficiency` MUST remain unselected

#### Scenario: High-risk override selects all four

- GIVEN classification is `high-risk`
- WHEN domains are derived
- THEN all four quality domains MUST be selected with override reasons recorded

### Requirement: Review Decision Contract and Audit {#REQ-routing-003}

Before specialist dispatch, the system MUST validate classification, normalized evidence, optional `review-change` routing output when invoked, canonical domain keys, allowed specialist names, and union-selection policy. For schema v2 and new state it MUST persist under `gates.quality-review-gate` the classification, `classification_status`, `selected_domains`, per-capability attribution coverage, ambiguity reasons when applicable, normalized evidence fingerprint, router decision when present, and per-domain reasons. Legacy schema v1 state MUST persist under `gates.4r-review-gate` only until terminal completion or explicit atomic migration. Contract-invalid input MUST fail closed with `blocker_reason: contract-remediation` and MUST NOT dispatch specialists or silently fall back to unconditional full review.

(Previously: always validated generalist result and ran generalist before specialists under `gates.4r-review-gate`.)

#### Scenario: Sufficient path persists auditable selection

- GIVEN sufficient classification selects `trust` and `runtime`
- WHEN routing completes
- THEN the gate audit MUST record both domains with non-empty reasons
- AND repeated identical input MUST produce the same auditable data

#### Scenario: Invalid router payload fails closed

- GIVEN `review-change` returns non-allowlisted domain IDs
- WHEN the gate validates inputs
- THEN the gate MUST record contract remediation
- AND no specialist dispatch MUST occur

### Requirement: Frozen Review Genesis and Slice-Scoped Targeted Correction {#REQ-routing-004}

The gate MUST freeze its deterministic candidate identity, genesis paths, classification, selected quality domains, initial evidence, immutable finding IDs with canonical domain owners, and the lineage authority before specialist execution. It MUST derive a stable, versioned set of root-cause correction slices from the frozen blocking finding IDs and their frozen evidence. Each slice MUST own exactly its frozen finding IDs, permitted genesis paths, bounded changed-line allowance, at most three failed validations, correction history, and resolution state; its allowance and attempt count MUST NOT grow or reset inside that slice.

Targeted validation MUST dispatch and decide only the active slice. A passed slice and every finding it resolves MUST remain resolved when another slice fails. A validation MAY invalidate an already passed slice only when it records a genuine correction-caused regression against that slice's frozen finding IDs or permitted paths; it MUST identify every explicitly impacted slice and MUST NOT reopen unrelated passed slices. Validation MUST NOT perform general discovery, add blocking finding IDs, select another quality domain, expand genesis paths, or allocate reviewer authority. Unrelated late observations MUST remain non-blocking follow-ups.

Pending correction mutation, exact path validation, candidate identity, genesis, selected domains, one-shot reviewer execution, frozen findings, and reconciliation requirements MUST remain immutable and fail closed. Mixed taxonomy between classifier domains and lineage owners MUST fail closed. A successor MUST NOT be created merely because a slice fails or exhausts its allowance; it is reserved for an explicitly approved new candidate lineage, scope, or discovery authority.

(Previously: froze four 4R selected dimensions without mixed-taxonomy guard.)

#### Scenario: Independent slice resolution is monotonic

- GIVEN slices `provenance` and `policy` have distinct frozen finding IDs and `provenance` is resolved
- WHEN targeted validation fails the active `policy` slice
- THEN `provenance` and its resolved findings MUST remain resolved
- AND only `policy` MAY consume its attempt or line allowance

#### Scenario: Genuine cross-slice regression is explicit

- GIVEN a passed slice has frozen finding `F-001` on a permitted path
- WHEN a later correction causes a regression that evidence attributes to `F-001`
- THEN validation MAY invalidate that slice and MUST record it as explicitly impacted
- AND it MUST NOT invalidate any slice without that regression evidence

#### Scenario: Correction escapes genesis

- GIVEN a proposed correction changes a path outside the active slice's frozen permitted paths
- WHEN the gate validates the attempt
- THEN the attempt MUST fail or enter reconciliation without expanding the lineage
- AND candidate, genesis, domains, findings, and all slice budgets MUST remain immutable

### Requirement: Read-Only Gate Continuation, Migration, and Interruption Recovery {#REQ-routing-005}

Status, verification, delivery, and archive gates after lineage creation MUST revalidate the same candidate identity and persisted lineage state without allocating new reviewers or budgets. Mixed live taxonomy MUST fail closed until reconciled. Mutable old-schema lineages MUST migrate deterministically and idempotically or continue under their original schema; silent reinterpretation is forbidden.

(Previously: continuation rules did not include mixed-taxonomy fail-closed guard.)

#### Scenario: Archive revalidates without reopening review

- GIVEN a terminal quality-review lineage for the frozen candidate
- WHEN archive validation runs
- THEN it MUST validate the same candidate identity
- AND MUST NOT allocate reviewers, findings, or successor authority

### Requirement: Deterministic Evidence-Only Remediation Routing {#REQ-routing-006}

The routing layer MUST distinguish a deterministic `evidence-format-gap` from
functional, task, specification, or test failures using the normalized Strict
TDD evidence record. The decision MUST include a stable functional candidate
identity (including its genesis paths) and MUST be reproducible for identical
inputs. A fast-path route MAY be selected only when the record is complete and
verifiable, the proposed write is limited to the evidence allowlist, and the
identity is unchanged before and after repair.

The fast path MUST have a bounded remediation budget: at most one focal verify
recheck and evidence-only writes within the configured changed-line/cost limit.
It MUST NOT allocate a new functional candidate, reviewer, or full phase
redispatch. Missing or fabricated evidence, identity mismatch, a material
production/spec/test delta, an over-budget repair, or a failed focal recheck
MUST fail closed and use ordinary routing. Routing and cost guard tests MUST
cover each of these classifications and reject attempts that exceed the bound.

#### Scenario: Deterministic equivalent drift selects the fast path

- GIVEN identical normalized functional identity and verifiable evidence with only a format mismatch
- WHEN routing evaluates the remediation candidate
- THEN it MUST classify `evidence-format-gap` deterministically
- AND select the bounded evidence-only path with one focal recheck at most

#### Scenario: Functional or task failure selects ordinary routing

- GIVEN evidence indicates a behavior, task, specification, or test failure rather than formatting drift
- WHEN routing classifies the candidate
- THEN it MUST NOT select the fast path
- AND it MUST return the existing ordinary route classification

#### Scenario: Identity mismatch or unauthorized file write fails closed

- GIVEN the post-repair identity differs or a production/spec/test path is changed
- WHEN the routing guard compares the before/after candidate and allowlist
- THEN it MUST reject the fast path as a contract failure
- AND it MUST select ordinary remediation without mutating the frozen identity

#### Scenario: Missing or fabricated evidence is never downgraded

- GIVEN required evidence fields or provenance are absent, unverifiable, or fabricated
- WHEN routing validates the record
- THEN it MUST preserve CRITICAL severity and fail closed
- AND it MUST NOT classify the case as `evidence-format-gap`

#### Scenario: Cost limit prevents repeated remediation

- GIVEN a candidate requests more than one focal recheck or exceeds the configured evidence/cost budget
- WHEN the cost guard evaluates the request
- THEN the fast path MUST be rejected
- AND ordinary routing MUST be selected with a deterministic reason

---

---

## 18. Additive Generational 4R Lineage Persistence

### Requirement: Additive Generational 4R Lineage Persistence {#REQ-routing-007}

The Quality Review Gate persistence model MUST retain every lineage generation additively with an unambiguous active-lineage reference and explicit predecessor links. Creating a successor MUST preserve the complete terminal predecessor record. Readers MUST resolve the active lineage and predecessor chain deterministically. Historical archived 4R records MUST remain byte-equivalent and MUST NOT be rewritten to quality-domain IDs. Pending mutations MUST be recorded before dispatch; unknown outcomes permit only exact reconciliation.

(Previously: requirement named and scoped to 4R gate persistence without quality-domain identity migration rules.)

#### Scenario: Historical 4R archive untouched

- GIVEN an archived change stores `risk` finding owners
- WHEN tooling reads that archive after migration
- THEN the stored owners MUST remain `risk`
- AND MUST NOT be silently rewritten to `trust`

#### Scenario: Successor preserves predecessor literally

- GIVEN a terminal predecessor lineage under quality domains
- WHEN an approved successor is created
- THEN the predecessor record MUST remain complete
- AND the active reference MUST identify only the successor

### Requirement: Closed-World Ambiguity Policy {#REQ-routing-008}

The deterministic classifier MUST emit `classification_status` of `sufficient` or `ambiguous`. Ambiguity MUST be decided by executable closed-world policy, not LLM authority. At minimum, ambiguity MUST apply when any of the following holds:

| Condition | Meaning |
|-----------|---------|
| `runtime-code-without-domain-attribution` | Production runtime code changed with zero domain signal |
| `unsupported-residual-evidence` | Normalizer sees executable behavior the signal vocabulary cannot classify |
| `classification-conflict` | Facts produce incompatible unresolved classification |
| `cross-capability-blast-radius` | More than 3 distinct **behavioral capabilities** are affected and at least one affected capability lacks deterministic quality-domain attribution |
| `public-kernel-contract-unattributed` | Kernel or externally consumed contract changes without domain signal |
| `self-review-infrastructure` | Quality gate, classifier, lineage, or generated-target parity changes |
| `generated-target-semantic-risk` | Generated-target behavior change not explained by deterministic parity |

Behavioral capabilities are drawn from the evidence contract (`paths`, `capabilities`, `dependencies`, `operationTypes`, `designRisks`). Docs, tests, fixtures, and generated mirrors without independent behavioral semantics MUST NOT count as behavioral capabilities. Packages and components MUST NOT be classifier units. Deterministic facts MUST be attributable to each affected behavioral capability so per-capability coverage and residual can be computed. Global `selected_domains != []` does NOT prove sufficient coverage; attribution is evaluated per capability. When all affected behavioral capabilities are deterministically attributed, blast radius alone MUST NOT invoke `review-change`. The bootstrap threshold for `cross-capability-blast-radius` is `> 3` distinct behavioral capabilities; telemetry MAY later inform retuning but live auto-tune is out of scope.

When `ambiguous`, the gate MUST invoke `review-change` with residual evidence only — including, for `cross-capability-blast-radius`, exactly the unattributed behavioral capabilities plus existing residual rules for other ambiguity codes. Runtime production changes with zero recognized signals MUST NOT silently complete as clean zero-specialist review solely because pattern matching found nothing.

#### Scenario: Runtime code without signal is ambiguous

- GIVEN production runtime files changed and the classifier derives no domain signal
- WHEN sufficiency is evaluated
- THEN `classification_status` MUST be `ambiguous`
- AND `review-change` MUST be eligible for dispatch

#### Scenario: Docs-only sufficient with empty selection

- GIVEN evidence is documentation-only with no quality signals
- WHEN classification completes
- THEN `classification_status` MUST be `sufficient`
- AND `selected_domains` MUST be `[]`

#### Scenario: Four attributed capabilities are sufficient without router

- GIVEN exactly 4 distinct behavioral capabilities are affected
- AND every affected capability has deterministic quality-domain attribution
- WHEN sufficiency is evaluated
- THEN `classification_status` MUST be `sufficient`
- AND `review-change` MUST NOT be invoked solely for blast radius

#### Scenario: Four capabilities with two unattributed triggers router residue

- GIVEN exactly 4 distinct behavioral capabilities are affected
- AND 2 of those capabilities lack deterministic quality-domain attribution
- WHEN sufficiency is evaluated
- THEN `classification_status` MUST be `ambiguous` with reason `cross-capability-blast-radius`
- AND `review-change` MUST receive only the 2 unattributed capabilities as blast-radius residue

#### Scenario: Seven attributed capabilities do not invoke premium router

- GIVEN 7 distinct behavioral capabilities are affected
- AND every affected capability has deterministic quality-domain attribution
- WHEN sufficiency is evaluated
- THEN `classification_status` MUST be `sufficient`
- AND `review-change` MUST NOT run for blast radius alone

#### Scenario: Single unattributed runtime capability uses runtime rule not blast radius

- GIVEN exactly 1 behavioral capability has production runtime code changed with zero domain signal
- WHEN sufficiency is evaluated
- THEN `classification_status` MUST be `ambiguous` via `runtime-code-without-domain-attribution`
- AND MUST NOT classify ambiguity via `cross-capability-blast-radius`

### Requirement: Zero-Model Quality Path {#REQ-routing-009}

When `classification_status` is `sufficient` and `selected_domains` is empty, the Quality Review Gate MUST complete without invoking `review-change` or any quality specialist.

#### Scenario: Metadata-only change completes with zero model calls

- GIVEN a sufficient classification with no selected domains
- WHEN the gate finishes routing
- THEN no review agent MAY be dispatched
- AND the audit MUST record the zero-dispatch outcome

### Requirement: High-Risk Full Review Without Semantic Router {#REQ-routing-010}

When change classification is `high-risk`, the gate MUST select all four quality domains deterministically and MUST NOT invoke `review-change` merely to confirm full review.

#### Scenario: High-risk selects four domains directly

- GIVEN classification is `high-risk` and verify succeeded
- WHEN routing completes
- THEN `selected_domains` MUST equal `[trust, runtime, evolution, efficiency]`
- AND `review-change` MUST NOT run

### Requirement: Atomic Released Contract Coherence {#REQ-routing-011}

The released gate MUST NOT operate with mixed taxonomy between classifier outputs and lineage or correction identifiers. `quality-review-gate` is the sole canonical gate identity for schema v2 and all new config, state, and writes. `4r-review-gate` is valid only inside explicitly legacy schema v1 state with old 4R dimension semantics; it MUST NOT be treated as an unqualified semantic alias. Gate identity is bound to taxonomy (4R dimensions vs quality domains) and classifier semantics — the discriminator is schema/version of lineage/state, not spelling aliasing. New writes MUST use only `quality-review-gate`. Legacy mutable v1 state MUST either remain v1 through terminal state or undergo an explicit atomic migration to v2 with `quality-review-gate` and `trust`/`runtime`/`evolution`/`efficiency` identifiers. Both gate keys present in the same mutable state MUST fail closed. Unqualified read-old/write-new aliasing is forbidden. Historical archived `4r-review-gate` and `.4r` records MUST remain immutable.

#### Scenario: Mixed classifier and lineage fails closed

- GIVEN the classifier emits `efficiency` while lineage stores `readability` owners
- WHEN dispatch or archive validation runs
- THEN the gate MUST fail closed
- AND MUST NOT complete under mixed identities

#### Scenario: Both gate keys in mutable state fail closed

- GIVEN mutable `state.yaml` contains both `gates.4r-review-gate` and `gates.quality-review-gate`
- WHEN gate validation or dispatch runs
- THEN the gate MUST fail closed for contract remediation
- AND MUST NOT treat either key as an unqualified alias of the other

#### Scenario: Legacy v1 state retains 4r identity without reinterpretation

- GIVEN in-flight mutable lineage is schema v1 under `gates.4r-review-gate` with 4R dimension IDs
- WHEN the gate resumes without an explicit v1→v2 migration
- THEN it MUST continue under v1 semantics to terminal state
- AND MUST NOT silently reinterpret 4R owners as quality domains


## Quality Review Routing Constants (merged)

The routing allowlists MUST recognize the Quality Review Gate and quality specialist roster:

| Constant | Updated value |
|----------|---------------|
| Gate identity | `quality-review-gate` (canonical for schema v2, new config, and new state); `4r-review-gate` valid only in explicitly legacy schema v1 state — no unqualified aliasing; both keys in same mutable state MUST fail closed |
| `KNOWN_REVIEWERS` | `review-trust`, `review-runtime`, `review-evolution`, `review-efficiency` |
| Review lifecycle agents | plus `review-change`, `review-correction` |

#### Scenario: Route gate hook uses Quality Review Gate

- GIVEN the active route lists `quality-review-gate` after verify
- WHEN verify succeeds
- THEN deterministic-first routing MUST run
- AND advisory severity policy for specialist findings MUST remain unchanged

#### Scenario: Route without gate skips review dispatch

- GIVEN the active route omits the quality review gate
- WHEN verify succeeds
- THEN neither `review-change` nor quality specialists MUST be dispatched

---

## 19. Live Routing Eligibility and Risk Floors

### Requirement: Classification Signal Normalization and Pre-Evaluation Route Eligibility Filtering {#REQ-routing-012}

Classification context signals MUST be normalized between `ctx.classification` and `ctx["change.classification"]`. When both signals are present with consistent non-empty string values, the normalized classification MUST equal that value. If both signals are present and carry conflicting values, the router MUST fail closed immediately by throwing a deterministic `ClassificationConflictError` (`ERR_CLASSIFICATION_CONFLICT`) without evaluating route conditions.

Candidate routes MUST be evaluated for eligibility against their declared `route.classification` metadata before checking `route.conditions`. A route whose declared classification does not include the resolved change classification MUST be deemed ineligible and skipped, eliminating the shadowing of `lite` by `standard` in active repositories (`project.status: active`).

#### Scenario: Small change selects lite without standard shadowing

- GIVEN a change classified as `small` in an active repository (`project.status: active`)
- WHEN route selection evaluates candidate routes
- THEN `standard` MUST be deemed ineligible due to classification mismatch
- AND `lite` MUST be selected as the matching eligible route

#### Scenario: Conflicting classification signals fail closed

- GIVEN a change context with conflicting signals (`ctx.classification: "small"` and `ctx["change.classification"]: "normal"`)
- WHEN signal normalization runs
- THEN it MUST throw `ClassificationConflictError` with code `ERR_CLASSIFICATION_CONFLICT`
- AND route evaluation MUST halt immediately

#### Scenario: Normal change in active repo selects standard

- GIVEN a change classified as `normal` in an active repository (`project.status: active`)
- WHEN route selection evaluates candidate routes
- THEN `lite` MUST be deemed ineligible due to classification mismatch
- AND `standard` MUST be selected as the matching eligible route

#### Scenario: Trivial change in active repo selects lite

- GIVEN a change classified as `trivial` in an active repository (`project.status: active`)
- WHEN route selection evaluates candidate routes
- THEN `standard` MUST be deemed ineligible due to classification mismatch
- AND `lite` MUST be selected as the matching eligible route

### Requirement: K1 Impact Risk Floor Live Dispatch Enforcement and Contextual Precedence {#REQ-routing-013}

K1 impact risk floors (`critical`, `planned`, `bounded`, `repair`, `direct`) MUST be connected to live route dispatch via immutable guarantee profiles (`FLOOR_GUARANTEES`). Sizing metrics (LOC, file counts) or explicit intent declarations (including `hotfix` and `bugfix`) MUST NOT lower or bypass an established impact floor.

When a change carries `critical` impact evidence (`auth_security`, `data_migration`), routes omitting full SDD assurance (`lite`, `hotfix`, `repair`, `direct`) MUST be disqualified, and the dispatcher MUST elevate candidate selection to `standard` (or equivalent full SDD route). When a change carries `planned` impact evidence (`public_api`), routes omitting specification or design (`lite`, `hotfix`) MUST be disqualified.

Contextual routes (`foundation`, `federated`, `brownfield`) MUST be evaluated before general workflow routes, retaining precedence regardless of change classification. Contextual prerequisite routes are exempt from floor required-phase eligibility while executing the prerequisite; the floor remains binding when routing the underlying implementation workflow. Among eligible custom or non-contextual routes, the declared table order in `openspec/config.yaml` MUST be strictly preserved using first-match evaluation.

#### Scenario: Auth security evidence blocks lite and hotfix

- GIVEN impact evidence indicating authentication or security surfaces are affected (`auth_security: true`)
- AND a small diff or explicit hotfix intent
- WHEN route selection evaluates candidate routes
- THEN the floor MUST resolve to `critical`
- AND candidate routes `lite` and `hotfix` MUST be disqualified
- AND route selection MUST elevate to `standard` with recorded floor reasons

#### Scenario: Public API impact blocks lite

- GIVEN impact evidence indicating public API or public contract changes (`public_api: true`)
- AND a candidate route of `lite`
- WHEN route selection evaluates candidate routes
- THEN the floor MUST resolve to `planned`
- AND `lite` MUST be disqualified
- AND route selection MUST elevate to a route satisfying specification and design guarantees

#### Scenario: Contextual route retains precedence over lite

- GIVEN a change classified as `small` with `baseline.status: pending`
- WHEN route selection evaluates candidate routes
- THEN the contextual route `brownfield` MUST be evaluated before general routes
- AND `brownfield` MUST match and retain precedence over `lite`

#### Scenario: Contextual prerequisite route precedence under critical floor

- GIVEN a change with `baseline.status: pending` (or `project.status: empty`)
- AND emergent or declared `critical` impact evidence (`auth_security: true`)
- WHEN route selection evaluates candidate routes
- THEN the contextual route (`brownfield` or `foundation`) MUST be selected as a prerequisite
- AND MUST NOT be disqualified by the implementation floor's required phases
- AND the critical floor MUST remain binding for subsequent implementation workflow routing

#### Scenario: Custom route ordering preserved

- GIVEN a custom routing table with multiple eligible routes matching the change classification
- WHEN route selection evaluates the candidate routes
- THEN the first matching route in declared table order MUST be selected

### Requirement: Continuation Route Invariance and Late Floor Blocker Gate {#REQ-routing-014}

When resuming an in-flight SDD change with an existing persisted route in `state.yaml` (`route.actual_route`), the dispatcher MUST lock in the persisted route without re-evaluating the declarative routing table, ensuring deterministic phase continuation. Contextual prerequisite routes (`foundation`, `brownfield`) are exempt from floor phase checks during continuation to allow completing prerequisite phases under elevated risk floors.

If newly discovered impact evidence during implementation or verification violates the minimum floor guarantees of the active persisted route (excluding contextual prerequisites), the dispatcher MUST NOT perform a silent route substitution or downgrade. It MUST halt execution immediately with `status: blocked` and `blocker_type: needs_user_decision` to request operator confirmation.

#### Scenario: Resuming active change preserves persisted route

- GIVEN an in-flight change with a persisted route in `state.yaml` resuming execution
- WHEN route selection is invoked with the persisted route option
- THEN the dispatcher MUST lock and return the persisted route
- AND MUST NOT re-evaluate table conditions

#### Scenario: Late discovery of auth impact during continuation halts with blocker

- GIVEN an in-flight change executing on route `lite`
- AND emergent impact evidence reveals `auth_security: true` during implementation
- WHEN continuation route validation evaluates the active route
- THEN it MUST detect that `lite` violates the `critical` floor guarantees
- AND MUST return `status: blocked` with `blocker_type: needs_user_decision`

#### Scenario: Continuation of contextual prerequisite route under critical floor

- GIVEN an in-flight change executing on a contextual prerequisite route (`brownfield` or `foundation`)
- AND `auth_security: true` is present
- WHEN continuation route validation evaluates the active route
- THEN it MUST preserve and lock the contextual prerequisite route
- AND MUST NOT block on missing implementation phases during prerequisite execution

