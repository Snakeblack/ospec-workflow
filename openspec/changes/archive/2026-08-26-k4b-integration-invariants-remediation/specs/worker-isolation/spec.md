# Delta for worker-isolation

## MODIFIED Requirements

### Requirement: Minimal Work-Order Capsule Materialization {#REQ-worker-isolation-002}

The execution runtime MUST provide `MaterializeSourceSnapshot` to construct a minimal execution capsule. The primitive MUST consume DAG `dependencies` as SHA-256 WorkOrder IDs (`sha256:...`) and project files strictly from the WorkOrder's `capsule_inputs: string[]` manifest. `MaterializeSourceSnapshot` MUST look up the workspace exclusively in the private internal registry and MUST fail closed if the workspace is not registered. It MUST compute a deterministic SHA-256 `fingerprint` over declared inputs, and store authentic baseline file contents in the workspace record for subsequent unified diff generation.

When a caller-supplied derived file map is present (generic `effectiveBase.files` plus matching `tree_digest`), materialization MUST write exactly the intersection of that map with `capsule_inputs`. Paths in the derived map that are not in `capsule_inputs` MUST NOT be written. A declared `capsule_input` absent from the derived map (or from the SourceSnapshot projection when no derived map is supplied) MUST fail closed. The primitive MUST NOT dump the full derived map. K6a MUST remain Repair-agnostic: it MUST NOT import K4b modules or name Repair `EffectiveShadowBase` as a domain type.
(Previously: Materialization projected capsule_inputs from SourceSnapshot, but a derived file map copied every derived path and ignored the capsule intersection.)

#### Scenario: Materialize canonical snapshot decoupled from DAG dependency IDs

- GIVEN a canonical WorkOrder v2 declaring SHA-256 DAG dependencies and a canonical SourceSnapshot v1
- WHEN `MaterializeSourceSnapshot` is invoked with explicit capsule inputs
- THEN only declared capsule input files MUST be materialized in the workspace
- AND extraneous repository files outside declared inputs MUST NOT be present

#### Scenario: Deterministic capsule fingerprint across identical inputs

- GIVEN two independent materialization requests with identical source snapshot content and capsule inputs
- WHEN `MaterializeSourceSnapshot` produces their capsule descriptors
- THEN both descriptors MUST yield identical `fingerprint` digest values

#### Scenario: Materialization fails closed for unrecorded workspace

- GIVEN a workspace descriptor not tracked in the private workspace registry
- WHEN `MaterializeSourceSnapshot` is invoked
- THEN it MUST throw an error and refuse materialization without accessing fallback paths

#### Scenario: Baseline file content preserved for diffing

- GIVEN valid capsule inputs materialized into a tracked workspace
- WHEN `MaterializeSourceSnapshot` completes
- THEN the internal workspace record MUST retain baseline file contents alongside baseline inventory

#### Scenario: Derived file map is intersected with capsule_inputs

- GIVEN a derived file map containing `src/app.js` and `README.md`, and WorkOrder `capsule_inputs: ["src/app.js"]`
- WHEN `MaterializeSourceSnapshot` is invoked with that derived map
- THEN `src/app.js` MUST be written into the workspace
- AND `README.md` MUST NOT be written

#### Scenario: Capsule input missing from the derived map fails closed

- GIVEN WorkOrder `capsule_inputs` including `lib/absent.js` that is not present in the derived file map
- WHEN `MaterializeSourceSnapshot` is invoked with that derived map
- THEN it MUST fail closed
- AND MUST NOT dispatch worker execution from that workspace
