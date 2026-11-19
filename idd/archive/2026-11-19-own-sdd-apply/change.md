# own-sdd-apply

## Intent and acceptance

Versión propia de la skill de fase sdd-apply, la última que NOTICE atribuye a gentle-ai

Acceptance: skills/sdd-apply no conserva líneas de 30 o más caracteres idénticas a ninguna versión del historial git de gentle-ai, salvo los literales que fijan los tests; los tests de contrato de sdd-apply y de la evidencia de Strict TDD siguen pasando; NOTICE y metadata.author nombran a gentle-ai exactamente donde queda su texto; node scripts/check.js pasa

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-19T22:52:18.492Z):

> continua (siguiente del roadmap: E1.101 own-sdd-apply)

Answer 1 — open-facts, user, 2026-11-19T22:59:49.258Z:

> las recomendadas: (1) E1.101 reescribe solo sdd-apply y en este cambio corrige la lista de gentle-ai de NOTICE y el metadata.author de las skills que conservan su texto, la sección de gentle-ai se queda y el resto va a filas nuevas del roadmap; (2) strict-tdd.md entra, con su formato de evidencia tal cual; (3) la herramienta de medida contra todo el historial git se añade al repositorio como script de desarrollo y se anota para E1.99 que ECC y Caveman pueden tener el mismo fallo
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `NOTICE`, `docs/roadmaps/harness-evolution.md`, `handbook/legal/license.md`, `scripts/docs-figures.test.js`, `scripts/third-party-overlap.js`, `scripts/third-party-overlap.test.js`, `skills/_shared/SKILL.md`, `skills/branch-pr/SKILL.md`, `skills/issue-creation/SKILL.md`, `skills/sdd-apply/SKILL.md`, `skills/sdd-apply/strict-tdd.md`, `skills/sdd-archive/SKILL.md`, `skills/sdd-clarify/SKILL.md`, `skills/sdd-design/SKILL.md`, `skills/sdd-explore/SKILL.md`, `skills/sdd-init/SKILL.md`, `skills/sdd-onboard/SKILL.md`, `skills/sdd-propose/SKILL.md`, `skills/sdd-spec/SKILL.md`, `skills/sdd-tasks/SKILL.md`, `skills/sdd-verify/SKILL.md`, `skills/skill-registry/SKILL.md`
- Work units: 3
<!-- ospec:plan:end -->

Medida de texto de terceros. `node scripts/third-party-overlap.js --source <clon de gentle-ai> skills/sdd-apply/SKILL.md skills/sdd-apply/strict-tdd.md`: antes 246 de 392 líneas largas idénticas (39 % y 81 %); después 2 de 384, el campo `disable-model-invocation: true` del frontmatter y el separador `|---|…|` de la tabla de evidencia. Los literales que fijan los tests (`### Step 4: Implement Tasks`, `## Rules`, `blocked: design-mismatch`, los trailers `Ospec-Change` y `Ospec-Task`) tienen menos de 30 caracteres y no cuentan. Siguen con texto de gentle-ai las catorce skills y el agente que ahora lista `NOTICE`; su reescritura queda en E1.105 y E1.106.

## Decisions

<!-- ospec:decisions:start -->
- NOTICE nombra a gentle-ai en cada skill o fichero que conserva 10 o más líneas largas idénticas a cualquier versión de su historial: el criterio es absoluto porque el porcentaje depende de lo largo que sea el fichero, y nombrar de más no cuesta nada; entran _shared y agents/sdd-orchestrator.agent.md
- La medida compara con todos los blobs alcanzables desde cualquier ref del clon, filtrados por extensión (md, mdx y txt por defecto), y lee las versiones en streaming para que la memoria dependa solo de las líneas buscadas; vive en scripts/third-party-overlap.js con su test y no corre en CI porque necesita el clon
- sdd-apply cita las funciones del runtime que deciden (verify-lineage, verify-lineage-candidate-store, apply-resume, strict-tdd-evidence-remediation, verify-lineage-recheck) en lugar de repetir sus comprobaciones en prosa
- strict-tdd.md conserva el vocabulario de la evidencia (columnas de la tabla TDD Cycle Evidence, sus marcadores y el bloque json:strict-tdd-evidence) porque lo leen strict-tdd-verify.md y strict-tdd-evidence-remediation.js, y ahora lo escribe de forma explícita
- En un refactor que conserva el comportamiento, los tests existentes que ya fijan ese comportamiento cuentan como tests de aprobación y solo se escriben los que falten, como ya exige strict-tdd-verify.md (sin test nuevo obligatorio)
- docs-figures.test.js comprueba también el sentido inverso: cada skill que NOTICE lista bajo una obra nombra a sus autores o su origen, para que reescribir una skill obligue a sacarla de NOTICE
- third-party-overlap.js ignora el EPIPE de la entrada de git y decide por su código de salida: un git que muere antes de leer los ids rompe la tubería, y sin esa guarda el proceso caía con un error de stream sin manejar en lugar de informar del fallo
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-19T23:02:07.051Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-19T23:02:07.051Z)
- ev-3: check-run for checks-pass (2026-11-19T23:15:32.824Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-11-19T23:15:32.824Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-11-19T23:16:36.561Z)
- ev-6: check-run for checks-pass (2026-11-19T23:18:51.284Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-11-19T23:18:51.284Z)
- ev-8: living-doc-current for living-doc (2026-11-19T23:19:16.362Z)
<!-- ospec:evidence:end -->
