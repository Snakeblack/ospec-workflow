# Delta for agents

## ADDED Requirements

### Requirement: Orchestrator-Owned Post-Run Content QA for sdd-document {#REQ-agents-018}

After the `sdd-document` agent returns `status: success` (following any number of
`blocked`/resume cycles), the orchestrator MUST perform an independent post-run
CONTENT quality assurance pass before considering the `/sdd-document` route
complete — the content sibling of the sandbox inventory check
(Orchestrator-Owned Post-Run Sandbox Inventory Verification for sdd-document,
REQ-agents-006). The QA pass MUST cover the wiki pages produced or updated by
the run (under the approved output directory/directories resolved as in
REQ-agents-006) and MUST combine:

1. A readability review of the touched pages (structure, clarity, duplication, stub detection).
2. A factual spot-check contrasting a sample of published figures and identifiers against the repository.

The QA pass MUST be delegated to a reviewer DISTINCT from the generator execution
that produced the content — a dispatch MUST NOT review its own output. The
generator's self-report MUST NOT be treated as sufficient evidence of content
quality.

If the QA pass finds a confirmed factual error or a severe content defect in the
touched pages, the orchestrator MUST halt and surface a `question_gate`
describing the findings before closing the route. The gate MUST offer exactly two
options: "Re-dispatch the generator to correct the affected pages" (the default/
recommended option) and "Acknowledge and close the route anyway (accepted risk)".
The orchestrator MUST NOT close the route without an explicit user choice between
these two options.

The orchestrator MUST document every QA pass in `state.yaml` under
`gates.content-qa` (at minimum `status`: `pass` | `findings`, plus a short
`summary`), so the route never closes as success without a documented independent
QA pass.

#### Scenario: Clean QA — route closes silently

- GIVEN `sdd-document` returned `status: success` and the QA pass reports no confirmed defects
- WHEN the orchestrator evaluates the QA outcome
- THEN it records `gates.content-qa` with status `pass`
- AND it closes the route without additional user interaction

#### Scenario: Confirmed factual error halts route closure

- GIVEN the QA spot-check confirms a published figure contradicting the repository
- WHEN the orchestrator evaluates the QA outcome
- THEN it MUST halt and present a `question_gate` describing the finding before closing the route
- AND the gate MUST offer exactly "Re-dispatch the generator to correct the affected pages" (default) and "Acknowledge and close the route anyway (accepted risk)"

#### Scenario: Reviewer is distinct from the generator

- GIVEN the generator dispatch completed successfully
- WHEN the orchestrator selects the QA reviewer
- THEN the reviewer MUST be a delegation distinct from the generator execution that produced the content
- AND the generator's own quality claims MUST NOT satisfy this requirement by themselves

#### Scenario: No QA record — route cannot close as success

- GIVEN a `/sdd-document` route reaches closure
- WHEN no `gates.content-qa` record exists for the run
- THEN the route MUST NOT close as success until the QA pass runs and its outcome is documented
