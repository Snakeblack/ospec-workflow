package config

// ProjectConfig contains project-level metadata in OpenSpec.
type ProjectConfig struct {
	Name    string `yaml:"name"`
	Version string `yaml:"version"`
	Status  string `yaml:"status"`
}

// TestingLayers defines which testing layers are enabled.
type TestingLayers struct {
	Unit        bool `yaml:"unit"`
	Integration bool `yaml:"integration"`
	E2E         bool `yaml:"e2e"`
}

// TestingCoverage defines code coverage settings.
type TestingCoverage struct {
	Available bool `yaml:"available"`
	Command   any  `yaml:"command"`
}

// TestingQuality defines static analysis / linter settings.
type TestingQuality struct {
	Linter      bool `yaml:"linter"`
	TypeChecker bool `yaml:"type_checker"`
	Formatter   bool `yaml:"formatter"`
}

// TestingConfig models the testing suite configuration in OpenSpec.
type TestingConfig struct {
	TDDMode     string          `yaml:"tdd_mode"`
	Runner      string          `yaml:"runner"`
	TestCommand string          `yaml:"test_command"`
	RawCommand  string          `yaml:"raw_command"`
	Framework   string          `yaml:"framework"`
	Layers      TestingLayers   `yaml:"layers"`
	Coverage    TestingCoverage `yaml:"coverage"`
	Quality     TestingQuality  `yaml:"quality"`
}

// BaselineConfig tracks the state of domain baseline specifications.
type BaselineConfig struct {
	Status         string   `yaml:"status"`
	DomainsPending []string `yaml:"domains_pending"`
	DomainsDone    []string `yaml:"domains_done"`
	StaleDomains   []string `yaml:"stale_domains"`
	LastChecked    string   `yaml:"last_checked"`
}

// OpenSpecConfig models the root configuration in openspec/config.yaml.
type OpenSpecConfig struct {
	Schema        string         `yaml:"schema"`
	Context       string         `yaml:"context,omitempty"`
	Project       ProjectConfig  `yaml:"project"`
	ArtifactStore map[string]any `yaml:"artifact_store,omitempty"`
	Testing       TestingConfig  `yaml:"testing"`
	Baseline      BaselineConfig `yaml:"baseline"`
	Rules         map[string]any `yaml:"rules,omitempty"`
	Routing       any            `yaml:"routing,omitempty"`
	Extra         map[string]any `yaml:",inline"`
}
