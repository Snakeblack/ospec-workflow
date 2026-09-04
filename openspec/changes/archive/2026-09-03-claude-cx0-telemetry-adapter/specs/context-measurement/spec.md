# Delta for context-measurement

## ADDED Requirements

### Requirement: Claude Code Host Token Observation From Session Transcripts {#REQ-context-measurement-007}

Para sesiones de Claude Code (incluidos endpoints compatibles con Anthropic/GLM/Z.AI), el sistema MUST poblar `context-measurements.jsonl` con métricas de tokens observadas por el host, extraídas de la transcripción de sesión cuando exista: `input_tokens`, `output_tokens` y `cached_input_tokens`, cada una con source `host-observed` y su cobertura. Los formatos de uso soportados MUST normalizarse al triple canónico entrada/salida/caché antes de derivar: el campo estándar `cached_input_tokens` y los campos Anthropic `cache_read_input_tokens` + `cache_creation_input_tokens` (suma de ambos) son fuentes equivalentes de `cached_input_tokens`.

A partir del triple canónico, el sistema MUST derivar, con source `runtime-derived`, versión de fórmula declarada y cobertura derivada:

| Métrica | Derivación |
|---|---|
| `uncached_input_tokens` | `input - cached` bajo `uncached-input/v1`; disponible solo si `cached <= input` |
| `unique_context` | componente no cacheada (`uncached_input_tokens`) |
| `duplicated_context` | componente cacheada (`cached_input_tokens`) |
| `amplification/v1` | según REQ-context-measurement-002 sobre esas dos componentes |

Los valores explícitos de `context_measurement` suministrados por el host MUST conservar precedencia sobre los derivados de tokens; la derivación por tokens aplica solo en su ausencia. Cuando un contador o su par requerido falte, sea inválido o incompatible, la métrica afectada y sus derivadas MUST quedar `unavailable` con código de razón estable (`host-field-unavailable` o `incompatible-components`), sin ceros evidenciales ni sustituciones estimadas de legado.

#### Scenario: Transcripción con uso completo produce métricas observadas y derivadas

- GIVEN una sesión de Claude Code cuya transcripción JSONL contiene uso con `input_tokens`, `output_tokens` y `cached_input_tokens` válidos
- WHEN `SubagentStop` emite el registro CX0
- THEN las tres métricas MUST quedar `available` con source `host-observed`
- AND `uncached_input_tokens`, `unique_context` y `duplicated_context` MUST quedar `available` con source `runtime-derived`
- AND `amplification/v1` MUST estar disponible cuando `unique_context > 0`

#### Scenario: Campos de caché Anthropic se normalizan al triple canónico

- GIVEN una transcripción cuyo uso expone `cache_read_input_tokens` y `cache_creation_input_tokens` sin `cached_input_tokens`
- WHEN la normalización construye el triple canónico
- THEN `cached_input_tokens` MUST igualar la suma de ambos campos Anthropic
- AND `uncached_input_tokens` MUST derivarse como `input - cached` sin resultar negativa

#### Scenario: Cobertura parcial degrada solo las métricas afectadas

- GIVEN una transcripción con `input_tokens` y `output_tokens` válidos pero sin contadores de caché
- WHEN el registro CX0 se normaliza
- THEN `input_tokens` y `output_tokens` MUST quedar `available` con source `host-observed`
- AND `cached_input_tokens`, `uncached_input_tokens`, `unique_context`, `duplicated_context` y `amplification/v1` MUST quedar `unavailable` con código de razón estable
- AND el registro MUST persistir con su forma completa sin convertir faltantes en ceros

### Requirement: Resolución de la Dimensión Host para Sesiones Claude {#REQ-context-measurement-008}

Para sesiones identificables como Claude Code, la dimensión `host` del registro CX0 MUST resolver a `claude`, detectada por señales de sesión (por ejemplo `CLAUDE_PLUGIN_ROOT`, `OSPEC_TARGET=claude` o firmas de transcripción), en lugar del valor por defecto `unknown-host`. Un `host` explícito válido suministrado en la entrada MUST conservar precedencia sobre la detección. Cuando no exista señal de host reconocible, el registro MAY conservar `unknown-host` sin degradar el resto del registro.

#### Scenario: Sesión Claude Code resuelve host `claude`

- GIVEN un dispatch en una sesión con señal Claude Code y sin `host` explícito
- WHEN el registro CX0 se normaliza
- THEN la dimensión `host` MUST ser `claude`, no `unknown-host`

#### Scenario: Host explícito conserva precedencia

- GIVEN un dispatch cuyo input incluye un `host` válido (por ejemplo `opencode`)
- WHEN el registro CX0 se normaliza
- THEN la dimensión `host` MUST conservar el valor explícito de la entrada

#### Scenario: Sin señal de host se conserva el valor por defecto

- GIVEN un dispatch sin señal Claude Code ni `host` explícito
- WHEN el registro CX0 se normaliza
- THEN la dimensión `host` MUST permanecer `unknown-host`
- AND las métricas del registro MUST persistir sin alteración por el valor de host
