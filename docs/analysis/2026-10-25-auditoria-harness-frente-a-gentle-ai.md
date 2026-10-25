# Auditoría del harness frente a gentle-ai

**Fecha:** 2026-10-25 · **Base auditada:** ospec-workflow v2.151.0 (`198c40cf`) · **Referencia externa:** gentle-ai v4.2.0 (`4acaf424`, la última release) y `main` sin publicar (`489c5ef6`, 274 commits más).

Este informe compara **solo el harness**: el flujo, el estado, la verificación, la review, el coste de contexto, la memoria y el conocimiento dentro del flujo, y los guards en ejecución. Quedan fuera instaladores, plugins, TUI, actualización, telemetría y cadena de suministro (decisión del usuario del mismo día). Sustituye a la parte comparativa de la [auditoría del 2026-10-03](2026-10-03-auditoria-harness-y-gentle-ai.md), hecha sobre v2.81.0, y alimenta el [roadmap](../roadmaps/harness-evolution.md).

## Resumen

1. **gentle-ai es barato porque no hace cumplir casi nada.** ODD vive en 87 KB de `CLAUDE.md` que se cargan en cada sesión, y el modelo los cumple por obediencia. El binario solo gobierna la review. Los «cuatro estados públicos» solo están en la documentación: no hay código que los proyecte, ni en v4.2.0 ni en `main`.
2. **La ventaja de IDD en defectos viene de dos mecanismos baratos**: el gate `open-facts`, que obliga a preguntar, y la evidencia que ejecuta el propio CLI. La review no participa: en las transcripciones de Claude no hay ninguna review ni ningún subagente en ninguno de los dos brazos.
3. **El banco de Claude cuenta dos veces los tokens de IDD.** El ratio real es de unas 1,85 veces, no de 2,34 (§2).
4. **El sobrecoste restante es fricción con el CLI, no diseño.** El contexto fijo de ospec es casi la mitad que el de gentle-ai (27,1 k frente a 49,7 k tokens en la primera llamada). El exceso sale de las llamadas: 25,3 por ejecución frente a 11,9.
5. **Hay nueve defectos verificados en ospec** que hacen falsa alguna garantía que se anuncia (§5). Van antes que cualquier mejora.
6. **Todo lo que se propone funciona en los 7 targets.** La garantía vive en el CLI, que todos invocan igual; los hooks del host solo refuerzan, con una degradación explícita donde falta el evento (§7).

## 1. Método y evidencia

| Fuente | Uso |
| --- | --- |
| gentle-ai v4.2.0 y `main`, extraídos con `git archive` del clon de referencia | Código del flujo ODD (`internal/components/agentguidance/`), review (`internal/reviewtransaction/`, `internal/reviewerprovider/`), hooks y store |
| HOME del banco con gentle-ai 4.2.0 instalado (`~/.ospec-bench/gentle-ai`) | Lo que el modelo carga de verdad: `CLAUDE.md` de 87.321 B, agentes, settings y hooks |
| ospec v2.151.0 y los siete builds de `scripts/configure/cli.js` | Flujo IDD, hooks por target, bytes cargados |
| Ejecuciones del CLI `ospec` en repos de prueba | Ceremonia mínima por tipo de cambio y dos intentos de falsificación |
| Transcripciones del banco: `idd-7` frente a `gentle-ai-4` (Claude con Haiku) e `idd-agy-6` frente a `gentle-ai-agy-6` (agy con Gemini), n=3 | Turnos, llamadas, tokens por categoría y cumplimiento real de cada protocolo |

Cinco auditorías en paralelo, una por dimensión. Las afirmaciones de más peso (§2, B1, B2, B5 y que no hubo reviews) se comprobaron después a mano contra el código y las transcripciones.

## 2. Corrección del banco: doble conteo de los tokens de IDD en Claude

`scripts/evals/bench/transcript.js:62` suma `result.modelUsage`. Con `--resume` (`hosts/claude.js`), ese campo es **acumulado**: incluye la sesión anterior. En `idd-7/bugfix/r1`, change-02 informa 968.891 tokens, que son los 326.748 de change-01 más los 642.143 propios. El host de agy sí resta lo acumulado, así que el 2,63× de agy se mantiene. El sesgo va solo contra IDD, porque gentle-ai nunca reanuda una sesión: no pregunta.

| | Record publicado | Suma de `result.usage` por sesión |
| --- | --- | --- |
| IDD, corpus por defecto (18 ejecuciones) | 29,34 M | 23,24 M |
| gentle-ai | 12,54 M | 12,54 M |
| Ratio de tokens | 2,34× | **1,85×** |
| `salas` | 2,84× | **2,49×** |
| USD por repetición del corpus | 0,28 frente a 0,13 | 0,196 frente a 0,126 (**1,55×**) |

Ratios por escenario recalculados: bugfix 1,19, cli-local 1,33, regulated 1,96, saas-small 2,30, brownfield 2,31 y public-library 2,35. La premisa de E4.4 (el turno de construcción gasta unos 1,4 M de 1,66 M) sale del mismo conteo y hay que recalcularla antes de diseñar ese experimento.

## 3. Puntuación

Escala de 0 a 10, donde 10 es lo mejor que se puede conseguir hoy sin sobreingeniería. Se puntúa lo que vive el usuario y la robustez, no las líneas de código. Las notas son más bajas que las de la comparación del 2026-10-13 porque esta vez se intentó romper cada garantía, así que no son comparables una a una. La columna «objetivo» es una meta para cuando se complete el plan del §8, no una medida.

| Dimensión | gentle-ai | ospec hoy | Objetivo | Clave |
| --- | :-: | :-: | :-: | --- |
| Quién decide el siguiente paso | 4 | 8 | 9 | ODD es prosa (`agentguidance/routing.go`); IDD lo deriva del disco (`scripts/lib/idd-next.js`) |
| Ceremonia proporcional | 8 | 4 | 8 | Un typo en gentle-ai cuesta 0 llamadas; en ospec, 4 más la suite entera |
| Descubrimiento de hechos | 3 | 7 | 8 | El código obliga a preguntar; gentle-ai no preguntó ninguna vez en el banco |
| Verificación funcional como evidencia | 2 | 6 | 9 | «Observe RED» es prosa en gentle-ai; en ospec lo ejecuta el CLI, con huecos (B3, B4) |
| Review independiente | 6 | 5 | 7 | El veredicto de gentle-ai lo captura el binario, pero la review es opcional y en el banco no corrió nunca; en ospec, `relayed` se puede falsificar |
| Integridad del estado | 6 | 5 | 8 | El store de review de gentle-ai es sólido y el logbook ODD no es atómico; en ospec, `close` no revalida (B2) |
| Guards en ejecución | 3 | 7 | 8 | gentle-ai no tiene PreToolUse y pone `bypassPermissions` por defecto |
| Economía de tokens | 7 | 5 | 8 | Contexto fijo 49,7 k frente a 27,1 k; llamadas 11,9 frente a 25,3 |
| Autodescripción del CLI | 8 | 4 | 8 | En gentle-ai solo la review imprime el comando literal; en ospec faltan comandos y la invocación falla en zsh (B5) |
| Reanudación | 5 | 4 | 7 | Catálogo Go desfasado (B1) y estado no inyectado al empezar la sesión |
| Memoria en el flujo | 6 | 6 | 7 | ospec tiene mejor diseño y autoridad, pero en la práctica se ejecuta peor (B8) |
| Conocimiento del proyecto | 1 | 8 | 9 | ADR, fitness y mapa de componentes; gentle-ai no tiene equivalente. Ningún escenario del banco lo mide |
| Robustez con modelos débiles | 3 | 6 | 8 | Mutation score: ospec 92,1 → 92,5 % de Haiku a Gemini; gentle-ai 94,4 → 78 % |
| **Media sin ponderar** | **4,8** | **5,8** | **≈7,8** | |

## 4. Dónde va por delante cada uno

**gentle-ai**

1. **Coste en el camino pequeño.** Un typo o un bugfix pequeño no tienen ceremonia, y el 32 % de las llamadas lanzan herramientas en paralelo (14 % en IDD).
2. **El Stop hook bloquea de verdad**, una vez por candidato de alto riesgo, respetando `stop_hook_active` (`internal/cli/review_stop_hook.go`).
3. **Autodescripción de la review.** Cada transición lleva el comando literal, y un test de trinquete obliga a que cada rechazo nombre una salida (`internal/cli/refusal_resolution_ratchet_test.go`).
4. **El veredicto de la review lo escribe el binario**, que lanza el revisor sin herramientas ni ajustes y captura su salida (`internal/reviewerprovider/claude_adapter.go`).
5. **Riesgo por contenido**: 45 sinks CWE sobre las líneas añadidas (`internal/reviewtransaction/risk_dangerous_sink.go`). Además, el modelo solo puede subir el riesgo, nunca bajarlo (`--escalate-item`).
6. **Durabilidad del store**: flock, fsync del fichero y del directorio, compare-and-swap sobre HEAD y reset con lista blanca.

**ospec**

1. **Un siguiente paso determinista** derivado del disco, con señales que se recalculan desde el diff real.
2. **Preguntar lo impone el código**: una feature necesita al menos un `--open-fact`. Es la causa directa de 5 frente a 14 escapados con Haiku.
3. **Evidencia observada por el CLI** y atada al árbol. Es lo único que aguanta el cambio de modelo.
4. **Conocimiento del proyecto que el flujo hace cumplir**: componente tocado → ADR → obligación → fitness desde la base → gate si el cambio se aparta del ADR.
5. **Guards reales**: reglas con deny, censura de secretos en la salida, fallo en cerrado y paridad JS/Go.
6. **Contexto fijo diez veces menor** (router de 3,4 KB frente a 87 KB), con techos en CI.

## 5. Defectos verificados en ospec

| # | Defecto | Evidencia |
| --- | --- | --- |
| B1 | El catálogo Go no conoce la señal `untested-product`, la obligación `boundary-tests` ni el gate `review-limit`. `validPlan` descarta el estado, y Stop y PreCompact escriben «sin cambio activo» | `internal/iddsession/iddsession.go:32-92,226-237`; JS los añadió en `56593a73` |
| B2 | `close` solo mira estados. Si se edita `state.yaml` a mano con `checks-pass: withdrawn`, el cambio se archiva aunque el CLI rechace ese mismo withdraw | `scripts/lib/idd-contract.js:538-544`; reproducido |
| B3 | `boundary-tests` se da por cumplida con los tests que ya existían: una feature sin ningún test nuevo cierra | `scripts/lib/idd-check.js:92-100`; reproducido |
| B4 | El rojo acepta cualquier fallo: un `repro-test` hecho con `test -f marker` cierra | Reproducido |
| B5 | La skill define `ospec` como `node "<ruta>"`. Guardado en una variable, `$O` en zsh da exit 127, en las 18 de 18 ejecuciones de `idd-7` | `skills/idd/SKILL.md:22` |
| B6 | Las citas de `open-facts` aceptan cualquier línea con letras, como `package.json:1` | `scripts/lib/idd-facts.js:92-111` |
| B7 | Cambiar `checks: test: "true"` satisface `checks-pass` sin aviso | `idd/` queda fuera de la huella del árbol |
| B8 | La salida en texto de `close` oculta los temas de memoria. 0 de 13 `mem_save` llevan un tema `knowledge/*` | `scripts/ospec.js:1021` |
| B9 | `--kind` no se contrasta con el diff: un cambio de API incompatible declarado como `refactor` cierra sin preguntar | Reproducido |

## 6. De dónde salen los tokens de más (Claude, cifras corregidas)

Por ejecución: IDD 1.291 k frente a gentle-ai 697 k (Δ 594 k). El 94,5 % es lectura de caché, así que cada llamada de más paga todo el contexto acumulado.

| Categoría | % de Δ |
| --- | ---: |
| Comandos `ospec` (intent, gate, signals, next, run, check, close), 7,2 por ejecución | 57 % |
| Fricción con el CLI: fallos de invocación (B5), localizar el CLI, `--help`, leer su código | 31 % |
| Reanudación después de la pregunta | 10 % |
| Lectura de código | 10 % |
| Lectura de `idd/<id>/state.yaml` y del living-doc | 8 % |
| Carga de la skill | 5 % |
| Salida y razonamiento | 4 % |
| Engram (gentle-ai obliga a guardar: 2,37 llamadas por ejecución) | −15 % |
| Tests, edits y git fuera de `ospec` (contexto por llamada más pequeño) | −11 % |

Una reproducción contrafactual de las 18 transcripciones, con una incertidumbre de ±25 % por palanca, estima estas mejoras acumuladas:

| Palanca | Ratio estimado |
| --- | ---: |
| Invocación en una sola palabra | 1,63 |
| No leer el código del CLI | 1,56 |
| `record intent` acertado a la primera | 1,47 |
| Living-doc generado | 1,35 |
| Encadenar `check`, `close` y `signals` | 1,11 |
| Salidas mínimas | ≈1,0 |

Ninguna palanca quita la pregunta ni el rojo/verde, que son el origen de la ventaja en defectos.

## 7. Multi-target: lo que cada host permite

Los siete targets invocan el CLI igual, `node "<ruta>/scripts/ospec.js"`, así que toda garantía que vive en el CLI vale en los siete sin adaptación. Eventos de hook según los builds de v2.151.0:

| Capacidad | Claude | Codex | VS Code | Copilot | Cursor | OpenCode | Antigravity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Antes de la herramienta (puede denegar) | `PreToolUse` | `PreToolUse` | `PreToolUse` | `preToolUse` | solo shell y lectura | `tool.execute.before` | `PreToolUse` |
| Después de la herramienta | `PostToolUse` | `PostToolUse` | — | — | `afterFileEdit` | `tool.execute.after` | — |
| Fin de turno | `Stop` | `Stop` | `Stop` | `agentStop` | `stop` | — (por verificar `session.idle`) | `Stop` |
| Fin de subagente | `SubagentStop` | `SubagentStop` | `SubagentStop` | `subagentStop` | — | — | — |
| Inicio de sesión | `SessionStart` | `SessionStart` | `SessionStart` | `sessionStart` | — (`beforeSubmitPrompt`) | `session.created` | `SessionStart` |

**Regla para los ítems de esta auditoría:**
- La garantía vive en el CLI.
- Un hook solo refuerza, y en cada target se declara si bloquea, avisa o degrada.
- Una garantía que dependa de un evento que falta degrada a una marca visible (por ejemplo, `user-unverified`), nunca a un fallo silencioso.
- El ítem no se cierra sin validar los siete builds y sin un test por target de lo que cambie en su adaptador.
- El banco solo cubre Claude y agy. Los otros cinco targets se cubren con tests de contrato por target y con los validadores `validate-<target>.js`.

## 8. Propuestas y elección

| Hueco | Opciones | Elegida | Por qué |
| --- | --- | --- | --- |
| B1 | (a) test de paridad; (b) catálogo JSON único para JS y Go; (c) Go llama a Node | **(b)** | Ya existe el patrón de `internal/rules/rules.json`; una sola fuente |
| B2 | (a) deny de escritura sobre el estado; (b) `close` revalida las reglas del CLI; (c) HMAC | **(b) + (a)** | (b) vale en los 7 targets; (c) no protege, porque la clave la lee el mismo usuario |
| B3, B4 | (a) test en el diff; (b) contraprueba en la base; (c) mutation testing | **(a) ya, (b) en C** | La contraprueba demuestra que el test detecta el cambio; (c) es sobreingeniería |
| B5 | (a) una línea en la skill; (b) shim `ospec`/`ospec.cmd`; (c) PATH desde SessionStart | **(b)** | (c) solo funciona en Claude; (a) depende de la obediencia |
| B6, B7, B9 | Contraste determinista | **El modelo solo puede subir la ceremonia** | Aplica lo único que funciona de gentle-ai, pero en código |
| Coste | (a) prosa; (b) el CLI encadena lo que ya sabe; (c) verbo nuevo `finish` | **(b)** | Sin verbos nuevos; `close` sigue siendo el único «hecho» |
| Auto-respuesta del gate (#399) | (a) valla de turno; (b) cita literal del prompt; (c) prosa | **(a)** | Vale en 6 targets; (b) solo si el banco muestra respuestas inventadas después de un fin de turno |
| Preguntas repetidas | Ledger de hechos citable (`fact:F12`) | **Sí, en la Etapa 3** | Convierte la respuesta en conocimiento del proyecto, el norte de ospec |
| Review | (a) árbol congelado; (b) el CLI lanza el revisor; (c) `relayed` no basta | **(a) + (c) donde haya recibos** | (b) acopla el CLI a cada host |
| Seguridad por contenido | (a) unas 20 regex CWE; (b) declarable; (c) clasificador con LLM | **(a) + (b)** | (c) es caro y no es determinista |

## 9. Qué no copiar de gentle-ai

- **El monolito de 87 KB siempre cargado**: el 38 % de su propio gasto.
- **La transacción de review de unas 60 k líneas.** El consentimiento es por candidato, un `declined` no deja rastro y el recibo no decide nada: `review validate` siempre devuelve `unmanaged`.
- **El guardado proactivo obligatorio en Engram**: el 18 % de su gasto, y memoria sin tema ni procedencia.
- **Presupuestos en prosa** con tests que solo comprueban que la frase existe.
- **`bypassPermissions` por defecto** con reglas de deny de coincidencia exacta.
- **El sellado AES de handles y el pinning por sha256 de cada módulo**: la clave la lee el mismo usuario, y el pinning es un impuesto de mantenimiento.

## 10. Límites

- Siete escenarios y uno solo reservado, n=3; casi todo con Haiku.
- Los ahorros del §6 son contrafactuales.
- El banco corrió con ospec 2.145.1 (Claude) y 2.146.4 (agy), anteriores a `207c36f7` y `cb64b831`.
- El clasificador de llamadas usa expresiones regulares: ±10 % por categoría.
- Las transcripciones de agy no se descompusieron por turno.
- La capa de conocimiento de ospec y la memoria entre sesiones no se han medido nunca: ningún escenario tiene `docs/architecture/` ni una segunda sesión.
- No se verificó que el `PostToolUse` de Claude aplique `updatedToolOutput` a las herramientas integradas.
