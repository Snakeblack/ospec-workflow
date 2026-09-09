package installer

import (
	"encoding/json"
	"testing"
)

func choice(id string, controls map[string]Control) Choice {
	return Choice{ID: id, Label: id, Value: json.RawMessage(`"` + id + `"`), Controls: controls}
}
func TestPresetAndInheritedNavigationRemainExplicit(t *testing.T) {
	plan := Plan{Version: 2, Targets: []Target{{ID: "vscode", Agents: []Agent{{ID: "a", Selectable: true, Choices: []Choice{choice("one", nil)}}}, Presets: []Preset{{ID: "recommended", Selections: map[string]Selection{"a": {ChoiceID: "one", Controls: map[string]string{}}}}}}, {ID: "antigravity", Inherited: true, Agents: []Agent{{ID: "a", Inherited: true}}}}}
	m := NewModel(plan)
	m.handleKey("enter")
	m.handleKey("enter")
	m.handleKey("enter")
	if m.screen != reviewScreen || m.mode != "preset" {
		t.Fatalf("preset state=%v %s", m.screen, m.mode)
	}
	m.back()
	m.back()
	m.handleKey("down")
	m.handleKey("enter")
	if m.mode != "inherited" || m.screen != reviewScreen {
		t.Fatalf("inherited state=%v %s", m.screen, m.mode)
	}
}
func TestSearchRetainsChoiceAndFiltersCaseInsensitively(t *testing.T) {
	agent := Agent{ID: "a", Selectable: true, Choices: []Choice{choice("Alpha", nil), choice("Beta", nil)}}
	plan := Plan{Version: 2, Targets: []Target{{ID: "claude", Agents: []Agent{agent}, Presets: []Preset{{ID: "recommended", Selections: map[string]Selection{"a": {ChoiceID: "Alpha", Controls: map[string]string{}}}}}}}}
	m := NewModel(plan)
	m.handleKey("enter")
	m.handleKey("enter")
	m.handleKey("down")
	m.handleKey("enter")
	m.handleKey("B")
	target, _ := m.target()
	if len(m.filtered(target.Agents[0], m.queries[target.ID]["a"])) != 1 || m.Selections()["a"].ChoiceID != "Alpha" {
		t.Fatal("search changed selection or did not filter")
	}
}

func TestCustomReasoningFlowReachesReviewAndInstall(t *testing.T) {
	control := Control{Values: []string{"low", "high"}, Default: "high"}
	plan := Plan{Version: 2, Targets: []Target{{
		ID: "claude",
		Agents: []Agent{{ID: "apply", Selectable: true, Choices: []Choice{choice("sonnet", map[string]Control{"effort": control})}}},
		Presets: []Preset{{ID: "recommended", Selections: map[string]Selection{"apply": {ChoiceID: "sonnet", Controls: map[string]string{}}}}},
	}}}
	m := NewModel(plan)
	for _, key := range []string{"enter", "enter", "down", "enter", "enter"} {
		m.handleKey(key)
	}
	if m.screen != controlsScreen {
		t.Fatalf("screen = %v, want controls", m.screen)
	}
	m.handleKey("enter")
	if m.screen != reviewScreen {
		t.Fatalf("screen = %v, want review after confirming controls", m.screen)
	}
	m.handleKey("right")
	if action := m.handleKey("enter"); action != installAction || !m.InstallRequested() {
		t.Fatalf("action = %v, install requested = %v", action, m.InstallRequested())
	}
}

func TestCustomEditRetainsSearchChoiceAndControlState(t *testing.T) {
	control := Control{Values: []string{"low", "high"}, Default: "high"}
	plan := Plan{Version: 2, Targets: []Target{{ID: "claude", Agents: []Agent{{ID: "apply", Selectable: true, Choices: []Choice{choice("Alpha", map[string]Control{"effort": control}), choice("Beta", map[string]Control{"effort": control})}}}, Presets: []Preset{{ID: "recommended", Selections: map[string]Selection{"apply": {ChoiceID: "Alpha", Controls: map[string]string{}}}}}}}}
	m := NewModel(plan)
	for _, key := range []string{"enter", "enter", "down", "enter", "B", "backspace", "right", "enter", "down", "enter"} {
		m.handleKey(key)
	}
	if m.screen != reviewScreen || m.Selections()["apply"].ChoiceID != "Beta" || m.Selections()["apply"].Controls["effort"] != "low" {
		t.Fatalf("review or selection state lost: screen=%v selections=%#v", m.screen, m.Selections())
	}
	m.back()
	m.handleKey("enter")
	if m.screen != controlsScreen || m.Selections()["apply"].Controls["effort"] != "low" {
		t.Fatalf("edit path did not retain control state: screen=%v selections=%#v", m.screen, m.Selections())
	}
}

func TestCustomEditChangesOnlyTheFocusedPhase(t *testing.T) {
	plan := Plan{Version: 2, Targets: []Target{{ID: "vscode", Agents: []Agent{{ID: "first", Selectable: true, Choices: []Choice{choice("one", nil), choice("two", nil)}}, {ID: "second", Selectable: true, Choices: []Choice{choice("one", nil), choice("two", nil)}}}, Presets: []Preset{{ID: "recommended", Selections: map[string]Selection{"first": {ChoiceID: "one"}, "second": {ChoiceID: "one"}}}}}}}
	m := NewModel(plan)
	for _, key := range []string{"enter", "enter", "down", "enter", "right"} {
		m.handleKey(key)
	}
	selections := m.Selections()
	if selections["first"].ChoiceID != "two" || selections["second"].ChoiceID != "one" {
		t.Fatalf("focused edit leaked across phases: %#v", selections)
	}
}
