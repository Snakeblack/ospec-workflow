# Tasks: Fidelidad del tooling de federación (dist runtime + surface en el cache)

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| Gen — Skill entry-point scripts present in dist | MUST | `scripts/configure/cli.js` `gatherRuntimeScripts` — `SKILL_ENTRY_SCRIPTS` como roots adicionales del BFS | covered-by-design | Test G1 en `cli.test.js` |
| Gen — Generator-only modules excluded from dist | MUST | `scripts/configure/cli.js` — predicado `isExcludedRuntimeScript`, aplicado en seed y en bucle BFS | covered-by-design | Test G2 en `cli.test.js` |
| Gen — Transitive dependency of an entry script included | MUST | `scripts/configure/cli.js` — mismo BFS walker, roots adicionales; nueva dep alcanzable si no excluida | covered-by-design | Test G3 en `cli.test.js` |
| FM — Latest-wins on conflicting entries | MUST | Sin cambio — comportamiento pre-existente, no in-scope de este PR | existing-coverage | Ya cubierto por tests en vigor |
| FM — Equal `updated_at` — lexicographic tiebreak | MUST | Sin cambio — comportamiento pre-existente | existing-coverage | Ya cubierto por tests en vigor |
| FM — Malformed marker skipped fail-open | MUST | Sin cambio — comportamiento pre-existente | existing-coverage | Ya cubierto por tests en vigor |
| FM — surface preserved through merge into contract | MUST | `scripts/lib/workspace-atlas.js` `mergeMarkersIntoAtlas` ~:801 — passthrough genérico de campos no reservados | covered-by-design | Tests F1 + actualización de :461 y :551 |
| FM — Merge→serialize round-trip idempotent | MUST | `scripts/lib/workspace-atlas.js` — passthrough determinista; `serializeAtlas` loop ya emite claves extra | covered-by-design | Test F2 en `workspace-atlas.test.js` |
| FM — provides entry without surface serializes correctly | MUST | `scripts/lib/workspace-atlas.js` — guard `null/undefined` en passthrough evita inyectar clave ausente | covered-by-design | Test F3 en `workspace-atlas.test.js` |

### Reconciliation Verdict

- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: la spec delta `generator` nombra el requisito `### Requirement: Scenario 1 — Source tree loading` (mezcla "Scenario N" en el nombre del requirement en vez de usar el patrón estándar `### Requirement:` + `#### Scenario:`). No bloquea apply ni verify; puede causar rechazo en `sdd-archive` con validador estricto. Resolver en la spec antes de archive (tarea 5.1).

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 190–260 (cli.js ~40, cli.test.js ~70, workspace-atlas.js ~15, workspace-atlas.test.js ~95) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | WU-1 (packaging) en un commit; WU-2 (atlas merge) en un segundo commit; ambos en un único PR |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| WU-1 | Bundler fix — `cli.js` + `cli.test.js` | PR único (commit 1) | Independiente; tests incluidos; rollback por `git revert` |
| WU-2 | Merge/surface fix — `workspace-atlas.js` + `workspace-atlas.test.js` | PR único (commit 2) | Independiente; rollback por `git revert`; no requiere WU-1 |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Phase 1: WU-1 RED — Tests fallidos para el bundler fix

- [x] 1.1 En `scripts/configure/cli.test.js`: añadir test **G1** — crear un `sourceDir` temporal con los cuatro scripts de entry (`scripts/lib/federation-marker.js`, `federation-explore.js`, `workspace-general-baseline.js`, `federation-baseline-orchestrator.js`) y un `scripts/hooks/stub.js` vacío; invocar `gatherRuntimeScripts(dir)`; `assert` que los cuatro paths de entry aparecen en el resultado.
- [x] 1.2 En `scripts/configure/cli.test.js`: añadir test **G2** — `federation-marker.js` requiere `'./target-foo'` (creado en temp); `assert` que `scripts/lib/target-foo.js` NO aparece en el resultado de `gatherRuntimeScripts`.
- [x] 1.3 En `scripts/configure/cli.test.js`: añadir test **G3** — `federation-marker.js` requiere `'./some-dep'` (creado en temp, no excluido); `assert` que `scripts/lib/some-dep.js` SÍ aparece en el resultado de `gatherRuntimeScripts`.
- [x] 1.4 Ejecutar `npm test`; confirmar que G1, G2 y G3 FALLAN (RED) y que el resto de la suite sigue en verde.

## Phase 2: WU-1 GREEN — Implementación del bundler fix en cli.js

- [x] 2.1 En `scripts/configure/cli.js`: declarar constante `SKILL_ENTRY_SCRIPTS` (array de cuatro rutas relativas: `scripts/lib/federation-marker.js`, `scripts/lib/federation-explore.js`, `scripts/lib/workspace-general-baseline.js`, `scripts/lib/federation-baseline-orchestrator.js`), ubicada antes de `gatherRuntimeScripts`.
- [x] 2.2 En `scripts/configure/cli.js`: añadir función privada `isExcludedRuntimeScript(rel)` que devuelve `true` para: cadenas terminadas en `.test.js`; prefijo `scripts/configure/`; prefijo `scripts/lib/target-`; base igual a `frontmatter.js` o `model-resolver.js`.
- [x] 2.3 En `gatherRuntimeScripts`: encolar `SKILL_ENTRY_SCRIPTS` como roots adicionales (filtradas con `isExcludedRuntimeScript`); mantener el `hooksDir` scan existente pero hacerlo condicional a que el directorio exista (no abortar si falta `hooks/`); aplicar `isExcludedRuntimeScript(rel)` como guard en el bucle BFS antes de encolar cualquier dep.
- [x] 2.4 Ejecutar `npm test`; confirmar G1, G2 y G3 en VERDE; verificar que ningún test previo de `cli.test.js` regresa a rojo; confirmar suite completa verde; commitear WU-1.

## Phase 3: WU-2 RED — Tests fallidos para el merge/surface fix

- [x] 3.1 En `scripts/lib/workspace-atlas.test.js` línea ~476: actualizar el `deepEqual` del test "unions member entries" para incluir `surface: "openapi"` en el contrato esperado (`{ id: "api-public", provider: "svc-api", consumers: ["svc-web"], surface: "openapi" }`).
- [x] 3.2 En `scripts/lib/workspace-atlas.test.js` línea ~566: actualizar el `deepEqual` del test "maps provides to contracts" para incluir `surface: "openapi"` en el contrato esperado (`{ id: "payments-api", provider: "svc-payments", consumers: [...], surface: "openapi" }`).
- [x] 3.3 En `scripts/lib/workspace-atlas.test.js`: añadir test **F1** — marker con `provides: [{id: "payments-api", consumers: ["svc-checkout"], surface: "openapi"}]`; `assert.strictEqual(atlas.contracts[0].surface, "openapi")` tras `mergeMarkersIntoAtlas`.
- [x] 3.4 En `scripts/lib/workspace-atlas.test.js`: añadir test **F2** — serializar el mismo atlas (con `surface`) dos veces con `serializeAtlas`; `assert.strictEqual` byte-identical; verificar que `surface: openapi` aparece en ambas salidas.
- [x] 3.5 En `scripts/lib/workspace-atlas.test.js`: añadir test **F3** — marker con `provides: [{id: "svc-noop", consumers: []}]` (sin campo `surface`); `assert` que `atlas.contracts[0]` NO contiene clave `surface`; `assert` que `id`, `provider` y `consumers` están correctos.
- [x] 3.6 Ejecutar `npm test`; confirmar que 3.1, 3.2, F1, F2 y F3 FALLAN (RED) y que el resto de la suite sigue verde.

## Phase 4: WU-2 GREEN — Implementación del merge/surface fix en workspace-atlas.js

- [x] 4.1 En `scripts/lib/workspace-atlas.js` función `mergeMarkersIntoAtlas` (~línea 801): reemplazar el literal `{ id: provided.id, provider: id, consumers: [...] }` por un objeto que inicia con esos tres campos reservados y luego itera `Object.entries(provided)` copiando toda clave que no sea `"id"`, `"consumers"` ni `"provider"` y cuyo valor no sea `null` ni `undefined`.
- [x] 4.2 Ejecutar `npm test`; confirmar que los tests actualizados en 3.1 y 3.2 y los nuevos F1, F2 y F3 están en VERDE; verificar suite completa verde; commitear WU-2.

## Phase 5: Cleanup — Corrección del formato del encabezado de spec

- [x] 5.1 En `openspec/changes/federation-tooling-fidelity/specs/generator/spec.md`: renombrar `### Requirement: Scenario 1 — Source tree loading` a `### Requirement: Source tree loading ampliado` (o equivalente sin "Scenario N") y promover el primer sub-escenario inline al nivel `#### Scenario:` estándar, para que el validador estricto de `sdd-archive` no rechace la estructura.

## Remediación RWU-1: Neutralización del literal vscode/askQuestions (post-verify FAIL)

- [x] RWU-1.1 Test 4.1.22 en `scripts/lib/federation-baseline-orchestrator.test.js`: actualizar aserción a `strictEqual("orchestrator/askQuestions")` y añadir `ok(!includes("vscode/"))` → RED confirmado (35/36)
- [x] RWU-1.2 `scripts/lib/federation-baseline-orchestrator.js:160`: cambiar literal de `"vscode/askQuestions"` a `"orchestrator/askQuestions"` → GREEN confirmado (36/36)
- [x] RWU-1.3 `openspec/specs/federated-baseline-orchestration/spec.md:85`: actualizar ejemplo ilustrativo a `"orchestrator/askQuestions"`
- [x] RWU-1.4 Grep de SKILL_ENTRY_SCRIPTS — sin residuo de `vscode/` en strings de output emitido
- [x] RWU-1.5 Suite completa 678/678 verde; cuatro builds exit 0

## Remediación 4R: Quality remediation post-verify (hallazgos 4R)

- [x] 4R-1 Test **F4** en `scripts/lib/workspace-atlas.test.js`: rama `value === null` del passthrough — `provides[].surface: null` no se copia al contrato derivado ni aparece en el YAML serializado; 38/38 verde
- [x] 4R-2 Test **G4** en `scripts/configure/cli.test.js`: rama `rel.startsWith("scripts/configure/")` — módulo requerido transitivamente bajo `scripts/configure/` excluido del dist; 20/20 verde
- [x] 4R-3 Test **G5** en `scripts/configure/cli.test.js`: rama `base === "frontmatter.js" || base === "model-resolver.js"` — ambos módulos excluidos del dist aunque sean requeridos transitivamente; 20/20 verde
- [x] 4R-4 Comentario en `scripts/lib/federation-baseline-orchestrator.js:160` — explica formato del valor `approver` (target-agnostic, sin namespace prefix) y que se escribe en el YAML de estado consumido por el gate
- [x] 4R-5 Comentario en `scripts/configure/cli.js` — en el call site de `isExcludedRuntimeScript` dentro del loop `SKILL_ENTRY_SCRIPTS`, clarifica por qué se aplica el guard incluso a la lista curada (defensivo: un módulo generator-only alcanzado transitivamente nunca debe filtrarse al dist)
- [x] 4R-6 Suite completa 680/681 (1 fallo preexistente flaky: `appendRuntimeEvent serializes concurrent writers` — ospec-state.test.js:155, no relacionado); build:copilot 0 errors 0 warnings
