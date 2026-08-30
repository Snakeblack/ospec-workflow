package config

import (
	"os"
	"path/filepath"
	"testing"
)

func setupTestOpenSpecRepo(t *testing.T) string {
	tempDir := t.TempDir()

	// Copy real openspec/config.yaml
	realConfigPath := filepath.Join("..", "..", "openspec", "config.yaml")
	data, err := os.ReadFile(realConfigPath)
	if err != nil {
		t.Fatalf("failed to read real openspec/config.yaml: %v", err)
	}

	targetDir := filepath.Join(tempDir, "openspec")
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		t.Fatalf("failed to create openspec dir: %v", err)
	}

	if err := os.WriteFile(filepath.Join(targetDir, "config.yaml"), data, 0644); err != nil {
		t.Fatalf("failed to write openspec/config.yaml: %v", err)
	}

	return tempDir
}

func TestOpenSpecManager_LoadRealConfig(t *testing.T) {
	tempDir := setupTestOpenSpecRepo(t)
	mgr := NewOpenSpecManager(tempDir)

	cfg, err := mgr.LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	if cfg.Schema != "spec-driven" {
		t.Errorf("expected schema 'spec-driven', got %s", cfg.Schema)
	}
	if cfg.Project.Name != "ospec-workflow" {
		t.Errorf("expected project.name 'ospec-workflow', got %s", cfg.Project.Name)
	}
	if cfg.Project.Version != "2.58.0" {
		t.Errorf("expected project.version '2.58.0', got %s", cfg.Project.Version)
	}
	if cfg.Project.Status != "active" {
		t.Errorf("expected project.status 'active', got %s", cfg.Project.Status)
	}
	if cfg.Testing.Runner != "node" || cfg.Testing.TestCommand != "npm test" {
		t.Errorf("unexpected testing config: %+v", cfg.Testing)
	}
	if cfg.Baseline.Status != "done" || len(cfg.Baseline.DomainsDone) == 0 {
		t.Errorf("unexpected baseline config: %+v", cfg.Baseline)
	}

	// Test quick accessors
	ver, err := mgr.GetProjectVersion()
	if err != nil {
		t.Fatalf("GetProjectVersion failed: %v", err)
	}
	if ver != "2.58.0" {
		t.Errorf("expected 2.58.0, got %s", ver)
	}

	name, err := mgr.GetProjectName()
	if err != nil {
		t.Fatalf("GetProjectName failed: %v", err)
	}
	if name != "ospec-workflow" {
		t.Errorf("expected ospec-workflow, got %s", name)
	}
}

func TestOpenSpecManager_MutateAndSave(t *testing.T) {
	tempDir := setupTestOpenSpecRepo(t)
	mgr := NewOpenSpecManager(tempDir)

	cfg, err := mgr.LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	cfg.Project.Version = "2.58.0"
	cfg.Testing.TDDMode = "strict"

	if err := mgr.SaveConfig(cfg); err != nil {
		t.Fatalf("SaveConfig failed: %v", err)
	}

	// Verify persistence in new manager
	mgr2 := NewOpenSpecManager(tempDir)
	cfg2, err := mgr2.LoadConfig()
	if err != nil {
		t.Fatalf("mgr2.LoadConfig failed: %v", err)
	}

	if cfg2.Project.Version != "2.58.0" {
		t.Errorf("expected version 2.58.0, got %s", cfg2.Project.Version)
	}
	if cfg2.Testing.TDDMode != "strict" {
		t.Errorf("expected tdd_mode strict, got %s", cfg2.Testing.TDDMode)
	}
	// Verify context and schema preserved
	if cfg2.Schema != "spec-driven" || cfg2.Context == "" {
		t.Errorf("schema or context corrupted during save: %+v", cfg2)
	}
}
