package config

import (
	"os"
	"path/filepath"
	"testing"

	"gopkg.in/yaml.v3"
)

func sampleConfig() *ModelsConfig {
	return &ModelsConfig{
		Agents: map[string]string{
			"sdd-apply":    "default",
			"sdd-propose":  "premium",
			"sdd-document": "cheap",
			"_default":     "default",
		},
		Tiers: map[string]TierConfig{
			"premium": {
				Claude:      FlexibleModel{Model: "opus", Effort: "high"},
				Antigravity: "pro",
			},
			"default": {
				Claude:      FlexibleModel{Model: "sonnet", Effort: "medium"},
				Antigravity: "flash",
			},
			"cheap": {
				Claude:      FlexibleModel{Model: "haiku", Effort: "low"},
				Antigravity: "flash_lite",
			},
		},
	}
}

func TestTargetIsMultiAgent(t *testing.T) {
	if TargetIsMultiAgent("antigravity") {
		t.Fatal("antigravity must not be multi-agent")
	}
	for _, id := range []string{"claude", "codex", "cursor", "vscode", "opencode"} {
		if !TargetIsMultiAgent(id) {
			t.Fatalf("%s should be multi-agent", id)
		}
	}
}

func TestResolveAssignmentPrefersOverlay(t *testing.T) {
	cfg := sampleConfig()
	cfg.Assignments = map[string]map[string]AgentAssignment{
		"claude": {
			"sdd-apply": {Model: "fable", Effort: "max"},
		},
	}
	got := ResolveAssignment(cfg, "claude", "sdd-apply")
	if got.Model != "fable" || got.Effort != "max" {
		t.Fatalf("overlay = %+v", got)
	}
	fallback := ResolveAssignment(cfg, "claude", "sdd-propose")
	if fallback.Model != "opus" {
		t.Fatalf("propose should use premium opus, got %+v", fallback)
	}
}

func TestBuildAgentPicksAntigravitySingleRow(t *testing.T) {
	cfg := sampleConfig()
	picks := BuildAgentPicks(cfg, "antigravity", "")
	if len(picks) != 1 {
		t.Fatalf("len=%d, want 1", len(picks))
	}
	if picks[0].Model != "flash" {
		t.Fatalf("model=%q, want flash from default/sdd-apply", picks[0].Model)
	}
}

func TestSeedAgentPicksIgnoresStored(t *testing.T) {
	cfg := sampleConfig()
	cfg.Assignments = map[string]map[string]AgentAssignment{
		"claude": {"sdd-apply": {Model: "fable"}},
	}
	built := BuildAgentPicks(cfg, "claude", "cheap")
	if built[indexOfAgent("sdd-apply")].Model != "fable" {
		t.Fatalf("stored assignment should win, got %q", built[indexOfAgent("sdd-apply")].Model)
	}
	seeded := SeedAgentPicks(cfg, "claude", "cheap")
	if seeded[indexOfAgent("sdd-apply")].Model != "haiku" {
		t.Fatalf("cheap seed should be haiku, got %q", seeded[indexOfAgent("sdd-apply")].Model)
	}
}

func indexOfAgent(name string) int {
	for i, n := range ConfigurableAgentNames {
		if n == name {
			return i
		}
	}
	return -1
}

func TestZipAndHasAssignments(t *testing.T) {
	picks := []AgentAssignment{{Model: "flash"}}
	zipped := ZipAssignments("antigravity", picks)
	if zipped[AssignmentAllAgents].Model != "flash" {
		t.Fatalf("zip = %#v", zipped)
	}
	cfg := &ModelsConfig{Assignments: map[string]map[string]AgentAssignment{"antigravity": zipped}}
	if !HasTargetAssignments(cfg, "antigravity") {
		t.Fatal("expected assignments")
	}
	if HasTargetAssignments(cfg, "claude") {
		t.Fatal("claude should be empty")
	}
}

func TestAssignmentYAMLRoundTrip(t *testing.T) {
	in := AgentAssignment{Model: "sonnet", Effort: "high"}
	raw, err := yaml.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	var out AgentAssignment
	if err := yaml.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	if out.Model != "sonnet" || out.Effort != "high" {
		t.Fatalf("roundtrip = %+v (yaml=%s)", out, raw)
	}
}

func TestSaveAllTargetAssignments(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "models.yaml")
	if err := os.WriteFile(path, []byte("agents:\n  _default: default\ntiers:\n  default:\n    claude: sonnet\n"), 0644); err != nil {
		t.Fatal(err)
	}
	mgr := NewModelsManager(dir)
	if err := mgr.SaveAllTargetAssignments(map[string][]AgentAssignment{
		"antigravity": {{Model: "pro"}},
	}); err != nil {
		t.Fatal(err)
	}
	cfg, err := mgr.LoadModels()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Assignments["antigravity"][AssignmentAllAgents].Model != "pro" {
		t.Fatalf("saved = %#v", cfg.Assignments)
	}
}

func TestApplyPresetToTarget(t *testing.T) {
	dir := t.TempDir()
	body := []byte(`agents:
  _default: default
  sdd-apply: default
tiers:
  cheap:
    claude: {model: haiku, effort: low}
    antigravity: flash_lite
  default:
    claude: {model: sonnet, effort: medium}
    antigravity: flash
  premium:
    claude: {model: opus, effort: high}
    antigravity: pro
`)
	if err := os.WriteFile(filepath.Join(dir, "models.yaml"), body, 0644); err != nil {
		t.Fatal(err)
	}
	mgr := NewModelsManager(dir)
	if err := mgr.ApplyPresetToTarget("cheap", "claude"); err != nil {
		t.Fatal(err)
	}
	cfg, err := mgr.GetConfig()
	if err != nil {
		t.Fatal(err)
	}
	got := cfg.Assignments["claude"]["sdd-apply"]
	if got.Model != "haiku" {
		t.Fatalf("sdd-apply cheap = %+v", got)
	}
	if cfg.Agents["sdd-apply"] != "default" {
		t.Fatalf("global agents table should stay default, got %s", cfg.Agents["sdd-apply"])
	}
}
