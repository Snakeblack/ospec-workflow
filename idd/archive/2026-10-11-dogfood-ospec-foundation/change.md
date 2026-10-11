# dogfood-ospec-foundation

## Intent and acceptance

Aplicar la foundation (E2.3 y E2.5) a ospec: brief, contexto de equipo, atributos de calidad, mapa de componentes y unos 10 ADR de arquitectura; reclasificar docs/adr/ como decisiones de change archivadas con un índice

Acceptance: docs/architecture/decisions/ contiene solo ADR de arquitectura y cada uno pasa el lint de E2.4 sin errores ni avisos, comprobado por un test de node scripts/check.js; docs/adr/ tiene un índice que los clasifica como decisiones de change archivadas

## Plan

1. Unidad `adr-markdown-lint`: `parseAdrMarkdown` en `scripts/lib/decision-records.js` lee la plantilla ADR de la foundation; REQ-decision-records-007 con fixtures Markdown; nota en `foundation-details.md`. Hecho, con test en rojo antes y en verde después.
2. Unidad `ospec-foundation-docs`: `scripts/lib/architecture-decisions.test.js` (rojo sin documentos) y la foundation de ospec: `docs/product/brief.md`, `docs/architecture/{technical-baseline.md,knowledge-map.yaml,component-map.yaml}`, 11 ADR en `docs/architecture/decisions/`, índice `docs/adr/README.md`, `docs/README.md`, `docs/architecture/README.md` y el roadmap. Hecho, en verde.

## Decisions

- Respuesta del usuario al gate open-facts: todas las recomendadas. Parser de Markdown en lugar de un JSON junto a cada ADR; `docs/adr/` se queda donde está, sin editar, con índice (el archivo SDD sigue escribiendo ahí hasta E3.1); el test falla con errores y con avisos; perfil `public-library`, un mantenedor con agentes; 11 ADR y 5 escenarios `accepted`; prosa en español.
- El ADR 0010 se corrige respecto a la propuesta: el binario Go de hooks e instalador sí tiene dependencias (`go.mod`), así que la decisión es que la instalación no descarga dependencias, no que no exista ninguna.
- El ADR 0008 distingue: los guards de seguridad fallan cerrados y la trazabilidad falla abierta (`commit-msg-hook.js:84`).
- Los escenarios de calidad no llevan medida: el usuario no la definió.
- El test exige que cada driver `scenario:` exista en `knowledge-map.yaml` y cada `constraint:`/`assumption:` en `technical-baseline.md`.
- El índice de `docs/adr/` no se comprueba por completitud: el archivo SDD añadirá registros hasta E3.1.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-11T13:27:34.069Z)
- ev-2: living-doc-current for living-doc (2026-10-11T13:27:36.804Z)
<!-- ospec:evidence:end -->
