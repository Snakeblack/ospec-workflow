package config

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

// Standard preset agent-to-tier mappings
var DefaultPresetAgents = map[string]string{
	"sdd-propose":        "premium",
	"sdd-design":         "premium",
	"sdd-verify":         "premium",
	"sdd-foundation":     "premium",
	"sdd-workspace":      "premium",
	"sdd-orchestrator":   "default",
	"sdd-spec":           "default",
	"sdd-clarify":        "default",
	"sdd-apply":          "default",
	"sdd-reconcile":      "default",
	"sdd-baseline":       "default",
	"sdd-init":           "cheap",
	"sdd-explore":        "cheap",
	"sdd-tasks":          "cheap",
	"sdd-archive":        "cheap",
	"sdd-onboard":        "cheap",
	"sdd-document":       "cheap",
	"review-change":      "premium",
	"review-correction":  "default",
	"review-risk":        "default",
	"review-readability": "default",
	"review-reliability": "default",
	"review-resilience":  "default",
	"_default":           "premium",
}

var CheapPresetAgents = map[string]string{
	"sdd-propose":        "cheap",
	"sdd-design":         "default",
	"sdd-verify":         "default",
	"sdd-foundation":     "default",
	"sdd-workspace":      "default",
	"sdd-orchestrator":   "cheap",
	"sdd-spec":           "cheap",
	"sdd-clarify":        "cheap",
	"sdd-apply":          "cheap",
	"sdd-reconcile":      "cheap",
	"sdd-baseline":       "cheap",
	"sdd-init":           "cheap",
	"sdd-explore":        "cheap",
	"sdd-tasks":          "cheap",
	"sdd-archive":        "cheap",
	"sdd-onboard":        "cheap",
	"sdd-document":       "cheap",
	"review-change":      "default",
	"review-correction":  "cheap",
	"review-risk":        "cheap",
	"review-readability": "cheap",
	"review-reliability": "cheap",
	"review-resilience":  "cheap",
	"_default":           "cheap",
}

var PremiumPresetAgents = map[string]string{
	"sdd-propose":        "premium",
	"sdd-design":         "premium",
	"sdd-verify":         "premium",
	"sdd-foundation":     "premium",
	"sdd-workspace":      "premium",
	"sdd-orchestrator":   "default",
	"sdd-spec":           "premium",
	"sdd-clarify":        "premium",
	"sdd-apply":          "premium",
	"sdd-reconcile":      "default",
	"sdd-baseline":       "default",
	"sdd-init":           "default",
	"sdd-explore":        "default",
	"sdd-tasks":          "default",
	"sdd-archive":        "default",
	"sdd-onboard":        "default",
	"sdd-document":       "default",
	"review-change":      "premium",
	"review-correction":  "premium",
	"review-risk":        "premium",
	"review-readability": "default",
	"review-reliability": "premium",
	"review-resilience":  "premium",
	"_default":           "premium",
}

// ModelsManager handles reading, mutating, preset applying, and persisting models.yaml.
type ModelsManager struct {
	repoRoot    string
	modelsPath  string
	profilesDir string
	mu          sync.RWMutex
	cachedCfg   *ModelsConfig
}

// NewModelsManager constructs a manager for the given repository root directory.
func NewModelsManager(repoRoot string) *ModelsManager {
	return &ModelsManager{
		repoRoot:    repoRoot,
		modelsPath:  filepath.Join(repoRoot, "models.yaml"),
		profilesDir: filepath.Join(repoRoot, "profiles", "models"),
	}
}

// LoadModels reads and parses models.yaml from the repository root.
func (m *ModelsManager) LoadModels() (*ModelsConfig, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	data, err := os.ReadFile(m.modelsPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read models.yaml: %w", err)
	}

	var cfg ModelsConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse models.yaml: %w", err)
	}

	if cfg.Agents == nil {
		cfg.Agents = make(map[string]string)
	}
	if cfg.Tiers == nil {
		cfg.Tiers = make(map[string]TierConfig)
	}
	if cfg.Assignments == nil {
		cfg.Assignments = make(map[string]map[string]AgentAssignment)
	}

	m.cachedCfg = &cfg
	return &cfg, nil
}

// ensureLoaded ensures cached configuration is present.
func (m *ModelsManager) ensureLoaded() (*ModelsConfig, error) {
	if m.cachedCfg == nil {
		return m.LoadModels()
	}
	return m.cachedCfg, nil
}

// GetConfig returns the currently cached configuration (or loads it if not present).
func (m *ModelsManager) GetConfig() (*ModelsConfig, error) {
	m.mu.RLock()
	if m.cachedCfg != nil {
		cfg := m.cachedCfg
		m.mu.RUnlock()
		return cfg, nil
	}
	m.mu.RUnlock()
	return m.LoadModels()
}

// GetAgentTier returns the tier assigned to agent, falling back to _default if unmapped.
func (m *ModelsManager) GetAgentTier(agent string) (string, error) {
	cfg, err := m.ensureLoaded()
	if err != nil {
		return "", err
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	if tier, ok := cfg.Agents[agent]; ok && tier != "" {
		return tier, nil
	}
	if fallback, ok := cfg.Agents["_default"]; ok && fallback != "" {
		return fallback, nil
	}
	return "unknown", nil
}

// SetAgentTier sets the tier assigned to a specific agent.
func (m *ModelsManager) SetAgentTier(agent string, tier string) error {
	cfg, err := m.ensureLoaded()
	if err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	cfg.Agents[agent] = tier
	return nil
}

// SetTargetModel sets the specific target model for a given tier.
func (m *ModelsManager) SetTargetModel(tierName string, target string, model string) error {
	cfg, err := m.ensureLoaded()
	if err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	tier := cfg.Tiers[tierName]
	switch strings.ToLower(target) {
	case "claude":
		tier.Claude = FlexibleModel{Model: model, Effort: tier.Claude.Effort}
	case "cursor":
		_, opt := SplitCursorModel(tier.Cursor)
		tier.Cursor = JoinCursorModel(model, opt)
	case "opencode":
		base, _ := SplitOpenCodeModel(model)
		_, variant := SplitOpenCodeModel(tier.OpenCode)
		tier.OpenCode = JoinOpenCodeModel(base, variant)
	case "vscode":
		tier.VSCode = []string{model}
	case "antigravity":
		tier.Antigravity = model
	case "codex":
		if tier.Codex == nil {
			tier.Codex = &CodexTierConfig{}
		}
		tier.Codex.Model = model
	default:
		return fmt.Errorf("target %q no soportado para asignación de modelo", target)
	}
	cfg.Tiers[tierName] = tier
	return nil
}

// SetTargetEffort updates reasoning effort for targets that support it on custom agents.
func (m *ModelsManager) SetTargetEffort(tierName string, target string, effort string) error {
	cfg, err := m.ensureLoaded()
	if err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	tier := cfg.Tiers[tierName]
	switch TargetEffortKind(target) {
	case EffortClaude:
		tier.Claude = FlexibleModel{Model: tier.Claude.Model, Effort: effort}
	case EffortCodex:
		if tier.Codex == nil {
			tier.Codex = &CodexTierConfig{}
		}
		tier.Codex.ModelReasoningEffort = effort
	case EffortCursor:
		base, _ := SplitCursorModel(tier.Cursor)
		tier.Cursor = JoinCursorModel(base, effort)
	case EffortOpenCode:
		base, _ := SplitOpenCodeModel(tier.OpenCode)
		tier.OpenCode = JoinOpenCodeModel(base, effort)
	default:
		return fmt.Errorf("target %q no admite effort en agentes custom", target)
	}
	cfg.Tiers[tierName] = tier
	return nil
}

// SetCodexConfig updates model, reasoning effort, and verbosity for a tier.
func (m *ModelsManager) SetCodexConfig(tierName string, model string, effort string, verbosity string) error {
	cfg, err := m.ensureLoaded()
	if err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	tier := cfg.Tiers[tierName]
	if tier.Codex == nil {
		tier.Codex = &CodexTierConfig{}
	}
	if model != "" {
		tier.Codex.Model = model
	}
	if effort != "" {
		tier.Codex.ModelReasoningEffort = effort
	}
	if verbosity != "" {
		tier.Codex.ModelVerbosity = verbosity
	}
	cfg.Tiers[tierName] = tier
	return nil
}

// Save persists the current in-memory ModelsConfig to models.yaml atomically.
func (m *ModelsManager) Save() error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.cachedCfg == nil {
		return fmt.Errorf("no models configuration loaded to save")
	}

	return m.SaveModels(m.cachedCfg)
}

// SaveModels persists the specified ModelsConfig to models.yaml atomically.
func (m *ModelsManager) SaveModels(cfg *ModelsConfig) error {
	return AtomicWriteYAML(m.modelsPath, cfg, 0644)
}

// ListProfiles returns the list of available profile names in profiles/models/.
func (m *ModelsManager) ListProfiles() ([]string, error) {
	entries, err := os.ReadDir(m.profilesDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{"cheap", "default", "premium"}, nil
		}
		return nil, fmt.Errorf("failed to read profiles directory: %w", err)
	}

	var profiles []string
	for _, entry := range entries {
		if !entry.IsDir() && (strings.HasSuffix(entry.Name(), ".yaml") || strings.HasSuffix(entry.Name(), ".yml")) {
			name := strings.TrimSuffix(strings.TrimSuffix(entry.Name(), ".yaml"), ".yml")
			profiles = append(profiles, name)
		}
	}
	sort.Strings(profiles)
	return profiles, nil
}

// LoadProfile loads a specific profile configuration by name.
func (m *ModelsManager) LoadProfile(name string) (*ProfileConfig, error) {
	path := filepath.Join(m.profilesDir, fmt.Sprintf("%s.yaml", name))
	data, err := os.ReadFile(path)
	if err != nil {
		path = filepath.Join(m.profilesDir, fmt.Sprintf("%s.yml", name))
		data, err = os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("profile %q not found: %w", name, err)
		}
	}

	var prof ProfileConfig
	if err := yaml.Unmarshal(data, &prof); err != nil {
		return nil, fmt.Errorf("failed to parse profile %q: %w", name, err)
	}
	return &prof, nil
}

// ApplyPreset applies preset mappings (cheap, default, premium) and persists models.yaml.
func (m *ModelsManager) ApplyPreset(preset string) error {
	cfg, err := m.ensureLoaded()
	if err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	var targetPreset map[string]string
	switch strings.ToLower(preset) {
	case "cheap":
		targetPreset = CheapPresetAgents
	case "default":
		targetPreset = DefaultPresetAgents
	case "premium":
		targetPreset = PremiumPresetAgents
	default:
		return fmt.Errorf("unknown preset %q: supported presets are 'cheap', 'default', 'premium'", preset)
	}

	// Update agent assignments based on target preset
	for agent, tier := range targetPreset {
		cfg.Agents[agent] = tier
	}

	return m.SaveModels(cfg)
}

// GetActivePreset evaluates current agent assignments and returns the matching preset name.
func (m *ModelsManager) GetActivePreset() (string, error) {
	cfg, err := m.ensureLoaded()
	if err != nil {
		return "", err
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	if reflect.DeepEqual(cfg.Agents, CheapPresetAgents) {
		return "cheap", nil
	}
	if reflect.DeepEqual(cfg.Agents, PremiumPresetAgents) {
		return "premium", nil
	}
	if reflect.DeepEqual(cfg.Agents, DefaultPresetAgents) {
		return "default", nil
	}

	// Heuristic match if minor extra agents exist: compare core agents
	coreAgents := []string{"sdd-propose", "sdd-design", "sdd-apply", "sdd-verify", "_default"}
	matches := func(presetMap map[string]string) bool {
		for _, a := range coreAgents {
			if cfg.Agents[a] != presetMap[a] {
				return false
			}
		}
		return true
	}

	if matches(CheapPresetAgents) {
		return "cheap", nil
	}
	if matches(PremiumPresetAgents) {
		return "premium", nil
	}
	if matches(DefaultPresetAgents) {
		return "default", nil
	}

	return "custom", nil
}

// NormalizeProfileName normalizes profile aliases (Economy, Balanced, Max Quality, etc.) to internal names (cheap, default, premium).
func NormalizeProfileName(profile string) string {
	p := strings.TrimSpace(strings.ToLower(profile))
	switch {
	case strings.Contains(p, "economy") || strings.Contains(p, "cheap") || strings.Contains(p, "ahorro") || strings.Contains(p, "econ"):
		return "cheap"
	case strings.Contains(p, "max") || strings.Contains(p, "premium") || strings.Contains(p, "quality"):
		return "premium"
	default:
		return "default" // Balanced (recommended)
	}
}

// ApplyProfile applies a normalized profile name (Economy, Balanced, Max Quality).
func (m *ModelsManager) ApplyProfile(profile string) error {
	normalized := NormalizeProfileName(profile)
	return m.ApplyPreset(normalized)
}

// ResetToProfileDefaults resets all agent-to-tier mappings and target configurations to the profile defaults.
func (m *ModelsManager) ResetToProfileDefaults(profile string) error {
	normalized := NormalizeProfileName(profile)
	return m.ApplyPreset(normalized)
}

// SetTargetAssignments replaces in-memory per-agent models for one target.
func (m *ModelsManager) SetTargetAssignments(targetID string, picks []AgentAssignment) error {
	cfg, err := m.ensureLoaded()
	if err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if cfg.Assignments == nil {
		cfg.Assignments = make(map[string]map[string]AgentAssignment)
	}
	cfg.Assignments[targetID] = ZipAssignments(targetID, picks)
	return nil
}

// SaveTargetAssignments persists per-agent models for one target.
func (m *ModelsManager) SaveTargetAssignments(targetID string, picks []AgentAssignment) error {
	if err := m.SetTargetAssignments(targetID, picks); err != nil {
		return err
	}
	return m.Save()
}

// SaveAllTargetAssignments persists per-agent models for several targets in one write.
func (m *ModelsManager) SaveAllTargetAssignments(byTarget map[string][]AgentAssignment) error {
	cfg, err := m.ensureLoaded()
	if err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if cfg.Assignments == nil {
		cfg.Assignments = make(map[string]map[string]AgentAssignment)
	}
	for id, picks := range byTarget {
		cfg.Assignments[id] = ZipAssignments(id, picks)
	}
	return m.SaveModels(cfg)
}

// ApplyPresetToTarget writes the preset template into assignments for a target
// without changing the global agents table.
func (m *ModelsManager) ApplyPresetToTarget(preset, targetID string) error {
	cfg, err := m.ensureLoaded()
	if err != nil {
		return err
	}
	picks := SeedAgentPicks(cfg, targetID, preset)
	return m.SaveTargetAssignments(targetID, picks)
}
