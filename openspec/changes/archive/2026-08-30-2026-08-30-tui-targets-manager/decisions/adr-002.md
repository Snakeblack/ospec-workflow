# ADR-002: Arquitectura de panel dividido (Split Master-Detail) responsiva en Bubbletea

- Status: proposed
- Change: 2026-08-30-tui-targets-manager
- Date: 2026-08-30

## Context
El Targets Manager debe exhibir simultáneamente la navegación interactiva entre 6 targets AI y el diagnóstico detallado de cada target (rutas detectadas vs faltantes, matriz de capacidades, estado del runtime). Una lista plana oculta información crítica, mientras que modales modales introducen fricción de navegación.

## Decision
Implementar una vista Elm (`internal/tui/views/targets/`) con arquitectura Master-Detail adaptativa: disposición en columnas paralelas (Split horizontal: lista 35%, detalle 65%) cuando el ancho de terminal es $\ge 96$ columnas, y degradación fluida a disposición apilada vertical cuando el ancho es $< 96$ columnas o la altura es reducida.

## Alternatives
- Ventanas modales emergentes sobre la lista: rechazada porque interrumpe la navegación rápida con cursor y sobrecarga el manejo de foco en Bubbletea.
- Navegación multinivel con pantallas de detalle separadas: rechazada por requerir pulsaciones adicionales de teclas y restar inmediatez visual a la auditoría de targets.

## Consequences
- Experiencia de usuario inmediata y reactiva al navegar con teclas de cursor (`↑/↓`, `j/k`) o salto numérico (`1`-`6`).
- Manejo robusto de terminales estrechas sin desbordamientos ANSI ni texto truncado incorrectamente.
- Facilidad de renderizado modular separando `renderTargetList` y `renderTargetDetail` en `cards.go`.
