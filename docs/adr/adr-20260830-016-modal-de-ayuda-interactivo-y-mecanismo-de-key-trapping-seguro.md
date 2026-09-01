# ADR-016: Modal de Ayuda Interactivo y Mecanismo de Key-Trapping Seguro

## Estado
Aceptado

## Fecha
2026-08-30

## Contexto
Los usuarios necesitan una guía de referencia rápida accesible en cualquier momento pulsando `?`. Dicha ayuda no debe alterar el estado actual de la vista subyacente (p. ej. no debe resetear cursores de selección ni aplicar cambios no deseados si el usuario presiona teclas mientras visualiza la ayuda).

## Decisión
Implementar el modal de ayuda en `internal/tui/footer/help.go` con `RenderHelpModal(width, height int) string`. En `AppModel`, el estado `showHelp bool` controla el renderizado y el ruteo de eventos. Cuando `showHelp == true`:
- `Update` intercepta todas las teclas: `?`, `esc`, `q`, `Enter` desactivan `showHelp = false` y regresan a la vista anterior.
- Las demás teclas son absorbidas como `tea.Cmd(nil)` para evitar efectos colaterales en la vista subyacente.
- `View` renderiza una tarjeta modal Lip Gloss centrada y dimensionada con padding defensivo.

## Consecuencias
- **Positivas**: Experiencia de usuario inmersiva, ayuda accesible en cualquier pantalla, prevención de pulsaciones accidentales.
- **Mitigaciones**: El modal calcula dimensiones relativas (`min(width-6, 84)`) para asegurar legibilidad en cualquier tamaño de terminal.
