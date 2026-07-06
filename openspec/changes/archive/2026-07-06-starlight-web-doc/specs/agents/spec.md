# Delta for agents

## MODIFIED Requirements

### Requirement: Orchestrator-Owned Post-Run Sandbox Inventory Verification for sdd-document {#REQ-agents-006}

After the `sdd-document` agent returns `status: success` (following any number of
`blocked`/resume cycles), the orchestrator MUST perform an independent post-run
sandbox inventory check before considering the `/sdd-document` route complete. The
check MUST be scoped directly to the approved output directory (or, for scope D, the
SET of both approved output directories) plus the two declared exceptions
(`/AGENTS.md`, `/CLAUDE.md`) so that pre-existing unrelated untracked paths
elsewhere in the working tree (e.g. an untracked directory that predates this run)
MUST NOT trigger a false positive.

The orchestrator MUST determine the approved output directory (or directories) itself —
authoritatively, not by trusting the executor's self-report — from the
`scope_choice`/`custom_path` values it resolved at launch time: Option A resolves to
`openwiki/`, Option B resolves to `docs/wiki/`, Option C resolves to the same
`custom_path` string the orchestrator passed to the executor, and Option D resolves to
the SET `{openwiki/, web-doc/}` — both directories MUST be included in the scoped
check, not just one. Before delegating, if the resolved Option C `custom_path` would
resolve outside the repository working tree, the orchestrator MUST reject it at the
gate and prompt the user for a path inside the repository, so that the post-run `git
status` scoping described below always covers a path (or set of paths) `git` can see.

The executor's own completion report MUST NOT be treated as sufficient evidence of
sandbox compliance; the orchestrator's check is independent and authoritative. This
requirement generalizes the "declared cross-file contract, no verification" defect
class already fixed once in this codebase — the executor declares its own write
sandbox (sdd-document domain spec), but verification is a separate, orchestrator-
owned step.

If the scoped `git status` reveals a changed or untracked path that is neither under
any of the approved output directory/directories nor one of the two declared
exceptions, the orchestrator MUST halt and surface a `question_gate` describing the
unexpected path before closing the route. The gate MUST offer exactly two options:
"Abort the route and leave the offending files for manual review" (the default/
recommended option) and "Acknowledge and close the route anyway (accepted risk)". The
orchestrator MUST NOT close the route without an explicit user choice between these two
options.

(Previously: the check was scoped to a single approved output directory only, with no
provision for a scope selection — Option D — that resolves to more than one approved
directory.)

#### Scenario: Clean run — scoped check passes silently

- GIVEN `sdd-document` returns `status: success` with output directory `openwiki/`
- WHEN the orchestrator runs the scoped post-run inventory check
- THEN all changed/untracked paths reported are under `openwiki/`, `/AGENTS.md`, or
  `/CLAUDE.md`
- AND the route closes without any additional user interaction

#### Scenario: Pre-existing unrelated untracked path does not false-positive

- GIVEN an untracked directory unrelated to this run already existed in the working
  tree before `sdd-document` was dispatched
- AND that directory is outside the approved output directory/directories
- WHEN the orchestrator scopes the `git status` query to the approved output
  directory/directories plus the two declared exceptions
- THEN the pre-existing unrelated directory MUST NOT appear in the scoped result and
  MUST NOT trigger a halt

#### Scenario: Out-of-sandbox write detected — orchestrator halts

- GIVEN the scoped post-run check reports a changed file outside the approved output
  directory/directories and outside the two declared exceptions
- WHEN the orchestrator evaluates the result
- THEN it MUST halt and present a `question_gate` describing the unexpected path
  before closing the route
- AND the gate MUST offer exactly the two options "Abort the route and leave the
  offending files for manual review" (default) and "Acknowledge and close the route
  anyway (accepted risk)"
- AND the executor's own prior success report MUST NOT override this halt

#### Scenario: Scope D — check covers both approved directories

- GIVEN `sdd-document` returns `status: success` with resolved scope `D`
- WHEN the orchestrator runs the scoped post-run inventory check
- THEN it scopes `git status` to BOTH `openwiki/` AND `web-doc/`, plus the two
  declared exceptions
- AND a changed/untracked path under either `openwiki/` or `web-doc/` is treated as
  inside the sandbox
- AND a changed/untracked path outside both directories (and outside the two
  exceptions) still triggers the halt and `question_gate`
