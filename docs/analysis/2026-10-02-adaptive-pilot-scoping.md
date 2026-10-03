# Piloto Adaptive fijo — análisis de alcance (prioridad 6)

> **Fecha:** 2026-10-02 · **Base:** v2.73.1 · **Naturaleza:** análisis previo; no cambia estados de OpenSpec ni el roadmap.
> **Fuentes:** [`ospec-adaptive-critical-design.md`](../architecture/ospec-adaptive-critical-design.md) («Evaluación mínima útil», regla contra la sobreingeniería) y [`harness-evolution.md`](../roadmaps/harness-evolution.md) (K9, K10, K12, Gate de rollout).

## Pregunta que responde el piloto

¿Una política Adaptive **fija** (sin aprendizaje) para una receta reduce ceremonia y coste sin degradar cobertura de obligaciones, evidencia, autoridad ni recovery frente a `fixed`, en un ámbito aislado y reversible? El resultado es un checkpoint `continue | revise | reject` que alimenta K9; el piloto no promueve nada ni cambia defaults.

## 1. Receta: Repair en el host de referencia

| Criterio | Repair | Bounded | Direct |
| --- | --- | --- | --- |
| Gate de rollout K10 | «Activar un profile cada vez, **empezando Repair**» | Después | «Solo después de demostrar que el coste reducido no omite garantías» |
| Brazo ejecutable existente | `orchestrateRepairShadow` (K4b) ya ejecuta grafos Repair aislados y compara contra el baseline `fixed` (`compareShadowExecution`) | No existe | No existe |
| Reversibilidad (el canónico exige tareas reversibles en el primer ámbito) | Sí | Depende de la descomposición | Sí, pero sin margen de assurance que medir |
| Garantías comprobables | Reproducción, regresión, verify ligado al candidate (K6b), review residual (K7) y attestation (K8) | Contrato, descomposición y review | Mínimas |

**Recomendación: Repair.** Es la única receta con brazo ejecutable, encaja con el gate de rollout y sus garantías se pueden medir con lo ya entregado (K6b/K7/K8).

## 2. Qué existe y qué falta (K12 focal)

| Pieza | Estado en v2.73.1 | Hueco para el piloto |
| --- | --- | --- |
| Oracle independiente (`k12/obligation-oracle.js`) | Catálogo versionado por fixture; `compareObligations` | **No se aplica en la campaña**: `campaign-executor.js` reporta `oracle.applied: false` («no observed contract») |
| `RunManifest v1` | Bind de fixture, seed, worktree/cache y evaluator | `policy` tiene el enum `["fixed"]`: **no admite un segundo brazo** |
| Cohorte semilla | 11 tareas en 4 estratos (3 local-reversible, 3 behavior-repair, 3 multi-module y 2 adversarial) y 4 familias de holdout | El canónico pide 20–30 tareas; **solo 3 son de reparación** |
| Runner (`planRuns`, `summarizeCohort`) | Orden con seed, la tarea como unidad estadística y exclusiones listadas | **Una sola política**: no hay plan emparejado por tarea ni diferencias pareadas con intervalos agrupados |
| Ejecutor de campaña | Lifecycle sintético de un nodo sobre el harness K2: mide **maquinaria**, no candidates | No produce un Candidate real por tarea ni pasa por K6b/K7/K8 |
| Brazo Repair (K4b) | Orquestación shadow con cadena de identidades y comparación contra `fixed` | No está conectado al runner K12 ni emite `RunManifest` |
| K8 | Attestation ligada a candidate, policy y operación | Falta mostrar con fixtures que las attestations de cada brazo, bajo su `PolicySnapshot`, no son intercambiables (done criterion K9) |
| Márgenes y vetos | Deliberadamente no inventados | **Decisión de producto obligatoria antes de ejecutar** |

## 3. Diseño de la comparación

Primero la **equivalencia de mecanismo** de K9; la calibración de profile con modelos reales va después.

- **Brazos:** `fixed` (las rutas actuales de `routing:`) frente a `adaptive-repair-v1` (receta Repair vía K4b), cada uno con su `PolicySnapshot` declarado.
- **Se mantienen fijos:** fixture, `SourceSnapshot`, obligaciones del catálogo, budgets, host, verifier independiente (K6b), oracle (K12) y evaluator.
- **Puede variar:** la representación, la receta y el número de invocaciones y artefactos.
- **Ejecutor inicial determinista:** la salida del worker por tarea es un parche guionizado e idéntico en ambos brazos, con variantes de defecto sembrado: parche incorrecto, test complaciente, scope drift y receipt obsoleto. Esto aísla el mecanismo: mide si la receta conserva cobertura, evidencia, autoridad y recovery con menos ceremonia, y si detecta los defectos sembrados. **No** mide la calidad de los modelos; eso es la fase de calibración con agentes reales.
- **Emparejamiento:** los dos brazos por tarea comparten seed; el orden de los brazos se aleatoriza; worktrees y cachés van separados; 3 repeticiones por brazo.
- **Unidad estadística:** la tarea (las repeticiones están correlacionadas). Se usan diferencias pareadas por tarea con intervalos agrupados, y se publican numeradores, denominadores y exclusiones.
- **Holdout:** se reserva una familia por estrato, sin consultarla durante el ajuste; se registra la exposición.

### Métricas (del canónico)

| Dimensión | Medida en el piloto determinista |
| --- | --- |
| Cobertura | Obligaciones `must` omitidas frente al oracle (objetivo: 0) |
| Calidad | Defectos sembrados detectados/escapados por brazo |
| Autoridad | Efectos fuera de permiso, intentos de bypass y comportamiento ante unknown (fault injection en adversarial) |
| Recovery | Recuperación correcta tras interrupciones inyectadas; reintentos dentro del límite |
| Ceremonia | Fases, artefactos semánticos, handoffs e invocaciones por tarea |
| Coste | Invocaciones, `wall_ms` y reintentos por candidate aceptado (los tokens solo con agentes reales) |
| Varianza | Dispersión por tarea y colas, no solo medias |
| Complejidad | Inventario antes/después de autoridades, schemas y reglas duplicadas que añade el piloto |

## 4. Slices propuestos (pequeños, directos, uno por PR)

| Slice | Contenido | Done |
| --- | --- | --- |
| **P1 — Brazo y plan emparejado** | `RunManifest` admite `adaptive-repair-v1` (versión o extensión del enum, con fixtures y spec en `kernel-contract-schemas`); `planPairedRuns` y `summarizePairedCohort` (diferencias pareadas por tarea, intervalos agrupados, exclusiones) | Determinismo byte a byte; `fixed` sigue siendo el default; la cohorte incompleta no da veredicto |
| **P2a — Ejecutor determinista con oracle aplicado** (entregado v2.75.0) | Por fixture: parche guionizado → etapas puras de K4b (`integrateWorkResultPatches` + Candidate K3) → verify K6b → `compareObligations` aplicado (`oracle.applied: true`), en los estratos local-reversible y behavior-repair | Ambos brazos producen `RunManifest` completos sobre la misma cohorte; las omisiones del manifest autodeclarado se detectan |
| **P2b — Defectos sembrados** (entregado) | Checks reales por rol observados sobre los archivos del candidate y variantes de defecto sembrado (parche incorrecto, test complaciente, scope drift, receipt obsoleto) con etapa de detección declarada; `outcome.defects` en `RunManifest` | Defectos detectados/escapados por brazo; las variantes rechazadas en otra etapa marcan el fixture como mal atribuido |
| **P2c — Recovery en adversarial** (entregado) | Scripts piloto para los fixtures adversariales y composición con el harness K2: el pipeline limpio es el efecto de `complete` y se inyectan `interrupt-pre-effect`, `interrupt-mid-executor` y `bypass-without-permit` | Recovery correcta tras interrupciones inyectadas, fail-closed ante efecto ambiguo y sin bypass; un fallo no contenido falla la corrida |
| **P3 — Cohorte del piloto** (entregado) | De 11 a 20–24 tareas, con peso en behavior-repair y local-reversible, adversarial para autoridad y recovery, sin migraciones ni efectos externos; variantes de defecto sembrado; holdout por familia | `validateCohortShape` verde; el catálogo del oracle está versionado |
| **P4 — Márgenes, ejecución e informe** | Márgenes de no inferioridad, mejora práctica y vetos **predeclarados** (decisión de producto); campaña emparejada de 3 repeticiones; informe y checkpoint `continue / revise / reject` | Informe con intervalos y cohortes excluidas; veto ante cualquier `must` omitida o efecto fuera de permiso |
| Después | Calibración con agentes reales (modelo/effort versionados), luego K9 | Fuera de este alcance |

**Rollback:** todo es tooling de medición library-only, sin autoridad operativa; si se retira, `fixed` y el routing actual no cambian.

### Ajuste de P2 (2026-10-02)

`orchestrateRepairShadow` exige aislamiento K6a real (pruebas de capacidad del host) y su spec prohíbe inyectar un ejecutor alternativo. Decisión del usuario: el brazo Repair compone las **etapas puras de K4b** (integración de parches y congelación del Candidate) con el parche guionizado en lugar del worker aislado. El piloto determinista no mide aislamiento (K6a ya lo prueba) y el informe lo declara. P2 se divide en P2a y P2b. El brazo Adaptive hereda todos los gates de la ruta de control y solo comprime fases.

### Ajuste de P2b (2026-10-03)

- **Evidencia observada, no guionizada.** `pilot.json` pasa a la v2: cada fixture declara un check por rol de evidencia (acceptance, invariants, contract, negative) que se ejecuta en `node:vm` sobre los archivos en memoria. Solo un check que pasa produce evidencia y receipt del runner; uno que falla deja su rol sin evidencia y el verifier K6b lo rechaza.
- **Reproducción como etapa compartida.** Los checks de aceptación tienen que fallar sobre la base. Los dos brazos la ejecutan: la receta Repair tiene la fase `reproduce` y las rutas de control pasan por `sdd-apply` con TDD (RED antes de GREEN).
- **Etapa de detección declarada por tipo de defecto:** `scope-drift` en la integración (`CONTAINMENT_VIOLATION`), `complacent-test` en la reproducción, `wrong-patch` en el verify (falta la evidencia de un rol) y `stale-receipt` en el verify (`RUNNER_RECEIPT_BINDING_MISMATCH`: la evidencia reutilizada no declara sujeto, así que solo la delata el binding del receipt). Como control, reproducir el mismo receipt sobre un candidate idéntico se acepta. Un rechazo en otra etapa falla la corrida como fixture mal atribuido.
- **Paridad esperada.** Los dos brazos comparten todas las etapas de detección, así que el resultado esperado es la misma detección en ambos. Eso es lo que el piloto tiene que demostrar: la receta comprime fases sin perder ninguna etapa de detección. Un defecto que escapa en los dos brazos es un hallazgo sobre el harness, no sobre la receta. `defect_regressions` solo lista los escapes exclusivos del brazo Adaptive.
- **Resultado con la cohorte semilla:** 6 tareas × 4 defectos por brazo y repetición; ambos brazos detectan 24/24 por repetición, sin regresiones de defectos.
- **Recovery** pasa a P2c: necesita scripts para los fixtures adversariales y componer con el harness K2.
- **Límite conocido:** K6b juzga por la presencia de evidencia que pasa por rol. Con dos checks del mismo rol, uno que falla no bloquea si el otro pasa. Los fixtures usan un check por rol, y se registra para la calibración.

### Ajuste de P2c (2026-10-03)

- **Semántica real del kernel, comprobada empíricamente.** La interrupción `before-effect` del harness salta después de la marca `executing`, así que el kernel la registra como `unknown` y bloquea el resume con `reconciliation-required`. La recuperación segura exige interrumpir en la barrera pre-efecto (`checkpointInterrupt: "after-journal"`): el resume reintenta el mismo efecto y lo ejecuta exactamente una vez.
- **Comportamiento correcto por fallo.** `interrupt-pre-effect`: se reanuda hasta `completed` con una sola ejecución. `interrupt-mid-executor`: fail-closed (`reconciliation-required`) sin reejecutar, porque el resultado es ambiguo. `bypass-without-permit`: `unauthorized` sin ejecutar nada, y el reintento autorizado completa la tarea.
- **Control negativo:** un host que pierde el journal al reanudar reejecuta el efecto ambiguo (2 ejecuciones) y la corrida falla como `fault-escaped`, así que el chequeo no es vacuo.
- **Ruta de control de adversarial:** `bugfix`, porque los fixtures guionizan una reparación pequeña.
- **Resultado con la cohorte semilla:** 8 tareas comparables (multi-module sigue excluido), fallos contenidos 2/2 en cada tarea adversarial y en ambos brazos, 0 regresiones. La paridad vuelve a ser lo esperado: los dos brazos comparten el kernel.
- **Sin cambios de contrato:** los recuentos van en `measurements.interruptions` y `measurements.recoveries`, que ya existían.

### Ajuste de P3 (2026-10-03)

- **Multi-module entra en el piloto** (decisión del usuario). Su ruta de control es `bugfix`: una reparación que cruza módulos se clasifica `normal` con intención explícita de bugfix, y la tabla viva la enruta ahí. La receta Repair la trata como **un solo nodo** cuyas rutas permitidas cubren todos los módulos tocados; descomponerla en nodos es terreno de la receta Bounded. `pilot.json` ya admitía varios archivos y un parche de varios archivos, así que no cambia el formato.
- **Cohorte de 22 tareas** (catálogo `k12-pilot-1`): 6 local-reversible, 7 behavior-repair, 5 multi-module y 4 adversarial. Las 18 tareas de reparación siembran los cuatro defectos; en multi-module el `wrong-patch` es una propagación parcial o un contrato entre módulos desalineado, y en `multi-dependency-boundary` el `scope-drift` toca los internos del módulo que la tarea no puede tocar. Las 4 adversariales combinan dos de los tres fallos inyectados. Sin migraciones ni efectos externos.
- **Forma del piloto:** `validatePilotCohortShape` (sobre `validateCohortShape`) exige 20–24 tareas, que local-reversible y behavior-repair no tengan menos tareas que los otros estratos y al menos dos familias de holdout por estrato para poder reservar una. `k12-campaign.js --paired` la aplica. La familia reservada se declara en P4, con los márgenes.
- **Resultado:** 22 tareas comparables y 0 excluidas; defectos 72/72 por repetición en ambos brazos, fallos contenidos 2/2 en cada adversarial y 0 regresiones. Delta de fases −2 por tarea (hipótesis declarada: `lite` y `bugfix` tienen 5 fases y la receta 3).

## 5. Decisiones abiertas para el usuario

1. **Receta:** Repair (recomendado).
2. **Primer ejecutor:** determinista (recomendado; barato, reproducible y aísla el mecanismo) o directamente agentes reales (mide calidad de modelo, pero cuesta tokens y añade varianza y dependencia del host).
3. **Márgenes y vetos:** no se fijan ahora. Se proponen antes de P4, con el baseline de P2/P3 delante. Vetos candidatos no numéricos: cualquier obligación `must` omitida, cualquier efecto fuera de permiso y cualquier recovery inválida.

## Riesgos

- **Sobreinterpretar el piloto determinista:** demuestra conservación de garantías y menor ceremonia, no superioridad de calidad. El informe lo dice explícitamente.
- **Muestra pequeña:** 20–30 tareas encuentran defectos de diseño y estiman varianza; no demuestran seguridad (canónico).
- **Sobreingeniería:** cada abstracción nueva (brazo, plan emparejado) debe responder a las cinco preguntas de la regla J. Se reutiliza K4b/K12/K6b, sin un runner paralelo.
