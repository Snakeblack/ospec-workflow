package theme_test

import (
	"strings"
	"testing"

	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

func TestThemePaletteColors(t *testing.T) {
	tests := []struct {
		name string
		got  lipgloss.TerminalColor
		want string
	}{
		{"ColorPrimary", theme.ColorPrimary, "#00D7D7"},
		{"ColorAccent", theme.ColorAccent, "#D75FD7"},
		{"ColorSuccess", theme.ColorSuccess, "#00AF87"},
		{"ColorWarning", theme.ColorWarning, "#FF8700"},
		{"ColorSubdued", theme.ColorSubdued, "#626262"},
		{"ColorBg", theme.ColorBg, "#1C1C1C"},
		{"ColorFg", theme.ColorFg, "#FFFFFF"},
		{"ColorFgMuted", theme.ColorFgMuted, "#8A8A8A"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if c, ok := tt.got.(lipgloss.Color); ok {
				if string(c) != tt.want {
					t.Errorf("%s = %s, want %s", tt.name, string(c), tt.want)
				}
			} else {
				t.Fatalf("%s is not lipgloss.Color", tt.name)
			}
		})
	}
}

func TestStyles(t *testing.T) {
	box := theme.StyleBox.Render("content")
	if !strings.Contains(box, "content") {
		t.Errorf("StyleBox render missing content: got %q", box)
	}

	active := theme.StyleActiveTab.Render("Active")
	if !strings.Contains(active, "Active") {
		t.Errorf("StyleActiveTab render missing text: got %q", active)
	}

	inactive := theme.StyleInactiveTab.Render("Inactive")
	if !strings.Contains(inactive, "Inactive") {
		t.Errorf("StyleInactiveTab render missing text: got %q", inactive)
	}
}

func TestRenderBadge(t *testing.T) {
	tests := []struct {
		name      string
		label     string
		val       string
		valStyle  lipgloss.Style
		wantLabel string
		wantVal   string
	}{
		{
			name:      "standard badge",
			label:     "branch",
			val:       "main",
			valStyle:  theme.StyleBadgeVal,
			wantLabel: "branch",
			wantVal:   "main",
		},
		{
			name:      "custom style badge",
			label:     "status",
			val:       "healthy",
			valStyle:  lipgloss.NewStyle().Foreground(theme.ColorSuccess),
			wantLabel: "status",
			wantVal:   "healthy",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rendered := theme.RenderBadge(tt.label, tt.val, tt.valStyle)
			if !strings.Contains(rendered, tt.wantLabel) {
				t.Errorf("RenderBadge() missing label %q, got: %q", tt.wantLabel, rendered)
			}
			if !strings.Contains(rendered, tt.wantVal) {
				t.Errorf("RenderBadge() missing value %q, got: %q", tt.wantVal, rendered)
			}
		})
	}
}

func TestRenderTabBar(t *testing.T) {
	for activeIdx := 0; activeIdx < 4; activeIdx++ {
		rendered := theme.RenderTabBar(activeIdx, 80)

		expectedTabs := []string{"Dashboard", "Models Hub", "Targets Manager", "System Doctor"}
		for _, tabName := range expectedTabs {
			if !strings.Contains(rendered, tabName) {
				t.Errorf("RenderTabBar(%d) missing tab %q, got: %q", activeIdx, tabName, rendered)
			}
		}
	}

	// Boundary test: out of range active tab
	rendered := theme.RenderTabBar(-1, 80)
	if !strings.Contains(rendered, "Dashboard") {
		t.Errorf("RenderTabBar(-1) missing Dashboard, got: %q", rendered)
	}
}

func TestRenderFooter(t *testing.T) {
	footer := theme.RenderFooter(0, 80)
	expectedHints := []string{"Tab", "Quit", "1-4"}
	for _, hint := range expectedHints {
		if !strings.Contains(footer, hint) {
			t.Errorf("RenderFooter() missing hint %q, got: %q", hint, footer)
		}
	}

	// Zero width
	footerZero := theme.RenderFooter(0, 0)
	if !strings.Contains(footerZero, "Tab") {
		t.Errorf("RenderFooter(0, 0) missing hint Tab, got: %q", footerZero)
	}
}
