---
name: branch-pr
description: "Take a change from its branch to a merged pull request. Trigger: create branch, open PR, pull request, merge PR."
license: MIT AND Commons-Clause
metadata:
  author: manuel-retamozo-garcia
  version: "3.0"
---

## When to Use

Load this skill twice in a change: before its first edit, to create the
branch, and when the work is ready, to open the pull request and take it to
the merge. `work-unit-commits` writes the commits, and `chained-pr` takes over
when the diff exceeds the review budget.

## Rules

- Feature branch MUST be created before any project file is edited: `git switch -c <type>/<description>` from the up-to-date base.
- Never edit files or commit on the default branch: every change reaches it through a branch and a pull request.
- Name the branch `<type>/<description>`: a Conventional Commit type, a slash, and lowercase words joined by hyphens.
- Read the base branch and how many pull requests may be in flight from `ospec team`, and finish the open one first when it prints `serial`.
- Open a pull request only for work whose checks pass on the committed tree; in IDD, only after `ospec close` succeeded.
- One pull request delivers one change; above the review budget `ospec team` prints, load `chained-pr` before opening it.
- Never rewrite a pushed branch: bring a moved base in with `git merge`, never with a rebase or a force-push.
- Write the title as a Conventional Commit subject, and the title and the body in the project's language.
- The body says what changed, why, and the evidence that it works: each command that ran and its result.
- Use the pull request template and the labels the repository already has; never invent a label or link an issue that does not exist.
- Never credit a model, a vendor or an agent tool in the title, the body or a comment.
- Push, open, merge and release only with the user's approval for that step; green checks are not an approval.
- Merge only with the checks of the pull request green, and delete the branch once it is merged.

## What the Project Decides

`ospec team` prints what this skill does not decide. A project without `ospec`
uses the fallback.

| Value | Line of `ospec team` | Fallback |
|---|---|---|
| Base branch | `integration`, when it prints one | The default branch: `git symbolic-ref --short refs/remotes/origin/HEAD` |
| Pull requests in flight | `branching` and `branching rules` | One at a time |
| Review budget | `delivery` | The one `chained-pr` gives |
| Language | `language` | That of the recent subjects (`git log -20 --format=%s`), then the user's |
| Release | `release` and `release rules` | None: ask the user |

## Before the Branch

1. Check the tree with `git status --short`. Work already started on the base
   moves to the branch in step 4; commits already made there stay, and the
   user decides what to do with them.
2. With `serial` branching, `gh pr list --state open` must be empty: finish
   that pull request first, or ask the user. The pull requests of one chain
   count as one.
3. Update the base: `git switch <base>` and `git pull --ff-only`.
4. Create the branch: `git switch -c <type>/<description>`. The type is the
   one the commits will carry (`feat`, `fix`, `docs`, `refactor`, `perf`,
   `test`, `build`, `ci`, `chore`, `revert`), and in IDD the description is the
   change id.

## Before the Pull Request

1. Commit by work unit (`work-unit-commits`) until `git status --short` is
   empty.
2. Prove the checks on that tree. In IDD, `ospec close` succeeded and its
   archive is committed. In SDD, the verify report passed. With neither, run
   the checks the project declares (its contributing guide, its CI workflow
   or its package scripts) and keep the output.
3. Bring the base in when it moved: `git fetch`, then `git merge origin/<base>`.
4. Measure the diff: `git diff --shortstat origin/<base>...HEAD`. Above the
   review budget, load `chained-pr`.
5. Write the title and the body, show them with the size and the labels, and
   wait for the user's answer before pushing.

## The Pull Request

The title is the Conventional Commit subject that names the outcome of the
whole change: `type(scope): subject`.

When the repository has a template (`.github/PULL_REQUEST_TEMPLATE.md`, in any
letter case, or one in `docs/` or the root), fill every section of it.
Otherwise write these three:

```markdown
## Summary
<what changed and why, in one to three lines>

## Changes
- <one outcome, and where it lives>

## Evidence
- `<command>`: <result>
```

Take the content from what the change recorded, not from memory: in IDD the
intent, the decisions and the evidence of its `change.md`; in SDD the proposal
and the verify report. Add `Closes #<n>` only for an issue that exists and
that this pull request resolves.

Read the labels with `gh label list` and add those that describe the change,
such as a `type:*` label when the repository has that family. Then:

```bash
git push -u origin <branch>
gh pr create --base <base> --title "<title>" --body-file <file> --label <label>
```

Pass the body as inline text or as a literal file path. The ospec guard reads
the title and the body before the command runs, and it refuses a body it
cannot read, such as a path held in a shell variable or text piped in.

Without `gh`, or on a host that is not GitHub, push the branch and use that
host's CLI when it is installed. Without one, give the user the title, the
body and the URL that `git push` printed.

## After Opening

1. Watch the checks: `gh pr checks <number> --watch`. Fix a failure with a new
   commit on the branch.
2. Ask the user to approve the merge of that pull request. Use the merge
   method the project's instructions name; without one, the method the
   repository allows
   (`gh repo view --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed`),
   and ask when it allows several.
3. After the merge, update the base (`git switch <base>`,
   `git pull --ff-only`) and delete the local branch.
4. When `ospec close` returned a `release`, propose it now as the
   `release rules` of `ospec team` say, and create nothing without the
   user's OK.

## Output

Report the branch, the pull request URL, the state of its checks, and the
step that waits for the user.
