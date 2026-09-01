package targets

import (
	"github.com/snakeblack/ospec-workflow/internal/system"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

// TargetSelectedMsg is dispatched when the user changes the highlighted target.
type TargetSelectedMsg struct {
	TargetID string
}

// TargetSyncedMsg is dispatched upon completion of target synchronization.
type TargetSyncedMsg struct {
	TargetID string
	Success  bool
	Message  string
}

// StatusBadge returns a styled Lip Gloss badge representation for target status.
func StatusBadge(status system.TargetStatusKind) string {
	switch status {
	case system.StatusActive:
		return theme.StyleValueAccent.Render("● Activo")
	case system.StatusConfigured:
		return theme.StyleValueSuccess.Render("✓ Configurado")
	case system.StatusDetected:
		return theme.StyleValueWarning.Render("⚙ Detectado")
	case system.StatusInactive:
		return theme.StyleValueMuted.Render("- Inactivo")
	default:
		return string(status)
	}
}
