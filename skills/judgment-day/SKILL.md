---
name: judgment-day
description: "Run two independent reviewers over a fixed target and keep only findings with evidence. Trigger: judgment day, dual review, adversarial review, second opinion, juzgar."
license: MIT AND Commons-Clause
metadata:
  author: manuel-retamozo-garcia
  version: "2.0"
---

## When to Use

Load this skill only when the user asks for it: a judgment day, a dual or
adversarial review, a second opinion on some code. It is a review on demand
over any target, and it satisfies no obligation of a change: in IDD the trust
review runs through `ospec review`, and in SDD through the review gate.

## Rules

- Fix the target before judging: a commit, a range (`<base>..<head>`) or a list of files at a commit. Both judges and every later round read that same tree.
- Launch two judges at once, read-only, with the same brief and no view of each other's answer.
- Wait for both answers; one answer is not a verdict.
- Accept a finding only with its evidence: the file and line, and how normal use reaches it. Open the cited lines yourself; a finding whose evidence is not there is dropped.
- A finding both judges report is confirmed. A finding only one reports is confirmed only if its evidence holds when you read it; otherwise list it as unconfirmed.
- A problem that only a contrived or impossible input reaches is a note, never a blocking finding.
- Change nothing without the user's answer: show the confirmed findings and ask which to fix.
- Fix through the project's normal flow: in an IDD project a fix is a change, or part of the change still open.
- After a fix, judge again the new tree: the fixed findings and the lines the fix touched.
- Stop after two rounds of fixes with confirmed findings left, and ask the user how to go on.
- End with one of two states: `APPROVED`, with no confirmed blocking finding, or `ESCALATED`, with what is left for a person to decide.

## Steps

1. Agree the target and what matters most in it. Without a clear target, ask
   and launch nothing.
2. Gather the project's standards that apply to the files: its instruction
   file, and the compact rules of the skill registry when it has one. The
   same block goes to both judges and to the fixer.
3. Launch both judges with the brief of `references/prompts-and-formats.md`,
   on the strongest review model the host offers.
4. Verify the evidence of every finding and build the table of the round.
5. Show the table and ask what to fix. With nothing confirmed that blocks,
   the state is `APPROVED`.
6. Hand the approved findings to one fixer with the fixer brief, record the
   new commit as the target, and repeat from step 3 for that round.

## Output

One block per round: the target, the table of findings with their status
(confirmed, unconfirmed, note, dropped), the fixes applied and the final
state. Say which standards the judges received, or that the project had none.

## References

- [references/prompts-and-formats.md](references/prompts-and-formats.md): the brief for the judges, the brief for the fixer and the table of a round. Open it at step 3.
