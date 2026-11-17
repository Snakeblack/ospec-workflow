---
name: comment-writer
description: "Write a comment others will read on a PR, an issue or a review: the point, its evidence, the next step. Trigger: PR comment, review feedback, issue reply, status update."
license: MIT AND Commons-Clause
metadata:
  author: manuel-retamozo-garcia
  version: "2.0"
---

## When to Use

Load this skill to write a comment that people outside the conversation will
read: review feedback, a reply on an issue or a pull request, or a status
update on a thread. The body of a pull request belongs to `branch-pr`, and
documentation to `cognitive-doc-design`.

A posted comment notifies people and stays in the record. Show the draft and
post it only when the user agrees, unless they already asked for it to be
posted.

## Rules

- Open with the point: the request, the answer or the status. Context comes after, and only what the reader lacks.
- Make one point per comment; a second finding is a second comment, anchored to its own line.
- Claim only what was verified, and give the evidence: the file and line, the command and its output, or the failing input.
- Turn an unverified suspicion into a question, never into a statement.
- Say whether a finding blocks the merge or is a suggestion.
- Ask for a concrete change: what to do, not that something feels wrong.
- Write about the code, never about its author.
- Write in the language of the thread; a new thread uses the project's language.
- Keep it to what the reader needs to act: no summary of the diff, no praise as padding.
- Mention a person only to notify them, and only with their real handle.
- Never name a model, a vendor or an agent tool as the author of the comment or of the work.

## Shape by Kind

| Kind | Holds |
|---|---|
| Review finding | What happens and where, the evidence, the change asked for, whether it blocks |
| Approval | What was checked, and what was not |
| Request to split | The changed lines against the review budget `ospec team` prints, and a proposed cut by work unit |
| Answer to a question | The answer first, then where it comes from |
| Status update | Done and verified, pending, blocked and on whom |

The project's language is the `language` line of `ospec team`. When it prints
none, use the language of the recent commit subjects.

## Examples

A finding that blocks:

```markdown
`parseRange` returns an empty list for `"5-"` (src/range.js:41), so an open
range exports nothing. `node -e 'console.log(parseRange("5-"))'` prints `[]`.

Treat a missing end as the last page, or reject the input with an error. This
blocks the merge: the export silently loses data.
```

A suspicion, as a question:

```markdown
Does `retry` run again after a 401? I could not find a test for it, and
src/http.js:88 retries on any status above 399.
```

## Posting

```bash
gh pr comment <number> --body-file <file>
gh pr review <number> --request-changes --body-file <file>
gh issue comment <number> --body-file <file>
```

## Output

Give the user the draft, where it will be posted and who it notifies. After
posting, report the link.
