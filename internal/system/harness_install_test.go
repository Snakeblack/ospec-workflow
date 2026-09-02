package system_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/snakeblack/ospec-workflow/internal/system"
)

func TestFindSourceRoot(t *testing.T) {
	root := t.TempDir()
	nested := filepath.Join(root, "a", "b")
	if err := os.MkdirAll(filepath.Join(root, "scripts", "configure"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "scripts", "configure", "install-vscode.js"), []byte("module.exports = {}\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(nested, 0755); err != nil {
		t.Fatal(err)
	}

	found, err := system.FindSourceRoot(nested)
	if err != nil {
		t.Fatalf("FindSourceRoot: %v", err)
	}
	if found != root {
		t.Errorf("FindSourceRoot = %q, want %q", found, root)
	}

	if _, err := system.FindSourceRoot(t.TempDir()); err == nil {
		t.Fatal("expected error when marker is missing")
	}
}

func TestResolveVSCodePluginPath(t *testing.T) {
	root := t.TempDir()
	if got := system.ResolveVSCodePluginPath(root); got != root {
		t.Errorf("without dist, got %q want source root", got)
	}

	dist := filepath.Join(root, "dist", "vscode")
	if err := os.MkdirAll(dist, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dist, ".plugin.json"), []byte("{}"), 0644); err != nil {
		t.Fatal(err)
	}
	if got := system.ResolveVSCodePluginPath(root); got != dist {
		t.Errorf("with dist, got %q want %q", got, dist)
	}
}

func TestRunHarnessInstall_VSCodeRegeneratesWhenDistExists(t *testing.T) {
	source := t.TempDir()
	dist := filepath.Join(source, "dist", "vscode")
	if err := os.MkdirAll(dist, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dist, ".plugin.json"), []byte("{}"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(source, "scripts", "configure"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "scripts", "configure", "install-vscode.js"), []byte("module.exports = {}\n"), 0644); err != nil {
		t.Fatal(err)
	}

	var registered string
	runnerCalled := false
	var events []system.InstallEvent
	err := system.RunHarnessInstall(context.Background(), system.HarnessInstallRequest{
		SourceRoot: source,
		Targets:    []string{"vscode"},
		Timeout:    2 * time.Second,
		LookPath:   func(string) (string, error) { return "", os.ErrNotExist },
		RegisterVSCode: func(pluginPath string) (int, error) {
			registered = pluginPath
			return 1, nil
		},
		Runner: func(context.Context, string, string, []string, func(string)) error {
			runnerCalled = true
			return nil
		},
	}, func(ev system.InstallEvent) {
		events = append(events, ev)
	})
	if err != nil {
		t.Fatalf("RunHarnessInstall: %v", err)
	}
	if !runnerCalled {
		t.Fatal("expected generator to run even when dist/vscode already exists")
	}
	if registered != dist {
		t.Errorf("registered path = %q, want dist %q", registered, dist)
	}
	sawRegen := false
	for _, ev := range events {
		if strings.Contains(ev.Message, "Regenerando dist/vscode") {
			sawRegen = true
		}
	}
	if !sawRegen {
		t.Fatalf("expected regenerate log, events=%v", events)
	}
}

func TestRunHarnessInstall_VSCodeRegistersWithoutGeneratorWhenScriptMissing(t *testing.T) {
	source := t.TempDir()
	dist := filepath.Join(source, "dist", "vscode")
	if err := os.MkdirAll(dist, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dist, ".plugin.json"), []byte("{}"), 0644); err != nil {
		t.Fatal(err)
	}

	var registered string
	err := system.RunHarnessInstall(context.Background(), system.HarnessInstallRequest{
		SourceRoot: source,
		Targets:    []string{"vscode"},
		Timeout:    2 * time.Second,
		LookPath:   func(string) (string, error) { return "", os.ErrNotExist },
		RegisterVSCode: func(pluginPath string) (int, error) {
			registered = pluginPath
			return 1, nil
		},
		Runner: func(context.Context, string, string, []string, func(string)) error {
			t.Fatal("runner should not run when install-vscode.js is missing")
			return nil
		},
	}, nil)
	if err != nil {
		t.Fatalf("RunHarnessInstall: %v", err)
	}
	if registered != dist {
		t.Errorf("registered path = %q, want dist %q", registered, dist)
	}
}

func TestRunHarnessInstall_GitHubCopilot(t *testing.T) {
	source := t.TempDir()
	if err := os.MkdirAll(filepath.Join(source, "scripts", "configure"), 0755); err != nil {
		t.Fatal(err)
	}
	scriptPath := filepath.Join(source, "scripts", "configure", "install-global-copilot.js")
	if err := os.WriteFile(scriptPath, []byte("module.exports = {}\n"), 0644); err != nil {
		t.Fatal(err)
	}

	runnerCalled := false
	err := system.RunHarnessInstall(context.Background(), system.HarnessInstallRequest{
		SourceRoot: source,
		Targets:    []string{"github-copilot"},
		Timeout:    2 * time.Second,
		Runner: func(ctx context.Context, sRoot, sPath string, args []string, emit func(string)) error {
			runnerCalled = true
			if sPath != scriptPath {
				t.Errorf("script = %q, want %q", sPath, scriptPath)
			}
			return nil
		},
	}, nil)
	if err != nil {
		t.Fatalf("RunHarnessInstall: %v", err)
	}
	if !runnerCalled {
		t.Fatal("expected runner to be called for github-copilot")
	}
}

func TestRunHarnessInstall_UnknownTarget(t *testing.T) {
	err := system.RunHarnessInstall(context.Background(), system.HarnessInstallRequest{
		SourceRoot: t.TempDir(),
		Targets:    []string{"nope"},
		Runner: func(context.Context, string, string, []string, func(string)) error {
			return nil
		},
	}, nil)
	if err == nil {
		t.Fatal("expected error for unknown target")
	}
}

func TestRunHarnessInstall_EmptyTargets(t *testing.T) {
	err := system.RunHarnessInstall(context.Background(), system.HarnessInstallRequest{
		SourceRoot: t.TempDir(),
		Targets:    nil,
	}, nil)
	if err == nil {
		t.Fatal("expected error when no targets selected")
	}
}

func TestRunHarnessInstall_DryRunDoesNotSpawn(t *testing.T) {
	source := t.TempDir()
	if err := os.MkdirAll(filepath.Join(source, "scripts", "configure"), 0755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{
		"install-claude.js",
		"install-vscode.js",
		"install-cursor.js",
		"install-codex.js",
		"install-antigravity.js",
		"install-global-opencode.js",
	} {
		if err := os.WriteFile(filepath.Join(source, "scripts", "configure", name), []byte("throw new Error('should not run')\n"), 0644); err != nil {
			t.Fatal(err)
		}
	}

	called := false
	err := system.RunHarnessInstall(context.Background(), system.HarnessInstallRequest{
		SourceRoot: source,
		Targets:    []string{"claude", "codex", "vscode"},
		DryRun:     true,
		Runner: func(context.Context, string, string, []string, func(string)) error {
			called = true
			return nil
		},
		RegisterVSCode: func(string) (int, error) {
			t.Fatal("RegisterVSCode must not run in dry-run")
			return 0, nil
		},
	}, nil)
	if err != nil {
		t.Fatalf("dry-run: %v", err)
	}
	if called {
		t.Fatal("script runner must not run in dry-run")
	}
}
