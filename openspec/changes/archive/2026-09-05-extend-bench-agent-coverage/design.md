# Design: Extend Bench Agent Coverage (canonical agent identity)

## Technical Approach

Introduce a single resolution module — `scripts/lib/agent-identity.js` (JS) mirrored by
`internal/agentidentity` (Go) — that maps a registered agent name to exactly one canonical
harness agent or to the sentinel `"unresolved"`. The two producers (`SubagentStop` phase-cost
emitter in JS and Go) and the validator (`validCostRow` in `scripts/evals/lib/benchmark.js`,
consumed unchanged by CX0) all call this resolution. No registry, no config, no new
dependency: a pure function over a closed set encoded in code.

This follows the repo's established JS/Go mirroring convention (`scripts/lib/result-envelope.js`
↔ `internal/resultenvelope`), including mirrored parity test tables.

## Architecture Decisions

### Decision: Module placement and mirroring strategy

**Choice**: JS source of truth in `scripts/lib/agent-identity.js`; manual Go mirror in a new
`internal/agentidentity` package, exported as `agentidentity.ResolveCanonicalAgent(string) string`
and `agentidentity.DerivePhaseKey(string) string`.
**Alternatives considered**: (a) codegen from a single source — rejected: the repo has no JS→Go
codegen mechanism and building one for ~40 lines is overengineering; (b) Go as source of truth —
rejected: hooks and bench both live in JS today; (c) duplicating the convention at each site —
rejected: that is the bug being fixed.
**Rationale**: Matches the proven `result-envelope` pattern (manual mirror + mirrored parity
tests). Single logical point of truth; the mirror is enforced by tests, not by hope.

### Decision: Prefix grammar

**Choice**: A registered name may carry at most one host/plugin prefix, expressed as everything
before the single `:` separator. Resolution rule:

1. Trim whitespace; non-string/empty → `unresolved`.
2. If the name contains `:`, it must contain exactly one `:` with non-empty prefix and
   non-empty remainder; resolve the remainder. Otherwise → `unresolved`.
3. The bare name resolves iff it matches `sdd-[a-z][a-z0-9-]*` (non-empty suffix) or is one of
   the six allowlisted review agents (`review-change`, `review-trust`, `review-runtime`,
   `review-evolution`, `review-efficiency`, `review-correction`). Resolution returns the bare
   name itself (identity for unprefixed input).

**Alternatives considered**: (a) allowlist of known prefixes (`ospec-workflow:`) — rejected:
prefixes are host-controlled and open-ended; membership of the *remainder* in the closed set is
the actual gate; (b) strip all colons recursively — rejected: `a:b:sdd-spec` indicates a
malformed/foreign name and must fail closed; (c) regex-only without review allowlist — rejected:
`review-*` must stay closed-world (existing invariant in `derivePhaseKey`).
**Rationale**: Tolerates any host prefix while the closed set (not prefix matching) decides
ownership. Foreign or double-prefixed names fail closed.

### Decision: Failure semantics — `unresolved` sentinel, fail-safe everywhere

**Choice**: Resolution returns the string `"unresolved"`; it never throws. Emitter: an
`unresolved` name produces no phase-cost record (existing skip path). Bench: an `unresolved`
`row.agent` fails coverage validation.
**Alternatives considered**: throwing on foreign names — rejected: the hook MUST be fail-safe
(REQ-hooks-001); nullable return — rejected: a string sentinel keeps JS/Go signatures identical.
**Rationale**: One outcome value, two consumer policies, both already existing skip/reject paths.

### Decision: Compatibility strategy (O1)

**Choice**: For unprefixed names, canonical output is byte-identical to today's emitted
`agent`/`phase`: `derivePhaseKey` semantics are preserved verbatim (strip `sdd-` for phase
agents; allowlisted review agents are their own phase key; everything else `""`). The emitter
records the *resolved canonical* name in `row.agent`; `canonicalPersistedO1Row` and the v1/v2/v3
attestation formats are untouched. The bench tolerates a prefixed `row.agent` at validation time
(resolution happens in `validCostRow`), so legacy rows with prefixed agents validate without
rewriting evidence.
**Alternatives considered**: normalizing `row.agent` in persisted rows — rejected: would break
attestation hashes and existing O1 evidence.
**Rationale**: Zero migration; success criterion "existing O1 rows remain valid" holds by
construction.

### Decision: Scope of hook integration

**Choice**: Canonical resolution is applied at the dispatch-classification points of the
phase-cost path (`persistPhaseCost` in JS, `persistPhaseCost` in Go): raw name →
`ResolveCanonicalAgent` → `DerivePhaseKey(canonical)`. `derivePhaseKey`/`DerivePhaseKey` remain
as the phase-key half of the authority, now moved into/behind the shared module (hook-local
copies deleted). Envelope-persistence paths (`persistResultEnvelope`) keep their current
behavior BY DESIGN (tasks 3.2/4.2, spec "without altering its outcome"): they consume the raw
agent name and do NOT go through the canonical resolution, so foreign names still yield `""`
(no state update) and prefixed `sdd-*` names remain outside the envelope-persistence path.
Canonical coverage applies only to the phase-cost path.
**Alternatives considered**: canonicalizing inside `resolveAgentName` — rejected: that function
feeds `resultenvelope.ValidateForPhase` and logging where the raw name is contractually
expected; changing it risks envelope-validation drift out of scope.
**Rationale**: Smallest change that removes the bug class without touching the envelope contract.

## Data Flow

    host dispatch (agent_type = "plugin-host:sdd-spec")
        │
        ▼
    resolveAgentName (existing field-order picker, raw)          scripts/hooks/subagent-stop.js
        │                                                        internal/hooks/subagentstop.go
        ▼
    ResolveCanonicalAgent(raw)  ── "unresolved" ──► skip (no row) / bench rejects row
        │  "sdd-spec"
        ▼
    DerivePhaseKey("sdd-spec") = "spec"
        │
        ▼
    phase-costs.jsonl  { phase: "spec", agent: "sdd-spec", ... }
        │
        ▼
    readPhaseCosts → validCostRow ── ResolveCanonicalAgent(row.agent) ──► coverage check
        │                                                        scripts/evals/lib/benchmark.js
        ▼
    CX0 coverability consumption (unchanged, downstream of validCostRow)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/agent-identity.js` | Create | `resolveCanonicalAgent(raw)`, `derivePhaseKey(canonical)`, `UNRESOLVED`, `REVIEW_AGENTS`. Pure, no I/O. |
| `scripts/lib/agent-identity.test.js` | Create | Unit + O1 compat + prefixed regression + closed-set cases. |
| `internal/agentidentity/agentidentity.go` | Create | Go mirror; exported for parity tests. |
| `internal/agentidentity/agentidentity_test.go` | Create | Mirrored case table (byte-for-byte case parity with JS test, per resultenvelope convention). |
| `scripts/hooks/subagent-stop.js` | Modify | `persistPhaseCost` classifies via shared resolution; delete local `derivePhaseKey`; import from `scripts/lib/agent-identity.js`. |
| `scripts/hooks/subagent-stop.test.js` | Modify | Prefixed-name dispatch produces canonical row; foreign names still skip. |
| `internal/hooks/subagentstop.go` | Modify | Same integration as JS; local `derivePhaseKey` delegates to `agentidentity` package. |
| `internal/hooks/subagentstop_test.go` (o el archivo de tests de hook Go vigente) | Modify | Mirrored prefixed/foreign dispatch cases. |
| `scripts/evals/lib/benchmark.js` | Modify | `validCostRow`: replace `row.agent === \`sdd-${row.phase}\`` with canonical-resolution coverage check. |
| `scripts/evals/lib/benchmark.test.js` | Modify | Prefixed row passes; review-agent row passes; foreign row fails; unprefixed row unchanged. |

## Interfaces / Contracts

```js
// scripts/lib/agent-identity.js
const UNRESOLVED = "unresolved";
const REVIEW_AGENTS = ["review-change", "review-trust", "review-runtime",
  "review-evolution", "review-efficiency", "review-correction"];
function resolveCanonicalAgent(rawName) { /* string -> canonical | UNRESOLVED */ }
function derivePhaseKey(canonicalAgent) { /* "sdd-x"->"x", REVIEW_AGENTS->self, else "" */ }
```

```go
// internal/agentidentity/agentidentity.go
package agentidentity
const Unresolved = "unresolved"
func ResolveCanonicalAgent(rawName string) string
func DerivePhaseKey(canonicalAgent string) string
var ReviewAgents = [...]string{...}
```

`validCostRow` coverage clause becomes:
`const canonical = resolveCanonicalAgent(row.agent); const key = derivePhaseKey(canonical);`
row passes coverage iff `canonical !== UNRESOLVED && key !== "" && row.phase === key`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (JS) | Resolution grammar: unprefixed sdd/review identity, single-prefix strip, double colon → unresolved, `sdd-` empty suffix → unresolved, non-string → unresolved, foreign `review-invented` → unresolved | `agent-identity.test.js` table-driven |
| Unit (Go) | Same table, mirrored | `agentidentity_test.go`, cases byte-identical to JS |
| Parity (E1) | Go/JS identical outcomes over the spec's representative set (`sdd-spec`, `host:sdd-spec`, `review-runtime`, `host:review-runtime`, `review-invented`) plus regression prefixed case | Both runtime tests assert the same expected map; regression case named for the prefix bug class |
| Integration (hooks) | Prefixed dispatch → canonical `row.agent`/`phase` equal to today's unprefixed output; foreign dispatch → no record; fail-safe on resolution error | Extend `subagent-stop.test.js` and Go hook tests |
| Integration (bench) | `validCostRow` prefixed pass, review pass, unprefixed unchanged pass, foreign fail | Extend `benchmark.test.js` with literal row fixtures |
| O1 compat | Existing persisted rows and `canonicalPersistedO1Row` attestations unchanged | Existing benchmark tests must stay green without fixture edits |

## Migration / Rollout

No migration required. Canonical values equal today's emitted values for unprefixed names;
persisted O1 rows and attestations remain valid. Rollback = revert module + restore strict
equality in `validCostRow` and prior `derivePhaseKey` (single commit revert).

## Open Questions

- None blocking. The Go hook test filename is confirmed during tasks (the proposal cites
  `store_test.go`; the actual hook test file governs).
