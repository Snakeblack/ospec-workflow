# launcher-epipe-retry

## Intent and acceptance

El lanzador reintenta con el hook Node cuando el binario ospec-hooks no arranca aunque spawnSync devuelva EPIPE junto con la salida 126/127 del /bin/sh de respaldo

Acceptance: Con un ELF de otra arquitectura y un stdin mayor que el buffer de la tubería, un pre-tool-use responde con la decisión del hook Node y stderr nombra exit 126 o exit 127; un binario que arranca y sale con otro código sigue sin reintentarse

## Plan

<!-- ospec:plan:start -->
- Files: `openspec/specs/hooks/spec.md`, `scripts/hooks/ospec-hooks-launch.js`, `scripts/hooks/ospec-hooks-launch.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- EPIPE cuenta como binario que no arrancó solo cuando llega con salida 126/127 y sin señal: es la carrera del /bin/sh de respaldo, que sale sin leer un stdin mayor que el buffer de la tubería; con otro código o con señal el binario pudo correr y no se reintenta
- El aviso [ospec warn] nombra exit 126/127 también con EPIPE, porque la salida del shell es la causa y EPIPE solo el síntoma
- Queda fuera el binario que arranca y sale sin leer todo el stdin (EPIPE en el motivo del ask en vez de exit N): ospec-hooks lee el stdin entero con io.ReadAll antes de hacer nada
<!-- ospec:decisions:end -->

Los cuatro open facts los resolvió el usuario con las opciones recomendadas. La carrera salió en el Validate Harness de main tras el merge de la PR #463, en ubuntu (dash como /bin/sh, entrada `{}`), y allí era intermitente. En local es determinista: con 1 MiB de stdin, `spawnSync` del ELF ajeno devuelve EPIPE con 126 en 50 de 50 ejecuciones, y con `{}` nunca. Por eso el test añade un caso con una entrada de 1 MiB en lugar de depender de la carrera, y su hook Node lee el stdin, como los hooks reales. En producción afectaba a cualquier hook con una entrada grande (por ejemplo, un PostToolUse con mucha salida) si el binario no arrancaba.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-31T16:45:14.469Z)
- ev-2: check-run for checks-pass (2026-10-31T16:47:09.574Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-31T16:47:09.574Z)
- ev-4: frozen-review for trust-review (2026-10-31T16:47:58.658Z, subagent-stop)
- ev-5: living-doc-current for living-doc (2026-10-31T16:48:18.450Z)
<!-- ospec:evidence:end -->
