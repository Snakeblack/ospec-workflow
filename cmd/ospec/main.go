package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/snakeblack/ospec-workflow/internal/system"
	"github.com/snakeblack/ospec-workflow/internal/tui"
)

func newProgram() *tea.Program {
	return tea.NewProgram(tui.NewAppModel(), tea.WithAltScreen(), tea.WithMouseCellMotion())
}

func newQAProgram(sourceRoot, sandbox string) *tea.Program {
	app := tui.NewAppModelWithOptions(tui.AppOptions{
		RepoRoot:   sandbox,
		SourceRoot: sourceRoot,
		QAMode:     true,
	})
	return tea.NewProgram(app, tea.WithAltScreen(), tea.WithMouseCellMotion())
}

func usage() string {
	return strings.TrimSpace(`
ospec — instalador y configurador de modelos

  ospec              TUI real (puede instalar y escribir models.yaml)
  ospec --qa         TUI de prueba: logs/checks, no instala ni registra clientes
  ospec --qa --check Informe de coherencia en consola (sin TUI, sin escrituras)
`) + "\n"
}

func run(args []string) error {
	qa := false
	check := false
	for _, a := range args {
		switch a {
		case "--qa":
			qa = true
		case "--check":
			check = true
		case "-h", "--help":
			fmt.Fprint(os.Stdout, usage())
			return nil
		default:
			return fmt.Errorf("flag desconocida %q\n%s", a, usage())
		}
	}

	if qa && check {
		source, err := system.FindSourceRoot(".")
		if err != nil {
			return err
		}
		rep, err := tui.RunQAChecks(source)
		if err != nil {
			return err
		}
		fmt.Fprint(os.Stdout, rep.String())
		if rep.Failed > 0 {
			return fmt.Errorf("QA: %d comprobaciones fallidas", rep.Failed)
		}
		return nil
	}

	if qa {
		source, err := system.FindSourceRoot(".")
		if err != nil {
			return err
		}
		sandbox, err := os.MkdirTemp("", "ospec-qa-ui-")
		if err != nil {
			return err
		}
		if err := seedQASandbox(source, sandbox); err != nil {
			return err
		}
		fmt.Fprintf(os.Stderr, "ospec QA dry-run\n  fuente: %s\n  sandbox: %s\n  las instalaciones solo generan logs; models.yaml real no se toca\n", source, sandbox)
		p := newQAProgram(source, sandbox)
		_, err = p.Run()
		return err
	}

	p := newProgram()
	_, err := p.Run()
	return err
}

func seedQASandbox(source, dest string) error {
	src := filepath.Join(source, "models.yaml")
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dest, "models.yaml"), data, 0644); err != nil {
		return err
	}
	cfg := filepath.Join(source, "openspec", "config.yaml")
	if raw, err := os.ReadFile(cfg); err == nil {
		if err := os.MkdirAll(filepath.Join(dest, "openspec"), 0755); err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dest, "openspec", "config.yaml"), raw, 0644); err != nil {
			return err
		}
	}
	return nil
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "ospec: %v\n", err)
		os.Exit(1)
	}
}
