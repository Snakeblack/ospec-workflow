---
name: skill-creator
description: "Create or rework a skill, after deciding it should be one. Trigger: new skill, create a skill, rework a skill, agent instructions."
license: MIT AND Commons-Clause
metadata:
  author: manuel-retamozo-garcia
  version: "2.0"
---

## When to Use

Load this skill to write a new skill or to rework one that agents misapply or
load at the wrong time. First decide where the guidance belongs: most of it is
not a skill.

| The guidance is | It belongs in |
|---|---|
| A procedure some tasks need, too long to restate each time | A skill |
| A rule that holds for every task of the project | The project's instruction file (`AGENTS.md` or the host's equivalent) |
| Something a command can check | A check in `idd/config.yaml`, a linter or a test: a check that fails beats an instruction |
| An architecture decision and its reasons | An ADR, through the `foundation` skill |
| How to use the product | The documentation |
| Needed once | Nowhere: say it in the reply |

## Rules

- Read `references/skill-style-guide.md` before writing; it decides the frontmatter, the body and the size of a skill.
- Search the existing skills first: extend the skill that already owns the subject instead of adding a second one.
- Write the description for the moment of choice: it names the situations that load the skill, in the words a user would use.
- Put the rules under a heading that ends in `Rules`, each one checkable in the result and readable alone.
- Name the command that prints a value the `ospec` CLI computes; never copy the value into the skill.
- Write down every point where the agent stops for the user: commits, pull requests, releases and anything published or irreversible.
- Keep in `SKILL.md` what every use needs, and move what only some uses need to `references/`.

## Steps

1. Write the situations that should load the skill and two that should not.
   If the first list is empty or matches every task, stop: the table above
   says where the guidance goes.
2. Pick the directory. In ospec-workflow it is `skills/<name>/`. In a project
   it is the skills directory of its host (`.claude/skills/`,
   `.agent/skills/`, `.gemini/skills/` or `skills/`).
3. Write the frontmatter, then the body in the order of the style guide: when
   to use, rules, procedure, output, references.
4. Read the rules alone, as a sub-agent receives them. Rewrite any rule that
   needs its section to make sense.
5. Try the skill on a real task of each situation of step 1, and cut every
   line the agent did not need.
6. Run the checklist that closes the style guide. In a project that uses SDD,
   refresh the registry with the `skill-registry` skill so delegations carry
   the new rules.

Reworking a skill follows the same steps, starting from the task where it
failed. Raise `metadata.version` when the agent will behave differently.

## Output

Report the files created or changed, the situations the skill was tried on,
and anything left for the user: a registry refresh, or an instruction file
that should name the skill.

## References

- [references/skill-style-guide.md](references/skill-style-guide.md): frontmatter, body, writing rules, size and the delivery checklist. Read it before step 3.
