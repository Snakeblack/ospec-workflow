package system

import (
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	ospecPluginMarketplace = "snakeblack/ospec-workflow"
	ospecPluginName        = "ospec-workflow"
	ospecPluginRelDir      = "github.com/snakeblack/ospec-workflow"
	installedJSONVersion   = 1
)

var pluginsEnabledRe = regexp.MustCompile(`"chat\.plugins\.enabled"\s*:\s*(true|false)`)

// InstalledPluginEntry is one record in VS Code's agent-plugins/installed.json.
type InstalledPluginEntry struct {
	PluginURI   string `json:"pluginUri"`
	Marketplace string `json:"marketplace"`
	Name        string `json:"name,omitempty"`
}

type installedJSONFile struct {
	Version   int                    `json:"version"`
	Installed []InstalledPluginEntry `json:"installed"`
}

type agentPluginHome struct {
	Name string
	Dir  string
}

// VSCodeOspecPluginDir is ~/.vscode/agent-plugins/github.com/snakeblack/ospec-workflow.
func VSCodeOspecPluginDir(home string) string {
	return filepath.Join(home, ".vscode", "agent-plugins", filepath.FromSlash(ospecPluginRelDir))
}

// VSCodeAgentPluginHomes returns agent-plugins roots beside extensions (.vscode / .vscode-insiders).
func VSCodeAgentPluginHomes(p HostProbe) []agentPluginHome {
	home := p.home()
	homes := []agentPluginHome{{
		Name: "VS Code",
		Dir:  filepath.Join(home, ".vscode", "agent-plugins"),
	}}
	insidersDir := filepath.Join(home, ".vscode-insiders", "agent-plugins")
	if p.exists(filepath.Join(home, ".vscode-insiders")) || insidersSettingsExist(p) {
		homes = append(homes, agentPluginHome{Name: "VS Code Insiders", Dir: insidersDir})
	}
	return homes
}

func insidersSettingsExist(p HostProbe) bool {
	for _, file := range VSCodeSettingsPathsWith(p) {
		if strings.Contains(file.Name, "Insiders") && (p.exists(file.Path) || p.exists(filepath.Dir(file.Path))) {
			return true
		}
	}
	return false
}

// FileURI converts an absolute filesystem path to a file:// URI like VS Code's URI.file().
func FileURI(absPath string) string {
	slashed := filepath.ToSlash(filepath.Clean(absPath))
	if !strings.HasPrefix(slashed, "/") {
		slashed = "/" + slashed
	}
	return (&url.URL{Scheme: "file", Path: slashed}).String()
}

// UpsertInstalledJSON adds or updates the ospec-workflow entry without dropping other plugins.
func UpsertInstalledJSON(raw, pluginURI string) ([]byte, error) {
	doc := installedJSONFile{Version: installedJSONVersion}
	trimmed := strings.TrimSpace(raw)
	if trimmed != "" {
		if err := json.Unmarshal([]byte(trimmed), &doc); err != nil {
			return nil, fmt.Errorf("installed.json inválido: %w", err)
		}
	}
	if doc.Version == 0 {
		doc.Version = installedJSONVersion
	}

	entry := InstalledPluginEntry{
		PluginURI:   pluginURI,
		Marketplace: ospecPluginMarketplace,
		Name:        ospecPluginName,
	}
	found := false
	for i, existing := range doc.Installed {
		if isOspecInstalledEntry(existing) {
			doc.Installed[i] = entry
			found = true
			break
		}
	}
	if !found {
		doc.Installed = append(doc.Installed, entry)
	}

	out, err := json.MarshalIndent(doc, "", "\t")
	if err != nil {
		return nil, err
	}
	return append(out, '\n'), nil
}

func isOspecInstalledEntry(entry InstalledPluginEntry) bool {
	if entry.Name == ospecPluginName && entry.Marketplace == ospecPluginMarketplace {
		return true
	}
	uri := strings.ToLower(filepath.ToSlash(entry.PluginURI))
	return strings.Contains(uri, "/github.com/snakeblack/ospec-workflow")
}

// CopyDir replaces dest with a copy of src. Dest is removed first if it exists.
func CopyDir(src, dest string) error {
	info, err := os.Stat(src)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("plugin source is not a directory: %s", src)
	}
	if err := os.RemoveAll(dest); err != nil {
		return err
	}
	return copyDirRecursive(src, dest)
}

func copyDirRecursive(src, dest string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return os.MkdirAll(dest, 0755)
		}
		if info.IsDir() && (info.Name() == ".git" || info.Name() == "node_modules") {
			return filepath.SkipDir
		}
		target := filepath.Join(dest, rel)
		if info.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}
		return copyFile(path, target)
	})
}

func copyFile(src, dest string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dest, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

// InstallIntoAgentPlugins copies the generated plugin into each agent-plugins home and upserts installed.json.
func InstallIntoAgentPlugins(source string, p HostProbe) (string, int, error) {
	abs, err := filepath.Abs(source)
	if err != nil {
		return "", 0, err
	}
	if _, err := os.Stat(abs); err != nil {
		return "", 0, fmt.Errorf("plugin source: %w", err)
	}

	homes := VSCodeAgentPluginHomes(p)
	if len(homes) == 0 {
		return "", 0, fmt.Errorf("no VS Code agent-plugins home")
	}

	var firstDest string
	written := 0
	var lastErr error
	for _, home := range homes {
		dest := filepath.Join(home.Dir, filepath.FromSlash(ospecPluginRelDir))
		if err := CopyDir(abs, dest); err != nil {
			lastErr = fmt.Errorf("%s: copy: %w", home.Name, err)
			continue
		}
		manifestPath := filepath.Join(home.Dir, "installed.json")
		raw := ""
		if data, err := os.ReadFile(manifestPath); err == nil {
			raw = string(data)
		}
		updated, err := UpsertInstalledJSON(raw, FileURI(dest))
		if err != nil {
			lastErr = fmt.Errorf("%s: %w", home.Name, err)
			continue
		}
		if err := os.MkdirAll(home.Dir, 0755); err != nil {
			lastErr = err
			continue
		}
		if err := os.WriteFile(manifestPath, updated, 0644); err != nil {
			lastErr = err
			continue
		}
		if firstDest == "" {
			firstDest = dest
		}
		written++
	}
	if written == 0 {
		if lastErr != nil {
			return "", 0, lastErr
		}
		return "", 0, fmt.Errorf("no se pudo instalar el plugin en agent-plugins")
	}
	return firstDest, written, lastErr
}

// UpdatePluginsEnabledJSONC sets chat.plugins.enabled to true, preserving comments.
func UpdatePluginsEnabledJSONC(rawContent string) (pluginLocationsUpdate, error) {
	if _, err := parseJSONCObject(rawContent); err != nil {
		return pluginLocationsUpdate{}, fmt.Errorf("failed to parse JSONC settings.json: %w", err)
	}
	parsed, _ := parseJSONCObject(rawContent)
	if enabled, ok := parsed["chat.plugins.enabled"].(bool); ok && enabled {
		return pluginLocationsUpdate{Content: rawContent, Updated: false}, nil
	}

	var finalContent string
	if pluginsEnabledRe.MatchString(rawContent) {
		finalContent = pluginsEnabledRe.ReplaceAllString(rawContent, `"chat.plugins.enabled": true`)
	} else {
		firstBrace := strings.Index(rawContent, "{")
		if firstBrace == -1 {
			finalContent = "{\n  \"chat.plugins.enabled\": true\n}\n"
		} else {
			finalContent = rawContent[:firstBrace+1] + "\n  \"chat.plugins.enabled\": true," + rawContent[firstBrace+1:]
		}
	}

	recheck, err := parseJSONCObject(finalContent)
	if err != nil {
		return pluginLocationsUpdate{}, fmt.Errorf("failed to parse JSONC settings.json (post-edit): %w", err)
	}
	if enabled, ok := recheck["chat.plugins.enabled"].(bool); !ok || !enabled {
		return pluginLocationsUpdate{}, fmt.Errorf("failed to verify updated settings.json: chat.plugins.enabled is not true")
	}
	return pluginLocationsUpdate{Content: finalContent, Updated: true}, nil
}
