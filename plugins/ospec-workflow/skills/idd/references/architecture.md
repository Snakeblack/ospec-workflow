# Architecture Knowledge

Read on demand from `skills/idd/SKILL.md` when the change bears on ADRs or
quality scenarios: the project has `docs/architecture/`, or `next` returns
`adr-impact-declaration`, `references`, `warnings`, or an `adr-promotion` or
`foundation` suggestion.

## Declare the references

When `docs/architecture/component-map.yaml` gives components `paths` and
`knowledge`, the CLI adds the current ADRs and quality scenarios of the
components you touch; declare with `--adr <id>` or `--quality <id>` only the
others the change bears on. Without such a map, read the ADRs under
`docs/architecture/decisions/` that govern that code and declare each one, and
each quality scenario of `docs/architecture/knowledge-map.yaml`.

## `adr-impact-declaration`

For each declared ADR or scenario,
`ospec record impact --change <id> --adr <id> --impact <none|conforms|amends|supersedes|contradicts> --reason "<why>"`.
Amending, superseding or contradicting opens `adr-amend-or-contradict`.
Once the user approves an amendment or supersession, write the new ADR with
the foundation template (never rewrite an accepted one) and attach it with
`--record <path>`; `ospec check` lints it.

`ospec check` also runs their fitness checks from the change's base; a failure
names the ADR: fix the code, never the check. `fitness.manual` items never
block: verify each, then
`ospec record fitness --change <id> --adr <id> --evidence "<what you verified>"`.

## What `next` adds

A `suggestions` entry `adr-promotion` never blocks: when the change takes an
architecture decision at a boundary, propose an ADR to the user. Nor does
`foundation`, which means the project has no code yet: before the first change,
offer the user the `foundation` skill as an option, once; if they decline, go
on with the change. `references`
lists the knowledge of the touched components by id: read only those, and
only the `current` ones as the rules the change follows. Each `warnings` entry
names a stale or absent reference: tell the user, and never treat it as true
until it is fixed.
