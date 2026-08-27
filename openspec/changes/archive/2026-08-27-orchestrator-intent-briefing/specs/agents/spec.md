# Delta for agents

## ADDED Requirements

### Requirement: Intent Briefing Owned by the Human Thread {#REQ-agents-019}

The intent-briefing gate (CORE-zone Intent Restatement, Section 15) MUST be owned
by the orchestrator main thread. The orchestrator MUST synthesize the briefing and
MUST ask the user in that thread. It MUST NOT delegate the briefing question, the
acceptance decision, or self-approval to a sub-agent.

The orchestrator MAY read context inline or MAY delegate a read-only explore. After
any such read, the orchestrator itself MUST synthesize and ask. It MUST NOT treat a
specific or complete request as implicit acceptance.

This obligation is human projection of existing CORE behavior. It MUST NOT introduce
a new phase agent, `sdd-brief` command, or kernel authority surface.

#### Scenario: Orchestrator asks in the main thread

- GIVEN an eligible `/sdd-new`, `/sdd-ff`, `/sdd-lite`, or equivalent request
- WHEN the orchestrator presents the intent briefing
- THEN the question MUST be asked from the orchestrator main thread
- AND no sub-agent MUST present the briefing or collect acceptance

#### Scenario: Read-only explore does not own the ask

- GIVEN the orchestrator needs extra repository context before synthesizing
- WHEN it delegates a read-only explore (or reads inline)
- THEN it MUST synthesize the briefing itself after that read
- AND the explore sub-agent MUST NOT ask the user to accept the intent

#### Scenario: No self-approval of a specific request

- GIVEN a user request that already names target, acceptance criterion, and scope
- WHEN the orchestrator evaluates whether to skip asking
- THEN it MUST still present the briefing and wait for explicit user acceptance
- AND it MUST NOT record acceptance from its own restatement

### Requirement: Persist Accepted Intent Before Classification {#REQ-agents-020}

After the user accepts an intent briefing, the orchestrator MUST persist the agreed
intent in `openspec/changes/{change-name}/state.yaml` BEFORE calling `classifyChange`
or selecting a route. Persistence MUST be an approval-ledger entry:

| Field | Requirement |
|---|---|
| `gate` | MUST be `intent-briefing` |
| `decision` | MUST be `accepted` |
| `source` | MUST be a valid approval-ledger source (`vscode/askQuestions` or the target equivalent already persisted in `state.yaml`) |
| `synthesis` | MUST contain the agreed functional restatement |
| `scope` | MUST contain the agreed in-scope / out-of-scope boundary |
| `applies_to` | MUST include `change-classification` |

The orchestrator MUST NOT infer this approval from conversation memory. Abort MUST
NOT create the change directory and MUST NOT write this entry.

This step remains independent of the `confidence: advisory` route-confirmation gate:
a persisted intent briefing MUST NOT be treated as route confirmation.

#### Scenario: Accepted briefing writes the ledger then classifies

- GIVEN the user has accepted the intent briefing
- WHEN the orchestrator proceeds
- THEN `state.yaml` MUST contain an `approvals` entry with `gate: intent-briefing` and `decision: accepted` including `synthesis` and `scope`
- AND `classifyChange` MUST run only after that entry exists

#### Scenario: Abort writes no ledger and does not classify

- GIVEN the intent-briefing gate has fired
- WHEN the user aborts
- THEN the orchestrator MUST NOT create `openspec/changes/{name}/state.yaml`
- AND it MUST NOT call `classifyChange`

#### Scenario: Briefing acceptance is not route confirmation

- GIVEN the user has accepted the intent briefing and the ledger entry is persisted
- WHEN route selection later returns `confidence: advisory`
- THEN the orchestrator MUST still apply the existing advisory route-confirmation gate
- AND the `intent-briefing` approval MUST NOT substitute for that gate

## MODIFIED Requirements

### Requirement: Orchestrator Intent Restatement in Change Classification

The orchestrator's Change Classification step (Section 1, referenced as part of
the CORE zone in Section 15) MUST comply with the `ambiguity-detection-boundaries`
domain spec's Intent Restatement requirement: for every eligible `/sdd-new`,
`/sdd-ff`, `/sdd-lite`, or equivalent natural-language request — whether vague or
specific — the orchestrator MUST present a functional intent briefing and validate
it via `AskUserQuestion` (or target equivalent) BEFORE performing Change
Classification or route selection. This step precedes, and is independent of, the
`confidence: advisory` route-confirmation gate already defined in the
orchestrator's Route Selection procedure — a request can require intent briefing
even when route confidence later turns out to be `deterministic`.

Because this step runs before Change Classification and route selection, it
MUST reside in the orchestrator's CORE zone (Section 15) alongside the SDD Init
Guard and Ambient SDD Awareness gate, and MUST NOT be relocated to a
circumstantial `skills/_shared/` handler.
(Previously: only vague requests were restated; specific requests skipped to
`classifyChange` with no additional gate.)

#### Scenario: Vague request restated before classification

- GIVEN a user request lacks an identifiable target module, acceptance criterion, and scope boundary (per `ambiguity-detection-boundaries`)
- WHEN the orchestrator begins processing `/sdd-new` (or equivalent)
- THEN it presents a functional intent briefing and validates it via `AskUserQuestion` before calling `classifyChange`

#### Scenario: Specific request — briefing still required before classification

- GIVEN a user request already identifies its target, acceptance criterion, and scope boundary
- WHEN the orchestrator begins processing `/sdd-new`, `/sdd-ff`, `/sdd-lite`, or an equivalent request
- THEN it presents a functional intent briefing and validates it via `AskUserQuestion` before calling `classifyChange`
- AND it MUST NOT proceed directly to `classifyChange` without that gate
