# Piloto Adaptive Repair — informe y checkpoint (P4)

> **Fecha:** 2026-10-03 · **Versión:** v2.79.0 · **Naturaleza:** informe de medición; no cambia estados de OpenSpec, el routing ni el default `fixed`.
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

## Recomendación

El objetivo es menos burocracia sin perder garantías. El camino más corto a ese objetivo que sigue siendo seguro:

1. **Calibración mínima con agentes reales**: el estrato behavior-repair (7 tareas) × 1 repetición por brazo, con modelo y effort versionados, y los mismos márgenes y vetos. Basta para ver si la compresión de contexto degrada la reparación. No hace falta una campaña completa.
2. **K9 con alcance de un profile**: si la calibración da `continue`, la receta Repair pasa a ser la forma de la ruta `bugfix` como opt-in, con `fixed` como fallback y el mismo checkpoint como guardia de regresión.
3. **Resolver la traza en K10-delivery**: el Candidate, el receipt K6b y la attestation K8 sustituyen al archivo ceremonial como evidencia persistida.
