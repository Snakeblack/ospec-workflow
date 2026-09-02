package config

import "testing"

func TestTargetCatalogsMatchHostDocs(t *testing.T) {
	claude := TargetAvailableModels["claude"]
	wantClaude := []string{"sonnet", "opus", "haiku", "fable"}
	if len(claude) != len(wantClaude) {
		t.Fatalf("claude catalog = %v, want %v", claude, wantClaude)
	}
	for i, id := range wantClaude {
		if claude[i] != id {
			t.Errorf("claude[%d] = %q, want %q", i, claude[i], id)
		}
	}

	codex := TargetAvailableModels["codex"]
	wantCodex := []string{"gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.4", "gpt-5.4-mini"}
	if len(codex) != len(wantCodex) {
		t.Fatalf("codex catalog = %v, want %v", codex, wantCodex)
	}
	for i, id := range wantCodex {
		if codex[i] != id {
			t.Errorf("codex[%d] = %q, want %q", i, codex[i], id)
		}
	}
}

func TestTargetEffortSupport(t *testing.T) {
	if !TargetSupportsEffort("claude") || TargetEffortKind("claude") != EffortClaude {
		t.Fatal("claude should expose frontmatter effort")
	}
	if !TargetSupportsEffort("codex") || !TargetSupportsVerbosity("codex") {
		t.Fatal("codex should expose model_reasoning_effort and verbosity")
	}
	if !TargetSupportsEffort("cursor") || !TargetSupportsEffort("opencode") {
		t.Fatal("cursor and opencode should expose effort variants")
	}
	if TargetSupportsEffort("vscode") || TargetSupportsEffort("antigravity") {
		t.Fatal("vscode and antigravity custom agents have no effort field")
	}
}

func TestCursorAndOpenCodeComposition(t *testing.T) {
	base, opt := SplitCursorModel("grok-4.6[fast=false]")
	if base != "grok-4.6" || opt != "fast=false" {
		t.Fatalf("SplitCursorModel = %q %q", base, opt)
	}
	if got := JoinCursorModel("claude-opus-5", "effort=high"); got != "claude-opus-5[effort=high]" {
		t.Fatalf("JoinCursorModel = %q", got)
	}

	id, variant := SplitOpenCodeModel("openai/gpt-5.6-terra#high")
	if id != "openai/gpt-5.6-terra" || variant != "high" {
		t.Fatalf("SplitOpenCodeModel = %q %q", id, variant)
	}
	if got := JoinOpenCodeModel("openai/gpt-5.6-luna", "low"); got != "openai/gpt-5.6-luna#low" {
		t.Fatalf("JoinOpenCodeModel = %q", got)
	}
}

func TestCycleValueWraps(t *testing.T) {
	vals := []string{"low", "medium", "high"}
	if got := CycleValue(vals, "high", 1); got != "low" {
		t.Fatalf("cycle forward wrap = %q", got)
	}
	if got := CycleValue(vals, "low", -1); got != "high" {
		t.Fatalf("cycle back wrap = %q", got)
	}
	if got := CycleValue(vals, "unknown", 1); got != "low" {
		t.Fatalf("unknown current forward = %q", got)
	}
}
