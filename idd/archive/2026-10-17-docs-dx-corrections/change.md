# docs-dx-corrections

## Intent and acceptance

Corregir tres hallazgos de auditoria: el README (EN/ES) presenta 'claude plugin validate --strict' como gate de CI sin serlo; SECURITY.md cita '.plugin/plugin.json', que no existe; scripts/configure/cli.js ejecutado fuera del checkout falla con 'invalid SDD model policy' sin decir la causa.

Acceptance: Tabla y parrafo del README (EN/ES) dicen lo mismo y un test de docs impide la contradiccion; 'rg plugin/plugin.json SECURITY.md' no devuelve nada; el installer ejecutado desde un cwd fuera del checkout funciona o falla con un mensaje accionable que menciona --source, cubierto por un test en cli.test.js.

## Plan

1. Fase roja (`repro-test`): primero los tests — `scripts/configure/cli.test.js` (el CLI ejecutado desde un cwd temporal, fuera del checkout, sin `--source`) y `scripts/docs-lint.test.js` (toda mención de `claude plugin validate --strict` en los README exige «locally»/«localmente» mientras CI no ejecute la validación).
2. Corrección: `sourceDir = args.source || path.resolve(__dirname, "..", "..")` en `scripts/configure/cli.js`; celdas de tabla y párrafos de `README.md` y `README.es.md` (gate: golden fixtures en CI, validación local del CLI); `.plugin.json` en `SECURITY.md` (dos ocurrencias); `openspec/specs/generator/spec.md` (Scenario 12: default de `--source`) y nota de estado parcial en `docs/roadmaps/harness-evolution.md` (E1.32).
3. Verificación: impactos ADR/escenarios declarados, `ospec check` (suite completa más fitness de ADR 0001/0010) y cierre con `ospec close`.

## Decisions

- El `sourceDir` del CLI cae al checkout que posee el script (`path.resolve(__dirname, "..", "..")`) cuando no hay `--source`: ejecutado fuera del checkout funciona en vez de fallar con «invalid SDD model policy», y `--source` conserva la prioridad (decisión del usuario para OSP-021; la alternativa era mantener `cwd` con un error accionable).
- El test de docs solo admite la promesa del gate si un workflow ejecuta `claude plugin validate` de verdad (se excluyen las líneas de comentario YAML); hasta entonces toda mención en los README lleva el calificador local. El camino «instalar el CLI de Claude en CI» sigue abierto sin tocar el test.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-17T17:53:43.810Z)
- ev-2: check-run for checks-pass (2026-10-17T17:55:44.074Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-17T17:55:44.074Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-10-17T17:55:44.074Z)
- ev-5: living-doc-current for living-doc (2026-10-17T17:56:03.463Z)
<!-- ospec:evidence:end -->
