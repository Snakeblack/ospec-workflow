# close-revalidates-state

## Intent and acceptance

E1.43: ospec close revalida el estado con las reglas de los comandos (ninguna obligación withdrawn o ausente que una señal activa derive y la evidencia ligada al árbol del último check) y PreToolUse deniega escribir idd/<cambio>/state.yaml, idd/archive/** y los recibos de review en los seis targets con hook previo a editar; Cursor solo revalida

Acceptance: El state.yaml de la auditoría editado a mano con checks-pass: withdrawn no cierra y el rechazo nombra la obligación; en Claude, Codex, VS Code, Copilot, OpenCode y Antigravity un Write o Edit sobre idd/<cambio>/state.yaml se deniega; validate-cursor.js declara que Cursor solo revalida; un cambio legítimo cierra igual que hoy

## Plan

1. `close` revalida el estado. `signalGaps` (`idd-contract.js`) nombra cada obligación que una señal activa deriva y el estado tiene `withdrawn` o no tiene, y `closeChange` la rechaza antes que nada, con `how` «ospec check». En `ospec.js`, `requireFreshEvidence` generaliza `requireFreshChecks` con `staleEvidence` (`idd-close.js`): `checks-pass`, `boundary-tests`, `contract-spec-and-test` y `adr-impact-declaration` con fitness deben nombrar el árbol del check actual, y `migration-compat-and-test` el árbol de fuentes. `requireDerived` repite la derivación de `ospec check` y rechaza cada señal, gate o referencia que añadiría. Todo rechaza antes de escribir el changelog.
2. `ospec check` repara. `reopenDerived` (`idd-record.js`) reabre como `pending` la obligación que una señal activa deriva, justo después de `applyDerivation`, así que el estado que `close` rechaza tiene salida.
3. PreToolUse deniega. `writesCliOwnedFile` (JS) y `writesCLIOwnedFile` (Go) deniegan, tras las denegaciones de comandos y sin interruptor, una herramienta de escritura (nombre con `write|edit|patch|create|replace|insert|delete|remove|move|rename` y que no es de lectura) cuyas rutas declaradas, o las cabeceras de parche de una herramienta `patch`, caen en `idd/<cambio>/state.yaml`, `idd/archive/**` o `.ospec/review-receipts/**`. La fixture `pre-tool-use-state-deny.json` fija la paridad, y un test del launcher lo prueba en Claude, Codex, VS Code, Copilot, OpenCode y Antigravity con su payload nativo.
4. Tras la trust review (WARNING y SUGGESTION, sin bloqueantes): `requireResumable` (`idd-close.js`) revalida un cambio marcado `closed` que sigue en `idd/<id>/` antes de archivarlo, `validateState` exige un `closed_at` ISO 8601 UTC (un `../../../x` sacaba el archivo del repositorio), y el guard cubre también `state.yaml.tmp`, `state.yaml.bak` y las claves `source` y `destination` de un movimiento. Tras la segunda (WARNING y tres SUGGESTION, sin bloqueantes): `close` marca cerrado el mismo estado que validó (`state-changed` si `state.yaml` cambió mientras corría git, antes del changelog, que ahora se escribe dentro del lock del estado); el guard deniega también escribir, mover o borrar `idd/archive/` y `.ospec/review-receipts/` enteros, y lee las cabeceras de parche con sangría; y los límites del guard y de la reanudación quedan escritos en la spec.
Tras la tercera (dos SUGGESTION, aprobada) y con la cuarta review autorizada por el usuario: `archiveChange` rechaza un `closed_at` que no sea ISO también cuando el estado viene del archivo sin validar (`findArchived`), y la spec y los docs dejan de afirmar seis targets: el guard deniega donde el host manda la edición a su PreToolUse, los tests prueban su respuesta con el payload de cada host, `docs/target-capabilities.md` dice por target si el hook corre (VS Code y GitHub Copilot hoy no), y la garantía en los siete es la revalidación de `close`.
5. Cursor declara su garantía. `CLI_OWNED_STATE_GUARD = "revalidation-only"` en `validate-cursor.js`, que falla si el `hooks.json` generado de Cursor corre `pre-tool-use` fuera de `beforeShellExecution` y `beforeReadFile`. `install-cursor.js` copia el guard al `preToolUse` genérico de Cursor, que deniega la escritura si Cursor le manda la edición (el test del launcher lo prueba con un payload de Cursor), pero ospec no cuenta con ello.
6. Contrato. REQ-idd-003, REQ-idd-006 y REQ-idd-009 en `openspec/specs/idd/spec.md`, REQ-hooks-029 nuevo en `openspec/specs/hooks/spec.md` y la sección 5 de `docs/harness-runtime.md`.

## Decisions

- **`ospec check` repara el estado que `close` rechaza** (respuesta del usuario al gate open-facts). `close` no escribe nada al rechazar, igual que hoy, y su `how` manda a `check`, que ya recalcula señales y reasienta la evidencia del árbol.
- **`close` vuelve a derivar las señales como `check`** (respuesta del usuario). Reutiliza `deriveSignals` y `applyDerivation` sin lógica nueva, así que también ve una señal borrada junto con su obligación. Las referencias de arquitectura entran también, porque `check` las añade y reabren `adr-impact-declaration`.
- **El deny cubre solo herramientas que escriben un fichero** (respuesta del usuario). El shell queda para la revalidación de `close`, sin heurísticas sobre `>`, `tee` o `sed -i` que bloquearían lecturas.
- **Las rutas se reconocen en cualquier punto de la ruta, sin git** (respuesta del usuario). PreToolUse corre en cada llamada, y la ruta se resuelve contra el workspace antes de partirla, así que `..` no la esconde. Se comparan en minúsculas.
- **Una herramienta escribe si su nombre lo dice.** La lista blanca de lectura (`READ_TOOLS`) no es exhaustiva: `read_file` de VS Code o una MCP de lectura no están, y negar todo lo que no sea lectura bloquearía leer el `change.md` archivado que pide el bucle de memoria. Por eso se deniega por nombre de escritura, que además cubre las MCP de escritura que nombran su fichero en una de las claves de ruta. Una que use otra clave, o mover un directorio `idd/<cambio>` entero, no se deniega: leer cualquier cadena de la entrada denegaría un `Write` cuyo contenido solo menciona la ruta, y mover un directorio de cambio no se distingue de mover un `idd/` ajeno sin más heurística. La revalidación de `close` sigue valiendo ahí.
- **Las cabeceras de parche solo se leen en una herramienta `patch`.** Un `Write` cuyo contenido documenta el formato de parche no se deniega. Si Codex mandara `apply_patch` dentro del shell, no se vería; queda como límite.
- **El deny no tiene interruptor**, como las denegaciones de comandos (ADR 0008): ningún `DISABLE_*` lo apaga y `bypassPermissions` no lo degrada.
- **Un cambio `closed` sin archivar se revalida solo con las reglas del estado.** Pendientes, gates abiertos y obligaciones que una señal deriva: lo que `closeChange` exigió antes de marcarlo. La frescura del árbol y la re-derivación no se repiten, porque el cierre que se reanuda pudo escribir ya el changelog, que cambia el árbol, y reanudar debe seguir funcionando. Es un residuo aceptado y escrito en REQ-idd-009: editar a mano `closed` se salta esas dos comprobaciones.
- **`close` valida fuera del lock del estado y compara dentro.** `git diff` y las huellas pueden pasar de los 5 s tras los que otro proceso reclama el lock, así que no corren dentro: dentro solo se compara el estado guardado con el validado y se escribe el changelog. Un test precarga un `execFileSync` que reescribe `state.yaml` en el primer `git diff` y comprueba el rechazo sin changelog. Su rechazo no manda a `check`, que no abre un cambio cerrado: pide restaurar el estado que escribió ospec o preguntar al usuario.
- **El `.bak` y el `.tmp` del estado son del CLI.** `readChange` renombra `state.yaml.bak` a `state.yaml` cuando este falta, así que escribir el `.bak` equivalía a escribir el estado.
- **`closed_at` se valida en el sumidero.** `archiveChange` es lo único que lo convierte en ruta, así que comprobarlo ahí cubre tanto el estado leído con `validateState` como el que `findArchived` toma del archivo sin validar. Validar todo el estado archivado con `validateState` haría fallar un `close` repetido sobre archivos de versiones anteriores.
- **La cobertura del deny se declara por evidencia, no por cableado.** Los tests del launcher prueban la respuesta del guard con el payload de cada host; si un host corre el hook antes de editar lo dice `docs/target-capabilities.md`, con una fila nueva.
- **Dos residuos de la cuarta review pasan a E1.46 `state-durability`** (decisión del usuario: cerrar y entregar ya). El guard reconoce una escritura por el verbo del nombre, así que un `copy_file`, `append_file` o `save_file` de una MCP de terceros no se deniega. Y REQ-hooks-029 presenta la revalidación de `close` como garantía también de `idd/archive/**` y de los recibos, que `close` no revalida: para esos dos el único control es el hook previo.
- **`staleEvidence` lee cada huella bajo demanda.** Un estado sin nada ligado al árbol satisfecho no llama a git, como el `requireFreshChecks` anterior.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-25T23:13:54.440Z)
- ev-2: check-run for checks-pass (2026-10-25T23:21:48.361Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-25T23:21:48.361Z)
- ev-4: check-run for checks-pass (2026-10-25T23:25:46.714Z)
- ev-5: contract-spec-and-test for contract-spec-and-test (2026-10-25T23:25:46.714Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-10-25T23:25:46.714Z)
- ev-7: frozen-review for trust-review (2026-10-25T23:34:15.655Z, subagent-stop)
- ev-8: check-run for checks-pass (2026-10-25T23:37:12.247Z)
- ev-9: contract-spec-and-test for contract-spec-and-test (2026-10-25T23:37:12.247Z)
- ev-10: adr-impact-declaration for adr-impact-declaration (2026-10-25T23:37:12.247Z)
- ev-11: frozen-review for trust-review (2026-10-25T23:48:37.119Z, subagent-stop)
- ev-12: check-run for checks-pass (2026-10-25T23:52:00.639Z)
- ev-13: contract-spec-and-test for contract-spec-and-test (2026-10-25T23:52:00.639Z)
- ev-14: adr-impact-declaration for adr-impact-declaration (2026-10-25T23:52:00.639Z)
- ev-15: frozen-review for trust-review (2026-10-26T00:03:15.731Z, subagent-stop)
- ev-16: check-run for checks-pass (2026-10-26T00:06:11.338Z)
- ev-17: contract-spec-and-test for contract-spec-and-test (2026-10-26T00:06:11.338Z)
- ev-18: adr-impact-declaration for adr-impact-declaration (2026-10-26T00:06:11.338Z)
- ev-19: frozen-review for trust-review (2026-10-26T00:17:14.902Z, subagent-stop)
- ev-20: living-doc-current for living-doc (2026-10-26T00:18:11.204Z)
<!-- ospec:evidence:end -->
