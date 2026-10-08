# install-cli-ux

## Intent and acceptance

E1.9: setup:vscode no falla con EPERM cuando VS Code tiene cargado dist/vscode, los errores de sistema de ficheros dicen operación, ruta y acción, y los 7 instaladores comparten un formato de salida con fases, progreso y resumen final

Acceptance: Con un proceso con cwd dentro de dist/vscode, setup:vscode termina o falla con un mensaje que nombra operación, ruta y 'cierra VS Code y reintenta'; los 7 setup:* muestran las mismas fases, progreso en TTY y resumen final; lo instalado no cambia

## Plan

1. Publicación y errores: `scripts/configure/cli.js` mantiene el renombrado atómico y, solo para `vscode`, publica en su sitio (sobrescribir y podar dentro de las raíces gestionadas, validar el resultado) si renombrar `dist/vscode` da `EPERM`, `EACCES` o `EBUSY`; `scripts/configure/install-engine.js` da errores en español con operación, ruta y el host a cerrar. Tests de reproducción en `scripts/configure/cli.test.js`.
2. Salida común: `scripts/configure/install-output.js` (cabecera, fases `✓ [n/N] fase (s)`, reescritura en sitio en TTY, detalle solo con `--verbose`, resumen final) con sus tests.
3. Adopción: los siete instaladores y el paso Engram (`withEngramStep`, que crea el reporter, consume `--verbose` y cierra con el resumen) escriben por el reporter, en español; REQ-install-038 y su test de contrato.

## Decisions

- Publicación (decisión del usuario): renombrado atómico con fallback en sitio solo ante bloqueo, y solo para el árbol que un host carga en vivo (`dist/vscode`). Si el fallback también falla, el error dice que el destino quedó a medio actualizar.
- Progreso (decisión del usuario): línea de fase con ✓ y duración, reescrita en sitio en terminal interactiva y una línea por fase en tubería o CI. Sin spinner ni hilos: los instaladores son síncronos y el adaptador de la TUI lo exige.
- Idioma (decisión del usuario): salida en español. Los mensajes de error internos y poco frecuentes (definiciones MCP de Codex no admitidas, enlaces simbólicos, errores de la detección de Engram en `scripts/lib`) se quedan en inglés.
- Detalle (decisión del usuario): por defecto, recuentos en el resumen; `--verbose` muestra validadores, binario de hooks y salida de la CLI `claude`. Alcance: los siete `setup:*` y el paso Engram; `configure --target` e `install-target` (`install:opencode`, `install:copilot`) conservan su salida.
- `withEngramStep` captura ahora las excepciones del instalador y las convierte en `error: …` con código 1, para que el resumen de fallo salga siempre; antes llegaban como `fatal:` con la pila.
- `setup:claude` ejecuta la CLI `claude` con salida capturada: se ve con `--verbose` y, si falla, viaja en el mensaje de error.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-08T08:14:32.962Z)
- ev-2: check-run for checks-pass (2026-10-08T08:29:57.924Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-08T08:29:57.924Z)
- ev-4: living-doc-current for living-doc (2026-10-08T08:32:06.205Z)
<!-- ospec:evidence:end -->
