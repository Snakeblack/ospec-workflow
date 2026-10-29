# counterproof-test-conventions

## Intent and acceptance

Límite 2 de E1.48: isTestPath no reconoce spec/, *_spec.rb, *_test.py ni los tests inline de Rust, así que en esos proyectos repro-test, tdd-red-green y boundary-tests ya no pueden cerrar

Acceptance: Un repro cuyo test está en spec/models/user_spec.rb o en app/pages_test.py cierra la pareja con su contraprueba, classifyPath los tiene por test y addedTests los cuenta; los tests inline de Rust siguen la regla que decida el usuario

## Plan

<!-- ospec:plan:start -->
- Files: `openspec/specs/idd/spec.md`, `openwiki/testing-quality/verification.md`, `scripts/lib/idd-signals.js`, `scripts/lib/idd-signals.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Los tests inline de Rust se reconocen por contenido, sin posiciones: una línea añadida a un .rs cuenta como test si solo aparece dentro de un módulo bajo #[cfg(test)], desde el atributo hasta la llave que cierra el mod a su sangría (como lo deja rustfmt); si la misma línea aparece también fuera, no cuenta
- Si el diff añade código a un test inline de Rust, la contraprueba se omite entera con counterproof_skipped, aunque haya también tests en ficheros aparte
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-29T00:31:31.894Z)
- ev-2: check-run for checks-pass (2026-10-29T00:33:18.979Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-29T00:33:18.979Z)
- ev-4: migration-test for migration-compat-and-test (2026-10-29T00:33:36.825Z)
- ev-5: check-run for checks-pass (2026-10-29T00:35:32.116Z)
- ev-6: contract-spec-and-test for contract-spec-and-test (2026-10-29T00:35:32.116Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-10-29T00:35:32.116Z)
- ev-8: migration-test for migration-compat-and-test (2026-10-29T00:35:37.754Z)
- ev-9: check-run for checks-pass (2026-10-29T00:36:42.038Z)
- ev-10: contract-spec-and-test for contract-spec-and-test (2026-10-29T00:36:42.038Z)
- ev-11: adr-impact-declaration for adr-impact-declaration (2026-10-29T00:36:42.038Z)
- ev-12: living-doc-current for living-doc (2026-10-29T00:36:42.177Z)
<!-- ospec:evidence:end -->
