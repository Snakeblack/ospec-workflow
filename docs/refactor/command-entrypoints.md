# Command Entrypoints

Updated: 2026-06-02

## Decision

This plugin now bundles a root `commands/` directory and references it from `.plugin/plugin.json` with the official Agent Plugin `commands` field.

The command files are thin user-facing wrappers for discoverability and invocation ergonomics only. They do not replace custom agents, do not expose phase agents as direct user entrypoints, and do not duplicate SDD phase protocol or skill bodies.

## Created Commands

| Command | File | Purpose |
| --- | --- | --- |
| `sdd-new` | `commands/sdd-new.md` | Start a new persisted SDD change through `sdd-orchestrator`. |
| `sdd-lite` | `commands/sdd-lite.md` | Ask `sdd-orchestrator` to classify and run lite mode only for trivial or small work. |
| `sdd-continue` | `commands/sdd-continue.md` | Continue from filesystem OpenSpec state through `sdd-orchestrator`. |
| `sdd-apply` | `commands/sdd-apply.md` | Run or continue apply through `sdd-orchestrator`, including workload guard handling. |
| `sdd-verify` | `commands/sdd-verify.md` | Run verify through `sdd-orchestrator`. |
| `sdd-archive` | `commands/sdd-archive.md` | Archive only after successful verify through `sdd-orchestrator`. |

## Routing Model

Each command file declares `agent: sdd-orchestrator` in minimal frontmatter and repeats the routing requirement in the body. If a host ignores command-file frontmatter, the body still explicitly instructs the user or host to run the request through `sdd-orchestrator`.

Phase agents remain hidden implementation details. The command files tell the orchestrator what the user wants; the orchestrator still owns init checks, classification, phase ordering, workload decisions, and subagent delegation.

## Location Notes

The plugin runtime location is `commands/`, referenced by `.plugin/plugin.json`. This task intentionally does not use `.github/prompts` as a plugin runtime location. A future workspace-only mirror could be documented separately, but it is not required for plugin delivery.