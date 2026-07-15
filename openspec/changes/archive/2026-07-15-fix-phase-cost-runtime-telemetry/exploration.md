## Exploration: ausencia de `phase-costs.jsonl` en un run SDD reciente

### Current State

El run archivado `make-clarify-conditional` terminó con `PASS` y 11/11 escenarios, pero su `archive-report.md` registra explícitamente que `.ospec/session/make-clarify-conditional/phase-costs.jsonl` faltaba o estaba vacío.

La configuración activa de Codex (`C:/Users/sn4ke/.codex/hooks.json`) registra `SubagentStop` y lo dirige, en Windows, a la copia instalada `C:/Users/sn4ke/.codex/ospec-workflow/scripts/hooks/ospec-hooks-launch.js`. Esa copia de launcher es idéntica a `scripts/hooks/ospec-hooks-launch.js` y, cuando `OSPEC_TARGET=codex`, fuerza `subagent-stop` a ejecutarse con la copia instalada de `subagent-stop.js` en Node, evitando un binario nativo potencialmente obsoleto.

El productor instalado contiene `persistPhaseCost()`: exige un nombre de agente con prefijo `sdd-`, busca el primer cambio activo mediante `findActiveChanges()`, normaliza contadores/status y llama a `appendPhaseCost()`. `appendPhaseCost()` crea `.ospec/session/{change}/phase-costs.jsonl`, serializa una fila y usa lock de archivo.

El productor del repositorio y el instalado no son idénticos. El instalado es una versión anterior: no contiene la validación phase-aware de envelopes ni la normalización/selección de nombre presente en el repositorio. Sin embargo, las diferencias observadas no prueban por sí solas la ausencia del archivo, porque el camino básico de `persistPhaseCost()` sigue presente en la copia instalada.

Smoke sintético, aislado en una carpeta temporal, usando la copia instalada:

- entrada: `agent_type: sdd-tasks`, `status: success`, `cwd` con un cambio `active`;
- resultado: `{"continue":true}`;
- evidencia: se creó `.ospec/session/smoke-change/phase-costs.jsonl` con una fila `phase: tasks`.

Esto prueba que la ruta instalada puede escribir el artefacto cuando recibe el contexto mínimo esperado.

### Affected Areas

- `C:/Users/sn4ke/.codex/hooks.json` — define el registro real de `SubagentStop` y la ruta instalada que recibe los eventos.
- `C:/Users/sn4ke/.codex/ospec-workflow/scripts/hooks/ospec-hooks-launch.js` — selecciona el ejecutor y fuerza el fallback Node para Codex.
- `C:/Users/sn4ke/.codex/ospec-workflow/scripts/hooks/subagent-stop.js` — productor efectivamente instalado de costes por fase; está desalineado del productor del repositorio.
- `scripts/hooks/subagent-stop.js` — versión fuente con la implementación más reciente de resolución de fase y envelope.
- `scripts/hooks/ospec-hooks-launch.js` — fuente del launcher; coincide con la copia instalada.
- `scripts/lib/ospec-state.js` — define `findActiveChanges()` y `appendPhaseCost()`, incluyendo la ruta y lock del JSONL.
- `openspec/changes/archive/2026-07-15-make-clarify-conditional/archive-report.md` — evidencia histórica de que el archivo no fue registrado.
- `openspec/changes/fix-phase-cost-runtime-telemetry/state.yaml` — estado actual del cambio; permanece `active` y no se modifica en esta exploración.

### Proven vs Unknown

#### Proven

1. El archivo de costes faltaba o estaba vacío en el cambio archivado.
2. La configuración de usuario sí declara un hook `SubagentStop`.
3. La ruta real de Codex usa la copia instalada y el launcher instalado ejecuta el hook Node instalado para `subagent-stop`.
4. La copia instalada contiene el código de persistencia de costes.
5. La copia instalada escribe correctamente con un cambio activo y un `agent_type` `sdd-*` en el smoke sintético.
6. La copia instalada de `subagent-stop.js` está desalineada de la fuente del repositorio; el launcher no lo está.

#### Unknown

1. No se conoce el payload real recibido por `SubagentStop` durante `make-clarify-conditional`: en particular, si llegó `agent_type`/`agent_name` con prefijo `sdd-` y qué `cwd` se resolvió.
2. No se ha probado que el proceso Codex haya cargado esta configuración de hooks durante ese run.
3. No se sabe si, en el instante de cada stop, `findActiveChanges()` encontró exactamente un cambio activo ni si el estado ya era terminal.
4. No hay evidencia en los archivos permitidos de un error de lock, permisos, excepción de serialización o stderr del hook; el diseño fail-safe los ocultaría y devolvería `continue`.
5. No se puede atribuir causalidad únicamente a la desalineación instalada: el smoke demuestra que la versión instalada sí puede producir el archivo.

### Approaches

1. **Reproducir el contrato real y luego alinear la instalación** — capturar/registrar de forma temporal el payload de `SubagentStop` en un run controlado, verificar `cwd`, nombre de agente y estado activo; después sincronizar la copia instalada desde la fuente y repetir el smoke.
   - Pros: distingue fallo de registro, contexto y despliegue; cambio mínimo y verificable.
   - Cons: requiere un run real o un payload real no disponible en los archivos inspeccionados.
   - Effort: Low

2. **Cambiar el hook para crear costes desde cualquier payload** — eliminar la dependencia de agente `sdd-*` o de cambio activo y usar un destino global.
   - Pros: reduce condiciones de no-op.
   - Cons: rompe el aislamiento por change, puede mezclar fases/cambios y oculta el problema de integración; mayor riesgo.
   - Effort: Medium

3. **Añadir observabilidad persistente al camino fail-safe** — registrar motivo de descarte y contexto mínimo cuando `persistPhaseCost()` no puede escribir.
   - Pros: convierte los desconocidos actuales en evidencia operativa.
   - Cons: no corrige por sí solo la instalación ni el payload; añade superficie de datos runtime.
   - Effort: Medium

### Recommendation

Aplicar el enfoque 1. El fix mínimo reproducible es: (a) ejecutar un smoke con el mismo launcher/configuración instalada y un payload sintético representativo; (b) ejecutar un run controlado con captura temporal del payload de `SubagentStop`; (c) comprobar que `cwd` apunta al workspace esperado, que el agente es `sdd-{phase}` y que el estado es no terminal; y (d) sincronizar `C:/Users/sn4ke/.codex/ospec-workflow/scripts/hooks/subagent-stop.js` desde `scripts/hooks/subagent-stop.js` antes de repetir el run. Solo si el payload real cumple esas precondiciones y sigue faltando el archivo debe investigarse lock/permisos o añadir telemetría de descarte.

No se recomienda cambiar todavía el contrato para aceptar payloads sin fase o sin cambio activo: la evidencia actual demuestra una capacidad de escritura, pero no identifica cuál precondición falló en producción.

### Risks

- El hook es deliberadamente fail-safe; una regresión puede quedar reducida a `{"continue":true}` sin señal visible.
- Mantener copias fuente e instalada desalineadas permite que el código corregido no sea el que ejecuta Codex.
- Instrumentar payloads reales puede exponer contenido sensible; la captura debe limitarse a metadatos (`cwd`, nombre de agente, estado y resultado de resolución), no al transcript completo.
- La exploración no ejecutó la suite de tests ni modificó código de producción, `docs/roadmap.md` o `state.yaml`.

### Ready for Proposal

Yes. El cambio puede pasar a propuesta con alcance acotado: reproducir el contrato de `SubagentStop`, sincronizar la copia instalada/runtime y añadir solo la observabilidad mínima necesaria si la reproducción demuestra un no-op silencioso no diagnosticable.
