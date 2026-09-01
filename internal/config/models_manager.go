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
