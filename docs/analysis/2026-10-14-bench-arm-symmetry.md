# E4.9: banco simétrico, IDD frente a gentle-ai

Fecha: 2026-10-14 · Records: [`gentle-ai-2`](../../scripts/evals/bench/records/gentle-ai-2.json) e [`idd-4`](../../scripts/evals/bench/records/idd-4.json) · Harness: `09837661d64b` (el mismo en los dos) · Corpus: `3eed3740a0d6` · Márgenes: `bench-margins-8` (`3a6508ed166f`).
Host: Antigravity CLI (`agy`) 1.3.4, modelo `gemini-3.8-flash-high`, persona `grok-4.7-high` por el CLI de Cursor, **una repetición** por escenario y brazo. El usuario movió la corrida de Claude a este host el 2026-10-13. agy no informa coste.

| Brazo | Producto | Huella |
| --- | --- | --- |
| `gentle-ai` | gentle-ai 4.1.1 con engram 3.4.0, instalado para agy | `ccda891ac140` |
| `idd` | ospec-workflow 2.136.0, instalado para agy desde el checkout, sin SDD | `28e39afe6500` |

```sh
node scripts/evals/bench/bench.js report --record gentle-ai-2
node scripts/evals/bench/bench.js report --record idd-4
node scripts/evals/bench/bench.js checkpoint --baseline gentle-ai-2 --candidate idd-4
```

## 1. Qué cambió el banco

Declarado en `bench-margins-8` antes de correr, y en el gate del cambio `bench-arm-symmetry`:

- Los seis briefs piden el commit. `todo-spa` no se tocó.
- IDD termina con el archivo nuevo en `HEAD`, al menos un commit tras el setup y el árbol limpio. gentle-ai sigue exigiendo commit y árbol limpio fuera de `odd/` y `.atl/`.
- El router de IDD va cargado: en agy, por la instalación; en Claude, en una copia de la configuración que la persona no ve. Esta corrida es la de agy.
- El informe desglosa acceptance, regression y fact.
- Engram sigue solo en gentle-ai. Su MCP mide **181 bytes** y no se resta de los tokens. `GEMINI.md` de esa instalación mide 67 787 bytes.

Márgenes: gentle-ai es la base e IDD el candidato. IDD no puede escapar más defectos (`max_mean_delta` 0) ni gastar más tokens (`max_total_ratio` 1). Sin criterio de calidad. El veredicto no bloquea el producto.

## 2. Resultado

| Escenario | Tokens (gentle-ai → IDD) | Duración | Preguntas | Acceptance | Regression | Fact | Escapados |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| cli-local | 1 856 k → 2 626 k | 4,9 → 5,0 min | 0 → 0 | 1/1 → 1/1 | 2/2 → 2/2 | 5/5 → 5/5 | ninguno → ninguno |
| saas-small | 2 002 k → 5 273 k | 6,5 → 7,7 min | 0 → 1 | 1/1 → 1/1 | 2/2 → 2/2 | 4/4 → 4/4 | ninguno → ninguno |
| regulated | 2 520 k → 5 755 k | 6,8 → 6,5 min | 0 → 1 | 1/1 → 1/1 | 2/2 → 2/2 | 3/4 → 4/4 | F2 → ninguno |
| brownfield | 2 503 k → 4 674 k | 8,8 → 7,5 min | 0 → 1 | 0/1 → 1/1 | 1/1 → 1/1 | 1/5 → 5/5 | cinco → ninguno |
| public-library | 717 k → 3 126 k | 2,1 → 3,8 min | 0 → 0 | 1/1 → 1/1 | 2/2 → 2/2 | 2/4 → 2/4 | F1 y F3 → F1 y F3 |
| bugfix | 1 181 k → 3 192 k | 4,5 → 7,6 min | 0 → 0 | 1/1 → 1/1 | 2/2 → 2/2 | 3/4 → 3/4 | F4 → F4 |
| **Total** | **10 778 k → 24 645 k** | 33,7 → 38,1 min | 0 → 3 | **5/6 → 6/6** | **11/11 → 11/11** | **18/26 → 23/26** | **9 → 3** |

Los seis escenarios terminan completos en los dos brazos. gentle-ai no tiene ninguna intervención: el commit iba en el brief y no hizo falta un turno aparte. IDD pregunta una vez en `saas-small`, `regulated` y `brownfield`, y esas tres respuestas cambian la decisión. En `public-library` y `bugfix` ninguno pregunta, y los dos escapan los mismos hechos.

En `brownfield`, gentle-ai no aplica el descuento (`discount-applied`, acceptance) y falla los cuatro hechos del código. IDD pregunta y no escapa nada.

## 3. Checkpoint: `revise`

- **Tokens:** IDD gasta **2,29 veces** lo de gentle-ai (24,6 M frente a 10,8 M). El margen es ≤ 1, así que el checkpoint es `revise`. Por escenario el ratio va de 1,41 (`cli-local`) a 4,36 (`public-library`).
- **Escapados:** IDD escapa 6 menos (3 frente a 9). No hay `check-regression`: ningún check que gentle-ai pasa falla en IDD.
- **Una repetición.** Estos números no sostienen una diferencia general. Sirven de línea base del banco simétrico.
- **Engram.** 181 bytes de MCP frente a 67 787 de `GEMINI.md`. El peso de configuración de Engram es pequeño al lado del orquestador; los tokens de las herramientas no se separan del total.

El corpus ya no es el de `idd-3` y `gentle-ai-1` (`dde01d7028a9`). No se comparan uno a uno con E4.2.
