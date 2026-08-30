package config

import (
	"os"
	"path/filepath"
	"testing"
)

func setupTestRepo(t *testing.T) string {
	tempDir := t.TempDir()

	// Copy real models.yaml to tempDir
	realModelsPath := filepath.Join("..", "..", "models.yaml")
	data, err := os.ReadFile(realModelsPath)
	if err != nil {
		t.Fatalf("failed to read real models.yaml: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tempDir, "models.yaml"), data, 0644); err != nil {
		t.Fatalf("failed to copy models.yaml to tempDir: %v", err)
	}

	// Copy profiles/models/ to tempDir
	profilesDir := filepath.Join(tempDir, "profiles", "models")
	if err := os.MkdirAll(profilesDir, 0755); err != nil {
		t.Fatalf("failed to create profilesDir: %v", err)
	}

	realProfilesDir := filepath.Join("..", "..", "profiles", "models")
	entries, err := os.ReadDir(realProfilesDir)
	if err != nil {
		t.Fatalf("failed to read real profiles dir: %v", err)
	}
	for _, entry := range entries {
		pData, err := os.ReadFile(filepath.Join(realProfilesDir, entry.Name()))
		if err != nil {
			t.Fatalf("failed to read profile %s: %v", entry.Name(), err)
		}
		if err := os.WriteFile(filepath.Join(profilesDir, entry.Name()), pData, 0644); err != nil {
			t.Fatalf("failed to copy profile %s: %v", entry.Name(), err)
		}
	}

	return tempDir
}

func TestModelsManager_LoadAndQuery(t *testing.T) {
	tempDir := setupTestRepo(t)
	mgr := NewModelsManager(tempDir)

	cfg, err := mgr.LoadModels()
	if err != nil {
		t.Fatalf("LoadModels failed: %v", err)
	}
	if cfg == nil || len(cfg.Agents) == 0 {
		t.Fatal("empty config returned")
	}

	// Test GetAgentTier
	tier, err := mgr.GetAgentTier("sdd-propose")
	if err != nil {
		t.Fatalf("GetAgentTier failed: %v", err)
	}
	if tier != "premium" {
		t.Errorf("expected premium, got %s", tier)
	}

	// Test fallback to _default
	fallbackTier, err := mgr.GetAgentTier("nonexistent-agent")
	if err != nil {
		t.Fatalf("GetAgentTier fallback failed: %v", err)
	}
	if fallbackTier != "premium" {
		t.Errorf("expected _default fallback 'premium', got %s", fallbackTier)
	}
}

func TestModelsManager_SetAndSave(t *testing.T) {
	tempDir := setupTestRepo(t)
	mgr := NewModelsManager(tempDir)

	if err := mgr.SetAgentTier("sdd-apply", "cheap"); err != nil {
		t.Fatalf("SetAgentTier failed: %v", err)
	}

	tier, err := mgr.GetAgentTier("sdd-apply")
	if err != nil {
		t.Fatalf("GetAgentTier failed: %v", err)
	}
	if tier != "cheap" {
		t.Errorf("expected cheap after SetAgentTier, got %s", tier)
	}

	// Save to disk
	if err := mgr.Save(); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	// Create new manager instance and verify persistence
	mgr2 := NewModelsManager(tempDir)
	tier2, err := mgr2.GetAgentTier("sdd-apply")
	if err != nil {
		t.Fatalf("mgr2.GetAgentTier failed: %v", err)
	}
	if tier2 != "cheap" {
		t.Errorf("expected persisted tier 'cheap', got %s", tier2)
	}
}

func TestModelsManager_ProfilesAndPresets(t *testing.T) {
	tempDir := setupTestRepo(t)
	mgr := NewModelsManager(tempDir)

	profiles, err := mgr.ListProfiles()
	if err != nil {
		t.Fatalf("ListProfiles failed: %v", err)
	}
	if len(profiles) != 3 {
		t.Errorf("expected 3 profiles, got %d (%v)", len(profiles), profiles)
	}

	// Initial preset should be default or custom
	preset, err := mgr.GetActivePreset()
	if err != nil {
		t.Fatalf("GetActivePreset failed: %v", err)
	}
	// Initial models.yaml has sdd-propose: premium, sdd-orchestrator: default, etc. (standard default preset)
	if preset != "default" {
		t.Logf("Initial active preset is: %s", preset)
	}

	// Apply Cheap preset
	if err := mgr.ApplyPreset("cheap"); err != nil {
		t.Fatalf("ApplyPreset(cheap) failed: %v", err)
	}

	cheapPreset, err := mgr.GetActivePreset()
	if err != nil {
		t.Fatalf("GetActivePreset after cheap failed: %v", err)
	}
	if cheapPreset != "cheap" {
		t.Errorf("expected active preset 'cheap', got %s", cheapPreset)
	}

	// Apply Premium preset
	if err := mgr.ApplyPreset("premium"); err != nil {
		t.Fatalf("ApplyPreset(premium) failed: %v", err)
	}

	premiumPreset, err := mgr.GetActivePreset()
	if err != nil {
		t.Fatalf("GetActivePreset after premium failed: %v", err)
	}
	if premiumPreset != "premium" {
		t.Errorf("expected active preset 'premium', got %s", premiumPreset)
	}

	// Apply Default preset
	if err := mgr.ApplyPreset("default"); err != nil {
		t.Fatalf("ApplyPreset(default) failed: %v", err)
	}

	defaultPreset, err := mgr.GetActivePreset()
	if err != nil {
		t.Fatalf("GetActivePreset after default failed: %v", err)
	}
	if defaultPreset != "default" {
		t.Errorf("expected active preset 'default', got %s", defaultPreset)
	}

	// Set invalid preset
	if err := mgr.ApplyPreset("unknown-preset"); err == nil {
		t.Error("expected error for unknown preset, got nil")
	}
}
