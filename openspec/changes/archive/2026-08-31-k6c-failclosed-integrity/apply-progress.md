# Apply Progress: K6c Fail-Closed Integrity

Delivery: `size:exception` accepted (exception-ok). First apply batch implements all 15 tasks (Phases 1–7). Working branch: `fix/k6c-failclosed-integrity`. K6d remains blocked. `strategy-policy.js`, catalog, and selection tables were not modified.

## 2026-08-31 — Phases 1–7 (focused TDD)

- [x] 1.1 RED: `integrity.test.js` omitted `bindings.evidenceStrategy` currently returned `ok: true`; identity-only `validateChallengePlan(plan)` stayed ok. Matching binding uses selected constant `"feature"`, not `plan.evidence_strategy`.
- [x] 1.2 GREEN: `assertEvidenceStrategyBinding` requires non-empty equality; result-set always gated; `validateChallengePlan` gated when any evaluation key is present. Truthy skip removed. Success callers pass `{ evidenceStrategy: "feature" }`. `node --test scripts/lib/adversarial-challenges/integrity.test.js` — 3 pass.
- [x] 2.1 RED: `declaredStrategy: "feature"` + canonical `bug` plan still accepted until the selected strategy was threaded.
- [x] 2.2 GREEN: `evaluateChallengeEvidence` forwards `opts.evidenceStrategy`; `verifyCandidate` passes `selectStrategy(...)` into eval and `projectAssuranceGraph`.
- [x] 2.3 Pin: `strategy-policy.js` unmodified; `selectStrategy(undefined)` and `selectStrategy("not-a-strategy")` still `"strict-tdd"`.
- [x] 3.1 RED: projector/replay ignored Candidate strategy, so `feature` vs canonical `bug` plan still projected.
- [x] 3.2 GREEN: projector uses `input.evidenceStrategy`; replay uses `persistable.evidenceStrategy` (from `verified.strategy`) and maps integrity failure to `GRAPH_DIVERGENCE`. Existing K6c project/replay callers pass selected `"feature"` / `verified.strategy`.
- [x] 4.1 RED: omitted/empty/`not-a-strategy` still coerced to `strict-tdd`.
- [x] 4.2 GREEN: `createChallengePlan` TypeError (`requires evidenceStrategy` vs `rejects unknown evidenceStrategy`); no `{ok, reason_code}` envelope. `node --test scripts/lib/adversarial-challenges/planner.test.js` — 9 pass (proportional + determinism intact).
- [x] 5.1 RED: missing tests / empty mutations / no-op apply emitted `passed` or `COMPLACENT_TEST_DETECTED`.
- [x] 5.2 GREEN: `missing_tests` → `MISSING_TESTS`; `mutations_tested===0` → `NO_MUTATION_APPLIED`; unchanged bytes → `CHALLENGE_NOOP`; COMPLACENT only after a real byte change. `node --test scripts/lib/adversarial-challenges/runner.test.js` — 12 pass (COMPLACENT, tautology, capability, timeout, scope intact).
- [x] 6.1 RED: duplicate `node_id` in `challenge-result` `required` and claims; `validateSchemaDocument` absent.
- [x] 6.2 GREEN: unique `node_id`; `validateSchemaDocument` walks every `required` with existing `uniqueItems`; `k1-schema-compat` invokes it. Walk found no other uniqueness offenders. K1/K6b/`K1_SCHEMA_BASELINE` pins pass. Cross-bound `validateChallengeResultSet` uses `{ evidenceStrategy: "bug" }`.
- [x] 7.1 No leftover `bindings.evidenceStrategy &&` skip; catalog/selection/`strategy-policy.js` untouched; K6d still gated on `challenge_verification.status === "accepted"`.
- [x] 7.2 Focal suites: 156 pass (`integrity`, `planner`, `runner`, `independent-verifier/index`, `assurance-graph/index`, `kernel-schema-validator`, `k6c-schema-fixtures`, `k1-schema-compat`).

### TDD evidence (focused)

| Task | Test file | RED | GREEN | RUN |
| ---- | --- | --- | ----- | --- |
| 1.1–1.2 | `scripts/lib/adversarial-challenges/integrity.test.js` | omitted binding `ok: true` | require binding | 3 pass |
| 2.1–2.3 | `scripts/lib/independent-verifier/index.test.js` | mismatch still PASS | thread `selectStrategy` | mismatch + matching PASS |
| 3.1–3.2 | `scripts/lib/assurance-graph/index.test.js` | wrong-strategy still projected | `input`/`persistable.evidenceStrategy` | GRAPH_DIVERGENCE, no graph |
| 4.1–4.2 | `scripts/lib/adversarial-challenges/planner.test.js` | no throw | TypeError requires/rejects unknown | 9 pass |
| 5.1–5.2 | `scripts/lib/adversarial-challenges/runner.test.js` | `passed` on missing tests | error reasons | 12 pass |
| 6.1–6.2 | `kernel-schema-validator.test.js`, `k6c-schema-fixtures.test.js` | duplicate required / missing helper | unique + `validateSchemaDocument` | published families pass |

### `npm test`

`npm test` (`node scripts/check.js`) reported 2881 pass, 1 fail, 3 skipped. The failure is outside this change: `scripts/configure/cli.test.js` `"RED: evidence authorization rejects a symlinked change root"` — `t.after` calls `fs.rmSync(link, { force: true })` without `recursive` and throws `ERR_FS_EISDIR` on the junction/symlink. Assertion of `rootedEvidencePath(...) === null` is unrelated to K6c. Leftover `openspec/changes/evidence-link` was removed after the run. No K6c, planner, runner, verifier, graph, or schema test failed.

### Discoveries

- `k1-schema-compat` uniqueness walk over published families found only the known `challenge-result` duplicate `node_id`; no other uniqueness-only schema edits.
- Projector/replay callers that already passed `candidate`/`executionGraph` became evaluation bindings after 1.2, so they needed the selected strategy threaded (phases 2–3) rather than a self-copy of `plan.evidence_strategy`.

### Deviations from design

None — implementation matches design.
