package system_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/snakeblack/ospec-workflow/internal/system"
)

func TestInspectTargets_EmptyWorkspace(t *testing.T) {
	tempDir := t.TempDir()

	targets := system.InspectTargets(tempDir)
	if len(targets) != 6 {
		t.Fatalf("expected 6 targets, got %d", len(targets))
	}

	expectedIDs := []string{"claude", "antigravity", "vscode", "codex", "opencode", "cursor"}
	for i, id := range expectedIDs {
		target := targets[i]
		if target.ID != id {
			t.Errorf("target[%d] ID = %q, want %q", i, target.ID, id)
		}
		if target.Status != system.StatusInactive {
			t.Errorf("target %q status = %q, want %q", id, target.Status, system.StatusInactive)
		}
		if target.DisplayName == "" {
			t.Errorf("target %q display name is empty", id)
		}
		if len(target.ConfigFiles) == 0 {
			t.Errorf("target %q has no config file checks", id)
		}
		for _, cf := range target.ConfigFiles {
			if cf.Exists {
				t.Errorf("target %q config file %q marked as exists in empty dir", id, cf.Path)
			}
		}
	}
}

func TestInspectTargets_ConfiguredWorkspace(t *testing.T) {
	tempDir := t.TempDir()

	// Create claude and antigravity files
	_ = os.WriteFile(filepath.Join(tempDir, ".claude-plugin"), []byte("{}"), 0644)
	_ = os.WriteFile(filepath.Join(tempDir, "AGENTS.md"), []byte("# Agents"), 0644)
	_ = os.MkdirAll(filepath.Join(tempDir, ".vscode"), 0755)
	_ = os.WriteFile(filepath.Join(tempDir, "codex.toml"), []byte(""), 0644)
	_ = os.WriteFile(filepath.Join(tempDir, "opencode.json"), []byte("{}"), 0644)
	_ = os.WriteFile(filepath.Join(tempDir, ".cursorrules"), []byte(""), 0644)

	targets := system.InspectTargets(tempDir)
	if len(targets) != 6 {
		t.Fatalf("expected 6 targets, got %d", len(targets))
	}

	for _, target := range targets {
		if target.Status != system.StatusConfigured {
			t.Errorf("target %q status = %q, want %q (evidence: %s)", target.ID, target.Status, system.StatusConfigured, target.Evidence)
		}
		if target.Evidence == "" {
			t.Errorf("target %q evidence is empty", target.ID)
		}

		// Verify at least one config file exists
		hasExisting := false
		for _, cf := range target.ConfigFiles {
			if cf.Exists {
				hasExisting = true
				break
			}
		}
		if !hasExisting {
			t.Errorf("target %q has no ConfigFiles marked as Exists", target.ID)
		}
	}
}

func TestInspectTargets_DetectedWorkspace(t *testing.T) {
	tempDir := t.TempDir()

	// Create dist directory artifacts
	_ = os.MkdirAll(filepath.Join(tempDir, "dist", "claude"), 0755)
	_ = os.MkdirAll(filepath.Join(tempDir, "dist", "antigravity"), 0755)

	targets := system.InspectTargets(tempDir)
	var claude, antigravity system.TargetSpec
	for _, target := range targets {
		if target.ID == "claude" {
			claude = target
		}
		if target.ID == "antigravity" {
			antigravity = target
		}
	}

	if claude.Status != system.StatusDetected {
		t.Errorf("claude status = %q, want %q", claude.Status, system.StatusDetected)
	}
	if claude.Evidence != "dist/claude" {
		t.Errorf("claude evidence = %q, want 'dist/claude'", claude.Evidence)
	}

	if antigravity.Status != system.StatusDetected {
		t.Errorf("antigravity status = %q, want %q", antigravity.Status, system.StatusDetected)
	}
	if antigravity.Evidence != "dist/antigravity" {
		t.Errorf("antigravity evidence = %q, want 'dist/antigravity'", antigravity.Evidence)
	}
}

func TestInspectTargets_ActiveStatus(t *testing.T) {
	tempDir := t.TempDir()
	_ = os.WriteFile(filepath.Join(tempDir, "CLAUDE.md"), []byte("# Claude"), 0644)

	t.Setenv("OSPEC_ACTIVE_TARGET", "claude")

	targets := system.InspectTargets(tempDir)
	for _, target := range targets {
		if target.ID == "claude" {
			if target.Status != system.StatusActive {
				t.Errorf("claude status with OSPEC_ACTIVE_TARGET=claude: got %q, want %q", target.Status, system.StatusActive)
			}
		} else {
			if target.Status == system.StatusActive {
				t.Errorf("target %q unexpectedly active", target.ID)
			}
		}
	}
}

func TestInspectTarget_Individual(t *testing.T) {
	tempDir := t.TempDir()
	_ = os.WriteFile(filepath.Join(tempDir, "codex.toml"), []byte(""), 0644)

	spec, err := system.InspectTarget(tempDir, "codex")
	if err != nil {
		t.Fatalf("InspectTarget('codex') returned error: %v", err)
	}
	if spec.ID != "codex" {
		t.Errorf("spec.ID = %q, want 'codex'", spec.ID)
	}
	if spec.DisplayName != "Codex" {
		t.Errorf("spec.DisplayName = %q, want 'Codex'", spec.DisplayName)
	}
	if spec.Status != system.StatusConfigured {
		t.Errorf("spec.Status = %q, want %q", spec.Status, system.StatusConfigured)
	}
	if !spec.Capabilities.Subagents {
		t.Error("codex should support subagents")
	}

	// Unknown target
	_, err = system.InspectTarget(tempDir, "unknown-target")
	if err == nil {
		t.Error("InspectTarget('unknown-target') should return an error")
	}
}

func TestCapabilityMatrix(t *testing.T) {
	tempDir := t.TempDir()
	targets := system.InspectTargets(tempDir)

	for _, target := range targets {
		switch target.ID {
		case "claude":
			if !target.Capabilities.Subagents || !target.Capabilities.Hooks || !target.Capabilities.MCP || !target.Capabilities.DynamicTools {
				t.Errorf("claude capability mismatch: %+v", target.Capabilities)
			}
		case "antigravity":
			if !target.Capabilities.Subagents || !target.Capabilities.Parallelism || !target.Capabilities.BackgroundTasks {
				t.Errorf("antigravity capability mismatch: %+v", target.Capabilities)
			}
		case "vscode":
			if target.Capabilities.Hooks || target.Capabilities.MCP {
				t.Errorf("vscode capability mismatch (should not have hooks/mcp): %+v", target.Capabilities)
			}
		case "codex":
			if !target.Capabilities.Subagents || target.Capabilities.Hooks {
				t.Errorf("codex capability mismatch: %+v", target.Capabilities)
			}
		case "opencode":
			if !target.Capabilities.Subagents || !target.Capabilities.Hooks || !target.Capabilities.MCP {
				t.Errorf("opencode capability mismatch: %+v", target.Capabilities)
			}
		case "cursor":
			if !target.Capabilities.Subagents || !target.Capabilities.Hooks || !target.Capabilities.MCP {
				t.Errorf("cursor capability mismatch: %+v", target.Capabilities)
			}
		}
	}
}

func TestSyncTarget_Success(t *testing.T) {
	tempDir := t.TempDir()

	targets := []string{"claude", "antigravity", "vscode", "codex", "opencode", "cursor"}
	for _, id := range targets {
		err := system.SyncTarget(tempDir, id)
		if err != nil {
			t.Fatalf("SyncTarget(%q) returned error: %v", id, err)
		}

		// Re-inspect to confirm configured
		spec, err := system.InspectTarget(tempDir, id)
		if err != nil {
			t.Fatalf("InspectTarget(%q) returned error: %v", id, err)
		}
		if spec.Status != system.StatusConfigured {
			t.Errorf("target %q status after sync = %q, want %q", id, spec.Status, system.StatusConfigured)
		}
	}
}

func TestSyncTarget_InvalidTarget(t *testing.T) {
	tempDir := t.TempDir()
	err := system.SyncTarget(tempDir, "invalid-target-xyz")
	if err == nil {
		t.Error("SyncTarget with invalid target should return error")
	}
}

func TestSyncTarget_InvalidDirectory(t *testing.T) {
	// A file cannot be a directory for sync
	tempFile := filepath.Join(t.TempDir(), "file.txt")
	_ = os.WriteFile(tempFile, []byte("hello"), 0644)

	err := system.SyncTarget(tempFile, "claude")
	if err == nil {
		t.Error("SyncTarget with file path as repoRoot should return error")
	}
}
