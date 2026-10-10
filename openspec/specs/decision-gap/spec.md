# Decision Gap Engine

## Purpose

`ospec foundation next` chooses the next discovery round from a knowledge map.
`ospec foundation record` persists one answer into that map. The engine ranks
gaps; it does not write question prose. The finished-map rules in
`openspec/specs/knowledge-map/spec.md` stay as they are: a draft may still
leave a mandatory slot `unknown`, and `validateKnowledgeMap` still rejects
that draft.

The on-disk map is JSON text at `docs/architecture/knowledge-map.yaml`, which
is valid YAML 1.2, the same convention as IDD `state.yaml`. There is no YAML
parser.

## Requirements

### Requirement: Ranked Round From One Dimension {#REQ-decision-gap-001}

`foundation next` MUST score each catalog slot as
`impact × uncertainty × irreversibility × profile weight`. Impact is the
number of that slot's catalog decisions that still have at least one
unanswered feeding slot. A slot is unanswered when it is missing or `unknown`.
Uncertainty is 1 when the slot is unanswered and 0 otherwise. Irreversibility
is 1. Profile weight is 2 when the slot is mandatory for the map's profile
and 1 otherwise. A slot with priority 0 MUST be omitted. Equal priorities
MUST keep catalog order.

The round MUST contain only slots from the dimension of the highest-priority
slot, at most four, and MUST NOT fill the round from another dimension. Each
item MUST name its id, dimension, whether it is mandatory, its priority, the
pending decisions it feeds, and a recommendation whose `unblocks` list is
those decisions and whose `if_unknown` is `assumed`. The engine MUST NOT emit
question prose. An empty gap set MUST return `theme: null` and an empty round.

#### Scenario: Three profiles do not share one sequence

- GIVEN no knowledge map and the profiles `prototype`, `product` and `regulated`
- WHEN each profile is walked by answering every returned round before asking again
- THEN the three sequences of rounds MUST differ
- AND `prototype` MUST start with only `quality.drivers`
- AND `product` and `regulated` MUST start with `business.constraints`, `business.problem` and `business.goals`

#### Scenario: A round stays inside one dimension

- GIVEN a map whose highest gap is in a dimension that has more than four unanswered slots
- WHEN `foundation next` runs
- THEN the round MUST contain at most four slots
- AND every slot MUST share that dimension

### Requirement: Resume Does Not Repeat An Answer {#REQ-decision-gap-002}

A slot whose state is `confirmed`, `assumed`, `n/a` or `deferred` MUST NOT
appear in a later round. `foundation record` MUST be able to store each of
those states with the fields the knowledge-map schema requires for it.
Recording the same slot content again MUST NOT rewrite the file.

#### Scenario: An answered slot leaves the round

- GIVEN a `prototype` map whose first round is `quality.drivers`
- WHEN that slot is recorded as `confirmed` with a source
- THEN the next round MUST NOT include `quality.drivers`

#### Scenario: A repeated record does not write

- GIVEN a slot just recorded
- WHEN the same record runs again
- THEN `changed` MUST be false
- AND the file bytes MUST be unchanged

### Requirement: Missing Map Is Computed And Not Written {#REQ-decision-gap-003}

When `docs/architecture/knowledge-map.yaml` is missing, `foundation next
--profile` MUST score every catalog slot as `unknown`, MUST return that blank
map as `template`, and MUST NOT create the file. Without `--profile` it MUST
refuse. `foundation record` MUST refuse with `map-missing` until the file
exists. `--map` MAY name another file. A `--profile` that disagrees with an
existing map MUST be refused.

#### Scenario: Next without a file writes nothing

- GIVEN no knowledge map
- WHEN `foundation next --profile prototype` runs
- THEN the command MUST succeed with `exists: false` and a template
- AND no knowledge-map file MUST exist afterwards

#### Scenario: Record without a file is refused

- GIVEN no knowledge map
- WHEN `foundation record` runs
- THEN the command MUST refuse with `map-missing`
- AND no file MUST be created

### Requirement: Drafts Do Not Weaken The Finished Map {#REQ-decision-gap-004}

`foundation next` and `foundation record` MUST accept a map whose mandatory
slots are still `unknown` or missing. They MUST still reject a map that fails
the knowledge-map schema or catalog for any other reason. `validateKnowledgeMap`
MUST keep rejecting a mandatory slot left `unknown`.

The catalog `schemas/foundation/knowledge-map/catalog.json` and the schema
`schemas/foundation/knowledge-map/v1.schema.json` MUST be part of the runtime
copied for an installed `ospec` CLI, because the engine reads them from disk.

#### Scenario: A mandatory unknown slot is a draft, not a finished map

- GIVEN a map that leaves a mandatory slot `unknown`
- WHEN `foundation next` reads it
- THEN the command MUST succeed
- AND `validateKnowledgeMap` MUST still reject that map
