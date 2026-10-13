# E4.2: IDD frente a gentle-ai en el banco

Fecha: 2026-10-12 · Records: [`gentle-ai-1`](../../scripts/evals/bench/records/gentle-ai-1.json) e [`idd-3`](../../scripts/evals/bench/records/idd-3.json) · Harness: `c1048611f6e0` (el mismo en los dos) · Corpus: `dde01d7028a9` · Márgenes: `bench-margins-6`.
Host: Claude Code 2.1.296 headless, modelo `claude-sonnet-5-5`, persona `claude-sonnet-5-5`, **una repetición** por escenario y brazo.

> **Revisado el 2026-10-13 (OSP-025).** De esta comparación solo se sostiene que IDD no es inferior en los checks de aceptación y de regresión y que gasta menos tokens. La diferencia de escapados, 2 frente a 0, está en dos checks de hechos ocultos, no es significativa con una repetición y tiene factores de confusión. Ver la [sección 7](#7-revisión-del-2026-10-13-osp-025). El texto original se conserva.

| Brazo | Producto | Huella |
| --- | --- | --- |
| `gentle-ai` | gentle-ai 4.1.1, compilado desde el tag `v4.1.1`, con engram 3.4.0: ODD con RDD activo (su valor por defecto) | `be60a758f7a5` |
| `idd` | ospec-workflow 2.132.1, construido desde el checkout | `5b632dba6f31` |

Todo se regenera sin repetir corridas:

```sh
node scripts/evals/bench/bench.js report --record gentle-ai-1
node scripts/evals/bench/bench.js report --record idd-3
node scripts/evals/bench/bench.js checkpoint --baseline gentle-ai-1 --candidate idd-3
node scripts/evals/quality/quality.js report --baseline gentle-ai-1 --candidate idd-3
```

## 1. Condiciones

Las decidió el usuario antes de correr (cambio IDD `head-to-head-gentle-ai`):

- **Instalación de gentle-ai:**
  - Solo Claude Code, en un HOME propio del banco.
  - Componentes `persona`, `engram` y `skills`, con las skills del preset `ecosystem-only` y la persona `neutral`.
  - Telemetría y autoactualización desactivadas.
  - Sin GGA, que instala un binario global fuera del aislamiento, y sin Context7, que es un MCP de red.
- **Engram:** vacío y aislado en cada escenario, con sus datos en `.git/bench-engram`, su propio puerto y parado al terminar.
- **MCP:** el agente de gentle-ai carga solo el engram que registró la instalación (`--strict-mcp-config`). Los brazos de ospec corren sin MCP, como en E4.1.
- **Persona:** la misma en los dos brazos, en la configuración del banco.
- **Cuándo termina un cambio:**
  - en IDD, cuando `ospec close` lo archiva en `idd/archive/`;
  - en gentle-ai, cuando hay al menos un commit tras el setup, nada sin commitear fuera de `odd/` y `.atl/`, y ninguna tarea abierta en `odd/tasks/*.md`.

  ODD solo crea ese documento para trabajo sustancial, y `.atl/` es el registro de skills que gentle-ai regenera en cada sesión.
- **Márgenes `bench-margins-6`**, declarados antes de correr:
  - línea base gentle-ai y candidato IDD;
  - IDD no puede escapar más defectos ni gastar más tokens (ratio ≤ 1);
  - el veredicto no bloquea nada.

## 2. Resultado

| Escenario | Tokens (gentle-ai → IDD) | Coste | Duración | Mensajes con preguntas | Hechos del usuario | Checks | Escapados |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cli-local | 726 k → 392 k | $0,45 → $0,27 | 0,5 → 0,7 min | 0 → 1 | 0 → 5 de 5 | 8/8 → 8/8 | ninguno → ninguno |
| saas-small | 1.067 k → 472 k | $0,58 → $0,31 | 0,7 → 0,8 min | 0 → 1 | 0 → 4 de 4 | 7/7 → 7/7 | ninguno → ninguno |
| regulated | 1.048 k → 458 k | $0,53 → $0,29 | 0,6 → 0,7 min | 0 → 1 | 0 → 3 de 4 | 7/7 → 7/7 | ninguno → ninguno |
| brownfield | 1.224 k → 426 k | $0,79 → $0,28 | 0,9 → 0,8 min | 1 → 1 | 3 → 5 de 5 | 6/7 → 7/7 | `case-insensitive-code` (F3) → ninguno |
| public-library | 1.472 k → 557 k | $0,66 → $0,32 | 1,2 → 1,0 min | 0 → 1 | 2 → 3 de 3 | 7/7 → 7/7 | ninguno → ninguno |
| bugfix | 618 k → 385 k | $0,42 → $0,25 | 0,4 → 0,7 min | 1 → 1 | 1 → 4 de 4 | 6/7 → 7/7 | `page-below-one` (F1) → ninguno |
| **Total** | **6.156 k → 2.690 k** | **$3,43 → $1,71** | 4,3 → 4,7 min | 2 → 6 | **6 → 24 de 25** | **41/43 → 43/43** | **2 → 0** |

Los seis escenarios terminan completos en los dos brazos. Ninguno usa subagentes y no hay errores de host.

## 3. Checkpoint: `continue`

- **Tokens:** IDD gasta **0,437 veces** lo que gasta gentle-ai (2,69 M frente a 6,16 M), con un margen ≤ 1. Por escenario, el ratio va de 0,35 (`brownfield`) a 0,62 (`bugfix`). El coste baja a la mitad: $1,71 frente a $3,43.
- **Escapados y regresiones:** IDD escapa 0 defectos frente a 2 de gentle-ai. Ningún check que gentle-ai pase falla en IDD, así que no hay veto. Los dos escapados son checks de hechos ocultos; en aceptación y regresión los brazos empatan, y la diferencia no es significativa (sección 7).
- **De dónde sale la diferencia de tokens:**
  - En los dos brazos, las lecturas de caché son el 89–90 % de los tokens.
  - gentle-ai hace 107 turnos de modelo, con 57,5 k tokens de media por turno. IDD hace 76, con 35,4 k.
  - gentle-ai carga siempre un `CLAUDE.md` de 82 KB, más el estilo `neutral` de 5,4 KB. La [auditoría del 2026-10-03](2026-10-03-auditoria-harness-y-gentle-ai.md) medía 17–24 KB de orquestador en v4.0.0.
  - IDD carga su router y, en cada cambio, la skill `idd`.

## 4. Cómo trabaja cada brazo

- **IDD pregunta antes de editar en los seis escenarios.** Hace un solo lote, el del gate `open-facts`, y obtiene del usuario 24 de los 25 hechos ocultos.
- **gentle-ai implementa directamente en cinco de seis escenarios.** Solo pregunta antes de tocar código en `brownfield`, sobre si el descuento va antes o después del IVA. En `bugfix` pregunta al terminar, sobre las listas vacías. En el resto deduce del código lo que acierta. Obtiene del usuario 6 hechos de 25, y los dos defectos escapados son hechos que nadie le dio:
  - un código de descuento en minúsculas (`brownfield`, F3);
  - una página menor que 1 (`bugfix`, F1).
- **gentle-ai no commitea por su cuenta.** En los seis escenarios entrega sin commit y la persona tiene que pedírselo, porque el criterio de terminado del banco lo exige. En `cli-local`, `saas-small` y `regulated` esa petición es su única intervención; en `brownfield` y `bugfix` va junto a una respuesta. ODD cierra cada tarea con un commit, pero el trabajo pequeño no crea tareas.
- **En `public-library` la persona corrige a gentle-ai.** Su primera entrega cambiaba la salida por defecto de `format` en una versión menor. La persona lo rechaza con dos hechos (F1 y F2), y la entrega final pasa los 7 checks gracias a esa corrección. IDD lo preguntó antes de editar.
- **RDD no lanzó ningún revisor** en ninguna corrida (0 subagentes): con cambios de este tamaño, su evaluación de riesgo no pide review. Las obligaciones de IDD en estos escenarios tampoco piden review de confianza.

## 5. Calidad de las entregas

Calculada sin modelo sobre el diff de producto (código, tests, tipos y documentación, sin `odd/`, `.atl/` ni `idd/`). El diff se mide desde el commit `setup` del banco, así que incluye lo que gentle-ai commitea.

| Escenario | Líneas de código (gentle-ai → IDD) | Líneas de test | Test/código | Docs y tipos tocados | Mutation score |
| --- | --- | --- | --- | --- | --- |
| cli-local | 25 → 29 | 28 → 31 | 1,12 → 1,07 | 1 → 1 | 76,9 % (10/13) → 86,7 % (13/15) |
| saas-small | 32 → 25 | 36 → 45 | 1,13 → 1,80 | 1 → 1 | 94,7 % (18/19) → 95,8 % (23/24) |
| regulated | 18 → 19 | 29 → 39 | 1,61 → 2,05 | 1 → 1 | 100 % (3/3) → 75 % (3/4) |
| brownfield | 20 → 24 | 61 → 45 | 3,05 → 1,88 | 1 → 0 | 92,3 % (12/13) → 93,3 % (14/15) |
| public-library | 7 → 10 | 19 → 16 | 2,71 → 1,60 | 3 → 3 | 100 % (4/4) → 100 % (5/5) |
| bugfix | 5 → 5 | 11 → 31 | 2,20 → 6,20 | 1 → 0 | 50 % (2/4) → 20 % (1/5) |
| **Media** | | | | | **85,7 % → 78,5 %** |

- **Tamaño:** las entregas son de un tamaño parecido. IDD escribe más test en `saas-small`, `regulated` y `bugfix`; gentle-ai, en `brownfield` y `public-library`.
- **Mutation score:** la media favorece a gentle-ai, pero la diferencia la marcan `regulated` (3 de 3 frente a 3 de 4) y `bugfix` (2 de 4 frente a 1 de 5). Con 3 a 5 mutantes por entrega, un solo mutante vivo mueve el porcentaje entre 20 y 33 puntos. En los cuatro escenarios con 13 o más mutantes, IDD iguala o supera a gentle-ai.
- **Revisión a ciegas:** el usuario decidió no hacerla en E4.2.

## 6. Exclusiones y límites

- **Una repetición por brazo y escenario.** La comparación es exploratoria y no mide la variabilidad entre repeticiones. En E4.1 el mismo escenario llegó a costar 2,7 veces más entre corridas.
- **`sdd-baseline-3` queda fuera del checkpoint.** Corrió con otro harness, otro plugin (2.107.1) y Claude Code anterior. Como referencia histórica: SDD gastó 65,7 M tokens, 0 escapados.
- **gentle-ai se mide sin GGA ni Context7 y con el engram vacío.** Es lo que mide el banco: un repositorio nuevo, sin memoria previa. El valor de la memoria entre sesiones, que es la fuerza de gentle-ai, no se mide aquí.
- **Las peticiones de commit de la persona cuentan como intervenciones de gentle-ai.** IDD cierra sin esa petición, porque `ospec close` forma parte de su protocolo.
- **El juez de los hechos y el autor de las entregas son la misma familia de modelos**, como en E4.1.
- **Corridas descartadas antes de los records:** dos intentos de `bugfix` en gentle-ai, que no se registraron:
  - el primero cargaba los conectores claude.ai de la cuenta, porque faltaba `--strict-mcp-config`;
  - el segundo no terminaba porque contaba `.atl/` como trabajo pendiente.

  Los dos defectos se corrigieron en el harness antes de las corridas registradas.
- **El checkpoint de E4.1** (`bench-margins-5`, `sdd-baseline-3` frente a `idd-2`) se reproduce desde v2.132.1: este cambio de harness retira su excepción de huella.

## 7. Revisión del 2026-10-13 (OSP-025)

Una auditoría externa (OSP-025) revisó esta comparación, y sus afirmaciones se comprobaron contra los records. El checkpoint `bench-margins-6` y los records no cambian: `continue` sigue siendo lo que dan los márgenes declarados. Lo que cambia es lo que se puede concluir.

| Tipo de check | gentle-ai | IDD |
| --- | --- | --- |
| Aceptación | 6/6 | 6/6 |
| Regresión | 11/11 | 11/11 |
| Hechos ocultos | 24/26 | 26/26 |

- **Significación:** 2 fallos frente a 0 sobre 26 hechos por brazo da p≈0,49 (Fisher bilateral). Con una repetición, no distingue los brazos.
- **Qué mide la diferencia:** un check de hechos ocultos solo se pasa sabiendo algo que el brief no dice, y el gate `open-facts` de IDD existe para preguntarlo. Los dos escapados son defectos reales, porque la entrega no hace lo que el usuario quería, pero miden un solo tipo de defecto: el que se evita preguntando.
- **Factores de confusión:**
  - **Corpus no reservado.** `idd-1`, `idd-2`, `idd-3` y `gentle-ai-1` comparten corpus (`dde01d7028a9`). IDD se ajustó sobre él desde el 2026-10-07, y gentle-ai lo vio por primera vez.
  - **Turno de commit.** Solo a gentle-ai le pide la persona el commit en un turno aparte (sección 4), que vuelve a cargar su contexto. Los records no guardan tokens por turno, así que no está medido. Como cota: aunque ese turno fuera el 30 % de los tokens de gentle-ai, el ratio pasaría de 0,437 a ~0,62 (2,69 M frente a 4,31 M), e IDD seguiría gastando menos.
  - **Engram.** Solo se carga en el brazo de gentle-ai (sección 1). Forma parte de su instalación, pero su peso en contexto no se midió aparte.
  - **Router.** El brazo IDD con Claude corre sin el router de ospec (`scripts/evals/bench/arms.js`) y entra al protocolo por la skill `idd`. En una instalación real, router más protocolo IDD miden 15,0–15,3 KB ([checkpoint de la Etapa 3](2026-10-11-checkpoint-etapa-3.md)), frente al `CLAUDE.md` de 82 KB de gentle-ai. El ahorro es estructural, pero puede ser menor que el medido aquí.
- **Conclusión revisada:** IDD no es inferior en aceptación ni en regresión y gasta menos tokens en los seis escenarios. La ventaja en hechos ocultos es exploratoria.
- **Seguimiento:** E4.9 `bench-arm-symmetry` pide el commit en el brief a los dos brazos, reporta engram aparte, carga el router y desglosa los checks por tipo. E4.6 valida en un escenario reservado.
