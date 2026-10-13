# E4.5: IDD frente a gentle-ai en un proyecto desde cero

Fecha: 2026-10-13 · Records: [`gentle-ai-agy-3`](../../scripts/evals/bench/records/gentle-ai-agy-3.json) e [`idd-agy-3`](../../scripts/evals/bench/records/idd-agy-3.json) · Harness: `ec2585d2ae90` (el mismo en los dos) · Corpus `greenfield`: `5e3492d751d9` · Márgenes: `bench-margins-7`.
Host: Antigravity CLI (`agy`) 1.3.3 headless, modelo `gemini-3.8-flash-high`, persona `claude-sonnet-5-5-medium` servida por `agy`, **tres repeticiones** por brazo.

| Brazo | Producto | Huella |
| --- | --- | --- |
| `gentle-ai` | gentle-ai 4.1.1 con engram 3.4.0, instalado con `--agent antigravity` y la selección de E4.2 | `ccda891ac140` |
| `idd` | ospec-workflow 2.133.0, instalado para antigravity desde el checkout, sin SDD | `cff87083a69b` |

Todo se regenera sin repetir corridas:

```sh
node scripts/evals/bench/bench.js report --record gentle-ai-agy-3
node scripts/evals/bench/bench.js report --record idd-agy-3
node scripts/evals/bench/bench.js checkpoint --baseline gentle-ai-agy-3 --candidate idd-agy-3
node scripts/evals/quality/quality.js report --baseline gentle-ai-agy-3 --candidate idd-agy-3 --corpus greenfield --repetitions 3
```

## 1. Condiciones

Las decidió el usuario antes de correr (cambio IDD `greenfield-head-to-head`):

- **Escenario:** `todo-spa`, una lista de tareas en un único `index.html`, sin dependencias ni build, en un corpus aparte (`scenarios-greenfield/`). La semilla trae un README con el encargo y el contrato del DOM por ids, y un `package.json` con `"test": "node --test"`.
- **Nueve hechos ocultos (F1–F9)** que solo conoce la persona:
  - F1, título recortado, vacío rechazado y máximo de 200;
  - F2, duplicados pendientes rechazados sin distinguir mayúsculas;
  - F3, clave `tareas.v1` y datos corruptos tratados como lista vacía;
  - F4, texto del contador en español;
  - F5, filtro `#/pendientes` en la URL;
  - F6, edición con doble clic, Enter, Escape y título vacío que borra;
  - F7, las nuevas al final y completar no reordena;
  - F8, título como texto;
  - F9, nombres accesibles.
- **21 checks ocultos** juzgan cada entrega en Chromium headless por CDP.
- **Los dos brazos reciben el brief tal cual.** El router de ospec y la instalación de gentle-ai se cargan en `agy`.
- **Límites:** 30 turnos de agente y 30 M tokens por ejecución, porque `agy` no da coste en dólares.
- **gentle-ai en `agy`:** necesita tres ajustes de entorno que no tocan su contenido (ver el [README del banco](../../scripts/evals/bench/README.md)):
  - un `antigravity-cli/mcp_config.json` vacío antes de instalar;
  - `agy plugin install` de su plugin de Engram;
  - la copia de sus skills a `.gemini/config/skills`.
- **Aislamiento:** cada proceso de `agy` (agente y persona) corre en bubblewrap:
  - con su propio espacio de PIDs;
  - con `/tmp`, el `HOME` del usuario y los directorios del banco vacíos;
  - con un entorno en lista blanca;
  - con solo su directorio de ejecución, la plantilla del brazo, `agy` y Node montados de vuelta.

  Una ejecución cuyo transcript nombra una ruta del banco se anula (`workspace-escape`) y se repite.
- **Márgenes `bench-margins-7`**, declarados antes de correr:
  - línea base gentle-ai y candidato IDD;
  - la media de escapados de IDD no puede superar la de gentle-ai;
  - sus tokens no pueden pasar de 1,0 veces los de gentle-ai.
- **Criterio de calidad**, también previo:
  - el mutation score medio de IDD no puede quedar más de 5 puntos por debajo del de gentle-ai;
  - la revisión ciega no puede preferir a gentle-ai en los dos órdenes en más de un par.

## 2. Resultado

| Repetición | Tokens (gentle-ai → IDD) | Duración | Preguntas | Intervenciones | Checks | Escapados |
| --- | --- | --- | --- | --- | --- | --- |
| r1 | 2.467 k → 2.377 k | 7,7 → 6,0 min | 0 → 0 | 1 → 0 | 15/21 → 15/21 | 6 → 6 |
| r2 | 2.625 k → 1.795 k | 8,6 → 4,9 min | 0 → 0 | 1 → 0 | 15/21 → 14/21 | 6 → 7 |
| r3 | 1.733 k → 1.594 k | 6,9 → 5,5 min | 0 → 0 | 0 → 0 | 14/21 → 14/21 | 7 → 7 |
| **Media** | **2.275 k → 1.922 k** | 7,7 → 5,5 min | 0 → 0 | 0,67 → 0 | **44/63 → 43/63** | **6,33 → 6,67** |

- Las seis ejecuciones terminan completas.
- Ninguna usa subagentes, ninguna tiene errores de host y ninguna se anuló.
- Las lecturas de caché son el 86–91 % de los tokens en los dos brazos.

**Qué escapa:**
- **En las seis ejecuciones, los mismos seis defectos:** `title-max-200` (F1), `pending-duplicate-rejected` (F2), `persists-reload` y `corrupt-storage-empty` (F3), `counter-wording` (F4) y `accessible-names` (F9).
- **`filter-links-hash` (F5)** escapa además en dos repeticiones de IDD y en una de gentle-ai. Esa es toda la diferencia entre los brazos.

## 3. Checkpoint: `revise`

- **Escapados:** IDD escapa 0,33 defectos más por ejecución que gentle-ai (6,67 frente a 6,33), con un margen de 0. Es la única regla que falla, y la decide un solo check (F5) en una sola repetición.
- **Tokens:** IDD gasta **0,845 veces** lo que gasta gentle-ai (1,92 M frente a 2,28 M de media), con un margen ≤ 1.
- **Regresiones:** ninguna.

## 4. Cómo trabaja cada brazo

- **Ningún brazo pregunta.** En las seis ejecuciones, la persona no recibió ninguna pregunta y no reveló ningún hecho. Es lo contrario de E4.2 con Claude, donde IDD obtuvo del usuario 24 de 25 hechos.
- **IDD se salta su gate con una base genérica.** Las tres veces declaró `--no-open-facts` con una base que solo cita el README: «README.md define los selectores y comportamiento esperado…», «El contrato de selectores e interacciones está completamente definido en README.md…». El README no dice nada de longitudes, duplicados, persistencia ni textos. La CLI acepta esa base sin control, y con un modelo que no detecta huecos el gate `open-facts` no se abre.
- **IDD cierra con tests en dos de tres.** En r1 cerró sin entregar ningún test: `node --test` sin ficheros de test pasa, así que `checks-pass` quedó satisfecho.
- **gentle-ai no commitea por su cuenta.** En r1 y r2 entregó sin commit y la persona tuvo que pedírselo, como en E4.2. Ninguna ejecución creó documentos en `odd/`.

## 5. Calidad de las entregas: `continue`

Medida sobre el diff de producto desde el commit `setup`. La mutación de un `.html` muta solo las líneas de sus `<script>` en línea.

| Repetición | Líneas de código (gentle-ai → IDD) | Líneas de test | Tests del suite | Mutation score |
| --- | --- | --- | --- | --- |
| r1 | 459 → 464 | 0 → 0 | 0 → 0 | 0 % (0/16) → 0 % (0/29) |
| r2 | 443 → 454 | 0 → 425 | 0 → 3 | 0 % (0/31) → 63,2 % (12/19) |
| r3 | 549 → 458 | 0 → 436 | 0 → 11 | 0 % (0/37) → 36,8 % (14/38) |
| **Media** | | | | **0 % → 33,3 %** |

- **Mutation score:** 0 % frente a 33,3 %. gentle-ai no entregó ningún test, y su intervalo de confianza del 95 % es 0 a 0. El de IDD va de −45,5 a 112,2: con tres muestras, la media no es estable, pero el criterio solo pide que IDD no quede más de 5 puntos por debajo.
- **Revisión ciega por pares**, puntuaciones de 1 a 5 como media de los dos órdenes:

| Repetición | Corrección | Legibilidad | Diseño | Tests | Alcance | Preferida |
| --- | --- | --- | --- | --- | --- | --- |
| r1 | 2 / 2 | 3 / 3 | 3 / 2 | 1 / 1 | 2 / 2 | gentle-ai |
| r2 | 2 / 2 | 3 / 3,5 | 2 / 3 | 1 / 2 | 2 / 3 | IDD |
| r3 | 2 / 2 | 2,5 / 3 | 2 / 3 | 1 / 2 | 2 / 2,5 | IDD |
| **Media** | 2 / 2 | 2,83 / 3,17 | 2,33 / 2,67 | 1 / 1,67 | 2 / 2,5 | |

  El juez prefiere a gentle-ai en los dos órdenes en 1 de 3 pares, dentro del margen de 1. Juez: `claude-sonnet-5-5-medium` por `agy`.

## 6. Lectura

- **Con Gemini 3.8 Flash, IDD no aporta lo que aporta con Claude.** Su ventaja en E4.2 venía de preguntar antes de editar. Aquí el modelo da por cerrado el encargo y declara que no hay hechos abiertos. Los dos brazos escapan los mismos seis defectos, que son justamente los hechos que habría que haber preguntado.
- **IDD gasta menos y entrega tests.** Gasta un 15,5 % menos de tokens, tarda menos y deja tests en dos de tres entregas, que el juez ciego valora mejor. gentle-ai no deja tests en ninguna.
- **Mejoras para IDD que salen de aquí:**
  - controlar la base de `--no-open-facts`, por ejemplo rechazando una base que solo cite la petición o el README cuando quedan sin decidir entradas, límites o persistencia;
  - no dar por satisfecho `checks-pass` con una suite sin tests en una feature que añade código.

## 7. Exclusiones y límites

- **Una sola persona, un escenario y tres repeticiones.** La diferencia de escapados (un check en una repetición) está dentro del ruido.
- **Los brazos corrieron en paralelo,** por decisión del usuario, cada uno con su directorio de workspaces. El sandbox impide que se vean. Comparten el límite de peticiones de Gemini, así que las duraciones pueden salir algo infladas; no forman parte del criterio.
- **Corridas descartadas antes de estos records,** que no se publicaron:
  - `idd-agy-1` y `gentle-ai-agy-1`: Gemini exploró `/tmp` y copió la entrega de la repetición anterior.
  - `idd-agy-2`: una ejecución anulada por `workspace-escape`. Gemini leyó la ruta del repositorio en `ORCA_WORKSPACE_ID`, una variable que añadía la terminal, aunque el sandbox no le dejó ver nada. El arreglo pasó el entorno a lista blanca y cambió la huella del harness.

  Sus transcripts quedan en `scripts/evals/.runs/bench/`.
- **La regla de escape lee rutas en los argumentos** de las herramientas. No ve una ruta construida en tiempo de ejecución; el sandbox cubre ese caso.
- **gentle-ai se mide con tres ajustes de entorno del banco** y con el engram vacío, como en E4.2.
- **El juez y la persona son Claude** servido por `agy`, y el autor de las entregas es Gemini, así que no son la misma familia. Invertir el orden controla el sesgo de posición, no el gusto.
