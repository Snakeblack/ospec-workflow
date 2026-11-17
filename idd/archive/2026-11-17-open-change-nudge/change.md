# open-change-nudge

## Intent and acceptance

El Stop de cada host pide al agente que siga, una sola vez por cambio y huella, cuando un cambio IDD abierto que la sesión tocó tiene trabajo pendiente y ningún gate abierto; SessionStart inyecta al modelo el paso de cada cambio IDD abierto, también sin openspec/config.yaml (E1.51).

Acceptance: Con un cambio IDD abierto con obligaciones pendientes, sin gates abiertos y el árbol cambiado en la sesión, el Stop de cada uno de los 7 targets devuelve la petición de seguir en el formato de su host, y un segundo Stop con la misma huella devuelve continue; con un gate abierto, sin cambios en la sesión o con la marca de continuación del host no pide nada; SessionStart en un proyecto con idd/ y sin openspec/config.yaml entrega al modelo el paso de cada cambio abierto; los validadores de los targets fijan la matriz y Node y Go dan la misma salida.

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `docs/target-capabilities.md`, `internal/hooks/sessionstart.go`, `internal/hooks/stop.go`, `internal/iddsession/iddsession.go`, `openspec/specs/hooks/spec.md`, `scripts/configure/validate-antigravity.js`, `scripts/configure/validate-codex.js`, `scripts/configure/validate-cursor.js`, `scripts/configure/validate-github-copilot.js`, `scripts/configure/validate-opencode.js`, `scripts/configure/validate-vscode.js`, `scripts/hooks/lib/idd-session.js`, `scripts/hooks/ospec-hooks-launch.js`, `scripts/hooks/session-start.js`, `scripts/hooks/stop.js`, `scripts/lib/target-profiles/github-copilot.js`, `scripts/lib/target-profiles/opencode-plugin.js`, `scripts/lib/target-profiles/vscode.js`, `scripts/lib/target-transform.js`
- Work units: 4
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Piden seguir los pasos satisfy-obligation, declare-plan y close; resolve-gate y configure-checks no. Con varios cambios abiertos va una sola petición que los nombra a todos.
- La huella es readTreeFingerprint más el estado de cada cambio IDD abierto; la línea base de la sesión la guarda su inicio (SessionStart, o el primer beforeSubmitPrompt en Cursor) y, si falta, el primer Stop de la sesión, que entonces no pide nada. Una huella ya pedida no vuelve a pedir en ninguna sesión.
- Las líneas base y las huellas pedidas viven en un fichero de .ospec/ recortado a las sesiones más recientes; si falta o está corrupto se empieza de cero, como .ospec/turns.
- La petición (en inglés) da el paso de cada cambio y dos salidas: esperar al usuario y terminar el turno, o preguntarle por ospec abandon si el cambio está sustituido o descartado. Al inicio, el paso va al modelo y una línea al usuario donde el host la muestra.
- Sin huella o sin estado legible el Stop no pide seguir y devuelve continue con un systemMessage que dice por qué; DISABLE_IDD_NUDGE=true apaga la petición y la inyección.
- VS Code y Copilot llevan una marca de host en los comandos generados, porque VS Code solo lee la decisión dentro de hookSpecificOutput y Copilot lee additionalContext en el nivel superior; Codex recibe solo decision y reason, porque rechaza cualquier otra clave.
- La huella no reutiliza readTreeFingerprint: la calculan los hooks (idd-nudge.js e iddnudge.go) sobre los bytes crudos de git, para que Node y Go den el mismo valor, y deja fuera idd/<cambio>/ y todo .ospec/; el estado de cada cambio abierto entra por su state.yaml.
- SessionStart guarda la huella inicial en cualquier proyecto con idd/, aunque no haya cambios abiertos, para que un cambio abierto en la misma sesión pueda pedir seguir en su primer Stop.
- Go aprende el paso ask-open-facts de E1.75 (owedQuestion), con impact_signals en el catálogo embebido, porque la acción del paso decide si se pide seguir y su versión del siguiente paso no lo conocía.
<!-- ospec:decisions:end -->

### Matriz por host

La segunda decisión sobre la huella sustituye a la primera: no se reutiliza `readTreeFingerprint`.

| Host | Pedir que siga | Contexto al empezar |
|---|---|---|
| Claude Code | `{"decision":"block","reason"}` tal cual | `hookSpecificOutput.additionalContext` |
| Codex | solo `decision`, `reason` y `systemMessage` | al principio de `additionalContext` |
| Copilot CLI (`--host github-copilot`) | `{"decision":"block","reason"}` tal cual | `additionalContext` en el nivel superior |
| VS Code (`--host vscode`) | dentro de `hookSpecificOutput` | `hookSpecificOutput.additionalContext` |
| Cursor | `followup_message` | `additional_context` del primer `beforeSubmitPrompt` |
| Antigravity | `{"decision":"continue","reason"}` | al principio de `injectSteps` |
| OpenCode | el plugin manda la razón como prompt | `noReply` (1.x), entrada de instrucciones o mensaje sintético (2.x) |

### Verificación en vivo (2026-11-17)

- Claude Code 2.1.325: el modelo recibe los cambios abiertos y el Stop le hace seguir una vez; el turno siguiente lleva `stop_hook_active` y no pide más.
- OpenCode 2.0.32 (`opencode run --standalone`, `XDG_CONFIG_HOME` aislado, modelo gratuito): el modelo recibe los cambios abiertos y el Stop pide seguir en un turno real; `opencode run` termina tras el primer turno, así que la continuación no se observó.
- Sin verificar: Codex y Copilot CLI (sin sesión iniciada), Cursor (`cursor-agent -p` no ejecuta hooks), Antigravity (solo hooks globales) y VS Code (interfaz gráfica).

## Evidence

<!-- ospec:evidence:start -->
- ev-1: migration-test for migration-compat-and-test (2026-11-17T01:37:28.423Z)
- ev-2: check-run for checks-pass (2026-11-17T01:39:55.067Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-17T01:39:55.067Z)
- ev-4: frozen-review for trust-review (2026-11-17T01:43:06.457Z, subagent-stop)
- ev-5: living-doc-current for living-doc (2026-11-17T01:43:45.641Z)
<!-- ospec:evidence:end -->
