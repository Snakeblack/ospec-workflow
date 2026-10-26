# memory-loop-visible

## Intent and acceptance

E1.47 (B8): el bucle de memoria se ve en la salida de texto. ospec close en texto lista topic | title de cada registro de conocimiento en vez de solo su número; record intent devuelve memory_query, una pista que no bloquea con las palabras de la petición más los componentes y ADR que el CLI ya calcula; references/memory-loop.md dice que durante un cambio IDD los registros de close sustituyen al guardado genérico. El CLI sigue sin leer la memoria.

Acceptance: Un close en texto muestra el topic y el título de cada registro y un test lo fija; record intent devuelve memory_query en JSON y en texto y un test lo fija; memory-loop.md dice cuándo usar la consulta y que los records de close sustituyen al guardado genérico; sin memoria el flujo no cambia y memory-boundary.test.js sigue en verde

## Plan

1. `memoryQuery` en `scripts/lib/idd-knowledge.js`, puro, con sus tests: ids de ADR y componentes primero, después las palabras de la petición.
2. `scripts/ospec.js`: `record intent` devuelve `memory_query` (JSON y línea `memory query:`) desde el plan, el diff y los cites de una feature; `close` en texto lista `- <topic> | <title>` bajo una cabecera con el comando de `--json`.
3. `skills/idd/SKILL.md` (regla 2) y `references/memory-loop.md`: el recall va tras `record intent` con su consulta, y los records de `close` sustituyen al guardado genérico; `idd-protocol.test.js` lo fija en los 7 targets.
4. Spec: REQ-idd-024 (texto de `close` y `memory_query`) y REQ-session-memory-011 (momento del recall).

## Decisions

- **El recall va después de `record intent` y antes de preguntar los hechos abiertos** (respuesta del usuario al gate open-facts). Los hechos se declaran en el mismo `record intent` y después no cambian, así que una decisión previa confirmada en disco solo da contexto o la respuesta recomendada de una pregunta, nunca la respuesta. Se enmiendan la regla 2 de la skill y REQ-session-memory-011.
- **`memory_query` es una cadena de hasta 12 términos** (respuesta del usuario): `ADR-<NNNN>` y los componentes de las rutas que el cambio ya nombra (plan, diff y cites de una feature), después las palabras de `--request`, o de `--summary` sin él, en minúsculas, sin repetir, de 4 o más caracteres y sin una lista corta de palabras vacías en inglés y español. Un identificador con `-`, `_` o `.` (`memory_query`, `E1.47`) cuenta como una palabra. La búsqueda acepta cualquiera de los términos.
- **Se devuelve en cada `record intent` que deja una intención resuelta, y nunca en uno ambiguo ni sin términos** (respuesta del usuario): también al repetirlo, al subir de kind y al resolver la ambigüedad. Sale en texto como `memory query: …` y no se guarda en `state.yaml`.
- **El texto de `close` lista `- <topic> | <title>`** bajo una cabecera con el número y `ospec close --change <id> --json`, que da resumen y procedencia (respuesta del usuario). La línea «(see --json)» desaparece y el JSON no cambia.
- **Durante un cambio IDD abierto sus decisiones no se guardan sobre la marcha**: los records de `close` sustituyen al guardado genérico; fuera de un cambio siguen el traspaso del roadmap y los resúmenes de sesión del host. La adenda SDD queda fuera (respuesta del usuario).
- Prior decision (memory): E3.5 knowledge-memory-loop: recall una vez tras leer el código y antes de los open facts -> skills/idd/references/memory-loop.md: current. Este cambio lo enmienda por decisión del usuario: el recall pasa a ir tras `record intent`.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-26T20:59:41.092Z)
- ev-2: check-run for checks-pass (2026-10-26T21:02:59.666Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-26T21:02:59.666Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-10-26T21:02:59.666Z)
- ev-5: migration-test for migration-compat-and-test (2026-10-26T21:03:35.199Z)
- ev-6: migration-test for migration-compat-and-test (2026-10-26T21:03:48.810Z)
- ev-7: living-doc-current for living-doc (2026-10-26T21:03:55.256Z)
<!-- ospec:evidence:end -->
