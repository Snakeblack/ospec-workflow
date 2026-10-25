package installer

import (
	"fmt"
	"strings"
	"testing"

	"github.com/charmbracelet/lipgloss"
)

func TestReviewShowsInheritance(t *testing.T) {
	m := NewModel(Plan{Version: 3, Targets: []Target{{ID: "antigravity", Label: "Antigravity", Inherited: true}}})
	m.handleKey("enter")
	m.handleKey("enter")
	if view := m.View(); !strings.Contains(view, "Heredado del host") {
		t.Fatalf("review=%s", view)
	}
}

func TestModelsViewSaysWhatAnEmptyTierDoes(t *testing.T) {
	plan := Plan{Version: 3, ModelsFile: "/home/u/.config/ospec/models.yaml", Warning: "se ignora el fichero", Targets: []Target{
		{ID: "codex", Label: "Codex", Tiers: tiers(map[string]string{"cheap": "gpt-luna"}, nil)},
		{ID: "claude", Label: "Claude", Tiers: tiers(nil, map[string]string{"premium": "opus", "default": "sonnet", "cheap": "haiku"})},
	}}
	m := NewModel(plan)
	m.handleKey("enter")
	m.handleKey("enter")
	view := m.View()
	for _, want := range []string{"hereda el modelo de la sesión", "gpt-luna", "1 agente", "Se guarda en /home/u/.config/ospec/models.yaml", "aviso: se ignora el fichero"} {
		if !strings.Contains(view, want) {
			t.Fatalf("missing %q:\n%s", want, view)
		}
	}
	m.back()
	m.handleKey("down")
	m.handleKey("enter")
	if view := m.View(); !strings.Contains(view, "opus (alias por defecto)") {
		t.Fatalf("claude fallback missing:\n%s", view)
	}
}

func TestReviewListsTheEffectiveModelOfEachTier(t *testing.T) {
	plan := Plan{Version: 3, Targets: []Target{{ID: "claude", Label: "Claude", Tiers: tiers(map[string]string{"premium": "fable"}, map[string]string{"premium": "opus", "default": "sonnet", "cheap": "haiku"})}}}
	m := NewModel(plan)
	for _, key := range []string{"enter", "enter", "enter"} {
		m.handleKey(key)
	}
	view := m.View()
	for _, want := range []string{"premium  fable", "default  sonnet (alias por defecto)", "cheap    haiku (alias por defecto)"} {
		if !strings.Contains(view, want) {
			t.Fatalf("missing %q:\n%s", want, view)
		}
	}
}

func TestNarrowViewsRetainFocusAndFitTerminal(t *testing.T) {
	targets := make([]Target, 20)
	for i := range targets {
		targets[i] = Target{ID: fmt.Sprint(i), Label: fmt.Sprintf("Destino %02d", i), InstallDescription: strings.Repeat("Descripción extensa ", 8)}
	}
	m := NewModel(Plan{Version: 3, Targets: targets})
	m.screen, m.targetIndex, m.width, m.height = targetsScreen, 19, 36, 16
	view := m.View()
	if !strings.Contains(view, "› Destino 19") {
		t.Fatalf("focus missing:\n%s", view)
	}
	for _, line := range strings.Split(view, "\n") {
		if lipgloss.Width(line) > m.width {
			t.Fatalf("line exceeds %d columns: %s", m.width, line)
		}
	}
	if len(strings.Split(strings.TrimSuffix(view, "\n"), "\n")) > m.height {
		t.Fatalf("view exceeds height:\n%s", view)
	}
}

func TestNarrowModelsKeepFocusAndHelpVisible(t *testing.T) {
	m := NewModel(Plan{Version: 3, Targets: []Target{{ID: "codex", Label: "Codex", Tiers: tiers(nil, nil)}}})
	m.screen, m.tierIndex, m.width, m.height = modelsScreen, 2, 30, 20
	view := m.View()
	for _, want := range []string{"› cheap", "Ctrl+C salir"} {
		if !strings.Contains(view, want) {
			t.Fatalf("missing %q:\n%s", want, view)
		}
	}
	for _, line := range strings.Split(view, "\n") {
		if lipgloss.Width(line) > m.width {
			t.Fatalf("line exceeds %d columns: %s", m.width, line)
		}
	}
	if len(strings.Split(strings.TrimSuffix(view, "\n"), "\n")) > m.height {
		t.Fatalf("view exceeds height:\n%s", view)
	}
}

func TestReviewListsOptionalPackagesWithTheirKeys(t *testing.T) {
	plan := Plan{Version: 3, Packages: []Package{{ID: "sdd", Label: "Modo SDD", Description: "Fases SDD"}}, Targets: []Target{{ID: "antigravity", Label: "Antigravity", Inherited: true}}}
	m := NewModel(plan)
	m.handleKey("enter")
	m.handleKey("enter")
	if view := m.View(); !strings.Contains(view, "[ ] 1 Modo SDD") {
		t.Fatalf("review=%s", view)
	}
	m.handleKey("1")
	if view := m.View(); !strings.Contains(view, "[x] 1 Modo SDD") {
		t.Fatalf("review=%s", view)
	}
}
