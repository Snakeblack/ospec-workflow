package installer

import (
	"fmt"
	"github.com/charmbracelet/lipgloss"
	"strings"
	"testing"
)

func TestReviewShowsModeAndInheritance(t *testing.T) {
	m := NewModel(Plan{Version: 2, Targets: []Target{{ID: "antigravity", Label: "Antigravity", Inherited: true, Agents: []Agent{{ID: "a", Inherited: true}}}}})
	m.handleKey("enter")
	m.handleKey("enter")
	view := m.View()
	if !strings.Contains(view, "inherited") || !strings.Contains(view, "Heredado") {
		t.Fatalf("review=%s", view)
	}
}

func TestControlsViewUsesVerticalNavigationForTheActiveEffort(t *testing.T) {
	control := Control{Values: []string{"low", "high"}, Default: "high"}
	plan := Plan{Version: 2, Targets: []Target{{
		ID:      "codex",
		Agents:  []Agent{{ID: "apply", Selectable: true, Choices: []Choice{{ID: "model", Label: "Model", Controls: map[string]Control{"model_reasoning_effort": control}}}}},
		Presets: []Preset{{ID: "recommended", Selections: map[string]Selection{"apply": {ChoiceID: "model", Controls: map[string]string{}}}}},
	}}}
	m := NewModel(plan)
	for _, key := range []string{"enter", "enter", "down", "enter", "enter"} {
		m.handleKey(key)
	}
	if m.screen != controlsScreen {
		t.Fatalf("screen = %v, want controls", m.screen)
	}
	if view := m.View(); !strings.Contains(view, "› high") {
		t.Fatalf("initial control lacks active indicator:\n%s", view)
	}
	m.handleKey("down")
	if view := m.View(); !strings.Contains(view, "› low") || strings.Contains(view, "› high") {
		t.Fatalf("keyboard selection lacks active indicator:\n%s", view)
	}
	m.handleKey("up")
	if view := m.View(); !strings.Contains(view, "› high") || strings.Contains(view, "› low") {
		t.Fatalf("up navigation lacks active indicator:\n%s", view)
	}
	m.handleKey("j")
	if view := m.View(); !strings.Contains(view, "› low") || strings.Contains(view, "› high") {
		t.Fatalf("vim down navigation lacks active indicator:\n%s", view)
	}
	m.handleKey("k")
	if view := m.View(); !strings.Contains(view, "› high") || strings.Contains(view, "› low") {
		t.Fatalf("vim vertical navigation lacks active indicator:\n%s", view)
	}
	for _, key := range []string{"left", "right", "h", "l"} {
		m.handleKey(key)
		if view := m.View(); !strings.Contains(view, "› high") || strings.Contains(view, "› low") {
			t.Fatalf("%s navigation must not contradict the vertical list:\n%s", key, view)
		}
	}
}

func TestNarrowViewsRetainFocusAndFitTerminal(t *testing.T) {
	targets := make([]Target, 20)
	for i := range targets {
		targets[i] = Target{ID: fmt.Sprint(i), Label: fmt.Sprintf("Destino %02d", i), InstallDescription: strings.Repeat("Descripción extensa ", 8)}
	}
	m := NewModel(Plan{Version: 2, Targets: targets})
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

func TestNarrowModelsKeepSelectionDetailsAndHelpVisible(t *testing.T) {
	agents := make([]Agent, 20)
	for i := range agents {
		agents[i] = Agent{ID: fmt.Sprintf("sdd-long-phase-%02d", i), Selectable: true, Choices: []Choice{{ID: "m", Label: "Modelo elegido"}}}
	}
	m := NewModel(Plan{Version: 2, Targets: []Target{{ID: "test", Agents: agents}}})
	m.screen, m.agentIndex, m.width, m.height = modelsScreen, 19, 24, 16
	m.queries["test"][agents[19].ID] = "elegido"
	view := m.View()
	for _, want := range []string{"› sdd-long-phase-19", "Modelo elegido", "buscar: elegido", "Ctrl+C salir"} {
		if !strings.Contains(view, want) {
			t.Fatalf("missing %q:\n%s", want, view)
		}
	}
	if len(strings.Split(strings.TrimSuffix(view, "\n"), "\n")) > m.height {
		t.Fatalf("view exceeds height:\n%s", view)
	}
}
