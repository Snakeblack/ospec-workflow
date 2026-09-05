// Package skillreg_test verifies skill discovery, fingerprint calculation, and
// cache round-trips.  Cases are derived from session-start.test.js.
package skillreg_test

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/snakeblack/ospec-workflow/internal/skillreg"
)

// ── helpers ───────────────────────────────────────────────────────────────────

func makePluginRoot(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	for _, d := range []string{
		filepath.Join(root, "skills", "example"),
		filepath.Join(root, "skills", "_shared"),
		filepath.Join(root, "rules"),
	} {
		if err := os.MkdirAll(d, 0755); err != nil {
			t.Fatalf("mkdir %s: %v", d, err)
		}
	}
	if err := os.WriteFile(
		filepath.Join(root, "skills", "example", "SKILL.md"),
		[]byte("---\nname: example\ndescription: \"Example skill. Trigger: JavaScript, hooks\"\ncapabilities: [node-test, javascript-eval]\n---\n\n## Hard Rules\n\n- Keep output deterministic.\n- Do not mutate OpenSpec.\n"),
		0644,
	); err != nil {
		t.Fatalf("write SKILL.md: %v", err)
	}
	if err := os.WriteFile(
		filepath.Join(root, "skills", "_shared", "runtime.md"),
		[]byte("Shared runtime contract.\n"),
		0644,
	); err != nil {
		t.Fatalf("write runtime.md: %v", err)
	}
	if err := os.WriteFile(
		filepath.Join(root, "rules", "common.md"),
		[]byte("Common project rule.\n"),
		0644,
	); err != nil {
		t.Fatalf("write common.md: %v", err)
	}
	return root
}

// ── DiscoverSkills ────────────────────────────────────────────────────────────

func TestDiscoverSkills(t *testing.T) {
	t.Run("empty dir returns zero skills and fingerprint paths", func(t *testing.T) {
		root := t.TempDir()
		result, err := skillreg.DiscoverSkills(root, skillreg.DiscoverOptions{})
		if err != nil {
			t.Fatalf("DiscoverSkills: %v", err)
		}
		if len(result.Skills) != 0 {
			t.Errorf("expected 0 skills, got %d", len(result.Skills))
		}
		if len(result.FingerprintPaths) != 0 {
			t.Errorf("expected 0 fingerprint paths, got %d", len(result.FingerprintPaths))
		}
	})

	t.Run("discovers example skill with triggers and compact rules", func(t *testing.T) {
		root := makePluginRoot(t)
		result, err := skillreg.DiscoverSkills(root, skillreg.DiscoverOptions{})
		if err != nil {
			t.Fatalf("DiscoverSkills: %v", err)
		}
		if len(result.Skills) != 1 {
			t.Fatalf("expected 1 skill, got %d: %v", len(result.Skills), result.Skills)
		}
		skill := result.Skills[0]
		if skill.ID != "example" {
			t.Errorf("ID: got %q, want %q", skill.ID, "example")
		}
		if skill.Path != "skills/example/SKILL.md" {
			t.Errorf("Path: got %q", skill.Path)
		}
		if len(skill.Triggers) != 2 || skill.Triggers[0] != "JavaScript" || skill.Triggers[1] != "hooks" {
			t.Errorf("Triggers: got %v", skill.Triggers)
		}
		if len(skill.CompactRules) != 2 {
			t.Errorf("CompactRules: got %v", skill.CompactRules)
		}
		if skill.CompactRules[0] != "Keep output deterministic." {
			t.Errorf("CompactRules[0]: got %q", skill.CompactRules[0])
		}
		if len(skill.Capabilities) != 2 || skill.Capabilities[0] != "node-test" || skill.Capabilities[1] != "javascript-eval" {
			t.Errorf("Capabilities: got %v, want [node-test javascript-eval]", skill.Capabilities)
		}
	})

	t.Run("includes _shared and rules in fingerprint paths but not in skills", func(t *testing.T) {
		root := makePluginRoot(t)
		result, err := skillreg.DiscoverSkills(root, skillreg.DiscoverOptions{})
		if err != nil {
			t.Fatalf("DiscoverSkills: %v", err)
		}
		fpPaths := make(map[string]bool)
		for _, fp := range result.FingerprintPaths {
			fpPaths[fp.RelativePath] = true
		}
		// _shared runtime.md should be in fingerprint paths
		if !fpPaths["skills/_shared/runtime.md"] {
			t.Errorf("_shared/runtime.md not in fingerprint paths: %v", fpPaths)
		}
		// rules/common.md should be in fingerprint paths
		if !fpPaths["rules/common.md"] {
			t.Errorf("rules/common.md not in fingerprint paths: %v", fpPaths)
		}
		// Only 1 skill (example), _shared not included in Skills
		if len(result.Skills) != 1 {
			t.Errorf("expected 1 skill, got %d", len(result.Skills))
		}
	})
}

// ── CalculateFingerprint ──────────────────────────────────────────────────────

func TestCalculateFingerprint(t *testing.T) {
	t.Run("same files produce same fingerprint", func(t *testing.T) {
		root := makePluginRoot(t)
		result, _ := skillreg.DiscoverSkills(root, skillreg.DiscoverOptions{})
		fp1, err1 := skillreg.CalculateFingerprint(result.FingerprintPaths)
		fp2, err2 := skillreg.CalculateFingerprint(result.FingerprintPaths)
		if err1 != nil || err2 != nil {
			t.Fatalf("fingerprint errors: %v %v", err1, err2)
		}
		if fp1 != fp2 {
			t.Errorf("fingerprints differ: %q vs %q", fp1, fp2)
		}
		if !strings.HasPrefix(fp1, "sha256:") {
			t.Errorf("expected sha256: prefix, got %q", fp1)
		}
	})

	t.Run("changed file produces different fingerprint", func(t *testing.T) {
		root := makePluginRoot(t)
		result, _ := skillreg.DiscoverSkills(root, skillreg.DiscoverOptions{})
		fp1, _ := skillreg.CalculateFingerprint(result.FingerprintPaths)

		_ = os.WriteFile(
			filepath.Join(root, "rules", "common.md"),
			[]byte("Changed project rule.\n"),
			0644,
		)
		// Discovery snapshots each file's content once (single-read contract);
		// a later fingerprint must come from a fresh discovery, exactly as the
		// session-start hook does on every run.
		refreshed, _ := skillreg.DiscoverSkills(root, skillreg.DiscoverOptions{})
		fp2, _ := skillreg.CalculateFingerprint(refreshed.FingerprintPaths)
		if fp1 == fp2 {
			t.Error("fingerprints should differ after file change")
		}
	})

	t.Run("empty paths produces stable fingerprint", func(t *testing.T) {
		fp, err := skillreg.CalculateFingerprint(nil)
		if err != nil {
			t.Fatalf("CalculateFingerprint(nil): %v", err)
		}
		if !strings.HasPrefix(fp, "sha256:") {
			t.Errorf("expected sha256: prefix, got %q", fp)
		}
	})
}

// ── ReadCache / WriteCache ────────────────────────────────────────────────────

func TestCacheRoundTrip(t *testing.T) {
	t.Run("returns nil for missing cache file", func(t *testing.T) {
		dir := t.TempDir()
		result, err := skillreg.ReadCache(filepath.Join(dir, "missing.json"))
		if err != nil {
			t.Fatalf("ReadCache: %v", err)
		}
		if result != nil {
			t.Errorf("expected nil, got %v", result)
		}
	})

	t.Run("write then read round-trip preserves data", func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "cache.json")
		data := map[string]any{
			"version":      float64(skillreg.CacheVersion),
			"fingerprint":  "sha256:abc",
			"generated_at": "2026-06-10T08:00:00.000Z",
			"skills":       []any{},
		}
		if err := skillreg.WriteCache(path, data); err != nil {
			t.Fatalf("WriteCache: %v", err)
		}
		result, err := skillreg.ReadCache(path)
		if err != nil {
			t.Fatalf("ReadCache: %v", err)
		}
		if result == nil {
			t.Fatal("expected non-nil cache")
		}
		if result["fingerprint"] != "sha256:abc" {
			t.Errorf("fingerprint mismatch: %v", result["fingerprint"])
		}
		if result["version"] != float64(skillreg.CacheVersion) {
			t.Errorf("version mismatch: %v", result["version"])
		}
	})

	t.Run("WriteCache is atomic (file is valid JSON or does not exist)", func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "cache.json")
		data := map[string]any{"version": float64(2), "fingerprint": "sha256:x"}
		if err := skillreg.WriteCache(path, data); err != nil {
			t.Fatalf("WriteCache: %v", err)
		}
		raw, _ := os.ReadFile(path)
		var check map[string]any
		if err := json.Unmarshal(raw, &check); err != nil {
			t.Errorf("cache file is not valid JSON: %v", err)
		}
	})
}

// ── CX0 Robustness Tests (REQ-skill-registry-004, REQ-skill-registry-002) ─────

func makeUnreadableFile(t *testing.T, path string) func() {
	t.Helper()
	if runtime.GOOS == "windows" {
		out, err := exec.Command("icacls", path, "/deny", "*S-1-1-0:(R)").CombinedOutput()
		if err != nil {
			t.Fatalf("icacls deny failed: %v, output: %s", err, out)
		}
		return func() {
			_ = exec.Command("icacls", path, "/grant", "*S-1-1-0:(R)").Run()
		}
	}
	if err := os.Chmod(path, 0000); err != nil {
		t.Fatalf("chmod 0000: %v", err)
	}
	return func() {
		_ = os.Chmod(path, 0644)
	}
}

func TestDiscoverSkills_UnreadableSkillDegradation(t *testing.T) {
	root := makePluginRoot(t)
	unreadablePath := filepath.Join(root, "skills", "unreadable", "SKILL.md")
	if err := os.MkdirAll(filepath.Dir(unreadablePath), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(unreadablePath, []byte("---\nname: unreadable\n---\n## Rules\n- Unreadable rule.\n"), 0644); err != nil {
		t.Fatal(err)
	}

	restore := makeUnreadableFile(t, unreadablePath)
	defer restore()

	result, err := skillreg.DiscoverSkills(root, skillreg.DiscoverOptions{})
	if err != nil {
		t.Fatalf("DiscoverSkills must not fail on unreadable skill: %v", err)
	}

	// Unreadable skill must be omitted from parsed skills
	if len(result.Skills) != 1 || result.Skills[0].ID != "example" {
		t.Errorf("expected only 'example' skill, got: %v", result.Skills)
	}

	// Unreadable skill must be present in FingerprintPaths with 0-byte Content
	var found bool
	for _, fp := range result.FingerprintPaths {
		if fp.RelativePath == "skills/unreadable/SKILL.md" {
			found = true
			if fp.Content == nil {
				t.Errorf("Content must be non-nil 0-byte slice, got nil")
			} else if len(fp.Content) != 0 {
				t.Errorf("Content must have 0 bytes, got %d bytes", len(fp.Content))
			}
		}
	}
	if !found {
		t.Errorf("skills/unreadable/SKILL.md not found in FingerprintPaths")
	}

	// CalculateFingerprint should succeed without throwing
	fp, err := skillreg.CalculateFingerprint(result.FingerprintPaths)
	if err != nil {
		t.Fatalf("CalculateFingerprint failed: %v", err)
	}
	if !strings.HasPrefix(fp, "sha256:") {
		t.Errorf("expected sha256: prefix, got %s", fp)
	}
}

func TestCalculateFingerprint_DirectCallResilience(t *testing.T) {
	tempDir := t.TempDir()
	unreadableFile := filepath.Join(tempDir, "unreadable.md")
	if err := os.WriteFile(unreadableFile, []byte("content"), 0644); err != nil {
		t.Fatal(err)
	}

	restore := makeUnreadableFile(t, unreadableFile)
	defer restore()

	// Direct call without preloaded Content on unreadable file
	fpDirect, err := skillreg.CalculateFingerprint([]skillreg.FingerprintPath{
		{AbsolutePath: unreadableFile, RelativePath: "rules/unreadable.md"},
	})
	if err != nil {
		t.Fatalf("CalculateFingerprint must not fail on unreadable file: %v", err)
	}
	if !strings.HasPrefix(fpDirect, "sha256:") {
		t.Errorf("expected sha256: prefix, got %s", fpDirect)
	}

	// Must match the digest of explicit 0-byte content
	fpExplicit, err := skillreg.CalculateFingerprint([]skillreg.FingerprintPath{
		{AbsolutePath: unreadableFile, RelativePath: "rules/unreadable.md", Content: []byte{}},
	})
	if err != nil {
		t.Fatalf("CalculateFingerprint with explicit 0-byte content failed: %v", err)
	}
	if fpDirect != fpExplicit {
		t.Errorf("hash mismatch: direct=%s vs explicit=%s", fpDirect, fpExplicit)
	}
}

func TestDiscoverSkills_MissingSkillsRoot(t *testing.T) {
	root := t.TempDir()
	_, err := skillreg.DiscoverSkills(root, skillreg.DiscoverOptions{
		SkillsRoot:    filepath.Join(root, "non-existent"),
		RequireSkills: true,
	})
	if err == nil {
		t.Fatalf("expected error for missing required skills root, got nil")
	}
	if !strings.Contains(err.Error(), "no SKILL.md files found in required skills root") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestDiscoverSkills_ForeignOnlyExternalSkillsRootRejection(t *testing.T) {
	root := makePluginRoot(t)
	extSkills := filepath.Join(t.TempDir(), "external-skills")
	foreignSkill := filepath.Join(extSkills, "foreign", "SKILL.md")
	if err := os.MkdirAll(filepath.Dir(foreignSkill), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(foreignSkill, []byte("---\nname: foreign\n---\n"), 0644); err != nil {
		t.Fatal(err)
	}

	// Foreign-only skills without OSpec anchors must fail closed when RequireSkills is true
	_, err := skillreg.DiscoverSkills(root, skillreg.DiscoverOptions{
		SkillsRoot:    extSkills,
		RequireSkills: true,
	})
	if err == nil {
		t.Fatalf("expected error for foreign-only external skills root, got nil")
	}
	if !strings.Contains(err.Error(), "no OSpec identity anchors found in required external skills root") {
		t.Errorf("unexpected error message: %v", err)
	}

	// Adding canonical OSpec anchor (.ospec-workflow-install.json) allows discovery to succeed
	manifestPath := filepath.Join(extSkills, ".ospec-workflow-install.json")
	if err := os.WriteFile(manifestPath, []byte("{}"), 0644); err != nil {
		t.Fatal(err)
	}

	result, err := skillreg.DiscoverSkills(root, skillreg.DiscoverOptions{
		SkillsRoot:    extSkills,
		RequireSkills: true,
	})
	if err != nil {
		t.Fatalf("expected discovery to succeed with OSpec anchor: %v", err)
	}
	if len(result.Skills) != 1 || result.Skills[0].ID != "foreign" {
		t.Errorf("expected 1 parsed skill (foreign), got: %v", result.Skills)
	}
}

// ── Cross-Runtime Parity Verification (Task 3.1, REQ-skill-registry-004) ─────

func TestCrossRuntime_UnreadableFileParity(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skipf("Node binary not found: %v", err)
	}

	root := makePluginRoot(t)
	unreadablePath := filepath.Join(root, "skills", "unreadable", "SKILL.md")
	if err := os.MkdirAll(filepath.Dir(unreadablePath), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(unreadablePath, []byte("---\nname: unreadable\n---\n"), 0644); err != nil {
		t.Fatal(err)
	}

	restore := makeUnreadableFile(t, unreadablePath)
	defer restore()

	// 1. Go DiscoverSkills & CalculateFingerprint
	goResult, err := skillreg.DiscoverSkills(root, skillreg.DiscoverOptions{})
	if err != nil {
		t.Fatalf("Go DiscoverSkills failed: %v", err)
	}
	goFp, err := skillreg.CalculateFingerprint(goResult.FingerprintPaths)
	if err != nil {
		t.Fatalf("Go CalculateFingerprint failed: %v", err)
	}

	// 2. Node discoverSkills & calculateFingerprint
	script, err := filepath.Abs(filepath.Join("..", "..", "scripts", "lib", "skill-registry.js"))
	if err != nil {
		t.Fatal(err)
	}

	js := `
		const reg = require(process.argv[1]);
		reg.discoverSkills(process.argv[2])
			.then(r => reg.calculateFingerprint(r.fingerprintPaths))
			.then(fp => console.log(fp))
			.catch(e => { console.error(e); process.exit(1); });
	`
	cmd := exec.Command(node, "-e", js, script, root)
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("Node discovery/fingerprint failed: %v", err)
	}
	nodeFp := strings.TrimSpace(string(out))

	if goFp != nodeFp {
		t.Fatalf("Cross-runtime fingerprint mismatch on unreadable file fixture:\nGo:   %s\nNode: %s", goFp, nodeFp)
	}

	// 3. Parity on direct calculateFingerprint with unreadable file path
	jsDirect := `
		const reg = require(process.argv[1]);
		reg.calculateFingerprint([{ absolutePath: process.argv[2], relativePath: "skills/unreadable/SKILL.md" }])
			.then(fp => console.log(fp))
			.catch(e => { console.error(e); process.exit(1); });
	`
	cmdDirect := exec.Command(node, "-e", jsDirect, script, unreadablePath)
	outDirect, err := cmdDirect.Output()
	if err != nil {
		t.Fatalf("Node direct calculateFingerprint failed: %v", err)
	}
	nodeDirectFp := strings.TrimSpace(string(outDirect))

	goDirectFp, err := skillreg.CalculateFingerprint([]skillreg.FingerprintPath{
		{AbsolutePath: unreadablePath, RelativePath: "skills/unreadable/SKILL.md"},
	})
	if err != nil {
		t.Fatalf("Go direct CalculateFingerprint failed: %v", err)
	}

	if goDirectFp != nodeDirectFp {
		t.Fatalf("Cross-runtime direct fingerprint mismatch on unreadable file:\nGo:   %s\nNode: %s", goDirectFp, nodeDirectFp)
	}
}


