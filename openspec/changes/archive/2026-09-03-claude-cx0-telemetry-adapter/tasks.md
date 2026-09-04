# Tasks: Claude CX0 Telemetry Adapter

## Spec/Design Reconciliation

| Requisito / Escenario | Prioridad | Asignación de diseño | Estado | Notas |
|---|---|---|---|---|
| REQ-hooks-018 / Transcripción válida alimenta CX0 | MUST | `extractClaudeTelemetry` + `persistContextMeasurement` (composición codex‖claude) | covered-by-design | stdout y `continue: true` intactos |
| REQ-hooks-018 / Formato Anthropic-compatible | MUST | `analyzeTranscriptTail` → `normalizeUsageObject` | covered-by-design | suma del par; all-or-nothing (ADR-002) |
| REQ-hooks-018 / Transcripción corrupta degrada fail-safe | MUST | try/catch total del extractor → `unavailable: host-field-unavailable` | covered-by-design | sin throw ni exit≠0 |
| REQ-hooks-019 / binario presente → Node | MUST | rama Claude en `resolveInvocation` tras la rama codex | covered-by-design | `isClaudeCodeHost(env)` |
| REQ-hooks-019 / demás eventos → binario | MUST | rama solo para `subagent-stop` | covered-by-design | enrutamiento existente intacto |
| REQ-hooks-019 / sin binario → fallback Node | MUST | `resolveBinary` → null → Node (existente) | covered-by-design | sin cambios |
| REQ-context-measurement-007 / uso completo → available + derivadas | MUST | `contextMetricObservations` + `deriveContextKpis` (lib, sin cambios) | covered-by-design | derivadas como envelopes con `status` |
| REQ-context-measurement-007 / par Anthropic normalizado | MUST | `normalizeUsageObject` (suma; guard `cached <= input`) | covered-by-design | sin ceros evidenciales |
| REQ-context-measurement-007 / cobertura parcial degrada solo afectadas | MUST | envelopes `host-field-unavailable` por métrica | covered-by-design | registro persiste forma completa |
| REQ-context-measurement-008 / host `claude` por señal | MUST | tiers 3–5 de precedencia (ADR-002) | covered-by-design | firma gratis del mismo tail-read |
| REQ-context-measurement-008 / host explícito precede | MUST | tier 1 (regex existente) | covered-by-design | |
| REQ-context-measurement-008 / sin señal → `unknown-host` | MUST | tier 6 (default existente) | covered-by-design | resto del registro sin alterar |

### Veredicto de reconciliación

- Cobertura MUST: **completa** — 0 escenarios `missing-design`, 0 `ambiguous`.
- Huecos SHOULD/MAY: ninguno. El SHOULD de escaneo acotado (REQ-hooks-018) queda convertido en regla exacta por ADR-001.
- Ambigüedades en seguimiento: sdd-spec-001..003 y sdd-design-001..003 ya registradas en `state.yaml`; el diseño las cierra y no bloquean la descomposición.

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Líneas cambiadas estimadas | 700–900 (2 archivos nuevos, 4 modificados; ~60% tests) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR único con `size:exception` (estrategia `exception-ok` ya aceptada en sesión); 3 work units = 3 commits convencionales |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High
```

Nota: la carga estimada supera el presupuesto de 400 líneas (por eso `Chained PRs recommended: Yes` como propiedad de la carga), pero la decisión cacheada `exception-ok` resuelve la entrega como PR único con `size:exception` explícito; por eso no se requiere decisión nueva antes de apply.

### Suggested Work Units

| Unidad | Objetivo | PR/commit | Notas |
|---|---|---|---|
| 1 | Módulo `scripts/hooks/lib/claude-usage.js` + `scripts/hooks/lib/claude-usage.test.js` | Commit 1 | Autónomo; base `main`; `feat(hooks): añade extractor de uso Claude desde transcripciones` |
| 2 | Integración CX0 en `scripts/hooks/subagent-stop.js` + tests CM-007/008 y H-018 | Commit 2 | Depende de Unidad 1; `feat(hooks): alimenta la lane CX0 con uso observado del host Claude` |
| 3 | Rama Claude en `scripts/hooks/ospec-hooks-launch.js` + tests H-019 | Commit 3 | Independiente de Unidades 1–2; `feat(hooks): enruta subagent-stop a Node bajo Claude Code` |

Si el equipo optara por PRs encadenados: PR 1 base `main`; PR 2 base PR 1; PR 3 base `main` (independiente).

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Fase 1: Módulo extractor de uso Claude (foundation)

- [x] 1.1 RED: crear `scripts/hooks/lib/claude-usage.test.js` con tests de `normalizeUsageObject`: triple estándar válido; par Anthropic (`cache_read_input_tokens` + `cache_creation_input_tokens` → suma); par incompleto (un solo miembro → caché `undefined`, sin cero); valores no enteros, negativos o > 10^12 → inválidos; sin `input_tokens`/`output_tokens` válidos → `undefined` [REQ-context-measurement-007, REQ-hooks-018]
- [x] 1.2 GREEN: implementar `normalizeUsageObject` en `scripts/hooks/lib/claude-usage.js` (forma `entry.message.usage` primero, luego `entry.usage`; enteros seguros [0, 10^12]) [REQ-context-measurement-007]
- [x] 1.3 RED: tests de `analyzeTranscriptTail` sobre texto de cola: escaneo reverso (última entrada válida gana); firma Claude (`type === "assistant"` con `message` objeto); líneas corruptas/vacías ignoradas sin throw; límite `MAX_TAIL_LINES = 1000`; ventana sin uso válido → `{ usage: undefined, isClaudeTranscript }` [REQ-hooks-018, REQ-context-measurement-008]
- [x] 1.4 GREEN: implementar `analyzeTranscriptTail` con las constantes `TAIL_WINDOW_BYTES = 262_144` y `MAX_TAIL_LINES = 1000` [REQ-hooks-018]
- [x] 1.5 RED: tests de `readTranscriptTail` con fixtures en tmp: archivo > 256 KiB (lee solo la cola y descarta la primera línea parcial si offset > 0); archivo < ventana (lectura completa); archivo vacío; inexistente/ilegible → `undefined`; path traversal rechazado por `validatePath` [REQ-hooks-018]
- [x] 1.6 GREEN: implementar `readTranscriptTail` (una lectura posicionada: `fs.open` → `stat` → `read` en `max(0, size − 262 144)`; fail-safe total: cualquier error → `undefined`, sin reintentos ni fallback a lectura completa) [REQ-hooks-018] (ADR-001)
- [x] 1.7 GREEN: implementar `extractClaudeTelemetry(input, env = process.env)`: resolver `transcript_path` ‖ `agent_transcript_path`, leer cola + analizar, retornar `{ usage?, isClaudeTranscript }` | `undefined`; verificar `node --test scripts/hooks/lib/claude-usage.test.js` en verde [REQ-hooks-018]

## Fase 2: Integración CX0 en subagent-stop.js (core)

- [x] 2.1 RED: en `scripts/hooks/subagent-stop.test.js` (patrón `append` stub existente), escenario CM-007 de uso completo: registro con `input_tokens`/`output_tokens`/`cached_input_tokens` `available` source `host-observed` y `uncached_input_tokens`/`unique_context`/`duplicated_context` `available` source `runtime-derived`; `amplification/v1` disponible cuando `unique_context > 0` [REQ-context-measurement-007, REQ-hooks-018]
- [x] 2.2 GREEN: en `persistContextMeasurement`, componer `tokenUsage = codex || claudeTelemetry?.usage` (Codex primero byte a byte, cortocircuito; un solo tail-read alimenta uso + firma) [REQ-hooks-018]
- [x] 2.3 RED: escenario CM-007 del par Anthropic end-to-end (caché = suma) y escenario de cobertura parcial: input/output `available`; `cached_input_tokens`, `uncached_input_tokens`, `unique_context`, `duplicated_context` y `amplification/v1` `unavailable` con razón estable, sin ceros evidenciales y registro persistido completo [REQ-context-measurement-007]
- [x] 2.4 GREEN: en `contextMetricObservations`, emitir envelopes `unavailable` explícitos para métricas directas y derivadas inmediatas (`host-field-unavailable`; `incompatible-components` cuando `cached > input`), sin tocar `scripts/lib/context-measurement.js` [REQ-context-measurement-007]
- [x] 2.5 RED: escenarios CM-008 de host con `env` inyectado (sin mutar `process.env`): `host` explícito válido conservado; `OSPEC_TARGET=claude` → `claude`; `CLAUDE_PLUGIN_ROOT` no vacío → `claude`; firma de transcripción → `claude`; sin señal → `unknown-host` [REQ-context-measurement-008]
- [x] 2.6 GREEN: implementar la precedencia de host (tiers 1–6 de ADR-002) en `persistContextMeasurement`, con `OSPEC_PLUGIN_ROOT` excluido como señal [REQ-context-measurement-008] (ADR-002)
- [x] 2.7 RED: escenario H-018 de transcripción corrupta/ausente: métricas de tokens `unavailable: host-field-unavailable`, sin throw, exit 0, envelope, phase-cost (lane O1) y stdout `continue: true` idénticos [REQ-hooks-018]
- [x] 2.8 Verificación local: `node --test scripts/hooks/subagent-stop.test.js` en verde; invariante stdout comprobado en todos los escenarios nuevos [REQ-hooks-018]

## Fase 3: Enrutado del launcher (integration)

- [x] 3.1 RED: en `scripts/hooks/ospec-hooks-launch.test.js`, escenario H-019: host Claude (`env` con `OSPEC_TARGET=claude` y con `CLAUDE_PLUGIN_ROOT`) + binario presente (stubs `exists`/`readFileSync` inyectados) → `{ command: process.execPath, args: [<scriptDir>/subagent-stop.js] }` [REQ-hooks-019]
- [x] 3.2 GREEN: añadir `isClaudeCodeHost(env = process.env)` (`OSPEC_TARGET === "claude"` ‖ `CLAUDE_PLUGIN_ROOT` no vacío) y la rama `subagent-stop && isClaudeCodeHost(env)` en `resolveInvocation` tras la rama codex, ganando parámetro opcional `env = process.env` (retrocompatible) [REQ-hooks-019] (ADR-002)
- [x] 3.3 RED: escenarios H-019 restantes: `pre-tool-use` con binario → binario; cualquier subcomando sin binario → fallback Node; rama codex intacta (byte a byte) [REQ-hooks-019]
- [x] 3.4 Verificación local: `node --test scripts/hooks/ospec-hooks-launch.test.js` en verde, ajustando la implementación si algún escenario falla [REQ-hooks-019]

## Fase 4: Verificación y trazabilidad

- [x] 4.1 Ejecutar `npm test` completo: suite preexistente (20 archivos) + los 3 archivos de tests tocados, todo en verde
- [x] 4.2 Verificar invariantes de diseño: cero cambios en `scripts/lib/context-measurement.js`, `hooks/hooks.json` y `persistPhaseCost`; `main()` de `subagent-stop.js` intacto
- [x] 4.3 Verificar trazabilidad REQ→tarea→test: los 12 escenarios MUST de la tabla de reconciliación (CM-007/008, H-018/019) tienen al menos un test que los ejercita
- [x] 4.4 Confirmar commits por work unit: 3 commits convencionales en imperativo español (tests junto al código, sin atribución de modelos), preparando el terreno para `sdd-verify`
