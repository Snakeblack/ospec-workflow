# worker-isolation Specification

## Purpose

Define the workspace primitives that remain after E1.5 (v2.97.0) retired the
K6a worker executor and sandbox: workspace lifecycle and capsule
materialization (`scripts/lib/worker-workspace.js`, frozen), allowed-path
containment (`scripts/lib/allowed-paths-validator.js`, shipped through the
Execution Graph) and the CandidateId boundary of their schemas.

## Threat Model

The `worker-isolation` specification defines a runtime execution-integrity boundary for conforming OSPEC worker execution. It does not define a hostile-code security sandbox.

A conforming runtime MUST enforce the controls defined by this specification, but is not required to contain arbitrary hostile native code, runtime exploitation, host compromise, or kernel-level attacks.

## Requirements

### Requirement: Workspace Lifecycle Primitives {#REQ-worker-isolation-001}

The execution runtime MUST provide `CreateWorkspace` and `DisposeWorkspace` primitives backed by a private internal workspace registry. `CreateWorkspace` MUST allocate an isolated workspace directory, generate a unique `workspace_id` exclusively using a runtime-internal UUID, capture the initial `baseline_inventory`, and return a `workspace-descriptor/v1` payload declaring `workspace_id`, `root_path`, `source_snapshot_id`, and status `active`. The registry MUST be encapsulated and immutable from external callers. `DisposeWorkspace` MUST look up and remove the workspace directory solely through the private internal registry; if the workspace is not tracked in the registry, it MUST fail closed without attempting filesystem operations on caller-provided paths.
(Previously: Workspace ID could be supplied by the caller and disposal did not enforce strict registry encapsulation.)

#### Scenario: Provision fresh isolated workspace with internal UUID
- GIVEN a valid `source_snapshot_id` and optional workspace options
- WHEN `CreateWorkspace` is invoked
- THEN it MUST assign an internally generated UUID `workspace_id`
- AND MUST track the allocated directory in the private workspace registry with status `active`

#### Scenario: Caller-supplied workspace_id is ignored
- GIVEN workspace creation options containing a custom `workspace_id`
- WHEN `CreateWorkspace` is invoked
- THEN it MUST ignore the custom ID and generate an internal UUID

#### Scenario: Dispose workspace removes directory idempotently via registry
- GIVEN an active workspace descriptor tracked in the private registry
- WHEN `DisposeWorkspace` is invoked
- THEN the workspace directory MUST be deleted and registry record removed
- AND subsequent invocations on the same descriptor MUST succeed without error

#### Scenario: Dispose unrecorded workspace fails closed
- GIVEN a workspace descriptor whose `workspace_id` is absent from the private registry
- WHEN `DisposeWorkspace` is invoked
- THEN it MUST NOT perform file deletions on unverified paths and MUST return status `disposed`

---

---

---

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

---

### Requirement: Strict Filesystem Containment And Path Validation {#REQ-worker-isolation-003}

The execution runtime MUST provide `ValidateAllowedPaths` and `checkSymlinkEscape` to enforce filesystem containment. The validator MUST compute the filesystem mutation delta (`created`, `modified`, `deleted`) against `baselineInventory` and evaluate paths strictly on the delta against declared `allowed_paths`. `checkSymlinkEscape` MUST fail closed upon detecting relative path traversal (`../`), symlink escapes outside the workspace root, or if any filesystem exception or `realpathSync` failure occurs during path inspection.
(Previously: Symlink escape checks swallowed filesystem exceptions and realpathSync errors instead of failing closed.)

#### Scenario: Mutation delta within allowed_paths passes containment validation
- GIVEN a filesystem mutation delta strictly located within declared `allowed_paths`
- WHEN `ValidateAllowedPaths` is invoked
- THEN validation MUST succeed with `{ ok: true }`

#### Scenario: Relative path traversal or symlink escape fails closed
- GIVEN an attempted file operation or symlink resolving outside workspace boundaries via `../` or external target
- WHEN `ValidateAllowedPaths` is invoked
- THEN validation MUST return `{ ok: false }`
- AND MUST emit a `containment-violation/v1` descriptor identifying the offending path and violation type

#### Scenario: Filesystem realpath exception fails closed as containment violation
- GIVEN a target path whose ancestor triggers an exception or unresolvable link during `realpathSync`
- WHEN `checkSymlinkEscape` or `ValidateAllowedPaths` is executed
- THEN validation MUST fail closed and emit a `containment-violation/v1` with `violation_type: "symlink_escape"`

---

---

---

### Requirement: Strict Identity Boundary And CandidateId Prohibition {#REQ-worker-isolation-007}

K6a execution primitives, schemas, fixtures, and output payloads MUST NOT emit, accept, return, or assume
`CandidateId` or Candidate schema structures. `WorkResult` MUST remain raw unapproved execution evidence.
The workspace filesystem inventory MUST NOT be accepted or aliased as an approved candidate tree.
Public APIs of K6a MUST NOT expose Repair domain concepts, graph compilation terms, or shadow orchestration controls.

#### Scenario: WorkResult output contains zero CandidateId fields

- GIVEN any `WorkResult` payload produced by K6a primitives
- WHEN inspected for candidate identifiers
- THEN no `candidate_id` or Candidate schema discriminator property MAY be present

#### Scenario: K6a public API surface contains no Repair or Candidate terminology

- GIVEN the exported API signatures and schema definitions of K6a
- WHEN inspected for domain leaks
- THEN terms including `freezeCandidate`, `RepairShadow`, and `CandidateEvaluationAttestation` MUST be absent

---

---

---

### Requirement: 3-Way Cryptographic Binding and Byte-Exact Merkle Tree Digest {#REQ-worker-isolation-009}

`MaterializeSourceSnapshot` MUST enforce 3-way equality binding between the workspace record, the `workOrder`, and the `sourceSnapshot` (`record.descriptor.source_snapshot_id === workOrder.source_snapshot_id === sourceSnapshot.source_snapshot_id`) before creating any file on disk. `computeTreeDigest` MUST compute deterministic SHA-256 digests over exact raw bytes without newline substitution or UTF-8 decoding of binary buffers, ensuring distinct Merkle digests for CRLF vs LF line endings. When file entries declare a SHA-256 digest, `computeTreeDigest` MUST recompute the digest over candidate bytes and fail closed if the declared hash does not match.

#### Scenario: 3-Way binding validation prevents snapshot mismatch execution
- GIVEN a workspace registered for SourceSnapshot A and a WorkOrder compiled for SourceSnapshot B
- WHEN `MaterializeSourceSnapshot` is invoked
- THEN it MUST reject materialization and throw a 3-way binding mismatch error

#### Scenario: Byte-exact hashing distinguishes CRLF and LF byte streams
- GIVEN two identical file buffers differing only by CRLF vs LF line endings
- WHEN `computeTreeDigest` is evaluated on each
- THEN it MUST produce distinct SHA-256 Merkle root tree digests

#### Scenario: Declared SHA-256 mismatch halts fail-closed
- GIVEN a file item declaring a mismatched SHA-256 digest compared to its candidate bytes
- WHEN `computeTreeDigest` processes the item
- THEN it MUST throw a cryptographic verification error and fail closed
