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
`review-limit`, whose resolution grants one more trust review,
`checks-changed`, whose resolution approves only the checks and ceremony
settings it lists, and `base-moved`, whose resolution moves the base of the
change past the commits and paths it lists.

So the record is only as true as you make it:

- Record the user's own words, never an answer you inferred, chose or wrote
  for them.
- A skipped, empty or default answer is not the user's: end your turn with the
  questions and wait.
- Use `user-unverified` whenever you did not see the user give the answer
  yourself.

## The turn fence

The end-of-turn hook of each host counts the turns that ended in
`.ospec/turns`, and a gate keeps the count of its opening. An answer recorded
with `--source user` before another turn ended is kept as `user-unverified`,
with the source you declared and the reason, and `record gate` and `close`
warn about it; nothing blocks. So open the gate before you ask (`record
intent`, `record impact`, `record gate --open` or `ospec check` opens it), end
your turn with its questions, and record the answer in the turn that brings
it: an answer the user gave before the gate was open is recorded in the turn
that opens it, so it is kept `user-unverified`. A question tool answers inside
the turn, and the CLI cannot tell its answer from one you wrote. A gate opened
before the first turn end of a repository counts from 0, so its answer is
verified once that turn ended. Without a count at the answer (no hook in this
workspace), every `user` answer is kept as `user-unverified`. The count says
that a turn ended, not who answered.

For the same reason, a project check is approved at `checks-changed`, never
before it is written: write the proposed command to `idd/config.yaml` and run
`ospec check`, which runs nothing and opens the gate; then end your turn
asking, as `references/checks.md` says. An approval given before the gate
opened is recorded in the turn that opens it, so it is kept `user-unverified`.
A `user-unverified` answer still approves the checks it lists, and the next
`ospec check` runs them: the fence warns, it does not stop a command. Only
asking and waiting keeps an unapproved command from running.
