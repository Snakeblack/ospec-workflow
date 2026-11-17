# Briefs and Formats

Text to hand to the judges and to the fixer, and the table that closes a
round. Fill every `<placeholder>`; write the briefs in English and the report
to the user in their language.

## Brief for a judge

Both judges receive exactly this text.

```markdown
Review the target below and report what is wrong with it. You only read: do
not edit, run destructive commands or contact anyone.

Target: <commit, range or files at a commit>
Focus: <what the user cares about most, or "none">

Standards of the project:
<the rules that apply to these files, or "none">

Look for:
- behavior that differs from what the code, its tests or its documentation promise;
- inputs and states the code does not handle: empty, missing, repeated, concurrent, too large;
- errors that are swallowed, misreported or leave data half written;
- trust boundaries: unvalidated input, secrets, permissions, injection;
- work that grows with the data when it does not need to;
- departures from the standards above.

Report each finding as:
- Severity: BLOCKER, CRITICAL, WARNING or SUGGESTION
- Where: <path>:<line>
- What happens: <the wrong behavior, observable>
- How it is reached: <the call, input or state that triggers it in normal use,
  or "contrived" when only an unrealistic input does>
- Change: <what to do, in one line>

Report only what you can point to in the code. Do not praise, summarize or
guess. With nothing to report, answer exactly: NO FINDINGS.
```

## Brief for the fixer

```markdown
Fix the findings below and nothing else.

Target: <commit>

Findings:
<the confirmed findings the user approved, each with its path, line and change>

Standards of the project:
<the same block the judges received>

- Change only what a finding needs. Leave the rest of the code as it is.
- When the same defect repeats in a file you touch, fix every occurrence and say so.
- Add or adjust the test that would have caught each finding.
- Run the project's checks before answering.

Answer with, for each finding: the files and lines changed, the test that
covers it, and the result of the checks.
```

## Table of a round

```markdown
## Judgment day: <target>, round <n>

| # | Finding | Where | Judge A | Judge B | Severity | Status |
|---|---|---|---|---|---|---|
| 1 | Open range exports nothing | src/range.js:41 | yes | yes | CRITICAL | Confirmed |
| 2 | Retry repeats a rejected login | src/http.js:88 | yes | no | WARNING | Confirmed (evidence read) |
| 3 | Path fails on a drive root | src/paths.js:12 | no | yes | WARNING | Note (contrived) |
| 4 | Index out of range in `pick` | src/list.js:7 | yes | no | CRITICAL | Dropped (line guards it) |

Standards given to the judges: <source, or "none">
State: <APPROVED | ESCALATED | fixes pending approval>
```

Status values:

| Status | Meaning |
|---|---|
| Confirmed | Both judges report it, or one does and its evidence holds |
| Unconfirmed | One judge reports it and the evidence could not be settled |
| Note | Real only under a contrived input; never blocks |
| Dropped | The cited lines do not show it |

`BLOCKER` and `CRITICAL` findings block, and so does a `WARNING` that normal
use reaches. `APPROVED` needs none of them confirmed.
