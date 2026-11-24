# Modo automático de IDD: qué permite cada host y qué estrategia sale

**Fecha:** 2026-11-24 · **Base:** ospec-workflow v2.187.0 · **Versiones instaladas:** Claude Code 2.1.330, Codex CLI 0.162.1, OpenCode 2.0.32, Antigravity CLI (`agy`) 1.5.16, Cursor CLI (`cursor-agent`) 2026.10.19 y GitHub Copilot CLI 1.0.112.

Este informe responde a una petición del usuario: que ospec pueda ejecutar un roadmap entero, cambio a cambio, sin que la ventana de contexto llegue llena al siguiente cambio, eligiendo las respuestas recomendadas y parando solo ante un bloqueo explícito. Es de solo lectura y da origen a E1.107 a E1.110 del [roadmap](../roadmaps/harness-evolution.md).

## Resumen

1. **El roadmap no tenía ningún ítem así.** Lo más cercano era E5.5 `change-program`, sin abrir, y el traspaso de `skills/idd/references/memory-loop.md`, que propone el siguiente ítem en una sesión nueva y espera al usuario.
2. **Ningún host deja que un hook o el modelo vacíen el contexto de la sesión en curso.** Lo único que da contexto limpio en todos es una sesión o un proceso nuevo por cambio.
3. **El banco de ospec ya es ese conductor.** `scripts/evals/bench/driver.js` lanza sesiones sin interfaz, las reanuda por id, contesta al final de cada turno, corta por turnos o coste y lee del disco si el cambio terminó.
4. **Lo que falta no es técnico sino de garantías:** una respuesta que no dio el usuario necesita una fuente propia y un ADR que enmiende el principio 8.
5. **La estrategia:** un conductor en código que lanza una sesión sin interfaz por cambio, resuelve él los gates delegables con la recomendación que el modelo dejó en disco y para en los bloqueantes. Es opcional: el usuario elige entre interactivo, que no cambia, y automático.

## 1. Método y límites

- **Roadmap y código de ospec:** leídos directamente.
- **Hosts:** documentación oficial y repositorios oficiales de cada uno, leídos el 2026-11-24. Las opciones de línea de órdenes se comprobaron además con `--help` en las versiones instaladas.
- **No se ejecutó ningún agente.** Todo lo que este informe dice de un host sale de su documentación o de su código, salvo lo que cita una verificación en vivo anterior.
- **Verificaciones en vivo que ya existían:** con Claude Code 2.1.325, los hooks de ospec corren bajo `claude -p`, `SessionStart` inyecta los cambios abiertos y `Stop` pide seguir (E1.51). El banco cierra cambios IDD sin interfaz en Claude y en `agy`, con `bypassPermissions` en Claude.
- **Sin verificar:** que `claude -p --permission-mode auto` deje pasar las órdenes de ospec, de la memoria y de git durante un cambio entero. En la issue #475 ese modo denegó escrituras de Engram.

## 2. Lo que el roadmap ya tenía

| Pieza | Qué aporta | Qué le falta |
| --- | --- | --- |
| E5.5 `change-program` | Un objetivo como programa de cambios hijos con un cursor; su investigación ya recomendaba una sesión fresca por hijo | Autonomía y respuestas delegadas |
| Traspaso del roadmap (`memory-loop.md`) | Tras `close` guarda el siguiente ítem en la memoria y lo propone en una sesión nueva | No lo empieza sin que el usuario lo pida |
| E1.51 `open-change-nudge` | `Stop` pide seguir una vez y `SessionStart` inyecta los cambios abiertos | Actúa dentro de una sesión y de un cambio |
| E4.13 `worker-delegation` | Un worker con contexto propio | Lo elige el usuario en cada cambio |
| E1.86 `claude-mod-context-brake` | Lee el contexto real | Solo propone delegar |

En contra está el principio 8: `GATE_SOURCES` (`scripts/lib/idd-contract.js`) solo admite `user` y `user-unverified`, y `skills/idd/references/approvals.md` dice que una respuesta saltada, vacía o por defecto no es del usuario.

## 3. Qué permite cada host

| Host | Sin interfaz y reanudar por id | Permisos sin supervisión | Una pregunta del modelo | Limpiar el contexto desde dentro |
| --- | --- | --- | --- | --- |
| Claude Code | `claude -p`, `--resume <id>`, `--max-budget-usd`, `--json-schema` | `--permission-mode auto`, con un clasificador que revisa cada acción | Con `--permission-prompts none` se retira la herramienta de preguntas | No: ni los hooks ni el modelo pueden lanzar `/clear` o `/compact` |
| Codex | `codex exec --json`, `codex exec resume <id>` | Sandbox `workspace-write` con revisión automática de las aprobaciones | Se rechaza en `exec` | Solo un conductor por app-server |
| OpenCode | `opencode run --format json --session <id>` | `--auto`: todo lo no denegado | Se cancela y el modelo asume | Sí: un plugin puede crear una sesión y compactar |
| Copilot CLI | `copilot -p`, `--resume`, `--autopilot` | `--allow-all-tools` | `--no-ask-user`; en autopilot el modelo decide solo | Solo desde una herramienta del SDK |
| Antigravity | `agy -p --output-format json`, `--conversation <id>` | `--dangerously-skip-permissions` o reglas de permiso | Sin documentar | No |
| Cursor | `cursor-agent -p`, `--resume <id>` | `--force` | Se salta | No |
| VS Code | No tiene | — | — | — |

Lo que conviene tener presente:

- **Los bucles sobre el hook de fin de turno siguen en la misma sesión.** Vale para el plugin `ralph-loop` de Anthropic, para `/goal` y para `/loop`: el contexto crece igual.
- **Permisos intermedios solo hay en Claude y en Codex.** En los demás es todo o nada, así que una ejecución desatendida pide aislar el árbol de trabajo.
- **Claude anuncia que `--bare` será el modo por defecto de `-p`.** En ese modo no corren los hooks: el conductor tiene que pedir el modo completo de forma explícita.
- **Riesgos por probar:** en `cursor-agent -p` hay informes de hooks que no disparan en Linux, y `agy -p` puede perder la salida sin terminal.
- **Subagentes:** la documentación de Claude dice que un subagente puede lanzar subagentes, hasta tres capas. E4.13 da por hecho lo contrario; hay que comprobarlo en vivo antes de abrirlo.

## 4. Lo que ya existe en ospec

- **El conductor:** `converse`, en `scripts/evals/bench/driver.js`, hace un turno, guarda el id de sesión, reanuda, cuenta coste y tokens, detecta la cuota agotada y termina cuando `isDone()` lo dice desde el disco.
- **Los adaptadores:** `scripts/evals/bench/hosts/claude.js` y `agy.js`.
- **La cola:** `scripts/lib/progress-snapshot.js` ya lee las fases de un roadmap y su estado por los nombres de directorio de los cambios.
- **El estado:** `ospec next --json` dice si el siguiente paso es un gate, una obligación o `close`.
- **El contexto al empezar:** `SessionStart` inyecta los cambios abiertos, y cada cambio recupera de la memoria sus decisiones previas tras `record intent`.

## 5. Estrategia

1. **Autorización.** El usuario elige el modo automático, o lanza `ospec auto start`. Es su respuesta explícita, y de ella cuelgan todas las respuestas delegadas de esa ejecución.
2. **Una sesión nueva por ítem.** El conductor lanza el host sin interfaz con un encargo corto. La sesión trabaja con IDD sin cambios.
3. **Responde el conductor, no el modelo.** El modelo pregunta como hoy y deja en disco su recomendación por pregunta. Al acabar el turno, el conductor resuelve el gate con la fuente `delegated` y reanuda la sesión. El modelo nunca se aprueba a sí mismo, y la valla de turnos queda como está.
4. **Paradas en código.** El CLI rechaza `delegated` en los gates bloqueantes y en una pregunta sin recomendación. El conductor escribe el bloqueo, termina y avisa; el usuario responde y la cola se reanuda.
5. **Avance por evidencia.** El conductor solo pasa al siguiente ítem con el `close` en disco, y antes de lanzarlo comprueba el árbol limpio y los checks en verde sobre la base.
6. **Entrega.** Por defecto, un commit local por cambio y sin push. Lo que sale del repositorio se autoriza al arrancar.

### Alternativas descartadas

- **Compactar y seguir en la misma sesión:** pierde información y compacta a mitad de un cambio, no entre cambios.
- **Un subagente por cambio:** la sesión que orquesta sigue acumulando, y Cursor y OpenCode solo admiten un nivel de subagentes, así que el worker no podría lanzar a los revisores.
- **El SDK de agentes o los workflows de Claude:** solo sirven en Claude, y un workflow no deja preguntar al usuario a mitad de ejecución.
- **Que la sesión elija sola la respuesta recomendada:** el modelo se aprobaría a sí mismo en el mismo turno, que es lo que E1.49 vino a marcar.
- **Un segundo agente que decida las respuestas,** como la persona del banco: añade coste y otro juicio de modelo. Queda como opción posterior.

### Riesgos

- **Errores en cadena:** un defecto del tercer cambio llega a los siguientes. Por eso la cola para al primer fallo y tiene un tope de cambios.
- **Coste:** una ejecución son varias sesiones con sus revisores. Los topes son obligatorios.
- **Procedencia:** la marca de ejecución automática la pone el conductor en el entorno. Dificulta falsificar una respuesta delegada, pero no lo impide; es el límite que E1.29 ya declara para `user`.
- **Un ítem que no cabe en un cambio:** la primera versión para. Partirlo en cambios hijos es lo que queda de E5.5.

## Fuentes

- Claude Code: [modo sin interfaz](https://code.claude.com/docs/en/headless), [modos de permiso](https://code.claude.com/docs/en/permission-modes), [hooks](https://code.claude.com/docs/en/hooks) y [subagentes](https://code.claude.com/docs/en/sub-agents).
- Anthropic: [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) y [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).
- Codex: [modo no interactivo](https://learn.chatgpt.com/docs/non-interactive-mode).
- OpenCode: [órdenes](https://opencode.ai/docs/cli/commands.md) y [plugins de servidor](https://opencode.ai/docs/build/plugins/server).
- Antigravity: [modo sin interfaz](https://antigravity.google/docs/cli/headless/).
- Cursor: [modo sin interfaz](https://cursor.com/docs/cli/headless).
- Copilot CLI: [referencia de órdenes](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference).
- El bucle Ralph: [ghuntley.com/ralph](https://ghuntley.com/ralph/).
