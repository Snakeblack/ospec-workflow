---
name: skill-registry
description: "Build or check the skill registry that SDD delegations read. Trigger: skill registry, update skills, actualizar skills."
license: MIT AND Commons-Clause
metadata:
  author: manuel-retamozo-garcia
  version: "2.0"
---

## When to Use

Load this skill when the user asks to update the skill registry, when a skill
of the installation changed in the middle of a session, or when an SDD
sub-agent reports a `skill_resolution` other than `injected`.

The registry is a cache, `.ospec/cache/skill-registry.cache.json`, of what
each installed skill gives a delegation: its triggers, its capabilities and up
to 15 compact rules. The SDD orchestrator pastes the rules that fit into each
sub-agent prompt, as `_shared/skill-resolver.md` says. IDD does not use it, so
a project without OpenSpec has nothing to build.

## Rules

- Never write or edit `.ospec/cache/skill-registry.cache.json` by hand: `ospec registry` and the `SessionStart` hook are its only writers, and each replaces a cache it did not build.
- Build the registry with `ospec registry`, never by reading every `SKILL.md`.
- A skill gives sub-agents only the list items and the table rows under a heading that ends in `Rules`, 15 at most.
- A skill is matched by the words after `Trigger:` in its `description` or by its `capabilities`; with neither, only its own name matches.
- To change what a skill gives sub-agents, edit that skill's `SKILL.md` and run `ospec registry` again.
- The registry indexes the skills root of the ospec-workflow installation; a skill kept in another directory does not enter it.
- The `sdd-*` phase skills, `_shared` and `skill-registry` are never entries: agents load them by name.
- Never edit an installed copy of a skill of ospec-workflow: an update overwrites it, so report the gap instead.

## Steps

`ospec` below means `${CLAUDE_SKILL_DIR}/../../bin/ospec`, run from the project root.

1. Run `ospec registry` and read the status on its first line:

   | Status | Meaning | Next |
   |---|---|---|
   | `generated` | The cache was missing, stale or not built by the runtime, and is rebuilt | Step 2 |
   | `reused` | The cache already matched the installed skills | Step 2 |
   | `skipped` | OpenSpec is not initialized in this project | Stop: say that the registry serves SDD and that `sdd-init` sets it up |

   A `registry-skills-missing` refusal means the installation is incomplete:
   run `ospec doctor` and report what it says.
2. Read the lines after the counts. Each one names a gap and the skills that
   have it:

   | Line | What it means | When it is a defect |
   |---|---|---|
   | `no rules for sub-agents` | The skill injects nothing | The skill is meant to guide code or reviews, not only to be run by name |
   | `matched by name only` | No `Trigger:` and no `capabilities` | The orchestrator should pick it for a kind of task or a technology |

3. Fix a defect in a skill the user owns, following
   `../skill-creator/references/skill-style-guide.md`, and run
   `ospec registry` again. For any other skill, report the gap.
4. A running orchestrator keeps the rules it read at its first delegation.
   After a `generated` result, tell it to read the cache again before the
   next delegation.

Without a way to run commands, change nothing: the `SessionStart` hook
rebuilds the cache at the next session start.

## Output

Return the status, the two counts, each skill with a gap and what was done
about it, and whether the orchestrator has to read the cache again.
