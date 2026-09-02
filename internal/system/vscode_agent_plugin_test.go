package system_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/snakeblack/ospec-workflow/internal/system"
)

func TestFileURI_UnixPath(t *testing.T) {
	got := system.FileURI("/home/user/.vscode/agent-plugins/github.com/snakeblack/ospec-workflow")
	want := "file:///home/user/.vscode/agent-plugins/github.com/snakeblack/ospec-workflow"
	if got != want {
		t.Fatalf("FileURI = %q, want %q", got, want)
	}
}

func TestUpsertInstalledJSON_AddsAndPreserves(t *testing.T) {
	existing := `{
	"version": 1,
	"installed": [
		{
			"pluginUri": "file:///home/user/.vscode/agent-plugins/github.com/microsoft/plugins/plugins/other",
			"marketplace": "microsoft/plugins",
			"name": "other"
		}
	]
}
`
	pluginURI := "file:///home/user/.vscode/agent-plugins/github.com/snakeblack/ospec-workflow"
	out, err := system.UpsertInstalledJSON(existing, pluginURI)
	if err != nil {
		t.Fatal(err)
	}
	var parsed struct {
		Version   int `json:"version"`
		Installed []struct {
			PluginURI   string `json:"pluginUri"`
			Marketplace string `json:"marketplace"`
			Name        string `json:"name"`
		} `json:"installed"`
	}
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed.Version != 1 {
		t.Fatalf("version = %d", parsed.Version)
	}
	if len(parsed.Installed) != 2 {
		t.Fatalf("installed len = %d, want 2\n%s", len(parsed.Installed), out)
	}
	if parsed.Installed[0].Name != "other" {
		t.Fatalf("lost existing plugin: %+v", parsed.Installed[0])
	}
	ospec := parsed.Installed[1]
	if ospec.Name != "ospec-workflow" || ospec.Marketplace != "snakeblack/ospec-workflow" || ospec.PluginURI != pluginURI {
		t.Fatalf("ospec entry = %+v", ospec)
	}

	again, err := system.UpsertInstalledJSON(string(out), pluginURI)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(again, &parsed); err != nil {
		t.Fatal(err)
	}
	if len(parsed.Installed) != 2 {
		t.Fatalf("idempotent upsert grew the list: %d\n%s", len(parsed.Installed), again)
	}
}

func TestUpsertInstalledJSON_EmptyCreatesManifest(t *testing.T) {
	out, err := system.UpsertInstalledJSON("", "file:///tmp/ospec")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(out), `"version": 1`) {
		t.Fatalf("missing version:\n%s", out)
	}
	if !strings.Contains(string(out), "ospec-workflow") {
		t.Fatalf("missing name:\n%s", out)
	}
}

func TestInstallIntoAgentPlugins_CopiesAndWritesManifest(t *testing.T) {
	home := t.TempDir()
	src := t.TempDir()
	agents := filepath.Join(src, "agents")
	if err := os.MkdirAll(agents, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, ".plugin.json"), []byte(`{"name":"ospec-workflow"}`), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(agents, "sdd-apply.agent.md"), []byte("---\ntarget: vscode\nmodel: GPT-5.6 Terra (copilot)\n---\n"), 0644); err != nil {
		t.Fatal(err)
	}

	dest, n, err := system.InstallIntoAgentPlugins(src, system.HostProbe{Home: home, Platform: "linux"})
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("homes written = %d, want 1", n)
	}
	wantDest := filepath.Join(home, ".vscode", "agent-plugins", "github.com", "snakeblack", "ospec-workflow")
	if dest != wantDest {
		t.Fatalf("dest = %q want %q", dest, wantDest)
	}
	copied, err := os.ReadFile(filepath.Join(dest, "agents", "sdd-apply.agent.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(copied), "target: vscode") || !strings.Contains(string(copied), "model:") {
		t.Fatalf("copied agent missing frontmatter:\n%s", copied)
	}
	raw, err := os.ReadFile(filepath.Join(home, ".vscode", "agent-plugins", "installed.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "file://") || !strings.Contains(string(raw), "snakeblack/ospec-workflow") {
		t.Fatalf("installed.json:\n%s", raw)
	}
}

func TestUpdatePluginsEnabledJSONC(t *testing.T) {
	first, err := system.UpdatePluginsEnabledJSONC("{\n  \"editor.fontSize\": 14\n}\n")
	if err != nil {
		t.Fatal(err)
	}
	if !first.Updated || !strings.Contains(first.Content, `"chat.plugins.enabled": true`) {
		t.Fatalf("enable insert failed:\n%s", first.Content)
	}
	second, err := system.UpdatePluginsEnabledJSONC(first.Content)
	if err != nil {
		t.Fatal(err)
	}
	if second.Updated {
		t.Fatal("expected idempotent enable")
	}
	flipped, err := system.UpdatePluginsEnabledJSONC("{\n  \"chat.plugins.enabled\": false\n}\n")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(flipped.Content, `"chat.plugins.enabled": true`) {
		t.Fatalf("did not flip false → true:\n%s", flipped.Content)
	}
}
