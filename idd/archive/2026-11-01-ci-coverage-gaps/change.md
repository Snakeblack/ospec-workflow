# ci-coverage-gaps

## Intent and acceptance

CI deja pasar roturas: los tests Go no corren cuando cambian sus entradas JS/YAML y publish no espera a Build ospec-hooks; Go 1.23 sin soporte; el target claude no se valida; artefactos sin uso; test_caveman.py sin ejecutar; npm test con HOME real; test de Copilot intermitente en Windows

Acceptance: build-hooks corre en todas las PRs y en main sin cancelar main, con Node; publish espera a Validate Harness y a Build ospec-hooks del mismo SHA; go.mod declara go 1.26 y los workflows usan go-version-file con govulncheck; el CI valida el target claude con la CLI real; build-hooks no sube artefactos; test_caveman.py se ejecuta; ningún test lanza npm con el HOME real; el test de Copilot tolera un runner lento

## Plan

<!-- ospec:plan:start -->
- Files: `.github/workflows/build-hooks.yml`, `.github/workflows/publish-marketplace.yml`, `.github/workflows/validate-harness.yml`, `CONTRIBUTING.md`, `README.es.md`, `README.md`, `docs/roadmaps/harness-evolution.md`, `go.mod`, `internal/hooks/subagentstop_test.go`, `openspec/specs/hooks-runtime/spec.md`, `scripts/check.js`, `scripts/check.test.js`, `scripts/ci/wait-for-ci.js`, `scripts/ci/wait-for-ci.test.js`, `scripts/ci/wait-for-validate-harness.js`, `scripts/ci/wait-for-validate-harness.test.js`, `scripts/configure/install-global-copilot.test.js`, `scripts/ospec.test.js`, `skills/caveman-compress/scripts/test_caveman.py`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- publish espera a Validate Harness y a Build ospec-hooks del mismo SHA con un único script, scripts/ci/wait-for-ci.js (renombrado desde wait-for-validate-harness.js), que espera los workflows en orden
- build-hooks.yml sin filtro paths; como Validate Harness, solo cancela runs de PR y nunca los de main, que publish necesita
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-01T09:02:35.262Z)
- ev-2: check-run for checks-pass (2026-11-01T09:08:05.840Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-01T09:08:05.840Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-01T09:08:26.698Z)
- ev-5: check-run for checks-pass (2026-11-01T09:09:42.242Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-11-01T09:09:42.242Z)
- ev-7: living-doc-current for living-doc (2026-11-01T09:09:42.386Z)
<!-- ospec:evidence:end -->
