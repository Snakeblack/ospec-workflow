# Tasks: Fixed-Policy Reference Baseline (O2B)

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-005: nueve filas fixed compatibles publican | MUST | `live-driver.js` coordinator, `benchmark.js` candidate/renderer, publisher atómico | covered-by-design | Pendiente de tests productivos y reparación de evidencia sellada; remediación 5.1/5.5. |
| REQ-005: fila ausente/incompatible rechaza | MUST | validador de conjunto e identidades antes de escribir | covered-by-design | Pendiente de endurecimiento fail-closed; remediación 5.2. |
| REQ-005: resultado sintético/no atribuible rechaza | MUST | sellos fresh/recovered/compatible-live y provenance | covered-by-design | Capacidad de test y filas manuales quedan fuera. |
| REQ-005: smoke permanece disponible | MUST | aliases en `run.js` y rama diagnóstica de `live-driver.js` | covered-by-design | Publisher de referencia inalcanzable desde smoke. |
| REQ-005: comando reproducible no activa adaptive/CI | MUST | selección `extended` fija y README | covered-by-design | Sin gate de promoción ni cambio de defaults. |
| REQ-003: pass/fail por escenario | MUST | runner/assertions existente y tests de contrato | covered-by-design | Se conserva el flujo de 7 golden scenarios. |
| REQ-003: fallo atribuible | MUST | reporte estructural existente | covered-by-design | Campo divergente queda identificado. |
| REQ-003: infraestructura archive-ready localmente | MUST | tests puros con candidatos temporales | covered-by-design | Baseline real no es dependencia de verify/archive. |
| REQ-003: smoke conserva métricas sin publicar | MUST | scorer run-level y rama smoke | covered-by-design | Pendiente de ejercicio runtime fresh; remediación 5.1. |
| REQ-003: extended incompleto queda pendiente | MUST | caché por perfil y publisher no alcanzado | covered-by-design | No se sintetizan filas restantes. |
| REQ-003: Sol/Luna siguen diagnósticos | MUST | README y exclusión del input del candidato | covered-by-design | No cuentan en 9/9. |
| REQ-003: extended selecciona perfiles fijos | MUST | arrays canónicos y `resolveSuiteSelection` | covered-by-design | Orden e identidad exactos. |
| REQ-003: resume tras fallo tardío | MUST | descriptor fuerte y replay-validación ampliados | covered-by-design | Pendiente de conservar evidence no enumerable en cache; remediación 5.1. |
| REQ-003: benchmark público rechaza replay | MUST | `run.js benchmark` instruction-only; live driver único | covered-by-design | Sin capability live no hay scoring/publicación. |
| REQ-003: O1 ausente no invalida scoring | MUST | rama suplementaria O1 existente | covered-by-design | Attribution unavailable, sin filas inventadas. |
| REQ-003: threat model cooperativo | MUST | README y metadata del reporte | covered-by-design | Hashes son correlación/detección de tamper, no autenticidad. |

### Reconciliation Verdict
- MUST coverage: complete (16/16)
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

Estimated changed lines: 950–1,250 across 10 implementation/test/docs/evidence files, including the second verification remediation.
Delivery strategy: exception-ok.
Suggested split: one size-exception PR with six independently verifiable remediation work units; do not create a baseline artifact during implementation.
Work units: catalog/identity; validation/rendering; live-driver integration; tests/documentation; authoritative TDD evidence; offline recovery; real builder/renderer seam; final spec/manifest reconciliation.

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

## Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Catálogo fijo, contratos de manifest y descriptores | PR único / size-exception | RED/GREEN/REFACTOR en tests de catálogo e identidad. |
| 2 | Candidato v1, validación, métricas y render JSON+Markdown | PR único / size-exception | Mantener destino byte-identical ante rechazo. |
| 3 | Selección extended, provenance live/cache/recovery y publicación | PR único / size-exception | Smoke 3/3 permanece diagnóstico. |
| 4 | Integración, regresión, README y evidencia TDD | PR único / size-exception | `npm test`; nunca ejecutar live extended en tests. |

## Phase 5: Remediación tras verify FAIL (tasks-gap prioritario, code-bug adjunto)

Estas tareas amplían el backlog sin reescribir ni validar retrospectivamente las tareas 1.x–4.x. Todas aceptan `size-exception` dentro de la estrategia aprobada y deben conservar evidencia RED → GREEN → TRIANGULATE → REFACTOR en `apply-progress.md`.

- [x] 5.1 RED: añadir tests runtime que ejecuten `runLiveSuite()` fresh y compatible-cache para smoke sin publicación y extended con publicación; GREEN: preservar identidad sellada y evidence non-enumerable sin spread inseguro ni duplicación; REFACTOR: centralizar la retención segura en `scripts/evals/live-driver.js` y cubrir `live-driver.test.js`. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]
- [x] 5.2 RED: añadir casos de ausencia de `baseline_id`, `shared_identity`/`profile_catalog_sha256` desligados, fixture digests sustituidos y duplicate input; GREEN: hacer builder/validator fail-closed y comparar digests contra descriptores esperados; REFACTOR: separar validadores y errores estables en `scripts/evals/lib/benchmark.js` y `benchmark.test.js`. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]
- [x] 5.3 RED: añadir casos con estado `blocked`/no-verificado y `verify_defects: 0`; GREEN: derivar quality solo desde estado `verified` y resultados canónicos verify/4R aceptados, rechazando estados inválidos; REFACTOR: aislar el derivador de quality y sus contratos en `benchmark.js` y tests. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]
- [x] 5.4 RED: reconstruir tests focales y snapshots de evidencia; GREEN: registrar ciclos válidos para las 11/11 tareas de código con `source`/`evidence_mode` permitidos, hashes `sha256:` actuales y snapshots funcionales/de tests consistentes; REFACTOR: validar el registro autoritativo y actualizar la tabla TDD en `openspec/changes/fixed-policy-reference-baseline/apply-progress.md`. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]
- [x] 5.5 RED: añadir cobertura runtime de coordinación productiva y aserciones del manifest; GREEN: alinear `scripts/evals/README.md` y manifest con la estructura real o ajustar explícitamente `design.md`/ADR si cambia la decisión; REFACTOR: ejecutar `npm test` y documentar que no se crea baseline live real durante apply/verify. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]
- [x] 5.6 RED: revalidar la matriz completa de escenarios y requisitos; GREEN: demostrar cobertura de todos los MUST de `specs/orchestrator-evals/spec.md`, sin inventar baseline live ni datos de referencia; REFACTOR: actualizar esta matriz, el forecast y el estado de continuación con los resultados verificables. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]

## Phase 6: Remediación tras segunda verificación FAIL

Esta tanda conserva 1.x–5.x y sus estados históricos. La cronología antigua con `source: working-tree` no se autentica retrospectivamente: una reproducción limpia desde `90c387a` aporta una cronología live nueva y completa.

- [x] 6.1 RED: añadir escenarios de offline recovery que reproduzcan la reconstrucción sin `quality_evidence`; GREEN: preservar `quality_evidence` y el mismo contrato de fila al escribir y reanudar desde cache; TRIANGULATE: probar fresh, offline recovery y cache resume con builder/validator; REFACTOR: compartir normalización sin degradar evidence en `scripts/evals/live-driver.js`, `scripts/evals/lib/benchmark.js` y sus tests. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]
- [x] 6.2 RED: reproducir desde `90c387a` con los tests finales byte-exactos antes de producción; GREEN: cubrir las 17 tareas de código con `runtime-receipt`, hashes `sha256:` actuales y manifest consistente; TRIANGULATE: ejecutar los cuatro focales (67/67) y validar el registro live; REFACTOR: ejecutar `npm test` (1537/1537) sin autenticar retrospectivamente el histórico ni usar la excepción legacy. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]
- [x] 6.3 RED: demostrar que el test extended mock-heavy puede pasar sin tocar builder/renderer reales; GREEN: añadir un runtime seam que invoque builder y renderer reales, manteniendo solo mocks de colaboradores externos; TRIANGULATE: comparar publicación, payload canónico y rechazo contra `benchmark.js`; REFACTOR: reducir mocks en `scripts/evals/live-driver.test.js` y documentar la frontera de integración. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]
- [x] 6.4 RED/GREEN/TRIANGULATE/REFACTOR: revalidar los 16 MUST del delta spec, la matriz de trazabilidad y los límites de evidencia; conservar ausencia de baseline live real y registrar honestamente cualquier escenario no autenticado en `verify-report.md`/`apply-progress.md`. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]

## Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Catálogo, contratos e identidad

- [x] 1.1 RED: añadir casos que fijen las nueve identidades en orden canónico, smoke 3/3 y `policy: fixed`; GREEN: exportar `REFERENCE_BENCHMARK_PROFILES`/`SMOKE_BENCHMARK_PROFILES` y contratos de manifest en `scripts/evals/safe-export.js`; REFACTOR: congelar constantes sin duplicación. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]
- [x] 1.2 RED: cubrir campos desconocidos y drift; GREEN: ampliar `buildCompatibilityDescriptor()` con harness, target, policy, catálogo y hashes conservando runtime/git/model/effort; REFACTOR: centralizar comparación exacta y cache miss. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]
- [x] 1.3 RED: demostrar que una fila manual, replay no sellado o capability de test no es elegible; GREEN: implementar sellos de origen/provenance para fresh-live, recovered-live y compatible-live-cache en `scripts/evals/live-driver.js`; REFACTOR: normalizar códigos de rechazo. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]

## Phase 2: Candidato, validación y publicación

- [x] 2.1 RED: mutar individualmente perfiles, identidades, provenance, fixture/payload, calidad y métricas; GREEN: implementar `validateReferenceCandidate()` con errores estables y exact-set 9/9 en `scripts/evals/lib/benchmark.js`; REFACTOR: separar validadores puros por dimensión. [REQ-orchestrator-evals-005]
- [x] 2.2 RED: verificar ID determinista y rechazo de calidad no verificada/O1 inexistente; GREEN: construir candidato v1, conservar métricas run-level y derivar `baseline_id` del payload canónico; REFACTOR: aislar normalización de O1 como unavailable. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]
- [x] 2.3 RED: forzar fallo de validación y de filesystem dejando el reporte anterior byte-identical; GREEN: renderizar JSON canónico dentro de Markdown y delegar solo el replace final a `publishBaselineAtomic`; REFACTOR: hacer explícito el límite transaccional. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]

## Phase 3: Driver y compatibilidad del flujo

- [x] 3.1 RED: probar `all`/`initial` como smoke y `extended` como nueve perfiles; GREEN: actualizar selección en `scripts/evals/run.js` y coordinación en `scripts/evals/live-driver.js` para resolver exactamente fixed sin adaptive/CI; REFACTOR: mantener aliases existentes. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]
- [x] 3.2 RED: simular fresh, cache compatible, recovery tardío, mismatch y run incompleto; GREEN: retener descriptores/provenance, reutilizar solo evidencia replay-valid y dejar pendientes sin publicar; REFACTOR: compartir la ruta de compatibilidad. [REQ-orchestrator-evals-003]
- [x] 3.3 RED: ejecutar benchmark público con workspace preconstruido sin capability; GREEN: preservar rechazo fail-closed de `run.js benchmark` y publisher interno al live driver; REFACTOR: documentar la frontera de autoridad. [REQ-orchestrator-evals-003]

## Phase 4: Integración, regresión y documentación

- [x] 4.1 RED/GREEN/REFACTOR: ampliar `scripts/evals/{safe-export,run,live-driver}.test.js` para catálogo, smoke no-publicación, métricas, Sol/Luna diagnósticos, errores atribuibles y publicación 9/9; ejecutar `npm test`. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]
- [x] 4.2 RED/GREEN/REFACTOR: ampliar `scripts/evals/lib/benchmark.test.js` con schema, ID, identidad compartida, duplicate/missing, drift, provenance, calidad, O1 y atomicidad; ejecutar `npm test` sin live suite. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]
- [x] 4.3 Actualizar `scripts/evals/README.md` con `node scripts/evals/live-driver.js extended`, requisitos de identidad/entorno, smoke, resume, fallos, threat model cooperativo, métricas y límites adaptive/CI; verificar contrato CLI. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]
- [x] 4.4 Registrar en `openspec/changes/fixed-policy-reference-baseline/apply-progress.md` la tabla TDD RED/GREEN/TRIANGULATE/REFACTOR por tarea y separar evidencia de infraestructura local de la futura baseline live autorizada. [REQ-orchestrator-evals-005, REQ-orchestrator-evals-003]
