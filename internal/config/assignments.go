package config

import (
	"fmt"
	"strings"

	"gopkg.in/yaml.v3"
)

const AssignmentAllAgents = "_all"

// ConfigurableAgentNames is the SDD + reviewer roster shown when picking
// per-agent models. `_default` is a fallback tier, not a generated agent.
var ConfigurableAgentNames = []string{
	"sdd-orchestrator",
	"sdd-foundation",
	"sdd-workspace",
	"sdd-onboard",
	"sdd-propose",
	"sdd-spec",
	"sdd-clarify",
	"sdd-design",
	"sdd-tasks",
	"sdd-apply",
	"sdd-verify",
	"sdd-reconcile",
	"sdd-baseline",
	"sdd-archive",
	"sdd-document",
	"sdd-init",
	"sdd-explore",
	"review-change",
	"review-correction",
	"review-readability",
	"review-reliability",
	"review-resilience",
	"review-risk",
}

// AgentAssignment is a per-agent model (+ optional effort/verbosity) for one target.
type AgentAssignment struct {
	Model     string
	Effort    string
	Verbosity string
}

func (a AgentAssignment) IsZero() bool {
	return a.Model == "" && a.Effort == "" && a.Verbosity == ""
}

func (a *AgentAssignment) UnmarshalYAML(value *yaml.Node) error {
	switch value.Kind {
	case yaml.ScalarNode:
		a.Model = value.Value
		a.Effort = ""
		a.Verbosity = ""
		return nil
	case yaml.MappingNode:
		var raw struct {
			Model                string `yaml:"model"`
			Effort               string `yaml:"effort"`
			Verbosity            string `yaml:"verbosity"`
			ModelReasoningEffort string `yaml:"model_reasoning_effort"`
			ModelVerbosity       string `yaml:"model_verbosity"`
		}
		if err := value.Decode(&raw); err != nil {
			return err
		}
		a.Model = raw.Model
		a.Effort = raw.Effort
		if a.Effort == "" {
			a.Effort = raw.ModelReasoningEffort
		}
		a.Verbosity = raw.Verbosity
		if a.Verbosity == "" {
			a.Verbosity = raw.ModelVerbosity
		}
		return nil
	default:
		return fmt.Errorf("expected string or mapping for agent assignment")
	}
}

func (a AgentAssignment) MarshalYAML() (any, error) {
	if a.Effort == "" && a.Verbosity == "" {
		return a.Model, nil
	}
	out := map[string]string{"model": a.Model}
	if a.Effort != "" {
		out["effort"] = a.Effort
	}
	if a.Verbosity != "" {
		out["verbosity"] = a.Verbosity
	}
	return out, nil
}

// TargetIsMultiAgent reports whether custom agents on this host get their own model.
// Antigravity pins a single model for every subagent.
func TargetIsMultiAgent(targetID string) bool {
	return !strings.EqualFold(targetID, "antigravity")
}

// AgentPickNames is the roster edited for a target (one `_all` row on Antigravity).
func AgentPickNames(targetID string) []string {
	if !TargetIsMultiAgent(targetID) {
		return []string{AssignmentAllAgents}
	}
	return append([]string(nil), ConfigurableAgentNames...)
}

// AgentLabel is the TUI name for an assignment row.
func AgentLabel(name string) string {
	if name == AssignmentAllAgents {
		return "Todos los agentes"
	}
	return name
}

// PresetAgentMap returns the agent→tier mapping for a named preset.
func PresetAgentMap(preset string) map[string]string {
	switch strings.ToLower(preset) {
	case "cheap":
		return CheapPresetAgents
	case "premium":
		return PremiumPresetAgents
	default:
		return DefaultPresetAgents
	}
}

// AssignmentFromTier extracts the model/effort/verbosity a target uses at a quality tier.
func AssignmentFromTier(tier TierConfig, targetID string) AgentAssignment {
	switch strings.ToLower(targetID) {
	case "claude":
		return AgentAssignment{Model: tier.GetClaudeModel(), Effort: tier.GetClaudeEffort()}
	case "codex":
		if tier.Codex == nil {
			return AgentAssignment{}
		}
		return AgentAssignment{
			Model:     tier.Codex.Model,
			Effort:    tier.Codex.ModelReasoningEffort,
			Verbosity: tier.Codex.ModelVerbosity,
		}
	case "cursor":
		base, opt := SplitCursorModel(tier.Cursor)
		return AgentAssignment{Model: base, Effort: opt}
	case "opencode":
		base, variant := SplitOpenCodeModel(tier.OpenCode)
		return AgentAssignment{Model: base, Effort: variant}
	case "antigravity":
		return AgentAssignment{Model: tier.Antigravity}
	case "vscode":
		models := tier.GetVSCodeModels()
		if len(models) == 0 {
			return AgentAssignment{}
		}
		return AgentAssignment{Model: models[0]}
	default:
		return AgentAssignment{}
	}
}

// ResolveAssignment returns the model an agent should use on a target.
// Per-target assignments win; otherwise the agent→tier table is used.
func ResolveAssignment(cfg *ModelsConfig, targetID, agent string) AgentAssignment {
	if cfg == nil {
		return AgentAssignment{}
	}
	if asgns := cfg.Assignments[targetID]; asgns != nil {
		if a, ok := asgns[agent]; ok && !a.IsZero() {
			return a
		}
		if !TargetIsMultiAgent(targetID) {
			if a, ok := asgns[AssignmentAllAgents]; ok && !a.IsZero() {
				return a
			}
		}
	}
	tierName := "default"
	if cfg.Agents != nil {
		if t, ok := cfg.Agents[agent]; ok && t != "" {
			tierName = t
		} else if t, ok := cfg.Agents["_default"]; ok && t != "" {
			tierName = t
		}
	}
	if cfg.Tiers == nil {
		return AgentAssignment{}
	}
	tier, ok := cfg.Tiers[tierName]
	if !ok {
		return AgentAssignment{}
	}
	return AssignmentFromTier(tier, targetID)
}

// BuildAgentPicks returns one row per configurable agent (or a single _all row).
// Stored assignments win; otherwise `preset` (if set) seeds from that template;
// otherwise the agents→tiers table is used.
func BuildAgentPicks(cfg *ModelsConfig, targetID, preset string) []AgentAssignment {
	return collectAgentPicks(cfg, targetID, preset, false)
}

// SeedAgentPicks always rebuilds from a preset template, ignoring stored assignments.
func SeedAgentPicks(cfg *ModelsConfig, targetID, preset string) []AgentAssignment {
	return collectAgentPicks(cfg, targetID, preset, true)
}

func collectAgentPicks(cfg *ModelsConfig, targetID, preset string, forceSeed bool) []AgentAssignment {
	names := AgentPickNames(targetID)
	out := make([]AgentAssignment, 0, len(names))
	stored := map[string]AgentAssignment(nil)
	if !forceSeed {
		stored = cfgAssignments(cfg, targetID)
	}
	presetMap := map[string]string{}
	if preset != "" {
		presetMap = PresetAgentMap(preset)
	}
	for _, name := range names {
		if a, ok := stored[name]; ok && !a.IsZero() {
			out = append(out, a)
			continue
		}
		if preset != "" && cfg != nil && cfg.Tiers != nil {
			tierName := presetMap[name]
			if tierName == "" {
				tierName = presetMap["_default"]
			}
			if tierName == "" {
				tierName = "default"
			}
			out = append(out, AssignmentFromTier(cfg.Tiers[tierName], targetID))
			continue
		}
		resolveName := name
		if name == AssignmentAllAgents {
			resolveName = "sdd-apply"
		}
		out = append(out, ResolveAssignment(cfg, targetID, resolveName))
	}
	return out
}

func cfgAssignments(cfg *ModelsConfig, targetID string) map[string]AgentAssignment {
	if cfg == nil || cfg.Assignments == nil {
		return nil
	}
	return cfg.Assignments[targetID]
}

// HasTargetAssignments reports whether a target already has saved per-agent models.
func HasTargetAssignments(cfg *ModelsConfig, targetID string) bool {
	return len(cfgAssignments(cfg, targetID)) > 0
}

// ZipAssignments maps pick rows back onto agent names for a target.
func ZipAssignments(targetID string, picks []AgentAssignment) map[string]AgentAssignment {
	names := AgentPickNames(targetID)
	out := make(map[string]AgentAssignment, len(names))
	for i, name := range names {
		if i < len(picks) {
			out[name] = picks[i]
		}
	}
	return out
}

// CycleAssignmentField walks the catalog (col 0) or effort/verbosity (col 1/2).
func CycleAssignmentField(targetID string, a AgentAssignment, col, delta int) AgentAssignment {
	switch col {
	case 1:
		if TargetSupportsEffort(targetID) {
			a.Effort = CycleValue(EffortValues(targetID), a.Effort, delta)
		} else if TargetSupportsVerbosity(targetID) {
			a.Verbosity = CycleValue(VerbosityValues(), a.Verbosity, delta)
		}
	case 2:
		if TargetSupportsVerbosity(targetID) {
			a.Verbosity = CycleValue(VerbosityValues(), a.Verbosity, delta)
		}
	default:
		avail := TargetAvailableModels[strings.ToLower(targetID)]
		if len(avail) > 0 {
			a.Model = CycleValue(avail, a.Model, delta)
		}
	}
	return a
}

// AssignmentColumnCount is 1 (model) plus effort and/or verbosity when the target supports them.
func AssignmentColumnCount(targetID string) int {
	n := 1
	if TargetSupportsEffort(targetID) {
		n++
	}
	if TargetSupportsVerbosity(targetID) {
		n++
	}
	return n
}
