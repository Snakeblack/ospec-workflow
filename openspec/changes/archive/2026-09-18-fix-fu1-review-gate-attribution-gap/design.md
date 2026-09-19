# Design: Fix FU1 — quality-review gate attribution gap for clean kernel-contract changes

## Technical Approach

Four layers, each independently testable (maps to proposal Approach):

1. **Kernel lib (`scripts/lib/review-dimensions.js`)**: emit a deterministic synthetic fact `kernel-contract-change` (domains `trust`,`evolution`) inside `normalizeQualityReviewEvidence` when a validated `capability_scope` covers `schemas/kernel/**` paths. Make the `runtime-code-without-domain-attribution` rule per-capability so the synthetic fact cannot mask other ambiguity codes. Add pure override validation (`validateAttributionOverride`) and extend `validateRouterDecision`/`mergeRouterDecision` with an optional strict `resolution` object (REQ-001, REQ-002, REQ-003).
2. **Gate (`scripts/lib/review-gate-state.js`)**: `planQualityReviewGate` accepts an optional `attributionOverride` (already validated); on match it closes the listed ambiguity codes, records the resolution in the gate audit, and never re-derives the closed code (REQ-routing-003 MODIFIED).
3. **Lineage (`scripts/lib/review-lineage.js`)**: `createSuccessor` branches on `predecessor.schema_version === 2` and calls `startQualityReviewLineage`, failing closed on taxonomy mixing (REQ-004 / REQ-routing-012).
4. **Build propagation**: kernel libs are already shipped into every target dist via the BFS require-graph seeded in `scripts/configure/cli.js` (`RUNTIME_ENTRY_SCRIPTS` L73-84). No generator change is needed for the libs themselves; propagation = regenerate dist + extend per-target `validate-*.js` sentinels for the attribution behavior and native tool mappings (REQ-install-026).

The config loader (`quality_review.attribution_override` in `openspec/config.yaml`) lives in `scripts/route-dispatch-run.js` (the existing I/O adapter layer); kernel libs stay pure.

## Architecture Decisions

### Decision: Synthetic fact emitted in the normalizer, not special-cased in the classifier

**Choice**: `kernel-contract-change` is added to `V2_SIGNALS`/`V2_FACT_SOURCES` (source `metadata`) and emitted in `normalizeQualityReviewEvidence` per kernel-contract scope, with `attributed_capabilities: [<scopeId>]`, flowing through `attributeFactsFromScopes` → `buildCapabilityCoverage` → fingerprint like any fact.
**Alternatives considered**: (a) special-case inside `classifyQualityReview` that skips `public-kernel-contract-unattributed`; (b) attribute domains directly in `buildCapabilityCoverage` without a fact.
**Rationale**: spec REQ-001 requires the fact to respect the fingerprint and appear in the routing audit; option (a) leaves no auditable trace and diverges from the evidence contract; option (b) breaks the invariant that coverage derives from facts.
**Evidence and consequences**: `review-dimensions.js` L509-521 (fact assembly), L539-577 (scope attribution/coverage). Changes the normalized-evidence content for kernel-scope changes (fingerprint differs from pre-change runs of the same input) — acceptable, see fingerprint decision below.

### Decision: Runtime ambiguity rule becomes per-capability

**Choice**: replace the global `runtimePaths.length && !globalDomains.length` guard (L643) with: fire when any behavioral capability has runtime production paths in scope and zero `attributed_domains`.
**Alternatives considered**: keep the global guard.
**Rationale**: with the synthetic fact, `globalDomains` becomes non-empty for any change that also touches kernel scopes — the global guard would silently stop firing for mixed changes, violating spec scenario "Scope attribution does not mask other ambiguity codes".
**Evidence and consequences**: `classifyQualityReview` L642-644. Small behavioral widening; covered by replay + masking tests.

### Decision: Override is a pure, validated policy object consumed by the gate planner

**Choice**: `validateAttributionOverride(block)` in `review-dimensions.js` (strict: non-empty `justification`, non-empty `scope` patterns, `applies_to` ⊆ `AMBIGUITY_CODES`; anything else → structured error, gate stays blocked). `planQualityReviewGate({ attributionOverride })` applies it only to codes listed in `applies_to` whose residual paths match `scope`, records `{ source: "attribution-override", justification, scope, closed_codes }` in the audit, and removes closed codes from `ambiguity_reasons` in the same evaluation (REQ-routing-003 MODIFIED).
**Alternatives considered**: (a) override applied inside the classifier; (b) override handled ad hoc by the orchestrator skill.
**Rationale**: keep the classifier deterministic and evidence-only; the override is policy, and policy application is the gate's job (mirrors the `quality_gates` pattern: config declares, verify/gate consumes). Orchestrator-side handling would be unauditable by the reducers.
**Evidence and consequences**: config.yaml `quality_gates` comment block (L164-218) as the declarative pattern; `planQualityReviewGate` (review-gate-state.js L61-131). Absence of the block is a strict no-op; malformed block fails closed with a structured validation error (never silent bypass).

### Decision: Router contract gains an optional `resolution` object

**Choice**: `validateRouterDecision` accepts an optional exact-shape `resolution: { source: "scope-attribution" | "attribution-override", codes, justification?, scope }`. Residual evidence without `fact_codes` still cannot close anything by itself; `mergeRouterDecision` validates that every closed code is justified by one of the two sources.
**Alternatives considered**: encode the resolution inside the free-text `reason`.
**Rationale**: `ROUTER_REASON` is a bounded regex; structured data in free text is unvalidatable and unauditable. The spec requires the contract to *accept* justified domains, not to relax validation.
**Evidence and consequences**: `validateRouterDecision` L733-760. Additive key; existing decisions without `resolution` keep validating.

### Decision: `createSuccessor` branches by predecessor schema version

**Choice**: v2 terminal predecessor → `startQualityReviewLineage` with the predecessor's genesis domains and successor meta (generation, `predecessor_lineage_id`, recovery); request carrying `selected_dimensions` against a v2 predecessor (or forcing v1 output) throws a structured taxonomy `TypeError` before any state is created.
**Alternatives considered**: migrate-then-successor two-step.
**Rationale**: REQ-routing-012 requires native v2 succession; a two-step would reintroduce the manual construction this change removes.
**Evidence and consequences**: `createSuccessor` L607-643, `startQualityReviewLineage` L141-185. Budget/approval semantics (`-bounded-review-###` reference, authority kinds) are reused unchanged.

### Decision: Fingerprint compatibility via snapshot self-consistency + replay tests

**Choice**: do not version `fingerprintEvidence`. Persisted gates/lineages carry their own `evidence.sources` snapshot; `validateQualityEvidence` recomputes the fingerprint from that snapshot, so pre-change persisted states remain valid. Only freshly normalized evidence (new or re-normalized inputs with kernel scopes) changes fingerprint.
**Alternatives considered**: `fingerprint_v2` field or evidence schema bump.
**Rationale**: the fingerprint pins the evidence snapshot, not the classifier version; re-normalizing the same diff under a new classifier legitimately yields new facts. Schema bump would force migration of live v2 gates for zero behavioral gain.
**Evidence and consequences**: `validateQualityEvidence` L762-768. Mitigation: replay tests feed pre-change persisted gate/lineage fixtures through validation and gate planning and assert they still validate and still close correctly.

## Data Flow

Sequence, layer by layer (lib → gate → lineage → build):

```
route-dispatch-run.js        review-dimensions.js         review-gate-state.js        review-lineage.js
      │                             │                            │                          │
 read config.yaml                  │                            │                          │
 quality_review.                   │                            │                          │
 attribution_override ────┐        │                            │                          │
      │                  │        │                            │                          │
 normalizeQualityReviewEvidence(diff, paths, capability_scopes) │                          │
      ├───────────────────────────►│ emits kernel-contract-change (trust,evolution)         │
      │                            │ fingerprint(sources)                                   │
 classifyQualityReview(evidence)   │                          │                          │
      ├───────────────────────────►│ sufficient | ambiguous(codes)                          │
 planQualityReviewGate({classifierDecision, routerDecision?, attributionOverride})          │
      ├───────────────────────────────────────────────────────►│ closes matched codes      │
      │                            │      (ambiguous, no resolution → dispatch review-change│
      │                            │       with residual evidence; validateRouterDecision)  │
      │◄── plan {status, dispatch, archive_allowed, gate audit with resolution} ─────────────│
 sufficient/domains selected → startQualityReviewLineage(v2) ─────────────────────────────►│
 terminal + approved successor → createSuccessor(v2→v2) ───────────────────────────────────►│
      │                                                                                    
 build: node scripts/configure/cli.js → dist per target (BFS ships review-dimensions/
 gate-state/lineage into every target) → validate-{claude,vscode,github-copilot,opencode}.js
```

Failure paths: malformed override → `blockedGate` with structured `validation_error_codes: ["attribution-override-invalid"]`, ambiguity stays unresolved. Router claiming resolution without a valid source → `router-contract-invalid`. Mixed-taxonomy successor → `TypeError`, no lineage created.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/review-dimensions.js` | Modify | `kernel-contract-change` signal+source, emission per kernel scope, per-capability runtime rule, `validateAttributionOverride`, router `resolution` contract |
| `scripts/lib/review-gate-state.js` | Modify | `attributionOverride` param, resolution audit record, closed-code removal |
| `scripts/lib/review-lineage.js` | Modify | `createSuccessor` v2 branch + taxonomy fail-closed |
| `scripts/route-dispatch-run.js` | Modify | Load optional `quality_review.attribution_override` from `openspec/config.yaml`, pass to gate planning |
| `skills/_shared/gate-4r-review.md` | Modify | Document scope attribution, override route, resolution audit |
| `openspec/config.yaml` | Modify | Commented `quality_review.attribution_override` block (pattern of `quality_gates`) |
| `scripts/configure/validate-claude.js`, `validate-vscode.js`, `validate-github-copilot.js`, `validate-opencode.js` | Modify | Sentinels covering attribution behavior via each target's native tool mapping |
| `docs/roadmaps/harness-evolution.md` | Modify | FU1 done; register 2 follow-ups (phase reducer, journal failed) |
| `scripts/lib/review-dimensions.test.js`, `review-gate-state.test.js`, `review-lineage.test.js` (existing test files) | Modify | RED→GREEN per layer + replay fixtures |

No new source files: keeping override validation inside `review-dimensions.js` preserves the single-module evidence contract and the existing BFS dist seeding without new entry points.

## Interfaces / Contracts

```js
// review-dimensions.js — new/extended exports
validateAttributionOverride(block)            // { valid, errors } — strict, fail-closed
classifyQualityReview(evidence)               // unchanged signature; new fact code observable
validateRouterDecision(value)                 // + optional exact `resolution` key
mergeRouterDecision(classifier, router)       // honors resolution-backed domains
// review-gate-state.js
planQualityReviewGate({ ..., attributionOverride })  // audit gains `resolution` record
// review-lineage.js
createSuccessor(predecessorV2, { selected_domains }) // v2 successor; mixed taxonomy throws
```

Invariants: residual evidence without `fact_codes` never closes a code; a closed code never re-appears as unresolved in the same evaluation; override never suppresses findings or unselects fact-derived domains; predecessor records stay immutable; `codex`/`cursor`/`antigravity` target outputs carry no attribution-specific projection deltas (the shared runtime scripts are identical bytes across targets by construction — see Open Questions).

## Testing Strategy

| Requirement / quality concern | Trigger and conditions | Expected response | Verification |
|--------------------------------|------------------------|-------------------|--------------|
| REQ-001 clean kernel-scope `normal` sufficient | diff with zero lexical signal, `capability_scopes` under `schemas/kernel/**`, clean verify | `kernel-contract-change` fact with valid fingerprint; domains `trust`,`evolution`; `sufficient`; no `public-kernel-contract-unattributed`; gate reaches dispatch/archive | Unit `review-dimensions.test.js` + `review-gate-state.test.js` (TDD focused, `npm test`) |
| REQ-001 no masking | kernel scopes + out-of-scope runtime capability with zero signal | out-of-scope capability unattributed; `ambiguous` via `runtime-code-without-domain-attribution` | Unit, classifier + planner |
| REQ-002 valid override closes auditable | well-formed override, residual = `public-kernel-contract-unattributed` in scope | code closed, audit records justification/scope/closed codes, dispatch/archive proceeds | Unit + planner integration |
| REQ-002 malformed fails closed | empty `justification` / absent `scope` / unknown `applies_to` | structured error, ambiguity unresolved, no silent no-op | Unit incl. all three malformations |
| REQ-002 no cross-code application | override lists only kernel code; residual is `runtime-code-without-domain-attribution` | stays unresolved | Unit |
| REQ-003 router contract | decision with valid `resolution`; residual without `fact_codes` and no resolution | validates / stays blocked `quality-review-ambiguity-unresolved` | Unit |
| REQ-004 / routing-012 successor v2 | terminal v2 predecessor; mixed-taxonomy request | v2 successor with predecessor intact / `TypeError`, no lineage | Unit `review-lineage.test.js` |
| Fingerprint compatibility (risk) | replay pre-change persisted gate/lineage snapshots | still validate; plan correctly | Replay fixtures in `review-dimensions.test.js` / `review-gate-state.test.js` |
| install-026 propagation | regenerate dist; run `validate-{claude,vscode,github-copilot,opencode}` | attribution behavior present via native mappings; out-of-scope targets byte-stable in their differentiated outputs | Configure tests self-generating dist in temp dir (never root `dist/`) |

## Migration / Rollout

No data migration. The override block is opt-in and commented out; the synthetic fact is computed at runtime. Rollback = revert the PR; the gate returns to fail-closed behavior with no persisted-state migration (per proposal).

## Open Questions

- [ ] REQ-install-026 "out-of-scope targets byte-equivalent": kernel runtime scripts ship identically into all six target dists via `cli.js` BFS. Interpretation used here: byte-equivalence applies to target-differentiated projections (skills/agents/rules/native mappings), while shared `scripts/lib/**` bytes change in all targets. If strict byte-equivalence of `codex`/`cursor`/`antigravity` dists (including runtime scripts) is required, a per-target script filter would be needed — flag for tasks/verify.
- [ ] Exact override `scope` matching semantics (glob vs prefix) — proposal and spec say "path patterns"; design assumes prefix/glob consistent with `SELF_REVIEW_PREFIXES` style, to be pinned in tasks.
