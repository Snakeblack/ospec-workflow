# Apply Progress: K4a Replay Provenance, Obligation Authority, Shadow Classification, and Graph Schema Hardening

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
| ---- | --------- | ----- | ---------- | --- | ----- | ----------- | -------- | ----------------- |
| 1.1 Schema ExecutionGraph | `schemas/kernel/execution-graph/v1.schema.json` | Schema | Schema Validator | Pass | Pass | Pass | Pass | Añadido minLength: 1 a campos e items |
| 1.2 Schema GraphNode | `schemas/kernel/graph-node/v1.schema.json` | Schema | Schema Validator | Pass | Pass | Pass | Pass | Añadido minLength: 1 a campos e items |
| 2.1 Compiler node fields | `scripts/lib/execution-graph/compiler.test.js` | Unit | Node Test | Pass | Pass | Pass | Pass | Rechazo de strings vacíos en compileExecutionGraph |
| 2.2 Compiler obligation authority | `scripts/lib/execution-graph/compiler.test.js` | Unit | Node Test | Pass | Pass | Pass | Pass | Rechazo de IDs no presentes en contract.obligations |
| 3.1 Replay Fail-Closed WorkOrder | `scripts/lib/execution-graph/replay-engine.test.js` | Unit | Node Test | Pass | Pass | Pass | Pass | Eliminado catch silencioso en WorkOrder compilation |
| 3.2 Replay Strict Provenance | `scripts/lib/execution-graph/replay-engine.test.js` | Unit | Node Test | Pass | Pass | Pass | Pass | Exigencia obligatoria de graph_id y work_order_id |
| 4.1 Shadow Semantic Consistency | `scripts/lib/execution-graph/shadow-comparator.test.js` | Unit | Node Test | Pass | Pass | Pass | Pass | match: false en partial-match con dimensiones omitidas |
| 5.1 End-to-End Integration | `scripts/lib/k3-k4a-integration.test.js` | Integration | Node Test | Pass | Pass | Pass | Pass | Validación de los 4 vectores adversariales |
