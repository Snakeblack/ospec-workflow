# greenfield-head-to-head

## Intent and acceptance

E4.5: el banco gana el host `agy` (Antigravity CLI) con Gemini 3.8 Flash, un brazo gentle-ai instalado para `agy` y un corpus greenfield con el escenario `todo-spa`: una lista de tareas en un único `index.html`, comprobada con Chromium headless por CDP. Se ejecuta IDD frente a gentle-ai con 3 repeticiones, se mide la calidad de las entregas y se publica el informe.

Acceptance: `bench.js run --host agy --corpus greenfield --arm idd|gentle-ai --repetitions 3` produce dos records completos de `todo-spa` en `agy` con `gemini-3.8-flash-high`. Los checks ocultos juzgan cada entrega en Chromium headless, `quality.js` mide el mutation score del JS de `index.html` y la revisión ciega por repetición, el checkpoint con márgenes nuevos da su veredicto y el informe queda publicado en `docs/analysis/`.

## Plan

Cuatro unidades:

1. **Host `agy` en el banco** (`scripts/evals/bench/`): `hosts/agy.js` (turnos `agy -p --output-format json` reanudados con `--conversation`, uso acumulado por conversación, persona con `--json-schema`), `hosts/gentle-ai.js` (instalación para `agy` con los tres ajustes de entorno), `bench.js` (`--host`, `--corpus`, `setup-gentle-ai --host agy`), `driver.js` (tope de tokens por ejecución), `record.js` y `transcript.js` según haga falta, tests, README y `openspec/specs/bench/spec.md`.
2. **Corpus greenfield:** `scenarios-greenfield/todo-spa/` (brief, hechos F1–F9, semilla con README y `package.json`, checks ocultos), ayuda de navegador por CDP sin dependencias para los checks, entrega de referencia y su test.
3. **Calidad adaptada** (`scripts/evals/quality/`): mutación de las líneas de `<script>` en línea de `.html`, `node_modules` reutilizado en la copia de mutación, juez por `agy` y criterio de calidad predeclarado.
4. **Corridas e informe:** `bench-margins-7`, records `idd-agy-1` y `gentle-ai-agy-1`, calidad, informe en `docs/analysis/`, sección E4.5 y filas del roadmap.

## Decisions

Del plan aceptado por el usuario (2026-10-13, memoria del 12-10): un escenario mediano `todo-spa` con los hechos F1–F9 (título recortado, vacío rechazado y máximo 200; duplicados pendientes rechazados sin distinguir mayúsculas; clave `tareas.v1` y datos corruptos → lista vacía; contador en español; filtro `#/pendientes` en la URL; edición con doble clic, Enter, Escape y vacío borra; las nuevas al final y completar no reordena; título como texto; nombres accesibles); host `agy` para no gastar cuota de Claude; brazos IDD (target antigravity de ospec) y gentle-ai 4.1.1 (`--agent antigravity`), los dos con `gemini-3.8-flash-high`; persona Claude Sonnet 5.5 servida por `agy`; 3 repeticiones; checks con Chromium headless por CDP, sin dependencias.

Del gate `open-facts` (usuario, 2026-10-13, «todos los recomendados»):

- `todo-spa` va en un corpus aparte, `scenarios-greenfield/`, con `--corpus`: el digest de los seis escenarios de E4.1/E4.2 no cambia.
- Semilla: README con el encargo y el contrato del DOM por ids, y `package.json` mínimo con `"test": "node --test"`, sin dependencias.
- El brazo IDD recibe el brief tal cual: el router de ospec se carga en `agy`, y gentle-ai también recibe el brief tal cual.
- `agy` no da coste en dólares: 30 turnos de agente y un tope de 30 M tokens por ejecución sustituyen a `max-cost`.
- La persona usa `claude-sonnet-5-5-medium` en `agy`.
- `bench-margins-7`: baseline gentle-ai, candidato IDD, 3 repeticiones; la media de escapados de IDD no supera la de gentle-ai y sus tokens no pasan de 1,0× los de gentle-ai.

Corrección del usuario a la respuesta 7 del gate (2026-10-13): **sí se mide la calidad**, porque es de lo más importante. El estado del cambio conserva la respuesta original («sin mutation score»): la CLI no permite cambiar una intención resuelta (`intent-conflict`) ni reabrir `open-facts` (`gate-managed-by-intent`). Rige esta corrección. Respuestas del usuario a la adaptación («todo lo recomendado»):

- La mutación de un `.html` muta solo las líneas de sus bloques `<script>` en línea, con los mismos operadores; CSS y marcado quedan fuera.
- El agente puede añadir dependencias de desarrollo para sus tests (por ejemplo jsdom); `index.html` sigue sin dependencias. La copia de mutación reutiliza `node_modules`.
- La revisión ciega por pares la hace Claude Sonnet 5.5 servido por `agy`, emparejando repetición con repetición, y cada par dos veces con el orden invertido.
- La calidad entra en el veredicto de E4.5 con un criterio declarado antes de correr: el mutation score medio de IDD no puede quedar más de 5 puntos por debajo del de gentle-ai, con el intervalo de confianza de cada brazo en el informe, y la revisión ciega no puede preferir a gentle-ai de forma consistente (en los dos órdenes) en 2 o más de los 3 pares. Si no se cumple, `revise`.

Del arreglo de gentle-ai en `agy` (aceptado por el usuario, 2026-10-13): gentle-ai 4.1.1 se instala con su comando para antigravity tal cual, con tres ajustes de entorno que no tocan su contenido y que el informe declara como adaptación del arnés:

- Se crea `<home>/.gemini/antigravity-cli/mcp_config.json` con `{}` antes de instalar. Sin él, su verificación posterior falla y revierte `GEMINI.md`: con el marcador `.gemini/config/.migrated` que `agy` crea, su adaptador escribe la configuración global en `.gemini/config`, pero busca el MCP en `antigravity-cli/`.
- `agy plugin install <home>/.gemini/antigravity-cli/plugins/gentle-ai-engram` registra el plugin de Engram que gentle-ai genera.
- Sus skills se copian de `antigravity-cli/skills` a `.gemini/config/skills`, que es donde las lee `agy` 1.3.3.

De desarrollo:

- `agy` da `usage` acumulado por conversación (`input_tokens`, `output_tokens` con el razonamiento incluido, `thinking_tokens`, `cache_read_tokens`); su `total_tokens` no suma `cache_read_tokens`. El banco toma el uso del último turno de cada conversación y suma la lectura de caché aparte.
- El prompt va como argumento de `-p` (`agy` no lo lee de la entrada estándar) y `agy` no tiene `--system-prompt`: el prompt de sistema de la persona va delante del mensaje.
- Las credenciales de `agy` no viven en `~/.gemini`: con `HOME` aislado sigue autenticado, y ninguna regla del usuario entra en la medición.

- `agy` acepta el prompt por stdin (`--input-format stream-json --output-format stream-json --print=` y la línea `{"event":"user","message":{"content":"…"}}`), y el host lo usa para todas las llamadas, porque dos diffs pueden superar el límite de 128 KB de un argumento. El resultado es el último evento `result`.
- `agy` guarda conocimiento entre conversaciones (`delete_knowledge`): cada workspace usa una copia limpia del HOME plantilla bajo `.git/agy-home`.
- Criterio de calidad: una suite entregada que falla antes de mutar cuenta como 0; una entrega sin código que mutar queda fuera.
- La validación de `todo-spa` va en `checks-greenfield.test.js`, con cuatro checks a la vez; sin navegador Chromium se salta.

### Estado (2026-10-13)

Unidades 1 a 3 hechas, con tests en verde y `ospec check` pasando. Unidad 4 bloqueada: las corridas `idd-agy-1` y `gentle-ai-agy-1` **no son válidas**.

- **Bug corregido a mitad de corrida:** `DEFAULTS.gentleAiHome` (el HOME de gentle-ai para Claude) pisaba el de `agy`. Ahora cada host tiene el suyo y hay un test. Hubo que relanzar las dos corridas.
- **Contaminación entre ejecuciones:** Gemini explora el disco por su cuenta (`ls ..`, `find /tmp/ospec-bench -maxdepth 3`). En las r2 y r3 de los dos brazos leyó y copió la entrega de la repetición anterior, que estaba en el directorio hermano: el `index.html` de IDD es idéntico byte a byte en las tres. Incluso la r1 de IDD listó el workspace de gentle-ai, que corría en paralelo. Ningún transcript leyó los checks ocultos, este repositorio ni el HOME del usuario. `agy --sandbox` no impide leer fuera del workspace.
- **Observación, no medida:** en las seis ejecuciones, ningún brazo hizo preguntas. IDD declaró siempre `--no-open-facts` con una base genérica («el contrato del README y los requisitos definen…»). Escaparon F1 (máximo 200), F2, F3 y F4 en los dos brazos, y F9 solo en gentle-ai. Tokens: IDD 2,45 M de media y gentle-ai 1,74 M (checkpoint `revise` por tokens, 1,41×).
- **Decisión del usuario (2026-10-13): opción A, en otra sesión.** Cada ejecución corre en un directorio temporal propio con nombre opaco y, al juzgarse, se archiva fuera de `/tmp` (en `scripts/evals/.runs/`, ignorado por git); `quality.js` lee de ahí. Los brazos corren en serie. El host `agy` detecta en los pasos del transcript cada herramienta que toca rutas de otra ejecución o del banco, y anula la ejecución (`workspace-escape`) sin contarla. Después se repiten las seis ejecuciones con records nuevos.
- Los records contaminados (`idd-agy-1`, `gentle-ai-agy-1`) y sus resultados de calidad se han borrado sin publicarse; sus transcripts siguen en `scripts/evals/.runs/bench/`. Los records nuevos eran `idd-agy-2` y `gentle-ai-agy-2` (ver más abajo: ahora `-3`).

Aislamiento implementado (2026-10-13):

- `bench.js run` toma un cerrojo (`.bench.lock`, con el pid) en el directorio de workspaces: una segunda corrida se niega mientras la primera vive, y un cerrojo de un proceso muerto se toma.
- Cada ejecución trabaja en `ospec-bench/<opaco>/<escenario>`: el directorio padre es suyo y solo contiene el workspace, así que `ls ..` no ve nada ajeno. Tras juzgarse, el workspace se copia a `scripts/evals/.runs/bench/<record>/<escenario>/r<n>/workspace` (enlaces tal cual, sin sockets) y el directorio opaco se borra. `locateWorkspace` busca primero ese `workspace/`, y la raíz por defecto de `quality.js` pasa a ser `scripts/evals/.runs/bench` (las records anteriores a E4.5 necesitan `--bench-root`).
- Regla de escape: tras cada turno, `findEscapes` lee los pasos de herramienta del transcript (parámetros de ruta y `CommandLine`, nunca contenidos de ficheros). Una ruta absoluta, o relativa que sube con `..` (resuelta siguiendo los `cd` de la línea), es un escape si queda fuera del directorio de la ejecución y de la plantilla del brazo y dentro o por encima de una raíz prohibida: el directorio de workspaces, el de runs, el de records, este repositorio y `~/.ospec-bench`. La raíz `/` sola no cuenta, porque el código en línea de comandos la nombra a menudo. La plantilla de IDD queda permitida porque el router instalado llama a `ospec.js` por su ruta. Sobre los transcripts contaminados, la regla anula las seis ejecuciones y no marca ninguna llamada a la CLI de ospec.
- Una ejecución anulada no se juzga ni se escribe en el record; sus transcripts y su workspace pasan a `<slot>.escaped-<k>/` y el mismo comando la repite.
- El HOME de la persona (su conversación contiene los hechos ocultos) se borra tras cada llamada, y el agente recibe `PWD` igual a su workspace, sin `OLDPWD`, `INIT_CWD` ni variables `npm_*` que delaten el repositorio.
- Límite conocido: la regla lee rutas en los argumentos; no ve una ruta construida en tiempo de ejecución (por ejemplo, concatenada dentro de un script).

Sandbox (decisión del usuario, 2026-10-13, tras la primera corrida con la opción A):

- La r1 de `idd-agy-2` se anuló bien (`workspace-escape`), pero mostró que detectar no basta: Gemini listó `/tmp/ospec-bench` (la ruta sale de la plantilla), vio los workspaces de E4.2, ejecutó `ps aux | grep bench`, sacó de la línea de comandos la ruta del repositorio y leyó `checks.js` y `scenario.json`. Anular a posteriori sesgaría además la muestra hacia ejecuciones que no exploran.
- El usuario eligió «A + sandbox»: cada proceso de agy (agente y persona) corre en bubblewrap con su propio espacio de PIDs, `/tmp`, el `HOME` del usuario y los directorios del banco vacíos, y solo el directorio de la ejecución (escribible), la plantilla del brazo, el binario de agy y el Node del banco montados de vuelta (solo lectura); el Node del banco va primero en el `PATH`. agy sigue autenticado con todo `HOME` oculto. Sin `bwrap`, `run --host agy` se niega antes de instalar nada.
- `workspace-escape` queda como red de seguridad: solo anula una ruta del banco que el sandbox no monta ni está por encima de algo montado. Listar `/tmp`, `..` o `../..` ya no anula, porque dentro del sandbox no muestran nada ajeno. Tras un `cd` que sale del directorio inicial, las palabras relativas con forma de ruta también se resuelven.
- Los workspaces de E4.2 (`idd-3`, `gentle-ai-1`) se movieron de `/tmp/ospec-bench` a `scripts/evals/.runs/bench/<record>/<escenario>/workspace` (elección del usuario); sus entregas se leen igual desde ahí.
- Cada turno tiene un sandbox nuevo: un proceso en segundo plano no sobrevive a su turno.
- El `node` del agente de Cursor (v24.5) no borra un enlace simbólico roto con `fs.rmSync`, y `idd-workspace.test.js` falla con él; los checks y las corridas usan el Node del sistema (v26).

Fuga por el entorno (2026-10-13, segunda corrida con sandbox):

- En `idd-agy-2` la r1 se completó limpia, pero la r2 se anuló bien (`workspace-escape`): Gemini ejecutó `env | grep`, vio `ORCA_WORKSPACE_ID=…::<ruta del repositorio>` (la terminal Orca la añade al entorno) y lanzó `find` sobre esa ruta. El sandbox la ocultaba y los `find` no devolvieron nada.
- El filtro del entorno pasa de lista negra a lista blanca: `PATH`, locale (`LANG`, `LANGUAGE`, `LC_*`, `TZ`), terminal (`TERM`, `COLORTERM`), usuario (`USER`, `LOGNAME`, `SHELL`), `TMPDIR`, `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`, proxies y certificados. Vale para el agente, la persona y el Engram de gentle-ai. agy sigue autenticado con solo eso.
- El arreglo cambia el `harness_digest`: `idd-agy-2` se borra sin publicarse (sus transcripts siguen en `scripts/evals/.runs/bench/idd-agy-2/`) y los records nuevos son `idd-agy-3` y `gentle-ai-agy-3`.
- Decisión del usuario (2026-10-13), por tiempo: los dos brazos corren en paralelo, cada uno con su directorio de workspaces (`--workspaces-dir`) y su cerrojo. El sandbox oculta `/tmp`, da a cada proceso su espacio de PIDs y el entorno va en lista blanca, así que un brazo no ve al otro. Comparten el límite de peticiones de Gemini, y las duraciones pueden salir algo infladas (no cuentan en el criterio).

Resultado (2026-10-13): records `idd-agy-3` y `gentle-ai-agy-3`, 3/3 completas cada uno, ninguna anulada. Checkpoint `bench-margins-7`: **revise** (escapados 6,67 frente a 6,33; tokens 0,845×). Calidad: **continue** (mutation score 33,3 % frente a 0 %; el juez prefiere a gentle-ai en 1 de 3 pares). Informe en `docs/analysis/2026-10-13-bench-greenfield.md`; roadmap y `docs/comparacion-arneses.md` actualizados.

Follow-ups:

- ospec no permite corregir la respuesta de un gate ya resuelto ni añadir preguntas a `open-facts` después de resolverlo.
- IDD acepta `--no-open-facts --basis` sin control. Con un modelo más flojo eso se salta el gate: se podría rechazar una base que solo cita la petición o el README cuando quedan entradas, límites o persistencia sin decidir.
- `checks-pass` da por buena una suite sin tests (`node --test` sin ficheros pasa): en `idd-agy-3` r1, IDD cerró una feature de 464 líneas sin un solo test.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-12T22:55:29.546Z)
- ev-2: check-run for checks-pass (2026-10-12T22:58:14.978Z)
- ev-3: check-run for checks-pass (2026-10-12T22:58:40.148Z)
- ev-4: check-run for checks-pass (2026-10-12T23:45:12.644Z)
- ev-5: check-run for checks-pass (2026-10-13T09:50:10.203Z)
- ev-6: living-doc-current for living-doc (2026-10-13T09:50:30.099Z)
<!-- ospec:evidence:end -->
