---
name: chained-pr
description: "Split a change over the review budget into chained pull requests, each reviewable alone. Trigger: chained PRs, stacked PRs, large PR."
license: MIT AND Commons-Clause
metadata:
  author: manuel-retamozo-garcia
  version: "2.0"
---

## When to Use

Load this skill when the changed lines of a branch exceed the review budget,
when SDD tasks forecast that they will, or when the user asks for chained or
stacked pull requests. A diff within the budget goes in one pull request with
`branch-pr`.

The budget and what to do above it are not decided here. `ospec team` prints
both: `delivery: <strategy> (review budget <n> lines)`. In SDD the tasks
artifact carries the same strategy and the forecast.

| Strategy | Above the budget |
|---|---|
| `single-pr` | Ask the user: accept the size as an exception, or split |
| `ask-on-risk` | Ask the user: chain, or accept the size as an exception |
| `auto-chain` | Split without asking, and report the chain |
| `exception-ok` (SDD) | One pull request, with the accepted exception written in it |

An accepted exception is one pull request labeled `size:exception`, with the
reason in its body. When `ospec team` prints no delivery line, or the project
has no `ospec`, ask the user what to do above 400 changed lines.

## Rules

- Count what a reviewer reads: additions plus deletions against the base, leaving out lockfiles and generated files, which the pull request body names.
- Cut the chain between commits, never inside one: each slice is one or more whole work units, with their tests and documentation.
- Each slice passes the project's checks alone, on top of the slices before it.
- Each pull request targets the branch of the slice before it, so its diff shows one slice; the first targets the base, or the tracker branch of a `feature-branch-chain`.
- Use one shape for the whole chain: `stacked-to-main` or `feature-branch-chain`.
- Never rewrite a pushed branch: bring a moved parent in with `git merge`.
- Merge in order, from the first slice; a later slice never merges before the ones it stands on.
- Re-target the next pull request before merging the one it stands on, never after: deleting a merged branch can close the pull requests based on it instead of re-targeting them, and a closed pull request cannot be re-targeted.
- Version files and the changelog section of a release go in the last pull request only.
- Each pull request body carries the chain block: position, base, what the slice leaves working and what waits for a later one.
- Opening pull requests is the user's decision: show the chain and wait, unless the strategy is `auto-chain`.

## Choosing the Shape

| Question | Shape |
|---|---|
| Can each slice reach the base branch by itself without breaking users? | `stacked-to-main`: slices merge into the base one by one |
| Must nothing reach the base until the whole change is ready? | `feature-branch-chain`: slices gather in a tracker branch, which merges once |

The base is the default branch, or the integration branch when `ospec team`
prints one. When SDD tasks name a `Chain strategy`, use that one.

## Steps

1. Commit by work unit first (`work-unit-commits`): the chain is cut from a
   linear history.
2. Measure each commit and group consecutive ones into slices within the
   budget. A single commit above it is split into smaller units, or goes as
   one slice with an accepted exception.
3. Check out the last commit of each slice and run the project's checks.
   Move the cut when a slice fails alone.
4. Show the user the chain: for each slice its commits, its changed lines and
   what it leaves working. Wait for their answer.
5. Create one branch per slice at its last commit, push them, and open the
   pull requests from the first slice on, as `references/chain-playbook.md`
   shows.
6. Merge each slice once it is approved: re-target the next pull request to
   the base of the one being merged, merge it and delete its branch, then
   bring the base into the next slice. A pull request the host closed anyway
   is reopened as the playbook shows.

In IDD the change closes once, before the chain is cut: its archive and its
changelog line travel in the last slice. With serial branching the chain is
one delivery, so its pull requests may be open together.

## Output

Report the shape, the pull requests in order with their base and changed
lines, the check run on each slice, and any exception with its reason.

## References

- [references/chain-playbook.md](references/chain-playbook.md): the commands for each shape, the merge order, the chain block of the pull request body, how to repair a diff that shows another slice and how to reopen a pull request closed by a merge. Open it at step 5.
