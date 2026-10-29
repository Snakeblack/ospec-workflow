# Project Checks

Read on demand from `skills/idd/SKILL.md` when `next_step.action` is
`configure-checks`. `idd/config.yaml` is optional, but without at least one
`checks:` command no IDD change can close. `ospec next` returns
`configure-checks` when checks are needed and none are declared; `ospec check`
names the missing configuration. Do not repeat `check` while that
configuration is missing.

## Propose it

Propose the step's `candidate_command` as a suggestion, never as evidence or
an approved command. If it is null, inspect the project's test documentation
and manifests to propose a command, or ask the user which command to use.
Do not infer consent from a manifest, lockfile or passing test.

## Write it and ask at the gate

Write the proposed command to `idd/config.yaml`, for example:

```yaml
checks:
  test: npm test
```

Read any existing configuration first and preserve its other keys and
checks. Then run `ospec check`: until the user approves the checks and
ceremony settings, it runs nothing and opens `checks-changed` naming them.
Ask for explicit approval by ending your turn with its question, and stop
until the user answers. Resolve the gate with their words and run
`ospec check` again. If the user declines, restore `idd/config.yaml` as it
was; if they name another command, write that one and ask again.

Any answer that resolves the gate approves the checks, a `user-unverified`
one too, and the next `ospec check` runs them. The CLI cannot tell who
answered, so never resolve it before the user replies.
