# state-yaml-opaque-scalars

## Intent and acceptance

Los lectores línea a línea de state.yaml (gate de archivado, ruta persistida, status, clasificación e impacto del dispatcher, YAML-lite de los hooks JS y Go) leen claves dentro de un escalar de bloque o multilínea

Acceptance: Ningún lector de state.yaml lee una clave dentro de las líneas de continuación de un escalar de bloque o multilínea: un verdict PASS o una aprobación override escritos dentro de notes: | no satisfacen el gate de archivado, un status: archived dentro de un bloque no termina un cambio activo en los hooks JS ni Go, y una classification o un auth_security dentro de un bloque no cambian la ruta

## Plan

<!-- ospec:plan:start -->
- Files: `internal/hooks/phase-completion-reducer.go`, `internal/hooks/phase-completion-reducer_test.go`, `internal/hooks/pretooluse.go`, `internal/store/store.go`, `internal/yamllite/continuations.go`, `internal/yamllite/yamllite.go`, `openspec/specs/lifecycle-kernel-runtime/spec.md`, `scripts/hooks/pre-compact.js`, `scripts/hooks/pre-tool-use.js`, `scripts/lib/archive-transaction.js`, `scripts/lib/ospec-state.js`, `scripts/lib/route-dispatcher.js`, `scripts/lib/yaml-lite.js`, `scripts/lib/yaml-lite.test.js`, `scripts/route-dispatch-run.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El escáner de continuaciones se mueve de ospec-state.js a yaml-lite.js y de internal/hooks a internal/yamllite, para que cada lector lo use sin cargar el proyector
- Cada lector recibe las líneas de continuación en blanco; todos los lectores ya saltan las líneas vacías, así que no cambia su lógica
- Con un state.yaml malformado el gate de archivado falla cerrado (gatesSatisfied false); los demás lectores leen como hoy lo que queda tras el error
- Un valor que sigue en líneas más sangradas se lee solo con la línea de su clave; un verdict partido no da PASS
- FindActiveChangeName (JS y Go) lee el status real con el lector de status en vez de buscar la subcadena status: active
- readPersistedRoute salta las líneas vacías y los comentarios: antes una línea en blanco o un comentario cerraban la sección route:, y con las continuaciones en blanco un escalar de bloque bajo route: la habría cerrado
- store.readStatus pasa a store.ReadStatus para que FindActiveChangeName de Go lea el status igual que FindActiveChanges
- Aviso de la revisión de confianza: una etiqueta o un ancla antes del valor no cambian su clase, y una colección flow que sigue en líneas más sangradas es opaca hasta que cierran sus corchetes; si nunca cierra es malformada, como un escalar entrecomillado sin cerrar, también para el proyector
- Segundo aviso de la revisión de confianza: un valor que empieza en la línea siguiente a su clave (y los elementos - - anidados) es opaco para los lectores, con la línea de la clave como dueña; el proyector lo sigue rechazando como malformed-state
- Tercera revisión de confianza: el escáner lee una clave como YAML (entrecomillada, o plana hasta los primeros dos puntos seguidos de espacio o fin de línea), así que verdict:PASS es texto; un valor de solo etiquetas o anclas cede su valor a la línea siguiente; y los lectores reciben en blanco también la línea de un valor en la línea siguiente, mientras el proyector la sigue rechazando
- El gate de archivado lee verdict solo como campo de fase, a cuatro espacios exactos bajo phases.verify, igual que el proyector lo escribe y lo lee (REQ-lifecycle-kernel-032): ninguna forma que el escáner no reconozca puede colar un verdict más sangrado
- Cuarta revisión de confianza: una línea que abre una colección flow es siempre un valor, aunque su primera línea parezca una entrada; los patrones del escáner nombran el espacio y el tabulador en vez de \s, para que Node y Go coincidan ante NBSP y otros espacios Unicode; y ENTRY_LINE ya no solapa la clave con el espacio previo a los dos puntos, así que es lineal (200.000 espacios tardaban 99 s en V8)
<!-- ospec:decisions:end -->

### Fuera de alcance

- Los lectores línea a línea de `config.yaml` (`readBackendMode`, `readBaselineState`, `parseRoutingTable`, `extractConfigDefaults`, `extractAttributionOverride`, `readYamlScalar` y los de Go) van en una PR propia justo detrás de esta (decisión 4A del gate open-facts). Esa PR también arregla el patrón cuadrático de `readFlowScalar` en `scripts/lib/yaml-lite.js` (`[^:]*?` seguido de `\s*:`). Medido: 20.000 espacios dentro de un mapa flow tardan 0,55 s, y el tiempo se multiplica por 4 cada vez que se duplica la longitud.
- Nota no bloqueante del validador de corrección: en Node, el `(.*)$` final de `ENTRY_LINE` no casa `\r`, U+2028 ni U+2029, y en Go sí. Además, `trim()` quita U+FEFF y `strings.TrimSpace` quita U+0085. En esos casos Node es más estricto que Go (deja la línea en blanco), así que no abre ninguna falsificación.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-10T15:12:26.803Z)
- ev-2: migration-test for migration-compat-and-test (2026-11-10T15:12:48.107Z)
- ev-3: check-run for checks-pass (2026-11-10T15:15:09.397Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-11-10T15:15:09.397Z)
- ev-5: migration-test for migration-compat-and-test (2026-11-10T15:15:36.141Z)
- ev-6: frozen-review for trust-review (2026-11-10T15:20:32.958Z, subagent-stop)
- ev-7: check-run for checks-pass (2026-11-10T15:26:16.080Z)
- ev-8: adr-impact-declaration for adr-impact-declaration (2026-11-10T15:26:16.080Z)
- ev-9: migration-test for migration-compat-and-test (2026-11-10T15:26:41.834Z)
- ev-10: frozen-review for trust-review (2026-11-10T15:31:54.693Z, subagent-stop)
- ev-11: check-run for checks-pass (2026-11-10T15:34:17.281Z)
- ev-12: adr-impact-declaration for adr-impact-declaration (2026-11-10T15:34:17.281Z)
- ev-13: migration-test for migration-compat-and-test (2026-11-10T15:34:37.668Z)
- ev-14: frozen-review for trust-review (2026-11-10T15:40:30.523Z, subagent-stop)
- ev-15: check-run for checks-pass (2026-11-10T15:43:51.011Z)
- ev-16: adr-impact-declaration for adr-impact-declaration (2026-11-10T15:43:51.011Z)
- ev-17: migration-test for migration-compat-and-test (2026-11-10T16:21:09.466Z)
- ev-18: migration-test for migration-compat-and-test (2026-11-10T16:32:03.299Z)
- ev-19: frozen-review for trust-review (2026-11-10T16:33:03.685Z, subagent-stop)
- ev-20: check-run for checks-pass (2026-11-10T16:35:21.917Z)
- ev-21: adr-impact-declaration for adr-impact-declaration (2026-11-10T16:35:21.917Z)
- ev-22: check-run for checks-pass (2026-11-10T16:37:06.659Z)
- ev-23: adr-impact-declaration for adr-impact-declaration (2026-11-10T16:37:06.659Z)
- ev-24: living-doc-current for living-doc (2026-11-10T16:37:07.116Z)
<!-- ospec:evidence:end -->
