# own-skills

## Intent and acceptance

Versiones propias de las skills que conservan texto de gentle-ai: chained-pr, cognitive-doc-design, comment-writer, judgment-day, skill-creator con su guía de estilo, work-unit-commits y las referencias de testing de stack-go, escritas desde lo que ospec necesita hoy (E1.98)

Acceptance: Ninguno de esos ficheros conserva líneas largas idénticas a las de gentle-ai (comparación de líneas de 30 caracteres o más contra el clon, la medida de E1.78), sus SKILL.md nombran solo a manuel-retamozo-garcia como autor de gentle-ai hacia fuera, NOTICE deja de listarlas en la sección de gentle-ai y node scripts/check.js pasa

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-17T21:26:34.629Z):

> continua

Answer 1 — open-facts, user, 2026-11-17T21:32:39.660Z:

> 1. lo recomendado, 2. lo recomendado, hay que poner gran esfuerzo en esto para que se note la mejora, 3. aqui realmente, no quiero que este en español, pero si que sepa que debe estarlo, pero si un ingles usa el harness, debe estar en ingles, o un frances pues en frances, es decir en el idioma que se usa, y esto lo debemos hacer robusto para que no falle, 4. lo recomendado, 5. corregirlos y mejorarlos para que encaje mejor con ospec-workflow, en general todo debe seguir la dirección de lo que es hoy ospec-workflow, compatibilidad con sdd si, pero la dirección hoy es foundation + idd.

Answer 2 — open-facts, user, 2026-11-17T21:43:13.627Z:

> todas las recomendadas, pero la 2. quiero tambien en la documentación y comentarios del codigo, poniendo tambien unicamente para esto que sean concisas, funcionales, y sin referencias al harness o a motivos declarados en la sesion. tienes mi aprobación para hacerlo en distintos changes para hacer un mejor trabajo y que todo funcione correctamente y mejor de como esta ahora, en general.
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `NOTICE`, `docs/README.md`, `docs/roadmaps/harness-evolution.md`, `handbook/idd/entrega.md`, `handbook/idd/foundation.md`, `idd/config.yaml`, `openspec/specs/idd/spec.md`, `openspec/specs/skills/spec.md`, `rules/no-model-attribution.instructions.md`, `scripts/fixtures/context-baseline.json`, `scripts/lib/idd-config.js`, `scripts/lib/idd-config.test.js`, `scripts/lib/idd-next.js`, `scripts/lib/idd-next.test.js`, `scripts/lib/team-profile.js`, `scripts/lib/team-profile.test.js`, `scripts/ospec.impact.test.js`, `scripts/ospec.js`, `scripts/ospec.output.test.js`, `skills/branch-pr/SKILL.md`, `skills/caveman/SKILL.md`, `skills/chained-pr/SKILL.md`, `skills/chained-pr/references/chain-playbook.md`, `skills/chained-pr/references/chaining-details.md`, `skills/cognitive-doc-design/SKILL.md`, `skills/comment-writer/SKILL.md`, `skills/foundation/SKILL.md`, `skills/gh-release-notes/SKILL.md`, `skills/idd/SKILL.md`, `skills/judgment-day/SKILL.md`, `skills/judgment-day/references/prompts-and-formats.md`, `skills/skill-creator/SKILL.md`, `skills/skill-creator/references/skill-style-guide.md`, `skills/stack-go/SKILL.md`, `skills/stack-go/references/testing-examples.md`, `skills/stack-go/references/testing.md`, `skills/work-unit-commits/SKILL.md`
- Work units: 5
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- E1.98 se parte en dos cambios: este lleva las seis skills de utilidad y las referencias de testing de stack-go; sdd-apply va en un cambio propio y la sección de gentle-ai de NOTICE se queda solo con ella hasta entonces (respuesta del usuario)
- La guía de estilo propia describe lo que el tooling de ospec exige (frontmatter, una sección de reglas que el registro extrae, tope del bloque compacto, referencias locales) y la sección 3 de la spec de skills cambia con ella; deja de ser obligatorio el esquema de seis secciones (respuesta del usuario)
- Ninguna skill fija el español: la entrega se escribe en el idioma del proyecto, que se declara y que el CLI imprime; este repositorio declara el suyo (respuesta del usuario)
- Las skills conservan sus nombres (respuesta del usuario)
- Las cuatro reglas de comportamiento de rules/no-model-attribution.instructions.md idénticas a las de gentle-ai se reescriben en este cambio, alineadas con foundation e IDD (respuesta del usuario: corregirlos y mejorarlos)
- delivery.language es una etiqueta de idioma (idioma, escritura y región opcionales: es, en, fr, pt-BR, zh-Hant-TW) que se acepta sin distinguir mayúsculas y se guarda en su forma canónica; otro valor es config-invalid (respuesta del usuario)
- delivery.language gobierna los mensajes de commit, los títulos y cuerpos de PR, las entradas del changelog, la documentación y los comentarios de código; la documentación y los comentarios son concisos y funcionales, sin nombrar el harness ni los motivos dados en la sesión (respuesta del usuario)
- Una respuesta en un hilo usa el idioma del hilo, y el texto que se añade a un fichero o a un árbol de documentación ya escrito en otro idioma conserva ese: el idioma declarado es el del proyecto y vale donde no hay otro establecido, que es la lectura de «el idioma que se usa»
- Sin delivery.language, next da la sugerencia language-undeclared en los pasos de entrega: el agente propone el idioma de los asuntos de los últimos commits, o el del usuario si no hay historial, y lo escribe solo con aprobación; entretanto escribe en ese idioma (respuesta del usuario)
- next imprime el idioma declarado en cada paso de un cambio abierto, no solo en declare-plan y close: el plan suele declararse con el intent y ese paso no aparece, y la documentación y los comentarios se escriben antes del cierre; las reglas completas van en ospec team, declare-plan y close, y la skill de IDD lleva la frase fija
- SDD no lee delivery.language, como el resto de delivery: las skills de entrega llevan su propia escalera (lo que imprime ospec team, luego el historial, luego el usuario) y sirven igual sin IDD
- caveman y gh-release-notes también fijaban el español en commits y notas de versión y pasan a seguir el idioma del proyecto, como branch-pr: la decisión del usuario vale para toda skill, no solo para las que venían de gentle-ai
- La sección 4.3 de la spec de skills decía que el registro leía patrones, constraints y gates y que caía a las quince primeras viñetas; extractCompactRules solo lee encabezados que acaban en rules y no tiene caída, así que la spec se corrige para que la guía y ella digan lo mismo
- La referencia de chained-pr pasa de chaining-details.md a chain-playbook.md, con el corte de ramas sobre un historial lineal y la integración por merge
- La línea base de contexto sube 316 bytes por target en la skill de IDD: lleva la frase fija del idioma y de la documentación y los comentarios, que tiene que estar a la vista antes de la primera edición; el contexto siempre cargado baja 29 bytes porque las reglas de comportamiento quedaron más cortas
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: adr-impact-declaration for adr-impact-declaration (2026-11-17T22:00:06.815Z)
- ev-2: migration-test for migration-compat-and-test (2026-11-17T22:03:13.478Z)
- ev-3: check-run for checks-pass (2026-11-17T22:04:59.246Z)
- ev-4: contract-spec-and-test for contract-spec-and-test (2026-11-17T22:04:59.246Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-11-17T22:04:59.246Z)
- ev-6: check-run for checks-pass (2026-11-17T22:07:02.299Z)
- ev-7: contract-spec-and-test for contract-spec-and-test (2026-11-17T22:07:02.299Z)
- ev-8: adr-impact-declaration for adr-impact-declaration (2026-11-17T22:07:02.299Z)
- ev-9: migration-test for migration-compat-and-test (2026-11-17T22:07:26.661Z)
- ev-10: living-doc-current for living-doc (2026-11-17T22:07:26.877Z)
<!-- ospec:evidence:end -->
