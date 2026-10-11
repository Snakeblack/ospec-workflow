# Foundation Details

Read on demand while writing the outputs of `skills/foundation/SKILL.md`.
Foundation captures agreed intent where there is not enough code to detect;
`sdd-init` detects what exists. Neither replaces the other.

## Document rules

- Lead with the decision or the current truth; keep each document short
  enough to scan.
- Use tables for decisions, constraints, scenarios and open questions.
- Never bury an unknown: record the slot as `unknown` in
  `docs/architecture/knowledge-map.yaml`, with the question that would settle it.
  `n/a` is a different state and needs a reason.
- Processed references (`docs/references/processed/`) name their source file,
  the useful facts, the noise removed, the assumptions and the open questions.

## ADR template

`docs/architecture/decisions/NNNN-<kebab-title>.md`, numbered in order:

```markdown
# NNNN. <Decision title>

- Status: inferred | proposed | accepted | superseded by NNNN
- Date: YYYY-MM-DD
- Evidence: path:line, path:line   (required while inferred; kept once accepted)

## Context and drivers
The forces at play and the quality scenarios or constraints this decision serves.
Cite at least one driver id, as `scenario:<id>`, `constraint:<id>` or `assumption:<id>`.

## Options considered
1. <Option A>: what it gives, what it costs.
2. <Option B>: what it gives, what it costs.

## Decision
The structural choice, without naming products or libraries.

## Consequences
What gets easier, what gets harder, what is now forbidden.

## Fitness function
The check (test, rule, measurement or review item) that detects a violation.

## Review trigger
The fact that would reopen this decision.
```

Keep these headings and items as written: the decision-record lint parses
this shape (`parseAdrMarkdown`). Only a backticked driver id counts as a
driver.

## Technology record template

Foundation still writes this content in the **Technology record** section of
`docs/architecture/technical-baseline.md`. The model location of a TSR file is
`docs/architecture/technology/NNNN-<kebab-title>.md`; do not switch foundation
to that path.

```markdown
# NNNN. <Technology choice>

- Status: proposed | accepted | superseded by NNNN
- Date: YYYY-MM-DD
- Implements: NNNN (one or more architecture ADRs)

## Alternatives
1. <Candidate, including what the team already has>: why it fits or fails.
2. <Another candidate>: why it fits or fails.

## Sources
- YYYY-MM-DD — <source consulted, with enough detail to find it again>
```

A TSR that implements no ADR, or that has no source dated `YYYY-MM-DD`, is a
lint warning. The record stays valid.

## Change decision template

A development decision (`kind: dc`) stays in the living document of the
change: `design.md` when the project uses SDD, and the Decisions section of
`idd/<change>/change.md` otherwise. Foundation does not write one during
discovery. Filing it as an ADR (`kind: dc` classified as `adr`) is a lint
warning.

```markdown
## Decision: <short title>

Kind: dc

<What this change decided, including what was deferred.>
```

## Technical baseline skeleton

```markdown
# Technical baseline

## Context and boundaries     (actors, external systems, what is out of scope)
## Components and data         (each component, the data it owns, who may write it)
## Integrations                (dependency, owner, protocol, failure mode)
## Quality scenarios           (attribute | stimulus | response | measure | priority)
## Constraints                 (source of each constraint)
## Test strategy               (what unit, integration/contract and measurement each protect)
## Technology record           (choice | implements ADR | alternatives | why: team, maturity, license, cost | dated source)
```

## IDD configuration example

Proposed to the user and written only after approval; keep every key already
present.

```yaml
checks:
  test: npm test
  lint: npm run lint
strict_tdd: false
contracts:
  documents:
    - api/openapi.yaml
impact:
  stack: [node, jvm]          # only when services keep manifests below the root
  public_contract:
    - services/*/src/api/**
  persistent_data:
    - services/*/db/migrations/**
  security_boundary:
    - services/*/src/auth/**
```

## OpenSpec configuration (SDD projects only)

Update `openspec/config.yaml` conservatively:

```yaml
project:
  status: foundation-defined
  stack:
    languages: [...]
    frameworks: [...]
    package_managers: [...]
    architecture: "..."
  commands:
    install: [...]
    build: [...]
    test: [...]
    lint: [...]
    typecheck: [...]

foundation:
  product_brief: docs/product/brief.md
  functional_scope: docs/product/functional-scope.md
  technical_baseline: docs/architecture/technical-baseline.md
  decisions: docs/architecture/decisions/
  roadmap: docs/roadmap.md
  open_questions: [...]

rules:
  foundation:
    - Ask at most four questions per round, each with a recommended answer.
    - Do not generate application code before the scaffold is approved.
```

A command that cannot run until the scaffold exists is recorded as intent;
its verification stays unavailable until then.
