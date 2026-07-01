# Especificación: token-budget-advisor

## Purpose

Esta especificación define el comportamiento de la nueva capacidad "Token Budget Advisor", la cual se encarga de realizar un seguimiento preventivo y heurístico del consumo de tokens en las interacciones del agente. Su fin es evitar la pérdida de contexto ("context loss") advirtiendo interactivamente al usuario antes de lecturas excesivas o cuando la sesión está próxima a saturarse.

## Requirements

### Requirement: Estimación heurística de tokens
El sistema MUST calcular de forma rápida y síncrona el costo de tokens de los archivos leídos utilizando las siguientes heurísticas estándar de estimación:
- Para archivos de código fuente y datos estructurados (extensiones como `.js`, `.go`, `.json`, `.yaml`, `.yml`, `.md`, `.txt`): `caracteres / 4` (1 token por cada 4 caracteres).
- Para prosa o texto plano general (sin código): `palabras * 1.3`.

#### Scenario: Estimación de archivo de código fuente
- GIVEN un archivo de código fuente de 4,000 caracteres de longitud
- WHEN el advisor calcula los tokens estimados
- THEN la estimación final MUST ser de 1,000 tokens

#### Scenario: Estimación de archivo de prosa
- GIVEN un archivo de texto con 100 palabras
- WHEN el advisor calcula los tokens estimados
- THEN la estimación final MUST ser de 130 tokens

---

### Requirement: Control de límites y advertencias en PreToolUse
El sistema MUST interceptar las llamadas a herramientas que involucren lectura de archivos (como `view_file`) en `PreToolUse`. Si el costo estimado del archivo excede los 50,000 tokens, el Advisor MUST sugerir una advertencia interactiva (`ask`) indicando el costo potencial y solicitando la aprobación explícita del usuario.

#### Scenario: Lectura de archivo dentro de los límites seguros
- GIVEN una llamada a la herramienta `view_file` para un archivo con un costo estimado de 5,000 tokens
- WHEN el hook `PreToolUse` evalúa la llamada
- THEN el Advisor MUST retornar una decisión de `allow` (permitir) sin advertencias bloqueantes

#### Scenario: Lectura de archivo que excede el límite de tokens
- GIVEN una llamada a la herramienta `view_file` para un archivo con un costo estimado de 55,000 tokens
- WHEN el hook `PreToolUse` evalúa la llamada
- THEN el Advisor MUST retornar una decisión de `ask` con una descripción detallada que advierta del costo de 55,000 tokens

---

### Requirement: Control acumulado de sesión
El sistema MUST calcular de forma síncrona los tokens consumidos en la sesión actual a partir del archivo de eventos `.ospec/runtime/subagent-events.jsonl` o de la memoria temporal. Si el total acumulado leído excede los 150,000 tokens, el hook MUST retornar `ask` (en ejecuciones interactivas) alertando al usuario sobre la saturación inminente del contexto y recomendando ejecutar la compactación.

#### Scenario: Sesión por debajo del límite acumulado
- GIVEN una sesión activa con 35,000 tokens leídos en total
- WHEN se realiza una llamada a herramientas en `PreToolUse`
- THEN el Advisor MUST retornar `allow` y permitir la ejecución sin alertas de compactación

#### Scenario: Sesión excedida en el acumulado de tokens
- GIVEN una sesión activa con 155,000 tokens leídos acumulados
- WHEN se realiza una llamada a herramientas en `PreToolUse`
- THEN el Advisor MUST retornar `ask` con una advertencia de contexto saturado y recomendación de compactación

---

### Requirement: Desactivación por variable de entorno
El Advisor MUST desactivar de inmediato todo control y retornar `allow` si se detecta la variable de entorno `DISABLE_TOKEN_ADVISOR=true`.

#### Scenario: Bypass del advisor activo
- GIVEN la variable de entorno `DISABLE_TOKEN_ADVISOR=true` en el entorno del sistema
- WHEN se procesa una llamada a un archivo de 60,000 tokens en `PreToolUse`
- THEN el hook MUST retornar una decisión de `allow` inmediatamente, omitiendo la advertencia

## Clarifications

### Session 2026-07-02

- Q: El límite por archivo de 20,000 tokens y el acumulado de sesión de 90,000 tokens generaban advertencias demasiado frecuentes para uso normal. ¿Se deben subir los umbrales? → A: Sí. El límite por archivo sube a 50,000 tokens y el acumulado de sesión a 150,000 tokens, dejando margen suficiente (3x) entre una lectura individual grande y el techo acumulado de la sesión. (Source: user request, 2026-07-02.)
