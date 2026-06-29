# Delta for agents

## ADDED Requirements

### Requirement: Orchestrator Branch-Before-Code Recommendation

The `sdd-orchestrator` agent body MUST include a branch-before-code recommendation that is surfaced to the user when the orchestrator is about to dispatch `sdd-apply` as part of any route that includes that phase.

The recommendation MUST:
- State that a feature branch SHOULD be created (or confirmed active) before code modifications begin.
- Reference the `branch-pr` skill for naming conventions and PR workflow.
- Be advisory only (SHOULD, not MUST); the orchestrator MUST NOT block or gate the `sdd-apply` dispatch on branch confirmation.

Because the orchestrator body is divided into CORE and on-demand handlers (§15, agents spec), this recommendation MUST reside in the CORE zone — it applies to all routes that include `sdd-apply` and MUST NOT be placed in a circumstantial handler.

#### Scenario: Route reaches sdd-apply — recommendation surfaced

- GIVEN the orchestrator is executing any route that includes `sdd-apply`
- WHEN the orchestrator prepares to dispatch the `sdd-apply` phase
- THEN it MUST surface a branch recommendation to the user before or alongside the dispatch instruction
- AND the recommendation MUST reference `branch-pr` skill conventions

#### Scenario: Recommendation is advisory — route does not block

- GIVEN the orchestrator has surfaced the branch recommendation
- AND the user has not explicitly confirmed branch creation
- WHEN the orchestrator decides whether to proceed
- THEN it MUST dispatch `sdd-apply` without requiring branch confirmation
- AND the recommendation MUST NOT be treated as a gate or approval-ledger entry

#### Scenario: Recommendation propagates across all four targets

- GIVEN the orchestrator source file is regenerated via `scripts/configure`
- WHEN the build produces `dist/` outputs for claude, vscode, github-copilot, and opencode targets
- THEN the branch-before-code recommendation text MUST appear in the generated orchestrator for all four targets

---

### Requirement: sdd-propose Branch Advisory in Output

The `sdd-propose` phase agent MUST append a branch-before-code advisory note to its return envelope whenever it completes successfully. The note MUST appear in the `executive_summary` field or as a distinct line in the proposal artifact (`proposal.md`).

The advisory MUST state that a feature branch SHOULD be created before the `sdd-apply` phase begins, and MUST reference the `branch-pr` skill.

#### Scenario: Proposal returned — branch advisory present

- GIVEN `sdd-propose` completes and returns `status: success`
- WHEN the orchestrator receives the envelope
- THEN the `executive_summary` or `proposal.md` MUST contain a note recommending branch creation before implementation
- AND the note MUST mention the `branch-pr` skill or `<type>/<description>` convention

#### Scenario: Blocked proposal — advisory omitted

- GIVEN `sdd-propose` returns `status: blocked`
- WHEN the orchestrator receives the envelope
- THEN no branch advisory is required in a blocked envelope (it is not yet near the apply phase)

---

### Requirement: sdd-apply Branch-Status Note

The `sdd-apply` phase agent MUST emit a non-blocking branch-status note at the start of its execution. The note MUST appear in the `executive_summary` of its return envelope.

The note MUST be informational only. `sdd-apply` MUST NOT return `status: blocked` solely because branch status is unknown or because the user has not confirmed branch creation.

#### Scenario: sdd-apply starts — branch note in summary

- GIVEN `sdd-apply` receives a task batch and begins execution
- WHEN it returns its result envelope
- THEN `executive_summary` MUST include a brief branch-status note (e.g., "Working on branch `<name>`" or "Branch status unknown — ensure a feature branch is active before merging")

#### Scenario: Branch unknown — no blocking

- GIVEN `sdd-apply` cannot determine the current branch from context
- WHEN it evaluates whether to proceed
- THEN it MUST proceed with task execution
- AND `status` MUST NOT be `blocked` for this reason alone
