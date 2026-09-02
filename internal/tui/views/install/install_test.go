package install_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/snakeblack/ospec-workflow/internal/config"
	"github.com/snakeblack/ospec-workflow/internal/system"
	"github.com/snakeblack/ospec-workflow/internal/tui/views/install"
)

func newTestInstaller(t *testing.T, runner install.InstallRunner) install.Model {
	t.Helper()
	tempDir := t.TempDir()
	body := []byte(`agents:
  _default: default
  sdd-apply: default
tiers:
  default:
    claude: sonnet
    antigravity: flash
    codex:
      model: gpt-5.6-terra
`)
	if err := os.WriteFile(filepath.Join(tempDir, "models.yaml"), body, 0644); err != nil {
		t.Fatal(err)
	}
	mm := config.NewModelsManager(tempDir)
	return install.NewWithRunner(tempDir, mm, runner)
}

func enterUntil(t *testing.T, m install.Model, want install.InstallStep, max int) install.Model {
	t.Helper()
	for i := 0; i < max; i++ {
		if m.Step() == want {
			return m
		}
		updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
		m = updated.(install.Model)
	}
	t.Fatalf("did not reach step %v, last=%v", want, m.Step())
	return m
}

func TestInstallerModel_NavigationFlow(t *testing.T) {
	m := newTestInstaller(t, func(context.Context, string, []string, func(system.InstallEvent)) error {
		return nil
	})
	if m.Step() != install.StepTargets {
		t.Errorf("initial step = %v, want StepTargets", m.Step())
	}

	view := m.View()
	if !strings.Contains(view, "Detectados") && !strings.Contains(view, "No detectados") {
		t.Errorf("targets view missing groups:\n%s", view)
	}

	m.ClearTargetSelection()
	mUpdated, _ := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	m = mUpdated.(install.Model)
	if m.Step() != install.StepAgents {
		t.Fatalf("Enter with no marks should select focused and go to agents, got %v", m.Step())
	}
	if len(m.SelectedTargets()) != 1 {
		t.Fatalf("selected = %v, want 1 focused client", m.SelectedTargets())
	}

	m = enterUntil(t, m, install.StepReview, 8)
	mUpdated, _ = m.Update(tea.KeyMsg{Type: tea.KeyEsc})
	m = mUpdated.(install.Model)
	if m.Step() != install.StepAgents {
		t.Errorf("Esc from review = %v, want StepAgents", m.Step())
	}

	mUpdated, _ = m.Update(tea.KeyMsg{Type: tea.KeyEsc})
	m = mUpdated.(install.Model)
	if m.Step() != install.StepTargets {
		t.Errorf("Esc from first agent screen = %v, want StepTargets", m.Step())
	}

	mUpdated, _ = m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	m = mUpdated.(install.Model)
	m = enterUntil(t, m, install.StepReview, 8)

	mUpdated, cmd := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	m = mUpdated.(install.Model)
	if m.Step() != install.StepProgress {
		t.Fatalf("step after confirm = %v, want StepProgress", m.Step())
	}
	if cmd == nil {
		t.Fatal("expected install command on review confirmation")
	}

	done := make(chan tea.Msg, 1)
	go func() {
		done <- cmd()
	}()
	var msg tea.Msg
	select {
	case msg = <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("install command timed out")
	}

	for i := 0; i < 8; i++ {
		mUpdated, follow := m.Update(msg)
		m = mUpdated.(install.Model)
		if m.Step() == install.StepDone {
			break
		}
		if follow == nil {
			break
		}
		msg = follow()
	}
	if m.Step() != install.StepDone {
		t.Errorf("step after install completion = %v, want StepDone", m.Step())
	}

	view = m.View()
	if view == "" {
		t.Error("rendered view is empty")
	}
	if !strings.Contains(view, "Listo") && !strings.Contains(view, "INSTAL") {
		t.Errorf("done view missing completion copy:\n%s", view)
	}
}

func TestInstallerEnterSelectsFocusedWhenEmpty(t *testing.T) {
	m := newTestInstaller(t, func(context.Context, string, []string, func(system.InstallEvent)) error {
		return nil
	})
	m.ClearTargetSelection()
	if len(m.SelectedTargets()) != 0 {
		t.Fatal("expected empty selection")
	}
	mUpdated, _ := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	m = mUpdated.(install.Model)
	if m.Step() != install.StepAgents {
		t.Fatalf("step = %v, want StepAgents", m.Step())
	}
	if len(m.SelectedTargets()) != 1 {
		t.Fatalf("selected %v, want exactly the focused client", m.SelectedTargets())
	}
}

func TestInstallerSpaceTogglesThenEnter(t *testing.T) {
	m := newTestInstaller(t, func(context.Context, string, []string, func(system.InstallEvent)) error {
		return nil
	})
	m.ClearTargetSelection()
	mUpdated, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{' '}})
	m = mUpdated.(install.Model)
	if len(m.SelectedTargets()) != 1 {
		t.Fatalf("space should mark focused, got %v", m.SelectedTargets())
	}
	mUpdated, _ = m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	m = mUpdated.(install.Model)
	if m.Step() != install.StepAgents {
		t.Fatalf("step = %v, want StepAgents", m.Step())
	}
}
