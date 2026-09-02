package system

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// VSCodeSettingsFile is a candidate VS Code user settings.json path.
type VSCodeSettingsFile struct {
	Name string
	Path string
}

// VSCodeSettingsPaths returns user settings.json locations for the current host.
func VSCodeSettingsPaths() []VSCodeSettingsFile {
	return VSCodeSettingsPathsWith(HostProbe{})
}

// VSCodeSettingsPathsWith returns settings paths using an injectable probe.
func VSCodeSettingsPathsWith(p HostProbe) []VSCodeSettingsFile {
	home := p.home()
	platform := p.platform()
	var files []VSCodeSettingsFile
	for _, dir := range vscodeUserDirs(p, home, platform) {
		name := "VS Code"
		if strings.Contains(dir, "Insiders") {
			name = "VS Code Insiders"
		}
		files = append(files, VSCodeSettingsFile{
			Name: name,
			Path: filepath.Join(dir, "settings.json"),
		})
	}
	return files
}

type pluginLocationsUpdate struct {
	Content string
	Updated bool
}

var (
	pluginLocationsScalarRe        = regexp.MustCompile(`"chat\.pluginLocations"\s*:\s*("[^"]*"|[^,}\]\s]+)`)
	pluginLocationsArrayOpenRe     = regexp.MustCompile(`"chat\.pluginLocations"\s*:\s*\[`)
	pluginLocationsArrayBodyRe     = regexp.MustCompile(`"chat\.pluginLocations"\s*:\s*\[([\s\S]*?)\]`)
	agentFilesLocationsObjectRe    = regexp.MustCompile(`"chat\.agentFilesLocations"\s*:\s*\{([\s\S]*?)\}`)
	agentFilesLocationsArrayRe     = regexp.MustCompile(`"chat\.agentFilesLocations"\s*:\s*\[([\s\S]*?)\]`)
	agentFilesLocationsScalarRe    = regexp.MustCompile(`"chat\.agentFilesLocations"\s*:\s*("[^"]*"|[^,}\]\s]+)`)
	agentFilesLocationsArrayOpenRe = regexp.MustCompile(`"chat\.agentFilesLocations"\s*:\s*\[`)
	agentFilesLocationsCompositeRe = regexp.MustCompile(`"chat\.agentFilesLocations"\s*:\s*[\[{]`)
	pluginsMarketplacesScalarRe    = regexp.MustCompile(`"chat\.plugins\.marketplaces"\s*:\s*("[^"]*"|[^,}\]\s]+)`)
	pluginsMarketplacesArrayOpenRe = regexp.MustCompile(`"chat\.plugins\.marketplaces"\s*:\s*\[`)
	pluginsMarketplacesArrayBodyRe = regexp.MustCompile(`"chat\.plugins\.marketplaces"\s*:\s*\[([\s\S]*?)\]`)
)

// UpdatePluginLocationsJSONC adds pluginPath to chat.pluginLocations, preserving comments.
func UpdatePluginLocationsJSONC(rawContent, pluginPath string) (pluginLocationsUpdate, error) {
	if _, err := parseJSONCObject(rawContent); err != nil {
		return pluginLocationsUpdate{}, fmt.Errorf("failed to parse JSONC settings.json: %w", err)
	}

	normalized := filepath.ToSlash(pluginPath)
	parsed, _ := parseJSONCObject(rawContent)
	if containsPluginPath(parsed["chat.pluginLocations"], normalized, pluginPath) {
		return pluginLocationsUpdate{Content: rawContent, Updated: false}, nil
	}

	var finalContent string
	if pluginLocationsScalarRe.MatchString(rawContent) && !pluginLocationsArrayOpenRe.MatchString(rawContent) {
		existing := parsed["chat.pluginLocations"]
		locations := uniquePluginPaths(existing, pluginPath)
		arrayBody := "\n    " + joinJSONStrings(locations) + "\n  "
		finalContent = pluginLocationsScalarRe.ReplaceAllString(rawContent, `"chat.pluginLocations": [`+arrayBody+`]`)
	} else if match := pluginLocationsArrayBodyRe.FindStringSubmatch(rawContent); match != nil {
		arrayBody := match[1]
		cleanBody := strings.TrimSpace(arrayBody)
		var newArrayContent string
		if cleanBody == "" {
			newArrayContent = "\n    " + jsonQuote(pluginPath) + "\n  "
		} else {
			bodyWithoutTrailingComma := regexp.MustCompile(`,\s*$`).ReplaceAllString(arrayBody, "")
			newArrayContent = strings.TrimRight(bodyWithoutTrailingComma, " \t\n\r") + ",\n    " + jsonQuote(pluginPath) + "\n  "
		}
		finalContent = pluginLocationsArrayBodyRe.ReplaceAllString(rawContent, `"chat.pluginLocations": [`+newArrayContent+`]`)
	} else {
		firstBrace := strings.Index(rawContent, "{")
		if firstBrace == -1 {
			finalContent = "{\n  \"chat.pluginLocations\": [\n    " + jsonQuote(pluginPath) + "\n  ]\n}\n"
		} else {
			prefix := rawContent[:firstBrace+1]
			suffix := rawContent[firstBrace+1:]
			insertion := "\n  \"chat.pluginLocations\": [\n    " + jsonQuote(pluginPath) + "\n  ],"
			finalContent = prefix + insertion + suffix
		}
	}

	recheck, err := parseJSONCObject(finalContent)
	if err != nil {
		return pluginLocationsUpdate{}, fmt.Errorf("failed to parse JSONC settings.json (post-edit): %w", err)
	}
	if !containsPluginPath(recheck["chat.pluginLocations"], normalized, pluginPath) {
		return pluginLocationsUpdate{}, fmt.Errorf("failed to verify updated settings.json: plugin path missing in modified JSONC")
	}
	return pluginLocationsUpdate{Content: finalContent, Updated: true}, nil
}

// VSCodeAgentsDir is the custom-agent folder Copilot Chat reads via chat.agentFilesLocations.
func VSCodeAgentsDir(pluginPath string) string {
	return filepath.ToSlash(filepath.Join(pluginPath, "agents"))
}

// UpdateAgentFilesLocationsJSONC enables agentsPath in chat.agentFilesLocations (object path→bool).
func UpdateAgentFilesLocationsJSONC(rawContent, agentsPath string) (pluginLocationsUpdate, error) {
	if _, err := parseJSONCObject(rawContent); err != nil {
		return pluginLocationsUpdate{}, fmt.Errorf("failed to parse JSONC settings.json: %w", err)
	}

	normalized := filepath.ToSlash(agentsPath)
	parsed, _ := parseJSONCObject(rawContent)
	if objectHasTruePath(parsed["chat.agentFilesLocations"], normalized, agentsPath) {
		return pluginLocationsUpdate{Content: rawContent, Updated: false}, nil
	}

	var finalContent string
	if match := agentFilesLocationsObjectRe.FindStringSubmatch(rawContent); match != nil && !agentFilesLocationsArrayOpenRe.MatchString(rawContent) {
		body := match[1]
		cleanBody := strings.TrimSpace(body)
		var newBody string
		if cleanBody == "" {
			newBody = "\n    " + jsonQuote(normalized) + ": true\n  "
		} else {
			bodyWithoutTrailingComma := regexp.MustCompile(`,\s*$`).ReplaceAllString(body, "")
			newBody = strings.TrimRight(bodyWithoutTrailingComma, " \t\n\r") + ",\n    " + jsonQuote(normalized) + ": true\n  "
		}
		finalContent = agentFilesLocationsObjectRe.ReplaceAllString(rawContent, `"chat.agentFilesLocations": {`+newBody+`}`)
	} else if agentFilesLocationsScalarRe.MatchString(rawContent) && !agentFilesLocationsCompositeRe.MatchString(rawContent) {
		paths := uniqueObjectBoolPaths(parsed["chat.agentFilesLocations"], normalized)
		finalContent = agentFilesLocationsScalarRe.ReplaceAllString(rawContent, `"chat.agentFilesLocations": {`+formatObjectBoolBody(paths)+`}`)
	} else if match := agentFilesLocationsArrayRe.FindStringSubmatch(rawContent); match != nil {
		paths := uniqueObjectBoolPaths(parsed["chat.agentFilesLocations"], normalized)
		finalContent = agentFilesLocationsArrayRe.ReplaceAllString(rawContent, `"chat.agentFilesLocations": {`+formatObjectBoolBody(paths)+`}`)
	} else {
		insertion := "\n  \"chat.agentFilesLocations\": {\n    " + jsonQuote(normalized) + ": true\n  },"
		firstBrace := strings.Index(rawContent, "{")
		if firstBrace == -1 {
			finalContent = "{\n  \"chat.agentFilesLocations\": {\n    " + jsonQuote(normalized) + ": true\n  }\n}\n"
		} else {
			finalContent = rawContent[:firstBrace+1] + insertion + rawContent[firstBrace+1:]
		}
	}

	recheck, err := parseJSONCObject(finalContent)
	if err != nil {
		return pluginLocationsUpdate{}, fmt.Errorf("failed to parse JSONC settings.json (post-edit): %w", err)
	}
	if !objectHasTruePath(recheck["chat.agentFilesLocations"], normalized, agentsPath) {
		return pluginLocationsUpdate{}, fmt.Errorf("failed to verify updated settings.json: agent files path missing in modified JSONC")
	}
	return pluginLocationsUpdate{Content: finalContent, Updated: true}, nil
}

// UpdatePluginsMarketplacesJSONC ensures marketplace is in chat.plugins.marketplaces array.
func UpdatePluginsMarketplacesJSONC(rawContent, marketplace string) (pluginLocationsUpdate, error) {
	if _, err := parseJSONCObject(rawContent); err != nil {
		return pluginLocationsUpdate{}, fmt.Errorf("failed to parse JSONC settings.json: %w", err)
	}

	parsed, _ := parseJSONCObject(rawContent)
	if arrayContainsString(parsed["chat.plugins.marketplaces"], marketplace) {
		return pluginLocationsUpdate{Content: rawContent, Updated: false}, nil
	}

	var finalContent string
	if pluginsMarketplacesScalarRe.MatchString(rawContent) && !pluginsMarketplacesArrayOpenRe.MatchString(rawContent) {
		existing := parsed["chat.plugins.marketplaces"]
		list := uniqueStrings(existing, marketplace)
		arrayBody := "\n    " + joinJSONStrings(list) + "\n  "
		finalContent = pluginsMarketplacesScalarRe.ReplaceAllString(rawContent, `"chat.plugins.marketplaces": [`+arrayBody+`]`)
	} else if match := pluginsMarketplacesArrayBodyRe.FindStringSubmatch(rawContent); match != nil {
		arrayBody := match[1]
		cleanBody := strings.TrimSpace(arrayBody)
		var newArrayContent string
		if cleanBody == "" {
			newArrayContent = "\n    " + jsonQuote(marketplace) + "\n  "
		} else {
			bodyWithoutTrailingComma := regexp.MustCompile(`,\s*$`).ReplaceAllString(arrayBody, "")
			newArrayContent = strings.TrimRight(bodyWithoutTrailingComma, " \t\n\r") + ",\n    " + jsonQuote(marketplace) + "\n  "
		}
		finalContent = pluginsMarketplacesArrayBodyRe.ReplaceAllString(rawContent, `"chat.plugins.marketplaces": [`+newArrayContent+`]`)
	} else {
		firstBrace := strings.Index(rawContent, "{")
		if firstBrace == -1 {
			finalContent = "{\n  \"chat.plugins.marketplaces\": [\n    " + jsonQuote(marketplace) + "\n  ]\n}\n"
		} else {
			prefix := rawContent[:firstBrace+1]
			suffix := rawContent[firstBrace+1:]
			insertion := "\n  \"chat.plugins.marketplaces\": [\n    " + jsonQuote(marketplace) + "\n  ],"
			finalContent = prefix + insertion + suffix
		}
	}

	recheck, err := parseJSONCObject(finalContent)
	if err != nil {
		return pluginLocationsUpdate{}, fmt.Errorf("failed to parse JSONC settings.json (post-edit): %w", err)
	}
	if !arrayContainsString(recheck["chat.plugins.marketplaces"], marketplace) {
		return pluginLocationsUpdate{}, fmt.Errorf("failed to verify updated settings.json: marketplace missing in modified JSONC")
	}
	return pluginLocationsUpdate{Content: finalContent, Updated: true}, nil
}

// UpdateVSCodePluginSettingsJSONC enables agent plugins, registers the agents/ folder, and registers the marketplace.
func UpdateVSCodePluginSettingsJSONC(rawContent, pluginPath string) (pluginLocationsUpdate, error) {
	first, err := UpdatePluginsEnabledJSONC(rawContent)
	if err != nil {
		return first, err
	}
	second, err := UpdateAgentFilesLocationsJSONC(first.Content, VSCodeAgentsDir(pluginPath))
	if err != nil {
		return second, err
	}
	third, err := UpdatePluginsMarketplacesJSONC(second.Content, ospecPluginMarketplace)
	if err != nil {
		return third, err
	}
	return pluginLocationsUpdate{
		Content: third.Content,
		Updated: first.Updated || second.Updated || third.Updated,
	}, nil
}

// RegisterVSCodePlugin copies the generated plugin into ~/.vscode/agent-plugins and updates settings.
func RegisterVSCodePlugin(pluginPath string) (int, error) {
	return RegisterVSCodePluginWith(pluginPath, HostProbe{}, os.ReadFile, os.WriteFile, os.MkdirAll, os.Stat)
}

type readFileFn func(string) ([]byte, error)
type writeFileFn func(string, []byte, os.FileMode) error
type mkdirAllFn func(string, os.FileMode) error
type statFn func(string) (os.FileInfo, error)

// RegisterVSCodePluginWith registers the plugin path using injectable IO.
func RegisterVSCodePluginWith(
	pluginPath string,
	probe HostProbe,
	readFile readFileFn,
	writeFile writeFileFn,
	mkdirAll mkdirAllFn,
	stat statFn,
) (int, error) {
	if pluginPath == "" {
		return 0, fmt.Errorf("plugin path is empty")
	}
	abs, err := filepath.Abs(pluginPath)
	if err != nil {
		return 0, err
	}

	if _, err := os.Stat(abs); err == nil {
		dest, _, err := InstallIntoAgentPlugins(abs, probe)
		if err != nil {
			return 0, err
		}
		if dest != "" {
			abs = dest
		}
	}

	files := VSCodeSettingsPathsWith(probe)
	if len(files) == 0 {
		return 0, fmt.Errorf("no VS Code settings locations for platform %s", probe.platform())
	}

	updated := 0
	var lastErr error
	anyCandidate := false
	for _, file := range files {
		parent := filepath.Dir(file.Path)
		_, parentErr := stat(parent)
		_, fileErr := stat(file.Path)
		if fileErr != nil && parentErr != nil {
			continue
		}
		anyCandidate = true

		var raw string
		if fileErr == nil {
			bytes, err := readFile(file.Path)
			if err != nil {
				lastErr = fmt.Errorf("%s: %w", file.Name, err)
				continue
			}
			raw = string(bytes)
		} else {
			if err := mkdirAll(parent, 0755); err != nil {
				lastErr = err
				continue
			}
			raw = "{\n}\n"
		}

		result, err := UpdateVSCodePluginSettingsJSONC(raw, abs)
		if err != nil {
			lastErr = fmt.Errorf("%s: %w", file.Name, err)
			continue
		}
		if result.Updated {
			if err := writeFile(file.Path, []byte(result.Content), 0644); err != nil {
				lastErr = err
				continue
			}
		}
		updated++
	}

	if !anyCandidate {
		hint := vscodeManualHint(abs, probe)
		return 0, fmt.Errorf("no se encontró la carpeta de settings de VS Code. Añade este path a chat.pluginLocations:\n  %s", hint)
	}
	if updated == 0 && lastErr != nil {
		return 0, lastErr
	}
	return updated, lastErr
}

func vscodeManualHint(pluginPath string, probe HostProbe) string {
	files := VSCodeSettingsPathsWith(probe)
	if len(files) == 0 {
		return pluginPath
	}
	return files[0].Path + " -> " + pluginPath
}

func objectHasTruePath(value any, slashPath, rawPath string) bool {
	switch v := value.(type) {
	case map[string]any:
		for key, enabled := range v {
			truthy, ok := enabled.(bool)
			if !ok || !truthy {
				continue
			}
			if key == slashPath || key == rawPath || filepath.ToSlash(key) == slashPath {
				return true
			}
		}
	case string:
		return v == slashPath || v == rawPath || filepath.ToSlash(v) == slashPath
	case []any:
		return containsPluginPath(value, slashPath, rawPath)
	}
	return false
}

func uniqueObjectBoolPaths(existing any, newPath string) []string {
	var out []string
	seen := map[string]bool{}
	add := func(s string) {
		s = filepath.ToSlash(s)
		if s == "" || seen[s] {
			return
		}
		seen[s] = true
		out = append(out, s)
	}
	switch v := existing.(type) {
	case string:
		add(v)
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok {
				add(s)
			}
		}
	case map[string]any:
		for key, enabled := range v {
			if truthy, ok := enabled.(bool); ok && truthy {
				add(key)
			}
		}
	}
	add(newPath)
	return out
}

func formatObjectBoolBody(paths []string) string {
	if len(paths) == 0 {
		return "\n  "
	}
	parts := make([]string, 0, len(paths))
	for _, p := range paths {
		parts = append(parts, jsonQuote(p)+": true")
	}
	return "\n    " + strings.Join(parts, ",\n    ") + "\n  "
}

func containsPluginPath(value any, slashPath, rawPath string) bool {
	switch v := value.(type) {
	case string:
		return v == slashPath || v == rawPath || filepath.ToSlash(v) == slashPath
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok {
				if s == slashPath || s == rawPath || filepath.ToSlash(s) == slashPath {
					return true
				}
			}
		}
	}
	return false
}

func uniquePluginPaths(existing any, pluginPath string) []string {
	var out []string
	seen := map[string]bool{}
	add := func(s string) {
		if s == "" || seen[s] {
			return
		}
		seen[s] = true
		out = append(out, s)
	}
	switch v := existing.(type) {
	case string:
		add(v)
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok {
				add(s)
			}
		}
	}
	add(pluginPath)
	return out
}

func arrayContainsString(value any, target string) bool {
	switch v := value.(type) {
	case string:
		return v == target
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok && s == target {
				return true
			}
		}
	}
	return false
}

func uniqueStrings(existing any, target string) []string {
	var out []string
	seen := map[string]bool{}
	add := func(s string) {
		if s == "" || seen[s] {
			return
		}
		seen[s] = true
		out = append(out, s)
	}
	switch v := existing.(type) {
	case string:
		add(v)
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok {
				add(s)
			}
		}
	}
	add(target)
	return out
}

func joinJSONStrings(values []string) string {
	quoted := make([]string, 0, len(values))
	for _, v := range values {
		quoted = append(quoted, jsonQuote(v))
	}
	return strings.Join(quoted, ",\n    ")
}

func jsonQuote(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

func parseJSONCObject(raw string) (map[string]any, error) {
	stripped := stripTrailingCommas(stripJSONC(raw))
	var parsed map[string]any
	if err := json.Unmarshal([]byte(stripped), &parsed); err != nil {
		return nil, err
	}
	return parsed, nil
}

func stripTrailingCommas(input string) string {
	re := regexp.MustCompile(`,(\s*[}\]])`)
	return re.ReplaceAllString(input, "$1")
}

func stripJSONC(input string) string {
	var b strings.Builder
	inString := false
	inLineComment := false
	inBlockComment := false
	escaped := false
	for i := 0; i < len(input); i++ {
		ch := input[i]
		if inLineComment {
			if ch == '\n' {
				inLineComment = false
				b.WriteByte(ch)
			}
			continue
		}
		if inBlockComment {
			if ch == '*' && i+1 < len(input) && input[i+1] == '/' {
				inBlockComment = false
				i++
			}
			continue
		}
		if inString {
			b.WriteByte(ch)
			if escaped {
				escaped = false
				continue
			}
			if ch == '\\' {
				escaped = true
				continue
			}
			if ch == '"' {
				inString = false
			}
			continue
		}
		if ch == '"' {
			inString = true
			b.WriteByte(ch)
			continue
		}
		if ch == '/' && i+1 < len(input) {
			next := input[i+1]
			if next == '/' {
				inLineComment = true
				i++
				continue
			}
			if next == '*' {
				inBlockComment = true
				i++
				continue
			}
		}
		b.WriteByte(ch)
	}
	return b.String()
}
