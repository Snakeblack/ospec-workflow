---
name: issue-creation
description: "Write an issue the next change can start from: one problem, its evidence and an observable result. Trigger: create issue, file an issue, bug report, feature request."
license: MIT AND Commons-Clause
metadata:
  author: manuel-retamozo-garcia
  version: "2.0"
---

## When to Use

Load this skill when the user asks to file an issue, or agrees to file what a
change left out: a defect outside its scope, a follow-up, a friction with a
tool. Work that starts now needs no issue: open the change. A question is
answered, not filed. The evidence this skill adds to a duplicate it found is
its own; any other reply on an existing issue belongs to `comment-writer`.

An issue is published where other people read it. A request to file one asks
for the draft, not for its publication: the user sees every draft before it
goes out.

## Rules

- One issue holds one problem or one request: split what would be fixed or decided on its own.
- Search open and closed issues first; when one covers the problem, propose adding the new evidence to it and file no second issue.
- State the result as what a person can observe once the issue is done, never as the code to write.
- A defect carries the steps that reproduce it, the expected result, the actual one, and the version or commit where it was seen.
- Quote evidence exactly: the command, the error text and `path:line`, never a paraphrase of an error.
- Never put secrets, tokens, personal data or private code in an issue: cut them from a log before quoting it.
- Never file a vulnerability as a public issue: follow the security policy of the repository, or ask the user for the private channel.
- Use the issue templates and the labels the repository already has; never create a label, assign a person or set a milestone unasked.
- Write the title and the body in the project's language.
- Never credit a model, a vendor or an agent tool in an issue.
- Never approve, close or relabel an issue on behalf of a maintainer unless the user asked for that action.
- Publish an issue, or evidence added to an existing one, only after the user saw that draft and agreed; a request to file is not that agreement.

## What the Issue Holds

| Part | Content |
|---|---|
| Title | The problem or the request in one line, in the style of the existing titles |
| Kind | `bug`, `feature`, `refactor` or `docs` |
| Summary | What is wrong or missing, and who meets it |
| Evidence | Steps, expected and actual result, `path:line`, version or commit |
| Result | What can be observed when it is done |
| Open questions | Each behavior nobody has decided yet, one per line |
| Out of scope | What the issue does not ask for, when a reader could assume it |

When the repository has a template its fields decide the shape: put each part
in the field that asks for it, and add the result when no field does.

These parts are what a change starts from. Whoever takes the issue passes
them to `ospec record intent` as `--kind`, `--summary`, `--acceptance` and one
`--open-fact` per open question.

The project's language is the `language` line of `ospec team`. When it prints
none, or the project has no `ospec`, use the language of the existing issues,
and with none the language the user writes in.

## Steps

1. Find where issues live: `git remote get-url origin`. On GitHub use `gh`
   once `gh auth status` passes; on another host use its CLI when it is
   installed. Without one, the steps below still produce the draft, and the
   user pastes it.
2. Search for duplicates with the words of the problem:
   `gh issue list --state all --search "<words>"`. Show a likely one to the
   user before going on.
3. Read what the repository asks for: its templates
   (`.github/ISSUE_TEMPLATE/`) and its labels (`gh label list`).
4. Draft the issue. For something a change left out, take the evidence from
   that change (in IDD, `change.md` under `idd/<change>/` or
   `idd/archive/<date>-<change>/`) and name it.
5. Show the draft with its labels, or the comment for an existing issue, and
   wait for the user's answer.
6. Publish what the user agreed to, from a file:
   `gh issue create --title "<title>" --body-file <file> --label <label>`, or
   `gh issue comment <number> --body-file <file>` for an existing issue.
   A form template (`.yml`) is not filled from the command line: write one
   `### <field label>` heading per field, in the template's order, and pass
   the labels the template declares.

## Output

Return the issue URL, or the draft when nothing was published; the duplicates
considered; and anything the issue leaves out and why.
