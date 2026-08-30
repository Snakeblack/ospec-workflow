package config

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"gopkg.in/yaml.v3"
)

// OpenSpecManager handles reading and writing openspec/config.yaml.
type OpenSpecManager struct {
	repoRoot   string
	configPath string
	mu         sync.RWMutex
	cachedCfg  *OpenSpecConfig
}

// NewOpenSpecManager constructs an OpenSpecManager for the given repoRoot.
func NewOpenSpecManager(repoRoot string) *OpenSpecManager {
	return &OpenSpecManager{
		repoRoot:   repoRoot,
		configPath: filepath.Join(repoRoot, "openspec", "config.yaml"),
	}
}

// LoadConfig reads and parses openspec/config.yaml.
func (m *OpenSpecManager) LoadConfig() (*OpenSpecConfig, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	data, err := os.ReadFile(m.configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read %s: %w", m.configPath, err)
	}

	var cfg OpenSpecConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse %s: %w", m.configPath, err)
	}

	m.cachedCfg = &cfg
	return &cfg, nil
}

// ensureLoaded ensures cached configuration is present.
func (m *OpenSpecManager) ensureLoaded() (*OpenSpecConfig, error) {
	if m.cachedCfg == nil {
		return m.LoadConfig()
	}
	return m.cachedCfg, nil
}

// GetProjectVersion returns project.version from openspec/config.yaml.
func (m *OpenSpecManager) GetProjectVersion() (string, error) {
	cfg, err := m.ensureLoaded()
	if err != nil {
		return "", err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	return cfg.Project.Version, nil
}

// GetProjectName returns project.name from openspec/config.yaml.
func (m *OpenSpecManager) GetProjectName() (string, error) {
	cfg, err := m.ensureLoaded()
	if err != nil {
		return "", err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	return cfg.Project.Name, nil
}

// Save persists the current in-memory OpenSpecConfig atomically.
func (m *OpenSpecManager) Save() error {
	m.mu.RLock()
	cfg := m.cachedCfg
	m.mu.RUnlock()

	if cfg == nil {
		return fmt.Errorf("no openspec configuration loaded to save")
	}

	return m.SaveConfig(cfg)
}

// SaveConfig persists the specified OpenSpecConfig to disk atomically.
func (m *OpenSpecManager) SaveConfig(cfg *OpenSpecConfig) error {
	return AtomicWriteYAML(m.configPath, cfg, 0644)
}
