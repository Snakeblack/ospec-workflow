package modelconfig

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// ResolveModelTier reads models.yaml from pluginRoot and resolves the tier for the given agent.
// Falls back to _default if agent is not explicitly mapped. Returns "unknown" if parsing fails or tier is invalid.
func ResolveModelTier(agent string, pluginRoot string) string {
	modelsPath := filepath.Join(pluginRoot, "models.yaml")
	file, err := os.Open(modelsPath)
	if err != nil {
		return "unknown"
	}
	defer file.Close()

	agents := make(map[string]string)
	tiers := make(map[string]bool)

	scanner := bufio.NewScanner(file)
	currentSection := ""
	currentTier := ""

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		// Calculate indentation
		indent := len(line) - len(strings.TrimLeft(line, " \t"))

		parts := strings.SplitN(trimmed, ":", 2)
		if len(parts) < 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])

		if indent == 0 {
			if key == "agents" {
				currentSection = "agents"
			} else if key == "tiers" {
				currentSection = "tiers"
			} else {
				currentSection = ""
			}
		} else if indent == 2 {
			if currentSection == "agents" {
				agents[key] = strings.Trim(val, `"'` + "`")
			} else if currentSection == "tiers" {
				currentTier = key
				tiers[currentTier] = true
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return "unknown"
	}

	tier, ok := agents[agent]
	if !ok {
		tier, ok = agents["_default"]
		if !ok {
			return "unknown"
		}
	}

	if tiers[tier] {
		return tier
	}

	return "unknown"
}
