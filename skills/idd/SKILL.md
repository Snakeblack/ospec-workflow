---
name: idd
description: "Impact-driven development protocol: run a code change through the ospec CLI, which derives its obligations and decides when it is done. Trigger: a code change, unless SDD is requested or mode: sdd."
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
---

## When to Use

Load this skill once, when the router sends a code change here (IDD is the
default). It is the whole protocol — no phases, proposal or specs first.
Questions, explanations and read-only work need no change and do not use it.

Outside a git work tree `ospec` opens no change (`not-a-git-repo`,
`git-not-found`): set up the repository first, as `references/repository.md`
says.

## The CLI decides

`ospec` below means `node "{{ospec-cli}}"`, run from the project root. Add
`--json` to read its answer; every change command takes `--change <id>`. The
CLI owns `idd/<change>/state.yaml`: never write that file, and never move or
delete anything under `idd/` by hand.

- `ospec next --change <id> --json` names the next step. Its
  `next_step.how` tells how to proceed: approve missing check configuration
  as described below, or run the command that records the evidence. Follow it.
- An obligation is satisfied only by evidence the CLI records from a run it
  observes (`ospec run`, `ospec check`, `ospec review`). Saying that tests
  pass satisfies nothing.
- The change is done when `ospec close` succeeds, and only then. Never report
  it done, verified or archived before that.

## Project checks

`idd/config.yaml` is optional, but without at least one `checks:` command no
IDD change can close. `ospec next` returns `configure-checks` when checks are
needed and none are declared; `ospec check` names the missing configuration.
Do not repeat `check` while that configuration is missing.

When `next_step.action` is `configure-checks`, propose its `candidate_command`
to the user as a suggestion, never as evidence or an approved command. If it
is null, inspect the project's test documentation and manifests to propose
a command, or ask which command to use. Ask for explicit approval and stop
until the user answers. Only after approval, create or update
`idd/config.yaml` with the approved command, for example:

```yaml
checks:
  test: npm test
```

Read any existing configuration first and preserve its other keys and
checks. Do not infer consent from a manifest, lockfile or passing test.
Then resume with `ospec next`.

## Rules

1. Read the code the request touches, then list its open facts: each behavior
   that neither the request nor the code settles and that a careful engineer
   would ask about. Look for defaults, invalid or edge input, error versus
   silent handling, normalization (case, rounding, order), who may do it, and
   whether existing behavior, output or a published API may change. Do not
   decide them yourself. With cross-session memory tools, recall prior
   decisions first, as `references/memory-loop.md` says.
2. Open the change: pick a short kebab-case id from the request and record
   the intent with `ospec record intent --change <id> --kind <bug|feature|refactor|docs> --summary "<what>" --acceptance "<observable result>"`
   plus the open facts, one `--open-fact "<question>"` each, or
   `--no-open-facts --basis "<what settles every behavior>"` when there are
   none. Features name `inputs`, `uniqueness`, `persistence`, `copy`, `url-state`, `accessibility` and `errors` with a question (at least one), a real `path:line` or a ≥12-char quote of the request; refusal prints the command. Assumptions: `ospec record assumption --text` (close lists them). Open `open-facts`: ask all at once before
   editing anything.
3. If the request is materially ambiguous (no acceptance can be stated), record
   `ospec record intent --change <id> --ambiguous --request "<request>"`, ask
   the user the question `next` returns, and resolve it with the same command
   plus `--kind --summary --acceptance --answer "<their words>" --source user`
   and the open-facts declaration of rule 2.
4. Declare the plan before editing: `ospec signals --change <id> --path <file>...`
   with every file you expect to touch; add `--work-units <n>` when the work
   splits into several units, `--decision` when it records a design decision,
   and `--operation <op>` for a destructive or irreversible operation. When
   `docs/architecture/component-map.yaml` gives components `paths` and
   `knowledge`, the CLI adds the current ADRs and quality scenarios of the
   components you touch; declare with `--adr <id>` or `--quality <id>` only
   the others the change bears on. Without such a map, read the ADRs under
   `docs/architecture/decisions/` that govern that code and declare each one,
   and each quality scenario of `docs/architecture/knowledge-map.yaml`.
   If the plan overstated a signal, retract
   it with `ospec record retract --change <id> --signal <id> --reason "<why>"`;
   the CLI refuses while the diff confirms it.
5. Loop: `ospec next --change <id> --json`, do what `next_step` says, repeat.
   `resolve-gate` comes first while any gate is open: ask its
   `pending_decision` (see Gates) and build nothing it decides until the user
   answers. Work the obligations in the order `next` gives them:
   - `repro-test`: write the reproduction test first and run it with
     `ospec run --obligation repro-test --command "<test>"` while it fails;
     fix the code; run the same command again so it passes.
   - `tdd-red-green`: the same red-then-green pair, per unit (`--unit <name>`).
   - `contract-spec-and-test`: update the contract document and its test.
   - `migration-compat-and-test`: run the migration test with
     `--plan "<compatibility or rollback plan>"`.
   - `adr-impact-declaration`: for each declared ADR or scenario,
     `ospec record impact --change <id> --adr <id> --impact <none|conforms|amends|supersedes|contradicts> --reason "<why>"`.
     Amending, superseding or contradicting opens `adr-amend-or-contradict`.
     Once the user approves an amendment or supersession, write the new ADR
     with the foundation template (never rewrite an accepted one) and attach
     it with `--record <path>`; `ospec check` lints it.
     `ospec check` also runs their fitness checks from the change's base; a
     failure names the ADR: fix the code, never the check. `fitness.manual`
     items never block: verify each, then
     `ospec record fitness --change <id> --adr <id> --evidence "<what you verified>"`.
   - `trust-review`: `ospec review start`, hand the whole returned request to
     the read-only `review-trust` reviewer, and pass its JSON unchanged to
     `ospec review record --result @<file>`. Fix what it blocks on, run
     `ospec review correct`, hand its request to the read-only
     `review-correction` validator and pass its result to
     `ospec review validate --result @<file>`.
   - `checks-pass`: `ospec check` on the current tree; a `tests 0` summary is not
     evidence.
   - `living-doc`: keep the Plan and Decisions of `idd/<id>/change.md` current.
     A development decision stays there; it is never an ADR.

   A `suggestions` entry `adr-promotion` never blocks: when the change takes
   an architecture decision at a boundary, propose an ADR to the user.
   `references` lists the knowledge of the touched components by id: read only
   those, and only the `current` ones as the rules the change follows. Each
   `warnings` entry names a stale or absent reference: tell the user, and
   never treat it as true until it is fixed.
6. `ospec check` recomputes the signals from the real diff. New obligations can
   appear: work them like the rest. One leaves `pending` only through evidence,
   or through `ospec record withdraw --reason` when no active signal derives it.
7. Edit text files keeping their encoding and line endings: never rewrite a
   file through a tool or script that changes them (for example Python
   `open()` without `encoding=` and `newline=`).
8. When `next_step.action` is `close`, run `ospec close --change <id>`. A
   refusal names what is still pending: settle it and close again.

## Build it simply

Make the smallest change that meets the acceptance. Reuse what the code
already has and follow its conventions. Add a layer, abstraction, dependency
or configuration switch only for a need present in this change, and record
the choice with `--decision` when it is not obvious. Leave unrelated code as
it is: report a defect outside the change instead of fixing it in passing.

## Tests by risk

Test what would cost something if it broke: business rules, validation,
non-trivial transformations and mappers, algorithms, contracts, and their
error, edge and regression paths. Code with nothing to get wrong (plain
accessors, wiring without logic, declarations) needs no test of its own, and
no coverage percentage replaces this choice.

- A test must fail when the behavior is wrong: assert observable results, not
  the calls the code makes, and check that the red run fails for the reason
  you expect.
- Unit tests are deterministic and offline: replace databases, external APIs
  and infrastructure with test doubles at the boundary, and inject time and
  randomness. An integration test, kept apart, proves the wiring.
- A refactor writes no new test: run `ospec check` before the first edit, so
  a recorded run shows the behavior it preserves was tested.

## Gates

Stop for the user at the gates and for project-check approval above. Ask
with the host's question tool, or without one end your turn with the questions.
A skipped, empty or default answer is not the user's: end your turn with the
questions and wait.

- `ambiguous-intent`: rule 3.
- `open-facts`: rule 2; ask all of `pending_decision.questions` at once.
- `irreversible-operation`: `--operation` in rule 4 or a destructive
  statement in the diff opens it. Before any other destructive or
  irreversible step (deleting data, rewriting published history), open it
  yourself: `ospec record gate --change <id> --gate irreversible-operation --open --reason "<operation>"`.
- `adr-amend-or-contradict`: an impact `amends`, `supersedes` or
  `contradicts` opens it. Declare every one before asking, since the gate is
  answered once. For a departure no declared reference covers, open it with
  `ospec record gate --change <id> --gate adr-amend-or-contradict --open --reason "<ADR>: <how the change departs from it>"`.
  A change that conforms opens nothing.
- `review-limit`: `ospec check` opens it when the trust reviews run out.

Resolve each one with `ospec record gate --change <id> --gate <id> --resolve --answer "<their words>" --source user`.
Only an explicit answer from the user resolves a gate. Outside these gates
and project-check approval, follow the code and the evidence without asking.

## Several services or repositories

`ospec` works on one repository root. A change across repositories is one
IDD change per repository, each closed on its own evidence. Keep a shared
contract compatible until every consumer moves: extend the provider first,
then migrate the consumers, and remove the old form last. In a monorepo whose
services keep their manifests below the root, propose to the user the
`impact:` entries of `idd/config.yaml` (`stack` and the contract, data and
security paths of each service), as for checks.

## Delivery

`ospec close` archives the change under `idd/archive/` and leaves the working
tree as it is. Branches, commits and pull requests are the user's decision;
propose the `team.delivery_strategy` of `next`. When they ask, use
`work-unit-commits` to split commits, `branch-pr` to open the PR, and
`chained-pr` when the diff exceeds the review budget. Pitch your replies at
`team.mentorship`: `mentor` explains why, `expert` stays terse.

## Memory and roadmap hand-off

After `ospec close`, and after the delivery the user asks for, follow
`references/memory-loop.md`: save the `records` of `close` when memory tools
exist, and propose the next roadmap item in any case.
