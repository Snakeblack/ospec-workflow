# ADR-20260830-014: Chequeos protegidos por timeouts y evaluación consultiva de API keys

## Estado
Aceptado

## Contexto
La invocación de binarios del sistema operativo (`node`, `go`, `git`) puede sufrir latencias impredecibles en sistemas con alta carga. Asimismo, la ausencia de variables de entorno de proveedores AI (como `OPENAI_API_KEY` o `ANTHROPIC_API_KEY`) no debe impedir el uso local ni marcar falsamente el arnés como inutilizable.

## Decisión
1. Proteger todas las invocaciones a binarios externos mediante `context.WithTimeout(ctx, 1*time.Second)`.
2. Tratar la ausencia de API keys como un aviso informativo (`SeverityWarning` / Advisory), permitiendo al usuario conocer los proveedores disponibles sin degradar la aplicación a estado crítico (`Critical`).
3. Proporcionar la acción interactiva de re-escaneo (`r` / `Enter`) para verificar cambios sin reiniciar la TUI.

## Consecuencias
- **Positivas**: Tiempos de renderizado y refresco acotados (<100ms); cero falsos positivos de bloqueo; feedback transparente y educativo.
- **Negativas**: Ninguna detectada.
