// Command ospec-install starts the guided installer interface.
package main

import (
	"context"
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/snakeblack/ospec-workflow/internal/installer"
)

func main() {
	ctx := context.Background()
	repoDir, err := os.Getwd()
	if err != nil {
		fmt.Fprintln(os.Stderr, "no se pudo determinar el directorio del repositorio:", err)
		os.Exit(1)
	}
	client := installer.NewClient(repoDir)
	plan, err := client.Plan(ctx)
	if err != nil {
		fmt.Fprintln(os.Stderr, "no se pudo cargar el plan de instalación:", err)
		os.Exit(1)
	}
	final, err := tea.NewProgram(installer.NewModel(plan)).Run()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	model, ok := final.(installer.Model)
	if !ok {
		fmt.Fprintln(os.Stderr, "el instalador terminó con un estado inesperado")
		os.Exit(1)
	}
	request, ok := model.InstallRequest()
	if !ok {
		return
	}
	code, err := client.Install(ctx, request, os.Stdout, os.Stderr)
	if err == nil {
		return
	}
	fmt.Fprintln(os.Stderr, err)
	if code > 0 {
		os.Exit(code)
	}
	os.Exit(1)
}
