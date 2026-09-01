package targets_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
	"github.com/muesli/termenv"
	"github.com/snakeblack/ospec-workflow/internal/system"
	"github.com/snakeblack/ospec-workflow/internal/tui/views/targets"
)

func init() {
	lipgloss.SetColorProfile(termenv.Ascii)
}

func setupTestWorkspace(t *testing.T) string {
	t.Helper()
	tempDir := t.TempDir()

	_ = os.WriteFile(filepath.Join(tempDir, ".claude-plugin"), []byte("{}"), 0644)
	_ = os.WriteFile(filepath.Join(tempDir, "AGENTS.md"), []byte("# Agents"), 0644)
	_ = os.MkdirAll(filepath.Join(tempDir, ".vscode"), 0755)
	_ = os.WriteFile(filepath.Join(tempDir, "codex.toml"), []byte(""), 0644)
	_ = os.WriteFile(filepath.Join(tempDir, "opencode.json"), []byte("{}"), 0644)
	_ = os.WriteFile(filepath.Join(tempDir, ".cursorrules"), []byte(""), 0644)

	return tempDir
}

func TestTargetsModel_Initialization(t *testing.T) {
	tempDir := setupTestWorkspace(t)
	model := targets.New(tempDir)

	if len(model.Targets()) != 6 {
		t.Fatalf("expected 6 targets, got %d", len(model.Targets()))
	}
	if model.SelectedIndex() != 0 {
		t.Errorf("initial SelectedIndex = %d, want 0", model.SelectedIndex())
	}
	if model.SelectedTarget() == nil || model.SelectedTarget().ID != "claude" {
		t.Errorf("initial SelectedTarget ID = %v, want 'claude'", model.SelectedTarget())
	}
	if cmd := model.Init(); cmd != nil {
		t.Errorf("Init() returned non-nil cmd: %v", cmd)
	}
}

func TestTargetsModel_KeyboardNavigation(t *testing.T) {
	tempDir := setupTestWorkspace(t)
	model := targets.New(tempDir)

	// Down / 'j' navigation
	m, _ := model.Update(tea.KeyMsg{Type: tea.KeyDown})
	model = m.(targets.Model)
	if model.SelectedIndex() != 1 {
		t.Errorf("SelectedIndex after KeyDown = %d, want 1", model.SelectedIndex())
	}
	if model.SelectedTarget().ID != "antigravity" {
		t.Errorf("SelectedTarget after KeyDown = %s, want antigravity", model.SelectedTarget().ID)
	}

	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("j")})
	model = m.(targets.Model)
	if model.SelectedIndex() != 2 {
		t.Errorf("SelectedIndex after 'j' = %d, want 2", model.SelectedIndex())
	}

	// Up / 'k' navigation
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyUp})
	model = m.(targets.Model)
	if model.SelectedIndex() != 1 {
		t.Errorf("SelectedIndex after KeyUp = %d, want 1", model.SelectedIndex())
	}

	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("k")})
	model = m.(targets.Model)
	if model.SelectedIndex() != 0 {
		t.Errorf("SelectedIndex after 'k' = %d, want 0", model.SelectedIndex())
	}

	// Boundary clamp on top
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyUp})
	model = m.(targets.Model)
	if model.SelectedIndex() != 0 {
		t.Errorf("SelectedIndex after top boundary KeyUp = %d, want 0", model.SelectedIndex())
	}

	// End / Home navigation
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnd})
	model = m.(targets.Model)
	if model.SelectedIndex() != 5 {
		t.Errorf("SelectedIndex after KeyEnd = %d, want 5", model.SelectedIndex())
	}

	// Boundary clamp on bottom
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyDown})
	model = m.(targets.Model)
	if model.SelectedIndex() != 5 {
		t.Errorf("SelectedIndex after bottom boundary KeyDown = %d, want 5", model.SelectedIndex())
	}

	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyHome})
	model = m.(targets.Model)
	if model.SelectedIndex() != 0 {
		t.Errorf("SelectedIndex after KeyHome = %d, want 0", model.SelectedIndex())
	}
}

func TestTargetsModel_DirectNumericJump(t *testing.T) {
	tempDir := setupTestWorkspace(t)
	model := targets.New(tempDir)

	numericTests := []struct {
		key     string
		wantIdx int
		wantID  string
	}{
		{"1", 0, "claude"},
		{"2", 1, "antigravity"},
		{"3", 2, "vscode"},
		{"4", 3, "codex"},
		{"5", 4, "opencode"},
		{"6", 5, "cursor"},
	}

	for _, tt := range numericTests {
		m, _ := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(tt.key)})
		model = m.(targets.Model)
		if model.SelectedIndex() != tt.wantIdx {
			t.Errorf("Key %q: got index %d, want %d", tt.key, model.SelectedIndex(), tt.wantIdx)
		}
		if model.SelectedTarget().ID != tt.wantID {
			t.Errorf("Key %q: got target ID %q, want %q", tt.key, model.SelectedTarget().ID, tt.wantID)
		}
	}
}

func TestTargetsModel_SyncTrigger(t *testing.T) {
	tempDir := t.TempDir()
	model := targets.New(tempDir)

	// Target 1: antigravity
	m, _ := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")})
	model = m.(targets.Model)
	if model.SelectedTarget().ID != "antigravity" {
		t.Fatalf("expected antigravity, got %s", model.SelectedTarget().ID)
	}

	// Press 's' to trigger sync
	m, cmd := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("s")})
	model = m.(targets.Model)
	if cmd == nil {
		t.Fatal("expected non-nil tea.Cmd on 's'")
	}

	// Execute command to receive TargetSyncedMsg
	msg := cmd()
	syncedMsg, ok := msg.(targets.TargetSyncedMsg)
	if !ok {
		t.Fatalf("expected TargetSyncedMsg, got %T: %v", msg, msg)
	}
	if !syncedMsg.Success {
		t.Errorf("sync failed: %s", syncedMsg.Message)
	}
	if syncedMsg.TargetID != "antigravity" {
		t.Errorf("synced target ID = %s, want antigravity", syncedMsg.TargetID)
	}

	// Pass message to update
	m, _ = model.Update(syncedMsg)
	model = m.(targets.Model)

	if !strings.Contains(model.StatusMessage(), "Antigravity") && !strings.Contains(model.StatusMessage(), "sincronizado") {
		t.Errorf("StatusMessage missing success feedback: %q", model.StatusMessage())
	}
	if model.SelectedTarget().Status != system.StatusConfigured {
		t.Errorf("antigravity status after sync update = %s, want Configured", model.SelectedTarget().Status)
	}

	// Press 'Enter' to sync another target (codex)
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("4")})
	model = m.(targets.Model)
	m, cmd = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	model = m.(targets.Model)
	if cmd == nil {
		t.Fatal("expected non-nil tea.Cmd on 'Enter'")
	}
	msg = cmd()
	syncedMsg, ok = msg.(targets.TargetSyncedMsg)
	if !ok || !syncedMsg.Success || syncedMsg.TargetID != "codex" {
		t.Errorf("expected successful codex TargetSyncedMsg, got: %+v", msg)
	}
}

func TestTargetsModel_SyncFailureHandling(t *testing.T) {
	// A file path causes sync error
	tempFile := filepath.Join(t.TempDir(), "not-a-dir")
	_ = os.WriteFile(tempFile, []byte("xyz"), 0644)

	model := targets.New(tempFile)
	_, cmd := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("s")})
	if cmd == nil {
		t.Fatal("expected non-nil cmd on sync")
	}

	msg := cmd()
	syncedMsg, ok := msg.(targets.TargetSyncedMsg)
	if !ok {
		t.Fatalf("expected TargetSyncedMsg, got %T", msg)
	}
	if syncedMsg.Success {
		t.Error("sync on invalid directory should report Success: false")
	}

	m, _ := model.Update(syncedMsg)
	model = m.(targets.Model)
	if !strings.Contains(model.StatusMessage(), "Error") && !strings.Contains(model.StatusMessage(), "✗") {
		t.Errorf("expected error toast in StatusMessage, got: %q", model.StatusMessage())
	}
}

func TestTargetsModel_ResponsiveSplitAndStacked(t *testing.T) {
	tempDir := setupTestWorkspace(t)
	model := targets.New(tempDir)

	// Wide screen: split layout (>= 96)
	model.SetSize(120, 30)
	viewWide := ansi.Strip(model.View())

	if !strings.Contains(viewWide, "TARGETS") || !strings.Contains(viewWide, "Claude Code") {
		t.Errorf("Wide view missing targets list: %s", viewWide)
	}
	if !strings.Contains(viewWide, "DIAGNÓSTICO") && !strings.Contains(viewWide, "DETALLE") && !strings.Contains(viewWide, "DIAGNOSTIC") {
		t.Errorf("Wide view missing detail section: %s", viewWide)
	}
	if !strings.Contains(viewWide, "Capacidades") && !strings.Contains(viewWide, "CAPACIDADES") {
		t.Errorf("Wide view missing capabilities: %s", viewWide)
	}

	// Narrow screen: stacked layout (< 96)
	model.SetSize(80, 30)
	viewNarrow := ansi.Strip(model.View())
	if !strings.Contains(viewNarrow, "Claude Code") {
		t.Errorf("Narrow view missing Claude Code: %s", viewNarrow)
	}

	// Extreme small dimensions: clamp safety (30x10)
	model.SetSize(30, 10)
	viewSmall := ansi.Strip(model.View())
	if viewSmall == "" {
		t.Error("Small view should render without panic or empty string")
	}
}

func TestTargetsModel_RefreshShortcut(t *testing.T) {
	tempDir := setupTestWorkspace(t)
	model := targets.New(tempDir)

	m, _ := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("r")})
	model = m.(targets.Model)
	if !strings.Contains(model.StatusMessage(), "actualizada") && !strings.Contains(model.StatusMessage(), "✓") {
		t.Errorf("expected refresh message, got %q", model.StatusMessage())
	}
}
