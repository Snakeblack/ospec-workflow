# opencode-plugin-native-ask

## Intent and acceptance

El bridge del shim opencode colapsa el veredicto ask del guard a bloqueo duro: el agente no puede ejecutar operaciones que el guard solo quiere confirmar (p. ej. un commit con arbol sucio o en la rama por defecto). En OpenCode v2 (>= 2.0.29) el bridge debe pedir permiso nativo con ctx.permission.assert (hook permission.evaluate que escala la accion propia a ask y publica el aviso del guard como message) manteniendo deny como throw; en v1 y en runtimes sin assert se conserva el bloqueo duro.

Acceptance: En OpenCode v2 con el plugin reemitido, un commit del agente con arbol sucio muestra el prompt nativo de permiso con el aviso del guard; al aprobar (once) el commit se ejecuta y al rechazar la llamada falla con el motivo. Un veredicto deny (p. ej. un push forzado) sigue bloqueando sin prompt, y en v1 o runtimes sin permission.assert un ask sigue bloqueando en duro. El validador exige el contrato emitido, con tests que fallan sin el arreglo, y el golden se regenera.

## Plan

1. Fase roja: tests del shim y del validador que exigen el ask nativo (`ctx.permission.assert` y el hook `permission.evaluate`) y variante del validador sin el contrato; el par `repro-test` queda registrado con el fallo (run-2) y el verde posterior (run-3).
2. Generador `scripts/lib/target-profiles/opencode-plugin.js`: `permissionRequest()` construye la petición (tool + detalle del input, `metadata.reason`); `setupOspecWorkflow` registra el hook `permission.evaluate` que re-escala la acción propia `ospec` a `ask` con el aviso del guard como `message`, y en `execute.before` mapea ask + `ctx.permission.assert` al prompt nativo; deny, veredictos desconocidos y runtimes sin la API siguen en bloqueo duro; el camino v1 no cambia.
3. Validador `scripts/configure/validate-opencode.js`: exige `permission.assert` y `permission.hook("evaluate"` en el plugin emitido, con test de rechazo contra el ask colapsado.
4. Contrato actualizado en `openspec/specs/hooks-runtime/spec.md` (semántica ask, fallback fail-closed, export dual), migración registrada con plan de compatibilidad/rollback y check completo verde; golden regenerado.
5. Reinstalación del plugin global (`npm run setup:opencode`) y verificación en vivo: commit del agente con árbol sucio → prompt nativo (once) → el commit se ejecuta; deny sigue bloqueando sin prompt.

## Decisions

- El veredicto ask se mapea a la API nativa `ctx.permission.assert` (OpenCode >= 2.0.29) en vez de colapsar a throw: es la solución de raíz al bloqueo de commits del agente, sin parches de política.
- Los runtimes sin `permission.assert` (v1 o v2 < 2.0.29) conservan el bloqueo duro fail-closed (ADR 0008): la degradación nunca abre el guard (respuesta del usuario al open-fact de compatibilidad).
- La acción propia `ospec` se re-escala a `ask` en el hook `permission.evaluate` porque la política base del host resuelve allow para toda acción; sin esa escalada el `assert` no mostraría prompt. El aviso del guard viaja como `message` desde `metadata.reason`.
- "Permitir siempre" no silencia el guard: cada operación se pregunta de nuevo (paridad de semántica con v1; respuesta del usuario al open-fact de semántica).
- Los `resources` del prompt llevan la herramienta más el detalle concreto del input (command/path) para que la confirmación muestre lo que se aprueba (respuesta del usuario al open-fact de resources).
- `deny` y cualquier veredicto desconocido siguen siendo bloqueo duro, y el camino v1 queda intacto: solo ask cambia de forma, y solo donde existe superficie nativa.
- El contrato emitido queda fijado en `openspec/specs/hooks-runtime/spec.md` y en el validador: la degradación de ask a bloqueo silencioso no puede volver por omisión.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-17T00:14:36.864Z)
- ev-2: check-run for checks-pass (2026-10-17T00:15:46.440Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-17T00:15:46.440Z)
- ev-4: check-run for checks-pass (2026-10-17T00:16:50.020Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-10-17T00:16:50.020Z)
- ev-6: migration-test for migration-compat-and-test (2026-10-17T00:18:59.627Z)
- ev-7: check-run for checks-pass (2026-10-17T00:20:02.921Z)
- ev-8: contract-spec-and-test for contract-spec-and-test (2026-10-17T00:20:02.921Z)
- ev-9: adr-impact-declaration for adr-impact-declaration (2026-10-17T00:20:02.921Z)
- ev-10: living-doc-current for living-doc (2026-10-17T00:20:19.318Z)
<!-- ospec:evidence:end -->
