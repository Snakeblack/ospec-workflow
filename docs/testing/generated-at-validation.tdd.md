# Canonical `generated_at` validation — TDD evidence

## Source and user journeys

No plan file was used. The behavior comes from the archived fixed-policy reference
baseline contract in
`openspec/changes/archive/2026-07-31-fixed-policy-reference-baseline/specs/orchestrator-evals/spec.md`
and the preserved reliability finding `F-d188c3936972981c`.

- As a baseline consumer, I need every candidate to carry a canonical generation
  timestamp so its identity is deterministic and comparable.
- As a baseline publisher, I need malformed temporal metadata rejected before a
  `baseline_id` is calculated or Markdown is rendered.

The accepted representation is the exact UTC form emitted by
`new Date().toISOString()`. Validation uses a parse-and-round-trip check, so offsets,
omitted milliseconds, malformed strings, and impossible calendar dates are not
accepted as alternative identities for the same instant.

## Task report

| Behavior | RED evidence | GREEN evidence | Guarantee |
| --- | --- | --- | --- |
| Reject missing `generated_at` | `node --test scripts/evals/lib/benchmark.test.js` returned 18 pass / 3 fail; this case received `baseline-id-mismatch` instead of `invalid-generated-at` | Same focal target returned 21/21 pass | Missing temporal identity produces the stable `invalid-generated-at` error before baseline digest validation or rendering |
| Reject a non-string value | The same RED run received `baseline-id-mismatch` for numeric `generated_at` | Same focal target returned 21/21 pass | Non-string temporal metadata is rejected, including through `buildReferenceCandidate()` |
| Reject malformed, noncanonical, or impossible timestamps | The same RED run received `baseline-id-mismatch` for `not-a-timestamp`; the test also covers 30 February, an offset timestamp, and omitted milliseconds | Same focal target returned 21/21 pass | Only the canonical UTC `toISOString()` representation of a real instant is accepted |
| Accept a canonical UTC timestamp | The canonical control passed during RED while the three rejection cases failed | Same focal target returned 21/21 pass | A timestamp emitted by `Date.toISOString()` remains valid and renderable |

The RED checkpoint is commit `f9730f854e87b65bdd27a863a5bd06ac9f768370`
(`test(evals): reproduce generated_at inválido`). The normal pre-commit hook also
observed the intentional RED state: 1556 tests, 1551 pass, 3 fail, and 2 skipped.
Because a failing checkpoint cannot pass that hook, only this RED commit was created
with `--no-verify`.

## Test specification

| # | What is guaranteed | Test or command | Type | Result |
| --- | --- | --- | --- | --- |
| 1 | An absent `generated_at` blocks digest validation and rendering with `invalid-generated-at` | `benchmark.test.js: reference candidate rejects a missing generated_at before baseline identity or rendering` | unit | PASS |
| 2 | A numeric `generated_at` is rejected by both validator and builder | `benchmark.test.js: reference candidate rejects a non-string generated_at before baseline identity` | unit | PASS |
| 3 | Invalid syntax, impossible dates, offsets, and omitted milliseconds are noncanonical | `benchmark.test.js: reference candidate rejects noncanonical or impossible ISO-8601 generated_at values` | unit | PASS |
| 4 | Exact UTC output from `Date.toISOString()` is accepted | `benchmark.test.js: reference candidate accepts the canonical UTC timestamp emitted by Date.toISOString` | unit | PASS |
| 5 | All eval tests remain compatible | `node --test scripts/evals/safe-export.test.js scripts/evals/live-driver.test.js scripts/evals/run.test.js scripts/evals/lib/fixtures.test.js scripts/evals/lib/benchmark.test.js scripts/evals/lib/assertions.test.js` | regression | PASS (107/107) |
| 6 | The repository validation remains green | `npm test` | regression | PASS (`All checks passed`) |

## Coverage and known gaps

`node --test --experimental-test-coverage scripts/evals/lib/benchmark.test.js`
passed 21/21 and reported 92.76% lines, 75.85% branches, and 98.44% functions for
`scripts/evals/lib/benchmark.js`.

The focal branch result is below 80% because `benchmark.js` also contains unrelated
benchmark loading, transcript, and O1 error paths not exercised by this one test file.
The six-file eval regression suite was executed without coverage instrumentation, so
no broader percentage is claimed. This change adds no browser, network, or live model
journey; the affected contract is a synchronous pure validator/builder/render path.

## Merge evidence

- RED: three rejection cases failed for the intended missing validation, while the
  canonical control passed.
- GREEN: the same focal target passed 21/21 after the minimal validator change.
- Regression: all 107 eval tests and `npm test` passed.
- Checkpoints are intentionally separate: the RED test commit above and
  `fix(evals): valida generated_at canónico` for implementation, GREEN tests, and
  this report.
