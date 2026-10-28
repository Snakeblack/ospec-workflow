# context-budget-ratchet

## Intent and acceptance

Ratchet de los techos de contexto: --update no sube un techo sin --allow-growth y su motivo, presupuesto absoluto en scripts/fixtures/context-budget.json, techo medido de router más protocolo IDD por target, y la skill idd recupera al menos 1 KiB de margen

Acceptance: measure-context-baseline.js --update sale con 1 si una métrica sube sin --allow-growth y con él escribe el motivo en el JSON; findRegressions informa un valor por encima de context-budget.json; la línea base fija router más protocolo IDD por target; la skill idd queda al menos 1 KiB por debajo de su techo en CRLF en los 7 targets

## Plan

<!-- ospec:plan:start -->
- Files: `.agents/skills/harness-audit/SKILL.md`, `docs/roadmaps/harness-evolution.md`, `docs/target-capabilities.md`, `scripts/configure/idd-protocol.test.js`, `scripts/fixtures/context-baseline.json`, `scripts/fixtures/context-budget.json`, `scripts/lib/context-baseline.js`, `scripts/lib/context-baseline.test.js`, `scripts/measure-context-baseline.js`, `scripts/measure-context-baseline.test.js`, `skills/idd/SKILL.md`, `skills/idd/references/checks.md`, `skills/idd/references/repository.md`
- Work units: 2
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Todas las métricas del techo exigen --allow-growth <métrica> --reason al subir con --update; el flag vale en todos los targets donde sube y se repite; un target o un agente nuevo cuenta como subida; --allow-growth sin --reason, --reason sin --allow-growth o un --allow-growth para una métrica que no sube son error de uso (exit 2)
- scripts/fixtures/context-budget.json fija en bytes LF always-on ≤ 4096, router más protocolo IDD ≤ 16000, más references/memory-loop.md ≤ 18000 y cada agente ≤ 16000; ningún flag lo salta y --update rechaza un techo que lo supere
- context-baseline.json acumula growth: [{version, metric, targets: {target: [antes, después]}, reason}] como campo aditivo de ospec-context-baseline/v1; un techo por encima de lo medido es una regresión que pide --update
- Project checks pasa a skills/idd/references/checks.md y Several services or repositories a skills/idd/references/repository.md; idd-protocol.test.js conserva 12 KiB en CRLF como tope absoluto y el tamaño de la skill pasa a ser un techo del ratchet
<!-- ospec:decisions:end -->

- Las métricas nuevas son `idd_protocol_bytes` (la skill), `default_flow_bytes` (*always-on* más la skill) y `memory_flow_bytes` (más `references/memory-loop.md`, que el protocolo lee tras cada `close`). Las demás referencias de la skill no cuentan, porque solo algunos cambios las leen.
- La skill `idd` baja de 12 236 a 10 844 B en CRLF en Claude (de 12 232 a 10 840 en los demás targets), 1 444 B por debajo de los 12 KiB. Router más protocolo IDD queda en 14,0–14,3 KB y, con `memory-loop.md`, en 16,9–17,3 KB.
- El `--update` de este cambio elimina la holgura que tenían los techos (284 B de *always-on* en Claude, de 19 a 81 B en los revisores) y abre los tres techos nuevos con un permiso cada uno, que quedan en `growth`.
- La `version` de una entrada de `growth` es la de `package.json` al medir: las de este cambio dicen 2.163.0, la última publicada, aunque se publican en la siguiente.
- La primera corrida en rojo de `scripts/measure-context-baseline.test.js` usó el script anterior, cuyo `main` ignoraba las rutas inyectadas, y su `--update` reescribió el `context-baseline.json` real; se restauró con `git checkout`. El `main` nuevo recibe la medida, las rutas, la versión y las salidas, así que los tests ya no tocan los ficheros versionados.
- El diff deriva `persistent-data` porque `fs.writeFileSync` pasa a `update()`. `migration-compat-and-test` se cubre con el test que lee techos escritos antes de E4.3.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-28T15:21:07.013Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-10-28T15:21:07.013Z)
- ev-3: migration-test for migration-compat-and-test (2026-10-28T15:21:31.905Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-10-28T15:23:10.004Z)
- ev-5: check-run for checks-pass (2026-10-28T15:26:31.468Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-10-28T15:26:31.468Z)
- ev-7: living-doc-current for living-doc (2026-10-28T15:26:41.009Z)
<!-- ospec:evidence:end -->
