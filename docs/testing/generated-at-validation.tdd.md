# ISO-8601 `generated_at` validation — TDD evidence

## Source and user journeys

No plan file was used. The behavior comes from the archived fixed-policy reference
baseline contract in
`openspec/changes/archive/2026-07-31-fixed-policy-reference-baseline/specs/orchestrator-evals/spec.md`
and the preserved reliability finding `F-d188c3936972981c`.

- As a baseline consumer, I need every candidate to carry a valid ISO-8601 generation
  timestamp so its temporal identity is explicit and comparable.
- As a baseline publisher, I need malformed temporal metadata rejected before a
  `baseline_id` is calculated or Markdown is rendered.

The builder emits the UTC form from `new Date().toISOString()`, but the validator
accepts complete ISO-8601 timestamps with an explicit timezone, including `Z` with
optional fractional seconds and numeric offsets. It preserves the supplied string as
part of baseline identity. Free-form strings, surrounding whitespace, date-only
values, timestamps without a timezone, and impossible calendar dates are rejected.

## Task report

| Behavior | RED evidence | GREEN evidence | Guarantee |
| --- | --- | --- | --- |
| Reject missing `generated_at` | `node --test scripts/evals/lib/benchmark.test.js` returned 18 pass / 3 fail; this case received `baseline-id-mismatch` instead of `invalid-generated-at` | Same focal target returned 21/21 pass | Missing temporal identity produces the stable `invalid-generated-at` error before baseline digest validation or rendering |
| Reject a non-string value | The same RED run received `baseline-id-mismatch` for numeric `generated_at` | Same focal target returned 21/21 pass | Non-string temporal metadata is rejected, including through `buildReferenceCandidate()` |
| Reject malformed or impossible timestamps | The same initial RED run received `baseline-id-mismatch` for `not-a-timestamp`; the final test also covers 30 February, date-only, absent timezone, and leading whitespace | Final focal target returned 21/21 pass | Only a structured, parseable timestamp with valid date/time components and explicit timezone is accepted |
| Accept parseable ISO-8601 variants | Correction RED `node --test scripts/evals/lib/benchmark.test.js` returned 20 pass / 1 fail because `2026-07-29T00:00:00Z` was rejected with `invalid-generated-at` | The same correction focal target returned 21/21 pass | UTC with or without fractional seconds and timestamps carrying a numeric offset are accepted without rewriting |

The RED checkpoint is commit `f9730f854e87b65bdd27a863a5bd06ac9f768370`
(`test(evals): reproduce generated_at inválido`). The normal pre-commit hook also
observed the intentional RED state: 1556 tests, 1551 pass, 3 fail, and 2 skipped.
Because a failing checkpoint cannot pass that hook, only this RED commit was created
with `--no-verify`.

The contract-correction RED checkpoint is commit
`3f897166bea3972e2295e4efe2eb6c3387a30a83`
(`test(evals): acepta timestamps ISO-8601 válidos`). It was also created with
`--no-verify` because its single intended failing test made the normal hook
necessarily red.

## Test specification

| # | What is guaranteed | Test or command | Type | Result |
| --- | --- | --- | --- | --- |
| 1 | An absent `generated_at` blocks digest validation and rendering with `invalid-generated-at` | `benchmark.test.js: reference candidate rejects a missing generated_at before baseline identity or rendering` | unit | PASS |
| 2 | A numeric `generated_at` is rejected by both validator and builder | `benchmark.test.js: reference candidate rejects a non-string generated_at before baseline identity` | unit | PASS |
| 3 | Invalid syntax, impossible dates, date-only, absent timezone, and whitespace are rejected | `benchmark.test.js: reference candidate rejects malformed or impossible ISO-8601 generated_at values` | unit | PASS |
| 4 | UTC timestamps with optional milliseconds and timestamps with a numeric offset are accepted | `benchmark.test.js: reference candidate accepts parseable ISO-8601 timestamps with an explicit timezone` | unit | PASS |
| 5 | All eval tests remain compatible | `node --test scripts/evals/safe-export.test.js scripts/evals/live-driver.test.js scripts/evals/run.test.js scripts/evals/lib/fixtures.test.js scripts/evals/lib/benchmark.test.js scripts/evals/lib/assertions.test.js` | regression | PASS (107/107) |
| 6 | The repository validation remains green | `npm test` | regression | PASS (`All checks passed`) |

## Coverage and known gaps

`node --test --experimental-test-coverage scripts/evals/lib/benchmark.test.js`
passed 21/21 and reported 92.91% lines, 75.56% branches, and 98.44% functions for
`scripts/evals/lib/benchmark.js`.

The focal branch result is below 80% because `benchmark.js` also contains unrelated
benchmark loading, transcript, and O1 error paths not exercised by this one test file.
The six-file eval regression suite was executed without coverage instrumentation, so
no broader percentage is claimed. This change adds no browser, network, or live model
journey; the affected contract is a synchronous pure validator/builder/render path.

## Merge evidence

- RED: three rejection cases failed for the intended missing validation, while the
  valid UTC control passed.
- Initial GREEN: the same focal target passed 21/21 after adding required temporal
  validation.
- Correction RED: 20/21 passed; the valid no-fraction UTC timestamp was rejected by
  the exact `toISOString()` comparison.
- Correction GREEN: 21/21 passed after accepting structured, parseable ISO-8601
  timestamps with explicit timezones and checking calendar components.
- Regression: all 107 eval tests and `npm test` passed.
- The correction checkpoints are intentionally separate:
  `test(evals): acepta timestamps ISO-8601 válidos` and
  `fix(evals): acepta timestamps ISO-8601 parseables`.
