# launcher-test-shell-reasons

## Intent and acceptance

El escenario de REQ-hooks-031 y su test aceptan el motivo de cada sistema para un ELF de otra arquitectura (ENOEXEC en macOS, salida 126 con bash y 127 con dash como /bin/sh); el producto no cambia

Acceptance: El test 'a binary that cannot start falls back to the Node hook' pasa con /bin/sh de bash, con un /bin/sh que sale con 127 como dash y con ENOEXEC; REQ-hooks-031 nombra los tres motivos; el CI de la PR #462 queda en verde en ubuntu, macOS y Windows

## Plan

<!-- ospec:plan:start -->
- Files: `openspec/specs/hooks/spec.md`, `scripts/hooks/ospec-hooks-launch.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El cambio se declara docs porque no toca código de producto: como bug, repro-test no puede fallar contra el producto base, y como refactor el diff cambia una línea de contrato
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-31T13:46:48.565Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-10-31T13:46:48.565Z)
- ev-3: frozen-review for trust-review (2026-10-31T13:47:21.058Z, subagent-stop)
- ev-4: living-doc-current for living-doc (2026-10-31T13:47:29.208Z)
<!-- ospec:evidence:end -->

El fallo salió en el CI de la PR #462: ubuntu (dash) sale con 127 y macOS da ENOEXEC; con bash como `/bin/sh` sale 126. Con el arreglo, el test pasó en local con bash y con un `/bin/sh` emulado que sale con 127 como dash, montado con `unshare -rm` sobre `/usr/bin/bash`. Antes se abrió este cambio como `bug` y luego como `refactor`, y ninguno podía cerrar; el usuario autorizó borrar ese estado local y reabrirlo.
