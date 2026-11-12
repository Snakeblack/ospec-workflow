# idd-friction-fixes

## Intent and acceptance

Corregir en un solo cambio las fricciones de IDD de proyectos reales que son arreglos acotados: E1.64 idd-config-in-diff (#483), E1.65 counterproof-declared-docs (#500), E1.66 first-gate-turn-fence (#494), E1.68 build-scripts-declared (#501) y E1.69 impact-raise (#502)

Acceptance: Se cumple el «Hecho cuando» de cada ítem en docs/roadmaps/harness-evolution.md: un arreglo solo en idd/config.yaml cierra su par y su contraprueba corre en la base; un .md declarado en impact o contracts.documents cuenta como producto para la contraprueba; el primer gate de un repositorio sin .ospec/turns, respondido tras un fin de turno, queda source user; impact.build_scripts evita persistent-data sin quitar las demás señales; y un impacto conforms se sube a amends abriendo adr-amend-or-contradict

## Plan

<!-- ospec:plan:start -->
- Files: `CHANGELOG.md`, `docs/roadmaps/harness-evolution.md`, `handbook/idd/estado.md`, `handbook/idd/evidencia.md`, `handbook/idd/flujo-idd.md`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-check.js`, `scripts/lib/idd-check.test.js`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-contract.test.js`, `scripts/lib/idd-fitness.js`, `scripts/lib/idd-fitness.test.js`, `scripts/lib/idd-impact.js`, `scripts/lib/idd-impact.test.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-record.test.js`, `scripts/lib/idd-refusals.js`, `scripts/lib/idd-signals.test.js`, `scripts/lib/idd-workspace.js`, `scripts/lib/idd-workspace.test.js`, `scripts/lib/turn-fence.js`, `scripts/lib/turn-fence.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`, `skills/idd/SKILL.md`, `skills/idd/references/approvals.md`
- Work units: 5
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- E1.64: de idd/ queda fuera todo lo que cuelga de un subdirectorio (idd/<cambio>/ e idd/archive/, lo que escribe ospec); un fichero directamente bajo idd/, como idd/config.yaml, cuenta como del proyecto en el diff, la huella y la instantánea de la revisión
- E1.65: una ruta de documentación es producto para la contraprueba cuando ospec deriva de ella una señal por un patrón que el proyecto declara en impact (no uno por defecto, y fuera de los exclude resueltos) o cuando casa con contracts.documents del proyecto
- E1.66 (respuesta del usuario): sin cuenta al abrir, el gate guarda opened_turn 0; un gate ya abierto con opened_turn null pasa a 0 al responderlo; el motivo «no turn count when the gate opened» desaparece
- E1.68: impact.build_scripts se suma a los scripts de build por defecto, o los sustituye con impact.defaults: false; solo deja de derivar persistent-data por contenido, las señales por ruta siguen
- E1.69 (respuesta del usuario): un impacto sube en el orden none < conforms < amends, supersedes o contradicts; el valor anterior queda en previous del impacto; la subida con adr-amend-or-contradict ya resuelta añade otra entrada abierta de la puerta, y una declaración nueva tardía sigue rechazada con gate-resolved
- La regla de abrir el gate antes de preguntar va en skills/idd/references/approvals.md y no en SKILL.md: el protocolo está en su techo de bytes (idd_protocol_bytes) y su frase sobre los gates la fija un test
- Tras E1.64, un cambio de idd/config.yaml mueve la huella del árbol como el de cualquier fichero, así que también invalida la evidencia de los checks aunque no cambie la lista de verificadores
- Si un par no cierra porque el verde corrió sobre el mismo árbol que el rojo, el motivo de la obligación lo dice en lugar de pedir otra ejecución
- isExempt de fitness y el motivo de adr-impact-declaration exigen todas las entradas de adr-amend-or-contradict resueltas, no solo una
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-12T07:24:02.156Z)
- ev-2: check-run for checks-pass (2026-11-12T07:32:57.409Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-11-12T07:32:57.409Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-11-12T07:32:57.409Z)
- ev-5: migration-test for migration-compat-and-test (2026-11-12T07:33:35.605Z)
- ev-6: check-run for checks-pass (2026-11-12T07:36:12.547Z)
- ev-7: contract-spec-and-test for contract-spec-and-test (2026-11-12T07:36:12.547Z)
- ev-8: adr-impact-declaration for adr-impact-declaration (2026-11-12T07:36:12.547Z)
- ev-9: migration-test for migration-compat-and-test (2026-11-12T07:36:26.509Z)
- ev-10: living-doc-current for living-doc (2026-11-12T07:36:26.712Z)
<!-- ospec:evidence:end -->
