# E4.1 `bench-scenarios`: línea base del modo SDD (`sdd-baseline-3`)

Fecha: 2026-10-07 · Record: [`scripts/evals/bench/records/sdd-baseline-3.json`](../../scripts/evals/bench/records/sdd-baseline-3.json) · Plugin: ospec-workflow v2.107.0 · Harness: `42261bd02ac6` · Corpus: `dde01d7028a9` · Márgenes: `bench-margins-3`.
Host: Claude Code 2.1.289 headless, modelo `claude-sonnet-5-5`, persona `claude-sonnet-5-5`, **una repetición** por escenario. Topes: 30 turnos de agente, 6 de setup y $25 por escenario.

Es la línea base contra la que E1.6 medirá el brazo IDD. Sustituye como referencia a [`sdd-baseline-2`](2026-10-06-bench-linea-base-sdd.md), que se midió con otro producto (v2.105.1, antes del arreglo de routing) y otro banco. Las dos no se agregan. La tabla se regenera sin modelo con `node scripts/evals/bench/bench.js report --record sdd-baseline-3`.

## 1. Resultado

| Escenario | Estado | Tokens | Coste | Duración | Turnos | Preguntas (decisivas) | Intervenciones | Checks | Escapados |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| cli-local | complete | 3.945 k | $2,35 | 6,6 min | 2 | 1 (0) | 1 | 8/8 | ninguno |
| saas-small | complete | 10.483 k | $6,66 | 15,4 min | 3 | 2 (0) | 2 | 7/7 | ninguno |
| regulated | complete | 9.786 k | $6,24 | 11,7 min | 3 | 2 (1) | 2 | 7/7 | ninguno |
| brownfield | complete | 21.361 k | $12,78 | 25,3 min | 6 | 5 (2) | 5 | 7/7 | ninguno |
| public-library | complete | 8.868 k | $4,48 | 18,4 min | 2 | 1 (1) | 1 | 7/7 | ninguno |
| bugfix | complete | 11.254 k | $6,14 | 15,1 min | 3 | 2 (1) | 2 | 7/7 | ninguno |
| **Total** | 6/6 | **65.697 k** | **$38,64** | 92,6 min | | 13 (5) | 13 | 43/43 | **0** |

**Lo que fija para E1.6 (`bench-margins-3`):** IDD no puede escapar ningún defecto, ningún check que SDD pasa (aquí, los 43) puede fallar en IDD, y no puede gastar más del 90 % de los tokens: unos **59,1 M** en los mismos seis escenarios. Ninguna corrida IDD puede quedar incompleta.

## 2. Comparación con `sdd-baseline-2`

| Escenario | Tokens v2 → v3 | Δ | Preguntas | Subagentes |
| --- | ---: | ---: | --- | --- |
| cli-local | 6,14 M → 3,94 M | −36 % | 2 → 1 | 7 → 5 |
| saas-small | 8,55 M → 10,48 M | +23 % | 1 → 2 | 9 → 11 |
| regulated | 12,37 M → 9,79 M | −21 % | 2 → 2 | 9 → 7 |
| brownfield | 19,10 M → 21,36 M | +12 % | 5 → 5 | 10 → 12 |
| public-library | 10,41 M → 8,87 M | −15 % | 2 → 1 | 10 → 9 |
| bugfix | 6,57 M → 11,25 M | +71 % | 2 → 2 | 7 → 10 |
| **Total** | **63,14 M → 65,70 M** | **+4 %** | 14 → 13 | |

- **El total apenas cambia (+4 %), pero cada escenario se mueve entre −36 % y +71 %.** Con una repetición, la diferencia de un escenario entre dos corridas es del mismo orden que el margen del 10 %. El checkpoint de E1.6 decidirá sobre totales de una sola pasada por brazo: es una comparación exploratoria, como recoge la revisión del 2026-10-06.
- **`cli-local` ya no pregunta por la ruta.** Con el arreglo de v2.106.1 (REQ-routing-017), la única pausa es la síntesis inicial; en v2 había una segunda para pedir `freeform`.
- **El 90 % de los tokens siguen siendo lecturas de caché** (89,7 %–92,2 %).

## 3. Dónde se detiene el modo SDD

| Motivo de la pausa | Escenarios | Pausas |
| --- | --- | ---: |
| Confirmar la síntesis de la intención (gate `intent-briefing`) | los 6, más una síntesis corregida en `brownfield` | 7 |
| Verify bloqueado por decisiones o supuestos sin confirmar | saas-small, brownfield | 2 |
| Aceptar los avisos de verify antes de archivar | regulated, bugfix | 2 |
| Gate de clarify (cuatro decisiones del contrato público) | brownfield | 1 |
| Review Workload Guard antes de implementar | brownfield | 1 |

5 de las 13 preguntas cambiaron una decisión. Ninguna corrida se detuvo por el routing.

## 4. Hallazgos

1. **`/sdd-new` en Claude parte la petición.** El comando generado declara dos argumentos posicionales (`arguments: changeName intent`), así que `/ospec-workflow:sdd-new Quiero poder …` recibe `Quiero` como nombre del cambio y `poder` como intención. En `cli-local` y `public-library` el agente lo notó («el comando llegó con el texto partido») y recuperó la petición completa, por eso no causó defectos. Un usuario que escriba la intención sin nombre de cambio choca con lo mismo. Pendiente de corregir en el comando; no se tocó durante la medición.
2. **Verify sigue pidiendo confirmaciones** en 4 de los 6 escenarios (supuestos, decisiones de contrato o avisos), aunque todos los tests pasen. Es comportamiento de diseño del modo SDD (ver el [informe anterior](2026-10-06-bench-linea-base-sdd.md#3-hallazgos-de-producto-modo-sdd)).

## 5. Procedencia de la corrida

- La campaña empezó con `--repetitions 3` (`bench-margins-2`). Tras completar `cli-local`, `saas-small` y `regulated` (repetición 1), el usuario redujo la campaña a **una repetición por escenario y brazo** por falta de cuota (`bench-margins-3`, mismos márgenes). En el record solo cambió `repetitions` de 3 a 1; esas tres corridas, sus métricas, transcripciones y huellas se conservan. Las tres restantes se ejecutaron ya con `--repetitions 1`.
- La cuota de la suscripción se agotó tres veces (en `saas-small`, `brownfield` y `bugfix`). En cada caso el banco se detuvo con código 3 sin registrar la corrida cortada (v2.107.0), y la corrida se repitió entera tras el reset.
- La identidad del record (host, CLI, modelo, plugin, persona, corpus, harness y repeticiones) no cambió entre reanudaciones.
