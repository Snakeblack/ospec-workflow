# Tasks: Contrato de recomendación y detección de ambigüedad temprana/tardía (A2 + A3)

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| Recommended Option Description Contract (recommendation-contract) | MUST | `skills/_shared/sdd-phase-common.md` §D + orchestrator examples (D5) | covered-by-design | Rationale + trade-off + reversibility en `description`; alcance `question_gate.options[]` únicamente |
| Gate Reason Cost-of-Wrong-Decision Statement (recommendation-contract) | MUST | `skills/_shared/sdd-phase-common.md` §D Blocking Question Envelope | covered-by-design | `reason` debe nombrar el costo de una decisión errónea/adivinada |
| Multiple Recommended Options Each Satisfy Independently (recommendation-contract) | SHOULD | Documentado en §D junto al contrato de description | covered-by-design | No introduce nuevo shape; solo regla textual |
| Intent Restatement Before Change Classification (ambiguity-detection-boundaries) | MUST | `agents/sdd-orchestrator.agent.md` §Change Classification, zona CORE (D2) | covered-by-design | Subsección nueva antes de la tabla de clases |
| sdd-apply design-mismatch Blocker (ambiguity-detection-boundaries) | MUST | `skills/sdd-apply/SKILL.md` Step 4 + Rules; ruteo en orquestador §Verification/Blocker Failure Routing (D4) | covered-by-design | Regla espejo de `spec-change-required`, con exclusión cosmética |
| blocker_type Enum Field Formalization (delta agents) | MUST | `openspec/specs/agents/spec.md` §6.1 (baseline) + `sdd-phase-common.md` §D (D3) | covered-by-design | Única edición de baseline entregable en apply, per mandato del delta |
| question_gate Recommendation Contract Compliance (delta agents, ADDED) | MUST | Sync a baseline en `sdd-archive` | covered-by-design | No se sincroniza ahora; queda como requirement change-local hasta archive |
| Orchestrator Intent Restatement in Change Classification (delta agents, ADDED) | MUST | Sync a baseline en `sdd-archive` | covered-by-design | Igual — anclaje §1/§15 en archive |
| sdd-apply design-mismatch Blocker Type (delta agents, ADDED) | MUST | Sync a baseline en `sdd-archive` | covered-by-design | Igual — anclaje §4.3 en archive |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none (Open Questions del design es no-bloqueante: nombre del fichero de test ya decidido — ver assumption `sdd-design-001`)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350-450 fuente (4 .md editados + spec.md baseline + sweep) + duplicación mecánica al regenerar `dist/` en los 4 targets |
| 400-line budget risk | High (la regeneración de `dist/` multiplica el mismo contenido de prosa 4 veces; el riesgo fuente-only ronda Medium) |
| Chained PRs recommended | No (delivery strategy ya resuelta como `exception-ok`) |
| Suggested split | Single PR con `size:exception`, organizado en 2 commits internos (A2 y A3) para revert independiente, per proposal/design §Migration |
| Delivery strategy | exception-ok (aprobada en `state.yaml` approvals ledger, gate `delivery-strategy-001`) |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

Nota de encuadre: `exception-ok` ya fue aceptado por el usuario (`approvals[].delivery-strategy-001`, `applies_to: [sdd-tasks, sdd-apply]`), por lo que `sdd-apply` NO debe volver a preguntar por estrategia de entrega — debe proceder directamente citando `size:exception` en su resumen (per regla de `sdd-apply/SKILL.md`: "When applying `size:exception`, state it explicitly"). El riesgo real (`High`) se reporta igual, honestamente, porque proviene de la regeneración mecánica de `dist/`, no de ambigüedad de alcance.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 (A2) | Contrato de recomendación: `sdd-phase-common.md` §D + ejemplos conformes en orquestador | Single PR, commit 1 | Independiente revertible; no depende de A3 |
| 2 (A3) | Intent restatement + design-mismatch: orquestador §Change Classification/§Routing + `sdd-apply/SKILL.md` + baseline `blocker_type` | Single PR, commit 2 | Depende de que `blocker_type` ya esté documentado en §D (Unit 1) |
| 3 (regen) | Regenerar `dist/` (4 targets) + verificar `npm test` | Mismo PR, commit final | Mecánico; no se edita a mano |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: RED — Contract Test First (TDD)

- [x] 1.1 Crear `scripts/recommendation-ambiguity-contract.test.js` siguiendo el patrón exacto de `scripts/assumption-ledger-contract.test.js` (node:test + assert, lee los .md fuente, sin runtime nuevo). Debe fallar en rojo contra el estado actual del repo.
- [x] 1.2 En ese test, Phase 1 (§D común): assert que `blocker_type` aparece como campo documentado en la lista/tabla de §D Return Envelope con enum de 4 valores (`needs_user_decision`, `design-mismatch`, `spec-change-required`, `workload-escalation`).
- [x] 1.3 En ese test, Phase 1 (§D común): assert que el Blocking Question Envelope documenta el contrato de `description` (rationale + trade-off + reversibilidad) y que `reason` debe nombrar un costo; assert que el texto acota el alcance a `question_gate.options[]` (no `next_question`).
- [x] 1.4 En ese test, Phase 2 (orquestador): assert que existe una subsección `Intent Restatement` antes de la tabla de `### Change Classification`, y que el routing de blocker (§Verification/Blocker Failure Routing) contiene `design-mismatch` → `sdd-design`.
- [x] 1.5 En ese test, Phase 3 (`sdd-apply/SKILL.md`): assert que el Step 4 y la sección Rules contienen la línea `blocked: design-mismatch` junto con la exclusión cosmética (naming/helper equivalente no bloquea).
- [x] 1.6 En ese test, Phase 4 (baseline `agents/spec.md`): assert que §6.1 lista la fila `blocker_type` con el enum de 4 valores.
- [x] 1.7 Correr `node --test scripts/recommendation-ambiguity-contract.test.js` y confirmar que falla (RED) antes de tocar los .md fuente.

## Phase 2: GREEN — Recommendation Contract (A2)

- [x] 2.1 Editar `skills/_shared/sdd-phase-common.md` §D Return Envelope (lista de campos, ~líneas 144-151): añadir `blocker_type` como campo OPCIONAL, presente cuando `status: blocked`, con tabla-enum de los 4 valores conocidos (nombre + significado + fase emisora) — ver diseño D3.
- [x] 2.2 En el mismo archivo, §D Blocking Question Envelope (~líneas 190-233): tras el JSON de ejemplo, añadir el contrato de contenido: toda opción `recommended: true` DEBE llevar `description` con (1) rationale de 1 línea, (2) trade-off principal, (3) reversibilidad; `reason` DEBE nombrar el costo de una decisión equivocada/adivinada. Acotar explícitamente el alcance a `question_gate.options[]` (excluir `next_question` legacy).
- [x] 2.3 Actualizar el ejemplo JSON embebido en §D (Blocking Question Envelope) para que su opción `recommended: true` cumpla los 3 elementos y su `reason` nombre un costo concreto.
- [x] 2.4 Correr `node --test scripts/recommendation-ambiguity-contract.test.js` y confirmar que las aserciones de Phase 1 (§D) pasan (GREEN parcial).

## Phase 3: GREEN — Intent Restatement + design-mismatch (A3)

- [x] 3.1 Editar `agents/sdd-orchestrator.agent.md` §Change Classification (~línea 100): insertar subsección `#### Intent Restatement (pre-classification)` ANTES de la tabla de clases — criterio de vaguedad (falta módulo/target O criterio de aceptación O límite de scope), reformulación de 2-4 líneas validada con `AskUserQuestion`, máx. 1 iteración salvo nueva ambigüedad, sin crear artefactos OpenSpec como efecto colateral.
- [x] 3.2 En el mismo archivo, renombrar/extender `### Verification Failure Routing` (~línea 416) a ruteo por origen ("Failure & Blocker Routing" o equivalente): añadir que un envelope `status: blocked` con `blocker_type: design-mismatch` recibido desde `sdd-apply` rutea a `sdd-design` (no `sdd-clarify`, no reintento silencioso), y `spec-change-required` a `sdd-spec`, reusando la tabla de prioridades existente.
- [x] 3.3 Editar `skills/sdd-apply/SKILL.md` Step 4 (~línea 134): añadir, junto a la línea existente de `spec-change-required`, la línea paralela: si el código existente contradice el design (API/módulo/dependencia asumidos que no existen o difieren, o patrón incompatible), STOP con `blocked: design-mismatch`, citando la contradicción concreta y la sección de `design.md` afectada.
- [x] 3.4 En el mismo archivo, sección Rules (~línea 228): añadir regla espejo con exclusión explícita — desviación cosmética (naming, helper equivalente con el mismo contrato) NO es `design-mismatch`; se procede con el código existente. Mismo patrón textual que `spec-change-required`.
- [x] 3.5 Editar `openspec/specs/agents/spec.md` (baseline) §6.1 (tabla de envelope, ~línea 345): añadir fila `blocker_type` — enum (`needs_user_decision` \| `design-mismatch` \| `spec-change-required` \| `workload-escalation`), OPTIONAL, SHOULD estar presente cuando `status: blocked`. NO sincronizar aquí los 3 requirements ADDED restantes del delta (`agents/spec.md` change-local) — quedan para `sdd-archive`.
- [x] 3.6 Correr `node --test scripts/recommendation-ambiguity-contract.test.js` y confirmar que TODAS las aserciones pasan (GREEN completo).

## Phase 4: Sweep — Conformidad de Ejemplos Embebidos

- [x] 4.1 Corregir `agents/sdd-orchestrator.agent.md` §Review Workload Guard, ejemplo "Chained PRs" (~línea 392-395): completar `description` con rationale + trade-off + reversibilidad, y `reason` (~línea 390) con el costo concreto de una estrategia de entrega equivocada.
- [x] 4.2 Corregir `agents/sdd-orchestrator.agent.md` §Sub-Agent Clarification Contract, ejemplo "Option A" (~línea 634-636, hoy `"Optional explanation."`): reemplazar por una `description` conforme a los 3 elementos.
- [x] 4.3 Grep `"recommended": true` sobre `agents/`, `skills/`, `commands/`, `profiles/` para localizar cualquier otro ejemplo embebido de `question_gate` no conforme (incluye la opción "ask-on-risk" del ejemplo de Delivery Strategy, ~línea 341-343 del orquestador) y corregirlo con el mismo patrón de 3 elementos + costo en `reason`. También corregidos: `skills/_shared/gate-archive-quality.md`, `skills/_shared/dispatch-lifecycle-hooks.md`, `skills/_shared/route-brownfield.md`, `skills/sdd-clarify/SKILL.md` (plantilla genérica). No hubo coincidencias en `commands/` ni `profiles/`.
- [x] 4.4 Re-correr `node --test scripts/recommendation-ambiguity-contract.test.js` para confirmar que el sweep no rompió ninguna aserción existente.

## Phase 5: Regeneración y Verificación Global

- [x] 5.1 Regenerar los 4 targets: `npm run build:claude`, `npm run build:vscode`, `npm run build:copilot`, `npm run build:opencode`.
- [~] 5.2 Correr `npm test` (`node scripts/check.js`) completo. Todos los tests de `docs-lint.test.js`, el contrato nuevo, y la generación manual de los 4 targets (0 errores) pasan. `npm test` como comando único reporta fallo porque `scripts/hooks/session-start.test.js` y `scripts/hooks/pre-tool-use.test.js` fallan por una razón **preexistente y no relacionada** con este cambio (confirmado con `git stash` contra el estado previo a esta sesión de apply — las mismas 17 aserciones fallan idénticamente sin ninguna de mis ediciones). Fuera de alcance de este cambio: no se tocó ningún hook de git-collaboration-guard/agent-shield/token-budget-advisor.
- [x] 5.3 Confirmar que `scripts/recommendation-ambiguity-contract.test.js` sigue en verde tras la regeneración (landmarks de prosa presentes en los .md fuente; el test no cubre `dist/` directamente).

## Phase 6: TRIANGULATE / REFACTOR

- [x] 6.1 Releer las 3 specs change-local completas contra el resultado final de los .md editados; confirmado que cada escenario MUST tiene un landmark de prosa verificable por el test de contrato (triangulación).
- [x] 6.2 Limpieza de prosa: no se introdujo redundancia — `blocker_type` está documentado exactamente en las dos tablas mandatadas (`sdd-phase-common.md` §D y `agents/spec.md` §6.1); se corrigió además una referencia colgante a "Verification Failure Routing" en `gate-archive-quality.md` tras el renombrado a "Failure & Blocker Routing".
- [x] 6.3 Actualizar `apply-progress.md` documentando: TDD Cycle Evidence (RED → GREEN → REFACTOR), archivos tocados, y que la edición de baseline `agents/spec.md` §6.1 fue el único deliverable de baseline en este apply (resto del delta sincroniza en archive).

## Phase 7: Post-4R-Review Fix Batch (5 WARNING findings)

- [x] 7.1 Nota de naming-convention para el enum `blocker_type` mixto (snake_case/kebab-case) en `skills/_shared/sdd-phase-common.md` §D y `openspec/specs/agents/spec.md` §6.1 — sin renombrar valores existentes.
- [x] 7.2 Frase aclaratoria en `agents/sdd-orchestrator.agent.md` §Failure & Blocker Routing distinguiendo los origin tags post-hoc de verify (`design-gap`/`spec-gap`) de los live blockers de apply (`blocker_type: design-mismatch`/`spec-change-required`).
- [x] 7.3 Cláusula "persistir progreso parcial de tareas ya completadas en este batch" añadida a `skills/sdd-apply/SKILL.md` Step 4 y Rules para los STOP de `design-mismatch` y `spec-change-required` (paridad con `workload-escalation`).
- [x] 7.4 Cobertura de test nueva para los 4 archivos del sweep sin cobertura previa (`dispatch-lifecycle-hooks.md`, `gate-archive-quality.md`, `route-brownfield.md`, `sdd-clarify/SKILL.md`).
- [x] 7.5 Aserción de reversibilidad (test 1.3) re-acotada a la sección `#### Recommended Option Description Contract`, ya no whole-file.
- [x] 7.6 (SUGGESTION, opcional) Test 1.5 dividido en dos aserciones independientes (Step 4 / Rules) para la línea `blocked: design-mismatch`.
- [x] 7.7 `node --test scripts/recommendation-ambiguity-contract.test.js scripts/docs-lint.test.js scripts/assumption-ledger-contract.test.js scripts/federation-baseline-contract.test.js` → 48/48 pass. Los 4 targets (`claude`, `vscode`, `github-copilot`, `opencode`) regenerados, 0 errores/0 warnings.
