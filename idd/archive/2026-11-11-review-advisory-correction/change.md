# review-advisory-correction

## Intent and acceptance

Los avisos de una revisión de confianza aprobada se corrigen con la corrección acotada, sin una revisión sucesora (E1.63)

Acceptance: Tras una revisión aprobada con un WARNING, un arreglo dentro de las rutas congeladas y del presupuesto se valida con ospec review correct y ospec review validate, y trust-review vuelve a satisfied sin que reviews gane una entrada; un arreglo fuera de las rutas o del presupuesto, o una regresión, siguen pidiendo la sucesora; una revisión admite una sola corrección

## Plan

<!-- ospec:plan:start -->
- Files: `AGENTS.md`, `docs/README.md`, `docs/roadmaps/harness-evolution.md`, `handbook/agentes/catalogo.md`, `handbook/idd/estado.md`, `handbook/idd/revision.md`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-contract.test.js`, `scripts/lib/idd-review.js`, `scripts/lib/idd-review.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`, `skills/idd/SKILL.md`, `skills/review-correction/SKILL.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- La corrección de avisos se guarda en advisory_corrections del estado del cambio y el linaje aprobado no se toca, porque review-lineage.js es común con SDD y da por terminal un linaje approved (usuario, 2026-11-11). Descartado, cambiar el motor de linajes.
- La corrección nombra los avisos con --finding, por defecto todos, y pasa solo si el validador da por resueltos todos los nombrados y no detecta regresión (usuario, 2026-11-11). Descartado, exigir siempre todos los avisos, y que baste con no haber regresión.
- Vale la misma regla que la corrección de bloqueantes, las rutas congeladas y el presupuesto de líneas, y una sola corrección por revisión (usuario, 2026-11-11). En los archivos de tres proyectos, 72 de 88 sucesoras tras una aprobada con avisos se quedaron dentro de esas rutas.
- Cuando la corrección pasa, la aprobación cubre el árbol corregido, con otra evidencia frozen-review marcada correction advisory, y las rutas revisadas se comparan con ese árbol. La evidencia de la primera aprobación se queda en el estado.
- review-limit no se abre mientras la última revisión pueda gastar su corrección en los avisos para los cambios desde su candidato, o mientras esa corrección espere su validación. Sin esto, la tercera revisión aprobada con un aviso abriría el gate antes de poder usarla.
- La petición de validación de avisos lleva los hallazgos con su criterio de aceptación, porque el validador no los recibe de otro sitio. La de bloqueantes no cambia.
- Solo IDD. SDD lo adopta, si acaso, en E1.62.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: adr-impact-declaration for adr-impact-declaration (2026-11-11T23:04:11.697Z)
- ev-2: migration-test for migration-compat-and-test (2026-11-11T23:05:17.137Z)
- ev-3: check-run for checks-pass (2026-11-11T23:06:53.478Z)
- ev-4: contract-spec-and-test for contract-spec-and-test (2026-11-11T23:06:53.478Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-11-11T23:06:53.478Z)
- ev-6: living-doc-current for living-doc (2026-11-11T23:07:16.215Z)
<!-- ospec:evidence:end -->
