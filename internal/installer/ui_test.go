package installer

import (
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func TestTeaUpdateQuitsForCancelOrExplicitInstall(t *testing.T) {
	cases := []struct {
		name  string
		model Model
		msg   tea.KeyMsg
	}{
		{name: "cancel", model: NewModel(testPlan()), msg: tea.KeyMsg{Type: tea.KeyCtrlC}},
		{name: "quit", model: NewModel(testPlan()), msg: tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'q'}}},
		{name: "install", model: modelAtReviewInstall(), msg: tea.KeyMsg{Type: tea.KeyEnter}},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			_, command := test.model.Update(test.msg)
			if command == nil {
				t.Fatal("Update() must quit for this action")
			}
		})
	}
}

func modelAtReviewInstall() Model {
	model := NewModel(testPlan(Target{ID: "claude", Agents: []Agent{selectableAgent("architect")}}))
	for _, key := range []string{"enter", "enter", "enter", "right"} {
		model.handleKey(key)
	}
	return model
}
