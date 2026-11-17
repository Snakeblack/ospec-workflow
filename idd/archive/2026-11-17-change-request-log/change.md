# change-request-log

## Intent and acceptance

El CLI escribe en change.md, en una sección propia entre marcadores, la petición literal del usuario y cada respuesta suya a un gate, con su fecha y su fuente, para que revisores y verificadores lean sus palabras y no un resumen (E1.77, R9)

Acceptance: Un cambio con gates resueltos tiene en change.md la petición literal y cada respuesta numerada con su fecha y su fuente, esa sección coincide con state.yaml al cerrar, y los tests del CLI lo fijan

## Plan

<!-- ospec:plan:start -->
- Files: `docs/onboarding/reviewer.md`, `docs/roadmaps/harness-evolution.md`, `handbook/idd/estado.md`, `openspec/specs/idd/spec.md`, `scripts/fixtures/context-baseline.json`, `scripts/lib/idd-close.js`, `scripts/lib/idd-close.test.js`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-contract.test.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-record.test.js`, `scripts/lib/idd-review.js`, `scripts/lib/idd-review.test.js`, `scripts/lib/idd-store.js`, `scripts/lib/idd-store.test.js`, `scripts/ospec.close.test.js`, `scripts/ospec.js`, `scripts/ospec.lifecycle.test.js`, `skills/idd/SKILL.md`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El log solo se escribe en un change.md que ya existe (respuesta del usuario): un cambio sin living-doc no crea change.md por él, y REQ-idd-002 no cambia.
- Fechas (respuesta del usuario): el CLI guarda resolved_at en cada respuesta a un gate y en cada retracción con --answer, y requested_at al registrar la petición. Una respuesta anterior a este cambio sale como «no date», en inglés como el resto de los rótulos del log, y nunca se inventa una fecha.
- Contenido (respuesta del usuario): la petición y todas las respuestas del usuario que guarda el CLI, las de los nueve gates y las de las retracciones con --answer. --request sigue siendo opcional en el CLI y la regla 2 de la skill de IDD lo pide. El orden y el número de cada respuesta salen de resolved_at, con las anteriores sin fecha delante, así que una respuesta nueva va siempre al final y ninguna se renumera.
- Formato (respuesta del usuario): la sección ## Request and answers va entre Intent and acceptance y Plan, entre <!-- ospec:log:start --> y <!-- ospec:log:end -->, con «Request (<fecha>)» y «Answer N — <gate>, <fuente>, <fecha>» (una retracción se rotula retract <señal>) y el texto literal en cita. El CLI busca los marcadores del log como línea entera, así que un marcador dentro de una respuesta citada no corta el bloque.
- Un change.md sin la sección, de un cambio abierto antes, la recibe del CLI delante de ## Plan en la siguiente escritura del estado, y close valida el documento tal como lo va a escribir. Con el título de la sección pero sin sus marcadores, close se niega, como con los marcadores de la evidencia.
- Encargos (respuesta del usuario): el de review-trust y los de review-correction llevan request_log con la ruta de change.md, la sección y el número de entradas, solo cuando living-doc está activo y el log tiene alguna. El campo queda fuera del digest del encargo, que no cambia.
- La regla 2 de la skill de IDD sube 31 bytes por pedir --request con las palabras del usuario; scripts/measure-context-baseline.js --update fija los techos nuevos de los 7 targets.
- Como las palabras del usuario van ahora delante de Plan, Decisions y Evidence, los cuatro bloques del CLI (plan, decisiones, log y evidencia) buscan su marcador como línea entera y no como subcadena: una respuesta que contiene un marcador de plan o de evidencia no puede tomar el sitio del bloque real. Un marcador con texto en su misma línea deja de contar, y ese documento conserva su texto.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: migration-test for migration-compat-and-test (2026-11-17T16:09:27.790Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-17T16:10:00.123Z)
- ev-3: check-run for checks-pass (2026-11-17T16:12:17.932Z)
- ev-4: contract-spec-and-test for contract-spec-and-test (2026-11-17T16:12:17.932Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-11-17T16:12:17.932Z)
- ev-6: migration-test for migration-compat-and-test (2026-11-17T16:12:44.619Z)
- ev-7: living-doc-current for living-doc (2026-11-17T16:13:17.728Z)
<!-- ospec:evidence:end -->
