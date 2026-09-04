# Delta for hooks

## ADDED Requirements

### Requirement: SubagentStop Extracción de Tokens Desde Transcripciones Claude {#REQ-hooks-018}

En sesiones de Claude Code (incluidos endpoints compatibles Anthropic/GLM), `scripts/hooks/subagent-stop.js` MUST intentar extraer el uso de tokens del host (`input_tokens`, `output_tokens`, contadores de caché) desde la transcripción JSONL referenciada por `transcript_path` o `agent_transcript_path`, para poblar la lane CX0 (REQ-hooks-017) con métricas `available` según REQ-context-measurement-007. La extracción MUST aceptar el formato de uso estándar (`cached_input_tokens`) y el formato Anthropic (`cache_read_input_tokens`, `cache_creation_input_tokens`). El escaneo SHOULD limitarse a las entradas recientes de la transcripción para acotar el I/O en archivos grandes. Esta extracción es estrictamente aditiva y fail-safe: una transcripción ausente, ilegible o corrupta MUST degradar las métricas afectadas a `unavailable` con razón `host-field-unavailable`, sin bloquear `SubagentStop`, sin alterar stdout (`continue: true`), la persistencia del envelope, la grabación de phase-cost ni el código de salida.

#### Scenario: Transcripción válida alimenta la lane CX0

- GIVEN un dispatch de `SubagentStop` en Claude Code con `transcript_path` hacia una transcripción JSONL con entradas de uso válidas
- WHEN `SubagentStop` procesa el dispatch
- THEN la lane CX0 MUST registrar `input_tokens`, `output_tokens` y `cached_input_tokens` como `available` con source `host-observed`
- AND stdout y `continue: true` MUST permanecer idénticos al comportamiento previo

#### Scenario: Formato Anthropic-compatible se acepta como fuente

- GIVEN una transcripción cuyas entradas exponen `cache_read_input_tokens` y `cache_creation_input_tokens` sin `cached_input_tokens`
- WHEN la extracción normaliza el uso
- THEN los contadores MUST normalizarse al triple canónico entrada/salida/caché (caché = suma de los campos Anthropic)
- AND las métricas CX0 derivadas MUST computarse desde ese triple

#### Scenario: Transcripción corrupta degrada fail-safe

- GIVEN un `transcript_path` inexistente, ilegible o con líneas JSON corruptas
- WHEN `SubagentStop` intenta extraer el uso
- THEN las métricas de tokens CX0 MUST quedar `unavailable` con razón `host-field-unavailable`
- AND el hook MUST continuar su comportamiento existente sin throw, sin exit code distinto de cero y sin alterar envelope ni phase-cost

### Requirement: Launcher Enruta SubagentStop a Node en Claude Code {#REQ-hooks-019}

`scripts/hooks/ospec-hooks-launch.js` MUST incluir en `resolveInvocation` una rama explícita para el subcomando `subagent-stop` bajo hosts Claude Code que retorne la invocación Node.js directa (`process.execPath` + `subagent-stop.js`), en espejo del precedente Codex, de modo que un binario nativo presente MUST NOT ensombrecer al productor Node para este evento. La detección del host Claude Code MAY apoyarse en marcadores de entorno (`CLAUDE_PLUGIN_ROOT`, `OSPEC_TARGET=claude`). Los demás subcomandos y hosts MUST conservar el enrutamiento existente (binario primero, fallback Node).

#### Scenario: subagent-stop con binario presente se ejecuta vía Node

- GIVEN un host Claude Code con un binario nativo presente y `ospec-hooks-launch.js subagent-stop` invocado
- WHEN `resolveInvocation` resuelve la invocación
- THEN MUST retornar el runtime Node con `subagent-stop.js`, no el binario nativo

#### Scenario: Los demás eventos conservan el enrutamiento binario

- GIVEN un host con binario nativo presente y `ospec-hooks-launch.js pre-tool-use` invocado
- WHEN `resolveInvocation` resuelve la invocación
- THEN MUST retornar el binario nativo, sin cambio de comportamiento

#### Scenario: Sin binario se mantiene el fallback Node

- GIVEN un host sin binario nativo presente
- WHEN `resolveInvocation` resuelve cualquier subcomando
- THEN MUST retornar el fallback Node existente para ese subcomando
