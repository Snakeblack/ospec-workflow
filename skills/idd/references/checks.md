# Project Checks

Read on demand from `skills/idd/SKILL.md` when `next_step.action` is
`configure-checks`. `idd/config.yaml` is optional, but without at least one
`checks:` command no IDD change can close. `ospec next` returns
`configure-checks` when checks are needed and none are declared; `ospec check`
names the missing configuration. Do not repeat `check` while that
configuration is missing.

## Propose and wait

Propose the step's `candidate_command` to the user as a suggestion, never as
evidence or an approved command. If it is null, inspect the project's test
documentation and manifests to propose a command, or ask which command to
use. Ask for explicit approval and stop until the user answers. Do not infer
consent from a manifest, lockfile or passing test.

## Write it

Only after approval, create or update `idd/config.yaml` with the approved
command, for example:

```yaml
checks:
  test: npm test
```

Read any existing configuration first and preserve its other keys and
checks. Then resume with `ospec next`.
