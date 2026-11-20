# Strict TDD for sdd-verify

Read this module only when `testing.tdd_mode` is `strict`; the parent skill
already checked that. It adds steps 5a to 5f to the verification and five
sections to the report, and nothing else: evidence levels, the compliance
matrix, the lineage router and the persistence rules of
`skills/sdd-verify/SKILL.md` still hold. A missing runner or tool limits the
evidence verify can gather; it never turns the mode into Standard.

## What this mode adds

Standard verification asks whether the code does what the specs say. Strict
TDD also asks whether it was built test first. sdd-apply reports how each task
went through the cycle, in the vocabulary of `skills/sdd-apply/strict-tdd.md`;
this module checks that report against the repository and against real test
runs, and never takes it on trust.

## Step 5a: the TDD Cycle Evidence table

Open `apply-progress.md` and find `### TDD Cycle Evidence`. Without it, apply
did not follow the protocol: report CRITICAL, since this step has nothing
left to read.

Set the table against the task list (`tasks.md`, or the task file of the
route). Every task that writes or changes code needs a row, and a missing row
is CRITICAL. Tasks without code (documentation, configuration without logic,
chores) may be left out or carry `N/A`.

Classify each row, then apply its checks:

| Row | Checks |
|---|---|
| Task without code | RED, GREEN, TRIANGULATE and Safety Net read `N/A` or `➖`. No test is checked. |
| Refactor that keeps the behavior, with RED and GREEN `N/A` | Safety Net shows the existing tests passing before the edit, and the same tests pass in step 5b; otherwise CRITICAL. No new test is needed. |
| Any other task with code, with RED or GREEN `N/A` or `➖` | CRITICAL: `N/A` never exempts a change of behavior. |
| Any other task with code | The column checks below. |

Column checks for a task with code:

| Column | What verify checks |
|---|---|
| RED | It reads `✅ Written` and the test file exists in the repository; otherwise CRITICAL. |
| GREEN | It reads `✅ Passed`, `STATIC_VALIDATED` or `DEFERRED`. With `✅ Passed` the test file passes in step 5b, else CRITICAL. With `STATIC_VALIDATED` or `DEFERRED`, run the test file when a runner exists (a failure is CRITICAL), and Notes / Rationale explains why nothing ran (left empty, CRITICAL). |
| TRIANGULATE | `✅ N cases`: the test file holds N cases. `➖ Single`: the spec gives this task a single scenario. `Triangulation skipped: <reason>`: the reason is not empty. `➖ Deferred` (no run yet) exempts nothing. In every case, several spec scenarios with one test case and no valid reason to skip is a WARNING. |
| Safety Net | `✅ N/N` or `✅ N tests passing`: the existing tests ran before the edit. `N/A (new)` or `N/A`: confirm the files are new, not edited; an edited file that already had tests (see git history or the tree before the change) is a WARNING. `DEFERRED` gives no finding of its own: no run was possible, and the GREEN check of the same row decides. |
| REFACTOR | Not checked: how clean the code is cannot be proved from the table. |

End the step with `{N}/{total} tasks with complete TDD evidence`. Step 5f
audits the assertions of the same test files.

## Step 5b: run the tests

Run every test file from step 5a with the project's test command and record
pass or fail for each, to set against what the table claims. When nothing can
execute, check the test files statically and write in the report why and how.

`STATIC_VALIDATED` and `DEFERRED` record honestly that a run was impossible;
they are not passes. The Evidence Levels and the compliance matrix of the
parent skill decide each scenario. A test that passes today proves today's
behavior, not that it failed before the code existed: never invent or fill in
a run history.

## Step 5c: test layers

Sort every test file the change created or edited into a layer:

| Layer | What it exercises | Signs |
|---|---|---|
| Unit | One function or class on its own | No rendering, page, network, database or HTTP, and dependencies replaced. Go: a `t *testing.T` test with fake interfaces. Python: `unittest.TestCase`, or pytest with mock fixtures. C#: `[Fact]` or `[Test]` with Moq or NSubstitute. Kotlin: `@Test` with MockK or fake interfaces. |
| Integration | Components working together, or what a user does with one | `render()`, `screen.`, `userEvent.`, Testing Library imports. Go: a real database or `httptest.NewServer`. Python: the Django or Flask test client, or WebTest. C#: `WebApplicationFactory` or a test database context. Kotlin: Ktor `testApplication` or `@SpringBootTest`. |
| E2E | The whole system through a real browser or HTTP | `page.goto()`, Playwright or Cypress imports, a browser context. In Go, Python, C# or Kotlin, a full server driven with Selenium or Playwright. |
| Unknown | None of the above | Report it as found. |

Report how many tests and files each layer has, and the total. Compare with
the cached testing capabilities: a test that uses a tool they do not list is a
WARNING, and the report says how it runs. Note which layer covers each spec
scenario. When integration or E2E tools are installed and critical business
logic has only unit tests, raise a SUGGESTION.

## Step 5d: coverage of the changed files

Only when the cached capabilities list a coverage tool. Run the test command
with coverage and keep only the files the change created or edited (the Files
Changed table of `apply-progress.md`). For each one report the line coverage,
the branch coverage when the tool gives it, and the uncovered line ranges, not
just a percentage. Rate each file by its line coverage:

| Line coverage | Rating |
|---|---|
| 95 % or more | ✅ Excellent |
| From 80 % to under 95 % | ⚠️ Acceptable |
| Under 80 % | ⚠️ Low, with its uncovered lines |

Add the average over the changed files, the total of uncovered lines and, when
the project configures a threshold, how they compare with it. A changed file
under 80 % is a WARNING.

Without a coverage tool, the report says the analysis was skipped because no
tool was found. That is not a failure.

## Step 5e: linter and type checker

Only with the tools the cached capabilities list, and only for the changed
files:

| Tool | How it runs | Finding |
|---|---|---|
| Linter | On the changed files | Each error a WARNING, each warning a SUGGESTION |
| Type checker | Usually on the whole project; keep its output for the changed files | Each type error a WARNING |

With neither tool, the report says these metrics were skipped because no tool
was found.

## Step 5f: assertion quality (always)

Read every test file the change created or edited and judge its assertions;
no static analysis tool is needed. A test that passes without proving anything
is worse than a missing test, because it reports safety that does not exist.

| Pattern | Example | Severity |
|---|---|---|
| Tautology: only constants are compared | `expect(true).toBe(true)`, `assert True`, `expect(1).toBe(1)` | CRITICAL |
| No production code runs: no call, render or request in the test | | CRITICAL |
| No assertion: the test runs and checks nothing | | CRITICAL; it has to be rewritten |
| Ghost loop: assertions inside a loop over `queryAll` or `filter` results that may be empty | | CRITICAL: an empty list runs zero assertions, so the test always passes |
| Incomplete cycle: the setup keeps the code under test from running | A component that is never rendered because of its state | CRITICAL: the setup must reach that code path |
| Empty result, with no test that gets a non-empty one | `expect(result).toEqual([])`, `assert len(result) == 0` | WARNING |
| Existence or type only, with no value checked in the same test | `toBeDefined()`, `not.toBeNull()`, a `typeof` check | WARNING |
| Smoke test: it renders and asserts only that something is there | `render()` plus `toBeInTheDocument()` | WARNING; it does not count toward the cycle |
| Implementation details: CSS classes, internal state, calls to a double | `expect(el.className).toContain("text-xs")`, `expect(mock.calls.length).toBe(3)` | WARNING: assert behavior instead |
| Too many doubles: a case with more than twice as many doubles or spies as assertions, or 7 or more | `vi.mock()`, a mock library, hand-written fakes in Go | WARNING `Mock-heavy test case ({N} mocks, {N} assertions)`; suggest moving the logic to a pure function or the test to a wider layer |

For each violation record the file, the line, the assertion and why it proves
nothing.

Then judge triangulation by counting the distinct test cases of each
behavior. A behavior with several spec scenarios and a single case is a
WARNING (`Insufficient triangulation for {behavior}`), and so are cases that
all expect the same kind of trivial value, such as an empty list each time
(`Every case expects the same trivial value`). A behavior is well triangulated
when its cases expect different values.

End the step with `{N} trivial assertions found across {N} files`.

## Report sections

With Strict TDD the verification report carries these five sections as well:

````markdown
### TDD Compliance
| Check | Result | Details |
|---|---|---|
| Evidence table in apply-progress | ✅ / ❌ | {found / missing} |
| Each task with code has a test | ✅ / ❌ | {N}/{total} tasks |
| RED: test files exist | ✅ / ⚠️ | {N}/{total} files found |
| GREEN: tests pass when run | ✅ / ❌ | {N}/{total} passing |
| Triangulation | ✅ / ⚠️ / ➖ | {N} triangulated, {N} single case |
| Safety net on edited files | ✅ / ⚠️ | {N}/{total} edited files |

**TDD Compliance**: {N} of {total} checks pass

### Test Layer Distribution
| Layer | Test cases | Files | Tool |
|---|---|---|---|
| Unit | {N} | {N} | {tool} |
| Integration | {N} | {N} | {tool, or not installed} |
| E2E | {N} | {N} | {tool, or not installed} |
| **All layers** | **{N}** | **{N}** | |

### Changed File Coverage
| File | Lines | Branches | Not covered | Rating |
|---|---|---|---|---|
| `src/billing/invoice.ts` | 97% | 91% | — | ✅ Excellent |
| `src/billing/refund.ts` | 84% | 70% | L31-36, L58 | ⚠️ Acceptable |

**Average changed file coverage**: {N}%, or the line saying coverage was skipped

### Assertion Quality
| Test file | Line | Assertion | Why it proves nothing | Severity |
|---|---|---|---|---|
| `src/billing/invoice.test.ts` | 18 | `expect(true).toBe(true)` | Compares constants | CRITICAL |
| `src/billing/invoice.test.ts` | 40 | `expect(lines).toEqual([])` | Empty, and no test gets a non-empty result | WARNING |

**Assertion quality**: {N} CRITICAL and {N} WARNING

### Quality Metrics
| Tool | Result |
|---|---|
| Linter | ✅ clean / ⚠️ {N} warnings / ❌ {N} errors / ➖ not installed |
| Type checker | ✅ clean / ❌ {N} errors / ➖ not installed |
````

When step 5f finds nothing, Assertion Quality leaves out its table and says
`**Assertion quality**: ✅ every assertion checks real behavior`.

## Rules

- The TDD Cycle Evidence table of `apply-progress.md` is the first thing to
  read; without it the finding is CRITICAL.
- What the table claims is checked against real runs.
- Step 5f runs on every verification in this mode.
- A tautology is CRITICAL and has to be rewritten.
- Coverage, the linter and the type checker inform: at most a WARNING, never
  CRITICAL. The layer distribution is at most a SUGGESTION.
- A tool that is not installed is reported as missing, never as a failure.
- Report, never fix: the orchestrator decides what happens next.

## Focal recheck of the evidence

When the lineage asks for `run-focal-recheck`, this is the single recheck its
persisted budget allows. Confirm that the frozen candidate and its sorted
genesis paths have not changed, validate the authoritative
`json:strict-tdd-evidence` block and run the tests it references. Only a
repair that touched the evidence and nothing else passes; a failed, repeated,
over-cap or material check fails closed and returns to the ordinary routing by
origin. `reduce` of
`{{ospec-runtime}}/scripts/lib/strict-tdd-evidence-remediation.js` decides,
and it needs the persisted typed action, a real `rootDir` and the digests of
the candidate, the finding, the origin, the evidence and the referenced tests.
