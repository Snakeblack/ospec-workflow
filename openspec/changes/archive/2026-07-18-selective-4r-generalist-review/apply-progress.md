# Apply Progress: Selective 4R with Generalist Review

## Status

- Change: `selective-4r-generalist-review`
- Mode: Strict TDD
- Delivery: `exception-ok` with accepted `size:exception`
- Result: all implementation tasks completed and locally verified
- Scope boundary: O4+O5 only; O6 and concurrency-policy changes excluded

## Completed Work Units

1. Added the pure deterministic classifier and validators in `scripts/lib/review-dimensions.js`, including canonical SHA-256 evidence identity, closed signals/sources, normal cap, high-risk override, and fail-closed validation.
2. Added the read-only `review-change` generalist agent/skill and registered it in the orchestrator allowlist and model map without modifying the four specialist skills.
3. Replaced unconditional 4R gate guidance with generalist-first selective dispatch, merge-safe schema-v1 audit, contract remediation blocking, and bounded owning-dimension rereview while preserving severity and concurrency policy.
4. Added five-target generation/parity coverage and made the classifier an explicit runtime root. Canonical `rules/*.instructions.md` sources generate the target-native `.github/instructions` mirrors; root `AGENTS.md` remains the unrelated repository post-archive policy.

## Resume and RED Evidence Note

This apply resumed an interrupted executor that had already created production files and tests but left no `apply-progress.md` or captured RED output. That earlier test-first ordering cannot be reconstructed honestly. The resumed safety net was 10/10 focused tests passing. Additional contract tests were then written for real uncovered gaps and produced three initial failing test cases plus one later triangulation failure before the fixes:

- normalization accepted an empty diff, unsafe relative traversal, and an untrusted fact source;
- final validation accepted tampered normalized sources without recomputing the fingerprint and accepted dimension-inapplicable reasons;
- final validation accepted non-canonical source ordering when the fingerprint was recomputed consistently;
- target parity initially failed because the test did not inspect the generated gate artifact at its actual target path.

After GREEN and refactoring, the focused suite passes 12/12 and the complete repository suite passes.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 1.1 | `scripts/review-dimensions.test.js` | Unit | 5/5 inherited tests passed | Resumed RED: 2 new cases failed | 7/7 classifier tests passed | Empty diff, unsafe path, unknown source, tampered fingerprint, and misplaced reason | Pure helpers extracted; 7/7 stayed green | Original interrupted RED output unavailable. |
| 1.2 | `scripts/review-dimensions.test.js` | Unit | 5/5 inherited tests passed | Resumed RED exposed missing validation | 7/7 passed | Normal 0/2 cap and high-risk 4R exercised | No I/O or external dependency introduced | Four CommonJS exports preserved. |
| 1.3 | `scripts/review-dimensions.test.js` | Unit | 5/5 inherited tests passed | Resumed malformed-input cases failed | 7/7 passed | Permutations, extra/missing keys, unknown codes, order, cap, and fingerprint tampering covered | Canonical recomputation centralizes consistency | Runtime assertions exercise production exports. |
| 1.4 | `scripts/review-dimensions.test.js` | Unit | 7/7 before final cleanup | Covered by resumed validation RED | 7/7 passed after cleanup | Stable output checked across equivalent inputs | `fingerprintEvidence` and `normalizeRelativePath` extracted | Pure deterministic module retained. |
| 2.1 | `scripts/review-change-contract.test.js` | Contract | 3/3 inherited tests passed | Prior RED unavailable after interruption | 3/3 passed | Clear/escalation plus malformed order and empty reason | Static contract assertions consolidated | No RED claim is inferred. |
| 2.2 | `scripts/review-change-contract.test.js` | Contract | 3/3 passed | Prior RED unavailable after interruption | 3/3 passed | Agent, skill, model, and allowlist checked | Agent delegates detail to one skill | Read-only tools remain `read` and `search`. |
| 2.3 | `scripts/review-change-contract.test.js` | Contract | 3/3 passed | Prior RED unavailable after interruption | 3/3 passed | Unknown, duplicate, unordered specialists and competence boundary covered | Existing four specialist files untouched | Specialist envelopes were not edited. |
| 2.4 | `scripts/review-change-contract.test.js` | Contract | 3/3 passed | Prior RED unavailable after interruption | 3/3 passed | `artifacts: []` and exact nested decision enforced | Shared envelope boundary retained | No write capability added. |
| 3.1 | `scripts/review-dimensions.test.js`, `scripts/selective-4r-parity.test.js` | Integration/contract | 10/10 focused baseline passed | Resumed final-decision tampering case failed | 12/12 focused tests passed | Clear/0, capped/2, high-risk/4, invalid/block, legacy text, and owning rereview covered | Classifier remains selection authority | State behavior is contract-driven; no synthetic envelopes. |
| 3.2 | `scripts/selective-4r-parity.test.js` | Integration | Existing gate contracts passed repository suite | Prior RED unavailable after interruption | Five generated targets validate | Gate/no-gate, generalist-first, selective dispatch markers checked | Ranking interpretation removed from prompts | Handler calls the four pure exports. |
| 3.3 | `scripts/selective-4r-parity.test.js` | Contract | Existing convention tests passed | Prior RED unavailable after interruption | Five targets and full suite passed | Legacy absence and merge-preserved fields asserted by source contract | Optional schema-v1 audit documented once | Raw diff persistence prohibited. |
| 3.4 | `scripts/selective-4r-parity.test.js` | Integration | Existing severity tests passed | Prior RED unavailable after interruption | Full suite passed | Zero reviewers, blocked-before-archive, advisory severity, bounded rereview, and serial fallback preserved | No specialist or concurrency implementation changed | Specialist sources have no diff. |
| 3.5 | `scripts/review-dimensions.test.js` | Unit | Classifier suite green | Resumed applicability RED failed | 7/7 classifier tests passed | Re-derived expected decision rejects prompt-side reinterpretation | One module owns ranking and ownership mapping | Final validation compares canonical derivation. |
| 4.1 | `scripts/selective-4r-parity.test.js` | Generation | 2/2 inherited parity tests passed | Resumed path-specific target check failed once | 2/2 parity tests passed | Five target-native agent/orchestrator paths and validators exercised | Target path map centralized | Temporary outputs only. |
| 4.2 | `scripts/selective-4r-parity.test.js` | Generation | Runtime gather tests passed | Prior RED unavailable after interruption | Classifier emitted in all five targets | Explicit runtime-root presence checked | Existing BFS/generator retained | No `dist/` edits. |
| 4.3 | `scripts/selective-4r-parity.test.js` | Generation | Canonical rules already generated | Prior RED unavailable after interruption | Five target validators passed | Source rules produce VS Code/Copilot/OpenCode/Codex/Claude equivalents | Kept root `AGENTS.md` scoped to post-archive policy | Equivalent generator source used instead of hand-editing generated mirrors. |
| 4.4 | `scripts/selective-4r-parity.test.js` | Generation | 2/2 inherited parity tests passed | Resumed target-path assertion failed | 2/2 passed | Generalist, classifier, cap, blocker, model, severity/remediation boundary checked per target | Actual artifact paths replace global tree search | Every `runConfigure` used `validate: true`. |
| 4.5 | `scripts/selective-4r-parity.test.js` | Generation | Parity green | Covered by target-specific RED | 2/2 passed after helper extraction | All five targets generated in isolated directories | Common `targetPaths` fixture removes duplication | Temporary directories removed by test cleanup. |
| 5.1 | Three focused test files | Unit/contract/generation | 10/10 at resume | 3 new failing cases captured | 12/12 passed | Real malformed and cross-target paths covered | Focused suite rerun after cleanup | Command exited 0. |
| 5.2 | `scripts/selective-4r-parity.test.js` | Generation | Existing target validators available | Target-specific path mismatch exposed | 5/5 targets generated and validated | Target-native syntax and runtime checked | No committed `dist/` changes | Generation used temporary directories. |
| 5.3 | `npm test` | Regression | Focused suite 12/12 | N/A: final regression gate | All checks passed | Native tests plus generation/validators ran | No regression fix required after full run | Exit code 0 in 18.9 seconds. |

## Test Summary

- Focused command: `node --test scripts/review-dimensions.test.js scripts/review-change-contract.test.js scripts/selective-4r-parity.test.js`
- Focused result: 12 tests passed, 0 failed.
- Five-target result: claude, vscode, github-copilot, opencode, and codex generated in temporary directories with target-native validation enabled.
- Full regression command: `npm test`
- Full regression result: all checks passed; exit code 0; 0 errors and 0 warnings from generated-target validation.
- Layers: unit, contract, integration-by-generated-artifact, and full regression.
- Approval tests: existing specialist/severity/concurrency regression suite; specialist sources unchanged.
- Pure functions: normalization, generalist validation, dimension derivation, and final decision validation (plus private canonical helpers).

## Deviations and Risks

- No design behavior deviation. The task path naming for `.github/instructions/*` is realized through canonical `rules/*.instructions.md` generation, not by committing generated target output; root `AGENTS.md` is unrelated repository policy and was preserved.
- Historical RED evidence from the interrupted executor is unavailable and is explicitly not claimed. Resumed RED/GREEN evidence covers the discovered contract gaps.
- No remaining implementation blocker. `sdd-verify` should independently audit strict-TDD continuity and requirement coverage.

## Recovery TDD Evidence (R1-R4, append-only)

The historical RED that predates this recovery remains unavailable and is not renamed or reconstructed. This section records only failures and controlled mutations observed during the remediation batch against the existing prototype and isolated generated outputs.

| Recovery task | Prototype / baseline identity | RED or controlled mutation | GREEN change and result | Triangulation / refactor rerun |
|---|---|---|---|---|
| R1 canonical tie-break | Existing `scripts/lib/review-dimensions.js` comparator using the full best-reason tuple | `node --test scripts/review-dimensions.test.js`; exit 1. `equal-precedence candidates use canonical dimension order before reason details` produced actual `[reliability,resilience]` versus expected `[risk,reliability]`. | Candidate rank now compares only minimum precedence, then canonical dimension index. Focused classifier+reducer command passed 15/15. | Added input permutations, equal four-dimension signals, and a stronger verify-precedence case. Final focused command passed 22/22. |
| R2 executable gate/state reducer | No `scripts/lib/review-gate-state.js` existed | `node --test scripts/review-gate-state.test.js`; exit 1 with `MODULE_NOT_FOUND: './lib/review-gate-state.js'`. | Added the four pure CommonJS exports and made the gate/orchestrator consume their plan. Focused classifier+reducer command passed 15/15. | Runtime fixtures cover route no-op; exact 0/2/4 dispatch; no synthetic skipped envelopes; invalid contract blocked with empty dispatch and archive false; merge-safe audit; legacy read; bounded rereview; unknown owner rejection; unchanged severity/remediation/concurrency markers. |
| R3 five-target parity and negative drift | Each target generated with `runConfigure(... validate: true)` and passed the common runtime probe before mutation | `node --test scripts/selective-4r-parity.test.js`; controlled isolated mutations removed generalist, classifier runtime, reducer runtime, and competence boundary, or drifted normal cap, canonical order, reasons, and audit. Each mutant subprocess (`node -e <PROBE> <target-root> <generalist-path>`) exited non-zero with its specific `GENERALIST`, `RUNTIME`, `BOUNDARY`, `SELECTION`, `REASONS`, or `AUDIT` diagnostic. One test-authoring iteration initially exited 1 because the reason mutation changed only its first occurrence; the mutation was corrected to global replacement. | Added reducer as an explicit runtime root and executable probes for classifier/reducer behavior. Parity test passed 3/3 after every target was restored following every mutant. | Five targets × eight isolated mutations were restored and re-probed green after each case; temporary trees were removed by test cleanup. Working source and `dist/` were never mutated by the negative probes. |
| R4 closure | R1-R3 focused suites green | `node --test scripts/review-dimensions.test.js scripts/review-gate-state.test.js scripts/review-change-contract.test.js scripts/selective-4r-parity.test.js`; exit 0, 22 passed, 0 failed. | `npm test`; exit 0 in 19.8 seconds; all checks passed and generated-target validation reported 0 errors, 0 warnings. | Specialist skill files have no diff; severity taxonomy, remediation ownership, and parallel-preferred/serial-fallback remain regression-controlled. `docs/roadmap.md` retains the pre-existing user diff and was not edited by this batch. |

### Recovery Coverage Matrix

- Canonical equal-precedence selection: runtime test proves `risk,reliability` over a three/four-candidate tie.
- Gate behavior: executable reducer proves route no-op, normal clear/0, normal/2, high-risk/4, blocked/no-dispatch/no-archive, and no fabricated skipped envelopes.
- State behavior: merge preserves owned and unknown historical fields; legacy reads clone without rewriting or inventing dimensions/reasons.
- Remediation behavior: rereview prioritizes valid finding owners, admits only newly selected fresh signals, reapplies the normal cap, and uses full 4R for high-risk.
- Target parity: claude, vscode, github-copilot, opencode, and codex execute identical classifier/reducer probes and reject isolated contract/runtime drift.

### Recovery Result

- Tasks R1-R4: `[x]` implemented and locally verified.
- Delivery boundary: accepted `size:exception`; no commit created.
- Scope controls: O6 excluded; no concurrency-policy change; no manual `dist/` edit; `docs/roadmap.md` preserved.
- Next phase: rerun `sdd-verify` against the remediated implementation and this appended evidence.

### Final canonical-rereview refinement

After the first R4 closure, the rereview fixture was tightened to require canonical output order as well as owner priority. `node --test scripts/review-gate-state.test.js` then failed with exit 1: actual `[reliability,risk]`, expected `[risk,reliability]`. GREEN canonicalized the already owner-prioritized chosen set before mapping reviewers. The four-file focused command returned exit 0 with 22/22, and the final `npm test` rerun returned exit 0 in 20.0 seconds with all checks passed and 0 generated-target errors/warnings.

## Gate Remediation R5 (append-only)

The selective gate returned 3 CRITICAL and 3 WARNING findings after R4. R5 preserves that original audit and remediates each finding with fresh executable RED evidence before production edits.

### R5 TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| R5.1 reducer defense-in-depth | `scripts/review-gate-state.test.js` | Unit/integration | 22/22 focused baseline | `reducer fully validates decisions...` returned `done` instead of `blocked`; focused RED exit 1 | Full `validateReviewDecision` executes even with empty adapter errors; focused 28/28 | Fabricated decision omits normalized dependencies and cannot dispatch/archive | Removed the shallow duplicate validator; one canonical validator owns the boundary | Positive fixtures now come from production normalization/derivation. |
| R5.2 safe generalist reason | `scripts/review-dimensions.test.js`, `scripts/review-change-contract.test.js` | Unit/contract | 22/22 focused baseline | Synthetic token, assignment, verbatim addition and 513-char reason were accepted; source contract lacked boundary; focused RED exit 1 | Validator rejects credential-like/verbatim/oversized content; focused 28/28 | Safe evidence-based reason remains valid and serialized decision contains no synthetic token | Named constants centralize length and unsafe-content rules | Skill and gate handler document normalized references instead of raw diff text. |
| R5.3 scoped diff facts | `scripts/review-dimensions.test.js` | Unit | 22/22 focused baseline | Mixed docs/tests/runtime diff produced four facts attributed to all three paths; focused RED exit 1 | Parser consumes per-file added hunks and attributes only `scripts/runtime.js`; focused 28/28 | Context/deletion auth/error text, docs process text, test network text and runtime structural addition exercise distinct paths | Extracted `isRuntimeProductionPath`; deterministic fact ordering retained | Only executable production extensions participate. |
| R5.4 required evidence arrays | `scripts/review-dimensions.test.js` | Unit | 22/22 focused baseline | Omitted/mistyped `paths` normalized to empty; focused RED exit 1 | All six declared arrays are required before fingerprint; focused 28/28 | Every field is tested both omitted and mistyped | `requireArray` keeps missing distinct from empty | Explicit empty arrays remain valid evidence. |
| R5.5 delta-bounded rereview | `scripts/review-gate-state.test.js` | Unit | 22/22 focused baseline | Stable non-owner `risk` reran and newly selected `resilience` was displaced; focused RED exit 1 | Previous and fresh decisions are fully validated; result is owners plus newly selected dimensions only; focused 28/28 | Missing previous decision fails closed; high-risk remains full 4R; unknown owners still reject | Canonical filtering happens after owner/new-delta choice | Five-target probe rejects a mutation that reintroduces stable non-owner reruns. |
| R5.6 stale blocker cleanup | `scripts/review-gate-state.test.js` | Unit | 22/22 focused baseline | Valid blocked-to-ready/done plans retained `blocker_reason` and `validation_errors`; focused RED exit 1 | Both fields are absent after successful transition; focused 28/28 | Tests cover zero and two selected specialists while preserving unknown historical state | Cleanup is localized to the successful transition | Blocked audit remains unchanged on validation failure. |
| R5.7 five-target parity | `scripts/selective-4r-parity.test.js` | Generated integration/mutation | Existing 5-target parity green | Controlled mutations for reason bound, diff scope, reducer validation and rereview delta each fail their probe | Parity 3/3 across claude, vscode, github-copilot, opencode and codex | Every mutant is restored and reprobed before the next mutation | Runtime/skill roots remain generated; no `dist/` edit | Target-native validation remains enabled. |

### R5 Commands and Results

- RED: `node --test scripts/review-dimensions.test.js scripts/review-gate-state.test.js scripts/review-change-contract.test.js` — exit 1; 17 passed, 8 failed, covering all six findings plus the source contract.
- GREEN/focused: `node --test scripts/review-dimensions.test.js scripts/review-gate-state.test.js scripts/review-change-contract.test.js scripts/selective-4r-parity.test.js` — exit 0; 28 passed, 0 failed.
- Five-target mutation suite: `node --test scripts/selective-4r-parity.test.js` — exit 0; 3 passed, 0 failed; all generated targets restored green after each mutation.
- Full regression: `npm test` — exit 0 in 22.6 seconds; all checks passed; generated-target validation reported 0 errors and 0 warnings.

### R5 Result

- Tasks R5.1-R5.7: `[x]` implemented and locally verified.
- Delivery boundary: accepted `size:exception`; no commit created.
- Preserved controls: specialist contracts, severity/remediation taxonomy, parallel-preferred/serial-fallback, O6 exclusion, no manual `dist/` edit, and untouched pre-existing `docs/roadmap.md` user work.
- Gate remediation: `fixed-pending-verify`; the original 3 CRITICAL and 3 WARNING findings remain in the audit until independent `sdd-verify` and bounded owner rereview complete.
- Next phase: `sdd-verify`.

## Gate Remediation R6 (append-only)

El bounded rereview 1 devolvió tres CRITICAL: persistencia de secretos mediante `generalist.reason`, señales de red originadas en comentarios y aceptación de input no-diff. R6 reemplaza la defensa por regex por fronteras estructurales, valida el diff completo antes de clasificar y analiza únicamente adiciones ejecutables.

### R6 TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| R6.1 structural generalist references | `scripts/review-dimensions.test.js`, `scripts/review-change-contract.test.js` | Unit/contract | 28/28 focused baseline | Fresh RED exit 1: free-form Bearer/JWT/AWS payloads were accepted and the skill lacked structural grammar | `validateGeneralistDecision` accepts only canonical allowlisted `signals=<codes>;dimensions=<ids>`; focused 31/31 then 33/33 | Clear uses `signals=none;dimensions=none`; escalation requires codes to justify every specialist; unknown code, suffix, prose, JWT, Bearer and AWS all reject | Deleted credential-pattern/length policy in favor of one parser; derivation persists only code references | No arbitrary diff text or free-form explanation can enter gate state through the generalist decision. |
| R6.2 real unified diff boundary | `scripts/review-dimensions.test.js` | Unit | 28/28 focused baseline | Fresh RED exit 1: non-diff text and header-only/truncated sections normalized successfully | Parser requires `diff --git`, matching `---`/`+++`, valid hunk header/body and exact old/new counts | Second RED exit 1 covered missing markers and trailing junk; untracked representation is documented with `/dev/null` plus count-consistent synthetic additions | Parsing and classification are separated; malformed input fails before facts/fingerprint | Every section must contain at least one valid hunk; unknown metadata/content fails closed. |
| R6.3 executable additions only | `scripts/review-dimensions.test.js` | Unit | 28/28 focused baseline | Fresh RED exit 1: comments/block comments/string documentation emitted five signals; nested tests/specs/docs emitted network facts; multiline docstring triangulation emitted a false error-flow fact | Lexical sanitizer removes shebangs, comments, single-line strings and multiline docstrings while retaining executable identifiers; path filter excludes nested non-production trees | Executable `fetch(url)` + `authorize(user)` yields only network/auth facts and preserves selected `risk,reliability`; comment/string keywords cannot consume the cap | Signal regexes now require executable syntax such as calls, assignments or declarations | Context updates lexical state; deletions never emit facts; exact path attribution remains deterministic. |
| R6.4 five-target parity and closure | `scripts/selective-4r-parity.test.js` plus four-file focused command | Generated integration/mutation | Five-target baseline green | Controlled grammar-bypass, diff-validation-bypass and executable-sanitizer mutants fail with BOUNDARY/EVIDENCE diagnostics in every target | Four focused suites: 33 passed, 0 failed | Every mutant is restored and reprobed before the next; all five target-native validators accept generated output | No manual `dist/` changes; specialist contracts/taxonomy/concurrency stay regression-controlled | `npm test` passed with 0 generated-target errors and 0 warnings. |

### R6 Commands and Results

- Initial RED: `node --test scripts/review-dimensions.test.js scripts/review-change-contract.test.js` — exit 1; 15 passed, 4 failed (structural reason contract, secret-shaped payload, comment/string contamination, non-diff acceptance).
- Triangulation RED: `node --test scripts/review-dimensions.test.js` — exit 1; 13 passed, 2 failed (nested non-production paths and missing unified markers).
- GREEN/focused: `node --test scripts/review-dimensions.test.js scripts/review-gate-state.test.js scripts/review-change-contract.test.js scripts/selective-4r-parity.test.js` — exit 0; 33 passed, 0 failed.
- Full regression: `npm test` — exit 0 in 21.2 seconds; all checks passed; generated-target validation reported 0 errors and 0 warnings.

### R6 Result

- Tasks R6.1-R6.4: `[x]` implemented and locally verified.
- Delivery boundary: accepted `size:exception`; no commit created.
- Preserved controls: four specialist contracts, severity/remediation taxonomy, parallel-preferred/serial-fallback, O6 exclusion, no manual `dist/` edit, and untouched pre-existing `docs/roadmap.md` user work.
- Gate remediation: `fixed-pending-verify-r6`; the bounded rereview findings remain auditable until independent `sdd-verify` and the next bounded owner rereview complete.
- Next phase: `sdd-verify`.

## Gate Remediation R7 (append-only)

El `sdd-verify` R4 reprodujo que comentarios inline `#` en Python, Ruby y shell seguían entrando en el clasificador después de un prefijo ejecutable. R7 hace que esta frontera sea dependiente del lenguaje sin borrar el prefijo ni confundir `#` citado o, en shell, embebido dentro de una palabra.

### R7 TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| R7.1-R7.2 inline hash comments | `scripts/review-dimensions.test.js` | Unit | 33/33 four-suite baseline; 16/16 existing classifier tests | Fresh RED exit 1: expected only auth/network/process prefix facts, but inline suffixes added `diff-error-flow` for Python/Ruby and `diff-network-flow` for shell | `hashCommentMode(file)` selects `any` for Python/Ruby and token-boundary semantics for shell; focused test file passes 18/18 | Quoted `#` stays inside lexical strings; shell `prefix#suffix` remains executable while a later token-boundary `# authorize(user)` is removed | Extracted `startsHashComment` keeps JS and non-hash languages unchanged and isolates shell token semantics | The executable prefix remains analyzable; only the non-executable suffix is discarded. |
| R7.3 five-target parity/mutation | `scripts/selective-4r-parity.test.js` | Generated integration/mutation | Existing five-target generation and mutation baseline green | Controlled `hashComment: null` mutation fails each generated target with `EVIDENCE` | Native generated runtimes reproduce exact Python/Ruby/shell facts in claude, vscode, github-copilot, opencode and codex | Every mutant is restored and the baseline reprobed before continuing | Reused the runtime probe and generator roots; no manual `dist/` changes | The same lexical boundary is enforced by source and all five generated targets. |
| R7.4 regression closure | Four focused suites plus `npm test` | Integration/regression | 33/33 pre-change focused baseline | Covered by R7.1 fresh RED and R7.3 controlled mutation | Four focused suites pass 35/35; `npm test` exits 0 with 0 errors and 0 warnings | Existing JS comments/strings, structural reason grammar, unified diff validation, R5/R6 controls and five-target mutations remain green | No specialist, taxonomy, concurrency, O6, `dist/` or roadmap implementation changes | `docs/roadmap.md` remains pre-existing user work and was not edited by R7. |

### R7 Commands and Results

- Safety net: `node --test scripts/review-dimensions.test.js scripts/review-gate-state.test.js scripts/review-change-contract.test.js scripts/selective-4r-parity.test.js` — exit 0; 33 passed, 0 failed.
- Fresh RED: `node --test scripts/review-dimensions.test.js` — exit 1; 16 passed, 1 failed; false `diff-error-flow` and `diff-network-flow` facts reproduced from inline suffixes.
- GREEN/triangulation: `node --test scripts/review-dimensions.test.js` — exit 0; 18 passed, 0 failed.
- Five-target parity: `node --test scripts/selective-4r-parity.test.js` — exit 0; 3 passed, including controlled hash-comment-mode mutation per target.
- Focused closure: `node --test scripts/review-dimensions.test.js scripts/review-gate-state.test.js scripts/review-change-contract.test.js scripts/selective-4r-parity.test.js` — exit 0; 35 passed, 0 failed.
- Full regression: `npm test` — exit 0 in 21.4 seconds; all checks passed; generated-target validation reported 0 errors and 0 warnings.

### R7 Result

- Tasks R7.1-R7.4: `[x]` implemented and locally verified.
- Delivery boundary: accepted `size:exception`; no commit created.
- Preserved controls: JavaScript lexical behavior, unified diff validation, R5/R6 boundaries, specialist contracts, severity/remediation taxonomy, parallel-preferred/serial-fallback, O6 exclusion, no manual `dist/` edit, and untouched pre-existing `docs/roadmap.md` user work.
- Gate remediation: `fixed-pending-verify-r7`; the bounded rereview findings remain auditable until independent `sdd-verify` and the next bounded owner rereview complete.
- Next phase: `sdd-verify`.

## Gate Remediation R8 (append-only)

El `sdd-verify` posterior a R7 reprodujo que `authorize(user);# request(url)` conservaba el sufijo de comentario shell porque la frontera solo reconocía whitespace o inicio de línea. R8 alinea el stripping con el inicio de palabra del lexer shell tras metacaracteres, sin alterar Python/Ruby ni hashes shell legítimos.

### R8 TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| R8.1-R8.2 shell word boundary | `scripts/review-dimensions.test.js` | Unit | 35/35 four-suite baseline; 18/18 classifier baseline | Fresh RED exit 1: `authorize(user);# request(url) throw fallback()` emitted auth plus false network/error facts | `startsHashComment` recognizes whitespace and `|&;()<>` as shell word boundaries; classifier 19/19 | 16 cases cover `;#`, whitespace, line-start, `|`, `&`, `(`, `)`, `<`, `>`, single/double quotes, escaped `#`, `${var#pattern}`, `word#hash`, shebang and preserved executable prefixes | Boundary remains centralized in the existing pure helper; 19/19 after the minimal regex change | Suffix auth/network/error cannot emit facts; executable prefixes and legitimate hash forms remain analyzable. |
| R8.3 five-target parity/mutation | `scripts/selective-4r-parity.test.js` | Generated integration/mutation | Existing five-target parity green | Controlled `shell-word-boundary` mutation restores whitespace-only behavior and each target probe exits non-zero with `EVIDENCE` | Parity suite 3/3 across claude, vscode, github-copilot, opencode and codex | Existing `hash-comment-mode` mutation plus the new boundary-specific mutation are restored and reprobed after every target | Reused generated runtime roots; no manual `dist/` changes | The runtime probe includes `;#` with auth prefix and network/error suffix. |
| R8.4 regression closure | Four focused suites plus `npm test` | Integration/regression | 35/35 focused pre-change baseline | Covered by R8.1 fresh RED and R8.3 controlled mutation | Four focused suites pass 36/36; `npm test` exits 0 with 0 errors and 0 warnings | R5-R7, Python/Ruby, unified diff, reducer and specialist contracts remain green | No specialist, taxonomy, concurrency, O6, `dist/` or roadmap implementation changes | `docs/roadmap.md` remains pre-existing user work and was not edited by R8. |

### R8 Commands and Results

- Safety net: `node --test scripts/review-dimensions.test.js scripts/review-gate-state.test.js scripts/review-change-contract.test.js scripts/selective-4r-parity.test.js` — exit 0; 35 passed, 0 failed.
- Fresh RED: `node --test scripts/review-dimensions.test.js` — exit 1; 18 passed, 1 failed; `;#` emitted false `diff-network-flow` y `diff-error-flow` facts while retaining `diff-auth-permission`.
- GREEN/triangulation: `node --test scripts/review-dimensions.test.js` — exit 0; 19 passed, 0 failed.
- Focused closure: `node --test scripts/review-dimensions.test.js scripts/review-gate-state.test.js scripts/review-change-contract.test.js scripts/selective-4r-parity.test.js` — exit 0; 36 passed, 0 failed.
- Full regression: `npm test` — exit 0 in 21.9 seconds; all checks passed; generated-target validation reported 0 errors and 0 warnings.

### R8 Result

- Tasks R8.1-R8.4: `[x]` implemented and locally verified.
- Delivery boundary: accepted `size:exception`; no commit created.
- Preserved controls: Python/Ruby hash behavior, R5-R7 boundaries, specialist contracts, severity/remediation taxonomy, parallel-preferred/serial-fallback, O6 exclusion, no manual `dist/` edit, and untouched pre-existing `docs/roadmap.md` user work.
- Gate remediation: `fixed-pending-verify-r8`; the prior findings remain auditable until independent `sdd-verify` and the next bounded owner rereview complete.
- Next phase: `sdd-verify`.

## Gate Remediation R9 (append-only)

El segundo bounded rereview detectó cuatro fronteras todavía abiertas: texto arbitrario en errores persistidos, coerción de evidencia tipada, pérdida de expresiones ejecutables por stripping léxico global y comentarios multiline Ruby. R9 las cierra con diagnósticos persistidos allowlisted y un lexer dependiente del lenguaje.

### R9 TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| R9.1 audit de errores acotado | `scripts/review-gate-state.test.js` | Unit | 36/36 cuatro suites focales | Fresh RED exit 1: `validation_errors` persistía Bearer/JWT, AWS y payload arbitrario | El reducer persiste solo `adapter-contract-invalid` y/o `decision-contract-invalid`; mantiene blocked, dispatch vacío y archive denegado | Adapter inválido y decisión inválida se prueban por separado y combinados; el JSON no contiene los cuatro payloads sensibles | Separados `adapterInvalid`, validación interna y códigos persistibles; se limpia el campo legacy en recuperación | Los detalles completos quedan solo en el caller/runtime, fuera del audit serializable. |
| R9.2 listas de strings tipadas | `scripts/review-dimensions.test.js` | Unit | 36/36 cuatro suites focales | Fresh RED exit 1: un objeto se convertía en `[object Object]` y entraba en evidencia | `uniqueStrings` rechaza antes de trim/dedupe y reporta el boundary concreto | Cuatro campos por objeto, número, `null` y array anidado; 16 rechazos conductuales | Eliminada la coerción `String()`; la normalización canónica de strings válidos permanece intacta | `designRisks` conserva su contrato de facts estructurados y queda fuera de este boundary. |
| R9.3 lexer dependiente de lenguaje e interpolación | `scripts/review-dimensions.test.js` | Unit | 36/36 cuatro suites focales | Fresh RED exit 1: `counter--` ocultaba ejecución y templates/f-strings ocultaban network facts | `lineCommentMode` limita `--` a lenguajes compatibles; templates JS y f-strings Python extraen solo expresiones ejecutables | Decremento JS, interpolación anidada, escapes/braces, f-string y controles documentales literales | Helpers puros separan consumo de string interpolado, balance de expresión y sanitización inline | Texto literal no emite facts; `${request(url)}` y `{request(url)}` sí. |
| R9.4 bloques Ruby | `scripts/review-dimensions.test.js` | Unit | 36/36 cuatro suites focales | Fresh RED exit 1: líneas dentro de `=begin`/`=end` emitían auth/network/error | Estado `rubyBlockComment` reconoce marcadores al inicio de línea y suprime el bloque | El estado cruza líneas de contexto y añadidas; `request(url)` tras `=end` vuelve a contar | La frontera Ruby se resuelve antes del scanner general sin alterar `#` inline | Marcadores indentados no se interpretan como bloque Ruby válido. |
| R9.5 paridad y cierre | `scripts/selective-4r-parity.test.js` y cuatro suites focales | Generated integration/mutation | Cinco targets y mutaciones R5-R8 verdes | Mutantes de error persistido, tipo string, `--`, interpolación, template multiline y Ruby fallan con `AUDIT`/`EVIDENCE` en cada target | Cuatro suites focales 41/41; `npm test` exit 0, 0 errors, 0 warnings | Cada mutante se restaura y reproba antes del siguiente en claude, vscode, github-copilot, opencode y codex | Sin cambios manuales en `dist/`; controles estructurales previos siguen activos | `docs/roadmap.md` conserva el cambio preexistente del usuario y no fue editado por R9. |

### R9 Commands and Results

- Safety net: `node --test scripts/review-dimensions.test.js scripts/review-gate-state.test.js scripts/review-change-contract.test.js scripts/selective-4r-parity.test.js` — exit 0; 36 passed, 0 failed.
- Fresh RED: mismo comando — exit 1; 36 passed, 4 failed; reprodujo las cuatro fronteras del segundo bounded rereview.
- GREEN focal: `node --test scripts/review-gate-state.test.js scripts/review-dimensions.test.js` — exit 0; 32 passed, 0 failed.
- Paridad cinco targets: `node --test scripts/selective-4r-parity.test.js` — exit 0; 3 passed, incluidos seis mutantes R9 por target.
- Cierre focal: cuatro suites — exit 0; 41 passed, 0 failed.
- Regresión completa: `npm test` — exit 0 en 25.8 segundos; all checks passed; 0 errors, 0 warnings.

### R9 Result

- Tasks R9.1-R9.5: `[x]` implementadas y verificadas localmente.
- Delivery boundary: `size:exception` aceptado; no se creó commit.
- Preservados: R5-R8, reason estructural, unified diff, cinco targets, especialistas, taxonomía, parallel-preferred/serial-fallback, O6, `dist/` y el trabajo preexistente en `docs/roadmap.md`.
- Gate remediation: `fixed-pending-verify-r9`; los cuatro CRITICAL del segundo bounded rereview quedan pendientes de verificación independiente.

## B1 — Bounded review lineage (2026-07-16)

**Status:** `[x]` implementado y verificado localmente  
**Delivery:** `exception-ok` con `size:exception`  
**Boundary:** reemplaza la remediación por rereview abierto; no ejecuta 4R ni convierte R1–R9 en intentos inventados.

La autoridad de terminación vive ahora en `scripts/lib/review-lineage.js`: start congela identidad, rutas, clasificación, dimensiones, evidencia y presupuesto; cada lens se registra una vez; los findings quedan congelados con IDs owner-bound; las correcciones consumen rutas/líneas acotadas; `review-correction` valida únicamente IDs congelados; tres fallos agotan la lineage; `unknown` exige reconciliación; y gates posteriores son read-only. La revisión nueva requiere successor explícito.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| B1.1 identidad/genesis/budget | `scripts/review-lineage.test.js` | Unit | 41/41 focused baseline | `MODULE_NOT_FOUND: review-lineage.js` | Stable IDs, canonical paths y tabla 0/1/9/399/900 pasan | Invalid counts, missing genesis, reordered paths e idempotent start | Helpers `stableSerialize`, `normalizeCandidate`, domain-separated hashes | Budget fijo `min(200, ceil(lines/2))`. |
| B1.2 one-shot/freeze | `scripts/review-lineage.test.js` | Unit | 41/41 baseline | API inexistente; después retry/parallel fixtures fallaron contra dispatch singular | Lenses pending/running/completed/unknown y findings owner-bound pasan | Parallel-preferred persistence, duplicate/rerun/divergent/stale cases | Pending lens operation quedó local a cada lens para no perder concurrencia | No reviewer puede relanzarse tras freeze. |
| B1.3 correction/validator | `scripts/review-lineage.test.js`, `scripts/review-correction-contract.test.js` | Unit/contract | Existing classifier/gate green | Agent/skill ausentes; overflow, retry y targeted-only fixtures fallaron antes de GREEN | Correction snapshot, fixed budget, exact outcomes y agent contract pasan | Delta cero, tercer fallo, fourth-attempt rejection, path/count overflow, exact retries, late follow-up | Validación y follow-ups normalizados por helpers puros | Nuevos blockers/IDs/owners son rechazados. |
| B1.4 interruption/gates/successor | `scripts/review-lineage.test.js`, `scripts/review-gate-state.test.js` | Unit/integration | Existing reducer tests green | `planLineageGate`/reconciliation/successor ausentes | Unknown stop, exact committed/not_started/unknown, candidate drift y successor explícito pasan | Read-only archive/verify, invalidated/escalated terminal, implicit successor rejection | `nextLineageAction` es la única autoridad de dispatch | No reset implícito ni rebudget. |
| B1.5 five-target parity | `scripts/selective-4r-parity.test.js`, `scripts/eje-def-contract.test.js` | Generated integration/mutation | Existing five-target generation green | Old `planBoundedRereview` and `owning dimension` probes failed | Claude, VS Code, GitHub Copilot, OpenCode y Codex pass | Mutants de runtime, attempt cap, line cap, candidate gate y targeted contract fallan en cada target | Runtime roots y contract probes comparten reducer/validator source | `dist/` y `docs/roadmap.md` no fueron editados por B1. |
| B1.6 regression close | focused command + `npm test` | Regression | 1362 pass, 2 skip, 2 contract fails on first full run | 500-line orchestrator boundary and exact parallel/serial wording | Focused 53/53; final `npm test` exit 0 | Full generator/validator matrix: five targets, 0 errors/warnings | Orchestrator compressed to 497 lines; legacy marker preserved | Final all checks passed. |

### Test Summary

- Focused: `node --test scripts/review-lineage.test.js scripts/review-correction-contract.test.js scripts/review-gate-state.test.js scripts/review-dimensions.test.js scripts/review-change-contract.test.js scripts/selective-4r-parity.test.js` — exit 0, 53/53.
- Full: `npm test` — exit 0, all checks passed; five generated targets validate with 0 errors and 0 warnings.
- Runtime syntax: `node --check` passed for lineage, gate adapter and parity probe.
- Coverage command: unavailable by project configuration; behavioral mutation coverage is exercised in all five generated targets.
- No commits were created. Existing `docs/roadmap.md` user changes remain untouched.

### Files and decisions

- Added `scripts/lib/review-lineage.js`, `scripts/review-lineage.test.js`, `agents/review-correction.agent.md`, `skills/review-correction/SKILL.md`, and `scripts/review-correction-contract.test.js`.
- Updated gate adapter/handler, orchestrator allowlist, model registry, persistence/rules, runtime roots, AGENTS contract and five-target parity.
- Removed executable and prose routes for `planBoundedRereview`/owner rereview. Late observations remain non-blocking follow-ups until explicit successor approval.
- Full receipt publication and lock/CAS remain intentionally outside O4+O5.
- Next phase: `sdd-verify`.

## E1 — Evidencia Strict TDD individual de B1 (append-only)

Esta tabla desagrega únicamente la evidencia real ya registrada para B1. Conserva las seis filas agregadas anteriores y no atribuye un RED nuevo a tareas documentales, de refactor o de mera ejecución.

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| B1.1.1 | `scripts/review-lineage.test.js` | Unit | 41/41 focused baseline | ✅ Written — el primer comando focal terminó con `MODULE_NOT_FOUND: review-lineage.js`. | ✅ Passed — cierre focal 53/53, con serialización estable, IDs y rutas POSIX canónicas. | Reordenación de rutas, genesis incompleto e inicio idéntico idempotente. | `stableSerialize`, `normalizeCandidate` y hashes con separación de dominio. | El fallo observado demuestra que el contrato se escribió antes del reducer. |
| B1.1.2 | `scripts/review-lineage.test.js` | Unit/table-driven | 41/41 focused baseline | ✅ Written — la tabla 0/1/9/399/900 se ejecutó inicialmente contra el módulo ausente y el comando terminó con `MODULE_NOT_FOUND`. | ✅ Passed — cierre focal 53/53; fórmula, impares, cap 200 e inputs inválidos pasan. | Conteos inválidos y campos genesis ausentes completan los límites de la tabla. | Cálculo del allowance centralizado en el reducer puro. | No se infiere un fallo distinto del `MODULE_NOT_FOUND` ya registrado. |
| B1.2.1 | `scripts/review-lineage.test.js` | Unit/runtime | 41/41 focused baseline | ✅ Written — el RED inicial terminó con `MODULE_NOT_FOUND: review-lineage.js` antes de existir el reducer. | ✅ Passed — cierre focal 53/53 con start inmutable, revisión CAS y transiciones legales. | Idempotencia, stale revision y serialización estable. | Estado y normalización quedaron en helpers CommonJS puros. | El módulo se creó para satisfacer los tests B1.1 ya fallidos. |
| B1.2.2 | `scripts/review-lineage.test.js`, `scripts/review-gate-state.test.js` | Unit/integration | Reducer y gate existentes verdes | ✅ Written — los fixtures de retry/paralelo fallaron contra el dispatch singular `run-lens`. | ✅ Passed — cierre focal 53/53 con estados por lens y retry exacto por request/digest. | Duplicate, rerun, divergent, stale y persistencia parallel-preferred. | Pending operation permanece local a cada lens. | Evidencia tomada de la fila agregada B1.2. |
| B1.2.3 | `scripts/review-lineage.test.js` | Unit/runtime | 41/41 focused baseline | ✅ Written — la API de freeze no existía en el RED inicial del módulo de lineage. | ✅ Passed — cierre focal 53/53 con IDs owner-bound estables y freeze inmutable. | Colisión, duplicado, renumeración, borrado, owner/ID nuevos y resultado divergente. | Canonicalización y hash de findings centralizados. | No se atribuye un fallo más específico que la API ausente registrada. |
| B1.3.1 | `scripts/review-lineage.test.js` | Unit/runtime | Lineage start/freeze green | ✅ Written — los fixtures de escape y overflow fallaron antes del GREEN, según la evidencia B1.3 registrada. | ✅ Passed — cierre focal 53/53 con genesis paths y presupuesto acumulado acotados. | Base mismatch, forecast/actual/cumulative overflow y subconjunto de rutas. | Normalización de rutas y contabilidad compartidas por helpers puros. | El RED es el fallo de fixtures documentado, sin reconstruir salida adicional. |
| B1.3.2 | `scripts/review-lineage.test.js` | Unit/runtime | Lineage correction baseline | ✅ Written — los fixtures de retry fallaron antes del GREEN de correction. | ✅ Passed — cierre focal 53/53 con snapshot, request persistible y budget fijo. | Intentos concurrentes, stale revision y retries exactos. | Begin/record comparten validación de revisión y request. | Evidencia tomada de la fila agregada B1.3. |
| B1.3.3 | `scripts/review-correction-contract.test.js` | Contract | Existing classifier/gate green | ✅ Written — el primer comando del contrato terminó con `ENOENT` porque `agents/review-correction.agent.md` no existía. | ✅ Passed — cierre focal 53/53; frozen IDs exactos, outcomes y regression evidence pasan. | Rechazo de IDs/owners/blockers extra y follow-ups bounded. | Parsing y validación contractual quedaron declarativos. | El `ENOENT` observado prueba el orden test-before-contract. |
| B1.3.4 | `scripts/review-correction-contract.test.js`, `scripts/review-lineage.test.js` | Contract/runtime | Correction tests written | ✅ Written — agent/skill estaban ausentes y el contrato focal falló con `ENOENT`. | ✅ Passed — cierre focal 53/53; outcomes se aplican y el tercer fallo termina en `exhausted`. | Delta cero, cuarto intento imposible y targeted-only. | Agent y skill comparten el contrato mínimo del validator. | El RED real es la ausencia de los artefactos registrada en B1.3. |
| B1.3.5 | `scripts/review-lineage.test.js`, `scripts/review-correction-contract.test.js` | Unit/contract | Correction baseline green | ✅ Written — los fixtures targeted-only/follow-up fallaron antes del GREEN documentado. | ✅ Passed — cierre focal 53/53 con resolución parcial y terminales aprobados/acotados. | Follow-ups append-only, regresión y terminal `approved|exhausted|escalated|invalidated`. | Normalización de outcomes y follow-ups por helpers puros. | Ningún validator puede ampliar blockers o presupuesto. |
| B1.4.1 | `scripts/review-lineage.test.js`, `scripts/review-gate-state.test.js` | Unit/integration | Existing reducer tests green | ✅ Written — las APIs de reconciliación estaban ausentes en el RED B1.4. | ✅ Passed — cierre focal 53/53 con stop unknown y reconciliación exacta `committed|not_started|unknown`. | Request/digest exactos, input cambiado y operación ambigua persistida. | La reconciliación consume la pending operation serializable. | No se inventa un mensaje distinto de la API ausente registrada. |
| B1.4.2 | `scripts/review-gate-state.test.js` | Integration/runtime | Existing gate tests green | ✅ Written — el test focal falló porque `planLineageGate` no era una función. | ✅ Passed — cierre focal 53/53 con status/verify/delivery/archive read-only. | Candidate drift y unknown bloquean sin crear autoridad. | `nextLineageAction` queda como autoridad única de dispatch. | El fallo exacto está registrado en la evidencia agregada B1.4. |
| B1.4.3 | `scripts/review-lineage.test.js` | Unit/runtime | Terminal lineage tests green | ✅ Written — la API de successor estaba ausente en el RED B1.4. | ✅ Passed — cierre focal 53/53 con predecessor terminal, generation, link, reason y approval. | Rechazo de successor implícito, mismo ID y predecessor no terminal. | Construcción y validación del successor centralizadas. | No hay reset implícito de intentos o presupuesto. |
| B1.5.1 | `scripts/review-gate-state.test.js`, `scripts/review-correction-contract.test.js` | Integration/contract | Existing gate/contract baseline | ✅ Written — `planLineageGate` faltaba y el handler aún no admitía `review-correction`. | ✅ Passed — cierre focal 53/53; el gate consume solo `next_action` autorizado. | Dispatch one-shot, correction dirigida y gates read-only. | Se retiraron rutas ejecutables de `planBoundedRereview`/owner rereview. | RED y GREEN proceden de los comandos focales ya registrados. |
| B1.5.2 | `scripts/review-change-contract.test.js`, `scripts/eje-def-contract.test.js` | Static/contract integration | Cinco targets generables | STATIC_VALIDATED — sincronizar contratos y runtimes no introduce lógica de producción ni exige un RED propio; se inspeccionaron los targets antes de la validación final. | ✅ Passed — suite completa y generación de cinco targets: 0 errores y 0 warnings. | Paridad de persistence/rules, registro del validator y ambos runtimes. | Sin edición manual de `dist/` ni `docs/roadmap.md`. | Uso honesto de validación estructural para una tarea de sincronización. |
| B1.5.3 | `scripts/review-gate-state.test.js`, `scripts/selective-4r-parity.test.js` | Generated integration/mutation | Five-target generation baseline | ✅ Written — paridad salió con exit 1 por probes antiguos de `planBoundedRereview` y `owning dimension`. | ✅ Passed — cierre focal 53/53; paridad final pasa en los cinco targets. | Mutantes de one-shot, cap de intentos/líneas, unknown, targeted-only y successor fallan por target. | Probes comparten runtime roots y contrato del reducer/validator. | El exit 1 y sus dos causas están registrados en B1.5. |
| B1.5.4 | Focused lineage/gate/parity suites | Refactor | Focused behavior already green | STATIC_VALIDATED — el refactor se hizo bajo la suite focal existente; no se fabricó un RED para limpieza sin cambio funcional. | ✅ Passed — cierre focal 53/53 tras helpers compartidos y retirada de código muerto. | Classifier, generalist, especialistas, severidad y concurrencia permanecen verdes. | Orchestrator comprimido a 497 líneas y helpers puros compartidos. | Refactor protegido por tests, sin ciclo de producción independiente. |
| B1.6.1 | Six focused suites | Execution/regression | B1 behavioral tests present | STATIC_VALIDATED — ejecutar y registrar evidencia es una tarea de cierre, no una nueva unidad de producción con RED propio. | ✅ Passed — comando focal final exit 0, 53/53. | Matriz de lineage, correction, gate, classifier/generalist y paridad. | Evidencia mergeada sin sobrescribir R1–R9 ni las seis filas agregadas. | La ejecución valida los ciclos anteriores; no se reconstruye uno nuevo. |
| B1.6.2 | `scripts/selective-4r-parity.test.js`, `scripts/eje-def-contract.test.js` | Generated integration | Runtime roots configured | STATIC_VALIDATED — la generación temporal es una comprobación de entrega, no lógica de producción con RED independiente. | ✅ Passed — claude, vscode, github-copilot, opencode y codex validan con 0 errores/0 warnings. | Mutaciones aisladas prueban cada frontera y se restauran entre targets. | No hubo cambios manuales en `dist/` ni en el roadmap del usuario. | Evidencia de ejecución ya registrada en Test Summary. |
| B1.6.3 | `npm test` | Regression/closure | Focused 53/53 | ✅ Written — el primer `npm test` terminó con exit 1: 1362 pass, 2 skip y 2 fallos contractuales (límite 500 y wording paralelo/serial). | ✅ Passed — `npm test` final terminó con exit 0 y todos los checks verdes. | Generación/validación completa de cinco targets, 0 errores y 0 warnings. | Orchestrator quedó en 497 líneas y se preservó el marker legacy requerido. | Este es el RED/GREEN real del cierre completo, ya registrado en B1.6. |

### E1 Mechanical Evidence Check

- Expected leaf IDs: 20.
- Individual E1 rows: 20.
- Unique individual IDs: 20.
- Coverage: `20/20`.
- Aggregate B1 rows preserved: 6; no aggregate row counts as an individual task.
- Result: ready for one bounded `sdd-verify` rerun without generalist or specialist discovery.
