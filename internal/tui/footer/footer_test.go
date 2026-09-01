package footer_test

import (
	"strings"
	"testing"

	"github.com/snakeblack/ospec-workflow/internal/tui/footer"
)

func TestRenderContextualFooter(t *testing.T) {
	tests := []struct {
		name      string
		tab       int
		width     int
		mustHave  []string
	}{
		{
			name:     "Dashboard tab normal width",
			tab:      0,
			width:    100,
			mustHave: []string{"1-4/Tab", "Switch Tab", "?", "Help", "q", "Quit"},
		},
		{
			name:     "Models Hub tab normal width",
			tab:      1,
			width:    100,
			mustHave: []string{"1-4/Tab", "↑/↓", "Navigate", "1-3", "Preset", "Enter", "Apply", "?", "Help", "q", "Quit"},
		},
		{
			name:     "Targets Manager tab normal width",
			tab:      2,
			width:    100,
			mustHave: []string{"1-4/Tab", "↑/↓", "Select", "s", "Sync All", "r", "Reload", "?", "Help", "q", "Quit"},
		},
		{
			name:     "System Doctor tab normal width",
			tab:      3,
			width:    100,
			mustHave: []string{"1-4/Tab", "↑/↓", "Select", "r/Enter", "Re-scan", "?", "Help", "q", "Quit"},
		},
		{
			name:     "Unknown tab fallback",
			tab:      99,
			width:    100,
			mustHave: []string{"1-4/Tab", "Switch Tab", "?", "Help", "q", "Quit"},
		},
		{
			name:     "Narrow viewport compact rendering",
			tab:      1,
			width:    60,
			mustHave: []string{"1-4", "1-3", "Enter", "?", "q"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out := footer.RenderContextualFooter(tt.tab, tt.width)
			if out == "" {
				t.Fatalf("RenderContextualFooter returned empty string for tab %d, width %d", tt.tab, tt.width)
			}
			for _, expected := range tt.mustHave {
				if !strings.Contains(out, expected) {
					t.Errorf("RenderContextualFooter(tab=%d, width=%d) expected to contain %q, but got:\n%s", tt.tab, tt.width, expected, out)
				}
			}
		})
	}
}

func TestRenderHelpModal(t *testing.T) {
	out := footer.RenderHelpModal(100, 30)
	if out == "" {
		t.Fatal("RenderHelpModal returned empty string")
	}

	expectedSections := []string{
		"Help & Keybindings",
		"Global Navigation",
		"Dashboard",
		"Models Hub",
		"Targets Manager",
		"System Doctor",
		"Esc",
		"Close",
	}

	for _, exp := range expectedSections {
		if !strings.Contains(out, exp) {
			t.Errorf("RenderHelpModal expected to contain %q, but got:\n%s", exp, out)
		}
	}
}

func TestRenderHelpModalSmallViewport(t *testing.T) {
	out := footer.RenderHelpModal(40, 10)
	if out == "" {
		t.Fatal("RenderHelpModal with small dimensions returned empty string")
	}
	if !strings.Contains(out, "Help") {
		t.Errorf("expected 'Help' in output, got:\n%s", out)
	}
}
