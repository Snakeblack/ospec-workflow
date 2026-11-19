# Chain Playbook

Commands and text for a chain of pull requests. `<base>` is the default
branch, or the integration branch when the project declares one. The examples
cut a history of five commits into three slices.

## Cut the branches

The work is already committed in order on one branch. A slice is a branch
that points at the last commit of that slice, so nothing is cherry-picked.

```bash
git log --oneline <base>..HEAD        # c1 c2 | c3 | c4 c5
git branch feat/orders-1-model c2
git branch feat/orders-2-api c3
git branch feat/orders-3-ui c5
git push -u origin feat/orders-1-model feat/orders-2-api feat/orders-3-ui
```

Name the slices `<type>/<change>-<n>-<what>`, so the order is visible in any
list of branches.

Lines of one slice, as the reviewer will see them:

```bash
git diff --shortstat <base>...feat/orders-1-model
git diff --shortstat feat/orders-1-model...feat/orders-2-api
```

## `stacked-to-main`

Each slice reaches the base by itself, in order.

```text
<base>
  └─ feat/orders-1-model    PR 1 → <base>
       └─ feat/orders-2-api      PR 2 → feat/orders-1-model
            └─ feat/orders-3-ui       PR 3 → feat/orders-2-api
```

```bash
gh pr create --head feat/orders-1-model --base <base> --title "<title>" --body-file <file>
gh pr create --head feat/orders-2-api --base feat/orders-1-model --title "<title>" --body-file <file>
gh pr create --head feat/orders-3-ui --base feat/orders-2-api --title "<title>" --body-file <file>
```

When PR 1 merges, PR 2 becomes the first of the chain:

```bash
gh pr edit <PR 2> --base <base>       # when the host did not re-target it
git switch feat/orders-2-api
git fetch origin && git merge origin/<base>
git push
```

## `feature-branch-chain`

Nothing reaches the base until every slice is reviewed. A tracker branch
gathers them, and a draft pull request from the tracker to the base shows the
whole change.

```text
<base>
  └─ feat/orders                tracker, draft PR → <base>
       └─ feat/orders-1-model       PR 1 → feat/orders
            └─ feat/orders-2-api         PR 2 → feat/orders-1-model
                 └─ feat/orders-3-ui          PR 3 → feat/orders-2-api
```

```bash
git branch feat/orders <base> && git push -u origin feat/orders
gh pr create --head feat/orders-1-model --base feat/orders --title "<title>" --body-file <file>
gh pr create --head feat/orders-2-api --base feat/orders-1-model --title "<title>" --body-file <file>
gh pr create --head feat/orders-3-ui --base feat/orders-2-api --title "<title>" --body-file <file>
```

The tracker holds no commit of its own until PR 1 merges into it. Open its
draft pull request then, and mark it ready only when the last slice has
merged into the tracker:

```bash
gh pr create --draft --head feat/orders --base <base> --title "<title>" --body-file <file>
```

## The chain block

Add it to the body of every pull request of the chain, below what the
project's template asks for, in the project's language. Mark the current
slice in the list.

```markdown
## Chain

| | |
|---|---|
| Position | 2 of 3 |
| Base | `feat/orders-1-model` |
| Changed lines | 310 of a budget of 400 |
| Leaves working | The orders API, with its tests |
| Waits for a later slice | The orders screen (slice 3) |

1. #101 Order model
2. **#102 Orders API (this pull request)**
3. #103 Orders screen
```

The tracker's body lists the slices and says that it merges last.

## A diff that shows another slice

| What the pull request shows | Cause | Repair |
|---|---|---|
| The lines of the slice before it | Its base is not that slice's branch | `gh pr edit <PR> --base <branch of the slice before>` |
| Lines already merged | The parent merged and the base moved | Merge the base into the slice branch and push |
| Lines of a later slice | The branch points past the cut | Open a new branch at the right commit and a new pull request; close the old one |

A pushed branch is never rebased or force-pushed.

## Reviewing a chain

- Review the slices in order; each one is read against the slice before it.
- A finding on a merged slice is fixed in the first slice still open, or in a
  new last slice, never by rewriting history.
- Above the budget without an accepted exception, ask for a split before
  reading.
