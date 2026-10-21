# E4.6: banco simétrico con Claude y Haiku, IDD frente a gentle-ai

Fecha: 2026-10-21 · Records: [`gentle-ai-3`](../../scripts/evals/bench/records/gentle-ai-3.json) e [`idd-6`](../../scripts/evals/bench/records/idd-6.json), con [`idd-5`](../../scripts/evals/bench/records/idd-5.json) de referencia · Calidad: [`gentle-ai-3__idd-6`](../../scripts/evals/quality/results/gentle-ai-3__idd-6/quality.json) · Commit: `b76395b4` · Harness: `076387f7611d` (el mismo en los dos) · Corpus: `3eed3740a0d6` · Márgenes: `bench-margins-10` (`7670b9db08eb`).
Host: Claude Code 2.1.304, modelo `claude-haiku-5-5`, persona `claude-haiku-5-5`, **una repetición** por escenario y brazo. Es la repetición de `idd-4` (E4.9, en agy) con Engram en todos los brazos, que pedían #340 y #341.

| Brazo | Producto | Huella |
| --- | --- | --- |
| `gentle-ai` | gentle-ai 4.2.0 con engram 3.5.1, construido desde la etiqueta `v4.2.0` | `1bb41ce744a7` |
| `idd` | ospec-workflow 2.143.0 con engram 3.5.1, instalado desde el checkout, sin SDD | `f974e66fafca` |

```sh
node scripts/evals/bench/bench.js report --record gentle-ai-3
node scripts/evals/bench/bench.js report --record idd-6
node scripts/evals/bench/bench.js checkpoint --baseline gentle-ai-3 --candidate idd-6
node scripts/evals/quality/quality.js report --baseline gentle-ai-3 --candidate idd-6
```

## 1. Qué cambió respecto a E4.9

- **Engram en los dos brazos**, con la misma versión. Su MCP mide **140 bytes** en cada uno y no se resta de los tokens.
- **Host Claude con Haiku** en el agente y en la persona, en lugar de agy con Gemini y Grok.
- **Calidad del par recogida** con el criterio de E4.5: mutation score y revisión ciega por pares con Haiku.
- **`.ospec/` fuera de git.** El primer intento de `idd-5` se descartó. El commit `setup` del banco versionaba `.ospec/session/latest.md`, y el hook Stop lo reescribe en cada turno. Así ningún cambio IDD dejaba el árbol limpio, y `saas-small` llegó a 30 turnos y 217 M tokens. Se arregló en el producto (`.ospec/.gitignore` con `*`, REQ-hooks-028) y en el banco (`.git/info/exclude`). E4.9 no lo sufrió porque agy no ejecuta el hook Stop.
- **Versiones.** `idd-5` corrió con engram 3.4.0 en el HOME del banco y gentle-ai 4.1.1. Después se actualizaron los dos productos (gentle-ai 4.2.0 y engram 3.5.1) y se repitieron los dos brazos desde cero (`idd-6` y `gentle-ai-3`). `idd-5` queda solo como referencia de varianza.

Márgenes, declarados antes de correr: gentle-ai es la base e IDD el candidato.
- IDD no puede escapar más defectos (`max_mean_delta` 0) ni gastar más tokens (`max_total_ratio` 1).
- Calidad: el mutation score medio no queda más de 5 puntos por debajo, y la revisión ciega prefiere la base en los dos órdenes como mucho en un par.
- El veredicto no bloquea el producto.

## 2. Resultado

| Escenario | Tokens (gentle-ai → IDD) | Duración | Preguntas | Acceptance | Regression | Fact | Escapados |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| cli-local | 1 034 k → 1 263 k | 0,8 → 1,5 min | 0 → 1 | 1/1 → 1/1 | 2/2 → 2/2 | 5/5 → 5/5 | ninguno → ninguno |
| saas-small | 532 k → 2 723 k | 0,9 → 2,5 min | 0 → 1 | 1/1 → 1/1 | 2/2 → 2/2 | 4/4 → 4/4 | ninguno → ninguno |
| regulated | 479 k → 1 574 k | 0,8 → 2,0 min | 0 → 1 | 0/1 → 0/1 | 2/2 → 2/2 | 1/4 → 3/4 | `export-day-sorted`, F1, F2 y F4 → `export-day-sorted` y F4 |
| brownfield | 706 k → 1 839 k | 0,9 → 2,6 min | 0 → 1 | 1/1 → 1/1 | 1/1 → 1/1 | 4/5 → 5/5 | F3 → ninguno |
| public-library | 492 k → 2 095 k | 0,5 → 2,1 min | 0 → 1 | 1/1 → 1/1 | 2/2 → 2/2 | 2/4 → 4/4 | F1 y F3 → ninguno |
| bugfix | 679 k → 738 k | 0,6 → 1,0 min | 0 → 1 | 1/1 → 1/1 | 2/2 → 2/2 | 2/4 → 3/4 | F1 y F3 → F4 |
| **Total** | **3 922 k → 10 233 k** | **4,5 → 11,8 min** | 0 → 6 | 5/6 → 5/6 | 11/11 → 11/11 | **18/26 → 24/26** | **9 → 3** |

Coste: 0,12 → 0,28 USD. Los seis escenarios terminan completos en los dos brazos.
- **gentle-ai** entrega en un turno, sin preguntas ni intervenciones.
- **IDD** pregunta una vez por escenario y cierra en el segundo turno. Las seis respuestas cambian la decisión.

Los escapados de gentle-ai son hechos que nadie le dio:
- `regulated`: no filtra DNI ni diagnóstico, no audita la exportación y no escapa el CSV.
- `brownfield`: no trata el código sin distinguir mayúsculas.
- `public-library`: cambia el formato por defecto y no actualiza los tipos.
- `bugfix`: no trata la página menor que 1 ni la lista vacía.

IDD escapa dos cosas:
- `regulated`: la ordenación por día (acceptance, que también falla gentle-ai) y el escapado del CSV.
- `bugfix`: el `pageSize` menor que 1. Pregunta por la página menor que 1, la lista vacía y la página más allá de la última, pero no por el tamaño, y no lanza `RangeError`. gentle-ai sí lo lanza sin preguntar.

## 3. Calidad: `continue`

| Escenario | Mutation score (gentle-ai → IDD) | Preferida a ciegas |
| --- | --- | --- |
| cli-local | 75 % (12/16) → 100 % (15/15) | inconsistente |
| saas-small | 85 % (17/20) → 90,5 % (19/21) | IDD |
| regulated | 100 % (3/3) → 100 % (5/5) | IDD |
| brownfield | 100 % (9/9) → 100 % (11/11) | IDD |
| public-library | 100 % (2/2) → 100 % (4/4) | IDD |
| bugfix | 77,8 % (7/9) → 100 % (5/5) | IDD |
| **Media** | **89,6 % → 98,4 %** | IDD en 5, base en 0 |

- **Mutation score.** IDD no queda por debajo; su IC del 95 % va de 94,3 a 102,5 frente a 77,2 a 102. Varias entregas tienen menos de 10 mutantes.
- **Revisión ciega** (Haiku, 0,04 USD). Puntúa más a IDD en corrección (3,92 frente a 2,5 de media sobre 5) y en tests (4,25 frente a 2,75). En legibilidad empatan (3,92).

## 4. Checkpoint: `revise`

- **Tokens:** IDD gasta **2,61 veces** lo de gentle-ai (10,2 M frente a 3,9 M). El margen es ≤ 1, así que el checkpoint es `revise`. Por escenario el ratio va de 1,09 (`bugfix`) y 1,22 (`cli-local`) a 4,26 (`public-library`) y 5,12 (`saas-small`). En E4.9, con agy, fue 2,29.
- **Regresión:** `bugfix/invalid-page-size` lo pasa gentle-ai y lo falla IDD (`check-regression`).
- **Escapados:** IDD escapa 6 menos (3 frente a 9).
- **Calidad:** `continue`.

**Lectura.** IDD compra corrección con tokens. Su gate `open-facts` obtiene del usuario los hechos que gentle-ai adivina, y su protocolo (pregunta, test en rojo y en verde, `check`, review y `close`) añade un turno y el contexto de la skill y del CLI.

En Claude, el ahorro de E4.2 (0,44×, con Sonnet) no se repite con Haiku. gentle-ai hace 97 turnos de modelo, cerca de los 107 de E4.2, y IDD pasa de 76 a 194. Este banco no separa cuánto de ese cambio viene del modelo y cuánto de las versiones de los dos productos.

## 5. Límites

- **Una repetición.** Con el mismo IDD, `idd-5` (engram 3.4.0) escapó 1 defecto y gastó 10,7 M tokens frente a los 3 y 10,2 M de `idd-6`. `regulated` pasó de 0 a 2 escapados entre las dos corridas. La diferencia entre corridas del mismo brazo es del orden de la regresión que marca el checkpoint.
- **IDD se ajustó sobre este corpus.** El corpus reservado y n ≥ 3 son de #342.
- **El record de gentle-ai no guarda la versión del CLI de Claude** (`cli_version` vacío; la causa no se ha investigado). El de IDD dice 2.1.304.
- **Haiku hace de agente, de persona y de juez de calidad.** El juez no ve qué brazo es cuál, pero es de la misma familia que el agente.
- **La Engram vacía** mide un repositorio nuevo sin memoria previa; el valor de la memoria entre sesiones no se mide.
