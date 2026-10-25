# idd-catalog-single-source

## Intent and acceptance

E1.42: los hooks Go leen el catálogo IDD (señales, obligaciones, evidencias, gates, orden de trabajo y how) de un JSON que emite el CLI y embeben, en vez de listas propias; Stop y PreCompact ya no descartan un cambio con untested-product, boundary-tests o review-limit

Acceptance: Un cambio con untested-product y review-limit abierto, otro con boundary-tests pendiente y otro con adr-impact-declaration pendiente dan en Stop y PreCompact el mismo paso en Go y en JS, fijado por el golden de internal/testdata/idd-session; añadir una señal, obligación o gate en JS sin regenerar internal/iddsession/catalog.json rompe un test; Go deja de mantener sus propias listas del catálogo

## Plan

1. Catálogo emitido por el CLI. `scripts/lib/idd-catalog.js` arma el catálogo desde `idd-contract.js` e `idd-next.js` y lo escribe en `internal/iddsession/catalog.json` con `--write`. `idd-catalog.test.js` falla mientras el fichero difiera. `idd-next.js` exporta `HOW` y saca a `CHECKS_REQUIRED` la lista de obligaciones que necesitan checks.
2. Go lo embebe. `internal/iddsession` embebe `catalog.json` y borra sus listas a mano: orden de trabajo, gates, evidencias, `how`, señales, tipos y estados. Tres casos nuevos en el golden `steps` fijan el paso en los dos motores: `s-boundary` (`boundary-tests`), `s-limit` (`untested-product` con `review-limit` abierto) y `s-adr` (`adr-impact-declaration`). Antes, Go descartaba los dos primeros y daba un `how` genérico en el tercero.

## Decisions

- El catálogo lo emite un módulo nuevo, `idd-catalog.js`, y no `idd-contract.js` como decía el roadmap: el orden de trabajo y los `how` viven en `idd-next.js`, que ya importa `idd-contract.js`, y emitir desde el contrato crearía una dependencia circular.
- Cada `how` va al JSON como plantilla con `{change}` en lugar del id, y Go lo sustituye. Un test exige que la plantilla rellenada dé lo mismo que `HOW[id]` y que ningún id kebab-case pueda contener el marcador. Una obligación sin `how` rompe la emisión, así que Go ya no necesita el texto de respaldo «run `ospec next`».
- La regeneración es explícita (`node scripts/lib/idd-catalog.js --write`), como `rules.json`, y no ocurre en el build: el binario Go se compila desde `internal/` con `go build`, sin Node, y un JSON desfasado falla en `node scripts/check.js`.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-25T21:18:15.462Z)
- ev-2: check-run for checks-pass (2026-10-25T21:21:03.096Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-25T21:21:03.096Z)
- ev-4: frozen-review for trust-review (2026-10-25T21:24:22.416Z, subagent-stop)
- ev-5: living-doc-current for living-doc (2026-10-25T21:24:29.911Z)
<!-- ospec:evidence:end -->
