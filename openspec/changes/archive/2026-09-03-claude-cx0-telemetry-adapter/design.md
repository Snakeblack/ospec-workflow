# Design: Claude CX0 Telemetry Adapter

## Technical Approach

Extraer el triple canónico de tokens (entrada/salida/caché) desde la cola de la transcripción JSONL de Claude Code en `subagent-stop.js`, mediante un módulo nuevo de lectura acotada (`scripts/hooks/lib/claude-usage.js`), y alimentarlo exclusivamente a la lane CX0 (`persistContextMeasurement`). El launcher (`ospec-hooks-launch.js`) enruta `subagent-stop` a Node bajo hosts Claude, en espejo del precedente Codex, para que el binario Go no ensombrezca al productor Node. Todo es aditivo y fail-safe: cualquier fallo degrada a `unavailable: host-field-unavailable` sin tocar stdout, envelope, phase-cost ni exit code (REQ-hooks-017/018).

Anclaje verificado en el repo:

- `hooks/hooks.json` (manifiesto vivo) invoca `node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ospec-hooks-launch.js subagent-stop` con `timeout: 5` → el presupuesto de 5 s es contractual y `CLAUDE_PLUGIN_ROOT` está garantizado en el entorno bajo Claude Code.
- `resolveInvocation` ya tiene el precedente de enrutamiento (`subagent-stop` + `OSPEC_TARGET=codex` → Node); `scripts/hooks/ospec-hooks.exe` existe en el árbol → el shadowing es real hoy en Windows.
- `parseCodexTokenCountTranscript` define la semántica de escaneo reverso (última entrada válida gana); `normalizeContextMeasurement` preserva observaciones con `status` → las derivadas se inyectan como envelopes desde `contextMetricObservations` sin tocar `scripts/lib/context-measurement.js`.

## Architecture Decisions

### Decision: Ventana de escaneo y presupuesto de I/O — tail-read 256 KiB, escaneo reverso

**Choice**: Una única lectura posicionada de los últimos `TAIL_WINDOW_BYTES = 262_144` bytes (`fs.open` → `stat` → `read` en `max(0, size − 256 KiB)`), descartando la primera línea parcial si offset > 0. Escaneo reverso por líneas (≤ 1000 intents de parse): la primera entrada de uso válida gana. Sin reintentos ni fallback a lectura completa: ventana sin uso válido → `unavailable`. `validatePath` (pathsafe) antes de todo I/O; cualquier error → `undefined` → degradación.

| Alternativa | Tradeoff | Por qué pierde |
|---|---|---|
| `fs.readFile` completo (ruta Codex) | Simple | I/O no acotado en transcripciones de decenas de MB vs `timeout: 5` |
| Streaming reverso por chunks | Mismo resultado | Complejidad de reensamblado innecesaria |
| Sumar usos de toda la transcripción | "Totales" de sesión | Métricas dependientes del tamaño de archivo/ventana (no determinísticas) |

**Rationale**: Las transcripciones Claude son JSONL append-only: el uso más reciente vive en la cola. Peor caso: 1 stat + 1 lectura ≤ 256 KiB + parse de ≤ 1000 líneas (típicamente < 100 ms ≪ 5 s). "Última válida gana" replica el precedente Codex y representa el contexto terminal del subagente. Las lecturas completas preexistentes (envelope/resolution) dominan el presupuesto y quedan fuera de alcance.

### Decision: Precedencia de detección de host Claude

**Choice** (primero que aplica gana):

1. `input.host` explícito válido (regex existente) — precedencia conservada.
2. `OSPEC_TARGET === "codex"` → `codex` (existente, intacto).
3. `OSPEC_TARGET === "claude"` → `claude`.
4. `CLAUDE_PLUGIN_ROOT` no vacío → `claude` (**`OSPEC_PLUGIN_ROOT` no es señal**: el launcher lo inyecta en todos los hosts).
5. Firma de transcripción: entrada con `type === "assistant"` y `message` objeto en la ventana → `claude`.
6. `unknown-host` (existente).

En el launcher, `isClaudeCodeHost(env) = OSPEC_TARGET === "claude" || CLAUDE_PLUGIN_ROOT no vacío` — solo marcadores de entorno, sin I/O de transcripción; `OSPEC_TARGET` precede para que hosts que reutilizan layouts de plugin Claude (p. ej. Cursor) puedan sobreescribir.

| Alternativa | Por qué pierde |
|---|---|
| Solo `CLAUDE_PLUGIN_ROOT` | Pierde configurabilidad explícita y simetría con la rama codex |
| Solo firma de transcripción | Indisponible en el launcher sin I/O adicional |

**Rationale**: De lo explícito a lo inferido; la firma se obtiene gratis del mismo tail-read del uso (un solo pase de I/O).

### Decision: Triple canónico y derivaciones en `contextMetricObservations`

**Choice**:

- Uso por línea: `entry.message.usage` (forma Claude) primero, luego `entry.usage` (genérica compatible). Validación: enteros seguros `[0, 10^12]` (cota `count()` del validador). Entrada calificante: `input_tokens` y `output_tokens` válidos (caché opcional → ruta parcial).
- `cached_input_tokens`: campo estándar si es válido; si no, **par Anthropic all-or-nothing** (`cache_read_input_tokens + cache_creation_input_tokens` solo si AMBOS válidos; un solo miembro → caché `unavailable`, sin ceros evidenciales).
- `uncached_input_tokens = input − cached`: disponible solo si ambos presentes y `cached <= input` (`runtime-derived`, `complete 2/2`, `uncached-input/v1`); si `cached > input` → envelope explícito `unavailable` con `incompatible-components`; si falta contador → `host-field-unavailable`.
- `unique_context` = componente uncached; `duplicated_context` = componente cached (cada uno disponible solo si su componente lo es); `input.context_measurement.*` explícito conserva precedencia (ya lo hace el código).
- `amplification/v1` la deriva `deriveContextKpis` (lib) con sus códigos de baseline (`partial-coverage`, `zero-denominator`); los códigos del delta aplican a métricas directas y derivadas inmediatas.

**Alternatives considered**: miembro ausente del par como 0 — prohíbe la spec (sin ceros evidenciales); reinterpretar `input_tokens` nativo Anthropic sumando caché — invención fuera del contrato `input − cached`.

**Rationale**: La lib preserva envelopes con `status`, así que las derivadas se emiten donde ya vive la lógica, sin cambios de schema ni validador. Varianza semántica de endpoints: si `input` nativo excluye caché y `cached > input`, el guard degrada a `incompatible-components` en vez de inventar negativos — spec-mandated.

### Decision: Composición de fuentes y aislamiento de lanes

**Choice**: En `persistContextMeasurement`: `tokenUsage = codex || claudeTelemetry?.usage` (Codex primero — comportamiento existente byte a byte; extractor Claude con cortocircuito). Un solo tail-read alimenta uso + firma. `persistPhaseCost` (O1) intacta: la extracción alimenta solo la lane CX0 (asunción sdd-spec-003). La extracción se intenta siempre que haya transcripción resoluble; si un host no-Claude expusiera contadores compatibles, registrarlos como `host-observed` es telemetría más veraz en una lane aditiva sin autoridad.

**Alternatives considered**: gatear a `OSPEC_TARGET=claude` — rompe detección por firma y endpoints compatibles; compartir extractor con O1 — prohibido por alcance.

### Decision: Rama de launcher para `subagent-stop` bajo Claude

**Choice**: En `resolveInvocation`, tras la rama codex: `sub === "subagent-stop" && isClaudeCodeHost(env)` → `{ command: process.execPath, args: [join(scriptDir, "subagent-stop.js")] }`. `resolveInvocation` gana parámetro opcional `env = process.env` (retrocompatible; tests sin mutar `process.env`). Demás subcomandos/hosts intactos.

**Alternatives considered**: excluir Cursor del branch — innecesario: el productor Node es superconjunto funcional para este evento (el binario es optimización); detectar host por stdin en el launcher — duplicaría I/O.

## Data Flow

Secuencia (lane CX0 bajo Claude Code):

    Claude Code   launcher              subagent-stop.js      claude-usage.js       lib CX0
        │             │                        │                    │                  │
        │ SubagentStop│                        │                    │                  │
        │────────────▶│ resolveInvocation      │                    │                  │
        │             │ (subagent-stop+claude) │                    │                  │
        │             │ spawnSync node ───────▶│                    │                  │
        │             │                        │ envelope + O1      │                  │
        │             │                        │──extractTelemetry─▶│ validatePath     │
        │             │                        │                    │ stat+read ≤256KiB│
        │             │                        │◀─{usage,firma}─────│  escaneo reverso │
        │             │                        │ codex||claude; host por precedencia   │
        │             │                        │ triple + envelopes derivados           │
        │             │                        │──normalize+validate───────────────────▶│
        │             │                        │──append JSONL ─────────────────────────▶│
        │             │◀─ stdout {continue:true}│                                        │
        │◀─ continue ─│ (idéntico en éxito Y en degradación)                               │

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/hooks/lib/claude-usage.js` | Create | `readTranscriptTail`, `analyzeTranscriptTail` (uso + firma), `normalizeUsageObject`, `extractClaudeTelemetry`; constantes de ventana/líneas |
| `scripts/hooks/subagent-stop.js` | Modify | `persistContextMeasurement`: composición codex‖claude + host por precedencia; `contextMetricObservations`: envelopes derivados con `incompatible-components` |
| `scripts/hooks/ospec-hooks-launch.js` | Modify | `isClaudeCodeHost` + rama Claude en `resolveInvocation` con `env` opcional |
| `scripts/hooks/lib/claude-usage.test.js` | Create | Tests del extractor (ventana, formatos, fail-safe) |
| `scripts/hooks/subagent-stop.test.js` | Modify | Escenarios CM-007/008 y H-018 |
| `scripts/hooks/ospec-hooks-launch.test.js` | Modify | Escenarios H-019 |

Sin cambios en `scripts/lib/context-measurement.js` (ya soporta los envelopes) ni en `hooks/hooks.json` (ya enruta vía launcher con `timeout: 5`).

## Interfaces / Contracts

```js
// scripts/hooks/lib/claude-usage.js
const TAIL_WINDOW_BYTES = 262_144;   // 256 KiB
const MAX_TAIL_LINES = 1000;

/** Par Anthropic all-or-nothing; enteros seguros [0,1e12].
 *  @returns {{input_tokens:number, output_tokens:number, cached_input_tokens?:number}|undefined} */
function normalizeUsageObject(usage);
function analyzeTranscriptTail(tailText);   // → { usage?:object, isClaudeTranscript:boolean }
async function readTranscriptTail(filePath, tailBytes = TAIL_WINDOW_BYTES); // → string|undefined (fail-safe)
async function extractClaudeTelemetry(input, env = process.env);
// → { usage?, isClaudeTranscript } | undefined (sin transcripción resoluble o lectura fallida)

// ospec-hooks-launch.js
function isClaudeCodeHost(env = process.env); // OSPEC_TARGET==="claude" || CLAUDE_PLUGIN_ROOT no vacío
```

La firma de `contextMetricObservations(input, tokenUsage, ctx)` no cambia; `tokenUsage` acepta además la forma Claude (campos que ya lee).

## Cobertura de escenarios (design-after-spec)

| Escenario MUST | Asignación |
|---|---|
| CM-007: uso completo → available + derivadas | `extractClaudeTelemetry` + `contextMetricObservations` + `deriveContextKpis` (lib) |
| CM-007: par Anthropic normalizado | `normalizeUsageObject` (suma del par; guard `cached <= input`) |
| CM-007: cobertura parcial degrada solo afectadas | caché undefined + envelopes `host-field-unavailable` por métrica |
| CM-008: host `claude` por señal | tiers 3–5 en `persistContextMeasurement` |
| CM-008: host explícito conserva precedencia | tier 1 (regex existente) |
| CM-008: sin señal → `unknown-host` | tier 6 (default existente) |
| H-018: transcripción válida alimenta CX0, stdout idéntico | lane CX0 post-O1 fail-safe; `main()` intacto |
| H-018: formato Anthropic-compatible aceptado | `analyzeTranscriptTail` → `normalizeUsageObject` |
| H-018: corrupta degrada fail-safe | try/catch total del extractor → `unavailable` |
| H-019: binario presente → Node | rama Claude en `resolveInvocation` |
| H-019: demás eventos → binario | rama solo para `subagent-stop` |
| H-019: sin binario → fallback Node | `resolveBinary` → null → Node (existente) |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `claude-usage.js`: ventana (archivo > 256 KiB, línea parcial descartada), triple estándar vs par Anthropic vs par incompleto, valores inválidos, líneas corruptas, archivo vacío/ausente, traversal | `node:test` + fixtures en tmp; funciones puras sin fs |
| Unit | `subagent-stop.js`: 9 escenarios CM+H-018 vía `persistContextMeasurement` con `append` stub (patrón existente); precedencia host con `env` inyectado; invariante stdout | `node:test` |
| Unit | `ospec-hooks-launch.test.js`: `resolveInvocation` con `exists`/`readFileSync`/`env` inyectados (claude+binario→Node; pre-tool-use→binario; sin binario→Node; codex intacto) | `node:test` |

## Migration / Rollout

No migration required. Cambio aditivo; rollback = `git revert` (telemetría degrada a `unavailable: host-field-unavailable` sin romper sesiones).

## Open Questions

Ninguna bloqueante. Las tres ambigüedades design-resolvibles quedan cerradas: ventana/presupuesto (Decisión 1), precedencia de host (Decisión 2), lectura parcial en 5 s (Decisión 1).
