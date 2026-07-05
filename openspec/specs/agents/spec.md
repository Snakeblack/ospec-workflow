# Spec: agents

## Overview

The `agents/` directory contains the executable agent definition files for all SDD workflow participants. Each file is a `*.agent.md` document whose YAML frontmatter declares the agent contract and whose Markdown body provides behavioral instructions loaded at invocation time. The `commands/` directory contains companion slash-command prompt files (`*.prompt.md`) that route user-typed commands to the orchestrator.

All agent files are source artifacts for the generator. The generator transforms them into target-native layouts (claude, vscode, github-copilot, opencode) as documented in the `generator` domain spec.

---

## 1. Agent Catalog

The catalog contains 19 agent definitions in three structural roles.

### 1.1 Orchestrator

| File | Name | `user-invocable` |
|------|------|-----------------|
| `agents/sdd-orchestrator.agent.md` | `sdd-orchestrator` | `true` |

The orchestrator is the single COORDINATOR in the system. It does not execute SDD phase work directly; it delegates ALL real work to phase sub-agents and synthesizes results. It is the only agent that holds the `agent` tool grant (enabling sub-agent delegation). See Section 4 for the executor-vs-coordinator boundary.

On the **claude** target the orchestrator is emitted as a SKILL (`skills/sdd-orchestrator/SKILL.md`) rather than a sub-agent, because the claude runtime exposes it through the rules/skill mechanism. On all other targets it is a normal agent file.

### 1.2 SDD Phase Executors

All files below have `user-invocable: false` and `tools: ['read', 'search', 'edit', 'execute']`.

| File | Phase purpose |
|------|--------------|
| `agents/sdd-init.agent.md` | Initialize OpenSpec context, detect stack, bootstrap persistence |
| `agents/sdd-foundation.agent.md` | Guide new-project discovery, foundation docs, config completion |
| `agents/sdd-baseline.agent.md` | Seed baseline specs for brownfield repos, one domain per batch |
| `agents/sdd-workspace.agent.md` | Federated multi-repo workspace operations |
| `agents/sdd-explore.agent.md` | Codebase investigation; reads only, no spec files created |
| `agents/sdd-onboard.agent.md` | Guided end-to-end SDD walkthrough using the real codebase |
| `agents/sdd-propose.agent.md` | Produce proposal or proposal-lite artifact |
| `agents/sdd-spec.agent.md` | Translate proposal into domain spec(s) |
| `agents/sdd-clarify.agent.md` | Resolve residual ambiguities between spec and design |
| `agents/sdd-design.agent.md` | Produce design artifact from proposal + specs |
| `agents/sdd-tasks.agent.md` | Break design into implementable tasks with review-workload forecast |
| `agents/sdd-apply.agent.md` | Implement assigned tasks in resumable batches |
| `agents/sdd-verify.agent.md` | Validate implementation against specs; reports findings |
| `agents/sdd-archive.agent.md` | Close a change and persist final state |
| `agents/sdd-document.agent.md` | Generate repository wiki pages mapping architecture, specs, and status |

### 1.3 4R Reviewers

All four files have `user-invocable: false` and `tools: ['read', 'search']` (read-only).

| File | Reviewer purpose |
|------|----------------|
| `agents/review-risk.agent.md` | Security and risk: privilege scope, PII exposure, injection, auth bypass |
| `agents/review-readability.agent.md` | Readability: ambiguous names, deep nesting, unexplained decisions |
| `agents/review-reliability.agent.md` | Reliability: missing error-path tests, non-determinism, absent validation |
| `agents/review-resilience.agent.md` | Resilience: missing I/O error handling, incomplete recovery, swallowed exceptions |

### 1.4 Specific Agent Requirements: Branch-Before-Code Recommendations

#### Orchestrator Branch-Before-Code Recommendation

The `sdd-orchestrator` agent body MUST include a branch-before-code recommendation that is surfaced to the user when the orchestrator is about to dispatch `sdd-apply` as part of any route that includes that phase.

The recommendation MUST:
- State that a feature branch SHOULD be created (or confirmed active) before code modifications begin.
- Reference the `branch-pr` skill for naming conventions and PR workflow.
- Be advisory only (SHOULD, not MUST); the orchestrator MUST NOT block or gate the `sdd-apply` dispatch on branch confirmation.

Because the orchestrator body is divided into CORE and on-demand handlers (§15, agents spec), this recommendation MUST reside in the CORE zone — it applies to all routes that include `sdd-apply` and MUST NOT be placed in a circumstantial handler.

##### Scenario: Route reaches sdd-apply — recommendation surfaced

- GIVEN the orchestrator is executing any route that includes `sdd-apply`
- WHEN the orchestrator prepares to dispatch the `sdd-apply` phase
- THEN it MUST surface a branch recommendation to the user before or alongside the dispatch instruction
- AND the recommendation MUST reference `branch-pr` skill conventions

##### Scenario: Recommendation is advisory — route does not block

- GIVEN the orchestrator has surfaced the branch recommendation
- AND the user has not explicitly confirmed branch creation
- WHEN the orchestrator decides whether to proceed
- THEN it MUST dispatch `sdd-apply` without requiring branch confirmation
- AND the recommendation MUST NOT be treated as a gate or approval-ledger entry

##### Scenario: Recommendation propagates across all four targets

- GIVEN the orchestrator source file is regenerated via `scripts/configure`
- WHEN the build produces `dist/` outputs for claude, vscode, github-copilot, and opencode targets
- THEN the branch-before-code recommendation text MUST appear in the generated orchestrator for all four targets

#### sdd-propose Branch Advisory in Output

The `sdd-propose` phase agent MUST append a branch-before-code advisory note to its return envelope whenever it completes successfully. The note MUST appear in the `executive_summary` field or as a distinct line in the proposal artifact (`proposal.md`).

The advisory MUST state that a feature branch SHOULD be created before the `sdd-apply` phase begins, and MUST reference the `branch-pr` skill.

##### Scenario: Proposal returned — branch advisory present

- GIVEN `sdd-propose` completes and returns `status: success`
- WHEN the orchestrator receives the envelope
- THEN the `executive_summary` or `proposal.md` MUST contain a note recommending branch creation before implementation
- AND the note MUST mention the `branch-pr` skill or `<type>/<description>` convention

##### Scenario: Blocked proposal — advisory omitted

- GIVEN `sdd-propose` returns `status: blocked`
- WHEN the orchestrator receives the envelope
- THEN no branch advisory is required in a blocked envelope (it is not yet near the apply phase)

#### sdd-apply Branch-Status Note

The `sdd-apply` phase agent MUST emit a non-blocking branch-status note at the start of its execution. The note MUST appear in the `executive_summary` of its return envelope.

The note MUST be informational only. `sdd-apply` MUST NOT return `status: blocked` solely because branch status is unknown or because the user has not confirmed branch creation.

##### Scenario: sdd-apply starts — branch note in summary

- GIVEN `sdd-apply` receives a task batch and begins execution
- WHEN it returns its result envelope
- THEN `executive_summary` MUST include a brief branch-status note (e.g., "Working on branch `<name>`" or "Branch status unknown — ensure a feature branch is active before merging")

##### Scenario: Branch unknown — no blocking

- GIVEN `sdd-apply` cannot determine the current branch from context
- WHEN it evaluates whether to proceed
- THEN it MUST proceed with task execution
- AND `status` MUST NOT be `blocked` for this reason alone

#### Orchestrator Ambient SDD Awareness Active-Question Gate

Independent of whether the user's request mentions "SDD" or invokes any `/sdd-*` command, the orchestrator MUST evaluate — before performing any inline or delegated work on a user task — whether the task's target files overlap (a) an active OpenSpec change's declared file scope, or (b) a specced baseline domain's source globs (per `baseline.domains_done` and the manifest Domain Map, surfaced via session-start context including the `specDrift` and `capabilities` fields).

When such an overlap exists AND the task is non-trivial, the orchestrator MUST call `vscode/askQuestions` (or the target-specific equivalent of `AskUserQuestion`), offering to route the task through the SDD workflow, BEFORE proceeding with any part of the task.

A task MUST be classified as non-trivial when EITHER of the following holds:
- (a) the task touches **2 or more files**, OR
- (b) the task introduces **new logic or architecture** — a new function, a new module, or a change in behavior — regardless of how many files it touches.

A task MUST NOT be classified as non-trivial, and the gate MUST NOT fire, when it is a **single-file cosmetic change**: a typo fix, a comment-only edit, a rename, a formatting-only change, or a one-line fix that does not change behavior.

Because condition (a) and condition (b) are joined by OR, a task satisfying either one independently is sufficient to classify it as non-trivial — the two conditions are not both required, and neither condition overrides the other's ability to trigger the gate on its own.

This rule resides in the orchestrator's CORE zone (see §15, Orchestrator Body Partitioning), alongside the SDD Init Guard — it is an always-on check, not a circumstantial handler gated by route or config, and MUST NOT be relocated to a `skills/_shared/` on-demand handler.

If the user declines to route through SDD, the orchestrator MUST proceed with the task directly and MUST NOT create any OpenSpec artifacts as a side effect of having asked.

##### Scenario: Non-trivial task overlapping an active change's scope — gate fires without "SDD" being mentioned

- GIVEN an active OpenSpec change declares `scripts/hooks/pre-tool-use.js` in its scope
- AND the user asks "fix the bug in pre-tool-use.js" with no mention of SDD or any `/sdd-*` command
- AND the task touches 2 or more files (condition a)
- WHEN the orchestrator evaluates the request
- THEN it MUST call `vscode/askQuestions` offering to route the task through the SDD workflow BEFORE performing any inline or delegated work

##### Scenario: Non-trivial task overlapping a specced baseline domain — gate fires

- GIVEN no active change exists
- AND the task's target files match the `agents` baseline domain's source globs
- AND the task touches 2 or more files (condition a)
- WHEN the orchestrator evaluates the request
- THEN it MUST call `vscode/askQuestions` before proceeding

##### Scenario: Single-file change introducing new logic or a behavior change — gate fires (file count alone is not the trigger)

- GIVEN the task's target file overlaps an active change's declared scope or a specced baseline domain
- AND the task touches only 1 file
- AND the task introduces a new function, a new module, or a change in behavior (condition b)
- WHEN the orchestrator evaluates the request
- THEN it MUST call `vscode/askQuestions` before proceeding
- AND this MUST hold even though condition (a) — the ≥2-files threshold — is not met, because (a) and (b) are independent OR-joined triggers

##### Scenario: Single-file cosmetic change — gate does not fire even when it overlaps an active change's scope

- GIVEN the task's target file overlaps an active change's declared scope or a specced baseline domain
- AND the task touches only 1 file
- AND the task is a typo fix, a comment-only edit, a rename, a formatting-only change, or a one-line fix that does not change behavior
- WHEN the orchestrator evaluates the request
- THEN it MUST NOT call `vscode/askQuestions` for this rule and proceeds directly, regardless of the overlap

##### Scenario: Trivial task — gate does not fire

- GIVEN the task's target files overlap a specced domain or an active change's scope
- AND the task touches only 1 file
- AND the task is a single-file cosmetic change (neither condition a nor condition b is met)
- WHEN the orchestrator evaluates the request
- THEN it MUST NOT call `vscode/askQuestions` for this rule and proceeds directly

##### Scenario: Multi-file cosmetic-only change — gate fires under the accepted OR condition (accepted trade-off, see Clarifications)

- GIVEN the task's target files overlap an active change's declared scope or a specced baseline domain
- AND the task is a repo-wide rename touching 5 files, with no behavior change in any of them (purely cosmetic across all 5 files)
- WHEN the orchestrator evaluates the request
- THEN it MUST call `vscode/askQuestions` before proceeding, because condition (a) — touching ≥2 files — is satisfied on its own regardless of the cosmetic nature of the change
- AND this is an accepted trade-off, not an oversight: see `## Clarifications` below

##### Scenario: No overlap at all — gate does not fire

- GIVEN the task's target files match neither an active change's declared scope nor any specced baseline domain's source globs
- WHEN the orchestrator evaluates the request, regardless of triviality
- THEN it MUST NOT call `vscode/askQuestions` for this rule

##### Scenario: User declines — task proceeds without SDD artifacts

- GIVEN the gate fired and the user selects "proceed directly, no SDD"
- WHEN the orchestrator receives the answer
- THEN it MUST proceed with the task directly
- AND MUST NOT create any `openspec/` artifacts as a side effect of having asked

---

### 1.5 sdd-document Requirements

#### Requirement: sdd-document Catalog Registration {#REQ-agents-002}

The `sdd-document` agent MUST be registered in the SDD agent catalog. It is a utility executor agent configured with `user-invocable: false` and abstract tools `read`, `search`, `edit`, and `execute`.

##### Scenario: sdd-document present in catalog

- GIVEN the orchestrator loads the agent catalog from the `agents` spec
- WHEN the generator processes the catalog
- THEN it MUST find the `sdd-document` agent listed with the corresponding configuration

#### Requirement: sdd-document Command Roster Registration {#REQ-agents-003}

The `/sdd-document` slash command MUST be registered in the orchestrator command roster and mapped to the `sdd-orchestrator` agent, routing execution dynamically to the `sdd-document` agent.

##### Scenario: sdd-document command in roster

- GIVEN the orchestrator command parser loads command mappings
- WHEN it evaluates `/sdd-document`
- THEN it routes the command to the orchestrator which delegates to the `sdd-document` agent

#### Requirement: sdd-document Launch Gate Mapping {#REQ-agents-004}

The orchestrator MUST support launch-blocking logic when invoking the `sdd-document` agent, halting execution and prompting the user with a `question_gate` containing the documentation scope selection (Options A, B, and C).

##### Scenario: Launch gate blocks orchestrator dispatch

- GIVEN the orchestrator is dispatching the `sdd-document` agent
- WHEN the agent returns `status: blocked` with a `question_gate`
- THEN the orchestrator MUST present the questions to the user and await approved choices

---

#### Requirement: sdd-document Orchestrator Allowlist, Command Index, and Pointer Table Wiring {#REQ-agents-005}

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

##### Scenario: Allowlist includes sdd-document

- GIVEN `agents/sdd-orchestrator.agent.md` frontmatter is parsed
- WHEN the `agents:` array is inspected
- THEN it MUST contain `sdd-document`

##### Scenario: /sdd-document dispatch resolves the handler via the pointer table

- GIVEN the user invokes `/sdd-document`
- WHEN the orchestrator resolves how to route the command
- THEN it reads `skills/_shared/route-document.md` exactly once for this route, using
  the CORE pointer table as the sole resolution path
- AND it does not re-read the handler on later gate boundaries within the same route

##### Scenario: Orchestrator body stays under the 500-line guard after wiring

- GIVEN the orchestrator body was 491 lines before this change
- WHEN the allowlist entry, command-index row, and pointer-table row are added inline
- THEN the resulting body MUST remain under 500 lines
- AND no protocol prose beyond these three rows is added inline to the orchestrator
  body

---

#### Requirement: Orchestrator-Owned Post-Run Sandbox Inventory Verification for sdd-document {#REQ-agents-006}

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

##### Scenario: Clean run — scoped check passes silently

- GIVEN `sdd-document` returns `status: success` with output directory `openwiki/`
- WHEN the orchestrator runs the scoped post-run inventory check
- THEN all changed/untracked paths reported are under `openwiki/`, `/AGENTS.md`, or
  `/CLAUDE.md`
- AND the route closes without any additional user interaction

##### Scenario: Pre-existing unrelated untracked path does not false-positive

- GIVEN an untracked directory unrelated to this run already existed in the working
  tree before `sdd-document` was dispatched
- AND that directory is outside the approved output directory
- WHEN the orchestrator scopes the `git status` query to the approved output
  directory plus the two declared exceptions
- THEN the pre-existing unrelated directory MUST NOT appear in the scoped result and
  MUST NOT trigger a halt

##### Scenario: Out-of-sandbox write detected — orchestrator halts

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

#### Requirement: Commands↔Agents Static Contract Test {#REQ-agents-007}

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

##### Scenario: Referenced agent present in router allowlist — test passes

- GIVEN `commands/sdd-document.prompt.md` routes to `sdd-document`
- AND `agents/sdd-orchestrator.agent.md` frontmatter `agents:` includes `sdd-document`
- WHEN the contract test runs
- THEN it passes for this command/agent pair

##### Scenario: Referenced agent missing from router allowlist — test fails

- GIVEN a command/prompt file routes to an agent name
- AND that agent name is absent from its router's `agents:` allowlist
- WHEN the contract test runs
- THEN it MUST fail, naming the offending command file and the missing agent

##### Scenario: Test runs as part of the standard suite

- GIVEN a contributor runs `npm test`
- WHEN the test suite executes
- THEN the commands↔agents contract test runs alongside existing `scripts/**/*.test.js`
  files with no separate invocation required

---

### Requirement: Orchestrator-Owned Archive Move Completion {#REQ-agents-008}

After the `sdd-archive` executor returns `status: success`, the ORCHESTRATOR — never
the executor — decides, verifies, and performs completion of the archive-folder move.
Before deleting the source change directory `openspec/changes/{change-name}/`, the
orchestrator MUST recursively diff the destination folder's inventory
(`openspec/changes/archive/{YYYY-MM-DD}-{change-name}/`) against the source folder's
inventory, file-by-file (both path presence and content match, e.g. via hash or byte
comparison), using the copy-inventory list the executor reported in its return
envelope (see skills domain spec, `sdd-archive` Copy-and-Report Contract) as the
starting manifest to verify against the actual filesystem state.

Deletion of the source directory is a decision, an action, and a completion claim
reserved exclusively to the orchestrator. The `sdd-archive` executor MUST NOT decide
to delete the source, MUST NOT perform a delete, and MUST NOT self-certify that the
move is "complete" or that the source directory no longer exists — its responsibility
ends at baseline sync (Step 2), archive-report persistence (Step 3), and copying
artifacts to the destination path (Step 5, copy-only).

On a full inventory match, the orchestrator deletes the source directory — this is the
only filesystem step that makes the operation a true move. On any mismatch or copy
failure (missing destination file, content diff, partial copy), the orchestrator MUST
halt with the source directory left intact and surface the mismatch to the user; it
MUST NOT delete the source under a mismatch condition, and MUST NOT proceed to close
the archive route silently.

#### Scenario: Inventory match — orchestrator completes the move by deleting the source

- GIVEN `sdd-archive` returns `status: success` having copied all artifacts to
  `openspec/changes/archive/{YYYY-MM-DD}-{change-name}/`
- WHEN the orchestrator recursively diffs destination inventory against source
  inventory file-by-file
- AND every source file is present at the destination with matching content
- THEN the orchestrator deletes the source directory
  `openspec/changes/{change-name}/`
- AND only then does the orchestrator consider the archive route complete
- Evidence: agent-instruction prose; verified via a static contract-test anchor on the
  load-bearing "orchestrator deletes" / "verification-before-delete" strings, not a
  runtime execution trace.

#### Scenario: Inventory mismatch — halt with source intact, no deletion

- GIVEN `sdd-archive` returns `status: success` but the destination is missing one or
  more files present in the source (partial copy)
- WHEN the orchestrator performs the recursive inventory diff
- THEN it detects the mismatch and MUST NOT delete the source directory
- AND it halts and surfaces the mismatch to the user instead of closing the route
- AND the source directory remains fully intact for later recovery
- Evidence: agent-instruction prose; verified via a static contract-test anchor on the
  load-bearing "halt with source intact" / "mismatch or copy failure" strings, not a
  runtime execution trace.

#### Scenario: Executor never deletes or self-certifies completion

- GIVEN the `sdd-archive` skill instructions are inspected
- WHEN the Step 5 contract is read
- THEN it MUST state that the executor's responsibility ends at baseline sync,
  archive-report persistence, and copying artifacts
- AND it MUST NOT instruct the executor to delete the source directory or to declare
  the move "complete" while the source still exists
- Evidence: static contract-test anchor on the `sdd-archive` SKILL.md source text
  (agent-instruction prose; this scenario is about the instructions themselves, not a
  runtime trace of executor behavior).

---

### Requirement: Orchestrator-Computed Baseline Fingerprints {#REQ-agents-009}

Immediately after `sdd-spec` returns `status: success`, the orchestrator — never
`sdd-spec` itself — MUST compute and write `baseline_fingerprints` (the SHA-256 of each
touched baseline domain's current `openspec/specs/{domain}/spec.md`, or `null` when no
baseline exists yet) into `state.yaml`. The orchestrator sources the list of domains to
fingerprint from the `touched_baseline_domains` list `sdd-spec` declares in its return
envelope (see skills domain spec, Baseline Fingerprint Recording and Verification);
`sdd-spec` itself MUST NOT compute or write these hashes, since it has no execute tool
capable of hashing files.

This computation step is a standing orchestrator responsibility that MUST run for
every change touching at least one baseline domain — it is no longer a per-change gap
requiring a manual `assumptions:` ledger entry. No `assumptions:` entry documenting a
"fingerprint not yet recorded" gap is needed or permitted going forward; the
orchestrator's post-`sdd-spec` computation step closes that gap structurally for every
change.

#### Scenario: sdd-spec declares touched domains — orchestrator computes fingerprints

- GIVEN `sdd-spec` writes a delta spec for domain `auth` and returns `status: success`
  with `touched_baseline_domains: [auth]` in its envelope
- WHEN the orchestrator processes the `sdd-spec` return
- THEN it computes the SHA-256 of the current `openspec/specs/auth/spec.md` and writes
  it to `state.yaml.baseline_fingerprints.auth`
- AND `sdd-spec` itself never touches `baseline_fingerprints` in `state.yaml`
- Evidence: agent-instruction prose; verified via a static contract-test anchor on the
  "orchestrator computes" / "sdd-spec declares, never computes" strings, not a runtime
  execution trace.

#### Scenario: New domain with no existing baseline — orchestrator writes null

- GIVEN `sdd-spec` declares a touched domain that has no existing
  `openspec/specs/{domain}/spec.md` file yet
- WHEN the orchestrator runs the post-`sdd-spec` fingerprint step
- THEN it writes `null` for that domain under `state.yaml.baseline_fingerprints`
  instead of attempting to hash a non-existent file
- Evidence: agent-instruction prose; verified via a static contract-test anchor, not a
  runtime execution trace.

#### Scenario: No per-change fingerprint assumption entry needed

- GIVEN a change touches one or more baseline domains during `sdd-spec`
- WHEN the orchestrator's standing post-`sdd-spec` fingerprint step runs
- THEN no entry is written to `state.yaml`'s `assumptions:` ledger describing a
  "fingerprint not recorded" gap for this change
- Evidence: static contract-test anchor on the orchestrator instruction text (asserts
  the per-change-assumption pattern text has been removed); agent-instruction prose,
  not a runtime execution trace.

---

## 2. Agent Frontmatter Contract

Every `*.agent.md` file MUST include a YAML frontmatter block. The canonical source format targets the vscode runtime.

### 2.1 Required Fields

| Field | Type | Requirement | Notes |
|-------|------|-------------|-------|
| `name` | string | MUST be present | Unique identifier; matches the filename stem (e.g., `sdd-apply`) |
| `description` | string | MUST be present | One-line purpose statement used by the orchestrator's delegation table |
| `tools` | YAML array | MUST be present | Abstract tool grant; see Section 2.3 |
| `user-invocable` | boolean | MUST be present | `true` only for the orchestrator; `false` for all phase agents and reviewers |
| `target` | string | MUST be `vscode` in source | Generator strips or replaces this field per target |

### 2.2 Optional / Derived Fields

| Field | Scope | Notes |
|-------|-------|-------|
| `agents` | Orchestrator only | Lists all sub-agents the orchestrator may delegate to |
| `model` | Injected by generator | Intentionally absent from source files; generator adds the resolved model alias or provider/tier slug per target |

The comment `# modelo intencionalmente omitido.` appears in all phase agent sources to document the deliberate absence of a model field. The generator resolves models from `docs/model-routing.md` or local user configuration.

### 2.3 Abstract Tool Names

Source files use abstract tool names. The generator expands them to target-native equivalents.

| Abstract | Claude expansion | Opencode expansion | Copilot mapping |
|----------|------------------|--------------------|-----------------|
| `read` | `Read` | `read: true` | `read` |
| `search` | `Grep`, `Glob` | `grep: true`, `glob: true` | `search` |
| `edit` | `Edit`, `Write` | `edit: true`, `write: true` | `edit` |
| `execute` | `Bash` | (varies) | `execute` |
| `agent` | `Task` | (varies) | `agent` |
| `vscode/askQuestions` | `AskUserQuestion` | `question: true` | `ask_user` |

No `vscode/`-namespaced strings SHALL remain in any generated claude tree.

---

## 3. Slash-Command Prompt Files

The `commands/` directory contains `*.prompt.md` files. These are not agent executors; they are lightweight routing entries that activate the orchestrator through a slash command.

### 3.1 Command Frontmatter

| Field | Requirement | Notes |
|-------|-------------|-------|
| `name` | MUST be present in source | Stripped in opencode (filename is the ID) |
| `description` | MUST be present | One-line label shown in autocomplete |
| `agent` | MUST be `sdd-orchestrator` | Routes to the orchestrator, never to a phase agent directly |
| `argument-hint` | OPTIONAL | Human hint for expected arguments |
| `tools` | OPTIONAL | Tool grant override for the command context |

Input placeholders in the body use VS Code syntax: `${input}` (bare, positional) or `${input:fieldName}` (named). The generator transforms these per target (opencode uses `$ARGUMENTS` / `$1`, `$2` positional; claude uses `$name`).

### 3.2 Command Roster

| File | Slash command | Routes to |
|------|--------------|-----------|
| `commands/sdd-init.prompt.md` | `/sdd-init` | sdd-orchestrator → sdd-init |
| `commands/sdd-new.prompt.md` | `/sdd-new` | sdd-orchestrator |
| `commands/sdd-continue.prompt.md` | `/sdd-continue` | sdd-orchestrator |
| `commands/sdd-ff.prompt.md` | `/sdd-ff` | sdd-orchestrator |
| `commands/sdd-lite.prompt.md` | `/sdd-lite` | sdd-orchestrator |
| `commands/sdd-baseline.prompt.md` | `/sdd-baseline` | sdd-orchestrator → sdd-baseline |
| `commands/sdd-explore.prompt.md` | `/sdd-explore` | sdd-orchestrator → sdd-explore |
| `commands/sdd-reconcile.prompt.md` | `/sdd-reconcile` | sdd-orchestrator → sdd-reconcile |
| `commands/sdd-propose.prompt.md` | `/sdd-propose` | sdd-orchestrator |
| `commands/sdd-spec.prompt.md` | `/sdd-spec` | sdd-orchestrator |
| `commands/sdd-clarify.prompt.md` | `/sdd-clarify` | sdd-orchestrator |
| `commands/sdd-design.prompt.md` | `/sdd-design` | sdd-orchestrator |
| `commands/sdd-tasks.prompt.md` | `/sdd-tasks` | sdd-orchestrator |
| `commands/sdd-apply.prompt.md` | `/sdd-apply` | sdd-orchestrator |
| `commands/sdd-verify.prompt.md` | `/sdd-verify` | sdd-orchestrator |
| `commands/sdd-archive.prompt.md` | `/sdd-archive` | sdd-orchestrator |
| `commands/sdd-onboard.prompt.md` | `/sdd-onboard` | sdd-orchestrator |
| `commands/sdd-workspace.prompt.md` | `/sdd-workspace` | sdd-orchestrator |
| `commands/sdd-document.prompt.md` | `/sdd-document` | sdd-orchestrator → sdd-document |

## Clarifications

### Session 2026-07-05

- Q: The commands↔agents contract test (REQ-agents-007) needs a source of truth for which sub-agent each command routes to. Frontmatter `agent:` is always `sdd-orchestrator`, so the actual routing target must be looked up elsewhere. Which source should the static test parse? → A: Parse the Section 3.2 "Command Roster" markdown table in openspec/specs/agents/spec.md (extract the "Routes to" column, e.g. "sdd-orchestrator → sdd-document").
- Q: For J5's post-run inventory check, the orchestrator needs an authoritative output directory path — including for Option C custom paths, which may resolve outside the repository working tree (git status cannot see writes there). How should route-document.md determine and scope this? → A: Orchestrator independently resolves the output dir itself from the scope_choice/custom_path it already passed at launch (A→openwiki/, B→docs/wiki/, C→the same custom_path string), and treats any custom path that resolves outside the repository root as a hard validation failure at gate time (reject before delegating).
- Q: When J5 detects a changed/untracked path outside the approved output dir and the two exceptions, REQ-agents-006 says the orchestrator halts and shows a question_gate — but doesn't say what choices the user is given. What should the gate offer? → A: Two options: 'Abort the route and leave the offending files for manual review' (recommended/default) vs 'Acknowledge and close the route anyway (mark as accepted risk)'.

---

## 4. Executor-vs-Coordinator Boundary

This is the primary architectural invariant for the agent system.

### 4.1 Coordinator (Orchestrator)

Given the `sdd-orchestrator` agent receives a user request,
When the request requires reading 4+ files, writing across multiple files, or running tests/builds,
Then it MUST delegate to a phase sub-agent via the `agent` / `Task` tool and MUST NOT perform that work inline.

The orchestrator MAY perform inline: reads of 1-3 files to verify state, atomic single-file writes of known content, and git/gh bash commands for state queries.

The orchestrator MUST NOT be loaded as an executor phase agent. It MUST NOT perform phase work itself.

### 4.2 Executor (Phase Agents and Reviewers)

Given any phase agent receives a delegated task,
When it begins execution,
Then it MUST do the work itself and MUST NOT call `delegate`, `task`, or launch sub-agents.

Every phase agent file's body opens with an `## Executor boundary` section that enforces this invariant explicitly. Phase agents that need user input MUST return `status: blocked` with `question_gate`; they MUST NOT ask the user directly.

### 4.3 Blocking Question Flow

Given a phase agent cannot safely continue without user input,
When it reaches a blocking decision point,
Then it MUST return `status: blocked` with a structured `question_gate` payload.

The orchestrator receives the blocked envelope, extracts `question_gate`, and MUST call `vscode/askQuestions` (target-specific equivalent) to relay the question. The orchestrator MUST NOT continue downstream phases until the answer is available. It relaunches the phase agent with the answer.

Conversation history MUST NOT be treated as approval evidence. Persisted approval entries in `openspec/changes/{change-name}/state.yaml` are the canonical approval record.

---

## 5. Skill-Loading Pattern

Every phase agent body instructs loading two files before work begins:

1. `skills/{phase-name}/SKILL.md` — phase-specific procedure and decision gates
2. `skills/_shared/sdd-phase-common.md` — shared executor protocol (artifact retrieval, persistence, return envelope shape)

Agents do NOT reload their own `*.agent.md` frontmatter at runtime; the frontmatter is consumed by the target runtime. The body text is the actual instruction set.

See the `skills` domain spec for the frontmatter contract and registry inclusion rules.

---

## 6. Result Envelope Contract

### 6.1 SDD Phase Agent Envelope

All SDD phase agents (Section 1.2) MUST return the following fields:

| Field | Type | Requirement |
|-------|------|-------------|
| `status` | `success` \| `partial` \| `blocked` | MUST be present |
| `executive_summary` | string | MUST be present; one sentence |
| `artifacts` | list of paths | MUST be present; paths written this batch |
| `next_recommended` | string | MUST be present; next phase or action |
| `risks` | string or list | MUST be present; deviations, blockers, or "None" |
| `skill_resolution` | enum | MUST be present; see Section 6.3 |
| `question_gate` | object | MUST be present when `status: blocked` |
| `blocker_type` | enum: `needs_user_decision` \| `design-mismatch` \| `spec-change-required` \| `workload-escalation` | OPTIONAL; SHOULD be present when `status: blocked` |
| `runtime_observability` | object | OPTIONAL; hook/cache observations relevant to continuation |
| `approval_updates` | list | OPTIONAL; approval ledger entries for the orchestrator to persist |
| `assumptions` | list | OPTIONAL; entries conforming to the `assumption-ledger` domain's Assumption Entry Schema, for the orchestrator to persist into `state.yaml` |

Naming note: the `blocker_type` enum mixes snake_case (`needs_user_decision`) and kebab-case (`design-mismatch`, `spec-change-required`, `workload-escalation`) for historical reasons that predate a naming convention — do not rename existing values. New values SHOULD use kebab-case going forward, matching the majority.

In addition to being present as prose-adjacent envelope fields, every field in this
table MUST also be emitted inside the phase's ```` ```json:result-envelope ```` fenced
block (skills domain, strict emission format requirement), as strict, directly
parseable JSON. The fenced block is additive to, and does not replace, the existing
plain-prose presentation of these fields.

`status: partial` indicates work completed for this batch with more batches remaining. The orchestrator relaunches the same phase.

`status: blocked` halts the pipeline until the orchestrator resolves the blocking question through user interaction.

#### Scenario: Phase agent completes successfully — fields present in both prose and fence

- GIVEN `sdd-apply` receives a task batch from the orchestrator
- WHEN it implements all assigned tasks
- THEN it returns `status: success` with all written file paths in `artifacts`,
  `next_recommended: sdd-verify`, and `skill_resolution` reflecting how skills were
  loaded
- AND the same field values also appear inside its
  ```` ```json:result-envelope ```` fenced block as strict JSON

#### Scenario: Phase agent blocked on user input

- GIVEN `sdd-tasks` encounters a review-workload decision that exceeds the 400-line
  budget
- WHEN it cannot resolve the delivery strategy autonomously
- THEN it returns `status: blocked` with a `question_gate` object containing at least
  one question with options, and MUST NOT ask the user directly
- AND `status: "blocked"` and `question_gate` also appear inside the fenced JSON block

### 6.1a Orchestrator Consumes Structured Envelope Fields

The orchestrator's Result Contract MUST extract phase-return field values from the
sub-agent's ```` ```json:result-envelope ```` fenced block (skills domain,
`sdd-phase-common.md` §D strict emission format) as the primary, authoritative source
— `status`, `executive_summary`, `artifacts`, `next_recommended`, `risks`,
`skill_resolution`, and any present optional fields (`blocker_type`, `question_gate`,
`assumptions`). This is additive to — not a removal of — the existing plain-prose
Result Envelope parsing behavior.

When the fence is absent, malformed, or fails schema validation, the orchestrator MUST
degrade to its pre-existing behavior: parsing the plain-prose envelope fields exactly
as it did before this change. This fallback MUST NOT block or fail the phase's
dispatch — it is a silent, fail-safe degrade, mirroring the `SubagentStop` fail-safe
contract (hooks domain).

This requirement does not alter which fields exist, their meaning, or their
requirement level (Section 6.1 baseline table) — it only changes how the orchestrator
extracts already-defined field values.

#### Scenario: Fenced envelope present — orchestrator parses fields directly

- GIVEN a phase agent's return includes a valid ```` ```json:result-envelope ```` fence
- WHEN the orchestrator processes the return
- THEN it extracts `status`, `artifacts`, `next_recommended`, etc. directly from the
  parsed JSON object, without LLM-assisted prose parsing for those fields

#### Scenario: Fence absent or invalid — fallback to prose parsing

- GIVEN a phase agent's return has no fence, or the fence fails schema validation
- WHEN the orchestrator processes the return
- THEN it falls back to parsing the plain-prose envelope exactly as before this change
- AND the phase dispatch pipeline is NOT blocked or failed because of the missing/
  invalid fence

### 6.2 4R Reviewer Envelope

All four reviewer agents (Section 1.3) MUST return:

| Field | Type | Requirement |
|-------|------|-------------|
| `status` | `success` | MUST always be `success` |
| `executive_summary` | string | MUST be finding count by severity, or exactly `"No findings."` |
| `findings` | list | MUST be present; empty list when clean |
| `artifacts` | `[]` | MUST be empty; reviewers NEVER write files |
| `next_recommended` | `none` | MUST be `none`; orchestrator decides routing |
| `risks` | string | SHOULD note scan scope limitations |
| `skill_resolution` | enum | MUST be present |

When a reviewer has no findings, its output body MUST be exactly `No findings.` with no additional prose.

### 6.3 skill_resolution Values

| Value | Meaning |
|-------|---------|
| `injected` | Orchestrator injected compact rules in the launch prompt (preferred path) |
| `fallback-registry` | Agent loaded rules from `.ospec/cache/skill-registry.cache.json` |
| `fallback-path` | Agent loaded exact `SKILL.md` fallback paths |
| `none` | No skill source was available |

The `SubagentStop` hook reads this field from each returning agent envelope. Any value other than `injected` triggers an observability warning, prompting the orchestrator to re-read the registry cache and inject compact rules in subsequent delegations.

### 6.4 Requirement: Result Envelope Optional Assumptions Field

The SDD Phase Agent Envelope (baseline `openspec/specs/agents/spec.md` §6.1) gains
one additional OPTIONAL field, `assumptions`, alongside the existing
`approval_updates` field. This is a purely additive extension of the envelope
table; no existing field changes meaning or requirement level.

| Field | Type | Requirement |
|---|---|---|
| `assumptions` | list | OPTIONAL; entries conforming to the `assumption-ledger` domain's Assumption Entry Schema, for the orchestrator to persist into `state.yaml` |

A phase agent MUST populate `assumptions` only with entries produced under the
materiality rule defined in the `assumption-ledger` spec; it MUST NOT use this
field for blocking decisions (those go through `question_gate` instead).

#### Scenario: Phase returns assumptions made during this batch

- GIVEN `sdd-design` recorded one internal, reversible decision during its batch
- WHEN it composes its return envelope
- THEN `assumptions` contains that entry alongside the standard required fields (`status`, `executive_summary`, `artifacts`, `next_recommended`, `risks`, `skill_resolution`)

#### Scenario: Phase makes no assumptions — field omitted

- GIVEN a phase agent resolves every ambiguity by following the existing spec and design exactly
- WHEN it composes its return envelope
- THEN `assumptions` is omitted or an empty list, and the envelope remains otherwise unchanged

### 6.5 Requirement: Orchestrator Assumption Ledger Protocol

The orchestrator MUST maintain an Assumption Ledger Protocol alongside its
existing Approval Ledger Protocol (`agents/sdd-orchestrator.agent.md`). On every
phase return that includes a non-empty `assumptions` field, the orchestrator
MUST read-merge-update `openspec/changes/{change-name}/state.yaml`, appending
each entry under the top-level `assumptions:` ledger per the persistence shape
defined in the `assumption-ledger` domain spec. The orchestrator MUST NOT infer
assumption entries from conversation memory; only entries explicitly returned
in a phase envelope are persisted.

The orchestrator is the sole authority for `id` uniqueness: phase agents number
`seq` only locally within their own envelope, and the orchestrator MUST
renumber/reassign the `seq` suffix of an incoming entry at persist time whenever
it would otherwise collide with an `id` already present in `state.yaml`.

This protocol MUST fire on every phase return, independent of route or gate
configuration — it is not a circumstantial handler.

#### Scenario: Orchestrator persists assumptions on every phase return

- GIVEN `sdd-apply` returns `status: success` with two `assumptions[]` entries
- WHEN the orchestrator processes the envelope
- THEN it appends both entries under `state.yaml assumptions:` before dispatching the next phase

#### Scenario: Orchestrator does not fabricate assumptions

- GIVEN a phase agent's envelope has no `assumptions` field
- WHEN the orchestrator processes the envelope
- THEN it MUST NOT add any entry to `state.yaml assumptions:` based on chat context alone

### 6.6 Requirement: sdd-verify Assumption Reconciliation Duty

`sdd-verify` MUST execute the Verify Reconciliation Checklist defined in the
`assumption-ledger` domain spec as part of its standard verify pass: reading
unresolved entries from `state.yaml assumptions:`, presenting the
confirm/correct/promote-to-clarification checklist, and writing `WARNING`
findings for unresolved material (`reversibility: low`) entries into
`verify-report.md`, subject to the same `known-issues.md` write contract as
other `WARNING` findings (baseline §14, agents spec). This step runs alongside
existing verify steps and MUST NOT alter verify behavior when `assumptions:`
is empty or absent. Selecting `promote-to-clarification` only sets
`status: promoted` on the entry; `sdd-verify` MUST NOT auto-schedule or
auto-invoke `sdd-clarify` as a consequence — the user alone decides when to
re-run it.

#### Scenario: Reconciliation runs as part of standard verify

- GIVEN `state.yaml` has one unresolved `assumptions:` entry
- WHEN `sdd-verify` executes
- THEN it presents the reconciliation checklist for that entry as part of the same verify pass that runs tests/build

#### Scenario: No assumptions recorded — verify unaffected

- GIVEN `state.yaml` has no `assumptions:` block
- WHEN `sdd-verify` executes
- THEN it skips the reconciliation checklist and verify behavior is identical to the pre-assumption-ledger baseline

### 6.7 Requirement: sdd-archive Cost Block in Archive Report {#REQ-agents-001}

`sdd-archive`'s archive report (`archive-report.md`, per `skills/sdd-archive/SKILL.md`
Step 3) MUST include a "Cost" block reporting, per completed change:
- Estimated tokens per phase, aggregated from `.ospec/session/{change}/phase-costs.jsonl`
  (hooks domain, `SubagentStop` §REQ-hooks-001), grouped and summed by `phase`.
- The count of re-launches per phase — a re-launch is a repeat dispatch of the same
  phase after its first recorded dispatch (e.g. re-running `sdd-apply` across multiple
  batches, or re-dispatching a phase after a `blocked` return).
- The count of user questions asked during the change.

This step MUST run as part of the standard archive flow (after Step 3's existing
archive-report content is composed, before the report is persisted) and MUST NOT
change the close-gate enforcement, spec-sync order, or archive-folder move already
defined for `sdd-archive`.

The exact source field(s) or event(s) used to compute re-launch and user-question
counts (e.g. `state.yaml` phase-history entries versus dedicated `phase-costs.jsonl`
events) are an implementation detail deferred to `sdd-design` for this change; this
requirement fixes only the observable content of the archive report, not the internal
aggregation mechanism.

Because the token figures are heuristic estimates (§REQ-hooks-001), the archive report
MUST label them as "estimated" rather than presenting them as exact metering.

When `.ospec/session/{change}/phase-costs.jsonl` does not exist or is empty (e.g. the
change had no dispatches recorded before this feature shipped, or was fast-tracked),
`sdd-archive` MUST still emit the Cost block, showing zero/"no data" per phase rather
than omitting the block or failing the archive.

#### Scenario: Cost block populated from phase-costs.jsonl

- GIVEN `.ospec/session/add-x/phase-costs.jsonl` contains dispatch records for phases
  `spec`, `design`, and `apply` (with `apply` dispatched twice)
- AND `state.yaml` records one user question asked during the change
- WHEN `sdd-archive` composes the archive report
- THEN the report's Cost block lists estimated tokens per phase for `spec`, `design`,
  and `apply`
- AND it reports 1 re-launch for `apply` (second dispatch of the same phase)
- AND it reports 1 user question asked
- AND all token figures are labeled as estimated

#### Scenario: No cost data available — block present but empty

- GIVEN `.ospec/session/add-x/phase-costs.jsonl` does not exist for the change being
  archived
- WHEN `sdd-archive` composes the archive report
- THEN the Cost block is still present in `archive-report.md`
- AND it indicates no per-phase cost data was recorded, rather than omitting the block
  or causing the archive to fail

#### Scenario: Cost block does not gate archive completion

- GIVEN the Cost block would show partial or missing data for some phases
- WHEN `sdd-archive` evaluates whether to proceed to the archive-folder move (Step 5)
- THEN the incompleteness of cost data MUST NOT block or fail the archive — the
  existing close-gate rules (verify verdict, warning acceptance) remain the sole
  gating conditions

---

## 7. 4R Review Gate Dispatch

### 7.1 Parallel Dispatch

Given the active route reaches the 4R review gate hook point,
When the orchestrator dispatches the gate,
Then it MUST launch all four reviewers (risk, readability, reliability, resilience) as parallel sub-agents when the target runtime supports async delegation, degrading to serial dispatch only when parallel delegation is unavailable.

The orchestrator MUST collect all four envelopes before evaluating findings.

### 7.2 Finding Severity Escalation

Given the orchestrator has collected all four reviewer envelopes,
When any finding has severity `BLOCKER` or `CRITICAL`,
Then the orchestrator MUST surface it to the user via `vscode/askQuestions` before the route closes. The route MUST NOT auto-halt on these severities; the user decides remediation.

`WARNING` and `SUGGESTION` findings are recorded in `state.yaml` but MUST NOT interrupt the route.

### 7.3 Gate Hook Points

| Route | Gate hook point |
|-------|----------------|
| `bugfix`, `refactor`, `standard` | After `sdd-verify` returns `status: success` (only when `gates` lists `4r-review-gate`) |

---

## 8. Target-Specific Transformations

### 8.1 Per-Target Summary

| Aspect | vscode (source) | claude | github-copilot | opencode |
|--------|----------------|--------|----------------|----------|
| Agent path | `agents/*.agent.md` | `agents/*.md` | `.github/agents/*.agent.md` | `.opencode/agents/*.md` |
| Suffix | `.agent.md` | `.md` | `.agent.md` | `.md` |
| `target` field | `vscode` | stripped | `github-copilot` | stripped |
| `user-invocable` | present | stripped | present | stripped (→ `mode`) |
| `model` | absent | added (alias) | absent | added (provider/slug) |
| `tools` format | YAML array | array (expanded) | array (mapped) | YAML boolean map |
| Orchestrator | agent file | SKILL file | agent file | agent file |
| `mode` field | absent | absent | absent | `primary` or `subagent` |

### 8.2 Opencode `mode` Derivation

The opencode target derives the `mode` field from `user-invocable`:
- `user-invocable: true` → `mode: primary`
- `user-invocable: false` → `mode: subagent`

This field is required by the opencode runtime for every agent and MUST NOT be present in the vscode source.

### 8.3 Claude Orchestrator Promotion

On the claude target the orchestrator MUST be emitted as `skills/sdd-orchestrator/SKILL.md` and MUST NOT appear as `agents/sdd-orchestrator.md`. The skill carries `name` and `description` from the frontmatter, the inlined rules content, and applies all tool substitutions. It MUST NOT carry `model`, `tools`, or `target` fields.

---

## 9. Scenarios

### Scenario 9.1 — Phase agent completes successfully

Given `sdd-apply` receives a task batch from the orchestrator,
When it implements all assigned tasks,
Then it MUST return `status: success` with all written file paths in `artifacts`, `next_recommended: sdd-verify`, and `skill_resolution` reflecting how skills were loaded.

### Scenario 9.2 — Phase agent blocked on user input

Given `sdd-tasks` encounters a review-workload decision that exceeds the 400-line budget,
When it cannot resolve the delivery strategy autonomously,
Then it MUST return `status: blocked` with a `question_gate` object containing at least one question with options, and MUST NOT ask the user directly.

### Scenario 9.3 — Reviewer finds no issues

Given `review-resilience` scans the applied change,
When it detects no missing error handling, recovery paths, or swallowed exceptions,
Then its output body MUST be exactly `No findings.` and `findings` MUST be an empty list.

### Scenario 9.4 — Reviewer finds a BLOCKER

Given `review-risk` detects an auth bypass with a specific file and line reference,
When it returns its envelope with severity `BLOCKER`,
Then the orchestrator MUST call `vscode/askQuestions` to surface the finding before the route closes and MUST record the outcome in `state.yaml` under `gates['4r-review-gate']`.

### Scenario 9.5 — SubagentStop detects degraded skill resolution

Given a phase agent returns `skill_resolution: fallback-registry`,
When the `SubagentStop` hook processes the envelope,
Then it MUST emit an observability warning, and the orchestrator MUST re-read the registry cache and inject compact rules into all subsequent sub-agent launch prompts.

---

## 10. Federated `target_dir` Parameter

> Promoted from change `federation-distributed-markers` (C1) on 2026-06-18.

### Requirement: sdd-init `target_dir` Parameter

The `sdd-init` agent MUST accept an optional `target_dir` parameter specifying the
directory in which to perform initialization. When `target_dir` is present, the agent
MUST operate on that directory instead of the current working directory; all artifact
reads and writes MUST be relative to `target_dir`. When `target_dir` is absent, the
agent MUST fall back to the current working directory (backward-compatible behavior).

The orchestrator uses `target_dir` to drive per-member `sdd-init` in a federated
workspace without changing the orchestrator's own working directory (D3).

**Propagation mechanism**: `target_dir` MUST be passed to the agent as a
`## Parameters` block injected into the launch prompt, using the same pattern as
`## Project Standards`. The block MUST contain a `target_dir: <path>` line. The
skill reads this value from the prompt text; no environment variable and no dynamic
frontmatter field is used. When the `## Parameters` block is absent, `target_dir`
is considered absent and cwd fallback applies.

When `target_dir` is present but does not exist on the filesystem, the agent MUST
return `status: blocked` with a `question_gate` describing the invalid path; it
MUST NOT create files at any unintended location.

#### Scenario: `target_dir` provided — init scoped to specified directory

- GIVEN the orchestrator calls `sdd-init` with `target_dir: /workspace/services/auth`
- WHEN `sdd-init` runs
- THEN all artifact reads and writes are relative to `/workspace/services/auth`
- AND the current working directory is NOT used as the base path

#### Scenario: `target_dir` absent — backward-compatible cwd behavior

- GIVEN the orchestrator calls `sdd-init` with no `target_dir` parameter
- WHEN `sdd-init` runs
- THEN it operates on the current working directory
- AND behavior is identical to the pre-C1 baseline

#### Scenario: `target_dir` points to a non-existent path

- GIVEN the orchestrator calls `sdd-init` with `target_dir: /workspace/missing-svc`
  AND that path does not exist on the filesystem
- WHEN `sdd-init` begins execution
- THEN it MUST return `status: blocked` with a `question_gate` describing the invalid path
- AND it MUST NOT create files at an unintended location

---

## 11. Federated Foundation

> Promoted from change `federated-foundation-orchestration` (C3) on 2026-06-19.

### Requirement: sdd-orchestrator Federated Foundation Delegation

Cuando el backend de almacenamiento es `workspace-federated` y se inicia la fase de foundation, el orquestador delegará en `sdd-foundation` pasando `workspace_yaml` apuntando a `workspace.yaml` y `parent_change` conteniendo el nombre del cambio activo.

#### Scenario: Delegating with workspace_yaml
- GIVEN the workspace-federated backend is active and the foundation phase is triggered
- WHEN the orchestrator delegates to `sdd-foundation`
- THEN it passes `workspace_yaml` pointing to the physical atlas cache and `parent_change` containing the active change name

---

### Requirement: sdd-foundation Federated Scans

El agente `sdd-foundation` en modo federado aceptará y procesará `workspace_yaml` y `parent_change` para escanear las especificaciones miembro locales (`{member}/openspec/specs/**/spec.md`) e integrarlas en la síntesis del baseline técnico del coordinador.

#### Scenario: Scanning member specs
- GIVEN the foundation agent runs in federated mode with `workspace_yaml`
- WHEN the execution steps run
- THEN the agent scans `{member}/openspec/specs/**/spec.md` locales
- AND synthesizes provides/consumers dependencies into `Mapa de Contratos e Interacciones`

---

### Requirement: sdd-foundation Interactive Fallback Loop

El agente `sdd-foundation` iniciará un bucle interactivo de remediación si el servidor MCP de MarkItDown no está configurado, deteniendo la ingesta y preguntando al usuario vía `vscode/askQuestions` antes de continuar con el descubrimiento manual.

#### Scenario: Interactive fallback loop executed
- GIVEN the MarkItDown MCP server is not available during document ingestion
- WHEN the agent executes the fallback check
- THEN it presents the interactive gate via `vscode/askQuestions`
- AND acts according to the selected option (automatic setup, manual guided configuration, or skip)

---

## 12. Hook-Injected Content in Sub-Agent Launch Prompts

When `load-skill` or `load-rules` actions fire at a lifecycle event boundary
immediately before a sub-agent is dispatched, the orchestrator MAY inject the
resolved content into that sub-agent's launch prompt as a `## Hook-Injected Skills
and Rules` block.

Composition rules:

- Hook-injected content MUST be appended **after** the `## Project Standards
  (auto-resolved)` block (or equivalent skill-resolver injection), never before it
  and never replacing it.
- `load-skill`: the orchestrator MUST read the file at `skill: <path>` relative to
  the repo root and include its textual content in the injected block.
- `load-rules`: the orchestrator MUST include the `rules:` inline text verbatim in
  the injected block.
- When multiple `load-skill` and `load-rules` actions fire at the same boundary,
  their content MUST be appended in declaration order within the single
  `## Hook-Injected Skills and Rules` block.
- The `skill_resolution` field in the sub-agent's return envelope continues to
  reflect the standard skill-resolver resolution path (Section A of
  `sdd-phase-common.md`). Hook injection does NOT change `skill_resolution`
  semantics and MUST NOT be reported as `injected` unless the standard resolver
  also injected Project Standards.
- `before-task` hook injections apply to each individual task invocation within
  `sdd-apply`; each task invocation receives a fresh injection based on actions
  that fired for that task boundary.

### Scenario: `load-skill` content injected before apply

- GIVEN `hooks.before-implementation` declares `type: load-skill, skill: skills/custom/SKILL.md`
  AND that file exists
- WHEN the orchestrator dispatches `sdd-apply`
- THEN the launch prompt MUST include a `## Hook-Injected Skills and Rules` block
  containing the content of `skills/custom/SKILL.md`
- AND the `## Project Standards (auto-resolved)` block (if present) MUST appear before it

### Scenario: `load-rules` prose appended after project standards

- GIVEN `hooks.before-verify` declares `type: load-rules, rules: "Always check coverage >= 80%"`
- WHEN the orchestrator dispatches `sdd-verify`
- THEN the launch prompt MUST include the inline text in a `## Hook-Injected Skills and Rules` block
- AND the block MUST appear after any existing `## Project Standards` section

### Scenario: No hook actions — prompt composition unchanged

- GIVEN no `load-skill` or `load-rules` actions fire at a boundary
- WHEN the orchestrator dispatches any sub-agent
- THEN the launch prompt is identical to the pre-lifecycle-hooks baseline
- AND no `## Hook-Injected Skills and Rules` block is added

### Scenario: `skill_resolution` unaffected by hook injection

- GIVEN a sub-agent receives hook-injected content via `load-skill`
  AND also receives `## Project Standards (auto-resolved)` via the standard skill-resolver
- WHEN the sub-agent returns its envelope
- THEN `skill_resolution` MUST be `injected` (reflecting the standard resolver path)
- AND the `## Hook-Injected Skills and Rules` block does NOT alter that value

### Scenario: Multiple actions merged into single block

- GIVEN `hooks.before-change` declares `[load-skill A, load-rules B, load-skill C]`
- WHEN all three actions succeed and the next sub-agent is dispatched
- THEN the launch prompt MUST contain a single `## Hook-Injected Skills and Rules` block
- AND the content appears in the order A → B → C


---

## 13. Capability-Aware Stack-Skill Injection

Before dispatching any SDD phase sub-agent that reads, writes, or reviews code
(i.e., `sdd-apply`, `sdd-design`, `sdd-tasks`, `sdd-spec`, `sdd-verify`, and the
4R reviewers), the orchestrator MUST perform capability-aware stack-skill injection
as an additional step within the existing `## Project Standards (auto-resolved)`
composition:

1. **Candidate resolution**: read the active capability list from the session cache
   (as surfaced by `runSessionStart`) and intersect it with the `capabilities` arrays
   of all registry skill entries. The result is the capability-matched candidate set.

2. **Task-domain filtering (judgment-based)**: from the capability-matched candidate
   set, the orchestrator MUST apply semantic judgment to select only the stack skills
   relevant to the current sub-agent's task. The orchestrator reads each candidate
   skill's `description` and `capabilities` frontmatter and weighs them against the
   content and intent of the current task (e.g., a task such as "crear formulario
   reactivo" targets the frontend domain; the orchestrator selects `stack-angular`
   and does NOT inject `stack-postgres` whose description covers a backend database
   runtime). There is NO explicit `domain:` field on task entries and NO `domain:`
   field on skill frontmatter; selection is entirely by orchestrator judgment over the
   semantic match between skill descriptions and task intent.

3. **Injection**: inject the compact rules of the filtered stack skills into the
   sub-agent launch prompt inside the existing `## Project Standards (auto-resolved)`
   block, appended after utility-skill compact rules. The injection MUST respect the
   existing five-skill cap defined in `skills/_shared/skill-resolver.md`; across the
   combined set (utility + stack) at most five skill blocks MUST be included.

4. **No-op path**: when the active capability list is empty (no `capabilities:` block
   in `config.yaml`) OR when the candidate set is empty (no registry entries match),
   the orchestrator MUST NOT add any stack-skill content and MUST NOT error. Prompt
   composition is identical to the pre-capabilities baseline.

The orchestrator MUST NOT inject stack skills into sub-agents that perform purely
mechanical or meta operations where technology-specific knowledge is irrelevant
(e.g., `sdd-archive`, `sdd-init`).

> **Resolution (AMBIGUITY-A2 — task-domain filtering)**: Selection from the
> capability-matched candidate set is by orchestrator judgment and semantic
> relevance. The orchestrator reads each candidate skill's `description` and
> `capabilities` frontmatter and weighs them against the task content and intent.
> There is NO explicit `domain:` field on task entries and NO `domain:` field on
> skill frontmatter. This mirrors ECC's model: skills are framework/domain-named
> and selection is semantic, not a centralized capability→task map. Stack skills
> MUST carry a meaningful `description` (see skills delta spec) so that
> judgment-based selection is reliable.

> **Resolution (AMBIGUITY-A3 — multi-skill precedence)**: When a single capability
> name resolves to more than one stack-skill entry, the default tie-breaking order
> is deterministic registry order (alphabetical by skill `id`). With the 2–3 seed
> stack skills shipped in v1 (one per technology), this case never occurs in
> practice. A future change that adds multiple skills per capability MUST specify
> an explicit precedence rule at that time.

### Scenario: Capability-matched skills injected for frontend apply task

- GIVEN `config.yaml` declares capabilities `angular` and `postgres`
  AND the registry has `stack-angular` (capabilities: ["angular"]) and `stack-postgres` (capabilities: ["postgres"])
  AND the orchestrator reads `stack-angular`'s description (Angular frontend framework) and `stack-postgres`'s description (PostgreSQL backend runtime) and judges by semantic match that the task intent targets the frontend domain
- WHEN the orchestrator composes the sub-agent launch prompt
- THEN `stack-angular` compact rules are included in `## Project Standards (auto-resolved)`
- AND `stack-postgres` compact rules are NOT included (domain mismatch)

### Scenario: No capabilities declared — baseline prompt, no stack skills

- GIVEN `config.yaml` has no `capabilities:` key
- WHEN the orchestrator dispatches `sdd-apply`
- THEN no stack-skill content is added to the launch prompt
- AND prompt composition is identical to the pre-capabilities baseline

### Scenario: Capability declared but no registry entry matches — silent no-op

- GIVEN `config.yaml` declares capability `vue`
  AND no registry skill entry has `vue` in its `capabilities` array
- WHEN the orchestrator resolves stack skills
- THEN no stack-skill content is injected and no error is raised

### Scenario: Five-skill cap respected across utility and stack skills

- GIVEN the orchestrator has already selected three utility skills by code-context matching
  AND two capability-matched stack skills are in the filtered candidate set
- WHEN the orchestrator composes the launch prompt
- THEN the combined injection contains exactly five skill blocks (three utility + two stack)
- AND no additional skills are added beyond the cap

### Scenario: Stack skills not injected into sdd-archive

- GIVEN `config.yaml` declares active capabilities with matching registry entries
- WHEN the orchestrator dispatches `sdd-archive`
- THEN no stack-skill content is added to that sub-agent's launch prompt

---

## 14. Operative Memory Integration

### Requirement: Phase-Start Operative Memory Read

All SDD phase agents listed in the `project-memory` spec phase-read table SHOULD read the designated `openspec/memory/` files at phase start, before beginning any phase work. This step MUST be performed after the skill-loading step described in Section 5 of the agents spec. Files absent from `openspec/memory/` MUST be silently skipped; absence is not an error.

The memory-read step extends the existing two-step skill-loading pattern to three steps:
1. Load `skills/{phase-name}/SKILL.md`
2. Load `skills/_shared/sdd-phase-common.md`
3. Read designated `openspec/memory/` files (per the `project-memory` spec phase-read table)

#### Scenario: Memory read performed before phase work

- GIVEN `openspec/memory/decisions.md` exists and `sdd-design` is dispatched
- WHEN sdd-design starts execution after loading its skills
- THEN it reads `decisions.md` and `conventions.md` before producing any design output
- AND the memory content informs the design without re-deriving established decisions

#### Scenario: Memory absent — phase proceeds without error

- GIVEN `openspec/memory/` does not exist
- WHEN any phase agent reaches the memory-read step
- THEN it skips all memory reads silently
- AND executes phase work as in the pre-memory baseline

---

### Requirement: sdd-verify Quality Gate Enforcement

When `quality_gates:` is declared in `config.yaml`, `sdd-verify` MUST read the policy,
evaluate each configured gate per the quality-gates spec, enforce required gates with
the declared `on_fail` mode, and write per-gate audit entries to `verify-report.md`
and `state.yaml`. This evaluation step MUST run after existing test/build verification
steps and before the operative-memory write step defined in Section 14.

When `quality_gates:` is absent from `config.yaml`, `sdd-verify` MUST NOT alter its
baseline verify behavior in any way.

#### Scenario: Quality gates evaluated as part of verify

- GIVEN `quality_gates:` is declared with at least one gate entry
- WHEN `sdd-verify` executes
- THEN it evaluates all declared gates before finalizing the verify outcome
- AND per-gate results are written to `verify-report.md` and `state.yaml.gates.quality-gates`

#### Scenario: Required halt gate fails — envelope reports FAIL outcome

- GIVEN a gate has `required: true, on_fail: halt` and its command exits non-zero
- WHEN `sdd-verify` finalizes and returns its result envelope
- THEN the envelope `status` is `success` (agent work completed)
- AND `verify-report.md` records overall outcome `FAIL` with a BLOCKER finding
- AND `state.yaml.gates.quality-gates.status` is `fail`

#### Scenario: Quality gates policy absent — baseline behavior unchanged

- GIVEN `config.yaml` has no `quality_gates:` key
- WHEN `sdd-verify` executes
- THEN it follows the baseline verify protocol without evaluating any quality gates
- AND no `gates.quality-gates` entry is written to `state.yaml`

---

### Requirement: sdd-archive Operative Memory Write

After a successful archive, `sdd-archive` MUST execute the decisions-write contract defined in the `project-memory` spec: inspect `open_decisions` in `state.yaml` and prepend all entries with `status: resolved` to `openspec/memory/decisions.md`. This write occurs after the standard archive artifacts are persisted and the `state.yaml` is updated.

`openspec/memory/decisions.md` MUST be listed in the archive phase `artifacts` when at least one entry is written. When no resolved decisions exist, the write is skipped and `artifacts` is unchanged.

#### Scenario: Resolved decisions written as archive artifact

- GIVEN `state.yaml.open_decisions` contains entries with `status: resolved`
- WHEN sdd-archive completes all standard archive steps
- THEN it prepends the resolved entries to `openspec/memory/decisions.md`
- AND `openspec/memory/decisions.md` appears in the returned `artifacts` list

#### Scenario: No resolved decisions — archive unaffected

- GIVEN `state.yaml.open_decisions` is empty or contains only open entries
- WHEN sdd-archive completes
- THEN no write to `openspec/memory/decisions.md` occurs
- AND the archive phase `status` remains `success`

---

### Requirement: sdd-verify Operative Memory Write

After producing its verify report, `sdd-verify` MUST execute the known-issues-write contract defined in the `project-memory` spec: prepend all findings with severity `WARNING` or `BLOCKER` to `openspec/memory/known-issues.md`. The official sdd-verify severity taxonomy is `INFO < WARNING < BLOCKER` (ascending); only `WARNING` and `BLOCKER` qualify for write. This write occurs after the verify report is finalized. Findings at `INFO` severity MUST NOT be written.

`openspec/memory/known-issues.md` MUST be listed in the verify phase `artifacts` when at least one entry is written. A clean verify (no qualifying findings) MUST NOT trigger a write.

#### Scenario: WARNING findings written as verify artifact

- GIVEN sdd-verify produces findings with severity `WARNING` or `BLOCKER`
- WHEN the verify report is finalized
- THEN each qualifying finding is prepended to `openspec/memory/known-issues.md`
- AND `openspec/memory/known-issues.md` appears in the returned `artifacts` list

#### Scenario: Clean verify — known-issues unchanged

- GIVEN sdd-verify produces no findings at WARNING or above
- WHEN the verify phase completes
- THEN no write to `openspec/memory/known-issues.md` occurs
- AND `status` is `success` with no memory-file entry in `artifacts`

---

## 15. Orchestrator Body Partitioning and Lazy Loading

### Requirement: Orchestrator Body Partitioning

The body of `agents/sdd-orchestrator.agent.md` MUST be divided into two non-overlapping
zones:

**CORE (always-loaded inline)**: coordinator identity, delegation rules, user question
gate, command index, change classification, SDD Init Guard, route selection skeleton,
result contract, sub-agent launch and context protocol, recovery rule, and the handler
pointer table defined below.

**Circumstantial handlers (on-demand)**: the following logical blocks MUST NOT be
inlined in the always-loaded body and MUST each reside in a dedicated
`skills/_shared/` reference file:

| Handler | Trigger |
|---|---|
| Brownfield route handler | route == brownfield |
| Workspace federation handler + baseline loop | backend == workspace-federated |
| 4R review gate dispatch | 4r-review-gate in active gates |
| Lifecycle hook dispatch | `hooks:` declared in `config.yaml` |
| Archive / quality-gate guard | before archive phase |
| Repeated `askQuestions` payload shapes | referenced when constructing gate payloads — backed by `skills/_shared/question-shapes.md` (delivery-strategy, review-workload, and blocked-envelope payload shapes) |
| Clarify gate handler | the clarify gate RUNS per the `sdd-clarify` routing rule — success/blocked/user-skip and `phases.clarify.status` bookkeeping, backed by `skills/_shared/clarify-routing.md` |
| Gaps resolution handler | `sdd-foundation` returns `status: blocked` with unresolved functional/technical gaps, backed by `skills/_shared/gaps-resolution.md` |

Each handler file MUST be loaded via the orchestrator's `read` tool ONLY when its
designated trigger fires. The CORE MUST include a pointer table mapping every
route/gate trigger to its `_shared/` reference file path. No circumstantial handler
MUST be resolved by a file path not declared in this pointer table.

#### Scenario: Standard route — no circumstantial handlers loaded

- GIVEN the orchestrator is dispatched on the standard route with no brownfield
  condition, no lifecycle hooks declared, and no workspace-federated backend
- WHEN route selection completes and the standard phase loop begins
- THEN no `skills/_shared/` handler file is read
- AND only the CORE body is active for that dispatch

#### Scenario: Brownfield condition — handler loaded via pointer table

- GIVEN the route classification resolves to `brownfield`
- WHEN the orchestrator resolves the handler using the CORE pointer table
- THEN it reads the designated `skills/_shared/` brownfield handler file exactly once
- AND no other circumstantial handler file is read unless its own trigger also fires

#### Scenario: Pointer table is the sole resolution path

- GIVEN any route or gate fires during a session
- WHEN the orchestrator selects a circumstantial handler
- THEN the handler file path MUST be resolved exclusively from the CORE pointer table
- AND no circumstantial handler is loaded by a path not listed in that table

#### Scenario: Pointer table positioned last in the CORE body (cache-aware ordering)

- GIVEN the CORE body of `agents/sdd-orchestrator.agent.md` contains normative sections
  (Init Guard, Ambient Gate, Assumption Ledger, Intent Restatement, Failure & Blocker
  Routing, forwarding rules, Recovery Rule) plus the circumstantial handler pointer table
- WHEN the orchestrator body is laid out
- THEN the pointer table MUST appear after all always-on normative CORE sections, not
  interleaved with them
- AND this ordering MUST NOT change which handlers are CORE-resolvable or alter any
  handler's trigger condition

---

### Requirement: On-Demand Handler Read-Once Caching

Each circumstantial handler file MUST be read at most once per route execution via the
`read` tool. The orchestrator MUST cache handler content in-session after the first
read. Subsequent phases or gate firings within the same route MUST reuse the cached
content and MUST NOT issue additional `read` calls for already-loaded handler files.

#### Scenario: Lifecycle handler not re-read across phase boundaries

- GIVEN `hooks:` is declared in `config.yaml` and the lifecycle handler file was read
  when the first hook boundary fired
- WHEN a subsequent hook boundary fires within the same session
- THEN the orchestrator reuses the in-session cached content
- AND no additional `read` call is issued for the same file

#### Scenario: Two distinct handlers each read exactly once

- GIVEN the standard route fires both the 4R review gate and the archive/quality-gate
  guard during a single route execution
- WHEN both gates execute
- THEN the 4R handler file is read once AND the archive handler file is read once
- AND neither file is read a second time within the same session

---

### Requirement: Behavioral Parity

Restructuring the orchestrator body into CORE + on-demand handlers MUST NOT alter any
observable behavior. The refactor changes only WHERE instructions live and WHEN they
are loaded, never WHAT the orchestrator does. The following MUST produce identical
outcomes before and after the refactor:

| Observable | Parity requirement |
|---|---|
| Route classification and selection | Same route for the same project inputs |
| Gate firing order and conditions | Same gates fire at the same hook points |
| Sub-agent dispatch order | Same phase sequence for the same route |
| Launch-prompt composition | Same prompt content delivered to each sub-agent |
| Approval-ledger writes | Same `state.yaml` approval entries (all fields) |
| `state.yaml` schema and field values | No field added, removed, or renamed |

#### Scenario: Route selection identical pre- and post-refactor

- GIVEN the orchestrator evaluates identical project state and inputs before and after
  the refactor
- WHEN route-selection logic executes
- THEN `state.yaml.route.actual_route` records the same value in both cases
- AND the dispatched phase sequence is unchanged

#### Scenario: Approval-ledger entries unchanged

- GIVEN a change that produces a delivery-strategy approval-ledger entry
- WHEN the refactored orchestrator processes the same inputs
- THEN all approval entry fields (id, gate, decision, source, accepted_at, applies_to)
  are identical to the pre-refactor output
- AND no new or missing fields appear under `state.yaml.approvals`

---

### Requirement: Shared Handler Trust Boundary

Every `skills/_shared/` handler file produced by this refactor MUST contain
instruction-only prose with no executable semantics. These files extend the existing
trust-boundary treatment applied to injected skill content (see Section 12, agents
spec). Handler files MUST NOT carry YAML frontmatter with tool grants, model fields,
or agent-contract declarations. The orchestrator MUST treat their content as reference
data, not as independently executable agents or skills with runtime authority.

#### Scenario: Handler file contains only prose instructions

- GIVEN the orchestrator reads a `skills/_shared/` handler file via the `read` tool
- WHEN the file is loaded
- THEN it contains only prose instructions with no YAML frontmatter, tool grants, or
  model declarations
- AND the orchestrator treats the content as reference data with no runtime authority

---

### Requirement: Cross-Target Parity in Generated Dist

The orchestrator generated into `dist/` by `scripts/configure` MUST resolve
`skills/_shared/` handler references and produce observable behavior identical to
the agent source form. All `skills/_shared/` handler files registered in the CORE
pointer table MUST be included in the generated output tree for every supported target
(claude, github-copilot, opencode, vscode). On the claude target the orchestrator MUST
be emitted as `skills/sdd-orchestrator/SKILL.md` per Section 8.3; the `_shared/`
handler files MUST be co-located in the same generated tree so the generated skill
can read them at runtime.

#### Scenario: Generated target resolves handler file at runtime

- GIVEN `scripts/configure` has regenerated `dist/` after the refactor
- WHEN a circumstantial gate fires in a session using the generated target
- THEN the generated orchestrator reads the handler file from the generated output tree
- AND the behavioral outcome (route, phase sequence, approvals, `state.yaml` fields)
  is identical to the agent source form

#### Scenario: All handler files present in dist after regeneration

- GIVEN the refactor has been applied to source files
- WHEN `scripts/configure` runs to regenerate `dist/`
- THEN every `skills/_shared/` handler file declared in the CORE pointer table appears
  in the dist output tree
- AND no parity test comparing source behavior to generated behavior fails

---

## Cross-References

- `skills` domain spec: SKILL.md frontmatter contract, trigger/compact-rule extraction, registry inclusion
- `routing` domain spec: route table, gate hook points, 4R gate dispatch conditions
- `generator` domain spec: per-target transformation pipeline, tool-name expansion, model injection
- `hooks` domain spec: `SubagentStop` hook behavior, `skill_resolution` observability
- `skills/_shared/sdd-phase-common.md`: shared executor protocol (artifact retrieval, persistence, return envelope)
- `capability-registry` domain spec — active capability list schema and resolution contract
- `skill-registry` domain spec — `capabilities` field on cache entries
- `skills` domain spec — stack-skill tier definition; `capabilities:` frontmatter
- `skills/_shared/skill-resolver.md` — five-skill cap; injection order; `## Project Standards` block
- `project-memory` spec: canonical file-format contract, ownership table, entry structure, graceful-absence rules
- `openspec/specs/agents/spec.md` Section 5: existing two-step skill-loading pattern extended here to three steps
- `openspec/specs/assumption-ledger/spec.md`: Assumption Entry Schema, Materiality Decision Rule, State Ledger Persistence Shape, Verify Reconciliation Checklist
- `agents/sdd-orchestrator.agent.md`: existing Approval Ledger Protocol, the pattern the Assumption Ledger Protocol mirrors

---

## 6. Requirement: question_gate Recommendation Contract Compliance

Every SDD phase agent (Section 1.2, baseline `openspec/specs/agents/spec.md`)
that returns `status: blocked` with a `question_gate` (Section 4.3, 6.1) MUST
compose that `question_gate` in compliance with the `recommendation-contract`
domain spec: any option marked `recommended: true` MUST carry a `description`
covering rationale, trade-off, and reversibility, and the gate's `reason` MUST
state the cost of an incorrect or guessed decision. This requirement does not
change the envelope's field names or nesting (Section 6.1 table is unchanged);
it constrains the CONTENT of `description` and `reason` when present.

This requirement applies uniformly to every phase agent's `question_gate`
usage, including the orchestrator's own Ambient SDD Awareness gate (Section 1)
and the review-workload gate (Scenario 9.2) — no phase is exempt.

### Scenario: Phase agent's recommended option is contract-compliant

- GIVEN `sdd-tasks` returns `status: blocked` with a `question_gate` recommending "chained PRs"
- WHEN it composes the recommended option's `description`
- THEN the description states the rationale for chaining, the trade-off versus a single large PR, and whether the choice is reversible
- AND the `reason` field states the cost of proceeding with the wrong delivery strategy

### Scenario: Existing envelope shape unaffected

- GIVEN a phase agent's `question_gate` already conforms to the Section 6.1 field table (status, questions, options, reason)
- WHEN this requirement is applied
- THEN no field is added, removed, or renamed in the envelope; only the textual content of `description` and `reason` is constrained

---

## 6. Requirement: Orchestrator Intent Restatement in Change Classification

The orchestrator's Change Classification step (Section 1, referenced as part of
the CORE zone in Section 15) MUST comply with the `ambiguity-detection-boundaries`
domain spec's Intent Restatement requirement: when the original user request is
vague per that spec's criteria, the orchestrator MUST restate its interpreted
intent and validate it via `AskUserQuestion` (or target equivalent) BEFORE
performing Change Classification or route selection. This step precedes, and is
independent of, the `confidence: advisory` route-confirmation gate already
defined in the orchestrator's Route Selection procedure — a request can require
intent restatement even when route confidence later turns out to be
`deterministic`.

Because this step runs before Change Classification and route selection, it
MUST reside in the orchestrator's CORE zone (Section 15) alongside the SDD Init
Guard and Ambient SDD Awareness gate, and MUST NOT be relocated to a
circumstantial `skills/_shared/` handler.

### Scenario: Vague request restated before classification

- GIVEN a user request lacks an identifiable target module, acceptance criterion, and scope boundary (per `ambiguity-detection-boundaries`)
- WHEN the orchestrator begins processing `/sdd-new` (or equivalent)
- THEN it restates its interpreted intent and validates it via `AskUserQuestion` before calling `classifyChange`

### Scenario: Specific request — classification proceeds unchanged

- GIVEN a user request already identifies its target, acceptance criterion, and scope boundary
- WHEN the orchestrator begins processing the request
- THEN it proceeds directly to `classifyChange` exactly as in the pre-existing baseline, with no additional gate

---

## 6. Requirement: sdd-apply design-mismatch Blocker Type

The `sdd-apply` phase agent (Section 1.2) MUST support `blocker_type:
design-mismatch` as a value of the `question_gate`/`status: blocked` contract
(Section 4.3, 6.1), per the `ambiguity-detection-boundaries` domain spec:
when existing code contradicts the design during implementation, `sdd-apply`
MUST return `status: blocked` with `blocker_type: design-mismatch` instead of
improvising a workaround.

Upon receiving `blocker_type: design-mismatch`, the orchestrator MUST route the
change back to `sdd-design` (Section 1.2) before resuming `sdd-apply`, updating
`state.yaml` per Section C of `skills/_shared/sdd-phase-common.md` (top-level
`status: blocked`, blocking question/reason recorded).

This blocker type is additive alongside the existing `spec-change-required`
blocker pattern already used by `sdd-apply` (`skills/sdd-apply/SKILL.md`); it
does not replace or narrow that existing behavior — `spec-change-required`
covers a wrong/contradictory spec, while `design-mismatch` covers a design that
contradicts the actual codebase.

### Scenario: Design-mismatch routes back to sdd-design

- GIVEN `sdd-apply` finds that the design assumes a dependency that does not exist in the codebase
- WHEN `sdd-apply` returns `status: blocked` with `blocker_type: design-mismatch`
- THEN the orchestrator routes the change back to `sdd-design` and does not resume `sdd-apply` until a revised design is produced

### Scenario: spec-change-required remains a distinct blocker path

- GIVEN `sdd-apply` determines the spec itself (not the design-vs-code relationship) is wrong or impossible to verify
- WHEN it returns `blocked: spec-change-required`
- THEN this is handled as before this change and is NOT reclassified as `design-mismatch`

### Scenario: apply does not improvise around a real contradiction

- GIVEN `sdd-apply` detects that a required dependency assumed by the design does not exist in the codebase
- WHEN `sdd-apply` evaluates how to proceed
- THEN it MUST NOT invent a workaround dependency or silently reinterpret the design
- AND it MUST return `status: blocked` with `blocker_type: design-mismatch` instead

---

## 6. Requirement: blocker_type Enum Field Formalization

`blocker_type` MUST be formalized as a documented enum field in both envelope
field tables that currently describe the `status: blocked` return shape:
`openspec/specs/agents/spec.md` Section 6.1, and `skills/_shared/sdd-phase-common.md`
Section D (Return Envelope). Today `blocker_type` appears only inside JSON
examples in both documents; neither field table lists it as a formal field
with an enum of known values.

The formal field entry MUST document, at minimum, the following known values
— each already used elsewhere in this change or the pre-existing baseline —
plus any additional value a phase agent is observed to emit:

- `needs_user_decision` — a phase blocked on a clarify-style question (baseline
  example in `sdd-phase-common.md` Section D and `skills/sdd-clarify/SKILL.md`).
- `design-mismatch` — `sdd-apply` finds the codebase contradicts the design
  (added by this change; Requirement: sdd-apply design-mismatch Blocker Type,
  above).
- `spec-change-required` — the spec itself is wrong, contradictory, or
  unverifiable (pre-existing `sdd-apply` behavior per `skills/sdd-apply/SKILL.md`).
- `workload-escalation` — actual apply work overruns the tasks forecast beyond
  the safe threshold (pre-existing `sdd-apply` behavior per
  `skills/sdd-apply/SKILL.md`).

This is design/implementation guidance carried forward from the clarify phase:
`sdd-design` and `sdd-apply` for this change MUST treat the two field-table
edits above as in-scope documentation deliverables of this change, even though
no new runtime code is introduced by formalizing the field.

### Scenario: blocker_type documented as enum in both tables

- GIVEN this change is implemented
- WHEN a reader consults Section 6.1 of `openspec/specs/agents/spec.md` or
  Section D of `skills/_shared/sdd-phase-common.md`
- THEN `blocker_type` appears as a named field in the field table with an enum
  listing at least `needs_user_decision`, `design-mismatch`,
  `spec-change-required`, and `workload-escalation`

### Scenario: New blocker_type value requires table update

- GIVEN a future phase agent needs to emit a `blocker_type` value not yet
  listed in either field table
- WHEN that phase agent's change is proposed
- THEN the proposal MUST update both field tables' enum lists as part of its
  scope, keeping `agents/spec.md` Section 6.1 and `sdd-phase-common.md`
  Section D in sync

---

## 16. Reconciled Capabilities (retroactive, PRs #32/#33)

> Reconciled retroactively by `/sdd-reconcile agents` on 2026-07-03, folding
> already-shipped orchestrator behavior (window `59fbfe8..HEAD`) into this
> baseline spec. Only the portions of these capabilities that live in
> `agents/sdd-orchestrator.agent.md` are documented here; the corresponding
> `skills/` portions belong to the `skills` domain spec.

### Requirement: Orchestrator Mentorship Mode Forwarding

`openspec/config.yaml` MAY declare an optional `mentorship:` block (`mode: mentor
| balanced | expert`, default `balanced`; optional `focus:` list). The
orchestrator MUST resolve this block ONCE per session — together with the
existing strict-TDD resolution read — and cache the result for the rest of the
session.

The orchestrator MUST inject one line into EVERY phase sub-agent launch
prompt, placed next to the `Reply language` line: `Mentorship mode: {mode}`
(appending `— focus: {list}` when `focus` is declared). When the `mentorship:`
block is absent, the orchestrator MUST use `balanced` and MUST NOT ask the
user for a mode.

Per-mode prose semantics (the "Por qué así" section for `mentor`, rationale
scoped to architectural decisions for `balanced`, minimal summaries for
`expert`) are defined normatively in `skills/_shared/sdd-phase-common.md` §F
and are not restated here. Mentorship mode governs ONLY user-facing prose
(`executive_summary`, `detailed_report`, `question_gate` text) — it MUST NOT
alter persisted OpenSpec artifacts, code, identifiers, or file paths, the same
boundary already established for Reply Language Forwarding.

#### Scenario: Mentorship block absent — balanced default, no question asked

- GIVEN `openspec/config.yaml` has no `mentorship:` key
- WHEN the orchestrator composes a phase sub-agent launch prompt
- THEN it injects `Mentorship mode: balanced` next to `Reply language`
- AND it does not ask the user to choose a mode

#### Scenario: Mentorship block declared — mode and focus forwarded

- GIVEN `openspec/config.yaml` declares `mentorship: { mode: mentor, focus: [architecture] }`
- WHEN the orchestrator dispatches any phase sub-agent this session
- THEN the launch prompt includes `Mentorship mode: mentor — focus: architecture`
- AND the resolved mode is cached and reused for subsequent dispatches in the same session without re-reading the config

#### Scenario: Mentorship prose scoped to user-facing fields only

- GIVEN a phase sub-agent received `Mentorship mode: mentor` in its launch prompt
- WHEN it composes its return envelope
- THEN the expanded rationale appears only in `executive_summary`, `detailed_report`, or `question_gate` text
- AND no persisted OpenSpec artifact, code file, identifier, or file path is altered as a result of the mode

---

### Requirement: SDD Init Guard Project Scale Preset

Step 3 of the SDD Init Guard (Section titled "SDD Init Guard (MANDATORY)" in
`agents/sdd-orchestrator.agent.md`) gains a preset question that MUST run
before `sdd-init` is dispatched for a project with no existing
`openspec/config.yaml`. When no config is found and the user explicitly
invoked an SDD workflow command or clearly asked to start persisted SDD work,
the orchestrator MUST first ask the **project scale** exactly once via
`AskUserQuestion` (or the target-specific equivalent), offering three options:

- `solo` — minimal process: lite-first, no 4R by default; trade-off is less
  safety net, fully reversible via config.
- `team` (recommended default) — current defaults plus the change-collision
  gate and advisory trailers; reversible by editing `config.yaml`.
- `enterprise` — strict TDD, 4R, required traceability, and `mentorship:
  balanced`; trade-off is more per-change friction in exchange for maximum
  auditability.

After the user answers, the orchestrator MUST delegate to `sdd-init` with
`scale: {answer}` included in the sub-agent's `## Parameters` launch-prompt
block (the same injection pattern used for `target_dir`, Section 10), then
proceed with the originally requested command. This question is asked only
when `openspec/config.yaml` does not yet exist; it MUST NOT re-fire on
subsequent commands once config exists.

#### Scenario: No config yet — scale question fires once before sdd-init

- GIVEN `openspec/config.yaml` does not exist
- AND the user explicitly invokes an SDD workflow command
- WHEN the orchestrator's Init Guard evaluates Step 3
- THEN it asks the project-scale question via `AskUserQuestion` with the `solo` / `team` / `enterprise` options before delegating to `sdd-init`
- AND it passes `scale: {answer}` in `sdd-init`'s `## Parameters` block

#### Scenario: Config already exists — no scale question, Init Guard proceeds normally

- GIVEN `openspec/config.yaml` already exists with project context and testing capabilities
- WHEN the orchestrator's Init Guard evaluates Step 2
- THEN it proceeds normally without asking the project-scale question, unchanged from the pre-existing baseline

---

### Requirement: Change Collision Gate Pointer Table Entry (agents-domain portion)

The Circumstantial Handler Pointer Table (Section 15, "Orchestrator Body
Partitioning and Lazy Loading") gains one additional row for the Change
Collision Gate:

| Handler | Trigger condition | `_shared/` file | Read at (hook point) |
|---|---|---|---|
| Change Collision Gate | before dispatching `sdd-apply` AND at least one OTHER active (non-terminal) change exists | `skills/_shared/gate-change-collision.md` | At the apply guard, after the Review Workload Guard resolves |

This entry documents only the orchestrator-side dispatch trigger and pointer
resolution, per the read-once-per-route caching rule already normative in
Section 15 ("On-Demand Handler Read-Once Caching"). The gate's collision-
detection algorithm, ownership map schema, and fingerprinting logic live in
`skills/_shared/gate-change-collision.md` and are documented by the `skills`
domain spec, not here.

#### Scenario: Collision gate handler loaded via pointer table at the apply guard

- GIVEN the orchestrator is about to dispatch `sdd-apply`
- AND at least one other active (non-terminal) OpenSpec change exists
- WHEN the orchestrator resolves the apply guard using the CORE pointer table
- THEN it reads `skills/_shared/gate-change-collision.md` exactly once for this route
- AND does not re-read it on later phase or gate boundaries within the same route

#### Scenario: No other active change — gate handler not loaded

- GIVEN the orchestrator is about to dispatch `sdd-apply`
- AND no other active (non-terminal) OpenSpec change exists
- WHEN the orchestrator resolves the apply guard
- THEN it does not read `skills/_shared/gate-change-collision.md`

---

## Clarifications

### Session 2026-07-02

- Q: `promote-to-clarification`: la spec lo definió como señalización de estado (`status: promoted`) sin auto-invocar la fase sdd-clarify. ¿Señalización sola, o auto-disparo de clarify? → A: Señalización sola. `sdd-verify` MUST NOT auto-programar ni auto-invocar `sdd-clarify` como consecuencia de esta resolución; el usuario decide cuándo re-ejecutarla. (Source: AskUserQuestion, 2026-07-02.)
- Q: El esquema `{phase}-{seq}` no especifica quién asigna `seq` cuando el mismo phase corre en múltiples batches o relanzamientos, arriesgando ids duplicados. ¿Quién debe garantizar la unicidad? → A: El orchestrator asigna/renumera el `seq` final al persistir en `state.yaml`; el phase agent solo numera localmente dentro de su propio envelope. (Source: AskUserQuestion, 2026-07-02.)

### Session 2026-07-01

- Q: What concrete heuristic should the orchestrator use to decide a task is "non-trivial" and must trigger the ambient-awareness `AskUserQuestion` gate? → A: Hybrid — the task is non-trivial when EITHER (a) it touches ≥2 files, OR (b) it introduces new logic/architecture (new function, new module, or a behavior change) regardless of file count. The gate MUST NOT fire for single-file cosmetic changes: typo fixes, comment-only edits, renames, formatting-only changes, or one-line fixes that don't change behavior. Encoded as the normative threshold in the "Ambient SDD Awareness Active-Question Gate" requirement above, replacing the prior `per the threshold defined in design.md` placeholder.
- Q: A 5-file, purely cosmetic, repo-wide rename (no behavior change in any file) satisfies condition (a) — ≥2 files — on its own. Should this fire the gate, or should an all-cosmetic multi-file change be exempted even though condition (a) is met? → A: **Accepted trade-off, decided explicitly rather than resolved silently**: it MUST fire, per a strict reading of the accepted OR wording — condition (a) and condition (b) are independent triggers, and satisfying either one alone is sufficient regardless of the other. A multi-file cosmetic-only rename is treated as non-trivial and will surface the `AskUserQuestion` gate, at the cost of occasional friction on repo-wide renames/formatting sweeps. This was a deliberate choice (favoring recall over precision for the ≥2-files signal) and is not an oversight; if this proves too noisy in practice, a future carve-out (e.g. excluding renames detected via a pure git-rename similarity check) can be proposed as a follow-up change rather than reinterpreting the OR condition retroactively.

### Session 2026-06-20

- Q: How does the orchestrator determine which stack skills are relevant to a given task — is there an explicit domain field on task entries or skill frontmatter? → A: No explicit `domain:` field on task entries or skill frontmatter. The orchestrator applies semantic judgment using each candidate skill's `description` and `capabilities` frontmatter weighed against the content and intent of the current task, faithful to ECC's model. The concrete example: a task "crear formulario reactivo" leads the orchestrator to select `stack-angular` and ignore `stack-postgres` by reading their descriptions, not by a domain-field lookup.
- Q: When a single capability name resolves to more than one stack-skill entry, what is the priority order for the five-skill cap? → A: Default to deterministic registry/alphabetical order by skill `id`. With the 2–3 seed skills in v1 (one per technology) this case never occurs. A future change adding multiple skills per capability will specify an explicit precedence rule.
- Q: What is the official sdd-verify severity taxonomy and which levels are written to `known-issues.md`? → A: INFO < WARNING < BLOCKER. The official sdd-verify severity enum is {INFO, WARNING, BLOCKER} in that order. INFO is NEVER written to `known-issues.md`; only WARNING and BLOCKER are promoted. The sdd-verify contract uses the "WARNING-or-above is written" threshold.

