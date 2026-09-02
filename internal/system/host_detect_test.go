package system_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/snakeblack/ospec-workflow/internal/system"
)

func TestDetectHostClientsWith_VSCodeAndCursor(t *testing.T) {
	home := t.TempDir()
	codeUser := filepath.Join(home, "AppData", "Roaming", "Code", "User")
	if err := os.MkdirAll(codeUser, 0755); err != nil {
		t.Fatal(err)
	}
	cursor := filepath.Join(home, ".cursor")
	if err := os.MkdirAll(cursor, 0755); err != nil {
		t.Fatal(err)
	}

	found := system.DetectHostClientsWith(system.HostProbe{
		Home:     home,
		Platform: "windows",
		Env:      map[string]string{"APPDATA": filepath.Join(home, "AppData", "Roaming")},
		LookPath: func(string) (string, error) { return "", os.ErrNotExist },
	})

	if !found["vscode"] {
		t.Error("expected vscode to be detected when Code/User exists")
	}
	if !found["cursor"] {
		t.Error("expected cursor to be detected when ~/.cursor exists")
	}
	if found["claude"] {
		t.Error("did not expect claude without binary on PATH")
	}
}

func TestDetectHostClientsWith_GitHubCopilot(t *testing.T) {
	home := t.TempDir()
	copilotDir := filepath.Join(home, ".copilot")
	if err := os.MkdirAll(copilotDir, 0755); err != nil {
		t.Fatal(err)
	}

	found := system.DetectHostClientsWith(system.HostProbe{
		Home:     home,
		Platform: "linux",
		LookPath: func(string) (string, error) { return "", os.ErrNotExist },
	})

	if !found["github-copilot"] {
		t.Error("expected github-copilot to be detected when ~/.copilot exists")
	}
}

func TestDetectHostClientsWith_EmptyHost(t *testing.T) {
	home := t.TempDir()
	found := system.DetectHostClientsWith(system.HostProbe{
		Home:     home,
		Platform: "linux",
		LookPath: func(string) (string, error) { return "", os.ErrNotExist },
	})
	if len(found) != 0 {
		t.Errorf("expected no clients, got %#v", found)
	}
}

func TestUpdatePluginLocationsJSONC_InsertAndIdempotent(t *testing.T) {
	initial := `// Custom user configuration
{
  /* Primary theme */
  "workbench.colorTheme": "Default Dark+",
  "editor.fontSize": 14, // Line comment
}
`
	pluginPath := "C:/dev/ospec-workflow/dist/vscode"
	first, err := system.UpdatePluginLocationsJSONC(initial, pluginPath)
	if err != nil {
		t.Fatalf("first update: %v", err)
	}
	if !first.Updated {
		t.Fatal("expected first update to modify settings")
	}
	for _, needle := range []string{
		"// Custom user configuration",
		"/* Primary theme */",
		"// Line comment",
		"chat.pluginLocations",
		"C:/dev/ospec-workflow/dist/vscode",
	} {
		if !strings.Contains(first.Content, needle) {
			t.Errorf("updated JSONC missing %q:\n%s", needle, first.Content)
		}
	}

	second, err := system.UpdatePluginLocationsJSONC(first.Content, pluginPath)
	if err != nil {
		t.Fatalf("second update: %v", err)
	}
	if second.Updated {
		t.Error("expected second update to be idempotent")
	}
}

func TestUpdatePluginLocationsJSONC_ScalarAndInvalid(t *testing.T) {
	scalar := "{\n  \"editor.fontSize\": 14,\n  \"chat.pluginLocations\": \"C:/other-plugin\"\n}"
	out, err := system.UpdatePluginLocationsJSONC(scalar, "C:/dev/ospec-workflow/dist/vscode")
	if err != nil {
		t.Fatalf("scalar update: %v", err)
	}
	if !out.Updated {
		t.Fatal("expected scalar chat.pluginLocations to be converted to array")
	}
	if !strings.Contains(out.Content, "C:/other-plugin") || !strings.Contains(out.Content, "C:/dev/ospec-workflow/dist/vscode") {
		t.Errorf("scalar conversion missing paths:\n%s", out.Content)
	}

	_, err = system.UpdatePluginLocationsJSONC("{\n  \"unclosed\": \"missing quote\n}", "/x")
	if err == nil {
		t.Fatal("expected invalid JSONC to fail")
	}
}

func TestRegisterVSCodePluginWith_WritesSettings(t *testing.T) {
	home := t.TempDir()
	userDir := filepath.Join(home, ".config", "Code", "User")
	if err := os.MkdirAll(userDir, 0755); err != nil {
		t.Fatal(err)
	}
	settingsPath := filepath.Join(userDir, "settings.json")
	if err := os.WriteFile(settingsPath, []byte("{\n  \"editor.fontSize\": 14\n}\n"), 0644); err != nil {
		t.Fatal(err)
	}
	pluginDir := filepath.Join(home, "plugin")
	if err := os.MkdirAll(filepath.Join(pluginDir, "agents"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(pluginDir, ".plugin.json"), []byte(`{"name":"ospec-workflow"}`), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(pluginDir, "agents", "sdd-apply.agent.md"), []byte("---\ntarget: vscode\n---\n"), 0644); err != nil {
		t.Fatal(err)
	}

	n, err := system.RegisterVSCodePluginWith(
		pluginDir,
		system.HostProbe{
			Home:     home,
			Platform: "linux",
		},
		os.ReadFile,
		os.WriteFile,
		os.MkdirAll,
		os.Stat,
	)
	if err != nil {
		t.Fatalf("RegisterVSCodePluginWith: %v", err)
	}
	if n == 0 {
		t.Fatal("expected at least one settings file written")
	}
	installed := filepath.Join(home, ".vscode", "agent-plugins", "github.com", "snakeblack", "ospec-workflow")
	if _, err := os.Stat(filepath.Join(installed, ".plugin.json")); err != nil {
		t.Fatalf("plugin was not copied to agent-plugins: %v", err)
	}
	manifest, err := os.ReadFile(filepath.Join(home, ".vscode", "agent-plugins", "installed.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(manifest), "ospec-workflow") {
		t.Errorf("installed.json missing plugin:\n%s", manifest)
	}
	raw, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "chat.plugins.enabled") {
		t.Errorf("settings.json missing chat.plugins.enabled:\n%s", raw)
	}
	if !strings.Contains(string(raw), "chat.agentFilesLocations") || !strings.Contains(string(raw), "agent-plugins") {
		t.Errorf("settings.json missing agent-plugins agentFilesLocations:\n%s", raw)
	}
}

func TestUpdateAgentFilesLocationsJSONC_InsertAndIdempotent(t *testing.T) {
	initial := `{
  "chat.pluginLocations": [
    "C:/dev/ospec-workflow/dist/vscode"
  ]
}
`
	agentsPath := "C:/dev/ospec-workflow/dist/vscode/agents"
	first, err := system.UpdateAgentFilesLocationsJSONC(initial, agentsPath)
	if err != nil {
		t.Fatalf("first update: %v", err)
	}
	if !first.Updated {
		t.Fatal("expected first update to add chat.agentFilesLocations")
	}
	if !strings.Contains(first.Content, `"chat.agentFilesLocations"`) {
		t.Fatalf("missing agentFilesLocations:\n%s", first.Content)
	}
	if !strings.Contains(first.Content, `"C:/dev/ospec-workflow/dist/vscode/agents": true`) {
		t.Fatalf("missing agents path:\n%s", first.Content)
	}

	second, err := system.UpdateAgentFilesLocationsJSONC(first.Content, agentsPath)
	if err != nil {
		t.Fatalf("second update: %v", err)
	}
	if second.Updated {
		t.Error("expected second update to be idempotent")
	}
}

func TestUpdateVSCodePluginSettingsJSONC_AddsAgentFilesWhenPluginAlreadyRegistered(t *testing.T) {
	initial := `{
  "chat.pluginLocations": [
    "C:/dev/ospec-workflow/dist/vscode"
  ]
}
`
	out, err := system.UpdateVSCodePluginSettingsJSONC(initial, "C:/dev/ospec-workflow/dist/vscode")
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if !out.Updated {
		t.Fatal("expected agentFilesLocations to be added even when pluginLocations is already set")
	}
	if !strings.Contains(out.Content, "chat.pluginLocations") {
		t.Fatalf("lost pluginLocations:\n%s", out.Content)
	}
	if !strings.Contains(out.Content, `"C:/dev/ospec-workflow/dist/vscode/agents": true`) {
		t.Fatalf("missing agents path:\n%s", out.Content)
	}
	if !strings.Contains(out.Content, `"chat.plugins.enabled": true`) {
		t.Fatalf("missing plugins.enabled:\n%s", out.Content)
	}
	if !strings.Contains(out.Content, `"snakeblack/ospec-workflow"`) {
		t.Fatalf("missing marketplace:\n%s", out.Content)
	}
}

func TestUpdatePluginsMarketplacesJSONC_InsertAndIdempotent(t *testing.T) {
	initial := `{
  // User settings
  "editor.fontSize": 14
}
`
	out, err := system.UpdatePluginsMarketplacesJSONC(initial, "snakeblack/ospec-workflow")
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if !out.Updated {
		t.Fatal("expected marketplaces to be updated")
	}
	if !strings.Contains(out.Content, `"snakeblack/ospec-workflow"`) {
		t.Fatalf("missing marketplace in:\n%s", out.Content)
	}
	if !strings.Contains(out.Content, "// User settings") {
		t.Fatalf("lost comment in:\n%s", out.Content)
	}

	second, err := system.UpdatePluginsMarketplacesJSONC(out.Content, "snakeblack/ospec-workflow")
	if err != nil {
		t.Fatalf("second update: %v", err)
	}
	if second.Updated {
		t.Fatal("expected second update to be idempotent")
	}
}

