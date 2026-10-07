---
name: idd
description: "Impact-driven development protocol: run a code change through the ospec CLI, which derives its obligations and decides when it is done. Trigger: a code change in a project in IDD mode."
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
---

## When to Use

Load this skill once, when the router sends a code change here (IDD mode). It
is the whole protocol: there are no phases, no proposal and no specs to write
first. Questions, explanations and read-only work need no change and do not
use it.

## The CLI decides

`ospec` below means `node "{{ospec-cli}}"`, run from the project root. Add
`--json` to read its answer; every change command takes `--change <id>`. The
CLI owns `idd/<change>/state.yaml`: never write that file, and never move or
delete anything under `idd/` by hand.

- `ospec next --change <id> --json` names the next step. Its
  `next_step.how` is the command that records the evidence. Follow it.
- An obligation is satisfied only by evidence the CLI records from a run it
  observes (`ospec run`, `ospec check`, `ospec review`). Saying that tests
  pass satisfies nothing.
- The change is done when `ospec close` succeeds, and only then. Never report
  it done, verified or archived before that.

## Rules

1. Open the change: pick a short kebab-case id from the request, then record
   the intent with `ospec record intent --change <id> --kind <bug|feature|refactor|docs> --summary "<what>" --acceptance "<observable result>"`.
2. If the request is materially ambiguous (no acceptance can be stated), record
   `ospec record intent --change <id> --ambiguous --request "<request>"`, ask
   the user the question `next` returns, and resolve it with the same command
   plus `--kind --summary --acceptance --answer "<their words>" --source user`.
3. Declare the plan before editing: `ospec signals --change <id> --path <file>...`
   with every file you expect to touch; add `--work-units <n>` when the work
   splits into several units, `--decision` when it records a design decision,
   and `--operation <op>` for a destructive or irreversible operation.
4. Loop: `ospec next --change <id> --json`, do what `next_step` says, repeat.
   Work the obligations in the order `next` gives them:
   - `repro-test`: write the reproduction test first and run it with
     `ospec run --obligation repro-test --command "<test>"` while it fails;
     fix the code; run the same command again so it passes.
   - `tdd-red-green`: the same red-then-green pair, per unit (`--unit <name>`).
   - `contract-spec-and-test`: update the contract document and its test.
   - `migration-compat-and-test`: run the migration test with
     `--plan "<compatibility or rollback plan>"`.
   - `trust-review`: `ospec review start`, hand the returned request to the
     read-only `review-trust` reviewer, and pass its findings JSON unchanged to
     `ospec review record --result @<file>`. Fix what it blocks on, run
     `ospec review correct`, hand its request to the read-only
     `review-correction` validator and pass its result to
     `ospec review validate --result @<file>`.
   - `checks-pass`: `ospec check` runs every declared check on the current
     tree.
   - `living-doc`: keep the Plan and Decisions of `idd/<id>/change.md` current.
5. `ospec check` recomputes the signals from the real diff. New obligations can
   appear: work them like the rest. One leaves `pending` only through evidence,
   or through `ospec record withdraw --reason` when no active signal derives it.
6. When `next_step.action` is `close`, run `ospec close --change <id>`. A
   refusal names what is still pending: settle it and close again.

## Gates

Stop for the user only at the three gates, and ask with the host's question
tool:

- `ambiguous-intent`: rule 2.
- `irreversible-operation`: before a destructive or irreversible operation.
- `adr-amend-or-contradict`: when the change amends or contradicts an ADR.

Resolve each one with `ospec record gate --change <id> --gate <id> --resolve --answer "<their words>" --source user`.
Only an explicit answer from the user resolves a gate. Anything else is decided
by the code and the evidence, without asking.

## Delivery

`ospec close` archives the change under `idd/archive/` and leaves the working
tree as it is. Branches, commits and pull requests are the user's decision.
When they ask, use `work-unit-commits` to split commits, `branch-pr` to open the
PR, and `chained-pr` when the diff exceeds the review budget.
