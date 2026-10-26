# progress-snapshot

## Intent and acceptance

Comando ospec snapshot, bajo demanda, que lee el roadmap y los cambios IDD y SDD de un proyecto y escribe el snapshot de avance v1: un JSON con schemaVersion 1 y la lista ordenada de fases con su id, su título y su estado

Acceptance: En un proyecto con un roadmap reconocible, ospec snapshot emite un snapshot v1 que cumple el esquema y sus reglas (ids únicos, título recortado en NFC sin caracteres de control, 64 KiB como máximo, orden del roadmap), con cada fase done si su cambio está archivado, in-progress si tiene uno activo y pending en el resto; un roadmap ausente o no reconocible, o un snapshot que rompería las reglas, termina con código distinto de cero, un mensaje legible y sin escribir nada; ningún flujo IDD o SDD, hook, check, gate ni doctor lo ejecuta, y la documentación es agnóstica

## Plan

1. `scripts/lib/progress-snapshot.js`: lee las tablas de fases del roadmap, lista los cambios IDD y SDD por nombre de directorio, deriva el estado de cada fase y valida el snapshot antes de emitirlo. Tests en `scripts/lib/progress-snapshot.test.js` con fixtures sintéticos.
2. `scripts/ospec.js`: orden `snapshot` con `--roadmap` y `--out`, y `SnapshotError` como error conocido (código 1). Tests de extremo a extremo en `scripts/ospec.test.js`.
3. Contrato: REQ-idd-026 en `openspec/specs/idd/spec.md` (y la excepción en REQ-idd-001), el esquema `schemas/progress-snapshot/v1.schema.json` con sus fixtures válido e inválido, y el ADR 0012, que enmienda el 0009.
4. Documentación: `docs/README.md` y el ítem E5.10 del roadmap.

## Decisions

- Respuestas del usuario al gate `open-facts` (2026-10-26, «ok a todo», todas las recomendadas): fases desde `docs/roadmap.md` o `--roadmap`; fila de tabla con `<ID>. <título>` en la primera celda; tabla mixta = error; clave de enlace = id sin puntos, igual al id del cambio o prefijo seguido de guion; activo > archivado > pendiente; estado por nombre de directorio; título limpio sin recorte; sin `--check`; todo rechazo con código 1 y sin escribir nada.
- Gate `adr-amend-or-contradict` (2026-10-26, «si»): el snapshot declara solo su versión. ADR 0012 enmienda el 0009 en vez de reescribirlo, porque un ADR aceptado no se reescribe (REQ-idd-020).
- ADR 0011 conforma: como el doctor, la orden mira los dos árboles, pero solo lista nombres de directorio y no lee ni escribe el estado de ningún modo. REQ-idd-001 nombra la excepción.
- Cuando dos claves encajan con un cambio (`p1` y `p1-a` con `p1-a-fix`), gana la más larga, para que un cambio cuente en una sola fase.
- Con `--out`, stdout informa del roadmap, las fases y los bytes escritos (en JSON con `--json`); sin `--out`, stdout lleva solo el snapshot, también con `--json`, porque ya es JSON y un CI lo redirige tal cual.
- Un título vacío una vez limpio deja la fila sin la forma `<ID>. <título>`, así que cae en la regla de la tabla mixta o del roadmap sin fases.
- La pista de `roadmap-missing` va en `how`, como en el resto de errores de la CLI.
- El estado no lee `state.yaml`: un estado ilegible no bloquea la exportación, y un directorio de cambio cuenta aunque esté vacío.
- `persistent-data` sale del diff porque `--out` escribe un fichero: el snapshot es un formato en disco, así que se cumple con su test y un plan de compatibilidad (formato nuevo sin versión anterior; un cambio incompatible será `schemaVersion: 2`) en vez de retirarla.
- El componente `cli` trae ADR 0010 (conforma: solo `node:fs` y `node:path`) y los escenarios `contract-compatibility` (conforma), `deterministic-resume` (ninguno: no toca el estado) y `offline-operation` (conforma: sin red ni memoria).
- `scripts/lib/k1-scope-guard.test.js` registra el módulo nuevo entre los sucesores de K1, como cada módulo nuevo de `scripts/lib/`.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: migration-test for migration-compat-and-test (2026-10-26T11:24:16.436Z)
- ev-2: check-run for checks-pass (2026-10-26T11:25:25.509Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-26T11:25:25.509Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-10-26T11:25:25.509Z)
- ev-5: living-doc-current for living-doc (2026-10-26T11:25:34.530Z)
<!-- ospec:evidence:end -->
