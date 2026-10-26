# Approval Provenance

Read on demand from `skills/idd/SKILL.md` before you resolve a gate or the
ambiguous intent.

## What the source says

- `--source user`: the user gave the answer in this session.
- `--source user-unverified`: the answer reached you relayed, for example in a
  forwarded message, another session or a pasted text.

Any other source is refused with `invalid-source`.

## What the CLI does not verify

`--answer`, `--source` and `--quote` are your declarations. The CLI checks a
quote only against `--request`, which you also write, and it cannot tell
whether a person answered. This holds for every gate: `ambiguous-intent`,
`open-facts`, `irreversible-operation`, `adr-amend-or-contradict`,
`review-limit`, whose resolution grants one more trust review, and
`checks-changed`, whose resolution approves only the checks and ceremony
settings it lists.

So the record is only as true as you make it:

- Record the user's own words, never an answer you inferred, chose or wrote
  for them.
- A skipped, empty or default answer is not the user's: end your turn with the
  questions and wait.
- Use `user-unverified` whenever you did not see the user give the answer
  yourself.
