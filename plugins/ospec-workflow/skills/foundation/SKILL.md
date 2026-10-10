---
name: foundation
description: "Architecture foundation for a new project: discovers goals, constraints and quality drivers, then records product docs, ADRs and the IDD configuration. Trigger: new project, from scratch, define the architecture."
license: MIT
metadata:
  author: manuel-retamozo-garcia
  version: "2.0"
runtime_capabilities:
  execute: false
  mcp: true
  write: true
---

## When to Use

Run foundation before the first code of a new project, or when a project has
code but no recorded product or architecture decisions and the user asks to
define them. It decides and records. It never writes application code,
manifests, dependencies, CI files or scaffolds: the first slice is built
afterwards as an ordinary change (IDD by default, SDD on request).

## How it runs

- **Direct** (the user, the router or IDD loads this skill): ask each round
  yourself with the host's question tool; when the host has none, end your
  turn with the questions and wait for the answer.
- **Delegated** (the SDD orchestrator launches the `foundation` agent): never
  ask the user. Return `status: blocked` with a `question_gate` holding the
  round; the orchestrator asks and relaunches you with the answers. In this
  mode `openspec/config.yaml` must exist: if it is missing, return `blocked`
  with next step `sdd-init`.

Either way, write every confirmed answer to disk before asking the next
round. The documents are the state, never the conversation.

## Think like an architect

- Start from the problem, the users and the constraints, not from technology.
- Drivers decide the architecture: the three to five quality attributes that
  matter most, each as a scenario (source and stimulus, environment, response,
  measure). Use a measure only when the user gives or confirms one; never
  invent an SLA or a budget.
- Choose the simplest structure that meets the drivers. One team and one
  deployable start as a modular monolith; split into services only for a named
  driver (independent deployment or scaling, a team boundary, a fault or
  regulatory isolation boundary) and record it.
- Decide now only what blocks the first slice or is costly to reverse: system
  boundaries, data ownership (one owner per piece of data), integration style,
  trust boundaries and contract evolution. Defer the rest with an owner and a
  last responsible moment.
- Name every dependency and integration with its owner and its failure mode.

## Discovery rounds

1. Read what exists first: `docs/**`, ADRs, manifests, `idd/config.yaml`,
   `openspec/config.yaml` and the sources the user supplies. Mark each fact
   with its source.
2. Keep the knowledge map at `docs/architecture/knowledge-map.yaml`
   (`ospec-knowledge-map/v1`). Each slot (business, functional, team, quality,
   architecture, technology, operation, delivery) is `unknown`, `confirmed`
   (with its source), `assumed` (with its source and what would change it),
   `n/a` (with why it does not apply) or `deferred` (with an owner), and names
   the decisions it feeds. `unknown` is not `n/a`. A quality scenario states
   origin, stimulus, environment, artifact and response; add a measure only
   when the user gives one, and record who gave it.
3. Take the round from `ospec foundation next`. When the map does not exist
   yet, pass `--profile` and write the returned `template` to
   `docs/architecture/knowledge-map.yaml` before recording: `next` does not
   create the file. Ask only the slots in that round, in that order, all in
   the returned theme. The engine returns at most four questions per round.
   Phrase each question for this project. Offer a
   recommended answer aimed at `recommendation.unblocks`, plus "I don't know".
   Record each answer with `ospec foundation record` before asking for the
   next round. "I don't know" is `--state assumed` with a source and a
   `--review-trigger`. Do not ask a slot the engine omitted.
4. Stop when `foundation next` returns an empty round, or earlier when every
   slot that blocks the first slice is confirmed, assumed or deferred with an
   owner. The whole future need not be settled.

## Outputs

Read each file before writing and update it; never discard what the user wrote.

| File | Content |
| --- | --- |
| `docs/product/brief.md` | Problem, users, goals, success measures, non-goals |
| `docs/product/functional-scope.md` | Actors, journeys, first slice, exclusions |
| `docs/product/glossary.md` | Domain terms |
| `docs/architecture/technical-baseline.md` | Context and boundaries, components and data ownership, integrations, quality scenarios, constraints, test strategy by risk, technology record |
| `docs/architecture/decisions/NNNN-<title>.md` | One ADR per structural decision |
| `docs/roadmap.md` | The first slice as a walking skeleton, then milestones; deferred decisions with their last responsible moment |
| `docs/architecture/knowledge-map.yaml` | The knowledge map and its open gaps |

Every ADR holds its context and drivers, at least two considered options, the
decision, its consequences (including what gets harder), a fitness function or
check that would detect a violation, and a review trigger. Its decision names
no product or library: technology choices go to the technology record, each
implementing an ADR and justified by team context, maturity, license and
cost. Never rewrite an accepted ADR: supersede it with a new one.

The test strategy names what each layer protects: unit tests for domain
rules, validation and transformations; integration or contract tests for
boundaries and data access; measurements for performance drivers. It sets no
coverage percentage.

## Hand-off to IDD

Finish with the configuration that lets the first change derive the right
obligations. Propose it to the user and write `idd/config.yaml` only after
explicit approval, preserving its other keys:

- `checks:` the commands that prove a change (tests, lint, typecheck), which
  run once the scaffold exists;
- `strict_tdd:` from the testing bar the user chose;
- `impact:` the paths of public contracts, persistent data and security
  boundaries in the chosen layout, plus `stack:` when services keep their
  manifests below the root;
- `contracts.documents:` where contract documents (OpenAPI, proto, schemas)
  live.

IDD reads `docs/architecture/decisions/` at its `adr-amend-or-contradict`
gate, so a later change that departs from an ADR stops for the user. When the
project uses SDD, also update `openspec/config.yaml` as
`references/foundation-details.md` describes.

## Source documents

Read text and Markdown sources directly. For PDF, Office or other binary
documents, use an available MarkItDown `convert_to_markdown` MCP tool, whatever
its server prefix; keep the original under `docs/references/raw/` and the
converted text under `docs/references/processed/` with its source, the useful
facts, the noise removed and the open questions. Without such a tool, never
install or register a server yourself: ask the user to paste or convert the
document, or skip it. A failed conversion skips only that document.

## Federated workspace

Delegated with `workspace_yaml` (the atlas `openspec/workspace.yaml`) and
`parent_change`, read each initialized member's
`{member}/openspec/specs/**/spec.md` and `{member}/docs/roadmap.md`, then:

- consolidate the members' milestones into `docs/roadmap.md`, by member;
- add to `technical-baseline.md` the section
  **"Mapa de Contratos e Interacciones"**: the contracts each member
  `provides` and their `consumers`;
- catalog in `docs/roadmap-gaps.md` the functional gaps (scope no member
  covers) and the technical gaps (deviations from
  `docs/architecture/shared-baseline.md`, provider and consumer mismatches).

Unresolved gaps block: return a `question_gate` whose options include
assigning the capability to a member, deferring it, or creating a member. The
orchestrator records the resolution (`skills/_shared/gaps-resolution.md`) and
relaunches you to finish both roadmaps.

## Result

Direct: summarize the decisions, the ADRs written, the open gaps and the first
slice, and recommend building that slice as an IDD change. Delegated: return
`status`, `executive_summary`, `artifacts`, `next_recommended` (`sdd-new` for
the first slice; never continue into other phases), `risks`,
`open_questions` and `skill_resolution`, plus the `question_gate` when
blocked.
