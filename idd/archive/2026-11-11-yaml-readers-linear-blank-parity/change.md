# yaml-readers-linear-blank-parity

## Intent and acceptance

Los lectores de state.yaml con capturas \s*(.+)$ o \s+#.*$ tardan de forma cuadrática ante un tramo de espacios seguido de un CR suelto o U+2028 (readStatus, el parser y el escritor del proyector, extractStateRouteInfo, parsePersistedRouteSection, el lector YAML-lite de pre-compact), y el escáner de escalares de Node (trim) y el de Go (TrimSpace) deciden distinto si una línea de solo U+0085 o U+FEFF está en blanco.

Acceptance: Con 100.000 espacios seguidos de b, CR y c (o U+2028, o b espacio c) en cualquier valor de state.yaml, cada lector termina muy por debajo de un segundo y Node lee la línea como Go; el escáner de Node y el de Go dejan las mismas líneas opacas sobre un corpus compartido que pasan los dos, con líneas de solo U+0085 o U+FEFF tras un escalar de bloque.

## Plan

<!-- ospec:plan:start -->
- Files: `internal/hooks/phase-completion-reducer.go`, `internal/hooks/phase-completion-reducer_test.go`, `internal/testdata/state-projection/cases.json`, `internal/testdata/yaml-lite-scan/cases.json`, `internal/yamllite/continuations.go`, `internal/yamllite/yamllite.go`, `internal/yamllite/yamllite_test.go`, `openspec/specs/lifecycle-kernel-runtime/spec.md`, `scripts/hooks/pre-compact.js`, `scripts/hooks/pre-compact.test.js`, `scripts/lib/ospec-state.js`, `scripts/lib/ospec-state.test.js`, `scripts/lib/route-dispatcher.js`, `scripts/lib/route-dispatcher.test.js`, `scripts/lib/yaml-lite.js`, `scripts/lib/yaml-lite.test.js`, `scripts/route-dispatch-run.js`, `scripts/route-dispatch-run.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Donde Go tiene . los patrones de los lectores de state.yaml toman [^\n], como los de config.yaml en REQ-lifecycle-kernel-034, y el quitador de comentarios pasa a (?<!\s)\s+#[^\n]*$.
- El corpus compartido vive en internal/testdata/yaml-lite-scan/cases.json y lo leen scripts/lib/yaml-lite.test.js e internal/yamllite/yamllite_test.go, como el de secret-redaction.
- Decisión del usuario (1A): el escáner recorta solo espacio, tabulador y CR (trimYamlSpace en Node, yamllite.TrimSpace en Go); el CR es salto de línea en YAML, así que un CR final y una línea de solo un CR siguen siendo blancos, y U+0085, U+FEFF, U+00A0 y el resto de espacios Unicode son texto en los dos lados.
- Decisión del usuario (2A): el validador, el parser (con las partes de oneLineScalar) y dropRewrittenContinuations de los dos proyectores deciden la línea en blanco con ese mismo recorte, así que Node y Go rechazan con malformed-state el mismo state.yaml; los recortes de un valor dentro de los lectores (parseScalar, yamlScalar, readStatus) no cambian.
- Decisión del usuario (3A): extractPhaseStatuses de pre-compact lee las líneas de opaqueScalarLines, como el resto del lector YAML-lite, así que un status dentro de un escalar de bloque bajo phases ya no adelanta la fase; PR5 portará a Go la versión arreglada.
- El contrato va en un requisito nuevo, REQ-lifecycle-kernel-035, tras el 034: tiempo lineal de los lectores de state.yaml y paridad de blancos del escáner y del proyector, con el corpus compartido.
- Los tests de tiempo usan tramos de 20.000 a 60.000 caracteres con una sola línea larga por llamada: sobre la base cada test tarda de 3 a 8 s frente al presupuesto de 1 s, y con 100.000 caracteres y varias líneas largas la ejecución en rojo pasaba de un minuto.
- Los lectores de archive-transaction no cambian: el fuzzer (unidades repetidas por colas con CR, U+2028 y ' #' sobre cada lector) no halló en ellos nada superlineal, porque leen con indexOf y slice.
- Aviso de la primera revisión de confianza: con el recorte nuevo, el MAPPING_LINE de Node (cuyo \s es Unicode) rechazaba una clave que empieza por U+00A0, U+000B o U+2028 que Go aceptaba, y status: <U+FEFF> discrepaba. Los dos proyectores separan ahora la línea en su primer dos puntos con yamlKeyValue y recortan clave y valor como el escáner; en Node el valor lo lee projectedScalar (parseScalar sigue para readStatus y la baseline), y MAPPING_LINE y MappingLine desaparecen. Un corpus compartido (internal/testdata/state-projection/cases.json) fija el resultado de 13 proyecciones en los dos runtimes.
- Aviso de la segunda revisión de confianza: los escritores de los dos proyectores buscaban claves, cabeceras de fase y el fin de una sección con TrimSpace/trim() y un sangrado por \s, así que en Go un U+00A0 status: señuelo se reescribía en lugar del real tras el arreglo del parser. Los escritores leen ahora como el parser (topLevelKeyIndex y yamlKeyValue en Node, yamllite.TrimSpace en Go, sangrado solo por espacios). Por su sugerencia y una divergencia hallada al revisar, el validador de Node exige como Go un change y un status con escalar no vacío (status: "" falla) y rechaza phases: # c, porque los dos escritores buscan phases: solo y Node añadía un segundo bloque phases:. El corpus del proyector compara también los bytes escritos (18 casos), con el sobre dentro del corpus.
- Tercera revisión de confianza, respuestas del usuario («las recomendadas»): (1A) el proyector de Node cuenta como sangrado espacios y tabuladores (lineIndentation de yaml-lite.js, como Go), porque un comentario que empieza por tabulador pasa el validador y el escritor de Node lo tomaba como de nivel 0; y Go rechaza cualquier valor en la línea de phases (phases: "" o '' duplicaban el bloque phases).
- (2A) Los lectores de state.yaml que eligen el estado o un campo (readStatus y el lector YAML-lite de pre-compact en Node, el de internal/yamllite tras store.ReadStatus en Go) leen línea, clave y valor como el proyector: recorte del escáner, sangrado por espacios y tabuladores y comentario tras un blanco ASCII. Así un <U+00A0>status: señuelo no es el status para ningún lector ni proyector. Sustituye, para estos lectores, a la decisión de no cambiar sus recortes de valor; readBaselineState (config.yaml) sigue igual. Los demás lectores de puerta (archive-transaction, el dispatcher, extractStateRouteInfo) no se unifican en esta PR.
- (3A) Las divergencias previas que no son de blancos van a PR5 (paridad Go/JS): desescapado JSON de comillas dobles (yamlScalar de Go frente a stateScalar de Node), revision +5/-0/>19 dígitos, clave de fase con espacios, claves repetidas (los lectores toman la última, el escritor la primera). (4A) El usuario autoriza una cuarta revisión de confianza (gate review-limit).
- El corpus del proyector (24 casos) fija también el status que leen readStatus, el lector de pre-compact y store.ReadStatus sobre cada entrada; REQ-lifecycle-kernel-035 pasa a «Node And Go Agree On White Space» y describe lectores, proyectores, sangrado y la línea de phases.
- CRITICAL de la cuarta revisión de confianza: readStatus y extractPhaseStatuses casaban ^status:\s* con el \s Unicode de Node y una clave literal, así que status:<U+00A0>archived y status : archived se leían distinto que en store.ReadStatus. Node tiene ahora un solo lector YAML-lite de state.yaml en yaml-lite.js (extractFirstScalar, stateKeyValue y stateScalar), copia de internal/yamllite (clave hasta el primer dos puntos como keyValueRe, valor tras blanco ASCII, pila de rutas); lo usan readStatus, que pasa a ser extractFirstScalar([change,status],[status]) en minúsculas como store.ReadStatus, el proyector de Node y pre-compact, que deja su copia. Con dos status de primer nivel Node lee ahora el primero, como Go: en los 419 YAML versionados solo cambia un state.yaml archivado (2026-09-03-k6d-complexity-architecture-delta), de approved a archived, que es lo que ya leía Go.
- Al cubrir ese CRITICAL apareció que los dos proyectores tomaban como clave una línea que el escáner no lee como clave (status:archived, o dos puntos seguidos de U+00A0, U+FEFF o U+000B), que ningún lector lee. Los dos validadores rechazan ahora esa línea (scanScalarContinuations devuelve values en Node y ScanScalarLines en Go). Aviso de la misma revisión: yamlScalar del proyector de Go partía el comentario solo en ' #' y Node tras cualquier blanco ASCII; Go usa ahora \s+#.*$ como su lector YAML-lite. El corpus del proyector llega a 31 casos.
- Bloqueo tras la cuarta revisión: la corrección del CRITICAL pasa de las 200 líneas de una corrección acotada y la CLI entra en bucle (check pide review correct, correct pide review start, start responde review-limit y el gate no se abre), porque startTrustReview rechaza por el límite antes de escalar la revisión anterior. Respuestas del usuario («las recomendadas», 2026-11-11): (1A) el arreglo de la CLI va en esta misma PR como un segundo cambio IDD de tipo bug con test de reproducción, cerrado antes que este, y este sigue después con bin/ospec del repo; (2A) autoriza una quinta revisión de confianza; (3A) la PR no se parte. Se continúa en otra sesión.
- CRITICAL de la quinta revisión de confianza (hecha con review-trust en Fable 5.2 a petición del usuario): readStatus pasaba el status a minúsculas con toLowerCase, que sobre la cadena entera convierte U+0130 en i más U+0307 y una sigma mayúscula final en U+03C2, y store.ReadStatus con strings.ToLower, que va punto de código a punto de código; status: ARCH<U+0130>VED era archived solo para Go. Node usa ahora lowerCaseLikeGo (yaml-lite.js), que baja cada punto de código por separado y da i para U+0130; Go no cambia. El corpus del proyector llega a 34 casos. El aviso de la misma revisión (revision +1/-0/20 dígitos, desescapado JSON, línea de secuencia bajo una fase) son divergencias que no son de blancos y siguen en PR5 (decisión 3A).
- El arreglo del bucle de review-limit (cambio review-limit-oversized-correction, cerrado) va en esta misma PR sobre un commit WIP de este cambio (decisión del usuario, opción A), así que el diff de este cambio incluye también scripts/lib/idd-review.js, scripts/ospec.js y REQ-idd-016, y la quinta revisión los cubrió.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-11T15:33:35.258Z)
- ev-2: migration-test for migration-compat-and-test (2026-11-11T15:34:56.466Z)
- ev-3: check-run for checks-pass (2026-11-11T15:38:05.147Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-11-11T15:38:05.147Z)
- ev-5: migration-test for migration-compat-and-test (2026-11-11T15:38:27.496Z)
- ev-6: frozen-review for trust-review (2026-11-11T15:49:13.753Z, subagent-stop)
- ev-7: check-run for checks-pass (2026-11-11T15:50:56.632Z)
- ev-8: adr-impact-declaration for adr-impact-declaration (2026-11-11T15:50:56.632Z)
- ev-9: migration-test for migration-compat-and-test (2026-11-11T15:51:43.960Z)
- ev-10: frozen-review for trust-review (2026-11-11T15:58:57.246Z, subagent-stop)
- ev-11: migration-test for migration-compat-and-test (2026-11-11T15:59:23.492Z)
- ev-12: check-run for checks-pass (2026-11-11T16:00:58.862Z)
- ev-13: adr-impact-declaration for adr-impact-declaration (2026-11-11T16:00:58.862Z)
- ev-14: frozen-review for trust-review (2026-11-11T16:06:42.879Z, subagent-stop)
- ev-15: migration-test for migration-compat-and-test (2026-11-11T16:22:50.182Z)
- ev-16: check-run for checks-pass (2026-11-11T16:24:15.340Z)
- ev-17: adr-impact-declaration for adr-impact-declaration (2026-11-11T16:24:15.340Z)
- ev-18: check-run for checks-pass (2026-11-11T16:34:58.494Z)
- ev-19: adr-impact-declaration for adr-impact-declaration (2026-11-11T16:34:58.494Z)
- ev-20: migration-test for migration-compat-and-test (2026-11-11T16:58:02.022Z)
- ev-21: check-run for checks-pass (2026-11-11T16:59:36.278Z)
- ev-22: contract-spec-and-test for contract-spec-and-test (2026-11-11T16:59:36.278Z)
- ev-23: frozen-review for trust-review (2026-11-11T17:08:53.466Z, subagent-stop)
- ev-24: migration-test for migration-compat-and-test (2026-11-11T17:09:12.883Z)
- ev-25: check-run for checks-pass (2026-11-11T17:10:45.779Z)
- ev-26: contract-spec-and-test for contract-spec-and-test (2026-11-11T17:10:45.779Z)
- ev-27: adr-impact-declaration for adr-impact-declaration (2026-11-11T17:10:45.779Z)
- ev-28: living-doc-current for living-doc (2026-11-11T17:10:56.447Z)
<!-- ospec:evidence:end -->
