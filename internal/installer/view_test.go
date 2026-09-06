package installer

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func TestViewShowsVisibleFocusAndCompactHelp(t *testing.T) {
	m := NewModel(testPlan(
		Target{ID: "one", Label: "One", InstallDescription: "First", Agents: []Agent{selectableAgent("a")}},
		Target{ID: "two", Label: "Two", InstallDescription: "Second", Agents: []Agent{selectableAgent("b")}},
	))
	m = updateKey(t, m, "enter")
	view := m.View()
	for _, want := range []string{"› One", "↑/↓ mover", "Enter continuar", "Esc atrás"} {
		if !strings.Contains(view, want) {
			t.Fatalf("target view missing %q:\n%s", want, view)
		}
	}
}

func TestViewScrollsToKeepFocusedTargetVisible(t *testing.T) {
	m := NewModel(testPlan(
		Target{ID: "one", Label: "One"},
		Target{ID: "two", Label: "Two"},
		Target{ID: "three", Label: "Three"},
		Target{ID: "four", Label: "Four"},
	))
	m = updateKey(t, m, "enter")
	next, _ := m.Update(tea.WindowSizeMsg{Height: 11})
	m = next.(Model)
	for range 3 {
		m = updateKey(t, m, "down")
	}
	if got := m.View(); !strings.Contains(got, "› Four") {
		t.Fatalf("focused target must remain visible after scrolling:\n%s", got)
	}
}

func TestViewTruncatesLongChoiceAtTerminalWidth(t *testing.T) {
	m := NewModel(testPlan(Target{ID: "codex", Label: "Codex", Agents: []Agent{{
		ID: "architect", Selectable: true,
		Choices: []Choice{{ID: "tuple", Label: strings.Repeat("model-effort-verbosity ", 8)}},
	}}}))
	m = updateKey(t, m, "enter")
	m = updateKey(t, m, "enter")
	next, _ := m.Update(tea.WindowSizeMsg{Width: 80, Height: 16})
	m = next.(Model)
	view := m.View()
	if !strings.Contains(view, "←/→ modelo · Enter revisar") || !strings.Contains(view, "…") {
		t.Fatalf("narrow view must retain controls and truncate long choice:\n%s", view)
	}
}

func TestViewIdentifiesInheritedAgentInReview(t *testing.T) {
	m := NewModel(testPlan(Target{ID: "antigravity", Label: "Antigravity", Agents: []Agent{{ID: "architect", Inherited: true}}}))
	m = updateKey(t, m, "enter")
	m = updateKey(t, m, "enter")
	if m.screen != reviewScreen || !m.reviewBackFocused {
		t.Fatalf("inherited target state = (%v, back=%t), want review with Back focused", m.screen, m.reviewBackFocused)
	}
	if got := m.View(); !strings.Contains(got, "Heredado") {
		t.Fatalf("review does not identify inheritance:\n%s", got)
	}
}
