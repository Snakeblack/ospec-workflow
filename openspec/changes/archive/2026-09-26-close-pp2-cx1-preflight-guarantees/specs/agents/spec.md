# Delta for agents

## ADDED Requirements

### Requirement: Orchestrator Pre-Delegation Validate-Phase Uses Plugin Install Path {#REQ-agents-030}

Before the orchestrator delegates any route phase to a subagent, it MUST invoke `validate-phase` using the real plugin install path for the script (not a project-relative `scripts/validate-phase.js` path that assumes the consumer project contains the plugin tree). The invocation MUST pass an explicit `--workspace` (or equivalent) argument naming the consumer project workspace root so project OpenSpec state resolves from that workspace independently of the plugin install location.

A relative command of the form `node scripts/validate-phase.js …` that depends on the process cwd being the plugin tree, or that omits an explicit project workspace argument, MUST NOT satisfy this requirement for globally installed layouts.

#### Scenario: Pre-delegation invokes validate-phase via plugin install path with --workspace

- GIVEN the orchestrator is about to delegate phase `PHASE_NAME` for an active change under a selected route
- AND the plugin is installed so its install root differs from the consumer project workspace
- WHEN the orchestrator runs the pre-delegation validation command
- THEN the command MUST invoke `validate-phase` from the real plugin install path
- AND MUST pass an explicit `--workspace` (or equivalent) naming the consumer project workspace
- AND MUST NOT rely solely on a project-relative `scripts/validate-phase.js` path

#### Scenario: Relative project-local command is insufficient for global install

- GIVEN a globally installed plugin layout where the consumer project does not contain the `validate-phase` script
- WHEN the orchestrator would otherwise run `node scripts/validate-phase.js …` relative to the project cwd without an explicit plugin path and `--workspace`
- THEN that command MUST NOT be accepted as compliant pre-delegation validation
- AND compliant invocation MUST use the plugin install path plus explicit project workspace

#### Scenario: Failed validate-phase still blocks delegation

- GIVEN the compliant pre-delegation `validate-phase` command exits non-zero or reports a transition error
- WHEN the orchestrator evaluates whether to launch the phase subagent
- THEN it MUST halt and MUST NOT dispatch the subagent
