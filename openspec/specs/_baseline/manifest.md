# Baseline Manifest

## Domain Map (batch 0 — written once, user-approved)
- generator: Build pipeline that transforms the canonical source tree into target-native file distributions (claude, vscode, github-copilot, opencode) | sources: scripts/configure/cli.js, scripts/lib/target-transform.js, scripts/lib/target-profiles/*.js, scripts/lib/frontmatter.js, scripts/lib/model-resolver.js, scripts/configure/validate-*.js, scripts/configure/claude-marketplace.js
- routing: Intent-based route dispatcher resolving SDD workflow routes and gates from openspec/config.yaml | sources: scripts/lib/route-dispatcher.js
- hooks: Runtime event hooks (SessionStart, PreToolUse, PreCompact, SubagentStop, Stop) and their support libraries | sources: scripts/hooks/*.js, hooks/hooks.json, scripts/lib/ospec-state.js, scripts/lib/artifact-store.js, scripts/lib/workspace-atlas.js
- skills: Skills catalog of SDD phase skills and utility skills with frontmatter-driven trigger and compact-rule extraction | sources: skills/**/*.md
- agents: Phase agent templates and slash-command prompt files for all SDD phases | sources: agents/*.agent.md, commands/*.prompt.md
- skill-registry: Skill discovery, fingerprinting, and JSON cache management used at SessionStart | sources: scripts/lib/skill-registry.js, .ospec/cache/
- install: Per-target installation commands (Claude marketplace, opencode, github-copilot) that build and sync the generated tree into a destination repo | sources: scripts/configure/install-claude.js, scripts/configure/install-target.js
- sdd-document: Executor agent responsible for generating project technical wikis following cognitive documentation design | sources: skills/sdd-document/SKILL.md, agents/sdd-document.agent.md, commands/sdd-document.prompt.md, scripts/sdd-document.test.js

## Entries (append-only log; latest row per domain wins)
| domain | status | batch | commit | timestamp (UTC) |
|---|---|---|---|---|
| generator | done | 1 | 59fbfe8 | 2026-06-14T12:00:00Z |
| routing | done | 2 | 59fbfe8 | 2026-06-14T14:00:00Z |
| hooks | done | 3 | 59fbfe8 | 2026-06-14T15:00:00Z |
| skills | done | 4 | 59fbfe8 | 2026-06-14T16:00:00Z |
| agents | done | 5 | 59fbfe8 | 2026-06-14T17:00:00Z |
| skill-registry | done | 6 | 59fbfe8 | 2026-06-14T18:00:00Z |
| install | done | 7 | 59fbfe8 | 2026-06-14T19:00:00Z |
| agents | reconciled | - | 5beb80c | 2026-07-03T18:41:30Z |
| skills | reconciled | - | 5beb80c | 2026-07-03T18:45:19Z |
| hooks | reconciled | - | 5beb80c | 2026-07-03T18:49:43Z |
| skills | reconciled | - | 5beb80c | 2026-07-03T18:53:55Z |
| agents | reconciled | - | 37413bd | 2026-07-04T00:00:00Z |
| sdd-document | done | 8 | 2573453 | 2026-07-05T07:30:00Z |
