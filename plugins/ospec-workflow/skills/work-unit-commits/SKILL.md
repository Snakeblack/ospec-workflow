---
name: work-unit-commits
description: "Split finished work into commits that each revert alone and pass the checks. Trigger: commit, split commits, commit message."
license: MIT AND Commons-Clause
metadata:
  author: manuel-retamozo-garcia
  version: "2.0"
---

## When to Use

Load this skill when the tree holds work to commit: after `ospec close` in
IDD, while applying SDD tasks, or whenever the user asks for commits. It turns
a diff into an ordered list of commits; `branch-pr` opens the pull request and
`chained-pr` splits a diff that exceeds the review budget.

Committing is the user's decision. Propose the list and commit only once they
agree, unless they already asked for the commits.

## Rules

- A work unit is one outcome: a behavior, a fix, a migration or a document, with the tests and the documentation that prove and explain it in the same commit.
- Each commit reverts alone and leaves the project's checks passing; a commit that needs the next one to build is half a unit.
- Order the commits so each builds on the previous ones: what others depend on goes first.
- Renames, moves and formatting go in their own commit, before the commit that changes behavior.
- Generated files and lockfiles go with the change that regenerates them.
- Write `type(scope): subject`: the Conventional Commit type in English, the subject in the project's language, imperative, naming the outcome and not the files.
- Add a body only when the diff does not show why; write it in the project's language.
- Never credit a model, a vendor or an agent tool in a commit: no `Co-Authored-By` naming one, no "generated with" line.
- When a hook refuses a commit, fix what it reports; skip a hook only with the user's explicit approval for that commit.
- Leave out anything the change did not need, and report it to the user instead.

## The Project's Language

Read it from `ospec team`: the `language` line. When it prints none, use the
language of the recent subjects (`git log -20 --format=%s`), and with no
history the language the user writes in. The type, the scope, identifiers and
trailers stay as they are.

## Steps

1. Read the whole diff: `git status --short`, then `git diff --stat` against
   the base branch. In IDD the plan of `change.md` lists the files and the
   work units the change declared.
2. Group the files by outcome, not by kind of file. A file that serves two
   outcomes is staged by hunks (`git add -p`).
3. Place what belongs to no behavior:

   | Content | Commit |
   |---|---|
   | The IDD archive (`idd/archive/<date>-<change>/`) and the changelog line `ospec close` wrote | The last unit of the change |
   | Version files and the changelog section of a release | A release commit, last and alone |
   | A fix the work ran into, outside the change | None: report it |

4. Show the user the list, one line per commit: subject, files, and the check
   that proves it. Wait for their answer.
5. For each commit, stage its unit, confirm with `git diff --cached --stat`
   that nothing else is staged, and commit.
6. Add the changed lines of the branch (`git diff --shortstat <base>...HEAD`).
   Above the review budget `ospec team` prints, load `chained-pr` before
   opening a pull request.

## Message Examples

For a project whose language is English:

```text
feat(auth): reject expired tokens at login
fix(export): keep the header row when the file is empty
refactor(billing): move the tax rules out of the invoice model
```

Weak subjects name files or activity (`update auth.js`, `add tests`,
`changes`): they say nothing the diff does not.

## Output

Report each commit with its hash and subject, the total of changed lines
against the review budget, and whatever was left out of the commits and why.
