# Apply Progress: TUI System Doctor & Diagnostics (Milestone 6)

## Summary

Implementación completa del **Hito 6: Vista 4 - System Doctor & Diagnóstico** siguiendo la metodología SDD y TDD estricto (Red-Green-Refactor).

## Deliverables

1. **Motor de Diagnósticos (`internal/system/doctor.go` & `doctor_test.go`)**:
   - Detección y verificación de:
     - Node.js (>= 22)
     - Go Toolchain (>= 1.23)
     - Git CLI y estado de working tree (`git status --porcelain`)
     - Archivos de configuración de OpenSpec (`models.yaml`, `openspec/config.yaml`, `hooks/hooks.json`)
     - Variables de entorno de API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `GITHUB_TOKEN`) en modo advisory.
   - Cálculo consolidado de `DoctorReport`, severidades (`SeverityOK`, `SeverityWarning`, `SeverityError`), categorías y estado global (`Healthy`, `Degraded`, `Critical`).
   - Evidencias técnicas detalladas y recomendaciones de remediación accionables.

2. **Vista TUI del Doctor (`internal/tui/views/doctor/`)**:
   - `types.go`: Tipos de datos, mensajes y badges de severidad/categoría.
   - `doctor.go`: Modelo Elm Bubble Tea, navegación por teclado (`↑`/`↓`, `j`/`k`, `Home`/`End`, `1`-`9`), trigger de re-escaneo con `r`/`Enter` y gestión de estado.
   - `cards.go`: Banner de salud con badge contextual, checklist estilizado, panel de diagnóstico detallado y caja destacada de sugerencias de remediación rápida.
   - `doctor_test.go`: Suite exhaustiva de pruebas unitarias para navegación, bounds, layout y re-escaneo.

3. **Integración en Shell Raíz Elm (`internal/tui/app.go` & `app_test.go`)**:
   - Enlace de `TabDoctor` (Pestaña 4 / ID 3) con delegación de eventos, refresco automático al conmutar y reenvío de redimensionamiento.
   - Conmutación desde Dashboard con acceso rápido `d` o `Enter` en la acción rápida de Doctor.
   - Tests de integración en `app_test.go` verificando el ciclo completo.

4. **Documentación (`docs/tui/roadmap.md`)**:
   - Hito 6 marcado como `✅ Completado`.
