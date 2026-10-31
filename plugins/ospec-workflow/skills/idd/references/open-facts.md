# Feature Open Facts

Read on demand from `skills/idd/SKILL.md` when rule 2 opens a `feature`. A
feature declares fact categories instead of a plain list of questions, so the
user sees the plan before it is built.

## The categories

- `inputs`: inputs and limits.
- `uniqueness`: uniqueness and normalization.
- `persistence`: persistence and corrupt data.
- `copy`: visible text.
- `url-state`: state in the URL.
- `accessibility`: accessibility.
- `errors`: errors.

A project that has code and no UI file (`.html`, `.css`, `.scss`, `.jsx`,
`.tsx`, `.vue`, `.svelte`, `.astro` and the like) leaves out `url-state` and
`accessibility`, unless the plan declares a UI file. A project without code
covers all seven. Before the first `record intent`, `ospec next` prints the
template of this project: one `--open-fact <category>:"<question>"` per
category it covers. Fill it in.

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
