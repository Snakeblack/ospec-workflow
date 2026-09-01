# ADR-20260830-013: Arquitectura Split Master-Detail para diagnósticos y remediaciones en Bubble Tea

## Estado
Aceptado

## Contexto
Los desarrolladores necesitan una vista interactiva que ofrezca un panorama global rápido de la salud del sistema y, al mismo tiempo, proporcione el diagnóstico técnico profundo y la guía paso a paso de remediación para cualquier componente advertido o con errores.

## Decisión
Implementar en `internal/tui/views/doctor/` un patrón Split Master-Detail reactivo:
- **Banner Superior**: Resumen de salud general con badge dinámico (`Healthy`, `Degraded`, `Critical`) y métricas de passed/warnings/errors.
- **Master List**: Checklist navegable por teclado (`↑`/`↓`, `j`/`k`, `Home`/`End`, `1`-`9`) con semáforo coloreado (`✓ OK`, `⚠ AVISO`, `✗ ERROR`).
- **Detail Pane**: Tarjeta de evidencia técnica y caja destacada de sugerencias de remediación rápida (`💡 Remediación`).
- **Layout Adaptativo**: Split horizontal lado a lado para terminales $\ge 96$ columnas y apilado vertical para terminales $< 96$ columnas.

## Consecuencias
- **Positivas**: Interfaz intuitiva y ergonómica que ayuda al usuario a solucionar problemas al instante sin salir de la TUI.
- **Negativas**: Gestión de redimensionamiento responsivo en Bubble Tea.
