package dashboard

import "github.com/snakeblack/ospec-workflow/internal/tui/theme"

// TargetStatusKind indicates the detection state of an AI client.
type TargetStatusKind string

const (
	StatusConfigured    TargetStatusKind = "Configured"
	StatusDetected      TargetStatusKind = "Detected"
	StatusNotConfigured TargetStatusKind = "NotConfigured"
)

// Badge returns a styled visual badge representation of the target state.
func (s TargetStatusKind) Badge() string {
	switch s {
	case StatusConfigured:
		return theme.StyleValueSuccess.Render("✓ Configurado")
	case StatusDetected:
		return theme.StyleValueWarning.Render("⚙ Detectado")
	case StatusNotConfigured:
		return theme.StyleValueMuted.Render("- Inactivo")
	default:
		return string(s)
	}
}

// TargetInfo encapsulates information about a supported AI target.
type TargetInfo struct {
	ID          string
	DisplayName string
	Status      TargetStatusKind
	Evidence    string
}

// OpenSpecSummary captures project metadata, TDD configuration, and baseline stats.
type OpenSpecSummary struct {
	ProjectName    string
	Version        string
	Status         string
	TDDMode        string
	Runner         string
	Framework      string
	TestCommand    string
	UnitEnabled    bool
	IntEnabled     bool
	E2EEnabled     bool
	BaselineStatus string
	DomainsDone    int
	DomainsPending int
	RulesCount     int
}

// ModelProfileSummary captures the active preset and key tier model assignments.
type ModelProfileSummary struct {
	PresetName    string
	ClaudeModel   string
	VSCodeModel   string
	CodexModel    string
	OpenCodeModel string
	CursorModel   string
	AgentTiers    map[string]string
}

// QuickAction represents an interactive action button on the dashboard.
type QuickAction struct {
	Key         string
	Label       string
	Description string
}

// SwitchTabMsg instructs the parent AppModel to switch tabs.
type SwitchTabMsg struct {
	Tab int
}

// PresetChangedMsg notifies the parent AppModel that the model preset changed.
type PresetChangedMsg struct {
	Preset string
}
