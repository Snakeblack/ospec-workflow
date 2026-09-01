# Diseño Técnico: TUI Dashboard & Models Hub (Hitos 3 y 4)

## Arquitectura General

```mermaid
flowchart TD
    App[AppModel in internal/tui/app.go] --> Header[Header: ASCII + Badges]
    App --> TabNav{Active Tab}
    TabNav -->|Tab 1| Dash[Dashboard View in internal/tui/views/dashboard]
    TabNav -->|Tab 2| Models[Models Hub View in internal/tui/views/models]
    
    Dash --> Card1[Model Profile Card]
    Dash --> Card2[AI Targets Card]
    Dash --> Card3[OpenSpec Context Card]
    Dash --> Actions[Quick Actions: [p] Preset / [d] Doctor / [m] Models / [t] Targets]
    
    Models --> SubNav{SubMode: Presets vs Granular}
    SubNav -->|ModePresets| PresetsView[Visual Cards: Cheap / Default / Premium]
    SubNav -->|ModeGranular| GranularView[Interactive Agent-to-Tier Table]
    
    Actions -->|Apply Preset| MM[ModelsManager in internal/config]
    PresetsView -->|Apply Preset| MM
    GranularView -->|Set Agent Tier| MM
    MM -->|Atomic Write| YAML[(models.yaml)]
```

## Componentes y Paquetes

1. **[`internal/tui/views/dashboard/`](file:///home/snake/repos/ospec-workflow/internal/tui/views/dashboard):**
   - `types.go`: Define `TargetInfo`, `OpenSpecSummary`, `ModelProfileSummary`, `QuickAction`, `SwitchTabMsg` y `PresetChangedMsg`.
   - `detector.go`: `DetectTargets(repoRoot)` para inspección de evidencias de Claude, Antigravity, VS Code, Codex, OpenCode y Cursor.
   - `cards.go`: Funciones puras de renderizado para tarjetas y barra de acciones rápidas.
   - `dashboard.go`: Modelo Bubbletea con soporte de responsive layout y ciclo de presets.

2. **[`internal/tui/views/models/`](file:///home/snake/repos/ospec-workflow/internal/tui/views/models):**
   - `types.go`: Define `SubMode`, `PresetItem`, `AgentRow`, `PresetAppliedMsg` y `AgentTierUpdatedMsg`.
   - `cards.go`: Renderizadores de subnavegación, tarjetas de presets (3 columnas) y tabla de afinamiento granular categorizada.
   - `models.go`: Modelo Bubbletea con comandos de aplicación inmediata y atajos (`c`, `d`, `p`).

3. **[`internal/tui/app.go`](file:///home/snake/repos/ospec-workflow/internal/tui/app.go):**
   - Integración de los submodelos `dashboard.Model` y `models.Model`.
   - Reenvío de mensajes y sincronización de estado global (preset activo en cabecera y recarga de vistas).
