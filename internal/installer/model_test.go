package installer

import (
	"encoding/json"
	"testing"
)

func TestModelUsesEffectiveChoiceAsDefault(t *testing.T) {
	m := NewModel(testPlan(Target{ID: "codex", Agents: []Agent{{
		ID: "architect", Selectable: true, Effective: json.RawMessage(`{"model":"preferred"}`),
		Choices: []Choice{
			{ID: "first", Label: "Fallback", Value: json.RawMessage(`{"model":"fallback"}`)},
			{ID: "preferred", Label: "Preferred", Value: json.RawMessage(`{"model":"preferred"}`)},
		},
	}}}))
	if got := m.selections["codex"]["architect"]; got != "preferred" {
		t.Fatalf("default choice = %q, want effective choice preferred", got)
	}
}

func TestModelRetainsSelectionsPerTarget(t *testing.T) {
	plan := testPlan(
		Target{ID: "claude", Label: "Claude", Agents: []Agent{selectableAgent("architect")}},
		Target{ID: "codex", Label: "Codex", Agents: []Agent{selectableAgent("reviewer")}},
	)
	m := NewModel(plan)

	m = updateKey(t, m, "enter") // menu -> targets
	m = updateKey(t, m, "enter") // Claude -> models
	m = updateKey(t, m, "right")
	if got := m.Selections()["architect"]; got != "second" {
		t.Fatalf("Claude selection = %q, want second", got)
	}
	m = updateKey(t, m, "esc")  // models -> targets
	m = updateKey(t, m, "down") // Codex
	m = updateKey(t, m, "enter")
	if got := m.Selections()["reviewer"]; got != "first" {
		t.Fatalf("Codex default = %q, want first", got)
	}
	m = updateKey(t, m, "esc")
	m = updateKey(t, m, "up")
	m = updateKey(t, m, "enter")
	if got := m.Selections()["architect"]; got != "second" {
		t.Fatalf("returning to Claude lost selection: %q", got)
	}
}

func TestModelUpdateNavigation(t *testing.T) {
	plan := testPlan(Target{ID: "claude", Label: "Claude", Agents: []Agent{selectableAgent("architect")}})
	cases := []struct {
		name        string
		keys        []string
		wantScreen  screen
		wantInstall bool
	}{
		{name: "menu to targets", keys: []string{"enter"}, wantScreen: targetsScreen},
		{name: "escape returns to menu", keys: []string{"enter", "esc"}, wantScreen: menuScreen},
		{name: "models enter review", keys: []string{"enter", "enter", "enter"}, wantScreen: reviewScreen},
		{name: "review default Back", keys: []string{"enter", "enter", "enter", "enter"}, wantScreen: modelsScreen},
		{name: "review explicit Install", keys: []string{"enter", "enter", "enter", "right", "enter"}, wantScreen: installingScreen, wantInstall: true},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			model := NewModel(plan)
			for _, key := range test.keys {
				model = updateKey(t, model, key)
			}
			if model.screen != test.wantScreen || model.InstallRequested() != test.wantInstall {
				t.Fatalf("state = (%v, %t), want (%v, %t)", model.screen, model.InstallRequested(), test.wantScreen, test.wantInstall)
			}
		})
	}
}

func TestModelOnlyRequestsInstallFromReviewInstallAction(t *testing.T) {
	m := NewModel(testPlan(Target{ID: "claude", Label: "Claude", Agents: []Agent{selectableAgent("architect")}}))
	m = updateKey(t, m, "enter")
	m = updateKey(t, m, "enter")
	m = updateKey(t, m, "enter") // models -> review
	if m.InstallRequested() {
		t.Fatal("navigation must not request installation")
	}
	m = updateKey(t, m, "enter") // default Back
	if m.screen != modelsScreen || m.InstallRequested() {
		t.Fatal("default review action must return to models without installation")
	}
	m = updateKey(t, m, "enter")
	m = updateKey(t, m, "right")
	m = updateKey(t, m, "enter")
	if m.screen != installingScreen || !m.InstallRequested() {
		t.Fatal("Install must transition to installing exactly once")
	}
	request, ok := m.InstallRequest()
	if !ok || request.Target != "claude" || request.Selections["architect"] != "first" {
		t.Fatalf("reviewed install request = %#v, %t", request, ok)
	}
	m = updateKey(t, m, "enter")
	if m.screen != installingScreen || !m.InstallRequested() {
		t.Fatal("repeated Enter must not leave installing or request a second install")
	}
}

func TestModelCustomModelInput(t *testing.T) {
	plan := testPlan(Target{
		ID:          "claude",
		Label:       "Claude",
		AllowCustom: true,
		Agents:      []Agent{selectableAgent("architect")},
	})
	m := NewModel(plan)
	m = updateKey(t, m, "enter") // menu -> targets
	m = updateKey(t, m, "enter") // targets -> models
	m = updateKey(t, m, "c")     // models -> customModelScreen
	if m.screen != customModelScreen {
		t.Fatalf("screen = %v, want customModelScreen", m.screen)
	}

	for _, ch := range "glm-5.3" {
		m = updateKey(t, m, string(ch))
	}
	if m.customInput != "glm-5.3" {
		t.Fatalf("customInput = %q, want glm-5.3", m.customInput)
	}

	m = updateKey(t, m, "enter") // submit custom model -> modelsScreen
	if m.screen != modelsScreen {
		t.Fatalf("screen = %v, want modelsScreen", m.screen)
	}

	target, _ := m.target()
	label := m.agentLabel(target, target.Agents[0])
	if label != "glm-5.3 (Personalizado)" {
		t.Fatalf("agent label = %q, want glm-5.3 (Personalizado)", label)
	}

	m = updateKey(t, m, "enter") // models -> reviewScreen
	if m.screen != reviewScreen {
		t.Fatalf("screen = %v, want reviewScreen", m.screen)
	}
	labelInReview := m.agentLabel(target, target.Agents[0])
	if labelInReview != "glm-5.3 (Personalizado)" {
		t.Fatalf("review label = %q, want glm-5.3 (Personalizado)", labelInReview)
	}
}

func TestModelCycleCodexEffort(t *testing.T) {
	initialVal := `{"model":"gpt-6-astra","model_reasoning_effort":"high","model_verbosity":"medium"}`
	plan := testPlan(Target{
		ID:          "codex",
		Label:       "Codex",
		AllowCustom: true,
		Agents: []Agent{{
			ID:         "architect",
			Selectable: true,
			Effective:  json.RawMessage(initialVal),
			Choices: []Choice{{
				ID:    "astra-high",
				Label: "GPT-6 Astra · high · medium",
				Value: json.RawMessage(initialVal),
			}},
		}},
	})
	m := NewModel(plan)
	m = updateKey(t, m, "enter") // menu -> targets
	m = updateKey(t, m, "enter") // targets -> models

	// Cycle high -> xhigh
	m = updateKey(t, m, "e")
	target, _ := m.target()
	if got := m.agentLabel(target, target.Agents[0]); got != "gpt-6-astra · xhigh · medium" {
		t.Fatalf("effort 1 = %q, want gpt-6-astra · xhigh · medium", got)
	}

	// Cycle xhigh -> low
	m = updateKey(t, m, "e")
	if got := m.agentLabel(target, target.Agents[0]); got != "gpt-6-astra · low · medium" {
		t.Fatalf("effort 2 = %q, want gpt-6-astra · low · medium", got)
	}

	// Cycle low -> medium
	m = updateKey(t, m, "e")
	if got := m.agentLabel(target, target.Agents[0]); got != "gpt-6-astra · medium · medium" {
		t.Fatalf("effort 3 = %q, want gpt-6-astra · medium · medium", got)
	}

	// Cycle medium -> high
	m = updateKey(t, m, "e")
	if got := m.agentLabel(target, target.Agents[0]); got != "gpt-6-astra · high · medium" {
		t.Fatalf("effort 4 = %q, want gpt-6-astra · high · medium", got)
	}
}

func TestModelCustomModelInputCodex(t *testing.T) {
	plan := testPlan(Target{
		ID:          "codex",
		Label:       "Codex",
		AllowCustom: true,
		Agents:      []Agent{selectableAgent("architect")},
	})
	m := NewModel(plan)
	m = updateKey(t, m, "enter") // menu -> targets
	m = updateKey(t, m, "enter") // targets -> models
	m = updateKey(t, m, "c")     // models -> customModelScreen

	for _, ch := range "gpt-6-astra" {
		m = updateKey(t, m, string(ch))
	}
	m = updateKey(t, m, "enter") // confirm custom model
	target, _ := m.target()
	if got := m.agentLabel(target, target.Agents[0]); got != "gpt-6-astra · high · medium (Personalizado)" {
		t.Fatalf("codex custom model label = %q, want gpt-6-astra · high · medium (Personalizado)", got)
	}

	// Now cycle effort on this newly added custom model!
	m = updateKey(t, m, "e")
	if got := m.agentLabel(target, target.Agents[0]); got != "gpt-6-astra · xhigh · medium" {
		t.Fatalf("effort on custom codex model = %q, want gpt-6-astra · xhigh · medium", got)
	}
}

func testPlan(targets ...Target) Plan { return Plan{Version: protocolVersion, Targets: targets} }

func selectableAgent(id string) Agent {
	return Agent{ID: id, Selectable: true, Choices: []Choice{{ID: "first", Label: "First"}, {ID: "second", Label: "Second"}}}
}

func updateKey(t *testing.T, model Model, key string) Model {
	t.Helper()
	model.handleKey(key)
	return model
}
