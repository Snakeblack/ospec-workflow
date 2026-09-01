# Proposal: TUI Footer, Contextual Shortcuts, Help Modal and Binary Release (Milestone 7)

## Intent

Completar el Hito 7 del roadmap de la TUI de `ospec` finalizando la experiencia de usuario (UX polish) con un componente de pie de página contextual (`internal/tui/footer/`), un modal emergente interactivo de ayuda (`?`), la estandarización del pipeline de compilación del binario standalone `ospec` (`go build -o ospec ./cmd/ospec` / scripts npm) y la verificación completa de no-regresión contra el arnés de desarrollo existente.

## Scope

### In Scope
- **Componente Footer Contextual (`internal/tui/footer/footer.go`)**:
  - Barra inferior reactiva con atajos contextuales adaptados a la vista/pestaña activa (`TabDashboard`, `TabModels`, `TabTargets`, `TabDoctor`).
  - Renderizado adaptativo según ancho de terminal con formateo estilizado Lip Gloss.
- **Modal de Ayuda Interactivo (`internal/tui/footer/help.go`)**:
  - Diálogo emergente accesible globalmente mediante tecla `?`.
  - Cierre intuitivo mediante `?`, `esc`, `q` o `Enter`.
  - Presentación visual estructurada con Lip Gloss que desglosa:
    - Atajos globales del sistema (conmutación de pestañas `1-4`, `Tab`, `Shift+Tab`, salida `q`/`Ctrl+C`).
    - Atajos contextuales por vista (Dashboard, Models Hub, Targets Manager, System Doctor).
    - Guía rápida de uso y filosofía declarativa.
- **Integración en Shell Elm Raíz (`internal/tui/app.go`)**:
  - Estado `showHelp bool` en `AppModel`.
  - Intercepción de eventos de teclado en modo ayuda vs modo estándar.
  - Composición de capas visuales para renderizar el modal de ayuda centrado o en overlay.
  - Delegación del renderizado del footer a `internal/tui/footer`.
- **Pipeline de Compilación del Binario Standalone**:
  - Scripts en `package.json` (`build:tui`, `build:ospec`) para compilar `cmd/ospec`.
  - Verificación del binario standalone `ospec` (<50ms startup, sin dependencias externas).
- **Verificación de No-Regresión del Arnés**:
  - Cobertura total de tests unitarios e integración en Go (`go test -race ./...`).
  - Certificación del 100% de suites en verde del arnés Node.js (`npm test`).
  - Actualización del roadmap de la TUI (`docs/tui/roadmap.md`) marcando todos los hitos completados.

### Out of Scope
- Modificación del motor de hooks o reglas en TypeScript/Node.js.
- Nuevas pestañas fuera de las 4 existentes (Dashboard, Models, Targets, Doctor).

## Capabilities

### New Capabilities
- `tui-footer-and-release`: Componente de footer contextual, modal emergente de ayuda con atajos globales y específicos por vista, pipeline de empaquetado del binario `ospec` y verificación integral del sistema.

### Modified Capabilities
None

## Approach

1. Diseñar el paquete `internal/tui/footer` con tipos, renderizador de footer contextual y modal de ayuda Lip Gloss.
2. Integrar `footer.Model` o funciones de ayuda en `internal/tui/app.go`, gestionando el toggle de ayuda `?`/`esc` y el ruteo de teclas.
3. Añadir scripts npm para facilitar la compilación del binario Go (`npm run build:tui` / `npm run build:ospec`).
4. Desarrollar suite de tests unitarios e integración TDD para el footer, modal de ayuda y ciclo de vida de la aplicación.
5. Ejecutar la compilación del binario y certificar tiempos de arranque y funcionamiento en terminal.
6. Ejecutar la suite completa Go y el arnés de pruebas Node.js (`npm test`) para garantizar cero regresiones.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/tui/footer/footer.go` | New | Modelo y renderizado de footer contextual adaptado por vista |
| `internal/tui/footer/help.go` | New | Renderizado del modal emergente de ayuda y desglose de atajos |
| `internal/tui/footer/footer_test.go` | New | Tests unitarios para el footer contextual y modal de ayuda |
| `internal/tui/app.go` | Modified | Integración del footer contextual y control del modal de ayuda `?`/`esc` |
| `internal/tui/app_test.go` | Modified | Tests de integración para activación/cierre de modal de ayuda y renderizado de footer |
| `package.json` | Modified | Scripts npm `build:tui` y `build:ospec` para compilación directa |
| `docs/tui/roadmap.md` | Modified | Actualización del estado del Hito 7 a completado |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Colisión de teclas entre modal de ayuda y navegación de vistas | Low | El modal de ayuda actúa como modal interceptor de foco hasta ser cerrado |
| Desbordamiento visual del modal en terminales de baja resolución | Low | Padding dinámico y truncado inteligente en terminales estrechos |
| Conflictos en scripts de package.json | Low | Añadir scripts dedicados no invasivos que llaman directamente a `go build` |

## Rollback Plan

Revertir los cambios con `git checkout -- internal/tui/app.go internal/tui/app_test.go package.json docs/tui/roadmap.md` y eliminar el directorio `internal/tui/footer/`.

## Dependencies

- Go standard library (`fmt`, `strings`)
- `github.com/charmbracelet/bubbletea` y `github.com/charmbracelet/lipgloss`
- `internal/tui/theme`

## Success Criteria

- [ ] Footer muestra atajos contextuales adaptados a cada una de las 4 pestañas.
- [ ] Presionar `?` abre el modal de ayuda con atajos globales y por pestaña; presionar `?`, `esc` o `q` lo cierra.
- [ ] El binario standalone `./ospec` compila exitosamente vía `go build -o ospec ./cmd/ospec` o `npm run build:tui`.
- [ ] La suite completa de tests de Go (`go test -race ./...`) pasa al 100%.
- [ ] La suite completa de tests de Node.js (`npm test`) pasa al 100% sin regresiones.
- [ ] El roadmap en `docs/tui/roadmap.md` refleja el 100% de los hitos completados.
