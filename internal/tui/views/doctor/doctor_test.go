package doctor

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/snakeblack/ospec-workflow/internal/system"
)

func TestDoctorModel_InitAndNavigation(t *testing.T) {
	tempDir := t.TempDir()
	model := New(tempDir)

	if len(model.Report().Checks) == 0 {
		t.Fatalf("Expected diagnostic checks to be loaded, got 0")
	}

	if model.SelectedIndex() != 0 {
		t.Errorf("Expected initial selectedIndex = 0, got %d", model.SelectedIndex())
	}

	firstCheck := model.SelectedCheck()
	if firstCheck == nil {
		t.Fatalf("Expected non-nil SelectedCheck()")
	}

	// Test Down key
	updated, _ := model.Update(tea.KeyMsg{Type: tea.KeyDown})
	m := updated.(Model)
	if m.SelectedIndex() != 1 {
		t.Errorf("Expected selectedIndex = 1 after KeyDown, got %d", m.SelectedIndex())
	}

	// Test Up key
	updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyUp})
	m = updated.(Model)
	if m.SelectedIndex() != 0 {
		t.Errorf("Expected selectedIndex = 0 after KeyUp, got %d", m.SelectedIndex())
	}

	// Test vim keys 'j' and 'k'
	updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
	m = updated.(Model)
	if m.SelectedIndex() != 1 {
		t.Errorf("Expected selectedIndex = 1 after 'j', got %d", m.SelectedIndex())
	}

	updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'k'}})
	m = updated.(Model)
	if m.SelectedIndex() != 0 {
		t.Errorf("Expected selectedIndex = 0 after 'k', got %d", m.SelectedIndex())
	}

	// Test direct numeric jump '3'
	updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'3'}})
	m = updated.(Model)
	if m.SelectedIndex() != 2 {
		t.Errorf("Expected selectedIndex = 2 after pressing '3', got %d", m.SelectedIndex())
	}

	// Test End and Home keys
	updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyEnd})
	m = updated.(Model)
	expectedLast := len(m.Report().Checks) - 1
	if m.SelectedIndex() != expectedLast {
		t.Errorf("Expected selectedIndex = %d after KeyEnd, got %d", expectedLast, m.SelectedIndex())
	}

	updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyHome})
	m = updated.(Model)
	if m.SelectedIndex() != 0 {
		t.Errorf("Expected selectedIndex = 0 after KeyHome, got %d", m.SelectedIndex())
	}
}

func TestDoctorModel_BoundsClamping(t *testing.T) {
	tempDir := t.TempDir()
	model := New(tempDir)

	// Press Up at top -> should stay at 0
	updated, _ := model.Update(tea.KeyMsg{Type: tea.KeyUp})
	m := updated.(Model)
	if m.SelectedIndex() != 0 {
		t.Errorf("Expected index clamped to 0, got %d", m.SelectedIndex())
	}

	// Jump beyond bounds
	updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'9'}})
	m = updated.(Model)
	expectedMax := len(m.Report().Checks) - 1
	if m.SelectedIndex() > expectedMax {
		t.Errorf("Expected index <= %d, got %d", expectedMax, m.SelectedIndex())
	}
}

func TestDoctorModel_RefreshAndScan(t *testing.T) {
	tempDir := t.TempDir()
	model := New(tempDir)

	// Press 'r' to trigger scan
	updated, cmd := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'r'}})
	m := updated.(Model)
	if cmd == nil {
		t.Errorf("Expected tea.Cmd on 'r' re-scan, got nil")
	}

	// Simulate DoctorRefreshedMsg
	newReport := system.DoctorReport{
		RepoRoot:    tempDir,
		TotalPassed: 6,
		Checks: []system.DoctorCheck{
			{
				ID:          "mock-check",
				Name:        "Mock Check",
				Severity:    system.SeverityOK,
				Message:     "All good",
				Details:     "Mock details",
				Remediation: "None",
			},
		},
	}
	updated, _ = m.Update(DoctorRefreshedMsg{Report: newReport})
	m = updated.(Model)

	if len(m.Report().Checks) != 1 {
		t.Errorf("Expected 1 check after refresh, got %d", len(m.Report().Checks))
	}
	if !strings.Contains(m.StatusMessage(), "actualizado") && !strings.Contains(m.StatusMessage(), "✓") {
		t.Errorf("Expected status message feedback, got %q", m.StatusMessage())
	}
}

func TestDoctorModel_ViewRendering(t *testing.T) {
	tempDir := t.TempDir()
	model := New(tempDir)

	// Wide viewport (side-by-side split)
	model.SetSize(120, 35)
	viewWide := model.View()
	if !strings.Contains(viewWide, "CHEQUEOS DEL SISTEMA") {
		t.Errorf("View missing 'CHEQUEOS DEL SISTEMA' header")
	}
	if !strings.Contains(viewWide, "DIAGNÓSTICO") {
		t.Errorf("View missing 'DIAGNÓSTICO' panel")
	}
	if !strings.Contains(strings.ToLower(viewWide), "remediación") {
		t.Errorf("View missing 'remediación' section")
	}

	// Compact viewport (vertical stacked)
	model.SetSize(80, 25)
	viewCompact := model.View()
	if !strings.Contains(viewCompact, "CHEQUEOS DEL SISTEMA") {
		t.Errorf("Compact view missing 'CHEQUEOS DEL SISTEMA'")
	}
}
