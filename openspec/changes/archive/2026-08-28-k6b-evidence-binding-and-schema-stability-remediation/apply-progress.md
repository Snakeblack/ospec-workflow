# Apply Progress: K6b Evidence Binding and Schema Stability Remediation

## Resumen Ejecutivo
- **Change**: `k6b-evidence-binding-and-schema-stability-remediation`
- **Modo de Implementación**: Focused TDD (`testing.tdd_mode: focused`)
- **Estado Global**: Todas las tareas de las Fases 1 a 5 implementadas y verificadas con éxito.
- **Resultado de Pruebas**: Suite completa (`npm test`) ejecutada con salida limpia (código de salida 0, 0 ofensas de lint de contrato, todas las pruebas unitarias y de integración pasando).

---

## Fases Ejecutadas

### Fase 1: Fundaciones de Esquemas y Contratos
- **Tarea 1.1**: Publicado el esquema canónico [assessment/v2.schema.json](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/schemas/kernel/assessment/v2.schema.json) (`$id: "ospec://schemas/kernel/assessment/v2"`, `schema_version: 2`) requiriendo `evidence_requirements_satisfied` con `minItems: 1`, catálogo estricto de roles canónicos (`red`, `green`, `characterization-before`, `characterization-after`, `negative`, `acceptance`, `integration`, `invariant`, `smoke`, `rollback`, `dry-run`), prohibiendo `verdict` y fijando `additionalProperties: false`.
- **Tarea 1.2**: Restaurado [assessment/v1.schema.json](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/schemas/kernel/assessment/v1.schema.json) al contrato retrocompatible v2.51.0 (sin requerir ni alojar `evidence_requirements_satisfied`).
- **Tarea 1.3**: Creados fixtures válidos e inválidos para `assessment/v2` (`v2-complete.json`, `v2-four-roles.json`, `v2-empty-coverage.json`, `v2-with-verdict.json`, `v2-missing-coverage.json`) y actualizados los fixtures v1 para aislar y respetar la retrocompatibilidad.
- **Tarea 1.4**: Registrada la familia `assessment-v2` y preservada `assessment` v1 en [manifest.json](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/schemas/kernel/manifest.json) y [contract-claims.json](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/schemas/kernel/contract-claims.json). Registrado el alias en `FAMILY_PUBLICATION` de [k1-schema-compat.js](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/contract-checkers/k1-schema-compat.js).

### Fase 2: Verificación Independiente y Enlace de Evidencia
- **Tarea 2.1**: Refactorizado [evidence.js](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/independent-verifier/evidence.js) en `normalizeEvidence` para desacoplar `rawEvidence` (`bytes`, `provenance`, `origin`, `node_id`, `execution_sequence`) de los metadatos semánticos de confianza, rechazando sobreescrituras arbitrarias del llamador.
- **Tarea 2.2**: Implementada en [strategy-policy.js](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/independent-verifier/strategy-policy.js) la función `assertCompatibleRoleSharing` basada en la matriz formal de pares incompatibles (`red` ↔ `green`, `characterization-before` ↔ `characterization-after`, `negative` ↔ `acceptance`), permitiendo explícitamente combinaciones no conflictivas (`integration` + `acceptance`).
- **Tarea 2.3**: Implementada la validación cronológica de secuencias para refactor (`characterization-before` precede a `characterization-after` vía `execution_sequence` con ordinals crecientes y enlace estricto de `previous_evidence_id`) y TDD (`red` precede a `green`, `red` precede a `patch` y `green`).
- **Tarea 2.4**: Actualizado [obligation-coverage.js](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/independent-verifier/obligation-coverage.js) para verificar cobertura de `required_evidence` mediante arrays no vacíos (`minItems: 1`) vinculados al `node_id` ejecutor.
- **Tarea 2.5**: Adaptados [assessment.js](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/independent-verifier/assessment.js) e [index.js](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/independent-verifier/index.js) para emitir `assessment/v2` por defecto, derivar metadatos autoritativamente desde el Execution Graph cuando son omitidos, y preservar soporte v1.

### Fase 3: Proyección y Replay del Assurance Graph
- **Tarea 3.1**: Actualizado [projector.js](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/assurance-graph/projector.js) en `resolveCanonicalInputDigests` para recomputar y validar autoritativamente `openspec_input_digest`, fallando closed con `GRAPH_DIVERGENCE` ante cualquier discordancia provista.
- **Tarea 3.2**: Condicionada la emisión de la arista `satisfies` en `projectAssuranceGraph` para que se proyecte única y exclusivamente cuando `evidence_requirements_satisfied.length > 0`.
- **Tarea 3.3**: Implementada en [index.js (assurance-graph)](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/assurance-graph/index.js) la revalidación integral en `replayAssuranceGraph` para registros de evidencia `evidence/v2` (digest, candidato, procedencia, ausencia de veredicto), verificación `verification/v2` (id recomputado, candidato, subconjunto estricto de IDs de evidencia) y evaluaciones `assessment/v2` (id recomputado, candidato, política, existencia de evidencia, correspondencia de obligación y nodo ejecutor, y cobertura no vacía).

### Fase 4: Suite de Pruebas y Verificación
- **Tarea 4.1**: Actualizado y verificado [k6b-schema-fixtures.test.js](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/k6b-schema-fixtures.test.js) (12/12 tests pasando).
- **Tarea 4.2**: Expandidos [assessment.test.js](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/independent-verifier/assessment.test.js) y [obligation-coverage.test.js](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/independent-verifier/obligation-coverage.test.js) con validaciones exhaustivas de `assessment/v2`, rechazo de coberturas vacías y preservación de v1 (20/20 tests pasando).
- **Tarea 4.3**: Expandido [independent-verifier/index.test.js](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/independent-verifier/index.test.js) con pruebas de desacoplamiento de `rawEvidence`, matriz de incompatibilidad de roles y precedencia cronológica en refactor/TDD (42/42 tests pasando).
- **Tarea 4.4**: Expandido [assurance-graph/index.test.js](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/scripts/lib/assurance-graph/index.test.js) con casos de `GRAPH_DIVERGENCE` ante discordancia en `openspec_input_digest`, proyección condicional de `satisfies` y replay exhaustivo (19/19 tests pasando).

### Fase 5: Limpieza y Normalización
- **Tarea 5.1 & 5.2**: Eliminados archivos obsoletos (como el fixture v1 descartado), revisados comentarios y verificado `npm test` completo.
