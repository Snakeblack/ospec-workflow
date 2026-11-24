# own-utility-skills

## Intent and acceptance

Versiones propias de issue-creation, branch-pr y skill-registry, las tres skills que aún conservan texto de gentle-ai, escritas desde lo que ospec necesita hoy (E1.106)

Acceptance: skills/issue-creation, skills/branch-pr y skills/skill-registry no conservan líneas de 30 o más caracteres idénticas a ninguna versión del historial git de gentle-ai, salvo literales sin contenido o de interfaz; su metadata.author nombra solo a manuel-retamozo-garcia; la sección de gentle-ai sale de NOTICE y el README deja de contar tres obras; el roadmap da E1.106 por hecho; node scripts/check.js pasa

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-23T21:17:57.595Z):

> continua / espera, esta sesion no es de antigravity, ahora estabamos con skills owner o algo así (E1.106 own-utility-skills)

Answer 1 — open-facts, user, 2026-11-23T21:31:48.231Z:

> todas las recomendadas (recomendadas: (1) registro: orden nueva ospec registry que usa el constructor del hook, con la skill fina y sdd-init, init-details, persistence-contract y skill-resolver alineados; (2) alcance del registro: las entradas de hoy, y E5.15 se amplía a las skills y convenciones del proyecto; (3) issue-creation genérica, el issue como intención de un cambio futuro, y sigue en --with-extras; (4) branch-pr por ciclo de vida leyendo del proyecto y de ospec team, con la spec de skills §6a actualizada; (5) la frase del README pasa a contar el origen; (6) entrega en cadena de tres cambios con una sola release al final)

Answer 2 — open-facts, user, 2026-11-23T21:59:07.884Z:

> todas las recomendadas (recomendadas: sin OpenSpec inicializado ospec registry no escribe nada y lo dice, como el hook; una skill sin Trigger: o sin sección de reglas es un aviso con salida 0)
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `NOTICE`, `README.es.md`, `README.md`, `docs/harness-runtime.md`, `docs/roadmaps/harness-evolution.md`, `handbook/agentes/catalogo.md`, `handbook/legal/license.md`, `openspec/specs/skill-registry/spec.md`, `openspec/specs/skills/spec.md`, `scripts/configure.test.js`, `scripts/configure/idd-protocol.test.js`, `scripts/delivery-skills-contract.test.js`, `scripts/fixtures/context-baseline.json`, `scripts/hooks/session-start.js`, `scripts/lib/idd-refusals.js`, `scripts/lib/idd-refusals.test.js`, `scripts/lib/k1-scope-guard.test.js`, `scripts/lib/ospec-registry.js`, `scripts/lib/ospec-registry.test.js`, `scripts/lib/skill-registry.js`, `scripts/lib/skill-registry.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`, `skills/_shared/persistence-contract.md`, `skills/_shared/skill-resolver.md`, `skills/branch-pr/SKILL.md`, `skills/issue-creation/SKILL.md`, `skills/sdd-init/SKILL.md`, `skills/sdd-init/references/init-details.md`, `skills/skill-registry/SKILL.md`
- Work units: 3
<!-- ospec:plan:end -->

Unidades de trabajo: issue-creation con la spec §6b y su test; branch-pr con la spec §6a; y el registro, con `ospec registry`, skill-registry, los textos de SDD que la citan, `NOTICE`, el README y el roadmap.

Medida de texto de terceros. `node scripts/third-party-overlap.js --source <clon de gentle-ai> skills/issue-creation skills/branch-pr skills/skill-registry`: antes 185 de 263 líneas largas idénticas (95 %, 58 % y 61 %); después 0 de 169. Fuera de esas tres skills, ningún fichero del repositorio llega a 10 líneas largas idénticas, ni en texto (el máximo son 7, en `skills/api-design/SKILL.md`) ni en código (9, en dos ficheros de test), así que la sección de gentle-ai sale de `NOTICE`.

Review de confianza. Aprobada, con un aviso corregido y validado: la regla de publicar un issue solo con el visto bueno del usuario pasa a la sección de reglas de issue-creation y pierde su excepción. Queda una sugerencia del validador, que no bloquea: decir en una frase qué skill escribe el comentario de evidencia en un issue duplicado, issue-creation o comment-writer.

## Decisions

<!-- ospec:decisions:start -->
- issue-creation deja el flujo status:* de gentle-ai: el issue se escribe como la intención de un cambio futuro (tipo, resumen, evidencia, resultado observable, preguntas abiertas), usa las plantillas y etiquetas del repositorio y se publica solo con el OK del usuario; sigue en --with-extras (respuesta del usuario al gate open-facts)
- branch-pr se organiza por ciclo de vida (antes de la rama, antes de la PR, la PR, después de abrirla) y lee de ospec team y del repositorio la base, el idioma, la plantilla, las etiquetas y los checks; el mensaje de commit queda en work-unit-commits y la spec de skills §6a se actualiza (respuesta del usuario al gate open-facts)
- Entrega en cadena de tres PR con una sola release al final; el cambio se cierra una vez y la cadena se corta por unidad de trabajo, porque el CLI no deja estrechar el intent de un cambio ya resuelto
- El registro tiene un solo constructor, refreshRegistryCache en scripts/lib/skill-registry.js, que llaman el hook SessionStart y ospec registry; ningún agente escribe la caché a mano
- ospec registry avisa de una entrada sin reglas y de una que solo casa por su nombre (sin Trigger: y sin capabilities, porque una skill de stack casa por capability); los avisos no cambian la salida
- sdd-init llama a la orden con {{ospec-runtime}}, como el resto de la prosa de SDD, y skill-registry con {{ospec-cli}}, como idd y foundation, porque Claude solo sustituye la ruta en el cuerpo de la skill que carga
- Las descripciones de branch-pr y skill-registry se acortan para que el listado de skills no suba; el techo de contexto baja de 4769 a 4747 bytes
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-23T21:34:23.279Z)
- ev-2: check-run for checks-pass (2026-11-23T22:11:29.416Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-11-23T22:11:29.416Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-11-23T22:11:29.416Z)
- ev-5: migration-test for migration-compat-and-test (2026-11-23T22:11:45.762Z)
- ev-6: frozen-review for trust-review (2026-11-23T22:15:00.406Z, subagent-stop)
- ev-7: frozen-review for trust-review (2026-11-23T22:17:18.014Z, subagent-stop)
- ev-8: check-run for checks-pass (2026-11-23T22:19:16.670Z)
- ev-9: contract-spec-and-test for contract-spec-and-test (2026-11-23T22:19:16.670Z)
- ev-10: adr-impact-declaration for adr-impact-declaration (2026-11-23T22:19:16.670Z)
- ev-11: migration-test for migration-compat-and-test (2026-11-23T22:19:27.360Z)
- ev-12: living-doc-current for living-doc (2026-11-23T22:19:27.573Z)
<!-- ospec:evidence:end -->
