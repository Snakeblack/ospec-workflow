package config

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestModelsConfig_ParseRealModelsYAML(t *testing.T) {
	// Locate repository root models.yaml
	repoRoot := filepath.Join("..", "..")
	modelsPath := filepath.Join(repoRoot, "models.yaml")

	data, err := os.ReadFile(modelsPath)
	if err != nil {
		t.Fatalf("failed to read models.yaml: %v", err)
	}

	var cfg ModelsConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		t.Fatalf("failed to unmarshal models.yaml: %v", err)
	}

	// Verify agents
	if len(cfg.Agents) == 0 {
		t.Fatal("expected non-empty agents map")
	}
	if cfg.Agents["sdd-propose"] != "premium" {
		t.Errorf("expected sdd-propose to be premium, got %s", cfg.Agents["sdd-propose"])
	}
	if cfg.Agents["sdd-orchestrator"] != "default" {
		t.Errorf("expected sdd-orchestrator to be default, got %s", cfg.Agents["sdd-orchestrator"])
	}
	if cfg.Agents["sdd-init"] != "cheap" {
		t.Errorf("expected sdd-init to be cheap, got %s", cfg.Agents["sdd-init"])
	}
	if cfg.Agents["_default"] != "premium" {
		t.Errorf("expected _default to be premium, got %s", cfg.Agents["_default"])
	}

	// Verify tiers
	if len(cfg.Tiers) != 3 {
		t.Fatalf("expected 3 tiers, got %d", len(cfg.Tiers))
	}

	premiumTier, ok := cfg.Tiers["premium"]
	if !ok {
		t.Fatal("premium tier missing")
	}
	if premiumTier.GetClaudeModel() != "opus" {
		t.Errorf("expected claude opus, got %s", premiumTier.GetClaudeModel())
	}
	if premiumTier.GetClaudeEffort() != "high" {
		t.Errorf("expected claude effort high, got %s", premiumTier.GetClaudeEffort())
	}
	if premiumTier.Cursor != "gpt-5.6-sol" {
		t.Errorf("expected cursor gpt-5.6-sol, got %s", premiumTier.Cursor)
	}
	if premiumTier.OpenCode != "openai/gpt-5.6-sol" {
		t.Errorf("expected opencode openai/gpt-5.6-sol, got %s", premiumTier.OpenCode)
	}
	if premiumTier.Antigravity != "pro" {
		t.Errorf("expected antigravity pro, got %s", premiumTier.Antigravity)
	}
	if premiumTier.Codex == nil || premiumTier.Codex.Model != "gpt-5.6-sol" || premiumTier.Codex.ModelReasoningEffort != "high" {
		t.Errorf("unexpected codex configuration: %+v", premiumTier.Codex)
	}

	vscodeList := premiumTier.GetVSCodeModels()
	if len(vscodeList) == 0 || vscodeList[0] != "GPT-5.6 Sol (copilot)" {
		t.Errorf("unexpected vscode models: %+v", vscodeList)
	}
}

func TestProfileConfig_ParseRealProfiles(t *testing.T) {
	repoRoot := filepath.Join("..", "..")
	profilesDir := filepath.Join(repoRoot, "profiles", "models")

	profiles := []string{"cheap.yaml", "default.yaml", "premium.yaml"}
	for _, p := range profiles {
		path := filepath.Join(profilesDir, p)
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("failed to read profile %s: %v", p, err)
		}

		var prof ProfileConfig
		if err := yaml.Unmarshal(data, &prof); err != nil {
			t.Fatalf("failed to unmarshal profile %s: %v", p, err)
		}

		if prof.Profile == "" {
			t.Errorf("profile name empty in %s", p)
		}
		if prof.Description == "" {
			t.Errorf("description empty in %s", p)
		}
		if len(prof.Routing) == 0 {
			t.Errorf("routing empty in %s", p)
		}
	}
}

func TestModelsConfig_RoundTrip(t *testing.T) {
	orig := ModelsConfig{
		Agents: map[string]string{
			"sdd-propose": "premium",
			"sdd-apply":   "default",
			"_default":    "premium",
		},
		Tiers: map[string]TierConfig{
			"premium": {
				Claude:   FlexibleModel{Model: "opus", Effort: "high"},
				VSCode:   []string{"GPT-5.6 Sol (copilot)"},
				OpenCode: "openai/gpt-5.6-sol",
				Codex: &CodexTierConfig{
					Model:                "gpt-5.6-sol",
					ModelReasoningEffort: "high",
					ModelVerbosity:       "medium",
				},
				Cursor: "gpt-5.6-sol",
			},
			"default": {
				Claude:   FlexibleModel{Model: "sonnet"},
				VSCode:   "GPT-5.6 Terra (copilot)",
				OpenCode: "openai/gpt-5.6-terra",
				Cursor:   "grok-4.6",
			},
		},
	}

	marshaled, err := yaml.Marshal(orig)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	var roundTripped ModelsConfig
	if err := yaml.Unmarshal(marshaled, &roundTripped); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if !reflect.DeepEqual(orig.Agents, roundTripped.Agents) {
		t.Errorf("agents mismatch:\ngot  %+v\nwant %+v", roundTripped.Agents, orig.Agents)
	}

	// Compare tiers
	if roundTripped.Tiers["premium"].GetClaudeModel() != "opus" ||
		roundTripped.Tiers["premium"].GetClaudeEffort() != "high" ||
		roundTripped.Tiers["premium"].Codex.Model != "gpt-5.6-sol" ||
		roundTripped.Tiers["default"].GetClaudeModel() != "sonnet" {
		t.Errorf("tiers mismatch: %+v", roundTripped.Tiers)
	}
}

func TestFlexibleModel_ScalarAndObject(t *testing.T) {
	var scalar FlexibleModel
	if err := yaml.Unmarshal([]byte("opus\n"), &scalar); err != nil {
		t.Fatalf("scalar unmarshal: %v", err)
	}
	if scalar.Model != "opus" || scalar.Effort != "" {
		t.Fatalf("scalar = %+v", scalar)
	}

	var obj FlexibleModel
	if err := yaml.Unmarshal([]byte("model: haiku\neffort: low\n"), &obj); err != nil {
		t.Fatalf("object unmarshal: %v", err)
	}
	if obj.Model != "haiku" || obj.Effort != "low" {
		t.Fatalf("object = %+v", obj)
	}
}
