# Design: Suite de changes de referencia / benchmark (O2)

## Technical Approach

El entregable de O2 es una infraestructura de benchmark verificable localmente: catálogo, materialización sintética, runner, guards, scoring run-level, identidad fuerte, cache resumible, recovery offline y publicación atómica fail-closed. Su conformidad se demuestra con tests Node y comprobaciones estructurales; ni `sdd-verify` ni `sdd-archive` dependen de ejecutar modelos live o de que exista `scripts/evals/reports/reference-baseline.md`.

`scripts/evals/safe-export.js` mantiene la única definición de exactamente nueve perfiles y deriva para cada uno repositorio aislado, petición, ruta, artefactos y outcome estructural. `scripts/evals/run.js` conserva los siete golden scenarios y selecciona el benchmark. `scripts/evals/live-driver.js` concentra las fronteras productivas: contexto de ejecución, spawn real, captura host-owned, recovery, cache y publicación. `scripts/evals/lib/benchmark.js` limita las filas a métricas run-level verificables.

El piloto core live es un seguimiento operativo: `docs-one-file`, `small-bugfix` y `security-sensitive-change`. Puede ejecutarse cuando haya host y presupuesto, pero el renderer solo publica una baseline si recibe las tres filas aceptadas bajo identidades comparables. La observación aceptada de Sol y la rechazada de Luna-low se conservan en el audit trail como diagnósticos; ninguna cuenta como core completado ni entra en la baseline.

## Architecture Decisions

### Decision: Infraestructura local como entregable; baseline live como seguimiento

**Choice**: cerrar O2 por la implementación y verificación local de sus controles. La ejecución live no bloquea verify/archive. Si posteriormente se solicita `all`/`initial`, la publicación sigue condicionada a 3/3 core compatibles; `extended` conserva los nueve perfiles y es opcional.

**Alternatives considered**: bloquear el change hasta obtener 3/3 live, publicar una baseline parcial o exigir los nueve perfiles.

**Rationale**: el valor entregable es un mecanismo reproducible y fail-closed. La disponibilidad del modelo, variabilidad remota y coste son condiciones operativas, no defectos de esa infraestructura. Separar cierre y experimento evita gasto abierto sin rebajar la integridad de una futura baseline. Esta frontera significativa se registra en `decisions/adr-001.md`.

### Decision: Catálogo derivado sin fixtures benchmark paralelas

**Choice**: `safe-export.js` define exactamente nueve perfiles. `all` e `initial` seleccionan el core de tres; `extended`, los nueve. Los directorios `__fixtures__/benchmark/` no son autoridad ni dependencia de materialización.

**Alternatives considered**: fixtures versionadas duplicadas o catálogos separados para runner y driver.

**Rationale**: una sola fuente evita drift entre input, expected route, artefactos y outcome.

### Decision: Identidad comparable de modelo, reasoning effort e instalación

**Choice**: resolver una vez un contexto de ejecución inmutable. `OSPEC_REMOTE_MODEL_IDENTITY` controla exactamente `codex exec --model`; `OSPEC_REMOTE_REASONING_EFFORT` se valida y controla `model_reasoning_effort`. Ambos valores entran en el descriptor. La identidad instalada se deriva mediante SHA-256 de bytes auditados tras `assertInstalledO1Runtime` y un preflight satisfactorio de `SubagentStop`; ninguna etiqueta de entorno suplanta esa medición.

**Alternatives considered**: inferir modelo/esfuerzo desde configuración implícita, omitir effort de la cache o aceptar una identidad instalada declarativa.

**Rationale**: modelo y effort pueden cambiar coste y comportamiento; omitir cualquiera permitiría mezclar resultados no comparables. La identidad derivada liga cache y recovery al runtime observado.

### Decision: Recovery y cache reproducibles, siempre fail-closed

**Choice**: una entrada conserva transcript exacto, observación, duración, ruta y O1 suplementario para recalcular la fila. El hit exige coincidencia de schema, perfil, git, CLI, runtime source, working tree, runtime instalado, modelo, effort, manifest, prompt y payload. Recovery solo opera sobre un workspace temporal preservado, sin outputs host previos; repite las mismas validaciones post-exit y publica cache/completion únicamente al final.

**Alternatives considered**: aceptar filas persistidas sin recalcular, reutilizar solo por perfil o editar evidencia preservada para hacerla aceptable.

**Rationale**: el ahorro de una reanudación solo es válido si no cambia las condiciones ni la evidencia. Identidad desconocida, mismatch, transcript incompleto, reporte ambiguo o efecto estructural divergente produce miss/rechazo y deja baseline ausente.

### Decision: O1 suplementario bajo un threat model cooperativo

**Choice**: la fila primaria usa tokens de `turn.completed.usage`, duración host, preguntas y defectos; declara `measurement_scope: run` y ninguna atribución por fase. O1 se adjunta solo si sus filas nativas conservan el binding emitido y coinciden con sesión/transcript. Ausencia o invalidez produce `unavailable`, sin síntesis ni redistribución ponderada.

**Alternatives considered**: estimar costes por fase, bloquear scoring sin O1 o presentar hashes como autenticación.

**Rationale**: O1 aporta diagnóstico, no autoridad primaria. En el threat model `cooperative-orchestrator`, hashes, replay y checksums prueban correlación y detectan corrupción/tamper posterior; no autentican criptográficamente a un productor malicioso.

## Data Flow

```text
safe-export catalog ──> local structural/unit tests ──> infrastructure verified
        │
        └── operational follow-up requested
                  │
     model + effort + installed-byte identity
                  v
        codex exec ──> exact JSONL + host evidence ──> single-use capability
                                                        │
                                      recovery/cache ───┤
                                                        v
                         3 compatible core rows? ── no ─> no baseline
                                      │ yes
                                      v
                           atomic reference-baseline.md
```

Sol y Luna-low siguen una rama de auditoría separada: se referencian como observaciones diagnósticas en los artefactos del change o workspaces preservados. No se suministran al renderer, no se convierten en cache compatible del conjunto core objetivo y no incrementan su contador 3/3.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/evals/safe-export.js` | Modify | Catálogo canónico y materialización derivada de nueve perfiles. |
| `scripts/evals/run.js` | Modify | Runner golden, selección core/extended y superficie pública sin scoring por replay. |
| `scripts/evals/live-driver.js` | Modify | Identidad modelo+effort+runtime, spawn, recovery, cache, guards y publicación atómica. |
| `scripts/evals/lib/benchmark.js` | Modify | Parsing, attestations, filas run-level y renderer 3/3. |
| `scripts/evals/*.test.js` | Modify | Verificación local del catálogo, guards, identidad, recovery, cache y fail-closed. |
| `scripts/evals/README.md` | Modify | Contrato operativo, límites de evidencia y ejecución manual. |
| `scripts/evals/reports/reference-baseline.md` | Operational output | Ausente hasta un seguimiento live comparable 3/3; no es artefacto requerido para cerrar O2. |

## Interfaces / Contracts

- `OSPEC_REMOTE_MODEL_IDENTITY`: valor no vacío pasado al argumento `--model` y persistido como `remote_model_identity`.
- `OSPEC_REMOTE_REASONING_EFFORT`: enum soportado pasado a `model_reasoning_effort` y persistido como `remote_reasoning_effort`.
- `installed_runtime_identity`: SHA-256 derivado de bytes instalados validados tras preflight; no acepta etiquetas arbitrarias.
- `compatibility_strength: strong`: solo cuando modelo, effort e instalación son conocidos y el resto del descriptor es exacto.
- Capability productiva: host-owned, in-memory, single-use y ligada a workspace, sesión, transcript, hash y CLI observada.
- Recovery: no lanza modelo ni red, no acepta raíces arbitrarias ni outputs host preexistentes y reejecuta validación estructural/provenance antes de persistir.
- Publicación: únicamente tres filas core compatibles; cualquier conjunto parcial o diagnóstico Sol/Luna mantiene el baseline ausente.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Nueve perfiles, core/extended, filas, renderer y parsers | `node:test`, fixtures temporales y contratos exactos. |
| Integration local | Modelo y effort causales, digest instalado, preflight, capability, cache, recovery y publicación | Spawns/dependencias controlados, JSONL sintético, filesystem temporal y casos positivos/negativos fail-closed. |
| Structural | Golden runner, rutas, artefactos, git outcomes y ausencia de heurísticas | Matchers declarativos y checks de fuente/export. |
| Operational live | Comportamiento remoto y baseline comparativa | Seguimiento manual no bloqueante; 3/3 con idéntica identidad comparable antes de publicar. |

Strict TDD exige evidencia RED/GREEN/triangulación para cada control local. Los tests deben probar especialmente que cambiar modelo o effort causa miss, recovery no fabrica evidencia, un conjunto menor de tres no publica y los diagnósticos no alcanzan el renderer. Una ejecución live puede aportar observabilidad, pero no sustituye ni condiciona estas pruebas.

## Migration / Rollout

No hay migración de datos. Descriptores antiguos sin reasoning effort o identidad instalada derivada quedan incompatibles. El rollout del change termina tras tests locales, verificación SDD y archive. Después, como operación independiente y presupuestada, puede ejecutarse el core; solo un conjunto nuevo 3/3 compatible publica la baseline. Sol y Luna-low permanecen como diagnóstico histórico y no se promocionan.

## Open Questions

None.
