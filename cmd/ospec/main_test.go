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

func TestRunHelp(t *testing.T) {
	if err := run([]string{"--help"}); err != nil {
		t.Fatal(err)
	}
}

func TestRunQACheckDoesNotInstall(t *testing.T) {
	if err := run([]string{"--qa", "--check"}); err != nil {
		t.Fatal(err)
	}
}
