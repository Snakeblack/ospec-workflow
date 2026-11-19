# stop-count-before-trace

## Intent and acceptance

El Stop vuelve a contar el fin de turno antes de cargar la traza y lo descuenta cuando pide al agente que siga

Acceptance: Un Stop que el plazo del lanzador corta mientras carga la traza ya ha contado el turno; uno que responde decision block deja el contador como estaba, en Node y en Go; node scripts/check.js pasa

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-19T01:39:46.713Z):

> las recomendadas

Answer 1 — base-moved, user, 2026-11-19T01:51:30.334Z:

> ok, lo que veas mejor para que ospec-workflow quede perfecto
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `internal/hooks/export_test.go`, `internal/hooks/iddnudge_test.go`, `internal/hooks/stop.go`, `internal/hooks/stop_test.go`, `openspec/specs/hooks/spec.md`, `scripts/hooks/stop.js`, `scripts/hooks/stop.test.js`, `scripts/lib/turn-fence.js`, `scripts/lib/turn-fence.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- **Contar primero y descontar al bloquear:** el Stop (Node y Go) cuenta el fin de turno antes de cargar la traza, como desde v2.168.9, y, si responde decision block para que el agente siga, lo descuenta. Un Stop que el plazo corta antes de responder conserva el conteo, porque su host deja terminar el turno.
- Prior decision (memory): Pendiente (j) resuelto: stop.js cuenta antes de cargar la traza y el test de Copilot no reintenta -> idd/archive/2026-11-02-copilot-stop-deadline/change.md: current
- **Sin descuento no hay bloqueo:** si el Stop no puede descontar el turno que contó, responde continue: true, conserva el conteo y lo dice en el systemMessage; nunca pide seguir con el contador un turno por delante.
- **Con el conteo fallido no hay bloqueo:** un conteo que da error puede haber llegado al disco (un fallo después del rename), así que el Stop que lo sufre deja terminar el turno, como pide REQ-hooks-030, en lugar de pedir seguir.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-19T01:51:33.575Z)
- ev-2: check-run for checks-pass (2026-11-19T01:53:26.694Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-19T01:53:26.694Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-19T01:53:54.401Z)
- ev-5: frozen-review for trust-review (2026-11-19T01:57:09.693Z, subagent-stop)
- ev-6: check-run for checks-pass (2026-11-19T02:00:22.292Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-11-19T02:00:22.292Z)
- ev-8: migration-test for migration-compat-and-test (2026-11-19T02:00:34.628Z)
- ev-9: frozen-review for trust-review (2026-11-19T02:05:36.573Z, subagent-stop)
- ev-10: check-run for checks-pass (2026-11-19T02:08:26.286Z)
- ev-11: adr-impact-declaration for adr-impact-declaration (2026-11-19T02:08:26.286Z)
- ev-12: migration-test for migration-compat-and-test (2026-11-19T02:08:40.288Z)
- ev-13: frozen-review for trust-review (2026-11-19T02:11:01.184Z, subagent-stop)
- ev-14: living-doc-current for living-doc (2026-11-19T02:11:09.545Z)
<!-- ospec:evidence:end -->
