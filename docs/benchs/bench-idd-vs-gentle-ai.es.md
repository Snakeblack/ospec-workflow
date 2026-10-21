# Bench: IDD frente a gentle-ai (ODD)

[English](bench-idd-vs-gentle-ai.md)

Resumen de todos los bancos que comparan **IDD** (ospec-workflow) con **gentle-ai** (su flujo ODD con RDD, instalado con su Engram), con los modelos, las personas y las condiciones de cada uno, quién gana en cada eje y por qué. Los números salen de los records versionados en [`scripts/evals/bench/records/`](../../scripts/evals/bench/records/) y se regeneran sin repetir corridas:

```sh
node scripts/evals/bench/bench.js report --record <record>
node scripts/evals/bench/bench.js checkpoint --baseline <gentle-ai-…> --candidate <idd-…>
```

Fecha: 2026-10-14. Contrato del banco: [`openspec/specs/bench/spec.md`](../../openspec/specs/bench/spec.md). Manual: [`scripts/evals/bench/README.md`](../../scripts/evals/bench/README.md).

## Conclusión corta

- **Calidad: no demostrada.** Acceptance y regression empatan en todos los bancos. Los defectos escapados solo difieren en checks de hechos ocultos, y ninguna diferencia es significativa: E4.2 2 frente a 0 sobre 26 (una repetición, p≈0,49), E4.9 9 frente a 3 (una repetición), E4.5 6,33 frente a 6,67 (IDD escapa un check más), E4.6 14 frente a 8 sumando medias (la ventaja en `receta-spa` depende de una sola ejecución). Todos los bancos cargaron Engram solo en el brazo de gentle-ai (OSP-025), y la comparación de calidad de E4.6 nunca se recogió (OSP-026).
- **Lo que se sostiene:** el ahorro de tokens con Claude en tareas pequeñas (0,44 veces), que tiene una causa estructural (sección 4).
- **Coste en tokens:** depende del host y del tipo de tarea.
  - Con **Claude** y tareas pequeñas, IDD gasta **0,44 veces** lo de gentle-ai y la mitad en dólares.
  - Con **Gemini 3.8 Flash** (agy), IDD gasta más: 2,29 veces en los seis escenarios pequeños y 7,3 veces en `todo-spa`. En `receta-spa` gasta 0,80 veces.
- **Lectura sobre la complejidad:** en las tareas complejas IDD gastó más, y sus ejecuciones más caras escaparon menos defectos; en las pequeñas, el ahorro solo se ve con Claude. Es una correlación sobre pocas ejecuciones, no una ley demostrada (sección 4).
- **Lo que gentle-ai hace mejor:** es más barato y más rápido con Gemini, y en `todo-spa` entrega en un turno sin intervenciones. Su fuerza, la memoria entre sesiones, no se mide aquí.

## 1. Condiciones comunes

| Elemento | Valor |
| --- | --- |
| IDD | ospec-workflow 2.132.1 a 2.137.0, construido desde el checkout, sin SDD y **sin Engram**: solo lo tenía el brazo de gentle-ai, una asimetría de todos estos bancos (OSP-025). El arnés ya instala Engram en todos los brazos; estos records son anteriores. El router carga en los brazos de agy |
| gentle-ai | gentle-ai 4.1.1 con Engram 3.4.0 (ODD con RDD activo), Engram vacío y aislado por escenario. En agy, con tres ajustes de entorno que no tocan su contenido |
| Agente | Claude Code 2.1.289/2.1.296 con `claude-sonnet-5-5`, o Antigravity CLI (`agy`) 1.3.3 a 1.3.5 con `gemini-3.8-flash-high` |
| Persona (el usuario simulado) | `claude-sonnet-5-5` en Claude; `claude-sonnet-5-5-medium` o `grok-4.7-high` en agy |
| Juez de checks | Checks ocultos deterministas por escenario; en las apps de una página, Chromium headless por CDP |
| Límites | 30 turnos de agente; 25 USD por escenario en Claude, 30 M tokens en agy (agy no informa coste) |
| Aislamiento | Un workspace por ejecución. En agy, cada proceso corre en bubblewrap con el entorno en lista blanca |
| Tokens | Entrada, salida, lecturas y escrituras de caché, subagentes incluidos. La caché es el 86–91 % del total en los dos brazos. No cuentan el setup ni la persona |

La persona solo responde con los hechos ocultos del escenario si el agente pregunta. Un check oculto que falla es un **escapado**: la entrega no hace lo que el usuario quería, aunque nadie se lo dijera.

## 2. Qué mide cada banco

| Banco | Corpus | Escenarios | Repeticiones | Host y persona |
| --- | --- | --- | --- | --- |
| **E4.2** | `default` (`dde01d7028a9`) | 6: `cli-local`, `saas-small`, `regulated`, `brownfield`, `public-library`, `bugfix` (4–5 hechos cada uno) | 1 | Claude Code, `claude-sonnet-5-5`, persona `claude-sonnet-5-5` |
| **E4.9** | `default` (`3eed3740a0d6`) | Los mismos 6, con el commit en el brief para los dos brazos | 1 | agy 1.3.4, `gemini-3.8-flash-high`, persona `grok-4.7-high` |
| **E4.5** | `greenfield` | `todo-spa` (16 hechos), una página nueva desde un README | 3 | agy 1.3.3, `gemini-3.8-flash-high`, persona `claude-sonnet-5-5-medium` |
| **E4.6** | `greenfield` (`7ce1db3ed2ba`) | `todo-spa` y `receta-spa` (9 hechos, escrito y congelado en la misma sesión que ajustó IDD, así que su independencia no está demostrada) | 3 | agy 1.3.5, `gemini-3.8-flash-high`, persona `grok-4.7-high` |

Records: E4.2 `gentle-ai-1` frente a `idd-3`; E4.9 `gentle-ai-2` frente a `idd-4`; E4.5 `gentle-ai-agy-3` frente a `idd-agy-3`; E4.6 `gentle-ai-agy-4` frente a `idd-agy-4`. SDD (`sdd-baseline-3`, Claude, 65,7 M tokens, 38,64 USD, 93 min, 0 escapados) queda como referencia histórica de un flujo con todas las fases.

## 3. Resultados

Sumas por banco; en E4.5 y E4.6, medias por escenario sumadas (repeticiones distintas no se suman entre sí).

| Banco | Tokens (gentle-ai → IDD) | Coste | Duración | Preguntas | Acceptance | Hechos | Escapados |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| E4.2 Claude, 6 escenarios | 6,16 M → **2,69 M** (0,44×) | 3,43 → **1,71 USD** | 4,3 → 4,7 min | 2 → 6 | 6/6 → 6/6 | 24/26 → **26/26** | 2 → **0** |
| E4.9 agy, 6 escenarios | **10,78 M** → 24,65 M (2,29×) | n/d | **33,7** → 38,1 min | 0 → 3 | 5/6 → **6/6** | 18/26 → **23/26** | 9 → **3** |
| E4.5 agy, `todo-spa` | 2,28 M → **1,92 M** (0,85×) | n/d | 7,7 → **5,5** min | 0 → 0 | 12/12 → 12/12 | 29/48 → 28/48 | **6,33** → 6,67 |
| E4.6 agy, 2 escenarios | **6,55 M** → 18,39 M (2,81×) | n/d | **62,6** → 80,3 min (suma de las 6 ejecuciones) | 0 → 0 | 15/15 → 15/15 | 33/75 → **51/75** | 14 → **8** |

Regression pasa en todo (11/11, 3/3 y 6/6 en los dos brazos). Negrita: el mejor del eje.

### Desglose de E4.6, por ejecución

| Ejecución | gentle-ai: tokens · turnos · escapados | IDD: tokens · turnos · escapados |
| --- | --- | --- |
| `todo-spa` #1 | 2,66 M · 1 · 6 | **30,95 M** · 6 · **0** |
| `todo-spa` #2 | 1,67 M · 1 · 7 | 8,42 M · 2 · **0** |
| `todo-spa` #3 | 1,74 M · 1 · 6 | 4,92 M · 2 · 6 |
| `receta-spa` #1 | 1,95 M · 1 · 8 | 3,22 M · 1 · 8 |
| `receta-spa` #2 | 8,07 M · 3 · 7 | 5,40 M · 2 · **2** |
| `receta-spa` #3 | 3,57 M · 2 · 8 | 2,26 M · 1 · 8 |
| **Media `todo-spa`** | **2,02 M** · 6,33 | 14,76 M (7,30×) · **2** |
| **Media `receta-spa`** | 4,53 M · 7,67 | **3,63 M** (0,80×) · **6** |

Checkpoint de E4.6 con `bench-margins-9`, tal como lo calculaba el arnés de entonces: **`continue`** (tokens 2,81× frente a un techo de 10×; −6 escapados frente a un techo de +2). El techo de 10× no acota los tokens en esta campaña, así que esa parte del veredicto dice poco. El checkpoint actual ya no compara este par: su brazo IDD corrió sin Engram, y la calidad que declaran sus márgenes nunca se recogió (`quality-missing`).

## 4. Quién gana y por qué

**Calidad: no demostrada.** Lo que muestran los records, y por qué no lo decide:
- El gate `open-facts` de IDD pregunta antes de editar lo que ni la petición ni el código fijan, y el cierre exige evidencia de ejecuciones que el CLI observa. En E4.2 obtuvo del usuario 24 de 25 hechos; gentle-ai, 6 de 25. Los escapados de gentle-ai son hechos que nadie le dio (un código en minúsculas, una página menor que 1).
- Con Gemini el modelo a veces declara que no hay hechos abiertos y se salta el gate. En E4.5 los dos brazos escaparon casi lo mismo, e IDD gastó menos y entregó tests (33,3 % de mutation score frente a 0 %). El IDD de E4.6 se construyó desde un checkout que ya incluía el cambio `open-facts-robustness` (categorías obligatorias en `record intent`, tests exigidos, señales por contenido): en `todo-spa` pasó de 6,67 a 2 escapados de media. Es una comparación entre dos bancos distintos, no un A/B del cambio.
- En `receta-spa`, la ventaja de IDD (6 frente a 7,67) depende de una sola ejecución (#2). Es la diferencia más frágil de este documento.

**Tokens y velocidad: depende.**
- **Con Claude gana IDD** (0,44×). gentle-ai carga un `CLAUDE.md` de 82 KB en cada turno y hace 107 turnos de modelo frente a 76. El ahorro es estructural.
- **Con Gemini gana gentle-ai** en los escenarios pequeños y en `todo-spa`: entrega en un turno y para. IDD sigue hasta que sus obligaciones están satisfechas, y cada turno extra recarga el contexto.

**La idea de que IDD ahorra en lo simple y gasta más en lo complejo para entregar mejor:**
- **Lo que sostienen los records.**
  - En tareas pequeñas con Claude, IDD ahorra (0,44×).
  - En las dos apps de E4.6, dentro de cada escenario, la ejecución de IDD que más gastó es la que menos defectos dejó: `todo-spa` 30,9 M → 0, 8,4 M → 0, 4,9 M → 6; `receta-spa` 5,4 M → 2, 3,2 M → 8, 2,3 M → 8. En gentle-ai no ocurre: su ejecución más cara de `receta-spa` (8,1 M) escapó 7.
  - El gasto extra de IDD compra cierre: itera hasta que los checks pasan, mientras gentle-ai da por buena su primera entrega.
- **Lo que no sostienen.**
  - Con Gemini, IDD no ahorra ni en los seis escenarios pequeños (2,29×).
  - La complejidad no se midió como eje previo: `receta-spa` y `todo-spa` son apps de una página parecidas y su ratio de tokens va de 0,80× a 7,30×. La diferencia la marcan unas pocas repeticiones largas (30,9 M).
  - Son seis ejecuciones por escenario: es una correlación, no una causa.

## 5. Límites

- **Una repetición** en E4.2 y E4.9; tres en E4.5 y E4.6. Un check de hechos ocultos mueve mucho el resultado (en E4.2, 2 frente a 0 sobre 26 da p≈0,49 con Fisher bilateral).
- **Las versiones de IDD cambiaron** entre bancos (2.132.1, 2.133.0, 2.136.0, 2.137.0), y el corpus `default` cambió entre E4.2 y E4.9 (`dde01d7028a9` a `3eed3740a0d6`): no se comparan uno a uno. IDD se ajustó sobre el corpus `default`; `receta-spa` es el único reservado.
- **Los modelos de persona difieren** entre bancos (Claude o Grok), y en agy el agente (Gemini) y el juez de calidad no son de la misma familia.
- **La Engram vacía** de gentle-ai mide un repositorio nuevo sin memoria previa; el valor de su memoria entre sesiones no se mide.
- **Los brazos de E4.5 corrieron en paralelo** y comparten el límite de peticiones de Gemini: las duraciones pueden salir infladas.
- **Engram solo en el brazo de gentle-ai** en todos los bancos (OSP-025): suma a los tokens de gentle-ai y le da un protocolo de memoria que IDD no tenía. El arnés ya instala Engram en todos los brazos con `engram setup`; ningún banco ha corrido todavía así.
- **`receta-spa` se escribió en la misma sesión** que ajustó IDD para E4.6: la independencia del escenario reservado respecto al ajuste no está demostrada (OSP-026).
- **La calidad de E4.6 nunca se recogió:** `bench-margins-9` declara un criterio de calidad, y las entregas del par ya no están en disco, así que hace falta una corrida nueva.
- **Pendiente:** repetir `idd-4` con Engram en todos los brazos y después la repetición con Claude (n ≥ 3, brazos simétricos y un corpus reservado escrito aparte). El cambio exige que no suba las preguntas en más de uno por escenario ni los tokens en más de un 20 %, y no se ha corrido todavía.

Análisis detallado de cada banco: [E4.2](../analysis/2026-10-12-bench-gentle-ai.md), [E4.5](../analysis/2026-10-13-bench-greenfield.md), [E4.9](../analysis/2026-10-14-bench-arm-symmetry.md).
