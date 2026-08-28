## Verification Report

**Change**: k6b-trusted-evidence-replay-closure
**Version**: 2.53.1
**Mode**: Standard (focused)

> **Errata post-release (2026-08-28):** este reporte conserva la ejecución histórica del change, pero su conclusión de compliance fue invalidada por el review terminal del tag v2.53.1. Los tests originales pasaron, aunque no demostraban autoridad/binding de RunnerReceipt, cadena causal completa ni replay criptográfico obligatorio sin bytes. El veredicto efectivo de este reporte es `REVISE`; K6c permanece bloqueado.

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 15 |
| Tasks complete | 15 |
| Tasks incomplete | 0 |

### Build & Tests Execution
**Build**: ✅ Passed (CommonJS Node.js 22+ / No build step required)

**Tests**: ✅ 95 passed in focused k6b suites / 2790+ passed in full suite / ❌ 0 failed / ⚠️ 0 skipped
```text
node --test scripts/lib/independent-verifier/evidence.test.js scripts/lib/independent-verifier/obligation-coverage.test.js scripts/lib/independent-verifier/index.test.js scripts/lib/assurance-graph/index.test.js scripts/k6b-verifier-assurance-graph-e2e.test.js
ℹ tests 90
ℹ suites 0
ℹ pass 90
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0

node --test test/e2e/k6b-verifier-assurance-graph-e2e.test.js
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0

npm test
All checks passed (2790+ unit, integration, schema and scope-guard tests passed).
```

**Manual verification**: not performed (automated runtime tests provide authoritative proof)

**Coverage**: ➖ Not configured (testing.coverage.available: false in openspec/config.yaml)

### Spec Compliance Matrix
| Requirement | Scenario | Evidence Level | Source | Result | Notes |
|-------------|----------|----------------|--------|--------|-------|
| REQ-independent-verification-003 | Runtime-observed evidence satisfies a test obligation | `runtime-test` | `scripts/lib/independent-verifier/evidence.test.js` > "REQ-independent-verification-003: valid physical observation returns normalized record without semantic metadata", `scripts/lib/independent-verifier/index.test.js` > "REQ-independent-verification-003: runtime-observed satisfies; model-reported does not" | PASS | Observaciones físicas con canal confiable satisfacen obligaciones |
| REQ-independent-verification-003 | Model-reported tests-passed is insufficient | `runtime-test` | `scripts/lib/independent-verifier/evidence.test.js` > "REQ-independent-verification-003: evaluateProvenanceSufficiency requires runtime provenance by default", `scripts/lib/independent-verifier/index.test.js` > "REQ-independent-verification-003: worker collector is model-reported and insufficient for runtime MUST" | PASS | Narrativa de worker falla closed |
| REQ-independent-verification-003 | Stale, foreign, or fabricated evidence is rejected | `runtime-test` | `scripts/lib/independent-verifier/index.test.js` > "REQ-independent-verification-003: stale, foreign, or fabricated evidence is rejected", `scripts/k6b-verifier-assurance-graph-e2e.test.js` | PASS | Rechazo por mismatch de digest, foreign subject o invalidación transitiva |
| REQ-independent-verification-003 | Payload-claimed strong provenance without trusted collector fails closed | `runtime-test` | `scripts/lib/independent-verifier/index.test.js` > "REQ-independent-verification-003: payload runtime-observed without collector fails UNTRUSTED_COLLECTOR" | PASS | Procedencia fuerte no se acepta solo por string en payload |
| REQ-independent-verification-003 | Verifier derives trusted evidence metadata from Execution Graph and receipts | `runtime-test` | `scripts/lib/independent-verifier/index.test.js` > "REQ-independent-verification-003: verifier derives trusted evidence metadata from Execution Graph and receipts" | PASS | Inferencia autoritativa de roles y obligaciones |
| REQ-independent-verification-003 | Untrusted caller metadata is rejected with UNTRUSTED_CALLER_METADATA | `runtime-test` | `scripts/lib/independent-verifier/evidence.test.js` > "REQ-independent-verification-003: normalizeEvidence rejects caller-injected role with UNTRUSTED_CALLER_METADATA", `scripts/lib/independent-verifier/index.test.js` > "REQ-independent-verification-003 [Adversarial B1]: caller semantic metadata injection in rawEvidence fails closed" | PASS | Rechazo inmediato de aserciones semánticas inyectadas por caller (B1) |
| REQ-independent-verification-005 | MUST without admissible evidence fails closed | `runtime-test` | `scripts/lib/independent-verifier/obligation-coverage.test.js` > "REQ-independent-verification-005: MUST without evidence fails UNFULFILLED_MUST" | PASS | Obligación MUST sin evidencia admisible falla con UNFULFILLED_MUST |
| REQ-independent-verification-005 | Nonexistent obligation_id fails closed | `runtime-test` | `scripts/lib/independent-verifier/obligation-coverage.test.js` > "REQ-independent-verification-005: unknown obligation_id fails closed" | PASS | Falla closed con UNKNOWN_OBLIGATION_ID |
| REQ-independent-verification-005 | Evidence bound to the wrong implementing node fails closed | `runtime-test` | `scripts/lib/independent-verifier/obligation-coverage.test.js` > "REQ-independent-verification-005: wrong implementing node fails closed" | PASS | Falla closed con WRONG_IMPLEMENTING_NODE |
| REQ-independent-verification-005 | Partial required_evidence coverage fails closed | `runtime-test` | `scripts/lib/independent-verifier/obligation-coverage.test.js` > "REQ-independent-verification-005: token subset coverage rejects partial bindings and persists the complete union" | PASS | Cobertura parcial de tokens requeridos falla |
| REQ-independent-verification-005 | Empty evidence_requirements_satisfied cannot claim satisfaction | `runtime-test` | `scripts/lib/independent-verifier/obligation-coverage.test.js` > "REQ-independent-verification-005: empty evidence_requirements_satisfied cannot claim satisfaction" | PASS | Array vacío no satisface tokens requeridos |
| REQ-independent-verification-005 | Blind copying of node required_evidence is forbidden and ungrounded satisfaction fails closed | `runtime-test` | `scripts/lib/independent-verifier/obligation-coverage.test.js` > "REQ-independent-verification-005: blind copying is eliminated; ungrounded MUST fails closed", `scripts/lib/independent-verifier/index.test.js` > "REQ-independent-verification-005 [Adversarial B2]: blind copying eliminated; ungrounded MUST fails closed" | PASS | Erradicación total de copia ciega; derivación exclusiva desde receipts (B2) |
| REQ-independent-verification-006 | Same EvidenceId as RED and GREEN fails closed | `runtime-test` | `scripts/lib/independent-verifier/index.test.js` > "REQ-independent-verification-006: one observation cannot satisfy four incompatible roles" | PASS | Falla con STRATEGY_EVIDENCE_ALIAS |
| REQ-independent-verification-006 | GREEN before RED fails closed | `runtime-test` | `scripts/lib/independent-verifier/index.test.js` > "REQ-independent-verification-006: strict-tdd and bug role order fail closed on reversed ordinals", `test/e2e/k6b-verifier-assurance-graph-e2e.test.js` | PASS | Falla con STRATEGY_SEQUENCE_VIOLATION |
| REQ-independent-verification-006 | RED after PATCH fails closed | `runtime-test` | `scripts/lib/independent-verifier/index.test.js` > "REQ-independent-verification-006: strict-tdd and bug role order fail closed on reversed ordinals" | PASS | Falla con STRATEGY_SEQUENCE_VIOLATION |
| REQ-independent-verification-006 | Distinct tuples yield distinct assessment identities | `runtime-test` | `scripts/lib/k6b-schema-fixtures.test.js` > "K6b assessment/v2: four roles share one evidence_id and produce distinct assessment_id values" | PASS | Identidades de assessment determinísticas por tupla (evidence_id, role, obligation_id) |
| REQ-independent-verification-006 | Characterization-after before characterization-before fails closed | `runtime-test` | `scripts/lib/independent-verifier/index.test.js` > "REQ-independent-verification-006: refactor chronological sequence via execution_sequence fails closed on bad ordinal or previous_evidence_id" | PASS | Validación causal de orden y encadenamiento previo |
| REQ-independent-verification-006 | Fallback to JSON array position without execution_sequence fails closed | `runtime-test` | `scripts/lib/independent-verifier/index.test.js` > "REQ-independent-verification-006 [Adversarial B3]: temporal strategies without execution_sequence fail closed (no array fallback)" | PASS | Prohibición estricta de fallback al orden de array (B3) |
| REQ-independent-verification-006 | Negative and acceptance sharing same EvidenceId fails closed | `runtime-test` | `scripts/lib/independent-verifier/index.test.js` > "REQ-independent-verification-006: incompatible roles red ↔ green, char-before ↔ char-after, negative ↔ acceptance fail closed" | PASS | Incompatibilidad de roles forzada |
| REQ-independent-verification-006 | Non-conflicting shared evidence passes validation | `runtime-test` | `scripts/lib/independent-verifier/index.test.js` > "REQ-independent-verification-006: non-conflicting shared evidence (integration + acceptance) passes validation" | PASS | Roles compatibles (integration + acceptance) admiten compartir evidencia |
| REQ-assurance-graph-006 | Replay from persisted outputs yields the same graph | `runtime-test` | `scripts/lib/assurance-graph/index.test.js` > "REQ-assurance-graph-006: replay from persistable outputs is byte-identical; contract churn diverges", `test/e2e/k6b-verifier-assurance-graph-e2e.test.js` | PASS | Replay reproduce exactamente el graph_id y las aristas |
| REQ-assurance-graph-006 | Tampered assessment_id fails replay | `runtime-test` | `scripts/lib/assurance-graph/index.test.js` > "REQ-assurance-graph-006/008: replay and reconcile reject assessment and stored-payload tampering" | PASS | Falla con GRAPH_DIVERGENCE |
| REQ-assurance-graph-006 | Assessment fails schema, candidate, or policy revalidation | `runtime-test` | `scripts/lib/assurance-graph/index.test.js` > "REQ-assurance-graph-006: replay rejects every persisted assessment binding mutation" | PASS | Falla con GRAPH_DIVERGENCE |
| REQ-assurance-graph-006 | Assessment bound to missing evidence or non-implementing node fails replay | `runtime-test` | `scripts/lib/assurance-graph/index.test.js` > "REQ-assurance-graph-006: replay rejects every persisted assessment binding mutation" | PASS | Falla con GRAPH_DIVERGENCE |
| REQ-assurance-graph-006 | Evidence v2 digest mismatch or invalid candidate binding fails replay | `runtime-test` | `scripts/lib/assurance-graph/index.test.js` > "REQ-assurance-graph-006: replay rejects evidence and verification mutations", `test/e2e/k6b-verifier-assurance-graph-e2e.test.js` | PASS | Recomputación con digestRawBytes detecta mismatch (H1) |
| REQ-assurance-graph-006 | Tampered evidence_id or failed computeEvidenceId fails replay | `runtime-test` | `scripts/lib/assurance-graph/index.test.js` > "REQ-assurance-graph-006: replay rejects tampered evidence_id and mismatched raw bytes" | PASS | Recomputación con computeEvidenceId detecta sustitución (H1) |
| REQ-assurance-graph-006 | Insufficient provenance during evidence replay fails replay | `runtime-test` | `scripts/lib/assurance-graph/index.test.js` > "REQ-assurance-graph-006: replay rejects insufficient provenance (model-reported)" | PASS | Revalidación con evaluateProvenanceSufficiency detecta procedencia no admisible (H1) |
| REQ-assurance-graph-006 | Verification v2 referencing non-existent evidence_id fails replay | `runtime-test` | `scripts/lib/assurance-graph/index.test.js` > "REQ-assurance-graph-006: replay rejects evidence and verification mutations" | PASS | Falla con GRAPH_DIVERGENCE |

**Compliance summary**: N/A. La ejecución original obtuvo 28/28 tests verdes, pero el review post-release demostró que la matriz no cubría todas las MUST declaradas y no establece compliance completa.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| REQ-independent-verification-003 | ⚠️ Partial en v2.53.1 | `normalizeEvidence` rechaza metadata semántica, pero el tag aceptaba `runner_receipts` caller-owned y matching sin EvidenceId obligatorio. |
| REQ-independent-verification-005 | ✅ Implemented | `verifyCandidate` en `scripts/lib/independent-verifier/index.js` y `walkMustObligations` en `obligation-coverage.js` derivan satisfacción exclusivamente desde runner receipts sin copiar `node.required_evidence`. |
| REQ-independent-verification-006 | ⚠️ Partial en v2.53.1 | El tag eliminó fallback por array, pero no exigía `run_id` no vacío/consistente ni `previous_evidence_id` en cada transición. |
| REQ-assurance-graph-006 | ⚠️ Partial en v2.53.1 | El tag recomputaba digest/EvidenceId solo cuando recibía bytes; Evidence sin material de observación seguía reproduciéndose como válida. |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Segregación estricta de rawEvidence con rechazo UNTRUSTED_CALLER_METADATA | ✅ Yes | `evidence.js` inspecciona las propiedades del payload `raw` antes de cualquier procesamiento y rechaza fail-closed si contiene `role`, `obligation_ids`, `obligation_id` o `evidence_requirements_satisfied`. |
| Derivación autoritativa de satisfacción desde Runner Receipts | ❌ No en v2.53.1 | `input.receipts` / `input.runner_receipts` seguían bajo control del caller y no exigían binding exacto a Evidence. |
| Cronología causal estricta mediante execution_sequence | ❌ No en v2.53.1 | Solo se exigía ordinal; `run_id` y chain eran parciales. |
| Replay criptográficamente íntegro en Assurance Graph con computeEvidenceId y provenance sufficiency | ❌ No en v2.53.1 | La recomputación era condicional a la presencia opcional de bytes. |

### Issues Found
**CRITICAL**: 3 findings post-release: RunnerReceipt authority/binding, chronology causal completa y observation material obligatorio en replay.
**WARNING**: 1 finding post-release: `outcome: failed` no impedía declarar tokens satisfechos.
**SUGGESTION**: eliminar fallback de role a `node.kind` y añadir guard de consistencia de versión documental.

### Traceability Matrix
| REQ | Tasks | Commits | Tests | Status |
|-----|-------|---------|-------|--------|
| REQ-independent-verification-003 | 1.1, 1.2, 1.3, 2.1, 2.2, 5.1, 5.2, 5.3 | working-tree | `scripts/lib/independent-verifier/evidence.test.js`, `scripts/lib/independent-verifier/index.test.js`, `test/e2e/k6b-verifier-assurance-graph-e2e.test.js` | OK |
| REQ-independent-verification-005 | 2.1, 2.2, 2.3, 2.4, 5.1, 5.2, 5.3 | working-tree | `scripts/lib/independent-verifier/obligation-coverage.test.js`, `scripts/lib/independent-verifier/index.test.js`, `test/e2e/k6b-verifier-assurance-graph-e2e.test.js` | OK |
| REQ-independent-verification-006 | 3.1, 3.2, 3.3, 5.1, 5.2, 5.3 | working-tree | `scripts/lib/independent-verifier/strategy-policy.js`, `scripts/lib/independent-verifier/index.test.js`, `test/e2e/k6b-verifier-assurance-graph-e2e.test.js` | OK |
| REQ-assurance-graph-006 | 4.1, 4.2, 4.3, 5.2, 5.3 | working-tree | `scripts/lib/assurance-graph/index.test.js`, `test/e2e/k6b-verifier-assurance-graph-e2e.test.js` | OK |

### Verdict
REVISE
La ejecución histórica quedó verde, pero no demostró tres MUST del contrato. Este reporte no autoriza el cierre terminal de K6b ni el inicio de K6c. La remediación posterior debe aportar adversariales para canal confiable y binding por EvidenceId, `run_id`/chain obligatorios y replay fail-closed sin bytes/blob resoluble.
