# Delta for unified-baseline-gate

## MODIFIED Requirements

### Requirement: Gate Approval Recording

When the user approves the unified gate, the orchestrator MUST record the approval
atomically in `openspec/changes/{change-name}/federation-baseline-status.yaml`:

```yaml
unified_gate:
  status: approved
  approved_at: <ISO 8601 UTC>
  approver: orchestrator/askQuestions
```

The `approver` field MUST be set to the target-agnostic value
`orchestrator/askQuestions`. The recorded value MUST NOT contain any per-target
namespace prefix; specifically, it MUST NOT contain the substrings `vscode/`,
`copilot/`, `opencode/`, or `claude/`.

The write MUST use the temp+rename pattern (see `explore-transactional-barrier`
spec). The gate record is the canonical evidence of approval. Conversation
history alone MUST NOT be treated as approval evidence for any downstream phase
or re-launch.

(Previously: `approver` was normatively pinned to `vscode/askQuestions`, a
per-target namespace prefix rejected by the per-target validators for
`github-copilot` and `opencode` (`/vscode\//i` residue check), causing
`npm run build:copilot` and `npm run build:opencode` to exit 1 after
`federation-baseline-orchestrator.js` was added to `SKILL_ENTRY_SCRIPTS`.)

#### Scenario: Approval written to state file atomically

- GIVEN the user has approved the unified domain-map gate
- WHEN the orchestrator records the approval
- THEN `unified_gate.status` is set to `approved`, `approved_at` is set to the
  current UTC timestamp, and `approver` is set to `orchestrator/askQuestions`
- AND the write is atomic (temp+rename)
- AND subsequent reads of the state file confirm `status: approved`

#### Scenario: Approver value is target-agnostic across all build targets

- GIVEN a unified gate approval being recorded for any of the four build targets
  (`claude`, `vscode`, `github-copilot`, `opencode`)
- WHEN the orchestrator writes the approval record to
  `federation-baseline-status.yaml`
- THEN `unified_gate.approver` MUST equal exactly `orchestrator/askQuestions`
- AND the value MUST NOT contain any of the substrings `vscode/`, `copilot/`,
  `opencode/`, or `claude/`

#### Scenario: Approval record missing — gate must be re-presented

- GIVEN the orchestrator is relaunched
  AND `federation-baseline-status.yaml` is absent OR `unified_gate.status` is
  absent or `pending`
- WHEN the orchestrator evaluates whether to skip the gate
- THEN the gate IS presented again (no skip without an explicit `approved` record)
- AND a new approval is recorded after the user responds

#### Scenario: Partial state file (gate field absent) — gate re-presented

- GIVEN `federation-baseline-status.yaml` exists with `members` entries
  but no `unified_gate` key
- WHEN the orchestrator reads the state file
- THEN it treats the gate as `pending`
- AND presents the gate before any member delegation
