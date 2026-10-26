# progress-snapshot-v2

## Intent and acceptance

ospec snapshot --schema-version 2 emite el snapshot de avance v2: las fases del roadmap con su tramo (los encabezados ## con tablas de fases) y, desde un fichero de avance opcional en Markdown (docs/progress.md o --progress), los textos para el cliente de cada tramo y fase, sus tareas, fechas, resultados y versión de prueba, y las peticiones al cliente; el v1 sigue siendo el de por defecto

Acceptance: Con --schema-version 2, ospec snapshot emite un JSON que cumple schemas/progress-snapshot/v2.schema.json y sus reglas (ids únicos, tramos seguidos y no vacíos, fechas reales con start <= end, fase done con todas sus tareas hechas, textos limpios, 64 KiB), con todas las fases del roadmap; sin fichero de avance sale solo con tramos y fases; un fichero de avance con una fase o un tramo que no está en el roadmap, una fase done con una tarea sin marcar o un texto, lista, fecha o URL fuera del formato termina con código 1, el fichero y la línea, y sin escribir nada; sin la opción, el v1 sale igual que hoy; la documentación es agnóstica y ningún flujo, hook, check ni gate lo ejecuta

## Plan

1. Contrato: `schemas/progress-snapshot/v2.schema.json`, con las mismas reglas que el esquema del consumidor, y sus fixtures `valid-v2.json` e `invalid-v2.json`. REQ-idd-026 describe el v2 y sus escenarios.
2. `scripts/lib/progress-snapshot.js`: `tables()` recuerda el `##` de cada tabla y `readRoadmap` queda compartido; el v1 no cambia. `scripts/lib/progress-snapshot-v2.js`: los tramos del roadmap, el fichero de avance, el v2 y su validación. Tests en `scripts/lib/progress-snapshot-v2.test.js`, y el módulo nuevo en `k1-scope-guard.test.js`.
3. `scripts/ospec.js`: `--schema-version <1|2>` y `--progress <ruta>` en `ospec snapshot`, con tests de extremo a extremo en `scripts/ospec.test.js`.
4. Documentación: `docs/README.md` (v2, fichero de avance, publicación desde la rama de integración) y E5.11 en el roadmap.

## Decisions

- Respuestas del usuario al gate `open-facts` (2026-10-26, «todas las recomendadas»):
  - Opciones: `--schema-version <1|2>`, con 1 por defecto. `--progress` solo vale con el v2: con el v1 es un error de uso (código 2). `docs/progress.md` se lee si existe; un `--progress` que no existe da `progress-missing`.
  - Tramos: un `##` con tablas de fases, hasta el siguiente `#` o `##`. Sin tramos no hay `groups`; fases dentro y fuera de tramos dan `roadmap-invalid`.
  - Ids: el `<ID>` del encabezado en minúsculas o, sin él, el título en minúsculas, sin tildes y con guiones. Las referencias del fichero de avance son exactas y en minúsculas. Los ids de tareas y peticiones se escriben a mano y se pasan a minúsculas. Un repetido es error.
  - Textos: la limpieza del título del v1, un párrafo de varias líneas se une en una línea y un segundo párrafo es error.
  - Sintaxis A: palabras clave fijas en inglés y cada fase bajo el `##` de su tramo.
  - URL de prueba: `https://` desnuda con host, sin usuario ni contraseña, emitida tal cual.
  - Errores: código 1, `fichero:línea` y solo el primero.
- El v2 va en un módulo propio que se apoya en el del v1 en una sola dirección. Así no hay ciclo de `require` y el v1 no cambia.
- El fichero de avance se comprueba contra el roadmap en una sola pasada (fase o tramo inexistente, fase bajo otro tramo, tarea sin marcar en una fase `done`, fase de una petición). Así el rechazo nombra el primer problema por número de línea.
- Un id derivado de más de 64 caracteres se rechaza con la pista de escribir `<ID>. <título>`, nunca se recorta. También se rechaza una sección `#### Tasks` u `#### Outcomes` vacía, porque el v2 no admite listas vacías.
- Al empezar el fichero de avance solo se ignora lo que va antes del primer `##` o `###`. Después, un bloque de código, una tabla, una cita, una lista numerada, una regla horizontal o una lista anidada son error, para que nada se pierda en silencio.
- `previewUrl` también rechaza un `@` vacío antes del host (`https://@host`). El esquema lo aceptaría, pero no es una URL desnuda.
- Más de 20 tramos dan `snapshot-limit`, como más de 100 fases en el v1. El resto de límites del fichero de avance dan `progress-invalid` con su línea.
- El informe de `--out` del v2 añade `schema_version` y `progress`. El del v1 no cambia.
- Un título de encabezado se limpia una sola vez, porque limpiarlo dos veces quitaría un énfasis escapado.
- Prior decision (memory): ospec snapshot: el snapshot declara solo su versión (ADR 0012 enmienda 0009) -> `docs/architecture/decisions/0012-documentos-exportados-con-formato-cerrado.md`: current.
- Prior decision (memory): ospec snapshot: el estado no lee state.yaml -> `scripts/lib/progress-snapshot.js` (`readChanges`): current.
- Prior decision (memory): Un fixture comparado byte a byte necesita eol=lf -> `.gitattributes` (`schemas/progress-snapshot/** text eol=lf`): current; cubre `valid-v2.json`.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: adr-impact-declaration for adr-impact-declaration (2026-10-26T22:43:36.080Z)
- ev-2: migration-test for migration-compat-and-test (2026-10-26T22:44:13.514Z)
- ev-3: check-run for checks-pass (2026-10-26T22:45:20.876Z)
- ev-4: contract-spec-and-test for contract-spec-and-test (2026-10-26T22:45:20.876Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-10-26T22:45:20.876Z)
- ev-6: living-doc-current for living-doc (2026-10-26T22:46:08.033Z)
<!-- ospec:evidence:end -->
