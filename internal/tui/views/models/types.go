package models

import "github.com/snakeblack/ospec-workflow/internal/tui/theme"

// SubMode indicates which view mode Models Hub is displaying.
type SubMode int

const (
	ModePresets SubMode = iota
	ModeGranular
	ModeTargetModels
	SubModeCount
)

func (m SubMode) Title() string {
	switch m {
	case ModePresets:
		return "Presets"
	case ModeGranular:
		return "Por agente"
	case ModeTargetModels:
		return "Por cliente"
	default:
		return "Desconocido"
	}
}

const (
	presetZoneCards   = 0
	presetZoneTargets = 1
	presetZoneAgents  = 2
)

const (
	colCheap = iota
	colDefault
	colPremium
)

const (
	rowModel = iota
	rowEffort
	rowVerbosity
)

// Hit is a clickable region in the Models view, relative to the view origin.
type Hit struct {
	Kind  string
	Index int
	Extra int
	X     int
	Y     int
	W     int
	H     int
}

func (h Hit) Contains(x, y int) bool {
	return x >= h.X && x < h.X+h.W && y >= h.Y && y < h.Y+h.H
}

// PresetItem encapsulates metadata and model mappings for a preset profile.
type PresetItem struct {
	ID               string
	Title            string
	Tagline          string
	Description      string
	AgentSummary     string
	ClaudeModel      string
	ClaudeEffort     string
	CodexModel       string
	CodexEffort      string
	OpenCodeModel    string
	OpenCodeEffort   string
	VSCodeModel      string
	CursorModel      string
	CursorEffort     string
	AntigravityModel string
	Characteristics  []string
	IsActive         bool
}

// TargetConfigItem represents target-specific configuration in the TUI.
type TargetConfigItem struct {
	ID                string
	DisplayName       string
	Description       string
	IsSingleModel     bool
	AvailableModels   []string
	SupportsEffort    bool
	SupportsVerbosity bool
	EffortValues      []string
	HasAssignments    bool
	CheapModel        string
	DefaultModel      string
	PremiumModel      string
	CheapEffort       string
	DefaultEffort     string
	PremiumEffort     string
	CheapVerbosity    string
	DefaultVerbosity  string
	PremiumVerbosity  string
}

func (t TargetConfigItem) ModelFor(col int) string {
	switch col {
	case colCheap:
		return t.CheapModel
	case colPremium:
		return t.PremiumModel
	default:
		return t.DefaultModel
	}
}

func (t TargetConfigItem) EffortFor(col int) string {
	switch col {
	case colCheap:
		return t.CheapEffort
	case colPremium:
		return t.PremiumEffort
	default:
		return t.DefaultEffort
	}
}

func (t TargetConfigItem) VerbosityFor(col int) string {
	switch col {
	case colCheap:
		return t.CheapVerbosity
	case colPremium:
		return t.PremiumVerbosity
	default:
		return t.DefaultVerbosity
	}
}

func tierNameForCol(col int) string {
	switch col {
	case colCheap:
		return "cheap"
	case colPremium:
		return "premium"
	default:
		return "default"
	}
}

func colForTier(tier string) int {
	switch tier {
	case "cheap":
		return colCheap
	case "premium":
		return colPremium
	default:
		return colDefault
	}
}

// AgentRow represents a single agent entry in the granular configuration table.
type AgentRow struct {
	Name        string
	CurrentTier string
	Category    string
	Description string
}

// TierBadge renders a formatted colored badge for a model tier.
func TierBadge(tier string) string {
	switch tier {
	case "premium":
		return theme.StyleValueAccent.Render("[MÁXIMO]")
	case "cheap":
		return theme.StyleValueSuccess.Render("[ECONÓMICO]")
	case "default":
		return theme.StyleValuePrimary.Render("[EQUILIBRADO]")
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

// TargetModelUpdatedMsg notifies that a target's model assignment changed.
type TargetModelUpdatedMsg struct {
	Target string
	Tier   string
	Model  string
}

func displayEffort(value string) string {
	if value == "" {
		return "—"
	}
	return value
}
