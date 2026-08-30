package header_test

import (
	"flag"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
	"github.com/muesli/termenv"
	"github.com/snakeblack/ospec-workflow/internal/tui/header"
)

var update = flag.Bool("update", false, "update golden files")

func assertGolden(t *testing.T, goldenPath, got string) {
	t.Helper()
	if *update {
		_ = os.MkdirAll(filepath.Dir(goldenPath), 0o755)
		if err := os.WriteFile(goldenPath, []byte(got), 0o644); err != nil {
			t.Fatalf("failed to update golden file: %v", err)
		}
	}
	want, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("failed to read golden file %s: %v", goldenPath, err)
	}
	if got != string(want) {
		t.Fatalf("golden mismatch for %s\ngot:\n%s\nwant:\n%s", goldenPath, got, string(want))
	}
}

func init() {
	lipgloss.SetColorProfile(termenv.Ascii)
}

func TestHeaderStandardWidth(t *testing.T) {
	h := header.New("v2.56.0", "Default", "main")
	h.SetWidth(100)

	view := h.View()
	plainView := ansi.Strip(view)

	if !strings.Contains(plainView, "v2.56.0") {
		t.Errorf("Header view missing version, got: %q", plainView)
	}
	if !strings.Contains(plainView, "Default") {
		t.Errorf("Header view missing preset, got: %q", plainView)
	}
	if !strings.Contains(plainView, "main") {
		t.Errorf("Header view missing branch, got: %q", plainView)
	}

	assertGolden(t, "testdata/header_standard.golden", plainView)
}

func TestHeaderCompactWidth(t *testing.T) {
	h := header.New("v2.56.0", "Default", "main")
	h.SetWidth(60)

	view := h.View()
	plainView := ansi.Strip(view)

	if !strings.Contains(plainView, "v2.56.0") {
		t.Errorf("Compact header view missing version, got: %q", plainView)
	}
	if !strings.Contains(plainView, "OSPEC") {
		t.Errorf("Compact header view missing title OSPEC, got: %q", plainView)
	}

	assertGolden(t, "testdata/header_compact.golden", plainView)
}

func TestHeaderWidthThreshold(t *testing.T) {
	h := header.New("v2.56.0", "Default", "main")

	// Width 79: should be compact (single line banner)
	h.SetWidth(79)
	compactBanner := ansi.Strip(h.RenderBanner())
	if compactBanner != "OSPEC" {
		t.Errorf("Width 79 RenderBanner() = %q, want 'OSPEC'", compactBanner)
	}

	// Width 80: should be full multi-line banner
	h.SetWidth(80)
	standardBanner := ansi.Strip(h.RenderBanner())
	if !strings.Contains(standardBanner, "\n") {
		t.Errorf("Width 80 RenderBanner() should be multi-line, got: %q", standardBanner)
	}
}

func TestHeaderSetWidth(t *testing.T) {
	h := header.New("v2.56.0", "Default", "main")
	h.SetWidth(120)
	if h.Width() != 120 {
		t.Errorf("Width() = %d, want 120", h.Width())
	}

	h.SetWidth(50)
	if h.Width() != 50 {
		t.Errorf("Width() = %d, want 50", h.Width())
	}
}

func TestHeaderBadges(t *testing.T) {
	h := header.New("v1.0.0", "CustomPreset", "feat/my-branch")
	badges := ansi.Strip(h.RenderBadges())

	if !strings.Contains(badges, "v1.0.0") {
		t.Errorf("RenderBadges() missing version: %q", badges)
	}
	if !strings.Contains(badges, "CustomPreset") {
		t.Errorf("RenderBadges() missing preset: %q", badges)
	}
	if !strings.Contains(badges, "feat/my-branch") {
		t.Errorf("RenderBadges() missing branch: %q", badges)
	}
}
