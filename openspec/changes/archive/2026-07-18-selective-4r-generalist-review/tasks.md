# Tasks: Selective 4R with Bounded Review Lineage

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

Estimación acumulada: 1800-2600 líneas, incluyendo la implementación ya completada y la nueva transacción bounded. `exception-ok` autoriza una única PR cohesiva con `size:exception`; los work units conservan límites revisables aunque no se publiquen como PRs separadas.

La remediación posterior al primer `sdd-verify` mantiene esta decisión: el total del change sigue sobre el presupuesto y `exception-ok` conserva `size-exception` sin abrir O6 ni cambiar concurrencia.

### Suggested Work Units

- Unit 1: clasificador puro y tests unitarios.
- Unit 2: generalista, registro/modelo y contrato.
- Unit 3: gate/audit, preservando severidad, remediación y concurrencia.
- Unit 4: paridad de cinco targets; generación temporal sin editar `dist/`.
- Unit 5: reducer `review-lineage`, identidad/genesis inmutables y budget acotado.
- Unit 6: validator dirigido, reconciliación, gates read-only y sucesor explícito.
- Unit 7: retirada del owner-rereview, paridad de cinco targets y regresión completa.
- Unit 8: E1 evidence-only; desglose honesto 20/20 del audit trail B1 y cierre mecánico sin cambios de código, tests ni reviewers.

## Spec/Design Reconciliation

| Requirement / Scenarios | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-routing-001: docs sin señal; runtime prevalece | MUST | `scripts/lib/review-dimensions.js` | covered-by-design | Normaliza, ordena y explica. |
| REQ-routing-002: cap normal; high-risk | MUST | classifier | covered-by-design | 0-2 o cuatro. |
| REQ-routing-003: audit; inválido; legacy | MUST | classifier + gate + convención | covered-by-design | Fail-closed y merge-safe. |
| REQ-agents-012: clear; escalado | MUST | generalist + gate | covered-by-design | Generalista primero. |
| REQ-agents-013: dos; remediación acotada | MUST | gate + orchestrator | covered-by-design | Sin envelopes sintéticos. |
| REQ-agents-014: paridad generada | MUST | generator + targets | covered-by-design | Cinco outputs equivalentes. |
| 4R modificado: high-risk; malformed | MUST | classifier + gate | covered-by-design | Full 4R o bloqueo. |
| Hook modificado: sin gate; severidad | MUST | gate + orchestrator | covered-by-design | No-op/advisory intactos. |
| REQ-skills-004: escalado; clear; inválido | MUST | skill + validator | covered-by-design | Payload exacto. |
| REQ-skills-005: security; defecto básico | MUST | agent/skill | covered-by-design | Sin sobreafirmar. |
| REQ-skills-006: especialistas; boundary omitido | MUST | contract/parity tests | covered-by-design | Detecta drift. |
| REQ-agents-015: lineage, one-shot, findings y tres fallos | MUST | `scripts/lib/review-lineage.js` | covered-by-design | Autoridad y terminación ejecutables. |
| REQ-routing-004: genesis, budget y targeted validation | MUST | lineage reducer + `review-correction` | covered-by-design | Budget `min(200, ceil(lines/2))`, sin expansión. |
| REQ-routing-005: interrupción y gates read-only | MUST | pending operation + identity validation | covered-by-design | Reconciliación sin replay. |
| REQ-skills-007: frontera one-shot/validator | MUST | agent/skill + contract tests | covered-by-design | El validator no descubre blockers. |

### Reconciliation Verdict

- MUST coverage: complete
- SHOULD/MAY gaps and ambiguities: none
- Scope guard: receipts firmados, locks/CAS, O6, archive runtime y política de concurrencia excluidos.

## Phase 1: Clasificador determinista

- [x] 1.1 **RED:** crear `scripts/review-dimensions.test.js` con casos table-driven de normalización, diff real sobre metadata, dedupe, fingerprint estable, razones ordenadas, selección 0/1/2, cap y high-risk. Ejecutar el archivo y guardar el fallo esperado. [REQ-routing-001, REQ-routing-002]
- [x] 1.2 **GREEN:** crear `scripts/lib/review-dimensions.js` con las cuatro exports CommonJS, catálogo cerrado, precedencia, canonical tie-break, validadores y SHA-256 hasta pasar 1.1. [REQ-routing-001, REQ-routing-002, REQ-routing-003]
- [x] 1.3 **TRIANGULATE:** añadir permutaciones equivalentes y entradas malformadas: clasificación/verify/diff ausentes, códigos desconocidos, keys extra/faltantes, fingerprint/cap/order inválidos; probar razones `normal-cap-excluded`, negativas y `high-risk-override`. [REQ-routing-001, REQ-routing-002, REQ-routing-003]
- [x] 1.4 **REFACTOR:** extraer helpers puros y reejecutar el test sin añadir I/O ni dependencias. [REQ-routing-001, REQ-routing-003]

## Phase 2: Generalista acotado

- [x] 2.1 **RED:** crear `scripts/review-change-contract.test.js` para payload exacto `{status,specialists,reason}`, orden/dedupe, combinaciones clear/escalado, `artifacts: []`, herramientas read-only y prohibición de findings, severidad y remediación profunda. [REQ-skills-004, REQ-skills-005, REQ-skills-006]
- [x] 2.2 **GREEN:** crear `agents/review-change.agent.md` y `skills/review-change/SKILL.md`; registrar `review-change` en `models.yaml` y en el allowlist de `agents/sdd-orchestrator.agent.md` hasta pasar 2.1. [REQ-agents-012, REQ-skills-004, REQ-skills-005]
- [x] 2.3 **TRIANGULATE:** cubrir especialistas desconocidos/desordenados/duplicados, reason vacío, boundary omitido y señales de permisos/procesos; fijar que los cuatro `skills/review-*` y sus envelopes permanecen sin cambios. [REQ-skills-004, REQ-skills-005, REQ-skills-006]
- [x] 2.4 **REFACTOR:** alinear agent/skill con el envelope compartido sin relajar competencia ni habilitar escritura. [REQ-agents-012, REQ-skills-005]

## Phase 3: Gate selectivo, auditoría y remediación

- [x] 3.1 **RED:** añadir fixtures de integración en `scripts/selective-4r-parity.test.js` para clear/0, unión/2, high-risk/4, decisión inválida/bloqueada, ruta sin gate, audit merge-safe, estado legacy y rereview por dimensión propietaria. [REQ-agents-012, REQ-agents-013, REQ-routing-003]
- [x] 3.2 **GREEN:** actualizar `skills/_shared/gate-4r-review.md` y `agents/sdd-orchestrator.agent.md` para recolectar evidencia/diff, ejecutar el generalista primero, validar/derivar, persistir schema v1 y despachar únicamente dimensiones seleccionadas. [REQ-agents-012, REQ-agents-013, REQ-routing-001, REQ-routing-002, REQ-routing-003]
- [x] 3.3 **GREEN:** extender `skills/_shared/openspec-convention.md` con el audit opcional/legacy y bloqueo `contract-remediation`, preservando por merge `status`, `on_blocker`, findings y decisiones históricas. [REQ-routing-003]
- [x] 3.4 **TRIANGULATE:** demostrar cero envelopes sintéticos, bloqueo antes de specialist/archive, severidad advisory intacta, rereview acotado tras `sdd-verify` y parallel-preferred/serial-fallback sin cambios. [REQ-agents-013, REQ-routing-003]
- [x] 3.5 **REFACTOR:** centralizar llamadas al clasificador y ownership por dimensión; eliminar cualquier reinterpretación del ranking en prompts o handlers. [REQ-agents-013, REQ-routing-001]

## Phase 4: Generación y paridad de cinco targets

- [x] 4.1 **RED:** ampliar `scripts/selective-4r-parity.test.js` para generar claude, vscode, github-copilot, opencode y codex en temporales y exigir generalista, allowlist, modelo, classifier runtime, gate/audit/boundary y decisiones idénticas. [REQ-agents-014, REQ-skills-006]
- [x] 4.2 **GREEN:** actualizar `scripts/configure/cli.js` para incluir `scripts/lib/review-dimensions.js` como runtime root y ajustar las fuentes/perfiles necesarios hasta que los cinco targets pasen; no editar `dist/` a mano. [REQ-agents-014, REQ-skills-006]
- [x] 4.3 **GREEN:** sincronizar `AGENTS.md`, `.github/instructions/sdd-common.instructions.md` y `.github/instructions/sdd-openspec.instructions.md` con el contrato gate/state fuente, sin introducir O6. [REQ-agents-014, REQ-routing-003]
- [x] 4.4 **TRIANGULATE:** comprobar que ausencia del generalista/classifier/boundary o drift de cap/razones hace fallar paridad y que cada validator target-native acepta el output completo. [REQ-agents-014, REQ-skills-006]
- [x] 4.5 **REFACTOR:** consolidar fixtures comunes y reejecutar paridad. [REQ-agents-014]

## Phase 5: Validación final

- [x] 5.1 Ejecutar los tests enfocados: `node --test scripts/review-dimensions.test.js scripts/review-change-contract.test.js scripts/selective-4r-parity.test.js`; documentar RED/GREEN/TRIANGULATE/REFACTOR por tarea en `apply-progress.md`. [REQ-routing-001, REQ-routing-002, REQ-routing-003, REQ-agents-012, REQ-agents-013, REQ-agents-014, REQ-skills-004, REQ-skills-005, REQ-skills-006]
- [x] 5.2 Ejecutar builds/validación temporales de los cinco targets mediante `scripts/configure/cli.js` y confirmar que no quedan cambios manuales en `dist/`. [REQ-agents-014, REQ-skills-006]
- [x] 5.3 Ejecutar `npm test`; corregir regresiones manteniendo inalterados especialistas, severidad, remediación y concurrencia, y registrar evidencia completa antes de `sdd-verify`. [REQ-agents-013, REQ-skills-006]

## Batch de remediación R1+: FAIL de `sdd-verify`

Las 21 tareas anteriores permanecen como historial completado. Este batch no reconstruye su RED histórico: parte del prototipo actual y exige un fallo fresco o una mutación controlada observable antes de cada GREEN.

### R1: Desempate canónico recuperado

- [x] R1.1 **RED fresco:** añadir a `scripts/review-dimensions.test.js` un caso de tres candidatos `risk`, `reliability`, `resilience` con igual precedencia; ejecutar el test contra el prototipo sin editar producción y registrar exit code no cero y el diff esperado `risk,reliability`. [REQ-routing-001, REQ-routing-002]
- [x] R1.2 **GREEN:** corregir `scripts/lib/review-dimensions.js` para ordenar candidatos solo por precedencia mínima y, en empate, `risk`, `reliability`, `resilience`, `readability`; `source`, `code` y `detail` solo ordenan razones dentro de una dimensión. [REQ-routing-001, REQ-routing-002]
- [x] R1.3 **TRIANGULATE/REFACTOR:** cubrir permutaciones de entrada, precedencias distintas y empate de cuatro dimensiones; demostrar selección estable 0-2 normal y full-4R high-risk sin alterar fingerprint, dedupe ni razones. [REQ-routing-001, REQ-routing-002, REQ-routing-003]

### R2: Reducer ejecutable de gate y estado

- [x] R2.1 **RED fresco:** crear `scripts/review-gate-state.test.js` que falle por ausencia de `scripts/lib/review-gate-state.js` o de sus exports `readReviewGate`, `planReviewGate`, `mergeReviewGateAudit` y `planBoundedRereview`; capturar comando, exit code y aserción. [REQ-routing-003, REQ-agents-012, REQ-agents-013]
- [x] R2.2 **GREEN:** crear `scripts/lib/review-gate-state.js` como reducer CommonJS puro, sin I/O ni dispatch, y conectarlo como autoridad consumida por `skills/_shared/gate-4r-review.md`/orchestrator; ruta sin gate devuelve no-op sin generalista ni especialistas. [REQ-routing-003]
- [x] R2.3 **TRIANGULATE:** probar clear/0, normal/2 y high-risk/4 con listas exactas; skipped dimensions quedan solo en audit y nunca producen envelopes sintéticos. [REQ-routing-002, REQ-agents-012, REQ-agents-013]
- [x] R2.4 **TRIANGULATE:** probar contrato inválido con `status: blocked`, `blocker_reason: contract-remediation`, `dispatch: []` y `archive_allowed: false`; no puede ocurrir dispatch parcial ni fallback 4R. [REQ-routing-003]
- [x] R2.5 **TRIANGULATE:** probar `mergeReviewGateAudit` read-merge-write preservando `status`, `on_blocker`, `findings_summary`, `surfaced_to_user` y campos históricos; leer legacy sin audit sin reescribirlo ni inventar razones. [REQ-routing-003]
- [x] R2.6 **TRIANGULATE/REFACTOR:** probar rereview acotado por dimensiones propietarias y nuevas señales justificadas, reaplicando cap normal y full-4R high-risk; rechazar owners desconocidos y conservar orden canónico. [REQ-agents-013, REQ-routing-002]
- [x] R2.7 **CONTROL DE REGRESIÓN:** fijar en tests que severidades, decisión de remediación, prompts/envelopes especialistas y parallel-preferred/serial-fallback permanecen idénticos; no implementar política nueva de concurrencia. [REQ-agents-013, REQ-skills-006]

### R3: Paridad negativa en cinco targets

- [x] R3.1 **RED por mutación controlada:** ampliar `scripts/selective-4r-parity.test.js` con baseline temporal verde y mutantes aislados por omisión de generalist, classifier/reducer runtime y competence boundary; cada mutante debe fallar con diagnóstico específico en claude, vscode, github-copilot, opencode y codex. [REQ-agents-014, REQ-skills-005, REQ-skills-006]
- [x] R3.2 **RED por drift controlado:** mutar cap, orden canónico y razones/audit en cada target temporal; exigir exit code no cero sin modificar la fuente de trabajo y eliminar cada temporal al terminar. [REQ-routing-001, REQ-routing-002, REQ-routing-003, REQ-agents-014]
- [x] R3.3 **GREEN/TRIANGULATE:** incluir ambos runtimes como roots alcanzables en `scripts/configure/cli.js`, generar los cinco targets y ejecutar probes idénticos de classifier/reducer; confirmar decisiones y razones equivalentes con validación target-native. [REQ-agents-014, REQ-skills-006]

### R4: Evidencia Strict TDD y cierre de apply

- [x] R4.1 Append-only en `apply-progress.md`: añadir `Recovery TDD Evidence` con identidad de prototipo/baseline, comando exacto, exit code, extracto de fallo fresco o mutante, cambio GREEN, resultado, triangulación y rerun tras refactor para R1-R3; mantener el RED histórico anterior como no disponible. [REQ-routing-001, REQ-routing-003, REQ-agents-013, REQ-agents-014]
- [x] R4.2 Ejecutar `node --test scripts/review-dimensions.test.js scripts/review-gate-state.test.js scripts/review-change-contract.test.js scripts/selective-4r-parity.test.js`; registrar exit 0 y cobertura conductual de route no-op, 0/2/4, bloqueo, audit, legacy y rereview. [REQ-routing-001, REQ-routing-002, REQ-routing-003, REQ-agents-012, REQ-agents-013]
- [x] R4.3 Ejecutar `npm test` y confirmar que especialistas, severidad, remediación, concurrencia y `docs/roadmap.md` permanecen sin cambios; solo entonces marcar R1-R4 completos y devolver a `sdd-verify`. [REQ-agents-013, REQ-agents-014, REQ-skills-006]

### Límites de remediación

- Incluido: corregir el tie-break, reducer puro consumido por el gate, fixtures conductuales y mutaciones negativas de cinco targets.
- Excluido: O6, runtime determinista de archive, cualquier cambio de concurrencia y `docs/roadmap.md`.

## Batch R5: remediación del gate selectivo

- [x] R5.1 **RED/GREEN:** hacer que `planReviewGate` invoque `validateReviewDecision` en defensa en profundidad aunque el adapter entregue `validationErrors: []`; las fixtures positivas se derivan ahora de evidencia normalizada real. [REQ-routing-003, REQ-agents-013]
- [x] R5.2 **RED/GREEN:** limitar `generalist.reason` a 512 caracteres y rechazar material credential-like, tokens sintéticos y líneas/hunks verbatim antes de persistir la decisión; alinear skill, handler y contrato. [REQ-skills-004, REQ-skills-005]
- [x] R5.3 **RED/GREEN:** parsear el diff por archivo y hunk añadido, considerar solo adiciones de producción ejecutable y atribuir cada señal al path exacto; excluir docs, specs, tests, fixtures, contexto y borrados. [REQ-routing-001, REQ-routing-002]
- [x] R5.4 **RED/GREEN:** exigir presencia y tipo array de `paths`, `capabilities`, `dependencies`, `operationTypes`, `verify.findings` y `designRisks` antes de calcular fingerprint. [REQ-routing-001, REQ-routing-003]
- [x] R5.5 **RED/GREEN:** exigir la decisión previa validada en `planBoundedRereview`; rerun solo de owners más dimensiones ausentes antes y seleccionadas ahora, sin repetir non-owners estables. [REQ-agents-013, REQ-routing-002]
- [x] R5.6 **RED/GREEN:** limpiar `blocker_reason` y `validation_errors` al transicionar de blocked a ready/done, preservando campos históricos ajenos. [REQ-routing-003]
- [x] R5.7 **TRIANGULATE/REFACTOR:** ampliar probes y mutaciones aisladas de los cinco targets para reason boundary, diff scope, validación del reducer y rereview delta-bounded; ejecutar los cuatro tests focales y `npm test`. [REQ-agents-014, REQ-skills-006]

## Batch R6: remediación del bounded rereview 1

- [x] R6.1 **RED/GREEN/TRIANGULATE:** sustituir `generalist.reason` libre por la gramática estructural `signals=<codes>;dimensions=<ids>`, aceptar solo códigos classifier allowlisted y exigir correspondencia exacta con `specialists`; demostrar que JWT, Bearer, AWS y cualquier sufijo/prosa arbitraria fallan antes de persistir. [REQ-skills-004, REQ-skills-005, REQ-routing-003]
- [x] R6.2 **RED/GREEN/TRIANGULATE:** validar un unified diff real con sección `diff --git`, marcadores `---`/`+++`, hunk válido y conteos completos; rechazar input no-diff, sección sin hunk, marcadores ausentes, truncamiento y contenido residual; documentar hunks sintéticos válidos para untracked files. [REQ-routing-001, REQ-routing-003]
- [x] R6.3 **RED/GREEN/TRIANGULATE:** extraer señales solo de adiciones ejecutables por archivo, eliminando shebangs, comentarios de línea/bloque y literales; excluir rutas documentation/test/spec/fixture anidadas y evitar que texto documental desplace al owner generalista. [REQ-routing-001, REQ-routing-002]
- [x] R6.4 **PARITY/REGRESSION:** propagar skill, agent, runtime y handler a claude, vscode, github-copilot, opencode y codex; añadir mutaciones negativas de gramática, validación diff y sanitización ejecutable; ejecutar cuatro tests focales y `npm test` sin tocar especialistas, O6, concurrencia, `dist/` ni `docs/roadmap.md`. [REQ-agents-014, REQ-skills-006]

## Batch R7: remediación de comentarios inline `#`

- [x] R7.1 **RED fresco:** reproducir en Python, Ruby y shell que un comentario inline `#` después de un prefijo ejecutable emite señales falsas; incluir `#` entre comillas y exigir que el prefijo ejecutable siga siendo analizable. [REQ-routing-001, REQ-routing-002]
- [x] R7.2 **GREEN/TRIANGULATE:** hacer el stripping de `#` dependiente del lenguaje: Python/Ruby desde cualquier `#` no citado y shell solo al inicio de token; preservar cadenas y hashes embebidos válidos. [REQ-routing-001]
- [x] R7.3 **PARITY/MUTATION:** ejecutar el mismo probe en claude, vscode, github-copilot, opencode y codex, y demostrar que desactivar el modo de comentario `#` falla con diagnóstico `EVIDENCE`. [REQ-agents-014, REQ-skills-006]
- [x] R7.4 **REGRESSION/CLOSE:** ejecutar los cuatro tests focales y `npm test`; preservar JS, unified diff, R5/R6, especialistas, taxonomía, concurrencia, O6, `dist/` y `docs/roadmap.md`; actualizar estado a `fixed-pending-verify-r7`. [REQ-routing-001, REQ-agents-013, REQ-agents-014]

## Batch R8: frontera de palabra para comentarios shell `#`

- [x] R8.1 **RED fresco:** reproducir `;#` y comentarios tras whitespace, inicio de línea y operadores shell; exigir que auth/network/error del sufijo no emitan facts y que el prefijo ejecutable sí lo haga. [REQ-routing-001, REQ-routing-002]
- [x] R8.2 **GREEN/TRIANGULATE:** reconocer `#` como comentario solo al inicio de palabra del lexer shell; preservar comillas, escapes, `${var#pattern}`, `word#hash`, shebang y prefijos ejecutables. [REQ-routing-001]
- [x] R8.3 **PARITY/MUTATION:** ampliar el probe y la mutación aislada en claude, vscode, github-copilot, opencode y codex para detectar regresión de `;#` y operadores. [REQ-agents-014, REQ-skills-006]
- [x] R8.4 **REGRESSION/CLOSE:** ejecutar los cuatro tests focales y `npm test`; preservar Python/Ruby, R5-R7, especialistas, taxonomía, concurrencia, O6, `dist/` y `docs/roadmap.md`; actualizar estado a `fixed-pending-verify-r8`. [REQ-routing-001, REQ-agents-013, REQ-agents-014]

## Batch R9: segundo bounded rereview

- [x] R9.1 **RED/GREEN/TRIANGULATE:** separar diagnósticos runtime del audit persistido; `planReviewGate` conserva solo `adapter-contract-invalid` y `decision-contract-invalid`, sin JWT, Bearer, AWS ni payload arbitrario, y mantiene fail-closed sin archive. [REQ-routing-003, REQ-agents-013]
- [x] R9.2 **RED/GREEN/TRIANGULATE:** rechazar objetos, números, `null` y arrays anidados antes de trim/dedupe en `paths`, `capabilities`, `dependencies` y `operationTypes`; eliminar la coerción `String()`. [REQ-routing-001, REQ-routing-003]
- [x] R9.3 **RED/GREEN/TRIANGULATE:** hacer el lexer dependiente de lenguaje para `--`, preservar decremento JS y analizar expresiones ejecutables en template interpolation y f-strings sin contar texto literal. [REQ-routing-001, REQ-routing-002]
- [x] R9.4 **RED/GREEN/TRIANGULATE:** soportar comentarios Ruby `=begin`/`=end` en posiciones válidas, con estado sobre líneas añadidas/contexto y ejecución posterior al cierre. [REQ-routing-001]
- [x] R9.5 **PARITY/REGRESSION/CLOSE:** añadir probes y mutaciones aisladas para las cuatro fronteras en los cinco targets, ejecutar los cuatro tests focales y `npm test`, preservar R5-R8, reason/unified diff, especialistas, taxonomía, concurrencia, O6, `dist/` y `docs/roadmap.md`, y actualizar a `fixed-pending-verify-r9`. [REQ-agents-014, REQ-skills-006]

## Unidad B1: lineage bounded estilo `gentle-ai`

R1–R9 permanecen como historial completado y no se convierten en intentos inventados. Esta unidad reemplaza el owner-rereview abierto por una transacción nueva sobre el candidato vigente.

### Criterios de aceptación y trazabilidad

| Criterio | Requisitos | Evidencia requerida |
|---|---|---|
| B1-AC1: start congela identidad, rutas, dimensiones y allowance exacto | REQ-agents-015, REQ-routing-004 | Unit tests deterministas e idempotencia. |
| B1-AC2: cada lens corre una vez y los finding IDs quedan inmutables | REQ-agents-013, REQ-agents-015 | Replay/expansión rechazados. |
| B1-AC3: correcciones solo sobre IDs/rutas, budget acumulado y tres fallos | REQ-agents-015, REQ-routing-004 | Escape, overflow y tercer fallo probados, incluido delta cero. |
| B1-AC4: validator solo resuelve IDs; observaciones nuevas son follow-ups | REQ-routing-004, REQ-skills-007 | Contract tests positivos y negativos. |
| B1-AC5: unknown exige reconciliación y gates no crean autoridad | REQ-routing-005 | Interrupción, status y archive/verify read-only. |
| B1-AC6: cinco targets eliminan owner-rereview y conservan paridad | REQ-agents-014, REQ-skills-006, REQ-skills-007 | Generación temporal, mutaciones y suite completa. |

### B1.1 RED: identidad y genesis congelados

- [x] B1.1.1 Crear `scripts/review-lineage.test.js` con RED para stable serialization, `candidate_id`, `lineage_id`, rutas POSIX canónicas, dimensiones/classification/evidence inmutables e idempotencia de start idéntico. [REQ-agents-015, REQ-routing-004]
- [x] B1.1.2 Añadir RED table-driven para `correction_budget_lines = min(200, ceil(original_changed_lines / 2))`, incluidos 0, impares, cap 200, conteos inválidos y ausencia de campos genesis. [REQ-agents-015, REQ-routing-004]

### B1.2 GREEN: reducer y one-shot

- [x] B1.2.1 Crear `scripts/lib/review-lineage.js` CommonJS puro con start inmutable, revisión CAS por `expected_revision`, estados legales y serialización estable hasta pasar B1.1. [REQ-agents-015, REQ-routing-004]
- [x] B1.2.2 Implementar ejecución `pending|running|completed|unknown` por dimensión; rechazar relanzamiento/resultados divergentes y permitir retry idempotente exacto por `request_id`/digest. [REQ-agents-013, REQ-agents-015, REQ-routing-005]
- [x] B1.2.3 Congelar findings con IDs hash estables por lineage/owner/contenido; rechazar colisiones, duplicados, renumeración, borrado, nuevos IDs o owners tras freeze. [REQ-agents-013, REQ-agents-015, REQ-routing-004]

### B1.3 RED→GREEN: corrección y validación dirigida

- [x] B1.3.1 Añadir RED para correcciones referidas solo a IDs unresolved y subconjunto de genesis paths; contabilizar líneas reales acumuladas y bloquear base mismatch, escape, forecast/actual/cumulative overflow. [REQ-agents-015, REQ-routing-004]
- [x] B1.3.2 Implementar begin/record correction con snapshot previo, request persistible y budget fijo; TRIANGULATE con intentos concurrentes, stale revision y retries exactos. [REQ-agents-015, REQ-routing-004, REQ-routing-005]
- [x] B1.3.3 Crear `scripts/review-correction-contract.test.js` con RED para payload exacto: todos los frozen IDs una vez, solo `resolved|unresolved`, regression evidence obligatoria, sin IDs/owners/blockers extra y follow-ups bounded no bloqueantes. [REQ-routing-004, REQ-skills-007]
- [x] B1.3.4 Crear `agents/review-correction.agent.md` y `skills/review-correction/SKILL.md`, registrarlos en `models.yaml`, y aplicar outcomes en el reducer; cada validación fallida, incluso delta cero, incrementa el contador y la tercera termina en `exhausted`. [REQ-agents-015, REQ-routing-004, REQ-skills-007]
- [x] B1.3.5 TRIANGULATE follow-ups append-only, resolución parcial, regresión de corrección y terminal `approved|exhausted|escalated|invalidated`; ningún resultado del validator puede ampliar blockers o budget. [REQ-agents-015, REQ-routing-004, REQ-skills-007]

### B1.4 RED→GREEN: interrupción, gates y successor

- [x] B1.4.1 Añadir RED de pending operation persistida antes del dispatch: resultado ambiguo pasa a `reconciliation-required`; solo exact committed/not_started/unknown puede resolverlo y nunca replay con inputs cambiados. [REQ-routing-005]
- [x] B1.4.2 Implementar reconciliación y validación read-only de candidate/lineage para status, verify, delivery y archive; drift o unknown bloquea sin start, reviewer, validator, successor ni rebudget. [REQ-routing-005]
- [x] B1.4.3 Implementar successor explícito únicamente desde predecessor terminal, con generation, ID distinto, link, reason y approval reference; rechazar recuperación implícita o reset de intentos. [REQ-agents-015, REQ-routing-004, REQ-routing-005]

### B1.5 Integración, cinco targets y refactor

- [x] B1.5.1 Reescribir `scripts/lib/review-gate-state.js`, `skills/_shared/gate-4r-review.md` y `agents/sdd-orchestrator.agent.md` para consumir solo `next_action` autorizado; retirar `planBoundedRereview` y todo owner/generalist rereview después del freeze. [REQ-agents-013, REQ-routing-004, REQ-routing-005]
- [x] B1.5.2 Sincronizar persistence/rules en `skills/_shared/openspec-convention.md`, `rules/**`, `.github/instructions/**` y `AGENTS.md`; registrar el validator y ambos runtimes en `scripts/configure/cli.js` sin editar `dist/` ni `docs/roadmap.md`. [REQ-agents-014, REQ-routing-004, REQ-skills-006, REQ-skills-007]
- [x] B1.5.3 Actualizar `scripts/review-gate-state.test.js` y `scripts/selective-4r-parity.test.js`: cinco targets deben probar one-shot, budget/attempt cap, unknown stop, targeted-only, follow-up y successor; mutar cada invariante para demostrar fallo. [REQ-agents-014, REQ-routing-005, REQ-skills-006, REQ-skills-007]
- [x] B1.5.4 REFACTOR helpers puros y fixtures compartidas sin cambiar classifier, generalist, especialistas, severidad ni concurrencia; eliminar código muerto de owner-rereview. [REQ-agents-013, REQ-agents-014, REQ-skills-006]

### B1.6 Cierre Strict TDD

- [x] B1.6.1 Ejecutar tests focales de lineage, correction contract, gate, classifier/generalist y paridad; registrar RED→GREEN→TRIANGULATE→REFACTOR por tarea en la sección mergeada de `apply-progress.md`. [REQ-agents-015, REQ-routing-004, REQ-routing-005, REQ-skills-007]
- [x] B1.6.2 Ejecutar generación temporal de claude, vscode, github-copilot, opencode y codex, confirmar paridad y ausencia de cambios manuales en `dist/`/`docs/roadmap.md`. [REQ-agents-014, REQ-skills-006, REQ-skills-007]
- [x] B1.6.3 Ejecutar `npm test`; si todo pasa, actualizar por merge `apply-progress.md` y `state.yaml` con lineage nueva, historial R1–R9 conservado, apply done y verify pending. [REQ-agents-013, REQ-agents-014, REQ-agents-015, REQ-routing-004, REQ-routing-005, REQ-skills-006, REQ-skills-007]

## Unidad E1: reparación evidence-only del audit trail Strict TDD

Esta unidad no reabre B1 ni autoriza implementación, cambios de tests o discovery reviews. Conserva las 20 tareas B1 completadas y transforma únicamente la evidencia agregada ya existente en trazabilidad individual verificable.

- [x] E1.1 Actualizar solo `openspec/changes/selective-4r-generalist-review/apply-progress.md`: añadir exactamente una fila `TDD Cycle Evidence` por cada ID `B1.1.1`, `B1.1.2`, `B1.2.1`, `B1.2.2`, `B1.2.3`, `B1.3.1`, `B1.3.2`, `B1.3.3`, `B1.3.4`, `B1.3.5`, `B1.4.1`, `B1.4.2`, `B1.4.3`, `B1.5.1`, `B1.5.2`, `B1.5.3`, `B1.5.4`, `B1.6.1`, `B1.6.2` y `B1.6.3`, preservando las seis filas agregadas y todo el historial R1–R9. Cada fila debe citar solo evidencia real del propio `apply-progress.md` o de comandos ya ejecutados. [REQ-agents-015, REQ-routing-004, REQ-routing-005, REQ-skills-007]
- [x] E1.2 Clasificar honestamente cada fila por layer y rationale. Un RED demostrado usa `✅ Written` más el resultado fallido observado; un GREEN ejecutado usa `✅ Passed` más comando/resultado. Cuando una tarea documental, de integración o de ejecución no constituya un ciclo de producción, usar `STATIC_VALIDATED` o `DEFERRED` con justificación concreta. Está prohibido inferir, reconstruir o fabricar un RED inexistente; si cualquier B1.x carece de evidencia suficiente, detener E1 como bloqueada y dejarla sin marcar. [REQ-agents-015, REQ-routing-004]
- [x] E1.3 Ejecutar una comprobación mecánica read-only que extraiga los IDs hoja `B1.x.y` completados de este archivo y los compare con la columna `Task` de las filas individuales de E1 en `apply-progress.md`: ambos conjuntos deben ser idénticos, contener 20 IDs únicos y producir cobertura `20/20`, sin duplicados ni filas agregadas usadas como sustituto. Solo después marcar E1 completa y dejar `state.yaml` en `ready-for-verify`; el orquestador podrá repetir `sdd-verify` una única vez, sin lanzar generalista ni especialistas. [REQ-agents-015, REQ-routing-005]
