# Strict TDD for sdd-apply

Read this module only when `testing.tdd_mode` is `strict`; the parent skill
already checked that. It replaces the per-task cycle of the parent skill and
nothing else: the contract, scope, workload, remediation, persistence and mark
guards of `skills/sdd-apply/SKILL.md` still hold. Without a usable test runner
the mode stays Strict and execution is recorded as `STATIC_VALIDATED` or
`DEFERRED` (see the evidence table); it never counts as a run that passed and
never turns into Standard.

## The test leads

The test states what the code must do before the code exists, so it shapes
the interface, the contract and the behavior; the code follows from it. Three
limits keep the cycle honest:

1. No production code without a failing test that asks for it.
2. No more test than it takes to fail.
3. No more code than it takes to pass.

## Which tasks run the cycle

| Task | What it records |
|---|---|
| Changes behavior | The full cycle. Never `N/A`. |
| Has no behavior to test (documentation, configuration without logic, a chore) | `N/A` in RED, GREEN and TRIANGULATE, with the reason in Notes / Rationale. |
| Refactors without changing behavior | The safety net before the edit and the same tests after it (step 5), with RED and GREEN `N/A`; approval tests cover what the existing tests do not pin (see below). |

## The cycle, task by task

0. **Safety net**, when the task edits existing files. Run the tests that
   cover those files and record the count (`✅ 14/14`). A test that already
   fails stops the task: report it as a pre-existing failure and leave it as
   it is. The count proves later that nothing that worked was broken.
1. **Understand.** Read the task, the spec scenarios and design decisions it
   touches (or `proposal-lite.md` on the lite route), check the parent
   skill's guards, read the code and tests around it, and choose the layer.
2. **RED.** Write the test for the expected behavior first. It must fail
   because that behavior is missing. In a compiled or typed language (Go, C#,
   TypeScript) a new signature may get an empty stub that returns a zero value,
   so the test compiles and fails on its assertion. When the function already
   exists, the test targets the behavior it does not have yet. GREEN does not
   start until this test exists.
3. **GREEN.** Write the least code that makes the test pass; returning a
   hard-coded value is allowed at this point. Run the test. When it fails, fix
   the code, not the test. The next step waits for a run that passes.
4. **TRIANGULATE**, only when the spec defines materially different scenarios
   or one example cannot pin the contract down. Add a case with other inputs
   and another expected output, so a hard-coded answer stops passing. A pass
   whose code never ran is no pass: a component that was never rendered, a
   loop over an empty list. GREEN means the production code ran and returned
   what the test expects. Skip this step when one test already pins the whole
   contract, and for structural tasks.
5. **REFACTOR**, only when it makes the assigned behavior clearer or removes a
   coupling shown to exist. Weigh it with
   `skills/_shared/engineering-judgment.md`: keep compatible boundaries and
   skip extractions that buy nothing. Run the tests once, after the whole
   refactor batch. If they stay green the batch is done; if one fails, undo
   the last refactor step and try a smaller one.
6. Mark `[x]` only after a local run passed, and `[~]` while execution is
   deferred.
7. Note every deviation or problem the task revealed.

## Choosing the layer

The layer follows what the task does and what the project has installed:

| The task builds | Layer | When the tools are missing |
|---|---|---|
| Logic, a calculation or a data transformation | Unit | — |
| What one component renders, its interaction or its state | Integration | Unit with test doubles |
| A flow across components, an API call, a provider or context | Integration | Unit with test doubles |
| A critical business flow, a whole user journey, navigation between pages | E2E | Integration, else unit |
| Anything else | Unit | — |

Use the smallest layer that observes the contract and its failure paths. A
unit test with doubles proves nothing about real integration or end-to-end
behavior: when the layer the task needs is missing, run the narrower checks
that still help and report the evidence that is missing so verify can ask for
it. Production boundaries are not redesigned to suit a test tool.

## Running the tests

The command is `rules.apply.test_command` from `openspec/config.yaml` when the
project sets it, else `test_runner.command` from the cached testing
capabilities, else whatever the project files show (`package.json`,
`pyproject.toml`, `go.mod`).

During the cycle run only the test file of the task, adapted to the runner:
`npx vitest run src/billing/invoice.test.ts`, `pytest tests/test_invoice.py`,
`go test ./billing -run TestInvoiceTotal`, `dotnet test --filter InvoiceTests`.
Short runs keep the cycle fast; the full suite belongs to sdd-verify.

## Pure functions where they fit

Code written in GREEN or TRIANGULATE is easier to test when its result
depends only on its arguments:

```ts
// The result depends only on the input, so a test needs no setup.
export function shippingCost(weightKg: number, zone: "EU" | "WORLD"): number {
  const perKg = zone === "EU" ? 1.5 : 4;
  return weightKg <= 2 ? 0 : (weightKg - 2) * perKg;
}

// Reads a global and writes the cart: a test has to build both first.
export function applyShipping(cart: Cart): void {
  cart.total += (cart.weightKg - 2) * rates[session.zone];
}
```

The first one gives the same output for the same input and touches nothing
else. Do not force the shape where it does not fit, as in a UI component that
owns its state.

## Approval tests for refactors

A refactor first fixes the behavior it must keep:

1. Find the behavior the refactored code has today.
2. Existing tests that already pin it act as approval tests. For what they do
   not cover, write tests that call the code with known inputs and assert the
   outputs it gives today, wrong or awkward as they may be.
3. Run them: they pass, because they describe the present.
4. Refactor.
5. Run them again. Still green means the behavior survived; a failure means
   the refactor changed it, so undo it.
6. When the spec asks for different behavior, change the approval test to the
   new expected output first (it fails: RED), then implement it (GREEN).

## TDD Cycle Evidence

With Strict TDD, `apply-progress.md` and the result of the phase carry this
section, one row per task of the batch:

```markdown
### TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 3.1 | `src/billing/invoice.test.ts` | Unit | ✅ 14/14 | ✅ Written | ✅ Passed | ✅ 4 cases | ✅ Clean | |
| 3.2 | `tests/api/test_refunds.py` | Integration | N/A (new) | ✅ Written | ✅ Passed | ➖ Single | ➖ None needed | |
| 3.3 | `internal/tax/rate_test.go` | Unit | DEFERRED | ✅ Written | STATIC_VALIDATED | ➖ Deferred | ➖ None needed | No Go toolchain here; read against the spec, task stays [~]. |
| 3.4 | — | — | N/A | N/A | N/A | N/A | ➖ None needed | Documentation only, no behavior. |

### Test Summary
- Tests written: {N}
- Tests passing: {N}
- Layers: unit {N}, integration {N}, E2E {N}
- Approval tests: {N, or "None: no refactoring task"}
- Pure functions added: {N}
```

sdd-verify reads these values, so each column keeps its vocabulary:

| Column | Values |
|---|---|
| Safety Net | `✅ N/N` or `✅ N tests passing` when the existing tests ran before the edit; `N/A (new)` when the files are new; `DEFERRED` when no run was possible; `N/A` for a task with nothing to test. |
| RED | `✅ Written`: the test existed before the code. `N/A` only for a task without behavior or a refactor that keeps it. |
| GREEN | `✅ Passed` after a run; `STATIC_VALIDATED` or `DEFERRED` when nothing could run; `N/A` as in RED. |
| TRIANGULATE | `✅ N cases`; `➖ Single` when the spec has one scenario; `Triangulation skipped: <reason>`; `➖ Deferred`; `N/A`. |
| REFACTOR | `✅ Clean` after a green run; `➖ None needed`. |
| Notes / Rationale | Required with `STATIC_VALIDATED`, `DEFERRED` or `N/A`. |

## Assertions that prove behavior

An assertion has to exercise production logic. A test that passes without it
is worse than no test, because it reports safety that does not exist.

### Rejected assertions

```text
# Compares constants: no production code takes part.
assert.equal(2, 2)
self.assertTrue(True)
expect(null).toBeNull()

# An empty result with nothing in the setup that explains it.
expect(orders).toEqual([])
assert not rows

# Existence or type alone: the value is never checked.
expect(invoice).toBeDefined()
assert user is not None
expect(typeof config).toBe("object")

# A loop over a list that may be empty: zero rows, zero assertions.
for (const row of screen.queryAllByRole("row")) {
  expect(row).toHaveTextContent("paid")
}
# Assert the count first, with data that guarantees it:
expect(screen.queryAllByRole("row")).toHaveLength(3)

# A pass whose setup never reaches the code under test, for example a filter
# checked while the list it filters is never rendered. Add the case that
# reaches it before calling the cycle done.
```

### Assertions that count

Each one meets all three conditions:

1. It calls production code: a function, a method, a component.
2. It compares with a concrete value taken from the spec.
3. It breaks when the implementation is wrong.

```text
expect(shippingCost(12, "EU")).toBe(15)
assert response.status_code == 409
expect(screen.getByRole("status")).toHaveTextContent("3 items")
assert report.findings[0].rule == "max-length"
```

### Empty results

Asserting an empty result counts only when the setup creates the condition
that should produce it, the production code ran to reach it, and another test
with different data gets a non-empty result.

### Smoke tests

Rendering a component and asserting only that it is there tests no behavior
and does not count toward the cycle:

```tsx
// Proves only that something rendered.
render(<OrderSummary order={order} />);
expect(screen.getByTestId("summary")).toBeInTheDocument();

// Proves what the component shows from its data.
render(<OrderSummary order={order} />);
expect(screen.getByRole("heading")).toHaveTextContent("Order #1042");
expect(screen.getByText("Total: 48.00 €")).toBeInTheDocument();
```

A smoke test is acceptable only next to assertions like the second pair.

### Test doubles

The number of doubles is a hint, not a defect and not a reason to stop. Ask
whether the setup hides the behavior, or replaces the very boundary the test
claims to check. An existing pure helper suits an isolated transformation, and
an integration test suits a risk that lives in the wiring. Extract new logic
only when its cohesion and ownership justify it under
`skills/_shared/engineering-judgment.md`, never to bring down a count of
doubles. Keep doubles at explicit external boundaries and assert observable
results. A helper tested on its own says nothing about how its caller wires
it.

### Implementation details

Assert what the user or the caller sees, not how the code produces it:

```text
# Breaks on any styling or internal change.
expect(badge).toHaveClass("bg-red-500")
expect(badge.style.fontWeight).toBe("700")
expect(fetchRates).toHaveBeenCalledTimes(2)
expect(form.state.submitting).toBe(true)

# Survives refactoring.
expect(screen.getByRole("alert")).toHaveTextContent("Card declined")
expect(screen.getByRole("button", { name: "Pay" })).toBeDisabled()
```

A CSS class name is never a valid assertion. Test the semantic result (a
role, visible text, a disabled control), or use visual regression or an E2E
screenshot when the look itself is the requirement.

## Rules (Strict TDD)

- No production code before the test that asks for it.
- GREEN needs a run that passes. Only when nothing can run does the task get `STATIC_VALIDATED` or `DEFERRED`, after a careful static check.
- Triangulate whenever the spec defines several scenarios, until a hard-coded answer no longer passes.
- None of the rejected assertions above.
- Every assertion calls production code and checks a specific expected value.
- The safety net runs before any existing file is edited.
- The TDD Cycle Evidence table is always reported: verify checks it.
- A missing runner, an infrastructure failure or no command execution never yields invented evidence. Check statically as far as possible, record `STATIC_VALIDATED` or `DEFERRED`, keep the task `[~]` until a local run passes and report the missing run for a later phase that can execute. These markers neither change verify's policy nor make the cycle a pass.
- Pure functions where they fit, not forced where they do not.
- A refactor fixes its behavior with approval tests before the code changes.
- During the cycle, only the relevant test file runs, never the full suite.

### The evidence record

`apply-progress.md` holds exactly one fenced `json:strict-tdd-evidence` block
with schema v1. It is the record programs read; the Markdown table is derived
from it:

```json
{
  "schema_version": 1,
  "change": "{change-name}",
  "functional_snapshot": {
    "projection": "strict-tdd-functional-v1",
    "base_tree": "{base tree}",
    "genesis_paths": ["{production file the change created or edited}"],
    "files": [{ "path": "{production file}", "digest": "sha256:{hex}" }]
  },
  "cycles": [
    {
      "task": "3.1",
      "test_file": "src/billing/invoice.test.ts",
      "layer": "unit",
      "safety_net": "✅ Passed",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": { "test_file": "src/billing/invoice.test.ts", "test_digest": "sha256:{hex}", "source": "working-tree" }
    }
  ]
}
```

The rows under `## Final Derived Markdown Table` are what `renderEvidenceTable`
of `{{ospec-runtime}}/scripts/lib/strict-tdd-evidence-remediation.js` derives
from the block, and its validation rejects cycle markers outside the set it
knows. Provenance and tests are recorded only when they exist: never made up.

When block and table disagree while the work is right, the repair is the
evidence-only path of the parent skill: it keeps the identity of the
candidate and of its genesis paths, stays within the configured cap (40 lines
at most) and gets at most one focal recheck. Anything else keeps the CRITICAL
finding and goes through ordinary remediation. The record and every
remediation event are validated with a real `rootDir` and the current digests
of the candidate, the finding, the provenance and the evidence file.
