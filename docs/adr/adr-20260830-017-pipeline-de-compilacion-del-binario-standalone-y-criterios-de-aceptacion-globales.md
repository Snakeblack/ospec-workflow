# ADR-017: Pipeline de Compilación del Binario Standalone y Criterios de Aceptación Globales

## Estado
Aceptado

## Fecha
2026-08-30

## Contexto
El Hito 7 concluye el roadmap de la TUI de `ospec`. Es imprescindible disponer de comandos directos para empaquetar el binario standalone `./ospec`, certificar que arranca instantáneamente (<50ms) y que todas las suites de pruebas del arnés Node.js y Go pasan al 100%.

## Decisión
- Añadir en `package.json` los scripts `"build:tui": "go build -o ospec ./cmd/ospec"` y `"build:ospec": "go build -o ospec ./cmd/ospec"`.
- Probar la compilación y ejecución de `./ospec` verificando la ausencia de dependencias externas en tiempo de ejecución.
- Ejecutar la suite completa de Go (`go test -race ./...`) y la suite completa de Node.js (`npm test` con 51 suites y 662 tests).
- Actualizar `docs/tui/roadmap.md` marcando el Hito 7 como completado.

## Consecuencias
- **Positivas**: Distribución simplificada de la herramienta de línea de comandos, garantía total de no-regresión en la base de código.
