# E1.5 `kernel-wiring-inventory`: inventario de cableado de `scripts/lib`

Fecha: 2026-10-05 · Base: `main` en `2c8c0749` (v2.93.0) · Análisis de solo lectura.
Scripts de análisis: no versionados (se ejecutaron en un directorio temporal); las cifras se reproducen recorriendo el cierre de `require()` de `gatherRuntimeScripts` (`scripts/configure/cli.js`).

**Decisión (2026-10-05):** propuesta aceptada tal cual, con la attestation K8 retirada y los cinco checkers de la arquitectura archivada retirados. La ejecución se sigue en [E1.5 del roadmap](../roadmaps/harness-evolution.md#e15--kernel-wiring-inventory).

## 1. Resumen con cifras

| Medida | Ficheros | Líneas |
| --- | ---: | ---: |
| `scripts/lib/**/*.js` de producción (sin `*.test.js`) | 171 | 51.617 |
| `scripts/lib/**/*.test.js` | 159 | 55.895 |
| **A.** Runtime distribuido (lo que copia `gatherRuntimeScripts` a los 7 targets), total | 72 | 24.988 |
| A, solo `scripts/lib` | 56 | 19.111 |
| **B.** A + scripts que las skills/agentes citan por ruta (aunque no se distribuyan), solo `scripts/lib` | 63 | 23.056 |
| **No alcanzable desde B** (`scripts/lib`, producción) | **108** | **28.561** |
| No alcanzable desde A (`scripts/lib`, producción) | 115 | 32.506 |

- **El "~9 k alcanzables" del roadmap no se reproduce.** Lo estáticamente alcanzable y distribuido son **19.111 líneas** de `scripts/lib`. Las cifras intermedias, por si alguna era la referencia: solo hooks, 4.827 líneas (13 ficheros); hooks + `ospec.js`, 5.595 (17); y A sin `review-k7-binding.js` ni `execution-identities/index.js`, 12.375 (31). Las 6.736 líneas de diferencia (25 ficheros) son piezas del kernel que se distribuyen porque `review-lineage.js` las requiere.
- **Parte del "kernel no cableado" sí está cableado.** Execution Graph (10 de 11 ficheros, 2.315 líneas), Assurance Graph (3/3), 6 de 13 ficheros del verifier independiente, 2 de 8 de challenges, `kernel-schema-validator` y `execution-identities` se distribuyen. Llegan por `review-lineage.js → review-k7-binding.js` (lineage v3, K7) y por `execution-identities` (Candidate v2, que usan `review-lineage` y `verify-lineage`). La frase del roadmap "IDD no usa Execution Graph" choca con que E1.4 reutiliza el review gate, que lo arrastra.
- **De los 108 no alcanzables, 19 (3.459 líneas) son herramientas de desarrollo** que por diseño no van al runtime: el generador de targets, el tooling de E0.x y el contract-lint de manifiestos. El kernel y los módulos sueltos realmente sin cablear son **89 ficheros, 25.102 líneas**.
- **Propuesta (para que decidas, no es una decisión):**

  | Propuesta | Ficheros | Líneas |
  | --- | ---: | ---: |
  | Retirar | 64 | 19.695 |
  | Congelar | 19 | 3.598 |
  | Cablear con dueño (E4.1) | 6 | 1.809 |
  | Mantener como tooling de desarrollo | 19 | 3.459 |
- **Tests.** 72 ficheros de test (16.605 líneas) requieren solo módulos no alcanzables. Con la propuesta de retirada, 41 tests (9.538 líneas) se van con sus módulos y **27 tests de módulos que se quedan habría que editarlos**. Además se rompen 2 módulos que se quedan (`contract-lint.js` y `test-support/k6b-runner-receipt.js`) y 1 CLI de desarrollo (`scripts/k12-campaign.js`).
- **Hallazgo lateral.** Las skills mandan ejecutar 8 ficheros (3.945 líneas) que **no se distribuyen**: `archive-transaction-run.js` → `archive-transaction.js`, `verify-lineage.js` (+ `-candidate-store` y `-recovery`), `apply-resume.js`, `quality-gates.js` y `lifecycle-hooks.js`. `ospec close` (E1.4) necesitará `archive-transaction.js` en el runtime.

## 2. Método

### 2.1 Puntos de entrada en un proyecto consumidor

1. **Hooks.** `hooks/hooks.json` (lo referencian `.claude-plugin/plugin.json` y `.plugin.json`) registra 5 eventos, todos con `node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js <evento>`. El launcher (`resolveInvocation`, l. 371–400) lanza el binario Go si existe y, si no, `scripts/hooks/<evento>.js`; `subagent-stop` en Claude y Codex, y los hooks en modo federado, siempre van a Node. Tomé como raíz todo `scripts/hooks/*.js` que no sea test, igual que el generador. Esto incluye `commit-msg-hook.js` y `pre-commit-hook.js`, que también se distribuyen.
2. **`RUNTIME_ENTRY_SCRIPTS`** (`scripts/configure/cli.js:73`): `route-dispatch-run.js`, `validate-phase.js`, `ospec.js`, `review-dimensions`, `review-gate-state`, `review-lineage`, `federation-marker`, `federation-explore`, `workspace-general-baseline`, `federation-baseline-orchestrator`, `strict-tdd-evidence-remediation` y `execution-identities/index.js`. Los 7 targets, Claude incluido vía `claude-marketplace.js → runConfigure → loadTree`, distribuyen exactamente el cierre de `require()` de hooks + esta lista. Ningún perfil de `target-profiles/` declara `sourceRoots` adicionales con scripts. `schemas/kernel` sí se distribuye entero (`SOURCE_ROOTS`).
3. **Prosa de skills, agentes, commands y rules.** Grep de `scripts/…\.js` en `skills/`, `agents/`, `commands/`, `rules/` y `hooks/`. Aparecen, además de los de A: `scripts/archive-transaction-run.js` (orquestador, `gate-archive-quality.md`, `sdd-archive`), `verify-lineage.js` (`sdd-apply`, `sdd-verify`), `apply-resume.js`, `quality-gates.js`, `lifecycle-hooks.js`, `artifact-store.js`, `ospec-state.js`, `result-envelope.js` y `route-dispatcher.js`. Estos 4 últimos ya están en A. `scripts/lib/cache.js` se cita en un ejemplo de plantilla y no existe. Con todo esto formé el conjunto B.
4. **Procesos hijo.** En el cierre de B, los únicos `spawn`/`execFile` con `node` son el launcher (relanza `scripts/hooks/<evento>.js`, que ya es raíz), `pre-commit-hook.js` (hook git de este repo) y `staged-validator.js` (`node --check`). Ninguno añade un punto de entrada JS nuevo.

### 2.2 Grafo de `require()`

`reach.js` recorre todo `.js` de `scripts/`, `test/` y `tests/`:

- Quita los comentarios con una máquina de estados que respeta cadenas, plantillas y regex.
- Resuelve los `require("./…")` literales con la resolución de Node (`x`, `x.js`, `x/index.js`, `.json`).
- Aplica la misma exclusión que el generador (`*.test.js`, `scripts/configure/`, `target-*`, `frontmatter`, `model-resolver`).
- Calcula los cierres A y B y el grafo inverso de consumidores.

**Verificación cruzada:** el cierre A coincide fichero a fichero con `gatherRuntimeScripts(ROOT)` real: 72 ficheros, 0 diferencias.

**Requires que el análisis estático no resuelve.** Hay 21 `require()` no literales. Ninguno está en el runtime (B). En producción solo hay dos: `contract-checkers/i3-budget-constant.js:118` (`require(ospecStatePath)`) y `configure/installer-adapter.js:35`; el resto está en tests. Hay 6 requires solo en comentarios, todos en `configure/cli.test.js`, y 7 relativos sin resolver, todos en tests (cadenas de fixture). Un fichero se carga por ruta y no por `require`: `worker-sandbox-preload.js`, que `worker-sandbox.js:38` pasa como `PRELOAD_SCRIPT_PATH`. Lo asigné a la familia worker.

**"CLI de desarrollo"** son los ficheros no-test fuera de `scripts/lib` y fuera de B: `check.js`, `configure/*`, `evals/*`, `k12-campaign.js`, `measure-context-baseline.js`, `setup-git-hooks.js` y `fixtures/k7-review-authority/*.js`. Las copias golden de `configure/__fixtures__` requieren sus propias copias y no afectan.

**Familias** asignadas por ruta (`analysis2.js`, lista `FAMILIES`). **Specs** mapeadas por nombre de capability en `openspec/specs/`: casi ninguna spec nombra ficheros, así que el grep por ruta solo da positivos en `evaluation-attestation`, `repair-shadow-orchestration`, `kernel-contract-schemas` y `contract-lint`.

### 2.3 Qué aporta cada raíz (líneas de `scripts/lib` exclusivas de esa raíz)

| Raíz | Cierre (ficheros / líneas lib) | Exclusivo |
| --- | --- | --- |
| `lib/review-gate-state.js` | 30 / 9.769 | `review-gate-state.js` (326) |
| `lib/review-lineage.js` | 28 / 8.568 | — (lo comparte con `review-gate-state`) |
| `hooks/subagent-stop.js` | 11 / 4.279 | `context-measurement`, `agent-identity` (298) |
| `hooks/session-start.js` | 10 / 3.972 | `skill-registry`, `capability-registry` (548) |
| `scripts/ospec.js` | 9 / 2.866 | `idd-*` (768) |
| `lib/execution-identities/index.js` | 8 / 2.829 | — |
| `archive-transaction-run.js` (solo B) | 3 / 1.979 | `archive-transaction.js` (1.269) |
| `lib/verify-lineage.js` (solo B) | 11 / 4.498 | `verify-lineage*` (1.669) |

Cadena típica del kernel distribuido: `review-lineage → review-k7-binding → assurance-graph/index → independent-verifier/{assessment,evidence,runner-receipt,verdict} → adversarial-challenges/integrity → catalog`, y `review-k7-binding → execution-graph/index → work-order-compiler → allowed-paths-validator`.

## 3. Inventario por familia (no alcanzables desde B)

Columnas de consumidores: "lib cableada" es código de B que lo requiere (en ningún caso hay, por definición). "Lib no cableada" es otra familia no alcanzable que lo requiere. "Dev" es un CLI de desarrollo.

| Familia | No alcanz. (fich. / líneas) | Alcanz. misma familia | Consumidores de producción | Tests directos | Spec(s) | Ítem dueño plausible | **Propuesta** |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| **Execution Graph (K4a)** | 1 / 167 (`test-support/execution-graph-fixtures.js`) | 10 / 2.315 | `lifecycle-model.js` (no cableado) | 4 | `execution-graph-compiler` | E1.4 (vía review gate K7) | **Congelar.** Lo cableado se queda por `review-k7-binding`; el fixture lo usan tests de módulos cableados (`execution-identities/index.test`, `replay-engine.test`, `shadow-comparator.test`) |
| **Identidades K3** (`execution-identities`) | 0 | 1 / 1.228 | — | — | `execution-identities` | E1.4 | **Cableado ya** (Candidate v2 en `review-lineage` y `verify-lineage`); queda fuera del inventario |
| **Authority Store / permits / CAS (K2.1)** | 7 / 1.944 | 0 | lib no cableada: `lifecycle-kernel/{index,operations}`, `lifecycle-model`, `minimal-kernel-harness`, `filesystem-store`, `repair-shadow/execution-record-store`, `independent-verifier/runner-receipt-store`, `evaluation-attestation/issuer` | 13 | `authority-store`, `operation-permits`, `effect-semantics`, `harness-authority-canon` | Ninguno: IDD declara que no usa Authority Store ni permits | **Retirar**, en bloque con K2/K2a/K5. El único enganche con código que se queda son 3 helpers que usa `runner-receipt-store` (riesgo R4) |
| **Lifecycle (K2)**: `lifecycle-model`, `lifecycle-kernel/*`, `minimal-kernel-harness`, `next-transition`, `transition-parity`, `kernel-aliases` | 18 / 6.163 | 1 / 305 (`phase-completion-reducer`, que usa `ospec-state`) | lib no cableada: `authority-store`, `filesystem-store`, `evaluation-attestation/issuer`, `k12/{campaign,pilot}-executor` | 40 | `lifecycle-kernel-runtime`, `lifecycle-model-conformance`, `minimal-kernel-harness`, `transition-surface-parity`, `kernel-contract-schemas` (nombra `k1-compat.js`) | Ninguno (las recetas K9/K10 están aparcadas) | **Retirar**, salvo `lifecycle-kernel/k1-compat.js` (**congelar**: lo requieren 7 tests de fixtures de `schemas/kernel`, que se distribuye). `lifecycle-kernel/reducer.js` se retira y se edita la prueba de re-export de `phase-completion-reducer.test.js` (l. 10 y 379) |
| **Conformance host / host adapters / capability proof (K2a)** | 6 / 2.286 | 0 | lib no cableada: `lifecycle-model`, `minimal-kernel-harness`, `lifecycle-kernel/host-boundary`, `worker-executor`, `test-support/k6a-worker-fixtures` | 15 | `headless-conformance-host`, `reference-host-adapter`, `host-capabilities-contract`, `capability-proof` | E1.7 `ospec-doctor` o E5.1 `target-capability-matrix` (plausibilidad baja: ninguno pide un host headless) | **Retirar.** Si E5.1 quiere el vocabulario `HostCapabilities`, se conserva en `schemas/kernel` sin el código |
| **Budgets / recovery (K5)** | 3 / 746 | 0 | lib no cableada: `lifecycle-kernel/*` (5), `lifecycle-model`, `adversarial-challenges/budget` | 5 | `execution-budgets`, `failure-recovery` | Ninguno | **Retirar** con lifecycle |
| **Repair shadow (K4b)** | 6 / 2.023 (arrastra 16 ficheros / 6.004 líneas, worker y authority incluidos) | 0 | lib no cableada: `k12/pilot-executor` | 3 | `repair-shadow-orchestration` | E1.4: la tabla "Base entregada" lo liga a la obligación de reproducción | **Retirar por defecto, con decisión final en E1.4.** La evidencia de IDD son "las dos ejecuciones" registradas por `ospec check`; no hace falta una ejecución shadow aislada con permits |
| **worker-\* (K6a)** | 7 / 3.196 | 1 / 223 (`allowed-paths-validator`) | lib no cableada: `repair-shadow/*` (3), `adversarial-challenges/runner`, `host-adapters/claude`, `independent-verifier/bindings`, `k12/pilot-executor`, `lifecycle-model`; dev: `k12-campaign.js`, `fixtures/k7-review-authority/*` | 19 | `worker-isolation`, `repair-shadow-orchestration` (nombra `worker-*`) | Ninguno (el review de IDD usa subagentes, no sandbox) | **Retirar** `worker-executor`, `worker-sandbox`, `-confine`, `-preload` y `test-support/k6a-worker-fixtures`. **Congelar `worker-workspace.js`**: su `computeTreeDigest` lo usan tests de módulos cableados (`review-k7-binding.test`, `assurance-graph/index.test`, `independent-verifier/index.test`) y la fixture K7 |
| **Assurance / verifier / provenance (K6b)** | 7 / 1.180 | 9 / 1.596 | lib no cableada: `k12/pilot-executor`; dev: fixture K7 | 10 | `independent-verification`, `assurance-graph` | **E1.4**: `obligation-coverage` y `strategy-policy` encajan con "cada obligación tiene evidencia registrada" | **Congelar con dueño E1.4** (index, bindings, challenge-evidence, obligation-coverage, strategy-policy, `test-support/k6b-runner-receipt`). `runner-receipt-store.js` va a **retirar** solo si se retira K2.1 (riesgo R4) |
| **Challenges (K6c)** | 6 / 852 | 2 / 232 (`catalog`, `integrity`, vía Assurance Graph) | ninguno en producción | 10 | `adversarial-challenges` | Ninguno | **Retirar** planner, runner, mutator, budget, diff-scope e index. Hay que editar `assurance-graph/index.test`, `independent-verifier/index.test` y `roadmap-boundary.test` |
| **Complexity delta (K6d)** | 4 / 225 | 0 | ninguno | 2 | `complexity-architecture-delta` | **E3.1** (explícito en el roadmap: la comprobación de promoción aprovecha el delta) | **Congelar con dueño E3.1** |
| **K12** | 7 / 2.538 | 0 | dev: `k12-campaign.js` | 8 | Sin spec propia (el esquema `run-manifest` está en `kernel-contract-schemas`; K12 se menciona en `minimal-kernel-harness`) | **E4.1** (explícito: "infraestructura de registro de agentes de K12 (`worker-record`)") | **Cablear con E4.1**: `worker-record`, `runner`, `run-manifest`, `cohort`, `obligation-oracle`, `pilot-checkpoint` (1.809 líneas). **Retirar** `pilot-executor` y `campaign-executor`: solo `pilot-executor` arrastra 43 ficheros / 13.738 líneas del kernel |
| **Attestation (K8)** | 2 / 832 | 0 | ninguno | 2 | `evaluation-attestation` | Aparcado con K10-delivery | **Retirar, decisión tuya.** Choca con "Aparcado: se conserva el código". `issuer.js` depende de `authority-store` y `lifecycle-kernel/permits`; conservar K8 obliga a conservar K2.1 |
| **Review K7 binding** | 0 | 1 / 551 | — | — | `evaluation-attestation` (lo nombra) | E1.4 | **Cableado ya**; fuera del inventario |
| **Contract lint / checkers (K1 + I/J)** | 15 / 3.154 | 0 | ninguno; lo ejecuta CI vía `scripts/contract-lint.test.js` | 15 | `contract-lint` (REQ-001…015) | E3.3 (el registro `runAllCheckers` sirve como base para las *fitness functions*) | **Mantener** `contract-lint.js`, `i1-manifest`, `i3-budget-constant` y `j1-commands-agents` (integridad viva de manifiestos, commands y presupuestos). **Congelar** `k1-schema-compat`, `k1-emission` y `k1-prose-authority` mientras `schemas/kernel` se distribuya. **Retirar** `k1-maturity`, `k4a-*`, `k5-*` y `k6a-*` con sus familias |
| **Verify-lineage satélites** | 2 / 231 (`verify-lineage-recheck`, `verify-evidence-classification`) | 0 | ninguno (solo tests; ninguna skill los cita) | 3 | `verify-lineage` (escenarios `recheck-pending`) | Ninguno en IDD (modo SDD) | **Congelar** (modo SDD) |
| **Otros** | 2 / 325 | — | `operation-identity-binding`: lo nombra la spec K8; `quality-review-kpis`: ninguno | 2 | `evaluation-attestation` (AIB) / ninguna | `quality-review-kpis` → E4.1 (tokens por gate) | **Retirar** `operation-identity-binding` (AIB-1: "no live SubagentStop or hook wiring by design"; E1.2 se entregó sin él). **Congelar** `quality-review-kpis` con dueño E4.1 |
| **Generador (target-\*, frontmatter, model-resolver)** | 11 / 2.285 | 0 | `configure/*` y `contract-checkers` i1/i3/j1 | 13 | `generator`, `install`, `codex-target`… | — | **Mantener**: excluido del runtime por diseño (`isExcludedRuntimeScript`) |
| **Tooling E0.x** (`context-baseline`, `agent-embed`, `rule-scope`, `skill-extras`) | 4 / 414 | 0 | `target-transform`, `measure-context-baseline.js` | 6 | `generator`, `skills` | E4.3 (`context-baseline`) | **Mantener** (se usa en build) |

Totales por propuesta, calculados en `buckets.js`: cada uno de los 108 ficheros está asignado exactamente una vez.

| Propuesta | Ficheros | Líneas |
| --- | ---: | ---: |
| Retirar | 64 | 19.695 |
| Congelar | 19 | 3.598 |
| Cablear con dueño (E4.1) | 6 | 1.809 |
| Mantener (tooling) | 19 | 3.459 |

**Lo que dejaría roto la propuesta tal cual** (`impact.js`):

- **Producción:** `contract-lint.js` (hay que quitar 8 checkers del registro) y `test-support/k6b-runner-receipt.js` (requiere `runner-receipt-store`).
- **CLI de desarrollo:** `k12-campaign.js` (requiere `campaign-executor` y `pilot-executor`).
- **27 tests por editar:**
  - Los dos e2e: `k4b-repair-shadow-e2e` y `k6a-e2e-worker-isolation`.
  - Los de challenges: `budget`, `diff-scope`, `integrity`, `planner` y `runner` de `adversarial-challenges`.
  - Los de módulos cableados: `assurance-graph/index`, `independent-verifier/index`, `runner-receipt-restart` y `runner-receipt-store`.
  - Los de attestation: `evaluation-attestation/index` e `issuer`.
  - Los de K12: `campaign-executor`, `pilot-checkpoint`, `pilot-executor` y `worker-record`.
  - Los de lifecycle: `k4a-lifecycle-model`, `lifecycle-kernel/index`, `permits` y `phase-completion-reducer`.
  - Los de workers y host: `repair-shadow/index`, `worker-executor` y `host-adapters/claude`.
  - Los de checkers: `k6a-canonical-contracts` y `k6a-checkers`.
  - Y `roadmap-boundary`.

  Cada test con lo que retira y lo que conserva está en el anexo C.

## 4. Tests y checkers que leen la arquitectura archivada

Fuente: `docs/roadmaps/archive/2026-10-03-arquitectura/harness-evolution.md`. Solo estos 5 ficheros de código citan `2026-10-03-arquitectura` (grep en `scripts/`, `test/` y `tests/`).

| Ruta | Líneas | Qué lee | Qué afirma | Qué se rompe si se retira | Propuesta |
| --- | ---: | --- | --- | --- | --- |
| `scripts/lib/contract-checkers/k1-maturity.js` (+ `k1-maturity.test.js`, 109) | 139 | La sección `## Registro de madurez` (l. 969) del documento archivado | Cada viñeta lleva exactamente una etiqueta `{implemented\|target\|experimental}` coherente con su subsección, y "Graph IR authority" nunca es `implemented` (REQ-contract-lint-011) | Hay que quitarlo de `DEFAULT_REGISTRY` en `scripts/lib/contract-lint.js`. Rompe la aserción `/k1-maturity/` de `scripts/contract-lint.test.js` ("includes the four K1 checkers"). Hay que retirar REQ-contract-lint-011 de `openspec/specs/contract-lint/spec.md` y la nota del README del archivo | **Retirar** (checker + test + REQ): valida un documento que ya no cambia |
| `scripts/lib/k21-maturity-docs.test.js` | 30 | Doc archivado + roadmap actual | Etiquetas `{implemented}`/`{target}` concretas en el archivo (K2.1, HostCapabilities, K2a, K3, Candidate freeze, CandidateEvaluationAttestation, DeliveryAuthorization) y que el roadmap actual case `K2\.1.*\*\*done\*\*\|Authority Store \(CAS\).*v2\.39\.0` | Nada en producción | **Retirar** |
| `scripts/lib/k2a-maturity-docs.test.js` | 49 | Doc archivado + roadmap actual | Etiquetas de madurez K2a/K3/K6b/K6c, y filas de la tabla "Base entregada": `` \| `done` \| **K3** ``, `**K4b**`, `**K6c**` y `**K6d**` en `done\|next-eligible`, más negativas sobre K4b/K6b/K6c | Nada en producción | **Retirar** |
| `scripts/lib/k3-readiness-reconciliation.test.js` | 102 | 3 `state.yaml` archivados de K3, su historial git, el roadmap actual y el doc archivado | Snapshots de reconciliación K3 (hashes contra `HEAD`/`HEAD~1`), hermanos inmutables, y que el roadmap mencione `k3-readiness-remediation … archivado\|done` y `K4a … done` | Nada en producción; exporta `ALLOWLIST`, `sha256` y `historicalManifest`, sin consumidores | **Retirar** entero. Las pruebas 1, 2 y 4 solo vigilan artefactos archivados; si quieres conservar la inmutabilidad del archivo, déjalas sin la 3 |
| `scripts/lib/roadmap-reconciliation.test.js` | 30 | `openspec/changes/archive/2026-08-10-k3-readiness-remediation/*`, el doc archivado y el roadmap actual | Estado archivado de esa change y que el roadmap actual tenga `` \| `(done\|next-eligible)` \| **K4a** \| `` | Nada en producción | **Retirar** |

**Acoplamiento con el roadmap actual.** Tres de estos tests (`k21`, `k2a`, `k3-readiness`) y `roadmap-reconciliation` fijan filas y textos de la tabla **"Base entregada"** de `docs/roadmaps/harness-evolution.md`. Si E1.5 reescribe esa tabla (por ejemplo, la columna "Uso en este roadmap", que hoy dice "E1.5") sin retirarlos, CI falla. `manifest-sync.test.js` también lee el roadmap actual, pero no el archivo.

## 5. Riesgos

- **R1. `k1-scope-guard.test.js` (`SUCCESSOR_K2_EXACT` y `SUCCESSOR_K2_PREFIXES`).**
  - **Por qué no rompe CI.** La prueba de inventario usa `git diff <pin 9aa6c45>`. Los ficheros creados después del pin y luego borrados desaparecen del diff, y ninguno de los 64 propuestos para retirar existía en el pin. Lo comprobé con `git ls-tree`.
  - **Qué sí la rompería.** Solo 4 no alcanzables existían en el pin y no están ni en el inventario congelado ni en las listas de sucesores: `contract-checkers/i1-manifest.js`, `i3-budget-constant.js`, `j1-commands-agents.js` y `frontmatter.js`. Borrarlos rompería la prueba; están en "mantener".
  - **Riesgo real.** 26 no alcanzables figuran por nombre exacto en `SUCCESSOR_K2_EXACT` y 69 por prefijo; de los propuestos para retirar, 14 por nombre y 45 por prefijo. Quedarían entradas muertas.
  - **Cómo limpiarlo.** La prueba "K2 successor paths are excluded…" afirma `isSuccessorK2Path` de rutas concretas: `lifecycle-model.js`, `minimal-kernel-harness.js`, `lifecycle-kernel/reducer.js`, `operation-identity-binding.js`, `k12/obligation-oracle.js`, `evaluation-attestation/index.js` y `k12-campaign.js`. También `isAllowedK1Path` y `isK1GovernedImplementationPath`. Limpiar las listas exige reescribir esas aserciones en el mismo PR.
- **R2. Otros guardias que enumeran ficheros de lib.**
  - `roadmap-boundary.test.js` hace `readdirSync` de `execution-identities/`, `execution-graph/`, `repair-shadow/` y `complexity-architecture-delta/` (falla con ENOENT si se borra el directorio). Requiere `adversarial-challenges/index.js` y `complexity-architecture-delta/index.js`. La lista de workers está protegida con `existsSync`.
  - `contract-checkers/k6a-candidate-prohibition.js` lee `worker-executor.js`, `worker-workspace.js` y `allowed-paths-validator.js`, y tolera su ausencia (`existsSync`).
  - `lifecycle-kernel/{scope-guard,k2a-scope-guard,k21-scope-guard}.test.js` recorren el árbol de `lifecycle-kernel/` y `authority-store/`; se retiran con su familia.
  - `i3-budget-constant.js` lee `target-profiles/codex.js`.
- **R3. Módulos alcanzables solo vía tests.** 46 ficheros (11.353 líneas) no se alcanzan ni desde el runtime ni desde ningún CLI de desarrollo, solo desde tests (lista en el anexo B, columna "Alcanzable desde CLI dev = no"). Entre ellos están `lifecycle-model.js` (2.210), `host-adapters/claude.js` (661), `evaluation-attestation/*` (832), `adversarial-challenges/*` sin cablear (852) y todos los `contract-checkers`.
  - **Sin test directo:** 8 no alcanzables: `complexity-architecture-delta/{advisory,analyzer,integrity}`, `independent-verifier/{bindings,challenge-evidence,strategy-policy}`, `target-profiles/antigravity` y `worker-sandbox-preload`. Este último lo ejercitan por ruta los tests de `worker-sandbox`.
  - **Tests que CI no ejecuta:** `test/e2e/k5-e2e-budgets-recovery.test.js` y `test/e2e/k6b-verifier-assurance-graph-e2e.test.js`. `check.js:98` solo ejecuta `scripts/**/*.test.js` y `tests/**/*.test.js`, y son copias que divergen de sus homónimos en `scripts/`.
- **R4. Dependencias entre familias que se quedan y que se retiran.**
  - **Ciclos.** Hay dos componentes fuertemente conexos, los dos dentro del runtime: `{execution-graph/binding, execution-graph/compiler, execution-identities/index}` y `{assurance-graph/index, assurance-graph/projector, review-k7-binding, review-lineage}`. Los cierran `require` perezosos dentro de funciones. No hay ciclos entre código cableado y no cableado: ningún módulo de B requiere uno no alcanzable. Pero retirar Execution Graph o Assurance Graph obliga a tocar `review-lineage`, es decir, el review gate que E1.4 reutiliza.
  - **Acoplamientos que fijan la propuesta.**
    - `independent-verifier/runner-receipt-store.js` usa 3 helpers de `authority-store/index.js` (`computeRevision`, `findReceiptKindMismatch` e `isRunnerReceiptsMap`), y `test-support/k6b-runner-receipt.js` (que necesitan los tests de `review-k7-binding` y `assurance-graph`) depende de él. Retirar K2.1 exige mover esos helpers o reescribir el soporte de tests K6b.
    - `lifecycle-kernel/k1-compat.js` lo requieren 7 tests de fixtures de `schemas/kernel`: `k3`, `k6b`, `k6c`, `k6d`, `k8`, `kernel-schema-fixtures` y `k21-k1-compat`.
    - `worker-workspace.js` lo requieren 15 tests, entre ellos `review-k7-binding.test` y `assurance-graph/index.test`, que prueban módulos cableados.
    - `k12/worker-record.test.js` (lo que E4.1 quiere) requiere `pilot-executor`, que arrastra el kernel. Mantener K12 tal cual mantiene vivo casi todo el kernel: `k12-campaign.js` alcanza 47 no alcanzables.
- **R5. Prosa que cita módulos no distribuidos.** `skills/_shared/gate-archive-quality.md`, `skills/sdd-archive/SKILL.md`, `agents/sdd-archive.agent.md`, `skills/sdd-apply/SKILL.md`, `skills/sdd-verify/SKILL.md`, `skills/_shared/dispatch-lifecycle-hooks.md` y `openspec-convention.md` mandan ejecutar o llamar a `archive-transaction-run.js`, `verify-lineage.js`, `apply-resume.js`, `quality-gates.js` y `lifecycle-hooks.js`. Ninguno está en `RUNTIME_ENTRY_SCRIPTS` ni en el cierre de los hooks, así que en un proyecto consumidor no existen. Para E1.4 (`ospec close` sobre O6A) hay que añadir `archive-transaction.js` al runtime, por `ospec.js` o en la lista.
- **R6. Specs que habría que retirar o recortar en el mismo PR si se acepta la propuesta.** `authority-store`, `operation-permits`, `effect-semantics`, `harness-authority-canon`, `lifecycle-kernel-runtime`, `lifecycle-model-conformance`, `minimal-kernel-harness`, `transition-surface-parity`, `headless-conformance-host`, `reference-host-adapter`, `host-capabilities-contract`, `capability-proof`, `execution-budgets`, `failure-recovery`, `worker-isolation`, `repair-shadow-orchestration`, `adversarial-challenges` y `evaluation-attestation`. También `contract-lint` (REQ-011…015 de los checkers k1-maturity/k4a/k5) y los REQ de `roadmap-boundary` (REQ-harness-authority-canon-010…013, REQ-repair-shadow-007). Los esquemas de `schemas/kernel` que solo sirven a estas familias se distribuyen a los consumidores; la decisión sobre ellos debería ir pareja.

## Anexo A. Cifras por familia (generadas por `appendix.js`)

| Familia | No alcanzables (ficheros / líneas) | Alcanzables de la misma familia (ficheros / líneas) | Tests directos | Consumidores de producción fuera de la familia |
|---|---|---|---|---|
| challenges (K6c) | 6 / 852 | 2 / 232 | 10 | ninguno |
| dev tooling E0.x (context-baseline, agent-embed, rule-scope, skill-extras) | 4 / 414 | 0 / 0 | 6 | lib no cableada: target-transform.js; otros: measure-context-baseline.js |
| otros | 2 / 325 | 38 / 16606 | 2 | lib no cableada: evaluation-attestation/issuer.js |
| worker-* (K6a) | 7 / 3196 | 1 / 223 | 19 | lib no cableada: adversarial-challenges/runner.js, host-adapters/claude.js, independent-verifier/bindings.js, k12/pilot-executor.js, lifecycle-model.js, repair-shadow/effective-shadow-base.js, repair-shadow/orchestrator.js, repair-shadow/patch-integrator.js; otros: fixtures/k7-review-authority/reducer-issued-lineage.js, k12-campaign.js |
| assurance/verifier/provenance (K6b) | 7 / 1180 | 9 / 1596 | 10 | lib no cableada: k12/pilot-executor.js; otros: fixtures/k7-review-authority/reducer-issued-lineage.js |
| authority/permit/CAS (K2.1) | 7 / 1944 | 0 / 0 | 13 | lib no cableada: evaluation-attestation/issuer.js, filesystem-store.js, independent-verifier/runner-receipt-store.js, lifecycle-kernel/index.js, lifecycle-kernel/operations.js, lifecycle-model.js, minimal-kernel-harness.js, repair-shadow/execution-record-store.js |
| conformance host / host adapters / capability proof (K2a) | 6 / 2286 | 0 / 0 | 15 | lib no cableada: lifecycle-kernel/host-boundary.js, lifecycle-model.js, minimal-kernel-harness.js, test-support/k6a-worker-fixtures.js, worker-executor.js |
| budgets/recovery (K5) | 3 / 746 | 0 / 0 | 5 | lib no cableada: adversarial-challenges/budget.js, lifecycle-kernel/host-boundary.js, lifecycle-kernel/index.js, lifecycle-kernel/internal/permit-authority.js, lifecycle-kernel/operations.js, lifecycle-kernel/reducer.js, lifecycle-kernel/transition-selector.js, lifecycle-model.js |
| complexity delta (K6d) | 4 / 225 | 0 / 0 | 2 | ninguno |
| contract lint / checkers (K1 + I/J) | 15 / 3154 | 0 / 0 | 15 | ninguno |
| attestation (K8) | 2 / 832 | 0 / 0 | 2 | ninguno |
| execution-graph | 1 / 167 | 10 / 2315 | 4 | lib no cableada: lifecycle-model.js |
| generator-only (target-*, frontmatter, model-resolver) | 11 / 2285 | 0 / 0 | 13 | lib no cableada: agent-embed.js, context-baseline.js, contract-checkers/i1-manifest.js, contract-checkers/i3-budget-constant.js, contract-checkers/j1-commands-agents.js, host-adapters/claude.js, rule-scope.js; otros: configure/cli.js, configure/installer-adapter.js, configure/shared-dir.js, configure/validate-antigravity.js, configure/validate-cursor.js, configure/validate-github-copilot.js, configure/validate-opencode.js |
| k12 | 7 / 2538 | 0 / 0 | 8 | lib no cableada: k12/worker-record.js; otros: k12-campaign.js |
| lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | 18 / 6163 | 1 / 305 | 40 | lib no cableada: authority-store/index.js, evaluation-attestation/issuer.js, filesystem-store.js, k12/campaign-executor.js, k12/pilot-executor.js |
| repair shadow (K4b) | 6 / 2023 | 0 / 0 | 3 | lib no cableada: k12/pilot-executor.js |
| verify-lineage satellites | 2 / 231 | 0 / 0 | 3 | ninguno |

## Anexo B. Lista completa de ficheros no alcanzables (`scripts/lib`, producción, conjunto B)

| Fichero | Líneas | Familia | Propuesta | Consumidores lib | Otros consumidores prod | Tests directos | Alcanzable desde CLI dev |
|---|---|---|---|---|---|---|---|
| `independent-verifier/bindings.js` | 104 | assurance/verifier/provenance (K6b) | CONGELAR | independent-verifier/index.js | — | 0 | sí |
| `independent-verifier/challenge-evidence.js` | 32 | assurance/verifier/provenance (K6b) | CONGELAR | independent-verifier/index.js | — | 0 | sí |
| `independent-verifier/index.js` | 286 | assurance/verifier/provenance (K6b) | CONGELAR | k12/pilot-executor.js | fixtures/k7-review-authority/reducer-issued-lineage.js | 8 | sí |
| `independent-verifier/obligation-coverage.js` | 141 | assurance/verifier/provenance (K6b) | CONGELAR | independent-verifier/index.js | — | 1 | sí |
| `independent-verifier/runner-receipt-store.js` | 168 | assurance/verifier/provenance (K6b) | RETIRAR | test-support/k6b-runner-receipt.js | — | 2 | sí |
| `independent-verifier/strategy-policy.js` | 360 | assurance/verifier/provenance (K6b) | CONGELAR | independent-verifier/index.js | — | 0 | sí |
| `test-support/k6b-runner-receipt.js` | 89 | assurance/verifier/provenance (K6b) | CONGELAR | k12/pilot-executor.js | fixtures/k7-review-authority/reducer-issued-lineage.js | 9 | sí |
| `evaluation-attestation/index.js` | 334 | attestation (K8) | RETIRAR | evaluation-attestation/issuer.js | — | 2 | no |
| `evaluation-attestation/issuer.js` | 498 | attestation (K8) | RETIRAR | — | — | 1 | no |
| `authority-canon.js` | 207 | authority/permit/CAS (K2.1) | RETIRAR | — | — | 1 | no |
| `authority-store/index.js` | 747 | authority/permit/CAS (K2.1) | RETIRAR | filesystem-store.js, independent-verifier/runner-receipt-store.js, lifecycle-kernel/index.js, lifecycle-model.js, repair-shadow/execution-record-store.js | — | 6 | sí |
| `lifecycle-kernel/effect-policy.js` | 114 | authority/permit/CAS (K2.1) | RETIRAR | lifecycle-kernel/index.js, lifecycle-model.js | — | 2 | sí |
| `lifecycle-kernel/internal/permit-authority.js` | 407 | authority/permit/CAS (K2.1) | RETIRAR | lifecycle-kernel/index.js, lifecycle-kernel/permits.js, test-support/permit-test-helpers.js | — | 1 | sí |
| `lifecycle-kernel/permits.js` | 300 | authority/permit/CAS (K2.1) | RETIRAR | evaluation-attestation/issuer.js, lifecycle-kernel/index.js, lifecycle-kernel/operations.js, lifecycle-model.js, test-support/permit-test-helpers.js | — | 4 | sí |
| `lifecycle-kernel/test-permit-helpers.js` | 5 | authority/permit/CAS (K2.1) | RETIRAR | — | — | 2 | no |
| `test-support/permit-test-helpers.js` | 164 | authority/permit/CAS (K2.1) | RETIRAR | lifecycle-kernel/test-permit-helpers.js, lifecycle-model.js, minimal-kernel-harness.js | — | 6 | sí |
| `causal-failure.js` | 156 | budgets/recovery (K5) | RETIRAR | adversarial-challenges/budget.js, lifecycle-kernel/host-boundary.js, lifecycle-kernel/index.js, lifecycle-kernel/operations.js, lifecycle-kernel/transition-selector.js, lifecycle-model.js | — | 3 | sí |
| `execution-budgets.js` | 433 | budgets/recovery (K5) | RETIRAR | lifecycle-kernel/index.js, lifecycle-kernel/internal/permit-authority.js, lifecycle-kernel/reducer.js, lifecycle-kernel/transition-selector.js, lifecycle-model.js | — | 2 | sí |
| `failure-recovery.js` | 157 | budgets/recovery (K5) | RETIRAR | lifecycle-kernel/index.js, lifecycle-kernel/operations.js, lifecycle-kernel/transition-selector.js, lifecycle-model.js | — | 2 | sí |
| `adversarial-challenges/budget.js` | 66 | challenges (K6c) | RETIRAR | adversarial-challenges/index.js, adversarial-challenges/runner.js | — | 2 | no |
| `adversarial-challenges/diff-scope.js` | 69 | challenges (K6c) | RETIRAR | adversarial-challenges/index.js, adversarial-challenges/runner.js | — | 1 | no |
| `adversarial-challenges/index.js` | 62 | challenges (K6c) | RETIRAR | — | — | 2 | no |
| `adversarial-challenges/mutator.js` | 149 | challenges (K6c) | RETIRAR | adversarial-challenges/index.js, adversarial-challenges/runner.js | — | 1 | no |
| `adversarial-challenges/planner.js` | 169 | challenges (K6c) | RETIRAR | adversarial-challenges/index.js | — | 5 | no |
| `adversarial-challenges/runner.js` | 337 | challenges (K6c) | RETIRAR | adversarial-challenges/index.js | — | 4 | no |
| `complexity-architecture-delta/advisory.js` | 37 | complexity delta (K6d) | CONGELAR | complexity-architecture-delta/index.js | — | 0 | no |
| `complexity-architecture-delta/analyzer.js` | 27 | complexity delta (K6d) | CONGELAR | complexity-architecture-delta/index.js | — | 0 | no |
| `complexity-architecture-delta/index.js` | 55 | complexity delta (K6d) | CONGELAR | — | — | 2 | no |
| `complexity-architecture-delta/integrity.js` | 106 | complexity delta (K6d) | CONGELAR | complexity-architecture-delta/index.js | — | 0 | no |
| `capability-proof/index.js` | 349 | conformance host / host adapters / capability proof (K2a) | RETIRAR | host-adapters/claude.js, host-contract/index.js, lifecycle-model.js | — | 7 | sí |
| `filesystem-store.js` | 281 | conformance host / host adapters / capability proof (K2a) | RETIRAR | — | — | 4 | no |
| `headless-conformance-host.js` | 383 | conformance host / host adapters / capability proof (K2a) | RETIRAR | lifecycle-model.js, minimal-kernel-harness.js | — | 2 | sí |
| `host-adapters/claude.js` | 661 | conformance host / host adapters / capability proof (K2a) | RETIRAR | host-adapters/registry.js, lifecycle-model.js, test-support/k6a-worker-fixtures.js | — | 7 | no |
| `host-adapters/registry.js` | 71 | conformance host / host adapters / capability proof (K2a) | RETIRAR | lifecycle-model.js | — | 1 | no |
| `host-contract/index.js` | 541 | conformance host / host adapters / capability proof (K2a) | RETIRAR | headless-conformance-host.js, host-adapters/claude.js, lifecycle-kernel/host-boundary.js, lifecycle-model.js, worker-executor.js | — | 5 | sí |
| `contract-checkers/i1-manifest.js` | 228 | contract lint / checkers (K1 + I/J) | MANTENER (tooling dev, fuera del runtime por diseño) | contract-lint.js | — | 1 | no |
| `contract-checkers/i3-budget-constant.js` | 214 | contract lint / checkers (K1 + I/J) | MANTENER (tooling dev, fuera del runtime por diseño) | contract-lint.js | — | 2 | no |
| `contract-checkers/j1-commands-agents.js` | 230 | contract lint / checkers (K1 + I/J) | MANTENER (tooling dev, fuera del runtime por diseño) | contract-lint.js | — | 2 | no |
| `contract-checkers/k1-emission.js` | 275 | contract lint / checkers (K1 + I/J) | CONGELAR | contract-lint.js | — | 1 | no |
| `contract-checkers/k1-maturity.js` | 139 | contract lint / checkers (K1 + I/J) | RETIRAR | contract-lint.js | — | 1 | no |
| `contract-checkers/k1-prose-authority.js` | 173 | contract lint / checkers (K1 + I/J) | CONGELAR | contract-lint.js | — | 1 | no |
| `contract-checkers/k1-schema-compat.js` | 578 | contract lint / checkers (K1 + I/J) | CONGELAR | contract-lint.js | — | 1 | no |
| `contract-checkers/k4a-microscopic-nodes.js` | 109 | contract lint / checkers (K1 + I/J) | RETIRAR | contract-lint.js | — | 1 | no |
| `contract-checkers/k4a-obligation-completeness.js` | 123 | contract lint / checkers (K1 + I/J) | RETIRAR | contract-lint.js | — | 1 | no |
| `contract-checkers/k5-budget-structure.js` | 229 | contract lint / checkers (K1 + I/J) | RETIRAR | contract-lint.js | — | 1 | no |
| `contract-checkers/k5-failure-transition-matrix.js` | 183 | contract lint / checkers (K1 + I/J) | RETIRAR | contract-lint.js | — | 1 | no |
| `contract-checkers/k6a-candidate-prohibition.js` | 138 | contract lint / checkers (K1 + I/J) | RETIRAR | contract-lint.js | — | 1 | no |
| `contract-checkers/k6a-canonical-contracts.js` | 356 | contract lint / checkers (K1 + I/J) | RETIRAR | contract-lint.js | — | 1 | no |
| `contract-checkers/k6a-capsule-path-containment.js` | 91 | contract lint / checkers (K1 + I/J) | RETIRAR | contract-lint.js | — | 1 | no |
| `contract-lint.js` | 88 | contract lint / checkers (K1 + I/J) | MANTENER (tooling dev, fuera del runtime por diseño) | — | — | 4 | no |
| `agent-embed.js` | 148 | dev tooling E0.x (context-baseline, agent-embed, rule-scope, skill-extras) | MANTENER (tooling dev, fuera del runtime por diseño) | target-transform.js | — | 1 | sí |
| `context-baseline.js` | 183 | dev tooling E0.x (context-baseline, agent-embed, rule-scope, skill-extras) | MANTENER (tooling dev, fuera del runtime por diseño) | — | measure-context-baseline.js | 3 | sí |
| `rule-scope.js` | 59 | dev tooling E0.x (context-baseline, agent-embed, rule-scope, skill-extras) | MANTENER (tooling dev, fuera del runtime por diseño) | target-transform.js | — | 1 | sí |
| `skill-extras.js` | 24 | dev tooling E0.x (context-baseline, agent-embed, rule-scope, skill-extras) | MANTENER (tooling dev, fuera del runtime por diseño) | target-transform.js | — | 3 | sí |
| `test-support/execution-graph-fixtures.js` | 167 | execution-graph | CONGELAR | lifecycle-model.js | — | 4 | no |
| `frontmatter.js` | 169 | generator-only (target-*, frontmatter, model-resolver) | MANTENER (tooling dev, fuera del runtime por diseño) | agent-embed.js, context-baseline.js, contract-checkers/i1-manifest.js, contract-checkers/j1-commands-agents.js, rule-scope.js, target-transform.js | configure/validate-antigravity.js, configure/validate-cursor.js, configure/validate-github-copilot.js, configure/validate-opencode.js | 7 | sí |
| `model-resolver.js` | 211 | generator-only (target-*, frontmatter, model-resolver) | MANTENER (tooling dev, fuera del runtime por diseño) | target-transform.js | configure/cli.js, configure/installer-adapter.js | 2 | sí |
| `target-profiles/antigravity.js` | 47 | generator-only (target-*, frontmatter, model-resolver) | MANTENER (tooling dev, fuera del runtime por diseño) | — | configure/cli.js | 0 | sí |
| `target-profiles/claude.js` | 83 | generator-only (target-*, frontmatter, model-resolver) | MANTENER (tooling dev, fuera del runtime por diseño) | host-adapters/claude.js | configure/cli.js | 2 | sí |
| `target-profiles/codex.js` | 91 | generator-only (target-*, frontmatter, model-resolver) | MANTENER (tooling dev, fuera del runtime por diseño) | contract-checkers/i3-budget-constant.js | configure/cli.js | 2 | sí |
| `target-profiles/cursor.js` | 66 | generator-only (target-*, frontmatter, model-resolver) | MANTENER (tooling dev, fuera del runtime por diseño) | — | configure/cli.js | 1 | sí |
| `target-profiles/github-copilot.js` | 80 | generator-only (target-*, frontmatter, model-resolver) | MANTENER (tooling dev, fuera del runtime por diseño) | — | configure/cli.js | 1 | sí |
| `target-profiles/opencode-plugin.js` | 100 | generator-only (target-*, frontmatter, model-resolver) | MANTENER (tooling dev, fuera del runtime por diseño) | target-profiles/opencode.js | — | 1 | sí |
| `target-profiles/opencode.js` | 97 | generator-only (target-*, frontmatter, model-resolver) | MANTENER (tooling dev, fuera del runtime por diseño) | — | configure/cli.js | 1 | sí |
| `target-profiles/vscode.js` | 15 | generator-only (target-*, frontmatter, model-resolver) | MANTENER (tooling dev, fuera del runtime por diseño) | — | configure/cli.js | 1 | sí |
| `target-transform.js` | 1326 | generator-only (target-*, frontmatter, model-resolver) | MANTENER (tooling dev, fuera del runtime por diseño) | context-baseline.js | configure/cli.js, configure/shared-dir.js | 5 | sí |
| `k12/campaign-executor.js` | 201 | k12 | RETIRAR | — | k12-campaign.js | 1 | sí |
| `k12/cohort.js` | 214 | k12 | CABLEAR (E4.1) | k12/pilot-checkpoint.js | k12-campaign.js | 6 | sí |
| `k12/obligation-oracle.js` | 215 | k12 | CABLEAR (E4.1) | k12/cohort.js, k12/pilot-executor.js | — | 1 | sí |
| `k12/pilot-checkpoint.js` | 208 | k12 | CABLEAR (E4.1) | — | k12-campaign.js | 2 | sí |
| `k12/pilot-executor.js` | 676 | k12 | RETIRAR | — | k12-campaign.js | 3 | sí |
| `k12/run-manifest.js` | 326 | k12 | CABLEAR (E4.1) | k12/runner.js | — | 1 | sí |
| `k12/runner.js` | 698 | k12 | CABLEAR (E4.1) | k12/pilot-checkpoint.js, k12/pilot-executor.js, k12/worker-record.js | k12-campaign.js | 5 | sí |
| `kernel-aliases.js` | 134 | lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | RETIRAR | — | — | 1 | no |
| `lifecycle-kernel/bridges.js` | 191 | lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | RETIRAR | — | — | 1 | no |
| `lifecycle-kernel/events.js` | 50 | lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | RETIRAR | lifecycle-kernel/index.js, lifecycle-model.js | — | 1 | sí |
| `lifecycle-kernel/host-boundary.js` | 140 | lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | RETIRAR | lifecycle-kernel/index.js | — | 1 | sí |
| `lifecycle-kernel/index.js` | 1215 | lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | RETIRAR | k12/pilot-executor.js, lifecycle-model.js, minimal-kernel-harness.js | — | 8 | sí |
| `lifecycle-kernel/journal.js` | 137 | lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | RETIRAR | authority-store/index.js, evaluation-attestation/issuer.js, filesystem-store.js, lifecycle-kernel/index.js, lifecycle-kernel/memory-store.js, lifecycle-model.js | — | 4 | sí |
| `lifecycle-kernel/k1-compat.js` | 252 | lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | CONGELAR | — | — | 8 | no |
| `lifecycle-kernel/memory-store.js` | 42 | lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | RETIRAR | authority-store/index.js, lifecycle-kernel/index.js, lifecycle-model.js | — | 2 | sí |
| `lifecycle-kernel/operations.js` | 181 | lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | RETIRAR | lifecycle-kernel/index.js, lifecycle-kernel/reducer.js, lifecycle-model.js | — | 4 | sí |
| `lifecycle-kernel/recovery.js` | 105 | lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | RETIRAR | lifecycle-kernel/index.js, transition-parity.js | — | 2 | sí |
| `lifecycle-kernel/reducer.js` | 306 | lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | RETIRAR | lifecycle-kernel/index.js, lifecycle-model.js | — | 3 | sí |
| `lifecycle-kernel/scope-guard.js` | 175 | lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | RETIRAR | lifecycle-model.js | — | 3 | no |
| `lifecycle-kernel/state-digest.js` | 42 | lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | RETIRAR | authority-store/index.js, lifecycle-kernel/events.js, lifecycle-kernel/index.js, lifecycle-kernel/journal.js, lifecycle-kernel/operations.js, lifecycle-kernel/recovery.js, lifecycle-model.js, transition-parity.js | — | 11 | sí |
| `lifecycle-kernel/transition-selector.js` | 173 | lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | RETIRAR | lifecycle-kernel/index.js, lifecycle-kernel/recovery.js, lifecycle-model.js | — | 3 | sí |
| `lifecycle-model.js` | 2210 | lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | RETIRAR | — | — | 4 | no |
| `minimal-kernel-harness.js` | 355 | lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | RETIRAR | k12/campaign-executor.js, k12/pilot-executor.js, lifecycle-model.js | — | 5 | sí |
| `next-transition.js` | 243 | lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | RETIRAR | — | — | 1 | no |
| `transition-parity.js` | 212 | lifecycle (K2: lifecycle-model, lifecycle-kernel, minimal harness) | RETIRAR | — | — | 2 | no |
| `operation-identity-binding.js` | 241 | otros | RETIRAR | evaluation-attestation/issuer.js | — | 1 | no |
| `quality-review-kpis.js` | 84 | otros | CONGELAR | — | — | 1 | no |
| `repair-shadow/effective-shadow-base.js` | 79 | repair shadow (K4b) | RETIRAR | repair-shadow/orchestrator.js, repair-shadow/patch-integrator.js | — | 1 | sí |
| `repair-shadow/execution-record-store.js` | 379 | repair shadow (K4b) | RETIRAR | repair-shadow/index.js, repair-shadow/orchestrator.js | — | 2 | sí |
| `repair-shadow/index.js` | 22 | repair shadow (K4b) | RETIRAR | k12/pilot-executor.js | — | 2 | sí |
| `repair-shadow/orchestrator.js` | 646 | repair shadow (K4b) | RETIRAR | repair-shadow/index.js | — | 2 | sí |
| `repair-shadow/patch-integrator.js` | 669 | repair shadow (K4b) | RETIRAR | repair-shadow/index.js, repair-shadow/orchestrator.js | — | 1 | sí |
| `repair-shadow/shadow-comparator.js` | 228 | repair shadow (K4b) | RETIRAR | repair-shadow/index.js, repair-shadow/orchestrator.js | — | 1 | sí |
| `verify-evidence-classification.js` | 97 | verify-lineage satellites | CONGELAR | — | — | 2 | no |
| `verify-lineage-recheck.js` | 134 | verify-lineage satellites | CONGELAR | — | — | 1 | no |
| `k12/worker-record.js` | 148 | worker-* (K6a) | CABLEAR (E4.1) | — | k12-campaign.js | 1 | sí |
| `test-support/k6a-worker-fixtures.js` | 45 | worker-* (K6a) | RETIRAR | — | — | 2 | no |
| `worker-executor.js` | 1083 | worker-* (K6a) | RETIRAR | lifecycle-model.js, repair-shadow/orchestrator.js | — | 4 | sí |
| `worker-sandbox-confine.js` | 134 | worker-* (K6a) | RETIRAR | worker-sandbox-preload.js, worker-sandbox.js | — | 1 | sí |
| `worker-sandbox-preload.js` | 880 | worker-* (K6a) | RETIRAR | — | — | 0 | no |
| `worker-sandbox.js` | 305 | worker-* (K6a) | RETIRAR | adversarial-challenges/runner.js, host-adapters/claude.js, lifecycle-model.js, worker-executor.js | — | 5 | sí |
| `worker-workspace.js` | 601 | worker-* (K6a) | CONGELAR | adversarial-challenges/runner.js, independent-verifier/bindings.js, k12/pilot-executor.js, lifecycle-model.js, repair-shadow/effective-shadow-base.js, repair-shadow/orchestrator.js, repair-shadow/patch-integrator.js, worker-executor.js | fixtures/k7-review-authority/reducer-issued-lineage.js | 15 | sí |


Total: 108 ficheros, 28561 líneas.


## Anexo B2. Ficheros alcanzables de `scripts/lib` (conjunto B)

| Fichero | Líneas | En dist (A) |
|---|---|---|
| `adversarial-challenges/catalog.js` | 51 | sí |
| `adversarial-challenges/integrity.js` | 181 | sí |
| `agent-identity.js` | 92 | sí |
| `allowed-paths-validator.js` | 223 | sí |
| `apply-resume.js` | 85 | no (solo citado en prosa) |
| `archive-plan.js` | 520 | sí |
| `archive-transaction.js` | 1269 | no (solo citado en prosa) |
| `artifact-store-modes.js` | 13 | sí |
| `artifact-store.js` | 361 | sí |
| `assurance-graph/index.js` | 355 | sí |
| `assurance-graph/invalidation.js` | 96 | sí |
| `assurance-graph/projector.js` | 383 | sí |
| `atomic-write.js` | 190 | sí |
| `canonical-json.js` | 31 | sí |
| `capability-registry.js` | 148 | sí |
| `change-classification.js` | 211 | sí |
| `context-measurement.js` | 206 | sí |
| `execution-graph/binding.js` | 166 | sí |
| `execution-graph/clarify.js` | 163 | sí |
| `execution-graph/compiler.js` | 354 | sí |
| `execution-graph/dag.js` | 204 | sí |
| `execution-graph/index.js` | 92 | sí |
| `execution-graph/obligation-manifest.js` | 92 | sí |
| `execution-graph/policy-snapshot.js` | 163 | sí |
| `execution-graph/replay-engine.js` | 353 | sí |
| `execution-graph/shadow-comparator.js` | 265 | sí |
| `execution-graph/work-order-compiler.js` | 463 | sí |
| `execution-identities/index.js` | 1228 | sí |
| `federation-baseline-orchestrator.js` | 427 | sí |
| `federation-explore.js` | 311 | sí |
| `federation-marker.js` | 464 | sí |
| `flow-validator.js` | 105 | sí |
| `idd-contract.js` | 234 | sí |
| `idd-next.js` | 127 | sí |
| `idd-record.js` | 253 | sí |
| `idd-store.js` | 154 | sí |
| `independent-verifier/assessment.js` | 202 | sí |
| `independent-verifier/collector-provenance.js` | 86 | sí |
| `independent-verifier/evidence.js` | 178 | sí |
| `independent-verifier/internal/runner-receipt-channel.js` | 99 | sí |
| `independent-verifier/runner-receipt.js` | 141 | sí |
| `independent-verifier/verdict.js` | 56 | sí |
| `kernel-schema-validator.js` | 591 | sí |
| `lifecycle-hooks.js` | 478 | no (solo citado en prosa) |
| `lifecycle-kernel/phase-completion-reducer.js` | 305 | sí |
| `ospec-state.js` | 1563 | sí |
| `pathsafe.js` | 67 | sí |
| `quality-gates.js` | 444 | no (solo citado en prosa) |
| `result-envelope.js` | 557 | sí |
| `review-dimensions.js` | 875 | sí |
| `review-gate-state.js` | 326 | sí |
| `review-k7-binding.js` | 551 | sí |
| `review-lineage.js` | 1692 | sí |
| `review-taxonomy.js` | 109 | sí |
| `route-dispatcher.js` | 1055 | sí |
| `skill-registry.js` | 400 | sí |
| `strict-tdd-evidence-remediation.js` | 499 | sí |
| `tdd-mode.js` | 27 | sí |
| `verify-lineage-candidate-store.js` | 413 | no (solo citado en prosa) |
| `verify-lineage-recovery.js` | 339 | no (solo citado en prosa) |
| `verify-lineage.js` | 917 | no (solo citado en prosa) |
| `workspace-atlas.js` | 898 | sí |
| `workspace-general-baseline.js` | 155 | sí |


## Anexo C. Tests que habría que editar con la propuesta de retirada (27)

| Test | Líneas | Requiere (se retira) | Requiere (se queda) |
|---|---:|---|---|
| `scripts/k4b-repair-shadow-e2e.test.js` | 503 | filesystem-store.js, host-adapters/claude.js, repair-shadow/execution-record-store.js, repair-shadow/index.js, test-support/k6a-worker-fixtures.js, worker-executor.js, worker-sandbox.js | execution-graph/index.js, execution-identities/index.js, worker-workspace.js |
| `scripts/k6a-e2e-worker-isolation.test.js` | 1488 | capability-proof/index.js, host-adapters/claude.js, test-support/k6a-worker-fixtures.js, worker-executor.js, worker-sandbox.js | allowed-paths-validator.js, canonical-json.js, execution-graph/index.js, execution-identities/index.js, kernel-schema-validator.js, worker-workspace.js |
| `scripts/lib/adversarial-challenges/budget.test.js` | 105 | adversarial-challenges/budget.js | kernel-schema-validator.js |
| `scripts/lib/adversarial-challenges/diff-scope.test.js` | 21 | adversarial-challenges/diff-scope.js | execution-identities/index.js, worker-workspace.js |
| `scripts/lib/adversarial-challenges/integrity.test.js` | 50 | adversarial-challenges/planner.js, adversarial-challenges/runner.js | adversarial-challenges/integrity.js |
| `scripts/lib/adversarial-challenges/planner.test.js` | 213 | adversarial-challenges/planner.js | adversarial-challenges/catalog.js, kernel-schema-validator.js |
| `scripts/lib/adversarial-challenges/runner.test.js` | 568 | adversarial-challenges/budget.js, adversarial-challenges/planner.js, adversarial-challenges/runner.js | execution-graph/index.js, execution-identities/index.js, worker-workspace.js |
| `scripts/lib/assurance-graph/index.test.js` | 1157 | adversarial-challenges/planner.js, adversarial-challenges/runner.js | assurance-graph/index.js, assurance-graph/projector.js, execution-graph/index.js, execution-identities/index.js, independent-verifier/assessment.js, independent-verifier/index.js, independent-verifier/runner-receipt.js, test-support/k6b-runner-receipt.js, worker-workspace.js |
| `scripts/lib/contract-checkers/k6a-canonical-contracts.test.js` | 148 | contract-checkers/k6a-canonical-contracts.js | contract-lint.js |
| `scripts/lib/contract-checkers/k6a-checkers.test.js` | 79 | contract-checkers/k6a-candidate-prohibition.js, contract-checkers/k6a-capsule-path-containment.js | contract-lint.js |
| `scripts/lib/evaluation-attestation/index.test.js` | 545 | evaluation-attestation/index.js | canonical-json.js, execution-graph/index.js, execution-identities/index.js, independent-verifier/index.js, kernel-schema-validator.js, review-k7-binding.js, review-lineage.js, test-support/k6b-runner-receipt.js, worker-workspace.js |
| `scripts/lib/evaluation-attestation/issuer.test.js` | 905 | authority-store/index.js, evaluation-attestation/index.js, evaluation-attestation/issuer.js, lifecycle-kernel/journal.js, lifecycle-kernel/permits.js, test-support/permit-test-helpers.js | execution-graph/index.js, execution-identities/index.js, independent-verifier/index.js, review-k7-binding.js, review-lineage.js, test-support/k6b-runner-receipt.js, worker-workspace.js |
| `scripts/lib/host-adapters/claude.test.js` | 417 | capability-proof/index.js, host-adapters/claude.js, host-contract/index.js, worker-sandbox.js | canonical-json.js |
| `scripts/lib/independent-verifier/index.test.js` | 1701 | adversarial-challenges/planner.js, adversarial-challenges/runner.js | adversarial-challenges/integrity.js, assurance-graph/index.js, execution-graph/index.js, execution-identities/index.js, independent-verifier/assessment.js, independent-verifier/evidence.js, independent-verifier/index.js, independent-verifier/runner-receipt.js, independent-verifier/verdict.js, test-support/k6b-runner-receipt.js, worker-workspace.js |
| `scripts/lib/independent-verifier/runner-receipt-restart.test.js` | 229 | authority-store/index.js, filesystem-store.js, independent-verifier/runner-receipt-store.js | assurance-graph/index.js, execution-graph/index.js, execution-identities/index.js, independent-verifier/index.js, independent-verifier/runner-receipt.js, test-support/k6b-runner-receipt.js, worker-workspace.js |
| `scripts/lib/independent-verifier/runner-receipt-store.test.js` | 110 | authority-store/index.js, independent-verifier/runner-receipt-store.js | independent-verifier/runner-receipt.js, test-support/k6b-runner-receipt.js |
| `scripts/lib/k12/campaign-executor.test.js` | 153 | k12/campaign-executor.js | k12/cohort.js, k12/runner.js |
| `scripts/lib/k12/pilot-checkpoint.test.js` | 170 | k12/pilot-executor.js | k12/cohort.js, k12/pilot-checkpoint.js, k12/runner.js, route-dispatcher.js |
| `scripts/lib/k12/pilot-executor.test.js` | 514 | k12/pilot-executor.js, minimal-kernel-harness.js | k12/cohort.js, k12/runner.js, route-dispatcher.js |
| `scripts/lib/k12/worker-record.test.js` | 144 | k12/pilot-executor.js | k12/cohort.js, k12/pilot-checkpoint.js, k12/runner.js, k12/worker-record.js, route-dispatcher.js |
| `scripts/lib/k4a-lifecycle-model.test.js` | 87 | lifecycle-model.js | execution-graph/index.js, test-support/execution-graph-fixtures.js |
| `scripts/lib/lifecycle-kernel/index.test.js` | 1943 | lifecycle-kernel/index.js, lifecycle-kernel/journal.js, lifecycle-kernel/memory-store.js, lifecycle-kernel/operations.js, test-support/permit-test-helpers.js | canonical-json.js |
| `scripts/lib/lifecycle-kernel/permits.test.js` | 800 | lifecycle-kernel/index.js, lifecycle-kernel/operations.js, lifecycle-kernel/permits.js, test-support/permit-test-helpers.js | canonical-json.js, kernel-schema-validator.js |
| `scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js` | 461 | lifecycle-kernel/reducer.js | lifecycle-kernel/phase-completion-reducer.js |
| `scripts/lib/repair-shadow/index.test.js` | 2100 | filesystem-store.js, repair-shadow/effective-shadow-base.js, repair-shadow/execution-record-store.js, repair-shadow/index.js, repair-shadow/orchestrator.js, repair-shadow/patch-integrator.js, repair-shadow/shadow-comparator.js, worker-executor.js | execution-graph/index.js, execution-identities/index.js, worker-workspace.js |
| `scripts/lib/roadmap-boundary.test.js` | 243 | adversarial-challenges/index.js | assurance-graph/index.js, complexity-architecture-delta/index.js |
| `scripts/lib/worker-executor.test.js` | 1703 | capability-proof/index.js, host-contract/index.js, repair-shadow/orchestrator.js, worker-executor.js | canonical-json.js, execution-identities/index.js, kernel-schema-validator.js, worker-workspace.js |

## Anexo D. Tests que se retirarían con sus módulos (41 ficheros, 9538 líneas)

| Test | Líneas |
|---|---:|
| `scripts/k5-e2e-budgets-recovery.test.js` | 346 |
| `scripts/lib/adversarial-challenges/index.test.js` | 45 |
| `scripts/lib/adversarial-challenges/mutator.test.js` | 101 |
| `scripts/lib/authority-canon.test.js` | 228 |
| `scripts/lib/authority-store/index.test.js` | 1055 |
| `scripts/lib/capability-proof/index.test.js` | 328 |
| `scripts/lib/causal-failure.test.js` | 165 |
| `scripts/lib/contract-checkers/k1-maturity.test.js` | 109 |
| `scripts/lib/contract-checkers/k4a-checkers.test.js` | 130 |
| `scripts/lib/contract-checkers/k5-checkers.test.js` | 121 |
| `scripts/lib/execution-budgets.test.js` | 379 |
| `scripts/lib/failure-recovery.test.js` | 146 |
| `scripts/lib/filesystem-store.test.js` | 630 |
| `scripts/lib/headless-conformance-host.test.js` | 283 |
| `scripts/lib/host-adapters/registry.test.js` | 135 |
| `scripts/lib/host-contract/index.test.js` | 557 |
| `scripts/lib/k5-budgets-failures-recovery.test.js` | 257 |
| `scripts/lib/k5-lifecycle-model.test.js` | 70 |
| `scripts/lib/k6a-lifecycle-model.test.js` | 89 |
| `scripts/lib/kernel-aliases.test.js` | 113 |
| `scripts/lib/lifecycle-kernel/bridges.test.js` | 142 |
| `scripts/lib/lifecycle-kernel/effect-policy.test.js` | 92 |
| `scripts/lib/lifecycle-kernel/events.test.js` | 77 |
| `scripts/lib/lifecycle-kernel/export-surface.test.js` | 54 |
| `scripts/lib/lifecycle-kernel/host-boundary.test.js` | 185 |
| `scripts/lib/lifecycle-kernel/journal.test.js` | 148 |
| `scripts/lib/lifecycle-kernel/k21-scope-guard.test.js` | 70 |
| `scripts/lib/lifecycle-kernel/k2a-scope-guard.test.js` | 57 |
| `scripts/lib/lifecycle-kernel/operations.test.js` | 242 |
| `scripts/lib/lifecycle-kernel/recovery.test.js` | 175 |
| `scripts/lib/lifecycle-kernel/reducer.test.js` | 191 |
| `scripts/lib/lifecycle-kernel/scope-guard.test.js` | 117 |
| `scripts/lib/lifecycle-kernel/state-digest.test.js` | 70 |
| `scripts/lib/lifecycle-kernel/transition-selector.test.js` | 164 |
| `scripts/lib/lifecycle-model.test.js` | 257 |
| `scripts/lib/minimal-kernel-harness.test.js` | 513 |
| `scripts/lib/next-transition.test.js` | 302 |
| `scripts/lib/operation-identity-binding.test.js` | 409 |
| `scripts/lib/transition-parity.k2.test.js` | 151 |
| `scripts/lib/transition-parity.test.js` | 133 |
| `scripts/lib/worker-sandbox.test.js` | 702 |
