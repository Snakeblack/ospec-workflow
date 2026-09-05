// Tests for the session-start handler.
// Cases derived from scripts/hooks/session-start.test.js.
// The Go port operates in single-repo mode only (no workspace-federated backend).
package hooks_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/snakeblack/ospec-workflow/internal/hooks"
	"github.com/snakeblack/ospec-workflow/internal/skillreg"
)

// ── helpers ────────────────────────────────────────────────────────────────────

type sessionStartResult struct {
	Status        string `json:"status"`
	OspecDetected bool   `json:"ospecDetected"`
	Registry      struct {
		Status string `json:"status"`
		Path   string `json:"path"`
	} `json:"registry"`
	Baseline *struct {
		Hint string `json:"hint"`
	} `json:"baseline"`
	Security *struct {
		Status string `json:"status"`
		Alerts []struct {
			Type   string `json:"type"`
			File   string `json:"file"`
			Reason string `json:"reason"`
		} `json:"alerts"`
	} `json:"security"`
	GitCollaboration *struct {
		Status        string  `json:"status"`
		CurrentBranch *string `json:"currentBranch"`
		DefaultBranch *string `json:"defaultBranch"`
		DirtyTree     *bool   `json:"dirtyTree"`
		Message       string  `json:"message"`
	} `json:"gitCollaboration"`
	SystemMessage string `json:"systemMessage"`
	Message       string `json:"message"`
}

// runSessionStart dispatches "session-start" and decodes the result.
func runSessionStart(t *testing.T, stdin []byte) (sessionStartResult, int) {
	t.Helper()
	out, code := hooks.Dispatch([]string{"session-start"}, stdin)
	if out == nil {
		t.Fatalf("session-start: nil output (handler not registered?)")
	}
	var r sessionStartResult
	if err := json.Unmarshal(out, &r); err != nil {
		t.Fatalf("session-start: parse output: %v; raw=%q", err, out)
	}
	return r, code
}

// makeSessionInput builds the stdin JSON payload with an optional cwd and pluginRoot.
func makeSessionInput(cwd, pluginRoot string, nowISO string) []byte {
	m := map[string]string{}
	if cwd != "" {
		m["cwd"] = cwd
	}
	if pluginRoot != "" {
		m["plugin_root"] = pluginRoot
	}
	if nowISO != "" {
		m["now"] = nowISO
	}
	b, _ := json.Marshal(m)
	return b
}

// createMinimalPluginRoot builds a minimal skills/rules tree so DiscoverSkills works.
func createMinimalPluginRoot(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	for _, dir := range []string{
		filepath.Join(root, "skills", "example"),
		filepath.Join(root, "skills", "_shared"),
		filepath.Join(root, "rules"),
	} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatal(err)
		}
	}
	skill := "---\nname: example\ndescription: \"Example skill. Trigger: hooks\"\n---\n\n## Rules\n\n- Keep output deterministic.\n"
	if err := os.WriteFile(filepath.Join(root, "skills", "example", "SKILL.md"), []byte(skill), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "skills", "_shared", "runtime.md"), []byte("Shared runtime.\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "rules", "common.md"), []byte("Common rule.\n"), 0644); err != nil {
		t.Fatal(err)
	}
	return root
}

// createWorkspace builds a tmp workspace with optional openspec/config.yaml.
func createWorkspaceWithConfig(t *testing.T, configContent string) string {
	t.Helper()
	ws := t.TempDir()
	if configContent != "" {
		if err := os.MkdirAll(filepath.Join(ws, "openspec"), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(ws, "openspec", "config.yaml"), []byte(configContent), 0644); err != nil {
			t.Fatal(err)
		}
	}
	return ws
}

// ── tests ──────────────────────────────────────────────────────────────────────

func writeSessionFile(t *testing.T, file, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(file), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

func readSessionCache(t *testing.T, ws string) (string, map[string]any) {
	t.Helper()
	file := filepath.Join(ws, ".ospec", "cache", "skill-registry.cache.json")
	cache, err := skillreg.ReadCache(file)
	if err != nil || cache == nil {
		t.Fatalf("read cache: %v; cache=%v", err, cache)
	}
	return file, cache
}

func TestSessionStart_LauncherEnvironmentAndInstalledHome(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("CODEX_HOME", filepath.Join(home, "unrelated-codex-home"))
	t.Setenv("OSPEC_TARGET", "codex")
	t.Setenv("DISABLE_GIT_COLLABORATION_GUARD", "true")
	pluginRoot := filepath.Join(home, ".codex", "ospec-workflow")
	t.Setenv("OSPEC_PLUGIN_ROOT", pluginRoot)
	skillPath := filepath.Join(home, ".agents", "skills", "example", "SKILL.md")
	writeSessionFile(t, skillPath, "---\nname: example\n---\n## Rules\n- Installed rule.\n")
	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	cachePath := filepath.Join(ws, ".ospec", "cache", "skill-registry.cache.json")
	writeSessionFile(t, cachePath, `{"version":2,"fingerprint":"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","skills":[]}`)
	input := makeSessionInput(ws, "", "") // The launcher supplies only cwd on stdin.
	got, code := runSessionStart(t, input)
	if code != 0 || got.Registry.Status != "generated" {
		t.Fatalf("installed registry: code=%d result=%+v", code, got)
	}
	_, cache := readSessionCache(t, ws)
	skills, ok := cache["skills"].([]any)
	if !ok || len(skills) != 1 {
		t.Fatalf("installed skills: %v", cache["skills"])
	}
	if skills[0].(map[string]any)["path"] != filepath.ToSlash(skillPath) {
		t.Fatalf("unusable installed path: %v", skills[0])
	}
	got, code = runSessionStart(t, input)
	if code != 0 || got.Registry.Status != "reused" {
		t.Fatalf("reuse: code=%d result=%+v", code, got)
	}
	writeSessionFile(t, skillPath, "---\nname: example\n---\n## Rules\n- Changed rule.\n")
	got, code = runSessionStart(t, input)
	if code != 0 || got.Registry.Status != "generated" {
		t.Fatalf("refresh: code=%d result=%+v", code, got)
	}

	// Explicit bundle roots retain local skills, even with installed-root env.
	bundle := createMinimalPluginRoot(t)
	got, code = runSessionStart(t, makeSessionInput(ws, bundle, ""))
	if code != 0 || got.Registry.Status != "generated" {
		t.Fatalf("explicit bundle: code=%d result=%+v", code, got)
	}
	_, cache = readSessionCache(t, ws)
	if cache["skills"].([]any)[0].(map[string]any)["path"] != "skills/example/SKILL.md" {
		t.Fatalf("explicit bundle must use local skills: %v", cache["skills"])
	}
	// The launcher also uses OSPEC_PLUGIN_ROOT for other hosts.
	t.Setenv("OSPEC_TARGET", "claude")
	t.Setenv("OSPEC_PLUGIN_ROOT", bundle)
	got, code = runSessionStart(t, input)
	if code != 0 || got.Registry.Status != "reused" {
		t.Fatalf("launcher bundle: code=%d result=%+v", code, got)
	}
}

func TestSessionStart_BrokenRequiredRootPreservesCache(t *testing.T) {
	t.Setenv("DISABLE_GIT_COLLABORATION_GUARD", "true")
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("OSPEC_TARGET", "codex")
	pluginRoot := filepath.Join(home, ".codex", "ospec-workflow")
	t.Setenv("OSPEC_PLUGIN_ROOT", pluginRoot)
	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	cachePath := filepath.Join(ws, ".ospec", "cache", "skill-registry.cache.json")
	got, code := runSessionStart(t, makeSessionInput(ws, "", ""))
	if code != 1 || !strings.Contains(got.Message, "required skills root") {
		t.Fatalf("missing bundle must fail: code=%d result=%+v", code, got)
	}
	if _, err := os.Stat(cachePath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("missing bundle wrote cache: %v", err)
	}
	const original = `{"version":2,"fingerprint":"sha256:previous","skills":[]}`
	writeSessionFile(t, cachePath, original)
	if err := os.MkdirAll(filepath.Join(home, ".agents", "skills"), 0755); err != nil {
		t.Fatal(err)
	}
	got, code = runSessionStart(t, makeSessionInput(ws, "", ""))
	if code != 1 || !strings.Contains(got.Message, "required skills root") {
		t.Fatalf("empty bundle must fail: code=%d result=%+v", code, got)
	}
	data, err := os.ReadFile(cachePath)
	if err != nil || string(data) != original {
		t.Fatalf("cache changed on failure: %s; %v", data, err)
	}
}

func TestSessionStart_CacheContentRefresh(t *testing.T) {
	t.Setenv("DISABLE_GIT_COLLABORATION_GUARD", "true")
	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	pr := createMinimalPluginRoot(t)
	input := makeSessionInput(ws, pr, "")
	got, code := runSessionStart(t, input)
	if code != 0 {
		t.Fatalf("generate: %+v", got)
	}
	cachePath, expected := readSessionCache(t, ws)
	for _, skills := range []any{nil, []any{}, []any{map[string]any{"id": "outdated"}}} {
		mutated := map[string]any{"version": expected["version"], "fingerprint": expected["fingerprint"], "skills": skills}
		if err := skillreg.WriteCache(cachePath, mutated); err != nil {
			t.Fatal(err)
		}
		got, code := runSessionStart(t, input)
		if code != 0 || got.Registry.Status != "generated" {
			t.Fatalf("stale entries reused: code=%d result=%+v", code, got)
		}
		_, actual := readSessionCache(t, ws)
		if !reflect.DeepEqual(actual["skills"], expected["skills"]) {
			t.Fatalf("entries not repaired: %v", actual["skills"])
		}
	}
}

func TestSessionStart_NodeCacheParity(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skipf("Node required for cross-runtime parity: %v", err)
	}
	t.Setenv("DISABLE_GIT_COLLABORATION_GUARD", "true")
	t.Setenv("DISABLE_AGENT_SHIELD", "true")
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("OSPEC_TARGET", "codex")
	pr := filepath.Join(home, ".codex", "ospec-workflow")
	t.Setenv("OSPEC_PLUGIN_ROOT", pr)
	skills := filepath.Join(home, ".agents", "skills")
	writeSessionFile(t, filepath.Join(skills, "plain", "SKILL.md"), "---\nname: plain\n---\nParagraph without bullets.\n")
	writeSessionFile(t, filepath.Join(skills, "commands", "sdd-apply", "SKILL.md"), "---\nname: sdd-apply\n---\n## Rules\n- Dispatch a phase.\n")
	writeSessionFile(t, filepath.Join(skills, "_shared", "runtime.md"), "Shared runtime.\n")
	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	script, err := filepath.Abs(filepath.Join("..", "..", "scripts", "hooks", "session-start.js"))
	if err != nil {
		t.Fatal(err)
	}
	js := `require(process.argv[1]).runSessionStart({input:{cwd:process.argv[2]},pluginRoot:process.argv[3]}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1})`
	output, err := exec.Command(node, "-e", js, script, ws, pr).CombinedOutput()
	if err != nil {
		t.Fatalf("Node fixture failed: %v; %s", err, output)
	}
	file, expected := readSessionCache(t, ws)
	before, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	got, code := runSessionStart(t, makeSessionInput(ws, "", ""))
	if code != 0 || got.Registry.Status != "reused" {
		t.Fatalf("Go must reuse Node cache: code=%d result=%+v", code, got)
	}
	after, err := os.ReadFile(file)
	if err != nil || string(before) != string(after) {
		t.Fatalf("Go changed Node cache: %v", err)
	}
	// Force Go to regenerate; Node must then reuse the same payload and fingerprint.
	if err := skillreg.WriteCache(file, map[string]any{"version": 2}); err != nil {
		t.Fatal(err)
	}
	got, code = runSessionStart(t, makeSessionInput(ws, "", ""))
	if code != 0 || got.Registry.Status != "generated" {
		t.Fatalf("Go generation: code=%d result=%+v", code, got)
	}
	_, actual := readSessionCache(t, ws)
	if !reflect.DeepEqual(expected["skills"], actual["skills"]) || expected["fingerprint"] != actual["fingerprint"] {
		t.Fatalf("Node/Go cache differs: expected=%v actual=%v", expected, actual)
	}
	output, err = exec.Command(node, "-e", js, script, ws, pr).CombinedOutput()
	if err != nil {
		t.Fatalf("Node reuse failed: %v; %s", err, output)
	}
	var result sessionStartResult
	if err := json.Unmarshal(output, &result); err != nil || result.Registry.Status != "reused" {
		t.Fatalf("Node must reuse Go cache: %v; %s", err, output)
	}
}

func TestSessionStart_NoOspec(t *testing.T) {
	ws := createWorkspaceWithConfig(t, "") // no openspec dir
	pr := createMinimalPluginRoot(t)
	stdin := makeSessionInput(ws, pr, "")

	got, code := runSessionStart(t, stdin)

	if code != 0 {
		t.Errorf("exitCode: got %d, want 0", code)
	}
	if got.Status != "ok" {
		t.Errorf("status: got %q, want %q", got.Status, "ok")
	}
	if got.OspecDetected {
		t.Errorf("ospecDetected: got true, want false")
	}
	if got.Registry.Status != "skipped" {
		t.Errorf("registry.status: got %q, want %q", got.Registry.Status, "skipped")
	}
}

func TestSessionStart_WithOspec_GeneratesCache(t *testing.T) {
	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	pr := createMinimalPluginRoot(t)
	nowISO := "2026-06-10T08:00:00.000Z"
	stdin := makeSessionInput(ws, pr, nowISO)

	got, code := runSessionStart(t, stdin)

	if code != 0 {
		t.Errorf("exitCode: got %d, want 0", code)
	}
	if !got.OspecDetected {
		t.Errorf("ospecDetected: got false, want true")
	}
	if got.Registry.Status != "generated" {
		t.Errorf("registry.status: got %q, want %q", got.Registry.Status, "generated")
	}
	// Cache file must exist.
	cachePath := filepath.Join(ws, ".ospec", "cache", "skill-registry.cache.json")
	data, err := os.ReadFile(cachePath)
	if err != nil {
		t.Fatalf("cache file missing: %v", err)
	}
	var cache map[string]any
	if err := json.Unmarshal(data, &cache); err != nil {
		t.Fatalf("cache parse: %v", err)
	}
	if v, _ := cache["version"].(float64); int(v) != 2 {
		t.Errorf("cache.version: got %v, want 2", cache["version"])
	}
	if fp, _ := cache["fingerprint"].(string); len(fp) < 10 {
		t.Errorf("cache.fingerprint: too short %q", fp)
	}
	if ga, _ := cache["generated_at"].(string); ga != nowISO {
		t.Errorf("cache.generated_at: got %q, want %q", ga, nowISO)
	}
}

func TestSessionStart_CacheReused(t *testing.T) {
	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	pr := createMinimalPluginRoot(t)

	// First run: generate.
	runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T08:00:00.000Z"))

	cachePath := filepath.Join(ws, ".ospec", "cache", "skill-registry.cache.json")
	original, _ := os.ReadFile(cachePath)

	// Second run: should reuse.
	got, _ := runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T09:00:00.000Z"))

	if got.Registry.Status != "reused" {
		t.Errorf("registry.status: got %q, want %q", got.Registry.Status, "reused")
	}
	current, _ := os.ReadFile(cachePath)
	if string(current) != string(original) {
		t.Error("cache file was overwritten on reuse")
	}
}

func TestSessionStart_CacheRegeneratedAfterChange(t *testing.T) {
	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	pr := createMinimalPluginRoot(t)

	runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T08:00:00.000Z"))

	cachePath := filepath.Join(ws, ".ospec", "cache", "skill-registry.cache.json")
	before := func() string {
		b, _ := os.ReadFile(cachePath)
		var m map[string]any
		_ = json.Unmarshal(b, &m)
		fp, _ := m["fingerprint"].(string)
		return fp
	}()

	// Mutate a fingerprint file.
	if err := os.WriteFile(filepath.Join(pr, "rules", "common.md"), []byte("Changed rule.\n"), 0644); err != nil {
		t.Fatal(err)
	}

	runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T09:00:00.000Z"))

	after := func() string {
		b, _ := os.ReadFile(cachePath)
		var m map[string]any
		_ = json.Unmarshal(b, &m)
		fp, _ := m["fingerprint"].(string)
		return fp
	}()

	if before == after {
		t.Error("fingerprint unchanged after modifying a source file")
	}
}

func TestSessionStart_BaselineHint_Pending(t *testing.T) {
	cfg := "strict_tdd: true\nbaseline:\n  status: pending\n  domains_pending: []\n  domains_done: []\n  stale_domains: []\n  last_checked: \"\"\n"
	ws := createWorkspaceWithConfig(t, cfg)
	pr := createMinimalPluginRoot(t)

	got, _ := runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T08:00:00.000Z"))

	if got.Baseline == nil {
		t.Fatal("baseline key missing, want non-nil")
	}
	if got.Baseline.Hint == "" {
		t.Error("baseline.hint empty, want non-empty")
	}
}

func TestSessionStart_BaselineHint_Partial(t *testing.T) {
	cfg := "strict_tdd: true\nbaseline:\n  status: partial\n  domains_pending:\n    - auth\n    - payments\n  domains_done: []\n  stale_domains: []\n  last_checked: \"\"\n"
	ws := createWorkspaceWithConfig(t, cfg)
	pr := createMinimalPluginRoot(t)

	got, _ := runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T08:00:00.000Z"))

	if got.Baseline == nil {
		t.Fatal("baseline key missing")
	}
	hint := got.Baseline.Hint
	if hint == "" {
		t.Error("hint empty")
	}
	// Must mention the count "2".
	found := false
	for _, c := range hint {
		if c == '2' {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("hint %q does not contain '2' (pending count)", hint)
	}
}

func TestSessionStart_BaselineHint_StaleDomain(t *testing.T) {
	cfg := "strict_tdd: true\nbaseline:\n  status: done\n  domains_pending: []\n  domains_done:\n    - auth\n  stale_domains:\n    - auth\n  last_checked: \"2026-06-10T12:00:00Z\"\n"
	ws := createWorkspaceWithConfig(t, cfg)
	pr := createMinimalPluginRoot(t)

	got, _ := runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T08:00:00.000Z"))

	if got.Baseline == nil {
		t.Fatal("baseline key missing")
	}
	// Hint must mention the stale domain name.
	if hint := got.Baseline.Hint; len(hint) == 0 {
		t.Error("hint empty")
	} else if !containsString(hint, "auth") {
		t.Errorf("hint %q does not mention stale domain 'auth'", hint)
	}
}

func TestSessionStart_BaselineHint_DoneNoStale(t *testing.T) {
	cfg := "strict_tdd: true\nbaseline:\n  status: done\n  domains_pending: []\n  domains_done:\n    - auth\n  stale_domains: []\n  last_checked: \"\"\n"
	ws := createWorkspaceWithConfig(t, cfg)
	pr := createMinimalPluginRoot(t)

	got, _ := runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T08:00:00.000Z"))

	if got.Baseline != nil {
		t.Errorf("baseline key present, want nil; hint=%q", got.Baseline.Hint)
	}
}

func TestSessionStart_ErrorExitsOne(t *testing.T) {
	// Provide a cwd that does not exist to force an error path.
	// We use a path inside a TempDir that we delete, so it is guaranteed absent.
	tmp := t.TempDir()
	gone := filepath.Join(tmp, "does-not-exist")
	pr := createMinimalPluginRoot(t)

	// This workspace has no config.yaml so ospecDetected=false — not an error.
	// To force an actual error we send a malformed JSON stdin instead.
	out, code := hooks.Dispatch([]string{"session-start"}, []byte("{bad"))
	_ = gone
	_ = pr
	if code != 1 {
		t.Errorf("exitCode on parse error: got %d, want 1", code)
	}
	if out == nil {
		t.Fatal("nil output on error")
	}
	var r sessionStartResult
	if err := json.Unmarshal(out, &r); err != nil {
		t.Fatalf("parse error output: %v; raw=%q", err, out)
	}
	if r.Status != "error" {
		t.Errorf("status: got %q, want %q", r.Status, "error")
	}
	if r.Message == "" {
		t.Error("message: empty, want non-empty")
	}
}

// ── triangulation ──────────────────────────────────────────────────────────────

func TestSessionStart_Triangulate(t *testing.T) {
	t.Run("empty stdin uses fallback cwd", func(t *testing.T) {
		ws := createWorkspaceWithConfig(t, "")
		_ = ws
		// Empty stdin → no cwd field → fallback → process cwd (no ospec there normally).
		// Just check we get valid JSON back with no panic.
		out, code := hooks.Dispatch([]string{"session-start"}, []byte("{}"))
		if code != 0 {
			t.Errorf("exitCode: got %d, want 0", code)
		}
		var r sessionStartResult
		if err := json.Unmarshal(out, &r); err != nil {
			t.Fatalf("parse: %v; raw=%q", err, out)
		}
		if r.Status != "ok" && r.Status != "error" {
			t.Errorf("unexpected status %q", r.Status)
		}
	})

	t.Run("now ISO injected into generated_at", func(t *testing.T) {
		ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
		pr := createMinimalPluginRoot(t)
		nowISO := "2026-01-01T00:00:00.000Z"

		runSessionStart(t, makeSessionInput(ws, pr, nowISO))

		cachePath := filepath.Join(ws, ".ospec", "cache", "skill-registry.cache.json")
		data, _ := os.ReadFile(cachePath)
		var cache map[string]any
		_ = json.Unmarshal(data, &cache)
		if ga, _ := cache["generated_at"].(string); ga != nowISO {
			t.Errorf("generated_at: got %q, want %q", ga, nowISO)
		}
	})

	t.Run("no config baseline block emits no hint", func(t *testing.T) {
		ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
		pr := createMinimalPluginRoot(t)
		got, _ := runSessionStart(t, makeSessionInput(ws, pr, time.Now().UTC().Format(time.RFC3339)))
		if got.Baseline != nil {
			t.Errorf("baseline present when config has no baseline block; hint=%q", got.Baseline.Hint)
		}
	})
}

func containsString(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 ||
		func() bool {
			for i := 0; i+len(sub) <= len(s); i++ {
				if s[i:i+len(sub)] == sub {
					return true
				}
			}
			return false
		}())
}

func TestSessionStart_AgentShield_Bypass(t *testing.T) {
	os.Setenv("DISABLE_AGENT_SHIELD", "true")
	defer os.Unsetenv("DISABLE_AGENT_SHIELD")

	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	pr := createMinimalPluginRoot(t)

	// Write unignored .env file
	os.WriteFile(filepath.Join(ws, ".env"), []byte("API_KEY=123"), 0644)
	os.WriteFile(filepath.Join(ws, ".gitignore"), []byte("other_file\n"), 0644)

	got, _ := runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T08:00:00.000Z"))

	if got.Security != nil {
		t.Errorf("expected security block to be nil when bypassed, got non-nil")
	}
}

func TestSessionStart_AgentShield_UnignoredEnv(t *testing.T) {
	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	pr := createMinimalPluginRoot(t)

	// Write unignored .env file
	os.WriteFile(filepath.Join(ws, ".env"), []byte("API_KEY=123"), 0644)
	os.WriteFile(filepath.Join(ws, ".gitignore"), []byte("other_file\n"), 0644)

	got, _ := runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T08:00:00.000Z"))

	if got.Security == nil {
		t.Fatal("expected security block to be non-nil")
	}
	if got.Security.Status != "warning" {
		t.Errorf("expected security status warning, got %q", got.Security.Status)
	}

	found := false
	for _, alert := range got.Security.Alerts {
		if alert.File == ".env" && alert.Type == "unignored-env-file" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected alert for .env file")
	}

	if !containsString(got.SystemMessage, "Cuidado") {
		t.Errorf("expected systemMessage to contain 'Cuidado', got %q", got.SystemMessage)
	}
}

func TestSessionStart_AgentShield_GitConfig(t *testing.T) {
	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	pr := createMinimalPluginRoot(t)

	// Write credentials in .git/config
	os.MkdirAll(filepath.Join(ws, ".git"), 0755)
	os.WriteFile(filepath.Join(ws, ".git", "config"), []byte("[remote \"origin\"]\n  url = https://user:secret123@github.com/org/repo.git\n"), 0644)

	got, _ := runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T08:00:00.000Z"))

	if got.Security == nil {
		t.Fatal("expected security block to be non-nil")
	}
	if got.Security.Status != "warning" {
		t.Errorf("expected security status warning, got %q", got.Security.Status)
	}

	found := false
	for _, alert := range got.Security.Alerts {
		if alert.File == ".git/config" && alert.Type == "embedded-credentials" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected alert for .git/config")
	}
}

// ── Phase 6: Git Collaboration Advisory in SessionStart ───────────────────────

// makeSessionGitRunner builds a gitRunnerFn for session-start advisory tests.
func makeSessionGitRunner(responses map[string]interface{}) func(ctx context.Context, args []string) (string, error) {
	return func(ctx context.Context, args []string) (string, error) {
		for key, val := range responses {
			for _, arg := range args {
				if arg == key {
					switch v := val.(type) {
					case error:
						return "", v
					case string:
						return v, nil
					}
				}
			}
		}
		return "", errors.New("unexpected git args: " + strings.Join(args, " "))
	}
}

// makeSessionInputWithGitRunner is like makeSessionInput but also injects a git runner.
// The session-start handler uses the package-level gitRunner, set via SetGitRunnerForTest.
func runSessionStartWithGitRunner(t *testing.T, ws, pr string, runner func(ctx context.Context, args []string) (string, error)) (sessionStartResult, int) {
	t.Helper()
	restore := hooks.SetGitRunnerForTest(runner)
	defer restore()
	return runSessionStart(t, makeSessionInput(ws, pr, ""))
}

// (a) default branch + clean tree → GitCollaboration non-nil with DirtyTree: &false
func TestSessionStart_GitCollab_DefaultBranchClean(t *testing.T) {
	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	pr := createMinimalPluginRoot(t)
	runner := makeSessionGitRunner(map[string]interface{}{
		"symbolic-ref":   "origin/main",
		"--show-current": "main",
		"--porcelain":    "",
	})
	got, _ := runSessionStartWithGitRunner(t, ws, pr, runner)
	if got.GitCollaboration == nil {
		t.Fatal("GitCollaboration must be non-nil for default-branch condition")
	}
	if got.GitCollaboration.Status != "warning" {
		t.Errorf("expected status 'warning', got %q", got.GitCollaboration.Status)
	}
	if got.GitCollaboration.DirtyTree == nil || *got.GitCollaboration.DirtyTree {
		t.Errorf("DirtyTree must be &false for clean tree, got %v", got.GitCollaboration.DirtyTree)
	}
	if !containsString(got.SystemMessage, "rama por defecto") {
		t.Errorf("SystemMessage must contain 'rama por defecto': %q", got.SystemMessage)
	}
}

// (b) feature branch + dirty tree → DirtyTree: &true
func TestSessionStart_GitCollab_DirtyFeatureBranch(t *testing.T) {
	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	pr := createMinimalPluginRoot(t)
	runner := makeSessionGitRunner(map[string]interface{}{
		"symbolic-ref":   "origin/main",
		"--show-current": "feat/x",
		"--porcelain":    "M modified.js",
	})
	got, _ := runSessionStartWithGitRunner(t, ws, pr, runner)
	if got.GitCollaboration == nil {
		t.Fatal("GitCollaboration must be non-nil for dirty-tree condition")
	}
	if got.GitCollaboration.DirtyTree == nil || !*got.GitCollaboration.DirtyTree {
		t.Errorf("DirtyTree must be &true, got %v", got.GitCollaboration.DirtyTree)
	}
	if !containsString(got.SystemMessage, "sin commitear") {
		t.Errorf("SystemMessage must contain 'sin commitear': %q", got.SystemMessage)
	}
}

// (c) combined: default branch AND dirty → single GitCollaboration, both conditions in message
func TestSessionStart_GitCollab_Combined(t *testing.T) {
	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	pr := createMinimalPluginRoot(t)
	runner := makeSessionGitRunner(map[string]interface{}{
		"symbolic-ref":   "origin/main",
		"--show-current": "main",
		"--porcelain":    "M modified.js",
	})
	got, _ := runSessionStartWithGitRunner(t, ws, pr, runner)
	if got.GitCollaboration == nil {
		t.Fatal("GitCollaboration must be non-nil for combined condition")
	}
	if got.GitCollaboration.DirtyTree == nil || !*got.GitCollaboration.DirtyTree {
		t.Errorf("DirtyTree must be &true for combined dirty+default, got %v", got.GitCollaboration.DirtyTree)
	}
	if !containsString(got.SystemMessage, "rama por defecto") {
		t.Errorf("SystemMessage must contain 'rama por defecto': %q", got.SystemMessage)
	}
	if !containsString(got.SystemMessage, "sin commitear") {
		t.Errorf("SystemMessage must contain 'sin commitear': %q", got.SystemMessage)
	}
}

// (d) clean feature branch → GitCollaboration nil
func TestSessionStart_GitCollab_CleanFeatureBranch(t *testing.T) {
	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	pr := createMinimalPluginRoot(t)
	runner := makeSessionGitRunner(map[string]interface{}{
		"symbolic-ref":   "origin/main",
		"--show-current": "feat/clean",
		"--porcelain":    "",
	})
	got, _ := runSessionStartWithGitRunner(t, ws, pr, runner)
	if got.GitCollaboration != nil {
		t.Errorf("GitCollaboration must be nil for clean feature branch, got %+v", got.GitCollaboration)
	}
}

// (e) DISABLE_GIT_COLLABORATION_GUARD=true → GitCollaboration nil
func TestSessionStart_GitCollab_EnvBypass(t *testing.T) {
	os.Setenv("DISABLE_GIT_COLLABORATION_GUARD", "true")
	defer os.Unsetenv("DISABLE_GIT_COLLABORATION_GUARD")

	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	pr := createMinimalPluginRoot(t)
	runner := makeSessionGitRunner(map[string]interface{}{
		"symbolic-ref":   "origin/main",
		"--show-current": "main",
		"--porcelain":    "M modified.js",
	})
	got, _ := runSessionStartWithGitRunner(t, ws, pr, runner)
	if got.GitCollaboration != nil {
		t.Errorf("GitCollaboration must be nil when guard is disabled, got %+v", got.GitCollaboration)
	}
}

// (f) git binary absent → GitCollaboration nil, rest of output unaffected
func TestSessionStart_GitCollab_GitAbsent(t *testing.T) {
	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	pr := createMinimalPluginRoot(t)
	runner := func(ctx context.Context, args []string) (string, error) {
		return "", errors.New("git: command not found")
	}
	got, _ := runSessionStartWithGitRunner(t, ws, pr, runner)
	if got.GitCollaboration != nil {
		t.Errorf("GitCollaboration must be nil when git is absent, got %+v", got.GitCollaboration)
	}
	if got.Status != "ok" {
		t.Errorf("status must still be ok, got %q", got.Status)
	}
	if !got.OspecDetected {
		t.Error("ospecDetected must still be true")
	}
}

// (g) status probe fails + default branch resolves → GitCollaboration non-nil, DirtyTree nil
func TestSessionStart_GitCollab_StatusProbeFails_DefaultBranch(t *testing.T) {
	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	pr := createMinimalPluginRoot(t)
	runner := makeSessionGitRunner(map[string]interface{}{
		"symbolic-ref":   "origin/main",
		"--show-current": "main",
		"--porcelain":    errors.New("git status failed"),
	})
	got, _ := runSessionStartWithGitRunner(t, ws, pr, runner)
	if got.GitCollaboration == nil {
		t.Fatal("GitCollaboration must be non-nil (default branch condition fires)")
	}
	if got.GitCollaboration.DirtyTree != nil {
		t.Errorf("DirtyTree must be nil (omitted) when status probe fails, got %v", *got.GitCollaboration.DirtyTree)
	}
}

