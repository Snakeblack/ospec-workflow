# Delta for agents

## ADDED Requirements

### Requirement: sdd-document Orchestrator Allowlist, Command Index, and Pointer Table Wiring {#REQ-agents-005}

`agents/sdd-orchestrator.agent.md` MUST wire the `sdd-document` agent into its three
routing surfaces:

1. The frontmatter `agents:` allowlist MUST include `'sdd-document'`.
2. The CORE body's command index (Section listing `/sdd-*` commands) MUST list
   `/sdd-document`.
3. The Circumstantial Handler Pointer Table (§15, agents spec) MUST gain one row —
   "Document Route Handler" — pointing to a `skills/_shared/route-document.md` file,
   triggered when `/sdd-document` is invoked (or route dispatch selects the
   `sdd-document` phase), read via the `read` tool exactly once per route.

Because `agents/sdd-orchestrator.agent.md` is size-guarded at under 500 lines (§15,
Orchestrator Body Partitioning), these three additions MUST be the ONLY inline
changes to the orchestrator body for this wiring — the full launch-gate, persistence,
relaunch, and post-run verification protocol MUST live entirely in
`skills/_shared/route-document.md`, which is subject to the same Shared Handler Trust
Boundary (instruction-only prose, no frontmatter/tool grants) and Cross-Target Parity
rules (§15) already normative for other `_shared/` handler files.

#### Scenario: Allowlist includes sdd-document

- GIVEN `agents/sdd-orchestrator.agent.md` frontmatter is parsed
- WHEN the `agents:` array is inspected
- THEN it MUST contain `sdd-document`

#### Scenario: /sdd-document dispatch resolves the handler via the pointer table

- GIVEN the user invokes `/sdd-document`
- WHEN the orchestrator resolves how to route the command
- THEN it reads `skills/_shared/route-document.md` exactly once for this route, using
  the CORE pointer table as the sole resolution path
- AND it does not re-read the handler on later gate boundaries within the same route

#### Scenario: Orchestrator body stays under the 500-line guard after wiring

- GIVEN the orchestrator body was 491 lines before this change
- WHEN the allowlist entry, command-index row, and pointer-table row are added inline
- THEN the resulting body MUST remain under 500 lines
- AND no protocol prose beyond these three rows is added inline to the orchestrator
  body

---

### Requirement: Orchestrator-Owned Post-Run Sandbox Inventory Verification for sdd-document {#REQ-agents-006}

After the `sdd-document` agent returns `status: success` (following any number of
`blocked`/resume cycles), the orchestrator MUST perform an independent post-run
sandbox inventory check before considering the `/sdd-document` route complete. The
check MUST be scoped directly to the approved output directory plus the two declared
exceptions (`/AGENTS.md`, `/CLAUDE.md`) so that pre-existing unrelated untracked paths
elsewhere in the working tree (e.g. an untracked directory that predates this run)
MUST NOT trigger a false positive.

The orchestrator MUST determine the approved output directory itself —
authoritatively, not by trusting the executor's self-report — from the
`scope_choice`/`custom_path` values it resolved at launch time: Option A resolves to
`openwiki/`, Option B resolves to `docs/wiki/`, and Option C resolves to the same
`custom_path` string the orchestrator passed to the executor. Before delegating, if
the resolved Option C `custom_path` would resolve outside the repository working
tree, the orchestrator MUST reject it at the gate and prompt the user for a path
inside the repository, so that the post-run `git status` scoping described below
always covers a path `git` can see.

The executor's own completion report MUST NOT be treated as sufficient evidence of
sandbox compliance; the orchestrator's check is independent and authoritative. This
requirement generalizes the "declared cross-file contract, no verification" defect
class already fixed once in this codebase — the executor declares its own write
sandbox (sdd-document domain spec), but verification is a separate, orchestrator-
owned step.

If the scoped `git status` reveals a changed or untracked path that is neither under
the approved output directory nor one of the two declared exceptions, the orchestrator
MUST halt and surface a `question_gate` describing the unexpected path before closing
the route. The gate MUST offer exactly two options: "Abort the route and leave the
offending files for manual review" (the default/recommended option) and "Acknowledge
and close the route anyway (accepted risk)". The orchestrator MUST NOT close the
route without an explicit user choice between these two options.

#### Scenario: Clean run — scoped check passes silently

- GIVEN `sdd-document` returns `status: success` with output directory `openwiki/`
- WHEN the orchestrator runs the scoped post-run inventory check
- THEN all changed/untracked paths reported are under `openwiki/`, `/AGENTS.md`, or
  `/CLAUDE.md`
- AND the route closes without any additional user interaction

#### Scenario: Pre-existing unrelated untracked path does not false-positive

- GIVEN an untracked directory unrelated to this run already existed in the working
  tree before `sdd-document` was dispatched
- AND that directory is outside the approved output directory
- WHEN the orchestrator scopes the `git status` query to the approved output
  directory plus the two declared exceptions
- THEN the pre-existing unrelated directory MUST NOT appear in the scoped result and
  MUST NOT trigger a halt

#### Scenario: Out-of-sandbox write detected — orchestrator halts

- GIVEN the scoped post-run check reports a changed file outside the approved output
  directory and outside the two declared exceptions
- WHEN the orchestrator evaluates the result
- THEN it MUST halt and present a `question_gate` describing the unexpected path
  before closing the route
- AND the gate MUST offer exactly the two options "Abort the route and leave the
  offending files for manual review" (default) and "Acknowledge and close the route
  anyway (accepted risk)"
- AND the executor's own prior success report MUST NOT override this halt

---

### Requirement: Commands↔Agents Static Contract Test {#REQ-agents-007}

A static test file under `scripts/` MUST assert, for every `commands/*.prompt.md`
file, that each sub-agent the command routes to (per the command roster mapping
documented in Section 3.2) exists within the `agents:` allowlist of the router agent
declared in that command's `agent:` frontmatter field (Section 3.1). The test MUST be
static — it MUST NOT invoke an LLM or any sub-agent — and MUST run as part of the
existing `npm test` suite.

The test's source of truth for the command→sub-agent mapping MUST be the `Routes to`
column of the Section 3.2 Command Roster table in `openspec/specs/agents/spec.md`:
for each row, the test parses the substring after `→` (when present) as the target
sub-agent name to verify against the router's `agents:` allowlist. Rows with no `→`
(routing only to `sdd-orchestrator` itself, with no phase-agent target) declare no
sub-agent to verify and MUST be skipped.

This test generalizes the J1 defect class (a command/prompt file declares a routing
target that is absent from its router's `agents:` allowlist, making the target
unreachable) so future additions of this shape are caught mechanically rather than
discovered manually.

#### Scenario: Referenced agent present in router allowlist — test passes

- GIVEN `commands/sdd-document.prompt.md` routes to `sdd-document`
- AND `agents/sdd-orchestrator.agent.md` frontmatter `agents:` includes `sdd-document`
- WHEN the contract test runs
- THEN it passes for this command/agent pair

#### Scenario: Referenced agent missing from router allowlist — test fails

- GIVEN a command/prompt file routes to an agent name
- AND that agent name is absent from its router's `agents:` allowlist
- WHEN the contract test runs
- THEN it MUST fail, naming the offending command file and the missing agent

#### Scenario: Test runs as part of the standard suite

- GIVEN a contributor runs `npm test`
- WHEN the test suite executes
- THEN the commands↔agents contract test runs alongside existing `scripts/**/*.test.js`
  files with no separate invocation required

## Clarifications

### Session 2026-07-05

- Q: The commands↔agents contract test (REQ-agents-007) needs a source of truth for which sub-agent each command routes to. Frontmatter `agent:` is always `sdd-orchestrator`, so the actual routing target must be looked up elsewhere. Which source should the static test parse? → A: Parse the Section 3.2 "Command Roster" markdown table in openspec/specs/agents/spec.md (extract the "Routes to" column, e.g. "sdd-orchestrator → sdd-document").
- Q: For J5's post-run inventory check, the orchestrator needs an authoritative output directory path — including for Option C custom paths, which may resolve outside the repository working tree (git status cannot see writes there). How should route-document.md determine and scope this? → A: Orchestrator independently resolves the output dir itself from the scope_choice/custom_path it already passed at launch (A→openwiki/, B→docs/wiki/, C→the same custom_path string), and treats any custom path that resolves outside the repository root as a hard validation failure at gate time (reject before delegating).
- Q: When J5 detects a changed/untracked path outside the approved output dir and the two exceptions, REQ-agents-006 says the orchestrator halts and shows a question_gate — but doesn't say what choices the user is given. What should the gate offer? → A: Two options: 'Abort the route and leave the offending files for manual review' (recommended/default) vs 'Acknowledge and close the route anyway (mark as accepted risk)'.
