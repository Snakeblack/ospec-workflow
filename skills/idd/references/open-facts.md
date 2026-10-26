# Feature Open Facts

Read on demand from `skills/idd/SKILL.md` when rule 2 opens a `feature`. A
feature declares seven fact categories instead of a plain list of questions,
so the user sees the plan before it is built.

## The seven categories

- `inputs`: inputs and limits.
- `uniqueness`: uniqueness and normalization.
- `persistence`: persistence and corrupt data.
- `copy`: visible text.
- `url-state`: state in the URL.
- `accessibility`: accessibility.
- `errors`: errors.

## How each one is covered

Record the intent with `--request "<the user's words>"` and cover every
category once, with one of:

- `--open-fact <category>:"<question>"`: a concrete question for the user. At
  least one category is a question; one that only names the category is
  refused.
- `--cite <category>=<path:line>`: a line that exists and holds a letter or a
  digit, and that settles the behavior. It never names a manifest or a
  lockfile. Outside the documentation, it names a file the plan declares
  (`ospec signals --path`) or the diff touches: `ospec check` refuses it
  otherwise.
- `--quote <category>="<fragment>"`: a literal fragment of `--request`, at
  least 12 characters long.

No two categories share a cite or a quote. A refusal prints the full command:
fix what it names and record again. A quote proves only that `--request` holds
it, and you write `--request`: quote the user's words, never your own summary
(`references/approvals.md`).

The questions open the `open-facts` gate: ask all of them at once, before
editing anything.
