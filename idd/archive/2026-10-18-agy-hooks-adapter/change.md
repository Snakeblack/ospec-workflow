# agy-hooks-adapter

## Intent and acceptance

Antigravity carga y aplica los hooks de ospec: SessionStart/Stop en formato plano, wrapper ospec-antigravity-hook.js y adaptador de entrada (toolCall, workspacePaths, cwd) y salida (decision, injectSteps) en el lanzador

Acceptance: agy 1.4.2 carga el hooks.json generado sin 'invalid hook'; una lectura de .env por view_file o run_command recibe decision ask; SessionStart inyecta el contexto de ospec con injectSteps; los hooks se ejecutan en el workspace y no en ~/.gemini/config

## Plan

1. Transform (`scripts/lib/target-transform.js`): solo `ospec-session-start`, `ospec-pre-tool-use` y `ospec-stop`; `SessionStart` y `Stop` con handlers planos, `PreToolUse` con `{ matcher: "*", hooks }`; los comandos llaman a `ospec-antigravity-hook.js`.
2. Launcher (`scripts/hooks/ospec-hooks-launch.js` y el wrapper nuevo): con `OSPEC_TARGET=antigravity` rehace la entrada compartida (`tool_name`, `tool_input`, `cwd`, `session_id`), ejecuta el hijo en el `Cwd` del comando o en el workspace, y emite los contratos de agy (`decision`, `injectSteps`, `{}`).
3. Instalación (`install-engine.js`, `validate-antigravity.js`): el merge retira los grupos `ospec-*` que ya no se generan, y el validador rechaza las formas de handler que agy rechaza.
4. Contratos y docs: REQ-hooks-026, install §1.6, `docs/target-capabilities.md` (columna `antigravity`) y roadmap.

## Decisions

- La causa no era `enabled`: agy la documenta como válida y la acepta en `ospec-pre-tool-use`. Evidencia: la documentación de hooks embebida en el binario de agy 1.4.2 y sondas en vivo, en las que solo fallaban los grupos de `SessionStart` y `Stop`.
- Alcance (usuario): formato más adaptador de entrada y salida, no solo el formato. Con solo cargar, nada protegería: la política no reconocía `toolCall` y se ejecutaba desde `~/.gemini/config`.
- Hechos abiertos (usuario): dejar de generar `PreCompact`/`SubagentStop` y retirar sus grupos al reinstalar, sin tocar los ajenos. `SessionStart` va como `systemMessage` persistente, con el mismo texto que el `additionalContext` de Codex.
- `PreToolUse` nunca emite `allow`: un allow afirmativo saltaría los avisos de agy (OSP-017). agy no manda `permission_mode`, así que un fallo de inspección siempre pregunta.
- La detección del host sigue el precedente de Codex: un wrapper fija `OSPEC_TARGET` en su propio proceso, lo que vale con `sh -c` y con `cmd /c`.
- Verificación en vivo (agy 1.4.2, con copia y restauración del `hooks.json` global): carga 5 grupos sin error y conserva `herdr` y `orca-status`. `SessionStart` inyecta el contexto, y `deny` bloquea la lectura de una clave privada. La lectura de `.env` recibe `ask`, que el `toolPermission: always-proceed` del usuario aprueba solo, como el modo bypass.
- Revisión de confianza (generación 1, aprobada con 3 WARNING):
  - T1: el adaptador lleva `CodeContent` y `ReplacementContent` (también dentro de `ReplacementChunks`) a `tool_input.content`, y así el escaneo de secretos y el `deny` del marcador ven lo que agy escribe.
  - T2: una carga `pre-tool-use` sin `toolCall` objeto con `name` y `args` objeto va por el camino de fallo de inspección (`ask`) y no llega a la política como vacía.
  - T3: se mantiene `ask` en el fallo de inspección, siguiendo el precedente de REQ-hooks-025, que degrada a `allow` en bypass. Spec y docs dicen que con `always-proceed` equivale a permitir. Emitir `deny` bloquearía todo el trabajo de agy mientras el hook falle.
- Revisión de confianza (generación 2, aprobada con 1 WARNING):
  - T4: un `Cwd` relativo se resuelve contra el workspace. Uno vacío o inexistente deja el workspace, y nunca se usa el directorio de `hooks.json`. Ahora `cat config` con `Cwd: ".git"` da `deny`.
- Revisión de confianza (generación 3, aprobada con 1 WARNING):
  - T5: sin un workspace que exista, la política se ejecuta en el directorio de `hooks.json`. Por decisión del usuario se corrige en un cambio IDD aparte (`agy-workspace-fallback`), en la misma rama y PR, porque este cambio agotó sus tres revisiones.
- T3, confirmado por el usuario: el fallo de inspección sigue siendo `ask`.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-18T17:39:11.333Z)
- ev-2: check-run for checks-pass (2026-10-18T17:45:25.173Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-18T17:45:25.173Z)
- ev-4: migration-test for migration-compat-and-test (2026-10-18T17:45:33.590Z)
- ev-5: frozen-review for trust-review (2026-10-18T17:48:16.935Z)
- ev-6: check-run for checks-pass (2026-10-18T17:50:45.476Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-10-18T17:50:45.476Z)
- ev-8: migration-test for migration-compat-and-test (2026-10-18T17:50:54.636Z)
- ev-9: frozen-review for trust-review (2026-10-18T17:52:29.475Z)
- ev-10: check-run for checks-pass (2026-10-18T17:54:16.664Z)
- ev-11: adr-impact-declaration for adr-impact-declaration (2026-10-18T17:54:16.664Z)
- ev-12: migration-test for migration-compat-and-test (2026-10-18T17:54:23.948Z)
- ev-13: frozen-review for trust-review (2026-10-18T17:56:10.100Z)
- ev-14: living-doc-current for living-doc (2026-10-18T18:00:27.624Z)
<!-- ospec:evidence:end -->
