# Proposal: token-budget-advisor

**Change**: token-budget-advisor
**Classification**: normal
**Delivery**: single PR, exception-ok

## Intent

Actualmente, las interacciones con los modelos a través de plugins e interfaces no tienen un control activo sobre el consumo de tokens en tiempo de ejecución. Esto puede provocar que la ventana de contexto se sature (context loss / amnesia del agente) en sesiones largas o que se consuman de forma ineficiente llamadas con archivos innecesariamente grandes.

Integrar un "Token Budget Advisor" (inspirado en ECC) que mida y alerte sobre el consumo de tokens, ampliando el hook `PreToolUse` para interceptar llamadas costosas y sugerir compactaciones, permitirá que el arnés opere de manera más controlada y eficiente.

## Scope

### In Scope
- Estimar el consumo de tokens de archivos antes de ser procesados por herramientas de lectura (heurística: `caracteres / 4` para código/estructurado, `palabras * 1.3` para prosa).
- Interceptar en `PreToolUse` llamadas de lectura de archivos que superen los 20,000 tokens sugeridos, deteniendo la ejecución temporalmente con una advertencia e interactividad (`ASK`).
- Trackear de forma síncrona el consumo acumulado de tokens de la sesión (ej. leyendo `.ospec/runtime/subagent-events.jsonl` o `.ospec/session/`).
- Emitir una advertencia no bloqueante si el total acumulado supera los 90,000 tokens.
- Proveer soporte para bypass de validación mediante la variable de entorno `DISABLE_TOKEN_ADVISOR=true`.

### Out of Scope
- Implementar tokenizadores exactos o dependencias pesadas de terceros en la ejecución síncrona de los hooks de pre-tool-use.
- Interceptar herramientas que no sean de lectura de archivos o ejecución de comandos (por ejemplo, herramientas puras de metadatos o MCP auxiliares no costosas).

## Capabilities

### New Capabilities
- `token-budget-advisor`: Capacidad para medir, persistir y alertar sobre el presupuesto de tokens consumidos durante una sesión activa de desarrollo.

### Modified Capabilities
- `pre-tool-use-hook`: El hook de interceptación previo a herramientas se amplía para evaluar métricas de tokens en tiempo de ejecución.

## Approach

1. **Heurística de Conteo**: Implementar una aproximación rápida y de bajo coste basada en el tamaño de caracteres y palabras del contenido a leer.
2. **Extensión del Hook en Node y Go**: 
   - Modificar `scripts/hooks/pre-tool-use.js` y `internal/hooks/pretooluse.go` para incorporar la misma validación de tokens manteniendo la paridad de comportamiento exigida por el arnés.
3. **Lectura de Sesión**: Analizar de forma ligera el histórico de eventos acumulados en la sesión actual para evaluar si el contexto general está al borde de la saturación.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/hooks/pre-tool-use.js` | Modified | Ampliación de la lógica de reglas e inspección de tamaño para llamadas a herramientas de lectura. |
| `internal/hooks/pretooluse.go` | Modified | Port equivalente en Go para mantener la paridad en el camino de ejecución ultra-rápido. |
| `skills/token-budget-advisor/SKILL.md` | New | Nueva habilidad bajo demanda que inyecta directrices de presupuesto y compactación al prompt del agente. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Latencia en el camino caliente de `PreToolUse` | Low | Realizar lecturas rápidas del tamaño de archivo (metadata) antes de leer todo el cuerpo si el archivo es grande. |
| Divergencia entre Go y Node.js | Medium | Crear pruebas unitarias equivalentes en `pre-tool-use.test.js` y `pretooluse_test.go` para verificar la paridad. |

## Rollback Plan

Revertir los cambios en `scripts/hooks/pre-tool-use.js` y `internal/hooks/pretooluse.go` para deshabilitar las validaciones del advisor de tokens.

## Dependencies

- Ninguna dependencia externa de Node.js o Go adicional (uso exclusivo de librerías nativas estándar).

## Success Criteria

- [ ] Las herramientas de lectura estiman correctamente los tokens con una heurística y alertan si excede 20k tokens.
- [ ] El hook evalúa el contexto general acumulado y alerta si excede 90k tokens.
- [ ] La variable de entorno `DISABLE_TOKEN_ADVISOR=true` desactiva completamente el control.
- [ ] Los tests de Go y Node correspondientes compilan y pasan exitosamente.

