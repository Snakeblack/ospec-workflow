# SDD Verify Report Format

## Evidence Levels

- `runtime-test`: automated test executed and passed.
- `static-proof`: build, type-check, schema validation, or equivalent static command proves the behavior.
- `static-lint`: a check that inspects declared artifacts (skill manifests, frontmatter, config files, commit trailers) via grep/parse/string comparison — including a check that runs inside the automated test runner but exercises no real runtime code path — as distinct from `runtime-test`.
- `inspection-proof`: code inspection ties the scenario to exact files/functions with a technical rationale.
- `manual-proof`: manual verification was executed and recorded.
- `no-proof`: no credible evidence found.

## Compliance Results

- `PASS`: evidence level satisfies the scenario's requirement strength.
- `WARNING`: implementation appears acceptable, but evidence is weaker than ideal or a non-MUST scenario has lower-tier proof.
- `FAIL`: evidence is missing, failing, or too weak for the scenario's required strength.

## Report Template

~~~markdown
## Verification Report

**Change**: {change-name}
**Spec version**: {version, or N/A}
**TDD mode**: {Strict TDD | Standard}

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | {N} |
| Tasks complete | {N} |
| Tasks incomplete | {N} |

### Build & Tests Execution
| Run | Command | Result |
|---|---|---|
| Build | `{command}` | ✅ passes / ❌ fails |
| Tests | `{command}` | ✅ {N} pass / ❌ {N} fail / ⚠️ {N} skipped |
| Coverage | `{command}` | {N}% against {N}% → ✅ over / ⚠️ under / ➖ no tool |

Output that matters from each run, with every failure in full:
```text
{output}
```

**Manual verification**: {performed / not performed}
```text
{manual verification steps and results, if any}
```

### Spec Compliance Matrix
| Requirement | Scenario | Evidence Level | Source | Result | Notes |
|-------------|----------|----------------|--------|--------|-------|
| {REQ-01} | {Scenario} | `runtime-test` | `{file} > {test}` | PASS | |
| {REQ-02} | {Scenario} | `inspection-proof` | `{file}#{function}` | WARNING | SHOULD scenario; runtime test unavailable |
| {REQ-03} | {Scenario} | `no-proof` | (none found) | FAIL | MUST scenario lacks credible evidence |

**Compliance summary**: {N}/{total} scenarios satisfied at acceptable evidence levels

### Correctness (Source Inspection)
| Requirement | Implemented | Notes |
|---|---|---|
| {requirement} | ✅ yes / ⚠️ partly / ❌ no | {short note} |

### Coherence (Design)
| Design decision | Followed | Notes |
|---|---|---|
| {decision} | ✅ yes / ❌ no | |

### Issues Found
**CRITICAL**: {list or None, tagged with origin `code-bug|tasks-gap|design-gap|spec-gap`}
**WARNING**: {list or None, tagged with origin `code-bug|tasks-gap|design-gap|spec-gap`}
**SUGGESTION**: {list, no origin needed, or None}

### Traceability Matrix
{Omit this section entirely when the change's specs carry no stable REQ ids (`{#REQ-domain-NNN}`).}

| REQ | Tasks | Commits | Tests | Status |
|-----|-------|---------|-------|--------|
| {REQ-auth-003} | {1.2, 2.1} | {short-sha, short-sha} | {file > test name} | OK |
| {REQ-auth-004} | {2.3} | {short-sha} | (none) | WARNING — REQ without linked test |

Sources: task `[REQ-...]` tags in `tasks.md`; commit trailers `Ospec-Change` / `Ospec-Task` (join commits to REQs through the tasks they implement); test names or files citing the REQ id. A MUST requirement with no linked test is a WARNING (CRITICAL under Strict TDD). A REQ absent from every task is a `tasks-gap` finding.

### Assumption Reconciliation
{Omit this section entirely when `state.yaml assumptions:` is absent or empty.}

| id | statement | reversibility | outcome |
|----|-----------|----------------|---------|
| {sdd-design-001} | {statement} | {low\|high} | {confirmed / corrected / promoted / unresolved (WARNING raised) / unresolved (no escalation)} |

### Verdict
{PASS, PASS WITH WARNINGS or FAIL}
{one-line reason}
~~~

With Strict TDD the report also carries the five sections of `strict-tdd-verify.md`: TDD Compliance, Test Layer Distribution, Changed File Coverage, Assertion Quality and Quality Metrics.
