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
clarify, review-workload, impact, brownfield-advisory, 4r-review-gate
```

(5 entries)

### 3.3 KNOWN_REVIEWERS

Valid reviewer sub-agent labels used by the 4R gate:

```
review-risk, review-readability, review-reliability, review-resilience
```

(4 entries)

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
| 1 | `foundation` | `[normal, high-risk]` | `project.status: empty` | `[sdd-foundation]` | `[]` | medium |
| 2 | `federated` | `[normal, high-risk]` | `artifact_store.backend: workspace-federated` | `[sdd-workspace, sdd-propose, sdd-spec, sdd-design, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]` | `[impact, clarify]` | high |
| 3 | `bugfix` | `[small, normal]` | `explicit_bugfix_intent: true` | `[sdd-explore, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]` | `[4r-review-gate]` | medium |
| 4 | `brownfield` | `[normal, high-risk]` | `baseline.status: pending` | `[sdd-baseline]` | `[brownfield-advisory]` | medium |
| 5 | `refactor` | `[small, normal]` | `explicit_refactor_intent: true` | `[sdd-design, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]` | `[4r-review-gate]` | medium |
| 6 | `hotfix` | `[trivial, small]` | `explicit_hotfix_intent: true` | `[sdd-apply, sdd-verify, sdd-archive]` | `[]` | low |
| 7 | `standard` | `[normal, high-risk]` | `project.status: active` | `[sdd-propose, sdd-spec, sdd-design, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]` | `[clarify, 4r-review-gate]` | high |
| 8 | `lite` | `[trivial, small]` | `change.classification: small` | `[sdd-propose, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]` | `[]` | low |

### 4.2 Route-Specific Behaviors

**foundation**: Stops after `sdd-foundation` completes. MUST NOT auto-chain into the standard SDD flow.

**bugfix**: Is explicit-only. The user MUST signal bugfix intent (e.g., "fix bug", "bugfix", "quick fix"). The orchestrator MUST NOT auto-route to `bugfix` from classification signals alone.

**brownfield**: The `brownfield-advisory` gate runs first. `sdd-baseline` runs only on user consent. The route then re-routes to the underlying change route.

**refactor**: Is explicit-only. The user MUST signal refactor intent. It skips propose/spec phases, preserving existing functional behavior.

**hotfix**: Is explicit-only. Used for emergency patches. Applies fixes directly without planning overhead, but forces verification and archival.

**standard**: Lists `4r-review-gate` in `gates` to enable optional 4R review after a successful `sdd-verify`. Removing it from the list disables 4R for this route.

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

### 16.1 Evidence-Derived Review Dimensions {#REQ-routing-001}

At the `4r-review-gate`, the system MUST derive exactly `risk`, `reliability`, `resilience`, and `readability` from normalized evidence: affected paths, modified capabilities, operation types, dependencies, design risks, the real diff, and the verify outcome. Each dimension MUST contain `selected: true|false` and a non-empty ordered `reasons` list; a skipped dimension MUST be justified as explicitly as a selected one.

Evidence MUST be ranked deterministically: high-risk override; verify findings; real-diff facts; generalist escalation; design/dependency risks; then declared paths, capabilities, and operation types. Ties MUST use `risk`, `reliability`, `resilience`, `readability` order. Reasons MUST use stable codes, identify their source, be deduplicated, and follow the same ordering for identical normalized input.

#### Scenario: Normal documentation change skips irrelevant dimensions

- GIVEN a normal change whose evidence contains documentation-only paths and no verify, dependency, design, diff, or generalist risk signal
- WHEN review dimensions are derived
- THEN zero specialists MAY be selected
- AND every dimension MUST persist a deterministic skipped reason

#### Scenario: Stronger runtime evidence wins

- GIVEN declared metadata suggests documentation-only work but the real diff adds process execution and global configuration writes
- WHEN evidence is ranked
- THEN real-diff facts MUST take precedence over declared metadata
- AND `risk` and `reliability` MUST be selected with their evidence sources recorded

### 16.2 Classification Caps and High-Risk Override {#REQ-routing-002}

For a `normal` change, the system MUST count the justified positive review signals produced by the classifier and a valid generalist escalation after evidence precedence and canonical ordering. With zero positive signals it MUST select zero specialists; with one or two it MUST select exactly those targeted dimensions; with three or four it MUST set `depth.review` to `strict` and select all four dimensions for full 4R. No dimension in the three-or-four case MAY be labeled `normal-cap-excluded`. For one-or-two signals, any selection MUST retain the strongest dimensions using REQ-routing-001 precedence. A `high-risk` change MUST continue to select all four dimensions regardless of lower-precedence signals, with each reason identifying the classification override. Escalated selections MUST preserve canonical dimension order and the candidate evidence fingerprint.

#### Scenario: Normal change with no positive signals

- GIVEN a normal change whose normalized evidence and valid generalist result contain zero positive review signals
- WHEN the review dimensions are derived
- THEN zero specialists MUST be selected
- AND all four dimensions MUST persist deterministic skipped reasons

#### Scenario: Normal change with one or two positive signals

- GIVEN a normal change with one or two justified positive review signals
- WHEN the review dimensions are derived
- THEN exactly those targeted dimensions MUST be selected in canonical order
- AND no selected or skipped dimension MUST be marked as `normal-cap-excluded`

#### Scenario: Normal change with three positive signals escalates

- GIVEN a normal change produces three justified positive review signals
- WHEN the normal cap decision is applied
- THEN `depth.review` MUST equal `strict`
- AND all four dimensions MUST be selected for full 4R without discarding any signal

#### Scenario: Four-signal escalation preserves identity

- GIVEN a normal change produces four justified positive review signals and an evidence fingerprint
- WHEN strict full-4R selection completes
- THEN dimensions MUST be dispatched in `risk`, `reliability`, `resilience`, `readability` order
- AND the candidate fingerprint MUST remain unchanged

#### Scenario: High-risk always receives full 4R

- GIVEN a change is classified as high-risk
- WHEN the gate derives review dimensions
- THEN all four dimensions MUST be selected
- AND each dimension MUST record `high-risk-override` as a reason

### 16.3 Review Decision Contract and Audit {#REQ-routing-003}

Before specialist dispatch, the system MUST validate classification, normalized evidence, the generalist result, the four exact dimension keys, booleans, non-empty reasons, allowed specialist names, and the applicable signal-count or classification policy. It MUST run the read-only generalist before any specialist and persist under `gates.4r-review-gate` the classification, normalized evidence sources including the stable fingerprint, generalist decision, dispatch depth, escalation reason when applicable, and all four final dimension decisions and reasons. The audit MUST be read-merge-written without deleting existing gate fields such as `status`, `on_blocker`, `findings_summary`, or `surfaced_to_user`.

Raw diff content MUST NOT be required in state; stable normalized facts or references SHALL provide reproducible evidence. Contract-invalid or incomplete input MUST fail closed: the gate MUST become `blocked` for contract remediation, MUST NOT dispatch specialists, and MUST NOT silently fall back to unconditional 4R. A pre-change archived state lacking the new audit fields MUST remain readable and MUST NOT be retroactively rewritten.

#### Scenario: Complete deterministic audit

- GIVEN valid normalized evidence and a valid generalist result
- WHEN specialist selection completes
- THEN `state.yaml` MUST contain decisions and non-empty reasons for all four dimensions
- AND repeated evaluation of identical input MUST produce the same auditable decision data

#### Scenario: Invalid generalist result fails closed

- GIVEN the generalist returns an unknown specialist or a status/list mismatch
- WHEN the gate validates its inputs
- THEN the gate MUST record a contract-remediation blocker
- AND no specialist or downstream archive phase MUST be dispatched

#### Scenario: Escalation reason is auditable

- GIVEN a normal change has three or four positive review signals
- WHEN the reducer escalates to strict full 4R
- THEN the gate audit MUST record `depth.review: strict` and a non-empty escalation reason
- AND the recorded fingerprint and canonical dimension order MUST match the reducer input

#### Scenario: Malformed evidence fails closed

- GIVEN normalized evidence is malformed or incomplete
- WHEN the gate validates its inputs
- THEN the gate MUST record a contract-remediation blocker
- AND no generalist or specialist dispatch MUST occur

#### Scenario: Legacy state remains compatible

- GIVEN an archived change predates `review_dimensions`
- WHEN tooling reads its `4r-review-gate` audit
- THEN the historical gate fields MUST remain valid
- AND the system MUST NOT invent selection reasons for that archived change

### 16.4 Frozen Review Genesis and Targeted Correction {#REQ-routing-004}

The gate MUST freeze its deterministic candidate identity, genesis paths, classification, selected dimensions, initial evidence, and correction budget before specialist execution. The audit MUST persist a stable lineage identity, each selected dimension's execution state, immutable finding IDs, correction attempts, targeted-validation outcomes, and late follow-ups. The correction budget MUST include a maximum of three failed attempts and a bounded changed-line allowance fixed at lineage creation; the exact allowance policy MAY be selected by design but MUST NOT grow inside the lineage.

Targeted validation MUST only mark frozen finding IDs resolved or unresolved and detect regressions caused by the correction. It MUST NOT perform general discovery, add blocking finding IDs, select another dimension, expand genesis paths, or allocate new reviewer or correction budget. An unrelated late observation MUST be a non-blocking follow-up unless an explicit successor lineage or change grants it new authority.

#### Scenario: Targeted validation resolves frozen findings

- GIVEN a correction references frozen findings `F-001` and `F-002`
- WHEN targeted validation evaluates the correction
- THEN it MUST report resolution state only for those IDs and correction-caused regressions
- AND MUST NOT create another blocking finding or reviewer dispatch

#### Scenario: Correction escapes genesis

- GIVEN a proposed correction changes a path outside the frozen genesis paths
- WHEN the gate validates the attempt
- THEN the attempt MUST fail or escalate without expanding the lineage
- AND the original candidate, paths, dimensions, and budget MUST remain immutable

### 16.5 Read-Only Gate Continuation and Interruption Recovery {#REQ-routing-005}

Status, verification, delivery, and archive gates after lineage creation MUST revalidate the same candidate identity and persisted lineage state. They MUST be read-only with respect to reviewer selection and correction budget. If execution is interrupted or an outcome is ambiguous, the orchestrator MUST reconcile persisted state before continuing and MUST NOT relaunch a reviewer, validator, correction, or successor while the prior outcome remains unknown.

This change MUST provide deterministic candidate identity and lineage auditability, but MUST NOT require the complete cryptographic receipt authority planned for later roadmap milestones.

#### Scenario: Interrupted reviewer has unknown outcome

- GIVEN a selected specialist was launched and its terminal result was not persisted
- WHEN orchestration resumes
- THEN it MUST reconcile the lineage state before any new work is launched
- AND it MUST fail closed while the prior outcome remains unknown

#### Scenario: Archive revalidates without reopening review

- GIVEN a lineage completed targeted validation for its frozen candidate
- WHEN a downstream delivery or archive gate runs
- THEN it MUST validate the same candidate identity and terminal lineage state
- AND MUST NOT allocate reviewers, findings, attempts, or correction budget

---

## Clarifications

### Session 2026-06-21

- Q: When a gate with `on_fail: halt` fails and blocks archive, can the user force the archive anyway — and if so, with what audit trail? → A: Yes. The user MAY force archive by providing a written justification. The justification MUST be recorded in `state.yaml` under `gates.quality-gates.override` (with UTC timestamp and verbatim text) AND in an Override section of `verify-report.md`. Archive is dispatched only after both audit entries are written (full-traceability override).
