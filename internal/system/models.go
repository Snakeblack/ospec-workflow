package system

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// ProviderSpec represents a detected LLM provider and its availability status.
type ProviderSpec struct {
	ID          string   `json:"id"`
	DisplayName string   `json:"display_name"`
	Type        string   `json:"type"` // "local" | "cloud"
	Status      string   `json:"status"` // "Online", "Configured", "Missing Key", "Offline"
	Endpoint    string   `json:"endpoint,omitempty"`
	Models      []string `json:"models"`
	Evidence    string   `json:"evidence"`
	IsAvailable bool     `json:"is_available"`
}

// LocalModelInfo holds metadata for models discovered from local daemons (e.g. Ollama).
type LocalModelInfo struct {
	Name       string `json:"name"`
	Size       string `json:"size"`
	Family     string `json:"family"`
	ModifiedAt string `json:"modified_at"`
}

// ModelsInspectionReport encapsulates detected providers, local models, and configured tiers.
type ModelsInspectionReport struct {
	Providers      []ProviderSpec               `json:"providers"`
	LocalModels    []LocalModelInfo             `json:"local_models"`
	ActivePreset   string                       `json:"active_preset"`
	Tiers          map[string]map[string]string `json:"tiers"`
	AvailableCount int                          `json:"available_count"`
}

type ollamaTagsResponse struct {
	Models []struct {
		Name       string    `json:"name"`
		Size       int64     `json:"size"`
		ModifiedAt time.Time `json:"modified_at"`
		Details    struct {
			Family string `json:"family"`
		} `json:"details"`
	} `json:"models"`
}

func formatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

// QueryLocalOllama checks if an Ollama daemon is running and returns discovered models.
func QueryLocalOllama(ctx context.Context, customHost ...string) (bool, []LocalModelInfo, error) {
	host := "http://localhost:11434"
	if envHost := os.Getenv("OLLAMA_HOST"); envHost != "" {
		host = envHost
		if !strings.HasPrefix(host, "http://") && !strings.HasPrefix(host, "https://") {
			host = "http://" + host
		}
	}
	if len(customHost) > 0 && customHost[0] != "" {
		host = customHost[0]
	}

	url := strings.TrimRight(host, "/") + "/api/tags"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return false, nil, err
	}

	client := &http.Client{Timeout: 300 * time.Millisecond}
	resp, err := client.Do(req)
	if err != nil {
		return false, nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, nil, fmt.Errorf("unexpected status: %s", resp.Status)
	}

	var data ollamaTagsResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return false, nil, err
	}

	results := make([]LocalModelInfo, 0, len(data.Models))
	for _, m := range data.Models {
		fam := m.Details.Family
		if fam == "" {
			fam = "unknown"
		}
		results = append(results, LocalModelInfo{
			Name:       m.Name,
			Size:       formatBytes(m.Size),
			Family:     fam,
			ModifiedAt: m.ModifiedAt.Format("2006-01-02"),
		})
	}

	return true, results, nil
}

// InspectProviders detects all available local and cloud LLM providers.
func InspectProviders(ctx context.Context) ([]ProviderSpec, []LocalModelInfo) {
	providers := make([]ProviderSpec, 0)
	var localModels []LocalModelInfo

	// 1. Local Providers: Ollama
	ollamaOnline, oModels, _ := QueryLocalOllama(ctx)
	if ollamaOnline {
		localModels = oModels
		modelNames := make([]string, 0, len(oModels))
		for _, m := range oModels {
			modelNames = append(modelNames, m.Name)
		}
		providers = append(providers, ProviderSpec{
			ID:          "ollama",
			DisplayName: "Ollama (Local)",
			Type:        "local",
			Status:      "Online",
			Endpoint:    "http://localhost:11434",
			Models:      modelNames,
			Evidence:    fmt.Sprintf("Daemon online (%d modelos instalados)", len(oModels)),
			IsAvailable: true,
		})
	} else {
		providers = append(providers, ProviderSpec{
			ID:          "ollama",
			DisplayName: "Ollama (Local)",
			Type:        "local",
			Status:      "Offline",
			Endpoint:    "http://localhost:11434",
			Models:      nil,
			Evidence:    "Daemon no responde en localhost:11434",
			IsAvailable: false,
		})
	}

	// 2. Cloud Providers
	cloudDefs := []struct {
		id          string
		displayName string
		envKeys     []string
		models      []string
	}{
		{
			id:          "anthropic",
			displayName: "Anthropic",
			envKeys:     []string{"ANTHROPIC_API_KEY"},
			models:      []string{"claude-3-7-sonnet", "claude-3-5-sonnet", "claude-3-5-haiku", "claude-3-opus"},
		},
		{
			id:          "openai",
			displayName: "OpenAI",
			envKeys:     []string{"OPENAI_API_KEY"},
			models:      []string{"gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-4o", "o3-mini", "o1"},
		},
		{
			id:          "google",
			displayName: "Google Gemini",
			envKeys:     []string{"GEMINI_API_KEY", "GOOGLE_API_KEY"},
			models:      []string{"gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash-thinking"},
		},
		{
			id:          "deepseek",
			displayName: "DeepSeek",
			envKeys:     []string{"DEEPSEEK_API_KEY"},
			models:      []string{"deepseek-chat", "deepseek-reasoner"},
		},
		{
			id:          "openrouter",
			displayName: "OpenRouter",
			envKeys:     []string{"OPENROUTER_API_KEY"},
			models:      []string{"openrouter/auto", "anthropic/*", "openai/*", "meta-llama/*"},
		},
		{
			id:          "groq",
			displayName: "Groq",
			envKeys:     []string{"GROQ_API_KEY"},
			models:      []string{"llama-3.3-70b-versatile", "mixtral-8x7b-32768", "qwen-2.5-coder-32b"},
		},
	}

	for _, c := range cloudDefs {
		keyFound := ""
		for _, k := range c.envKeys {
			if val := os.Getenv(k); val != "" {
				keyFound = k
				break
			}
		}

		if keyFound != "" {
			providers = append(providers, ProviderSpec{
				ID:          c.id,
				DisplayName: c.displayName,
				Type:        "cloud",
				Status:      "Configured",
				Models:      c.models,
				Evidence:    fmt.Sprintf("API Key detectada ($%s)", keyFound),
				IsAvailable: true,
			})
		} else {
			providers = append(providers, ProviderSpec{
				ID:          c.id,
				DisplayName: c.displayName,
				Type:        "cloud",
				Status:      "Missing Key",
				Models:      c.models,
				Evidence:    fmt.Sprintf("Falta variable de entorno $%s", c.envKeys[0]),
				IsAvailable: false,
			})
		}
	}

	return providers, localModels
}

// InspectModelsFull inspects providers, models, and tiers for a repository.
func InspectModelsFull(repoRoot string) ModelsInspectionReport {
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	providers, localModels := InspectProviders(ctx)

	availCount := 0
	for _, p := range providers {
		if p.IsAvailable {
			availCount++
		}
	}

	// Load models.yaml tiers
	tiers := make(map[string]map[string]string)
	activePreset := "default"

	modelsPath := filepath.Join(repoRoot, "models.yaml")
	if data, err := os.ReadFile(modelsPath); err == nil {
		var raw struct {
			Agents map[string]string `yaml:"agents"`
			Tiers  map[string]struct {
				Claude   string `yaml:"claude"`
				OpenCode string `yaml:"opencode"`
				Cursor   string `yaml:"cursor"`
				Codex    any    `yaml:"codex"`
				VSCode   any    `yaml:"vscode"`
			} `yaml:"tiers"`
		}
		if err := yaml.Unmarshal(data, &raw); err == nil {
			for tierName, t := range raw.Tiers {
				m := make(map[string]string)
				if t.Claude != "" {
					m["claude"] = t.Claude
				}
				if t.OpenCode != "" {
					m["opencode"] = t.OpenCode
				}
				if t.Cursor != "" {
					m["cursor"] = t.Cursor
				}
				if t.Codex != nil {
					switch cv := t.Codex.(type) {
					case string:
						m["codex"] = cv
					case map[string]any:
						if modelVal, ok := cv["model"].(string); ok {
							m["codex"] = modelVal
						}
					}
				}
				if t.VSCode != nil {
					switch vv := t.VSCode.(type) {
					case string:
						m["vscode"] = vv
					case []any:
						if len(vv) > 0 {
							m["vscode"] = fmt.Sprintf("%v", vv[0])
						}
					}
				}
				tiers[tierName] = m
			}
		}
	}

	return ModelsInspectionReport{
		Providers:      providers,
		LocalModels:    localModels,
		ActivePreset:   activePreset,
		Tiers:          tiers,
		AvailableCount: availCount,
	}
}
