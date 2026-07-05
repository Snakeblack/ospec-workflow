# Delta for sdd-document

## MODIFIED Requirements

### Requirement: Interactive Launch Gate and Scope Selection {#REQ-sdd-document-002}

The `sdd-document` agent MUST block launch at startup by returning `status: blocked`
with a `question_gate` payload to present the user with a choice of documentation
scope options:
- Option A: Full Technical Wiki (OpenWiki style)
- Option B: Lightweight wiki under `docs/wiki/`
- Option C: Custom freeform path

The scope-choice question MUST be batched together with the language-selection
question (see the batched gate requirement below) into ONE `question_gate` payload
containing two independent questions, presented via a single `vscode/askQuestions`
call — never as two separate blocking round-trips.

If Option C is selected, the agent MUST validate the user-provided custom output
directory and block with a clarification request if the path is fuzzy, invalid, or
missing.

The agent MUST enforce a write sandbox: all file writes are strictly restricted to
the approved output directory, with the sole exception of the repository's top-level
`/AGENTS.md` and `/CLAUDE.md` files (and only to append or update the OpenWiki
reference section). If the agent's own write plan would target a file outside the
approved path (and not matching the `/AGENTS.md` or `/CLAUDE.md` exception), it MUST
halt execution and return `status: blocked` with `blocker_type: design-mismatch`
before performing that write.

The agent's own pre-write self-check is NOT sufficient evidence of overall sandbox
compliance and MUST NOT be presented as such: the authoritative, independent
verification that no write landed outside the approved sandbox is an
orchestrator-owned post-run step (see `openspec/specs/agents/spec.md`, Orchestrator-
Owned Post-Run Sandbox Inventory Verification). The agent MUST NOT self-certify
sandbox compliance in its return envelope as a substitute for that orchestrator check.

(Previously: scope-choice gate was presented independently, without a batching
requirement, and the write-sandbox paragraph did not address the executor/
orchestrator verification split.)

#### Scenario: Agent blocks on startup for option choice

- GIVEN the `sdd-document` agent starts execution
- WHEN no scope choice has been approved/recorded
- THEN it MUST return `status: blocked` with a `question_gate` containing Options A,
  B, and C
- AND the orchestrator MUST present the question gate to the user

#### Scenario: Selection of Option C with valid path

- GIVEN the user selects Option C and provides a valid path `/docs/my-wiki/`
- WHEN the agent resumes execution
- THEN the agent validates the path and proceeds with generating documentation in
  `/docs/my-wiki/`

#### Scenario: Selection of Option C with fuzzy path

- GIVEN the user selects Option C and provides a fuzzy or invalid path
- WHEN the agent validates the input path
- THEN it MUST return `status: blocked` with a `question_gate` prompting the user to
  clarify the path

#### Scenario: Write sandbox violation

- GIVEN the agent has approved output directory
- WHEN a write operation targets a file outside the approved directory (other than
  `/AGENTS.md` or `/CLAUDE.md` for the OpenWiki reference section)
- THEN the agent MUST halt execution and return `status: blocked` with
  `blocker_type: design-mismatch`

#### Scenario: Agent does not self-certify sandbox compliance

- GIVEN the `sdd-document` agent completes a run with no self-detected sandbox
  violation
- WHEN it composes its return envelope
- THEN it MUST NOT claim final, authoritative sandbox compliance in place of the
  orchestrator's independent post-run inventory check
- AND the orchestrator still performs that check before closing the route

---

### Requirement: Batched Language and Scope Selection Gate {#REQ-sdd-document-006}

The `sdd-document` agent MUST present language selection and scope selection as ONE
batched `question_gate` — two independent questions delivered in a single
`vscode/askQuestions` call — rather than as two separate blocking round-trips. The
gate determines the language for all generated wiki content and all subsequent
interaction prompts, and the documentation scope (Options A/B/C, per the launch-gate
requirement above).

In **init mode** (no persisted `.last-update.json`, or the persisted metadata lacks
`doc_language`/`scope_choice`), the agent MUST ask both questions together at
startup. The language question MUST offer at minimum English (recommended) and
Spanish, with freeform input allowed.

In **update mode**, when the persisted `.last-update.json` already carries values for
both `doc_language` and `scope_choice`, the agent MUST skip both gates and reuse the
persisted values without asking. An explicit parameter override — `doc_language` or
`scope_choice` passed explicitly in the launch parameters — MUST force re-asking only
the overridden question, even in update mode.

To give the user an actual, user-facing path to this override, the agent MUST present
a short yes/no pre-question at the start of every update-mode run — before checking
for an explicit parameter override — asking whether to keep the persisted
`doc_language`/`scope_choice` or change them ("Keep previous documentation language
and scope, or change them?"). If the user answers to keep them, the agent proceeds
using the persisted values without further asking. If the user answers to change
them, the agent MUST treat that as the explicit parameter override for only the
field(s) the user selects to change, and re-ask only the corresponding question(s)
(language, scope, or both), reusing the persisted value for any field not selected
for change.

Once resolved (by answer or by reuse from persisted metadata), all subsequent gates
and generated content MUST use the resolved language and scope.

(Previously: language selection was a standalone gate required to run FIRST before
any other question, asked independently of the scope-choice gate, with no persisted
skip-in-update behavior.)

#### Scenario: Init mode — batched gate asks both questions together

- GIVEN the `sdd-document` agent starts execution with no persisted
  `.last-update.json`
- WHEN it composes its launch gate
- THEN it MUST return `status: blocked` with ONE `question_gate` containing both the
  language question (English recommended) and the scope-choice question (Options A,
  B, C)
- AND both questions are delivered via a single `vscode/askQuestions` call

#### Scenario: Update mode — gate skipped when metadata already resolved

- GIVEN `.last-update.json` already contains `doc_language: "en"` and
  `scope_choice: "A"`
- AND no explicit parameter override is passed
- AND the user answered the keep/change pre-question with "keep"
- WHEN the agent starts execution in update mode
- THEN it MUST skip the batched gate entirely and reuse the persisted `doc_language`
  and `scope_choice` values

#### Scenario: Explicit parameter override re-asks only that question

- GIVEN `.last-update.json` already contains `doc_language` and `scope_choice`
- AND the user answered the keep/change pre-question with "change" for language only
  (equivalent to an explicit `doc_language` override in the launch parameters)
- WHEN the agent starts execution in update mode
- THEN it MUST re-ask only the language question, reusing the persisted
  `scope_choice` without re-asking it

#### Scenario: Language propagates to all output

- GIVEN the user selects Spanish as the documentation language
- WHEN the generation completes
- THEN all wiki content MUST be written in Spanish
- AND all subsequent gate prompts MUST be presented in Spanish

---

### Requirement: `.last-update.json` Metadata {#REQ-sdd-document-011}

After all wiki files are written, the agent MUST generate (or update) a
`.last-update.json` metadata file in the output directory root containing:
`updatedAt` (ISO-8601 UTC), `command` (init/update), `gitHead` (current HEAD short
commit hash), `generator` (sdd-document), `version`, `sections` (list of generated
page paths), `stats` (filesGenerated, filesUpdated, filesSkipped), `doc_language`
(the resolved language code from the batched gate), and `scope_choice` (the resolved
scope option, `A`/`B`/`C`).

The `doc_language` and `scope_choice` fields exist so that a subsequent update-mode
run can skip the batched gate (per the Batched Language and Scope Selection Gate
requirement above) by reading these persisted values instead of re-asking.

(Previously: the metadata schema did not carry `doc_language` or `scope_choice`,
because the batched-gate skip-in-update behavior did not exist.)

#### Scenario: Metadata file generated on init

- GIVEN the agent completes an init run
- WHEN writing the `.last-update.json`
- THEN `command` MUST be `init`
- AND `gitHead` MUST match the current `git rev-parse --short HEAD`

#### Scenario: Metadata carries doc_language and scope_choice

- GIVEN the agent completes any run (init or update)
- WHEN writing the `.last-update.json`
- THEN it MUST include `doc_language` and `scope_choice` reflecting the values
  resolved for that run

#### Scenario: Update-mode run reads persisted fields to skip the gate

- GIVEN `.last-update.json` from a prior run contains `doc_language` and
  `scope_choice`
- WHEN a later update-mode run starts with no explicit parameter override
- THEN it reads those persisted fields and skips the batched gate, per the Batched
  Language and Scope Selection Gate requirement

## Clarifications

### Session 2026-07-05

- Q: REQ-sdd-document-006 lets the orchestrator force a re-ask via an "explicit parameter override" in update mode, but no command surface (argument-hint, flag) currently exists for the user to request this. Should route-document.md add a lightweight pre-question in update mode ("keep previous language/scope or change them?"), or leave the override purely as an internal/non-interactive parameter with no user-facing trigger in this change? → A: Add a short yes/no pre-question at the start of update-mode runs ("Keep previous documentation language and scope, or change them?"); answering "change" triggers the override for the selected field(s) only.
