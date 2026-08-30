package main

import (
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/snakeblack/ospec-workflow/internal/tui"
)

func TestNewAppProgram(t *testing.T) {
	p := newProgram()
	if p == nil {
		t.Fatal("newProgram returned nil")
	}
}

func TestAppModelSetup(t *testing.T) {
	model := tui.NewAppModel()
	p := tea.NewProgram(model, tea.WithAltScreen())
	if p == nil {
		t.Fatal("tea.NewProgram returned nil")
	}
}
