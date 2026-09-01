package system

import (
	"fmt"
	"os"
	"path/filepath"
)

// TargetStatusKind represents the detection state level of an AI target.
type TargetStatusKind string

const (
	StatusActive     TargetStatusKind = "Active"
	StatusConfigured TargetStatusKind = "Configured"
	StatusDetected   TargetStatusKind = "Detected"
	StatusInactive   TargetStatusKind = "Inactive"
)

// ConfigFileCheck records the existence state of a specific configuration file.
type ConfigFileCheck struct {
	Path   string `json:"path"`
	Exists bool   `json:"exists"`
}

// CapabilityMatrix describes the native feature support flags for an AI target.
type CapabilityMatrix struct {
	Subagents       bool `json:"subagents"`
	Parallelism     bool `json:"parallelism"`
	Hooks           bool `json:"hooks"`
	BackgroundTasks bool `json:"background_tasks"`
	MCP             bool `json:"mcp"`
	DynamicTools    bool `json:"dynamic_tools"`
}

// TargetSpec encapsulates the full diagnostic metadata for a supported AI target.
type TargetSpec struct {
	ID           string            `json:"id"`
	DisplayName  string            `json:"display_name"`
	Status       TargetStatusKind  `json:"status"`
	ConfigFiles  []ConfigFileCheck `json:"config_files"`
	Capabilities CapabilityMatrix  `json:"capabilities"`
	Evidence     string            `json:"evidence"`
}

type targetDefinition struct {
	id           string
	displayName  string
	checks       []string
	detectCheck  []string
	capabilities CapabilityMatrix
	syncFn       func(repoRoot string) error
}

var supportedTargets = []targetDefinition{
	{
		id:          "claude",
		displayName: "Claude Code",
		checks:      []string{".claude-plugin", ".claude.json", ".claude", "CLAUDE.md"},
		detectCheck: []string{"dist/claude"},
		capabilities: CapabilityMatrix{
			Subagents:       true,
			Parallelism:     true,
			Hooks:           true,
			BackgroundTasks: true,
			MCP:             true,
			DynamicTools:    true,
		},
		syncFn: func(repoRoot string) error {
			if err := os.MkdirAll(filepath.Join(repoRoot, ".claude"), 0755); err != nil {
				return err
			}
			claudeMd := filepath.Join(repoRoot, "CLAUDE.md")
			if _, err := os.Stat(claudeMd); os.IsNotExist(err) {
				return os.WriteFile(claudeMd, []byte("# Claude Code Instructions\n"), 0644)
			}
			return nil
		},
	},
	{
		id:          "antigravity",
		displayName: "Antigravity",
		checks:      []string{"AGENTS.md", ".gemini", "GEMINI.md"},
		detectCheck: []string{"dist/antigravity"},
		capabilities: CapabilityMatrix{
			Subagents:       true,
			Parallelism:     true,
			Hooks:           true,
			BackgroundTasks: true,
			MCP:             true,
			DynamicTools:    true,
		},
		syncFn: func(repoRoot string) error {
			agentsMd := filepath.Join(repoRoot, "AGENTS.md")
			if _, err := os.Stat(agentsMd); os.IsNotExist(err) {
				if err := os.WriteFile(agentsMd, []byte("# Antigravity Agents\n"), 0644); err != nil {
					return err
				}
			}
			return os.MkdirAll(filepath.Join(repoRoot, ".gemini"), 0755)
		},
	},
	{
		id:          "vscode",
		displayName: "VS Code / Copilot",
		checks:      []string{".vscode", ".github/copilot-instructions.md", ".github/copilot"},
		detectCheck: []string{".github/workflows", "dist/vscode"},
		capabilities: CapabilityMatrix{
			Subagents:       true,
			Parallelism:     false,
			Hooks:           false,
			BackgroundTasks: false,
			MCP:             false,
			DynamicTools:    false,
		},
		syncFn: func(repoRoot string) error {
			if err := os.MkdirAll(filepath.Join(repoRoot, ".vscode"), 0755); err != nil {
				return err
			}
			if err := os.MkdirAll(filepath.Join(repoRoot, ".github"), 0755); err != nil {
				return err
			}
			copilotMd := filepath.Join(repoRoot, ".github", "copilot-instructions.md")
			if _, err := os.Stat(copilotMd); os.IsNotExist(err) {
				return os.WriteFile(copilotMd, []byte("# Copilot Instructions\n"), 0644)
			}
			return nil
		},
	},
	{
		id:          "codex",
		displayName: "Codex",
		checks:      []string{".codex", "codex.toml", ".codex.toml"},
		detectCheck: []string{"dist/codex"},
		capabilities: CapabilityMatrix{
			Subagents:       true,
			Parallelism:     true,
			Hooks:           false,
			BackgroundTasks: false,
			MCP:             false,
			DynamicTools:    false,
		},
		syncFn: func(repoRoot string) error {
			if err := os.MkdirAll(filepath.Join(repoRoot, ".codex"), 0755); err != nil {
				return err
			}
			codexToml := filepath.Join(repoRoot, "codex.toml")
			if _, err := os.Stat(codexToml); os.IsNotExist(err) {
				return os.WriteFile(codexToml, []byte("[codex]\nname = \"ospec\"\n"), 0644)
			}
			return nil
		},
	},
	{
		id:          "opencode",
		displayName: "OpenCode",
		checks:      []string{".opencode", "opencode.json", ".opencode.json"},
		detectCheck: []string{"dist/opencode"},
		capabilities: CapabilityMatrix{
			Subagents:       true,
			Parallelism:     true,
			Hooks:           true,
			BackgroundTasks: false,
			MCP:             true,
			DynamicTools:    false,
		},
		syncFn: func(repoRoot string) error {
			if err := os.MkdirAll(filepath.Join(repoRoot, ".opencode"), 0755); err != nil {
				return err
			}
			opencodeJson := filepath.Join(repoRoot, "opencode.json")
			if _, err := os.Stat(opencodeJson); os.IsNotExist(err) {
				return os.WriteFile(opencodeJson, []byte("{\n  \"$schema\": \"https://opencode.ai/schema.json\"\n}\n"), 0644)
			}
			return nil
		},
	},
	{
		id:          "cursor",
		displayName: "Cursor",
		checks:      []string{".cursorrules", ".cursor"},
		detectCheck: []string{".cursorignore", "dist/cursor"},
		capabilities: CapabilityMatrix{
			Subagents:       true,
			Parallelism:     false,
			Hooks:           true,
			BackgroundTasks: false,
			MCP:             true,
			DynamicTools:    false,
		},
		syncFn: func(repoRoot string) error {
			if err := os.MkdirAll(filepath.Join(repoRoot, ".cursor"), 0755); err != nil {
				return err
			}
			cursorRules := filepath.Join(repoRoot, ".cursorrules")
			if _, err := os.Stat(cursorRules); os.IsNotExist(err) {
				return os.WriteFile(cursorRules, []byte("# Cursor Rules\n"), 0644)
			}
			return nil
		},
	},
}

// InspectTargets scans repoRoot and inspects all supported AI targets.
func InspectTargets(repoRoot string) []TargetSpec {
	cleanRoot := filepath.Clean(repoRoot)
	results := make([]TargetSpec, 0, len(supportedTargets))

	activeEnv := os.Getenv("OSPEC_ACTIVE_TARGET")
	if activeEnv == "" {
		activeEnv = os.Getenv("AI_TARGET")
	}

	for _, def := range supportedTargets {
		spec := inspectSingle(cleanRoot, def, activeEnv)
		results = append(results, spec)
	}

	return results
}

// InspectTarget inspects a specific target by ID.
func InspectTarget(repoRoot string, targetID string) (TargetSpec, error) {
	cleanRoot := filepath.Clean(repoRoot)
	activeEnv := os.Getenv("OSPEC_ACTIVE_TARGET")
	if activeEnv == "" {
		activeEnv = os.Getenv("AI_TARGET")
	}

	for _, def := range supportedTargets {
		if def.id == targetID {
			return inspectSingle(cleanRoot, def, activeEnv), nil
		}
	}

	return TargetSpec{}, fmt.Errorf("unknown target ID: %q", targetID)
}

func inspectSingle(cleanRoot string, def targetDefinition, activeEnv string) TargetSpec {
	configFiles := make([]ConfigFileCheck, 0, len(def.checks))
	firstConfigFound := ""

	for _, check := range def.checks {
		p := filepath.Join(cleanRoot, check)
		exists := false
		if _, err := os.Stat(p); err == nil {
			exists = true
			if firstConfigFound == "" {
				firstConfigFound = check
			}
		}
		configFiles = append(configFiles, ConfigFileCheck{
			Path:   check,
			Exists: exists,
		})
	}

	firstDetectFound := ""
	for _, check := range def.detectCheck {
		p := filepath.Join(cleanRoot, check)
		if _, err := os.Stat(p); err == nil {
			if firstDetectFound == "" {
				firstDetectFound = check
			}
			break
		}
	}

	status := StatusInactive
	evidence := ""

	if activeEnv != "" && activeEnv == def.id {
		status = StatusActive
		evidence = fmt.Sprintf("Active session environment (OSPEC_ACTIVE_TARGET=%s)", def.id)
	} else if firstConfigFound != "" {
		status = StatusConfigured
		evidence = firstConfigFound
	} else if firstDetectFound != "" {
		status = StatusDetected
		evidence = firstDetectFound
	}

	return TargetSpec{
		ID:           def.id,
		DisplayName:  def.displayName,
		Status:       status,
		ConfigFiles:  configFiles,
		Capabilities: def.capabilities,
		Evidence:     evidence,
	}
}

// SyncTarget materializes or updates declarative configuration for the given target.
func SyncTarget(repoRoot string, targetID string) error {
	cleanRoot := filepath.Clean(repoRoot)
	stat, err := os.Stat(cleanRoot)
	if err != nil {
		return fmt.Errorf("cannot access repo root: %w", err)
	}
	if !stat.IsDir() {
		return fmt.Errorf("repo root %q is not a directory", cleanRoot)
	}

	for _, def := range supportedTargets {
		if def.id == targetID {
			if def.syncFn != nil {
				return def.syncFn(cleanRoot)
			}
			return nil
		}
	}

	return fmt.Errorf("unknown target ID: %q", targetID)
}
