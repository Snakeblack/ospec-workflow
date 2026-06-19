# Tasks: token-budget-advisor

**Delivery**: Single PR, exception-ok
**Estimated changed lines**: ~120-180

---

## Tanda 1 — Definición de la Habilidad (Skill) y Estructura de Tests

- [x] **T1.1** Crear el archivo [skills/token-budget-advisor/SKILL.md](file:///c:/Users/sn4ke/dev/activos/ospec-workflow/skills/token-budget-advisor/SKILL.md) con las directivas de tokens y compactación de contexto para el agente.
- [x] **T1.2** Verificar que la nueva habilidad sea detectada automáticamente por el cargador de habilidades en `SessionStart` (`discoverSkills`).
- [x] **T1.3** Definir los esqueletos y casos de prueba vacíos en `scripts/hooks/pre-tool-use.test.js` y `internal/hooks/pretooluse_test.go` para iniciar el ciclo TDD.

## Tanda 2 — Implementación del Advisor en el Hook de Node.js

- [x] **T2.1** Modificar `scripts/hooks/pre-tool-use.js` para leer y respetar el bypass `process.env.DISABLE_TOKEN_ADVISOR === "true"`.
- [x] **T2.2** Implementar una función recursiva de extracción de rutas en los valores de `tool_input` que detecte rutas reales en el espacio de trabajo.
- [x] **T2.3** Añadir la lógica de estimación en Node.js usando `fs.statSync` para leer el tamaño en bytes (metadatos) del archivo y aplicar las heurísticas de conteo (`bytes / 4` para código/estructurado, `(bytes / 6) * 1.3` para prosa).
- [x] **T2.4** Interceptar lecturas que superen los 20k tokens retornando una decisión `ask` explicativa.
- [x] **T2.5** Implementar la lectura de tokens de la sesión actual acumulando los registros de `.ospec/session/{changeName}/token-events.jsonl`, retornando `ask` si supera 90k tokens globales.
- [x] **T2.6** Guardar el registro actual mediante append atómico al log de eventos de tokens de sesión `.ospec/session/{changeName}/token-events.jsonl` tras autorizar el uso de la herramienta.

## Tanda 3 — Implementación del Advisor en el Hook de Go (Paridad)

- [x] **T3.1** Modificar `internal/hooks/pretooluse.go` para comprobar la variable de entorno `DISABLE_TOKEN_ADVISOR`.
- [x] **T3.2** Implementar en Go el detector de rutas, estimación heurística mediante `os.Stat` e interceptación de archivos individuales mayores de 20k tokens.
- [x] **T3.3** Implementar en Go la agregación y escritura por append en `.ospec/session/{changeName}/token-events.jsonl`.
- [x] **T3.4** Compilar localmente el binario de Go (`go build` o script del arnés) para asegurar la compatibilidad estructural.

## Tanda 4 — Pruebas Unitarias y Validación

- [x] **T4.1** Escribir y completar los casos de prueba unitarios en `scripts/hooks/pre-tool-use.test.js`.
- [x] **T4.2** Escribir y completar los casos de prueba en Go `internal/hooks/pretooluse_test.go` y asegurar la paridad de comportamiento.
- [x] **T4.3** Ejecutar la verificación completa mediante `npm test` para asegurar que el arnés pasa todos los gates.

---

## Review Workload Forecast

| Metric | Value |
|--------|-------|
| Estimated changed lines | ~120-180 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Decision needed before apply | No (exception-ok aprobada) |

## Dependencies
None.
