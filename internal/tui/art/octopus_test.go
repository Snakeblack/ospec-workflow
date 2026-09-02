package art

import (
	"os"
	"strings"
	"testing"
)

func TestRenderOctopus_Color(t *testing.T) {
	os.Unsetenv("NO_COLOR")
	os.Unsetenv("TERM")

	rendered := RenderOctopus()
	if rendered == "" {
		t.Fatal("expected rendered octopus art to not be empty")
	}

	lines := strings.Split(rendered, "\n")
	if len(lines) < 4 {
		t.Errorf("expected at least 4 lines of art, got %d", len(lines))
	}
}

func TestRenderOctopus_NoColor(t *testing.T) {
	os.Setenv("NO_COLOR", "1")
	defer os.Unsetenv("NO_COLOR")

	if !IsNoColor() {
		t.Fatal("expected IsNoColor to be true when NO_COLOR=1")
	}

	rendered := RenderOctopus()
	if !strings.Contains(rendered, "o o") {
		t.Errorf("expected text fallback containing 'o o', got %q", rendered)
	}
}
