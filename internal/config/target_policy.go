package config

import (
	"strings"
)

// TargetAvailableModels lists the model IDs each harness actually accepts
// in custom-agent configuration (not a generic vendor catalog).
var TargetAvailableModels = map[string][]string{
	"claude": {
		"sonnet",
		"opus",
		"haiku",
		"fable",
	},
	"codex": {
		"gpt-5.6-sol",
		"gpt-5.6-terra",
		"gpt-5.6-luna",
		"gpt-5.5",
		"gpt-5.4",
		"gpt-5.4-mini",
	},
	"antigravity": {
		"inherit",
		"flash",
		"pro",
		"flash_lite",
	},
	"cursor": {
		"grok-4.6",
		"composer-2.5",
		"claude-sonnet-5",
		"claude-opus-5",
		"claude-fable-5",
		"gpt-5.6-sol",
		"gpt-5.6-terra",
		"gpt-5.6-luna",
		"auto",
	},
	"vscode": {
		"GPT-5.6 Sol (copilot)",
		"GPT-5.6 Terra (copilot)",
		"GPT-5.6 Luna (copilot)",
		"Claude Sonnet 5 (copilot)",
		"Claude Opus 5 (copilot)",
		"Gemini 3.1 Pro (copilot)",
		"Gemini 3.7 Flash (copilot)",
		"Gemini 3.5 Flash-Lite (copilot)",
	},
	"opencode": {
		"openai/gpt-5.6-sol",
		"openai/gpt-5.6-terra",
		"openai/gpt-5.6-luna",
		"anthropic/claude-opus-5",
		"anthropic/claude-sonnet-5",
		"anthropic/claude-haiku-4-5",
		"google/gemini-3.1-pro",
		"google/gemini-3.7-flash",
	},
}

// EffortKind describes how a target encodes reasoning effort on custom agents.
type EffortKind string

const (
	EffortNone     EffortKind = ""
	EffortClaude   EffortKind = "claude"   // frontmatter effort: low|medium|high|xhigh|max
	EffortCodex    EffortKind = "codex"    // model_reasoning_effort (+ verbosity)
	EffortCursor   EffortKind = "cursor"   // model[effort=…] or model[fast=…]
	EffortOpenCode EffortKind = "opencode" // provider/model#variant
)

// TargetEffortKind returns how (if at all) a target stores effort on custom agents.
func TargetEffortKind(targetID string) EffortKind {
	switch strings.ToLower(targetID) {
	case "claude":
		return EffortClaude
	case "codex":
		return EffortCodex
	case "cursor":
		return EffortCursor
	case "opencode":
		return EffortOpenCode
	default:
		return EffortNone
	}
}

// TargetSupportsEffort reports whether custom-agent config can pin effort.
func TargetSupportsEffort(targetID string) bool {
	return TargetEffortKind(targetID) != EffortNone
}

// TargetSupportsVerbosity reports Codex-style model_verbosity.
func TargetSupportsVerbosity(targetID string) bool {
	return strings.EqualFold(targetID, "codex")
}

// EffortValues returns the selectable effort tokens for a target.
func EffortValues(targetID string) []string {
	switch TargetEffortKind(targetID) {
	case EffortClaude:
		return []string{"low", "medium", "high", "xhigh", "max"}
	case EffortCodex:
		return []string{"low", "medium", "high", "xhigh"}
	case EffortCursor:
		return []string{"", "fast=false", "fast=true", "effort=low", "effort=medium", "effort=high"}
	case EffortOpenCode:
		return []string{"", "low", "medium", "high"}
	default:
		return nil
	}
}

// VerbosityValues returns Codex verbosity options.
func VerbosityValues() []string {
	return []string{"low", "medium", "high"}
}

// SplitCursorModel separates a Cursor model id from bracket options.
func SplitCursorModel(raw string) (base string, option string) {
	raw = strings.TrimSpace(raw)
	start := strings.Index(raw, "[")
	end := strings.LastIndex(raw, "]")
	if start < 0 || end <= start {
		return raw, ""
	}
	return strings.TrimSpace(raw[:start]), strings.TrimSpace(raw[start+1 : end])
}

// JoinCursorModel composes a Cursor model id with optional bracket options.
func JoinCursorModel(base, option string) string {
	base = strings.TrimSpace(base)
	option = strings.TrimSpace(option)
	if option == "" {
		return base
	}
	return base + "[" + option + "]"
}

// SplitOpenCodeModel separates provider/model from an optional #variant.
func SplitOpenCodeModel(raw string) (base string, variant string) {
	raw = strings.TrimSpace(raw)
	idx := strings.LastIndex(raw, "#")
	if idx <= 0 {
		return raw, ""
	}
	return raw[:idx], raw[idx+1:]
}

// JoinOpenCodeModel composes provider/model with an optional #variant.
func JoinOpenCodeModel(base, variant string) string {
	base = strings.TrimSpace(base)
	variant = strings.TrimSpace(variant)
	if variant == "" {
		return base
	}
	return base + "#" + variant
}

// CycleValue walks values and returns the next/previous item (wrapping).
// Unknown current jumps to the first item (forward) or the last item (back).
func CycleValue(values []string, current string, delta int) string {
	if len(values) == 0 {
		return current
	}
	curIdx := -1
	for i, v := range values {
		if v == current {
			curIdx = i
			break
		}
	}
	if curIdx < 0 {
		if delta < 0 {
			return values[len(values)-1]
		}
		return values[0]
	}
	n := len(values)
	idx := ((curIdx+delta)%n + n) % n
	return values[idx]
}
