package models

import "github.com/snakeblack/ospec-workflow/internal/tui/theme"

// SubMode indicates whether Models Hub is viewing Presets, Providers, or Granular tuning.
type SubMode int

const (
	ModePresets SubMode = iota
	ModeProviders
	ModeGranular
)

func (m SubMode) Title() string {
	switch m {
	case ModePresets:
		return "Presets Globales"
	case ModeProviders:
		return "Proveedores & LLMs Locales"
	case ModeGranular:
		return "Afinamiento por Agente"
	default:
		return "Desconocido"
	}
}

// PresetItem encapsulates metadata and model mappings for a preset profile.
type PresetItem struct {
	ID              string
	Title           string
	Tagline         string
	Description     string
	ClaudeModel     string
	CodexModel      string
	OpenCodeModel   string
	VSCodeModel     string
	CursorModel     string
	Characteristics []string
	IsActive        bool
}

// AgentRow represents a single agent entry in the granular configuration table.
type AgentRow struct {
	Name        string
	CurrentTier string // "cheap", "default", "premium"
	Category    string
	Description string
}

// TierBadge renders a formatted colored badge for a model tier.
func TierBadge(tier string) string {
	switch tier {
	case "premium":
		return theme.StyleValueAccent.Render("[PREMIUM]")
	case "cheap":
		return theme.StyleValueSuccess.Render("[CHEAP]")
	case "default":
		return theme.StyleValuePrimary.Render("[DEFAULT]")
	default:
		return theme.StyleValueWarning.Render("[" + tier + "]")
	}
}

// PresetAppliedMsg notifies parent AppModel that a preset was applied.
type PresetAppliedMsg struct {
	Preset string
}

// AgentTierUpdatedMsg notifies that an agent's tier has been modified.
type AgentTierUpdatedMsg struct {
	Agent string
	Tier  string
}
