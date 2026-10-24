# changelog-unreleased-link

## Intent and acceptance

El enlace [Unreleased] del CHANGELOG deja de comparar v2.4.5...HEAD (seguimiento de E1.32)

Acceptance: El CHANGELOG no tiene un enlace [Unreleased] que compare desde una versión que no es la última; un test lo comprueba

## Plan

1. `scripts/manifest-sync.test.js`: un test falla si el CHANGELOG define un enlace `[Unreleased]:`.
2. `CHANGELOG.md`: se borra la línea `[Unreleased]: …/compare/v2.4.5...HEAD`. La cabecera `## [Unreleased]` queda como texto.
3. Roadmap: la nota de E1.32 y el historial.

## Decisions

- El enlace se quita en lugar de mantenerlo al día, por decisión del usuario del 2026-10-24. Las más de 300 versiones posteriores a 2.4.5 ya no tienen enlace, y mantener este añadiría un paso a cada release. Además, entre el merge y la Release apuntaría a un tag que todavía no existe.
- El test no depende de los tags, así que también corre en un clon sin ellos.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-24T18:12:41.388Z)
- ev-2: check-run for checks-pass (2026-10-24T18:13:56.259Z)
<!-- ospec:evidence:end -->
