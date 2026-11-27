# Skill Style Guide

How a `SKILL.md` of ospec-workflow is written, and the shape recommended for
the skills of a project that uses it. `openspec/specs/skills/spec.md` is the
contract; this guide says how to meet it.

## How a skill reaches the agent

A skill is a set of instructions an agent loads when a task needs them. It
arrives in three ways, and each one decides part of how it is written.

| How it arrives | What the agent sees | What that asks of the skill |
|---|---|---|
| Listed by the host | `name` and `description` | The description alone says when to load it |
| Loaded by name | The whole `SKILL.md` | All that every use needs, and nothing more |
| Injected into a sub-agent (SDD) | Up to 15 lines taken from its rules sections | Each rule reads right with no text around it |

A file under `references/` or `assets/` arrives only when `SKILL.md` sends the
agent to it.

## Frontmatter

```yaml
---
name: release-notes
description: "Write the notes of a release from its changelog section. Trigger: release notes, changelog summary, announce a version."
license: MIT AND Commons-Clause
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
---
```

- `name` is the directory name.
- `description` is one physical line in double quotes: what the skill does and
  when to load it. Aim for 160 characters; 250 is the limit.
- The words after `Trigger:` are split on commas and semicolons and indexed.
  Without `Trigger:` the name is the only trigger.
- `license` is the license of the project that hosts the skill, and
  `metadata.author` its author. In ospec-workflow they are the two values
  above.
- `metadata.version` is a quoted string. Raise it when the skill makes the
  agent behave differently.
- `capabilities: [<technology>]` belongs to stack skills only, and the
  delegation flags (`disable-model-invocation`, `user-invocable`,
  `metadata.delegate_only`) to SDD phase skills only.
- There is no `Keywords` field: discovery reads the description.

## Body

Only one part of the body is read by a program: the rules. The rest is shaped
by what the agent needs, in this order.

1. **When to use it, and when not.** Open with the situations that load the
   skill. Name the ones that look alike and belong elsewhere, and where they
   go.
2. **Rules.** Put them under a heading that ends in `Rules` (`## Rules`,
   `## Commit Rules`). The registry takes its list items and table rows, 15 at
   most, and injects them into SDD sub-agents. A table row becomes
   `first cell: second cell - third cell`; a header row whose first cell is
   `Rule` or `Gate` is skipped, and so is a heading that contains `Anti`.
   Without such a heading the skill gives sub-agents no rules.
3. **The procedure.** Numbered steps when the order matters, a decision table
   when the agent has to choose, plain bullets otherwise.
4. **What to hand back.** Only when the user or another agent consumes the
   result: say what the answer holds.
5. **References.** Relative paths to local files, each with the moment to open
   it.

Section names are free, except that the rules heading ends in `Rules`. Prefer
`When to Use`, `Rules`, `Steps`, `Output` and `References`, so skills read
alike.

## Writing rules

- **The CLI decides and the skill names the command.** A value or a rule the
  `ospec` CLI computes (the review budget, the delivery strategy, the
  language, an obligation, a gate) is never restated: say which command
  prints it. A copy drifts; the command does not.
- **Every value has a source and a fallback.** Say where the agent reads it
  and what to do when that source is missing, so the skill works in IDD, in
  SDD and in a project that uses neither.
- **The user's decisions stay with the user.** Branches, commits, pull
  requests, releases and anything published or irreversible: say where to
  stop and what to ask.
- **Each rule can be checked.** Someone reading the result can tell whether
  the rule was followed. "Write good commits" cannot be checked; "one commit
  reverts alone and leaves the checks passing" can.
- **Each rule stands alone.** It may be read without its section: no "as
  above", no pronoun that points outside the line.
- **One instruction lives in one skill.** When two skills need it, one owns
  it and the other names that skill.
- **Say what to do.** How the rule was reached belongs in the changelog or in
  an ADR.
- **Skills are written in English.** What they make the agent write follows
  the language of the project.
- **An example is the smallest one that removes a doubt.** Real commands,
  placeholders in `<angle brackets>`.
- **No external URL is the source of a rule,** and no model, vendor or agent
  tool is ever named as an author.

## Size

Every line is paid each time the skill loads, and a rule is paid in every
delegation that carries it.

- Keep in `SKILL.md` what every use needs. Move to `references/` what some
  uses need. Delete what changes nothing the agent does.
- The rules of a skill stay under 450 estimated tokens (characters divided by
  four), and 50 to 150 is the target. In ospec-workflow a test fails above
  the limit, and the limit is never raised to admit a skill.
- A `SKILL.md` over 150 lines usually holds a reference inside: split it.

## Before delivering a skill

- [ ] `name` equals the directory, and the description is one quoted line of
      250 characters or fewer that says when to load the skill.
- [ ] The rules sit under a heading that ends in `Rules`, are 15 or fewer and
      each one stands alone.
- [ ] No value the CLI computes is restated; its command is named.
- [ ] Every stop for the user is written down.
- [ ] Every path under `References` exists.
- [ ] In ospec-workflow, the repository's checks pass: they cover the
      license, the rules budget and the figures of the catalog.
