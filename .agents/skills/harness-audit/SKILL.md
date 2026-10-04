---
name: harness-audit
description: "Inspect, debug, optimize or harden the ospec-workflow harness from this repository. Trigger: auditing the plugin manifests, generated targets, agent boundaries, hooks, skills or context cost."
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "2.0"
---

# Harness Audit

Local skill for developing ospec-workflow itself; it is not shipped to consumers. Use it when asked to inspect, debug, optimize or harden the harness.

## Audit Checklist

1. **Manifests**: `package.json`, `.plugin.json`, `.claude-plugin/plugin.json` and `openspec/config.yaml` share one version (`scripts/manifest-sync.test.js`), and their agent, command, skill, rule and hook paths resolve.
2. **Generated targets**: build each of the 7 targets with `node scripts/configure/cli.js --target <target> --out <tmp>` and run its `validate-<target>` script. Assert generated output in a temp dir, never in `dist/`.
3. **Agent boundaries**: the orchestrator coordinates and delegates; phase agents execute, never delegate recursively and never ask the user directly; each work agent carries its skill under `## Embedded references`.
4. **Skill registry**: `.ospec/cache/skill-registry.cache.json` is fresh, `compact_rules` come only from rules sections, and every knowledge skill declares `Trigger:` (`scripts/lib/skill-registry.test.js`).
5. **Context cost**: `node scripts/measure-context-baseline.js` stays under the ceilings in `scripts/fixtures/context-baseline.json`; any reduction lowers them with `--update`.
6. **Rule scope**: always-on rules are only the `**` ones; `agents/**` rules are embedded in the orchestrator and path rules use each host's native scope.
7. **Hooks**: `hooks/hooks.json` wires `SessionStart` (registry refresh), `PreToolUse` (dangerous commands, token advisor), `PreCompact` (session summary), `SubagentStop` (skill resolution) and `Stop`, with JS and Go parity (`scripts/hooks/parity-contract.test.js`).
8. **Gates**: blocking decisions go through the host's question tool and are persisted in `state.yaml`.

## Output Contract

Return findings ordered by severity with file paths and the command that proves each one; separate confirmed defects from suspicions.
