# launcher-epipe-reason

## Intent and acceptance

El fallo de inspección del lanzador nombra la salida o la señal del hijo, y no EPIPE, cuando el hijo sale sin leer todo el stdin

Acceptance: Un hook que sale con un código distinto de 0 sin leer una entrada mayor que el buffer de la tubería responde con el fallo de inspección nombrando exit N, también tras el reintento con Node; con una señal nombra la señal

## Plan

<!-- ospec:plan:start -->
- Files: `openspec/specs/hooks/spec.md`, `scripts/hooks/ospec-hooks-launch.js`, `scripts/hooks/ospec-hooks-launch.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Con EPIPE y una señal o una salida distinta de 0, el fallo de inspección nombra la señal o exit N: EPIPE solo dice que el hijo salió sin leer todo el stdin; vale también para el hijo Node del reintento
- EPIPE con salida 0 sigue siendo un fallo de inspección con motivo EPIPE, que falla cerrado: el hijo decidió sin leer la llamada entera (ADR 0008, REQ-hooks-025)
- La regla del motivo vive en childFailureDetail y en REQ-hooks-025, que rige todos los fallos de inspección; binaryDidNotStart sigue decidiendo solo el reintento
<!-- ospec:decisions:end -->

Completa `launcher-epipe-retry`, que había dejado este caso fuera. El usuario pidió el 2026-10-31 que el arreglo vaya entero en una sola PR, sin pendientes, y resolvió los open facts con las opciones recomendadas. El binario Go (`io.ReadAll`) y los seis hooks Node leen el stdin entero antes de decidir, así que con nuestros hooks `EPIPE` con otro código solo aparece cuando el hijo cae antes de leer, por ejemplo un hook Node que no carga. `EPIPE` con salida 0 no lo produce ningún hook de ospec. Los tests lo provocan con hooks que no leen el stdin y una entrada de 1 MiB.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-31T17:04:00.658Z)
- ev-2: check-run for checks-pass (2026-10-31T17:05:38.230Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-31T17:05:38.230Z)
- ev-4: frozen-review for trust-review (2026-10-31T17:06:26.835Z, subagent-stop)
- ev-5: living-doc-current for living-doc (2026-10-31T17:06:27.039Z)
<!-- ospec:evidence:end -->
