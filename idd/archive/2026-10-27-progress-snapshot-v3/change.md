# progress-snapshot-v3

## Intent and acceptance

ospec snapshot --schema-version 3 emite el snapshot de avance v3: el v2 tal cual más la etapa de entrega de cada fase done (en pruebas, o en producción con su versión y su fecha), sacada de las entradas (<change-id>) del changelog que declara delivery.changelog; el v1 y el v2 no cambian

Acceptance: Con --schema-version 3, ospec snapshot emite un JSON que cumple schemas/progress-snapshot/v3.schema.json y las reglas del v2, con release solo en fases done: testing si alguna entrada de sus cambios archivados está bajo [Unreleased] o una pre-release, production con la versión mayor y su fecha si todas están bajo x.y.z con fecha, y sin release si no hay entradas o no hay changelog; una entrada bajo dos encabezados o un encabezado x.y.z sin fecha o con una fecha inexistente termina con código 1, el fichero y la línea, sin escribir nada; el v1 y el v2 salen igual; la documentación es agnóstica, dice que producción solo se ve cuando el encabezado de la versión llega a la rama que lee, y ningún flujo, hook, check ni gate lo ejecuta

## Plan

1. Contrato: `schemas/progress-snapshot/v3.schema.json`, con las mismas reglas que el esquema del consumidor, y sus fixtures `valid-v3.json` e `invalid-v3.json`. REQ-idd-026 describe el v3 y sus escenarios.
2. `scripts/lib/progress-snapshot-v3.js`: lee `delivery.changelog` de `idd/config.yaml`, las entradas `(<change-id>)` del changelog y sus encabezados, y añade `release` a las fases `done` del v2. El v1 expone qué cambios tiene cada fase y el v2 reparte su validación para que el v3 la reutilice; ninguno cambia su salida. `idd-changelog.js` exporta los encabezados que ya reconoce. Tests en `scripts/lib/progress-snapshot-v3.test.js`, y el módulo nuevo en `k1-scope-guard.test.js`.
3. `scripts/ospec.js`: `--schema-version 3`, el informe de `--out` con `changelog` y la pista de `changelog-invalid` en `idd-refusals.js`, con tests de extremo a extremo en `scripts/ospec.test.js`.
4. Documentación: `docs/README.md` (v3, etapa de entrega y rama que lee) y E5.12 en el roadmap.

## Decisions

- Respuestas del usuario al gate `open-facts` (2026-10-27, las cuatro recomendadas):
  - Changelog: solo el que declara `delivery.changelog` en `idd/config.yaml`, como `ospec close`. Sin declararlo, con `none` o si el fichero no existe, las fases `done` salen sin `release` y sin error. No hay opción `--changelog`. Cuentan los cambios archivados de la fase en `idd/archive/` y en `openspec/changes/archive/`, los mismos que le dan el estado `done`.
  - Formato: una entrada es un elemento `-`, `*` o `+` en la primera columna, fuera de bloques de código, con sus líneas sangradas unidas, que acaba exactamente en `(<change-id>)` con solo espacios detrás. Los encabezados son `## [Unreleased]`, sin distinguir mayúsculas, y `## [x.y.z] - YYYY-MM-DD` o `## [x.y.z-pre] - YYYY-MM-DD`, con corchetes y `v` opcionales, como los lee ya la propuesta de release de `close`. La versión mayor va por precedencia semver, y la misma entrada repetida bajo un encabezado cuenta una vez.
  - Validación: `changelog-invalid`, código 1, `fichero:línea` del primer problema y sin escribir nada. Solo se valida lo que decide una etapa, las entradas de cambios archivados de fases `done` y sus encabezados. Son error una entrada bajo dos encabezados; un `x.y.z` sin fecha, con fecha inexistente, con ceros a la izquierda, con `+build` o marcado `[YANKED]`; una pre-release con fecha inexistente; y una entrada que cuenta bajo un `##` que no es versión ni Unreleased, o antes del primer `##`.
  - Configuración e informe: un `idd/config.yaml` ilegible termina el v3 con código 1 y `config-invalid`; el v1 y el v2 siguen sin leerlo. Un changelog que es un directorio cuenta como ausente, y se aceptan BOM y CRLF. El informe de `--out` lleva `schema_version: 3` y `changelog`, la ruta leída o null.
- El v3 va en un módulo propio que se apoya en el v2 y el v1 en una sola dirección, sin ciclo de `require`. El v1 expone `phaseChanges` (qué cambios tiene cada fase) y su `phaseStatuses` se calcula con él; el v2 separa `documentV2`, `serializeChecked` y `problems` con su versión y los campos de fase que añade el v3. Ninguno cambia su salida: sus fixtures se siguen comparando byte a byte.
- Una línea sangrada continúa la entrada, salvo que sea un elemento anidado, que la termina. Una línea sin sangría no la continúa.
- Un encabezado `#` también deja fuera de todo `##` las entradas que lo siguen, como el principio del fichero.
- Tras la versión, el encabezado admite solo ` - YYYY-MM-DD`: cualquier otra cosa, como `[YANKED]` o una fecha sin el guion, es error si el encabezado decide una etapa.
- Suposición, fuera de las respuestas del gate: dos encabezados de producción con la misma versión que deciden una etapa se rechazan (`version x.y.z repeats the heading of line N`), porque la versión mayor no diría qué fecha lleva. Solo se miran los encabezados que contienen entradas que cuentan.
- La versión mayor se compara por longitud y luego por texto en cada número, así que no depende del tamaño de `Number`.
- Prior decision (memory): todos los tipos de cambio dejan la entrada `- <summary> (<change-id>)` en el changelog -> `scripts/lib/idd-changelog.js` (`changelogEntry`): current.
- Prior decision (memory): `ospec close` escribe la entrada bajo `## [Unreleased]` una sola vez -> `scripts/lib/idd-changelog.js` (`addEntry`): current.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-27T12:21:18.142Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-10-27T12:21:18.142Z)
- ev-3: migration-test for migration-compat-and-test (2026-10-27T12:21:29.908Z)
- ev-4: check-run for checks-pass (2026-10-27T12:23:00.874Z)
- ev-5: contract-spec-and-test for contract-spec-and-test (2026-10-27T12:23:00.874Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-10-27T12:23:00.874Z)
- ev-7: living-doc-current for living-doc (2026-10-27T12:23:56.838Z)
<!-- ospec:evidence:end -->
