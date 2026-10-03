# Piloto Adaptive Repair — informe y checkpoint (P4)

> **Fecha:** 2026-10-03 · **Versión:** v2.79.0 (piloto determinista) y v2.80.0 (calibración con agentes) · **Naturaleza:** informe de medición; no cambia estados de OpenSpec, el routing ni el default `fixed`.
> **Alcance:** [`2026-10-02-adaptive-pilot-scoping.md`](2026-10-02-adaptive-pilot-scoping.md) · **Reproducir:** `node scripts/k12-campaign.js --paired --seed pilot-p4-2026-10-03`

## Veredicto

**Checkpoint: `continue`.** La receta Repair (`reproduce → repair → verify`) conserva todas las garantías medibles de la ruta de control con dos fases menos por tarea. Ningún veto se activa y se cumplen todos los márgenes, también en el holdout.

## Qué se comparó

- **Brazos:** `fixed` (rutas vivas `lite` y `bugfix`, 5 fases) frente a `adaptive-repair-v1` (3 fases; hereda todos los gates del control).
- **Cohorte:** 22 tareas (catálogo `k12-pilot-1`): 6 local-reversible, 7 behavior-repair, 5 multi-module y 4 adversarial.
- **Campaña:** 3 repeticiones por brazo, orden sembrado, 66 pares.
- **Ejecutor determinista:** los dos brazos reciben el mismo parche guionizado. Mide el mecanismo, no la calidad de un modelo.

## Márgenes predeclarados

Están en `scripts/evals/__fixtures__/k12/pilot-margins.json` (`k12-pilot-margins-1`). Se cargan antes de cualquier corrida y su digest queda en el resultado.

| Regla | Valor | Por qué |
| --- | --- | --- |
| **Vetos** (fijos en código, no elegibles) | `must` omitida, fallo escapado (efecto sin permiso o recovery inválida), defecto que solo escapa en Adaptive, tarea que pasa en `fixed` y no en Adaptive | Los exige el diseño canónico; cualquiera rechaza |
| No inferioridad | límite inferior del IC95 de Δ tasa de aprobación ≥ 0 | Con un ejecutor determinista no hay ruido que tolerar |
| Mejora práctica | Δ fases medio ≤ −1 | Menos ceremonia es la razón de existir de la receta |
| Holdout | `compatibility` (local), `recovery` (behavior), `local-contract` (multi), `authority` (adversarial) | Una familia por estrato, con tareas fuera de ella |

## Resultados

| Dimensión | `fixed` | `adaptive-repair-v1` | Lectura |
| --- | --- | --- | --- |
| Tareas comparables | 22/22 | 22/22 | 0 exclusiones, oracle aplicado en todas |
| Obligaciones `must` omitidas | 0 | 0 | Veto no activado |
| Defectos sembrados detectados | 216/216 | 216/216 | 0 regresiones de defectos |
| Fallos inyectados contenidos | 2/2 por tarea adversarial | 2/2 por tarea adversarial | Sin efectos fuera de permiso ni recovery inválida |
| Δ tasa de aprobación | — | 0 (IC95 [0, 0]) | No inferior |
| Δ fases por tarea | — | −2 (IC95 [−2, −2]) | Mejora práctica (hipótesis declarada) |
| Δ efectos ejecutados | — | 0 | La receta no añade ni quita efectos |
| Holdout (10 tareas) | 10/10 | 10/10 | Sin tareas bajo el margen |

`wall_ms` no se interpreta: el IC95 cruza el cero y el ejecutor determinista no representa el coste real.

## Qué no demuestra

- **Calidad con agentes reales.** Que los dos brazos detecten lo mismo es lo esperado: comparten todas las etapas de detección. El piloto prueba que la receta comprime fases sin perder ninguna de esas etapas, no que un agente rinda igual con menos contexto.
- **El coste.** Las fases son un plan declarado, no una medición de tokens ni de tiempo.
- **Un holdout limpio.** Las tareas del holdout se escribieron y ejecutaron en P3, antes de declarar los márgenes. No hubo ajuste de política (es fija), pero el holdout solo cuenta de verdad en la calibración con agentes.
- **El destino de la traza.** La receta no tiene fase `archive`. Antes de promoverla hay que decidir qué rastro persiste (Candidate, receipts, attestation K8) sin reintroducir la ceremonia que elimina.

## Calibración con agentes reales (v2.80.0)

**Checkpoint confirmatorio: `continue`.** Con agentes reales, la receta Repair repara igual que la ruta `bugfix` y cuesta menos.

### Diseño

- **Worker:** `claude-haiku-4-5-20251001` como subagente de Claude Code, un agente por brazo y tarea, en un workspace aislado. El protocolo exacto de los prompts está en `scripts/evals/__fixtures__/k12/calibration/PROTOCOL.md`.
- **Tareas:** las 7 de behavior-repair. Cada agente recibe un brief tipo bug report (síntoma, reproducción e intención). Los checks de invariantes, contrato y casos negativos quedan ocultos y son los que juzgan.
- **Grabar y reproducir:** el parche de cada agente, sus artefactos por fase y su consumo (tokens, herramientas y duración) se graban en un registro versionado (`worker-record.js`). El registro pasa por el mismo pipeline determinista (reproducción, integración K4b, checks ocultos, verify K6b y oracle), así que el juicio se puede reproducir byte a byte sin volver a llamar al modelo.

### Primera corrida (`behavior-repair-haiku-1`): `revise` bajo los márgenes del piloto

| | `fixed` | `adaptive-repair-v1` |
| --- | --- | --- |
| Tareas aprobadas | 6/7 | 7/7 |
| Tokens (total) | 272 477 | 255 298 |
| Duración (total) | 349 s | 231 s |

El Repair fue **mejor**: en `legacy-adapter`, el agente de `bugfix` escribió `input.id || input.legacyId`, que rompe el caso oculto `id: 0`. Aun así, el checkpoint dio `revise` por dos reglas pensadas para el ejecutor determinista:

1. **«Si el control falla, el harness está roto».** Con agentes reales, que falle el control es un resultado legítimo del worker. Ahora se reporta en `control_failures` y no pide revisión cuando el worker está grabado (`recordedWorker`).
2. **«Límite inferior del IC95 ≥ 0».** Con 7 deltas binarios, una sola mejora ensancha el intervalo hasta −0,21, así que el margen castiga al brazo Adaptive por ser mejor.

Re-juzgar los mismos datos con otros márgenes sería ajustar a posteriori. Por eso se declararon márgenes nuevos **antes** de una corrida nueva.

### Márgenes de calibración (`k12-calibration-margins-1`)

Los vetos no cambian; en particular, cualquier tarea que pase en `fixed` y falle en Adaptive rechaza. Esa es la no inferioridad que tiene sentido con una muestra por tarea, y por eso el margen del IC95 queda inactivo (−1). Se mantienen la mejora práctica (Δ fases ≤ −1) y el holdout `recovery` del estrato.

### Corrida confirmatoria (`behavior-repair-haiku-2`)

| Dimensión | `fixed` | `adaptive-repair-v1` | Δ medio por tarea (IC95) |
| --- | --- | --- | --- |
| Tareas aprobadas | 7/7 | 7/7 | 0 |
| Tokens | 271 604 | 261 028 | −1511 (−2484, −538) · −3,9 % |
| Llamadas a herramientas | 80 | 68 | −1,7 (−3,0, −0,4) |
| Duración | 341 s | 269 s | −10,3 s (−15,8, −4,9) · −21 % |
| Fases | 5 | 3 | −2 |

Sin vetos ni revisiones; el holdout (3 tareas `recovery`) pasa entero.

### Límites de la calibración

- **El ahorro real es mayor que el medido.** Un solo agente ejecuta todas las fases de su brazo. La ruta `bugfix` real reparte el trabajo entre agentes de fase, y cada uno paga su contexto base (~36k tokens con este worker).
- **Muestra pequeña:** 7 tareas sencillas, una muestra por brazo y corrida, y un solo modelo. Sirve para ver si la compresión degrada la reparación; no generaliza a cambios grandes.
- **El aislamiento es por instrucción.** Los checks ocultos viven en el repositorio, no en el workspace.

## Recomendación

El objetivo es menos burocracia sin perder garantías. Con el piloto y la calibración en `continue`:

1. **K9 con alcance de un profile**: la receta Repair pasa a ser la forma de la ruta `bugfix` como opt-in, con `fixed` como fallback y el mismo checkpoint como guardia de regresión.
2. **Resolver la traza en K10-delivery**: el Candidate, el receipt K6b y la attestation K8 sustituyen al archivo ceremonial como evidencia persistida.
