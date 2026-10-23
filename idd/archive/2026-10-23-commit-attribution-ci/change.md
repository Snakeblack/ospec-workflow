# commit-attribution-ci

## Intent and acceptance

CI rechaza una PR cuyos commits o cuyo título o cuerpo atribuyen la autoría a un modelo (#394), y el repo declara la regla en un CLAUDE.md para las sesiones en la nube

Acceptance: Un workflow propio en ubuntu falla con el SHA y la línea cuando un commit de base..head o el título o cuerpo de la PR atribuye la autoría a un modelo según findAttribution, pasa con un coautor humano o con fix(claude) y con un rango vacío, y se relanza al editar la PR; CLAUDE.md en la raíz remite a rules/no-model-attribution.instructions.md

## Plan

1. `scripts/ci/check-commit-attribution.js`: `offending(range)` lee `git log` del rango y aplica `findAttribution` del hook `commit-msg` a cada mensaje; `offendingText(title, body)` aplica el mismo comprobador al texto de la PR. La CLI sale con 1 y nombra el SHA y la línea, o `pull request: <línea>`.
2. `scripts/ci/check-commit-attribution.test.js`: repo temporal con coautor de modelo, coautor humano, `fix(claude)`, rango vacío, rango ilegible, texto de PR y la CLI.
3. `.github/workflows/no-model-attribution.yml`: job propio en ubuntu con `opened`, `edited`, `synchronize` y `reopened`; el rango es `base.sha..head.sha` y el título y el cuerpo llegan por `env`.
4. `CLAUDE.md` en la raíz: remite a la regla para que una sesión en la nube, sin el CLAUDE.md global ni los hooks, la vea.

## Decisions

- Workflow aparte y no un paso de `validate-harness.yml`: `edited` relanza solo este check, sin repetir la matriz de cuatro jobs (confirmado por el usuario el 2026-10-23).
- Se revisan también el título y el cuerpo de la PR, porque la regla los cubre y el harness añade ahí su 🤖. Una PR que describa la regla la parafrasea, igual que ya exige el hook a los commits.
- Solo el rango de la PR: el historial contiene commits que describen la regla con su literal (`cc0f79d9`) y los dos ya fusionados (`b76395b4`, `80bc6ba6`) no se reescriben.
- `Claude-Session:` no se añade a la regex: siempre llega con un `Co-Authored-By` que ya falla, y ampliarla tocaría el hook JS, `pretooluse.go` y la regla.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-23T16:36:09.029Z)
- ev-2: check-run for checks-pass (2026-10-23T16:37:31.637Z)
- ev-3: living-doc-current for living-doc (2026-10-23T16:37:38.637Z)
<!-- ospec:evidence:end -->
