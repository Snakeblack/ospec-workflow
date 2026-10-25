package installer

import (
	"encoding/json"
	"strings"
	"testing"
)

func tiers(values map[string]string, fallback map[string]string) []Tier {
	out := []Tier{}
	for _, id := range []string{"premium", "default", "cheap"} {
		out = append(out, Tier{ID: id, Agents: []string{id + "-agent"}, Value: values[id], Fallback: fallback[id]})
	}
	return out
}

func TestTypingAssignsTheFocusedTierOnly(t *testing.T) {
	plan := Plan{Version: 3, Targets: []Target{{ID: "codex", Tiers: tiers(nil, nil)}}}
	m := NewModel(plan)
	m.handleKey("enter")
	m.handleKey("enter")
	if m.screen != modelsScreen {
		t.Fatalf("screen=%v, want models", m.screen)
	}
	// q, j and k are part of a name here, never navigation or quit.
	for _, key := range []string{"g", "p", "t", "-", "q", "j", "k"} {
		m.handleKey(key)
	}
	m.handleKey("backspace")
	m.handleKey("down")
	m.handleKey("x")
	got := m.Models()
	if got["premium"] != "gpt-qj" || got["default"] != "x" || got["cheap"] != "" {
		t.Fatalf("models=%#v", got)
	}
}

func TestBackspaceRemovesWholeRunesAndCtrlUClears(t *testing.T) {
	plan := Plan{Version: 3, Targets: []Target{{ID: "opencode", Tiers: tiers(map[string]string{"premium": "zoë"}, nil)}}}
	m := NewModel(plan)
	m.handleKey("enter")
	m.handleKey("enter")
	m.handleKey("backspace")
	if got := m.Models()["premium"]; got != "zo" {
		t.Fatalf("after backspace=%q", got)
	}
	m.handleKey("ñ")
	if got := m.Models()["premium"]; got != "zoñ" {
		t.Fatalf("a non-ASCII rune is typed: %q", got)
	}
	m.handleKey("ctrl+u")
	if got := m.Models()["premium"]; got != "" {
		t.Fatalf("after ctrl+u=%q", got)
	}
}

func TestBackRetainsTypedModels(t *testing.T) {
	plan := Plan{Version: 3, Targets: []Target{{ID: "cursor", Tiers: tiers(map[string]string{"cheap": "composer"}, nil)}}}
	m := NewModel(plan)
	for _, key := range []string{"enter", "enter", "a", "enter"} {
		m.handleKey(key)
	}
	if m.screen != reviewScreen {
		t.Fatalf("screen=%v", m.screen)
	}
	m.back()
	m.back()
	m.handleKey("enter")
	if got := m.Models(); got["premium"] != "a" || got["cheap"] != "composer" {
		t.Fatalf("models lost on Back: %#v", got)
	}
}

func TestInstallRequestCarriesEveryTierTrimmed(t *testing.T) {
	plan := Plan{Version: 3, Targets: []Target{{ID: "claude", Tiers: tiers(map[string]string{"premium": " fable "}, map[string]string{"premium": "opus", "default": "sonnet", "cheap": "haiku"})}}}
	m := NewModel(plan)
	for _, key := range []string{"enter", "enter", "enter", "right", "enter"} {
		m.handleKey(key)
	}
	request, ok := m.InstallRequest()
	if !ok || request.Target != "claude" {
		t.Fatalf("request=%#v ok=%v", request, ok)
	}
	want := map[string]string{"premium": "fable", "default": "", "cheap": ""}
	for tier, value := range want {
		if request.Models[tier] != value {
			t.Fatalf("models=%#v, want %#v", request.Models, want)
		}
	}
}

func TestInheritedTargetSkipsModelsAndSendsNone(t *testing.T) {
	plan := Plan{Version: 3, Targets: []Target{{ID: "antigravity", Inherited: true}}}
	m := NewModel(plan)
	for _, key := range []string{"enter", "enter"} {
		m.handleKey(key)
	}
	if m.screen != reviewScreen {
		t.Fatalf("screen=%v, want review", m.screen)
	}
	m.handleKey("right")
	m.handleKey("enter")
	request, _ := m.InstallRequest()
	payload, _ := json.Marshal(request)
	if strings.Contains(string(payload), "models") {
		t.Fatalf("payload=%s", payload)
	}
	m.screen = reviewScreen
	m.back()
	if m.screen != targetsScreen {
		t.Fatalf("Back from an inherited review goes to targets, got %v", m.screen)
	}
}

func TestReviewTogglesOptionalPackagesIntoTheRequest(t *testing.T) {
	plan := Plan{Version: 3, Packages: []Package{{ID: "sdd", Label: "Modo SDD"}, {ID: "extras", Label: "Extras"}}, Targets: []Target{{ID: "antigravity", Inherited: true}}}
	m := NewModel(plan)
	m.handleKey("enter")
	m.handleKey("enter")
	if m.screen != reviewScreen {
		t.Fatalf("screen=%v", m.screen)
	}
	m.handleKey("2")
	m.handleKey("1")
	m.handleKey("2")
	m.handleKey("9")
	m.handleKey("right")
	if m.handleKey("enter") != installAction {
		t.Fatal("install was not requested")
	}
	request, ok := m.InstallRequest()
	if !ok || len(request.Packages) != 1 || request.Packages[0] != "sdd" {
		t.Fatalf("packages=%v", request.Packages)
	}
}

func TestRequestWithoutPackagesKeepsTheInstallerDefault(t *testing.T) {
	plan := Plan{Version: 3, Packages: []Package{{ID: "sdd", Label: "Modo SDD"}}, Targets: []Target{{ID: "antigravity", Inherited: true}}}
	m := NewModel(plan)
	for _, key := range []string{"enter", "enter", "right", "enter"} {
		m.handleKey(key)
	}
	request, _ := m.InstallRequest()
	payload, _ := json.Marshal(request)
	if strings.Contains(string(payload), "packages") {
		t.Fatalf("payload=%s", payload)
	}
}
