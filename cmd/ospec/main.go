package main

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/snakeblack/ospec-workflow/internal/tui"
)

func newProgram() *tea.Program {
	return tea.NewProgram(tui.NewAppModel(), tea.WithAltScreen())
}

func run(args []string) error {
	p := newProgram()
	_, err := p.Run()
	return err
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "ospec: error running TUI: %v\n", err)
		os.Exit(1)
	}
}
