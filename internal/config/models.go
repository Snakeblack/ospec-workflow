package config

import (
	"fmt"

	"gopkg.in/yaml.v3"
)

// CodexTierConfig holds model parameters for Codex and Copilot engines.
type CodexTierConfig struct {
	Model                string `yaml:"model"`
	ModelReasoningEffort string `yaml:"model_reasoning_effort,omitempty"`
	ModelVerbosity       string `yaml:"model_verbosity,omitempty"`
}

// TierConfig models target configurations for a specific model tier.
type TierConfig struct {
	Claude   string           `yaml:"claude,omitempty"`
	VSCode   any              `yaml:"vscode,omitempty"` // string or []string
	OpenCode string           `yaml:"opencode,omitempty"`
	Codex    *CodexTierConfig `yaml:"codex,omitempty"`
	Cursor   string           `yaml:"cursor,omitempty"`
	Extra    map[string]any   `yaml:",inline"`
}

// GetVSCodeModels returns VSCode target model names as a slice of strings.
func (tc TierConfig) GetVSCodeModels() []string {
	if tc.VSCode == nil {
		return nil
	}
	switch v := tc.VSCode.(type) {
	case string:
		return []string{v}
	case []string:
		return v
	case []any:
		res := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok {
				res = append(res, s)
			} else {
				res = append(res, fmt.Sprintf("%v", item))
			}
		}
		return res
	default:
		return []string{fmt.Sprintf("%v", v)}
	}
}

// UnmarshalYAML implements custom unmarshaling for TierConfig to cleanly handle Codex/VSCode formats.
func (tc *TierConfig) UnmarshalYAML(value *yaml.Node) error {
	type rawTier TierConfig
	var raw rawTier
	if err := value.Decode(&raw); err != nil {
		return err
	}
	*tc = TierConfig(raw)

	// In case codex was provided as a scalar string, promote it to CodexTierConfig
	for i := 0; i < len(value.Content)-1; i += 2 {
		keyNode := value.Content[i]
		valNode := value.Content[i+1]
		if keyNode.Value == "codex" && valNode.Kind == yaml.ScalarNode {
			tc.Codex = &CodexTierConfig{
				Model: valNode.Value,
			}
		}
	}
	return nil
}

// ModelsConfig represents the root structure of models.yaml.
type ModelsConfig struct {
	Agents map[string]string     `yaml:"agents"`
	Tiers  map[string]TierConfig `yaml:"tiers"`
}

// ProfileConfig represents a model routing profile in profiles/models/*.yaml.
type ProfileConfig struct {
	Profile     string            `yaml:"profile"`
	Description string            `yaml:"description"`
	Routing     map[string]string `yaml:"routing"`
}
