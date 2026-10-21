# OSP-011: IDD frente a gentle-ai en Claude con Haiku, tres repeticiones y un escenario reservado

Fecha: 2026-10-22 · Records: [`gentle-ai-4`](../../scripts/evals/bench/records/gentle-ai-4.json) e [`idd-7`](../../scripts/evals/bench/records/idd-7.json) (corpus por defecto), [`gentle-ai-4-reserved`](../../scripts/evals/bench/records/gentle-ai-4-reserved.json) e [`idd-7-reserved`](../../scripts/evals/bench/records/idd-7-reserved.json) (corpus reservado) · Calidad: [`gentle-ai-4__idd-7`](../../scripts/evals/quality/results/gentle-ai-4__idd-7/quality.json) y [`gentle-ai-4-reserved__idd-7-reserved`](../../scripts/evals/quality/results/gentle-ai-4-reserved__idd-7-reserved/quality.json) · Commit: `cba50920` · Harness: `9b9992952229` (el mismo en los dos brazos) · Corpus: `3eed3740a0d6` (por defecto) y `bba3c8d0b72e` (reservado) · Márgenes: `bench-margins-11` (`a7f13a4443d9`).
Host: Claude Code 2.1.304, modelo `claude-haiku-5-5`, persona `claude-haiku-5-5`, **tres repeticiones** por escenario y brazo. Es la repetición vinculante que pedía #342.

| Brazo | Producto | Huella |
| --- | --- | --- |
| `gentle-ai` | gentle-ai 4.2.0 con engram 3.5.1 | `1bb41ce744a7` |
| `idd` | ospec-workflow 2.145.1 con engram 3.5.1, instalado desde el checkout, sin SDD | `edc6297a88a3` |

```sh
node scripts/evals/bench/bench.js report --record idd-7
node scripts/evals/bench/bench.js checkpoint --baseline gentle-ai-4 --candidate idd-7
node scripts/evals/bench/bench.js checkpoint --baseline gentle-ai-4-reserved --candidate idd-7-reserved
node scripts/evals/quality/quality.js report --baseline gentle-ai-4 --candidate idd-7
node scripts/evals/quality/quality.js report --baseline gentle-ai-4-reserved --candidate idd-7-reserved
```

## 1. Qué cambió respecto a la corrida anterior (E4.6 Claude)

- **Tres repeticiones** por escenario y brazo, el mínimo con el que el checkpoint concluye (v2.145.0). Se ejecutaron intercaladas por escenario, primero IDD y luego gentle-ai, a petición del usuario.
- **Un escenario reservado**, `salas` (reservas de salas en una API multi-organización, cuatro hechos ocultos). Se escribió y congeló en v2.145.0, en un cambio que no toca IDD, y ningún brazo lo había visto antes.
- **Márgenes `bench-margins-11`**, declarados antes de correr: los umbrales de `bench-margins-10` con tres repeticiones.
  - IDD no puede escapar más defectos (`max_mean_delta` 0) ni gastar más tokens (`max_total_ratio` 1).
  - Su mutation score medio no queda más de 5 puntos por debajo.
  - La revisión ciega prefiere la base en los dos órdenes como mucho en un par.
  - El veredicto no bloquea el producto.
- **Login compartido con la persona** (v2.145.1). El primer intento de `idd-7` se descartó. El agente refrescó en su copia de la configuración el token caducado, y la persona, que usa la original, se quedó sin login. Sus 29 llamadas fallaron, el driver contestó «Continúa, por favor» y las tres repeticiones de cli-local agotaron los 30 turnos. Ahora el banco comparte la credencial más reciente entre los dos directorios, y dos fallos seguidos de la persona paran el banco. En la corrida publicada, la persona no falla ninguna vez en las 42 ejecuciones.

## 2. Resultado: corpus por defecto

Medias por escenario sobre tres repeticiones. Los escapados se dan por repetición.

| Escenario | Tokens (gentle-ai → IDD) | Ratio | Preguntas | Acceptance | Fact | Escapados por repetición |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| cli-local | 889 k → 1 422 k | 1,60 | 0 → 1 | 3/3 → 3/3 | 15/15 → 15/15 | 0 0 0 → 0 0 0 |
| saas-small | 635 k → 2 120 k | 3,34 | 0 → 1,33 | 3/3 → 3/3 | 12/12 → 12/12 | 0 0 0 → 0 0 0 |
| regulated | 693 k → 1 739 k | 2,51 | 0 → 1,33 | 3/3 → 2/3 | 12/12 → 11/12 | 0 0 0 → 2 0 0 |
| brownfield | 729 k → 2 004 k | 2,75 | 0 → 1 | 3/3 → 3/3 | 11/15 → 15/15 | 2 1 1 → 0 0 0 |
| public-library | 516 k → 1 367 k | 2,65 | 0 → 0,67 | 3/3 → 3/3 | 6/12 → 10/12 | 2 2 2 → 0 2 0 |
| bugfix | 719 k → 1 127 k | 1,57 | 0 → 1 | 3/3 → 3/3 | 8/12 → 11/12 | 1 2 1 → 0 1 0 |
| **Total** | **4 182 k → 9 779 k** | **2,34** | 0 → 6,33 | 18/18 → 17/18 | **64/78 → 74/78** | **14 → 5** (4,67 → 1,67 sumando medias) |

Coste por repetición del corpus: 0,13 → 0,28 USD. Duración: 4,6 → 10,9 min. Regression: 33/33 en los dos brazos. Las 36 ejecuciones terminan completas.
- **gentle-ai** entrega en un turno, sin preguntas.
- **IDD** pregunta una vez en 15 de 18 ejecuciones, dos veces en dos y ninguna en una, y cierra en dos o tres turnos.

**Lo que gentle-ai escapa** son hechos que nadie le dio:
- `brownfield`: el código de descuento sin distinguir mayúsculas (F3), en las tres repeticiones, y el umbral de envío después del descuento (F2), en una.
- `public-library`: el formato por defecto sin cambios en una minor (F1) y los tipos actualizados (F3), en las tres.
- `bugfix`: la página menor que 1 (F1), en las tres, y la lista vacía (F3), en una.

**Lo que escapa IDD:**
- `regulated/r1` (2 escapados). La persona contestó a la pregunta por el formato «no descartes `;` tan rápido… compruébalo en Excel». IDD entregó el CSV con `;` y fallaron el check de aceptación (la lectura con coma) y el escapado RFC 4180 (F4). La persona no debe dar indicaciones técnicas que no estén en sus hechos: es ruido del usuario simulado, pero cuenta.
- `public-library/r2` (2 escapados). Es la única ejecución en la que IDD no pregunta: resolvió las siete categorías de `open-facts` citando código o la petición, sin ninguna pregunta, y escapa los mismos dos hechos que gentle-ai. En las otras dos repeticiones pregunta y no escapa nada.
- `bugfix/r2` (1 escapado). El `pageSize` menor que 1 no lanza `RangeError` (F4), como en la corrida anterior. gentle-ai lo acierta en las tres.

## 3. Resultado: escenario reservado `salas`

| Brazo | Tokens (media) | Preguntas | Fact | Escapados por repetición |
| --- | ---: | ---: | ---: | --- |
| gentle-ai | 707 k | 0 | 9/12 | 1 1 1 |
| IDD | 2 006 k (2,84×) | 1 | **12/12** | **0 0 0** |

gentle-ai acierta sin preguntar que las reservas no se solapan, que solo se reservan salas de la propia organización y que el inicio va antes del fin. Falla en las tres repeticiones el orden por hora de inicio del listado (F4). IDD pregunta una vez, la persona le da los cuatro hechos (tres en la última repetición) y no escapa nada.

## 4. Calidad

| Par | Mutation score (gentle-ai → IDD) | Revisión ciega | Corrección media del juez | Decisión |
| --- | --- | --- | --- | --- |
| Corpus por defecto (18 pares) | 94,4 % → 92,1 % | IDD en 15, gentle-ai en 2, inconsistente en 1 | 2,81 → 4,28 | `revise` |
| `salas` (3 pares) | 90,6 % → 84,1 % | IDD en 3 | 2,17 → 4,83 | `revise` |

- **Corpus por defecto.** El mutation score queda dentro del margen (2,3 puntos por debajo, frente a un máximo de 5). La revisión ciega prefiere a gentle-ai en dos pares (`saas-small/r3` y `regulated/r1`, el del `;`), uno más de lo que permite el margen. En tests, el juez puntúa 2,72 → 4,5, y en legibilidad 4,06 → 3,89.
- **`salas`.** La revisión ciega prefiere a IDD en los tres pares. El mutation score queda 6,5 puntos por debajo por una sola entrega, `salas/r2`, con 70,3 % (26/37 mutantes). Con tres entregas, el IC del 95 % de IDD va de 54 a 114, así que la diferencia no es significativa.
- **Coste del juez** (Haiku): 0,13 USD en total.

## 5. Checkpoints: `revise` en los dos

| Criterio | Corpus por defecto | `salas` |
| --- | --- | --- |
| Escapados (margen ≤ 0) | **−3,0** ✅ | **−1** ✅ |
| Tokens (margen ≤ 1×) | 2,34× (IC 95 % del ratio por escenario: 1,67 a 3,13) ❌ | 2,84× ❌ |
| Regresiones | `regulated/export-day-sorted`, `regulated/csv-escaping`, `bugfix/invalid-page-size` ❌ | ninguna ✅ |
| Calidad | revisión ciega 2 frente a 1 ❌ | mutation score −6,5 frente a −5 ❌ |

Las tres regresiones fallan en una de tres repeticiones, y dos de ellas vienen de la respuesta de la persona en `regulated/r1`.

**Significación.** La unidad estadística del banco es el escenario. Sobre los siete escenarios (seis por defecto y `salas`), la diferencia media de escapados favorece a IDD en cuatro, empata en dos y va en contra en uno (`regulated`). Una prueba exacta de permutación de signos da **p≈0,13**: no es significativa. Por ejecución (21 pares), daría p≈0,02, pero las tres repeticiones de un escenario no son independientes, así que esa cifra no se usa para concluir.

## 6. Lectura

- **Defectos.** Con tres repeticiones, IDD escapa menos en todos los escenarios con reglas de negocio que el código no deja ver: brownfield, public-library, bugfix y el reservado `salas`. gentle-ai no pregunta nunca. Acierta los hechos que se deducen del código y falla de forma sistemática los que solo conoce el usuario. La ventaja de IDD es consistente, pero con siete tareas todavía no es significativa.
- **Coste.** IDD gasta entre 1,6 y 3,3 veces los tokens de gentle-ai por escenario. Es consistente: el intervalo no cruza 1. Viene de la pregunta y del turno extra, y del protocolo (test en rojo y en verde, `check` y `close`): IDD hace unos 31 turnos de modelo por ejecución frente a 18 de gentle-ai. En dólares, con Haiku, son 0,28 frente a 0,13 USD por repetición del corpus.
- **Calidad.** El juez ciego prefiere a IDD en 18 de 21 pares y le da casi el doble en corrección. Los dos `revise` de calidad los dan márgenes estrechos, uno de ellos con la entrega inducida por la persona.
- **Veredicto contra los márgenes declarados:** `revise`. Con el margen de tokens en ≤ 1×, IDD no puede pasar el checkpoint en Claude con Haiku, gane o no en defectos.

## 7. Defectos encontrados

- **La persona da indicaciones técnicas.** En `regulated/r1` propuso no descartar `;` sin que ningún hecho lo dijera, contra la regla 3 de su prompt. Issue aparte.
- **El gate `open-facts` acepta citas que no zanjan nada.** En `public-library/r2`, IDD citó las siete categorías sin preguntar y escapó dos hechos del cambio en una librería publicada. Issue aparte.
- **El record de gentle-ai no guarda la versión del CLI de Claude** (`cli_version` vacío), como en la corrida anterior.

## 8. Límites

- **Solo Claude con Haiku.** #342 pide también agy. La repetición del corpus por defecto con n ≥ 3 en agy queda en un issue aparte.
- **Siete escenarios y uno solo reservado.** IDD se ajustó sobre el corpus por defecto. `salas` lo escribió el mismo autor que ajusta IDD, aunque en un cambio que no toca IDD y congelado antes de correr.
- **Haiku hace de agente, de persona y de juez de calidad.** El juez no ve qué brazo es cuál, pero es de la misma familia que el agente.
- **El MCP de Engram** mide 140 bytes en los dos brazos del corpus por defecto. En `idd-7-reserved` mide 149, porque la ruta del workspace es más larga. No se resta de los tokens.
- **La Engram vacía** mide un repositorio nuevo sin memoria previa; el valor de la memoria entre sesiones no se mide.
