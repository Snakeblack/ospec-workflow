# ADR-20260830-012: Desacoplamiento del motor de diagnósticos en internal/system/doctor.go

## Estado
Aceptado

## Contexto
El System Doctor debe inspeccionar la salud del entorno de desarrollo (runtimes de Node.js y Go, árbol de trabajo Git, archivos de configuración de OpenSpec y variables de entorno de API keys). Es fundamental que esta lógica sea completamente agnóstica de la interfaz gráfica de terminal (Bubble Tea / Lip Gloss) para permitir su ejecución en modo headless, testing unitario puro o integración con futuros comandos CLI.

## Decisión
Centralizar la lógica de diagnóstico en el paquete `internal/system/doctor.go`, exponiendo estructuras puras (`DoctorCheck`, `DoctorReport`, `CheckSeverity`, `CheckCategory`) y la función pública `RunDiagnostics(repoRoot string) DoctorReport`.

## Consecuencias
- **Positivas**: Suite de pruebas unitarias 100% rápida y aislada; motor reutilizable por otros comandos CLI o hooks headless; cero dependencias de UI en la capa de diagnóstico.
- **Negativas**: Requiere desacoplar el estado visual del modelo de dominio.
