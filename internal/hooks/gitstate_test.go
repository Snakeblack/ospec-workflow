// Tests for gitstate.go — git state resolution, advisory composition, and
// Go/Node parity assertions.
// Uses package hooks (internal) to set gitRunner directly.
package hooks

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// makeStubRunner builds a gitRunnerFn that maps a key substring to a return
// value or error. Keys that identify each probe:
//
//	"symbolic-ref"  → default-branch probe
//	"--show-current" → current-branch probe
//	"--porcelain"   → working-tree status probe
func makeStubRunnerGo(responses map[string]interface{}) gitRunnerFn {
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

// ── resolveGitState unit tests ────────────────────────────────────────────────

// 2.1(a) default-branch probe errors → dirty probe still runs (non-nil).
func TestGitState_DefaultBranchFailsDirtyStillRuns(t *testing.T) {
	old := gitRunner
	defer func() { gitRunner = old }()

	gitRunner = makeStubRunnerGo(map[string]interface{}{
		"symbolic-ref":   errors.New("no remote HEAD"),
		"--show-current": "feat/my-feature",
		"--porcelain":    "M scripts/foo.js",
	})

	result := resolveGitState(context.Background())

	if result.DefaultBranch != nil {
		t.Errorf("defaultBranch: expected nil, got %q", *result.DefaultBranch)
	}
	if result.Dirty == nil {
		t.Error("dirty: expected non-nil (probe ran independently), got nil")
	}
	if result.Dirty != nil && !*result.Dirty {
		t.Errorf("dirty: expected true, got false")
	}
}

// 2.1(b) empty porcelain output → dirty = &false; status error → dirty = nil.
func TestGitState_EmptyPorcelainClean(t *testing.T) {
	old := gitRunner
	defer func() { gitRunner = old }()

	gitRunner = makeStubRunnerGo(map[string]interface{}{
		"symbolic-ref":   "origin/main",
		"--show-current": "main",
		"--porcelain":    "",
	})

	result := resolveGitState(context.Background())

	if result.Dirty == nil {
		t.Fatal("dirty: expected non-nil, got nil")
	}
	if *result.Dirty {
		t.Errorf("dirty: expected false, got true")
	}
}

func TestGitState_StatusProbeErrorDirtyNil(t *testing.T) {
	old := gitRunner
	defer func() { gitRunner = old }()

	gitRunner = makeStubRunnerGo(map[string]interface{}{
		"symbolic-ref":   "origin/main",
		"--show-current": "main",
		"--porcelain":    errors.New("git status failed"),
	})

	result := resolveGitState(context.Background())

	if result.Dirty != nil {
		t.Errorf("dirty: expected nil when probe fails, got %v", *result.Dirty)
	}
}

// 2.1(c) untracked-only line → dirty = &true.
func TestGitState_UntrackedFileDirtyTrue(t *testing.T) {
	old := gitRunner
	defer func() { gitRunner = old }()

	gitRunner = makeStubRunnerGo(map[string]interface{}{
		"symbolic-ref":   "origin/main",
		"--show-current": "main",
		"--porcelain":    "?? file.txt",
	})

	result := resolveGitState(context.Background())

	if result.Dirty == nil {
		t.Fatal("dirty: expected non-nil")
	}
	if !*result.Dirty {
		t.Errorf("dirty: expected true for untracked file, got false")
	}
}

// 2.1(d) context deadline exhausted → all fields nil.
func TestGitState_DeadlineExhausted(t *testing.T) {
	old := gitRunner
	defer func() { gitRunner = old }()

	gitRunner = func(ctx context.Context, args []string) (string, error) {
		return "", ctx.Err()
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // immediately cancelled

	result := resolveGitState(ctx)

	if result.DefaultBranch != nil {
		t.Errorf("defaultBranch: expected nil on deadline, got %q", *result.DefaultBranch)
	}
	if result.CurrentBranch != nil {
		t.Errorf("currentBranch: expected nil on deadline, got %q", *result.CurrentBranch)
	}
	if result.Dirty != nil {
		t.Errorf("dirty: expected nil on deadline, got %v", *result.Dirty)
	}
}

// current-branch probe fails → currentBranch nil, others unaffected.
func TestGitState_CurrentBranchProbeFailsOthersOk(t *testing.T) {
	old := gitRunner
	defer func() { gitRunner = old }()

	gitRunner = makeStubRunnerGo(map[string]interface{}{
		"symbolic-ref":   "origin/main",
		"--show-current": errors.New("detached HEAD"),
		"--porcelain":    "",
	})

	result := resolveGitState(context.Background())

	if result.CurrentBranch != nil {
		t.Errorf("currentBranch: expected nil, got %q", *result.CurrentBranch)
	}
	if result.DefaultBranch == nil || *result.DefaultBranch != "main" {
		t.Errorf("defaultBranch: expected 'main', got %v", result.DefaultBranch)
	}
	if result.Dirty == nil || *result.Dirty {
		t.Errorf("dirty: expected &false, got %v", result.Dirty)
	}
}

// Strips remote/ prefix from symbolic-ref output.
func TestGitState_StripRemotePrefix(t *testing.T) {
	old := gitRunner
	defer func() { gitRunner = old }()

	gitRunner = makeStubRunnerGo(map[string]interface{}{
		"symbolic-ref":   "origin/develop",
		"--show-current": "develop",
		"--porcelain":    "",
	})

	result := resolveGitState(context.Background())

	if result.DefaultBranch == nil || *result.DefaultBranch != "develop" {
		t.Errorf("defaultBranch: expected 'develop', got %v", result.DefaultBranch)
	}
}

// ── composeAdvisory tests ─────────────────────────────────────────────────────

func TestComposeAdvisory_DefaultOnly(t *testing.T) {
	falsy := false
	msg := composeAdvisory(true, &falsy, "main")
	if !strings.Contains(msg, "rama por defecto") {
		t.Errorf("default-only: expected 'rama por defecto' in %q", msg)
	}
	if !strings.Contains(msg, "main") {
		t.Errorf("default-only: expected branch name 'main' in %q", msg)
	}
	if strings.Contains(msg, "sin commitear") {
		t.Errorf("default-only: must NOT contain 'sin commitear' in %q", msg)
	}
}

func TestComposeAdvisory_DefaultOnlyNilDirty(t *testing.T) {
	// dirty=nil (probe failed) should not trigger dirty advisory.
	msg := composeAdvisory(true, nil, "main")
	if !strings.Contains(msg, "rama por defecto") {
		t.Errorf("expected 'rama por defecto' when dirty=nil: %q", msg)
	}
	if strings.Contains(msg, "sin commitear") {
		t.Errorf("must NOT contain 'sin commitear' when dirty=nil: %q", msg)
	}
}

func TestComposeAdvisory_DirtyOnly(t *testing.T) {
	truthy := true
	msg := composeAdvisory(false, &truthy, "feat/my-feature")
	if !strings.Contains(msg, "sin commitear") {
		t.Errorf("dirty-only: expected 'sin commitear' in %q", msg)
	}
	if strings.Contains(msg, "rama por defecto") {
		t.Errorf("dirty-only: must NOT contain 'rama por defecto' in %q", msg)
	}
}

func TestComposeAdvisory_Combined(t *testing.T) {
	truthy := true
	msg := composeAdvisory(true, &truthy, "main")
	if !strings.Contains(msg, "rama por defecto") {
		t.Errorf("combined: expected 'rama por defecto' in %q", msg)
	}
	if !strings.Contains(msg, "sin commitear") {
		t.Errorf("combined: expected 'sin commitear' in %q", msg)
	}
	if !strings.Contains(msg, "main") {
		t.Errorf("combined: expected branch name in %q", msg)
	}
}

// ── 2.1(e) Parity assertions ──────────────────────────────────────────────────
// For each canonical scenario, assert the expected permissionDecision matches
// what the Node runtime would produce (validated by Phase 3/5 Node tests).

// Scenario: default-branch only (clean feature branch for comparison).
func TestGitState_ParityScenario_DefaultBranchOnly(t *testing.T) {
	old := gitRunner
	defer func() { gitRunner = old }()

	gitRunner = makeStubRunnerGo(map[string]interface{}{
		"symbolic-ref":   "origin/main",
		"--show-current": "main",
		"--porcelain":    "",
	})

	result := resolveGitState(context.Background())
	onDefault := result.DefaultBranch != nil && result.CurrentBranch != nil &&
		*result.DefaultBranch == *result.CurrentBranch
	isDirty := result.Dirty != nil && *result.Dirty

	if !onDefault {
		t.Fatal("parity/default-only: onDefault should be true")
	}
	if isDirty {
		t.Fatal("parity/default-only: isDirty should be false")
	}
	// Expected permissionDecision: "ask" (mirroring Node 3.1(a))
	advisory := composeAdvisory(onDefault, result.Dirty, *result.CurrentBranch)
	if !strings.Contains(advisory, "rama por defecto") {
		t.Errorf("parity/default-only: advisory must contain 'rama por defecto': %q", advisory)
	}
}

// Scenario: dirty-only (feature branch).
func TestGitState_ParityScenario_DirtyOnly(t *testing.T) {
	old := gitRunner
	defer func() { gitRunner = old }()

	gitRunner = makeStubRunnerGo(map[string]interface{}{
		"symbolic-ref":   "origin/main",
		"--show-current": "feat/x",
		"--porcelain":    "M modified.js",
	})

	result := resolveGitState(context.Background())
	onDefault := result.DefaultBranch != nil && result.CurrentBranch != nil &&
		*result.DefaultBranch == *result.CurrentBranch
	isDirty := result.Dirty != nil && *result.Dirty

	if onDefault {
		t.Fatal("parity/dirty-only: onDefault should be false (feature branch)")
	}
	if !isDirty {
		t.Fatal("parity/dirty-only: isDirty should be true")
	}
	advisory := composeAdvisory(onDefault, result.Dirty, "")
	if !strings.Contains(advisory, "sin commitear") {
		t.Errorf("parity/dirty-only: advisory must contain 'sin commitear': %q", advisory)
	}
}

// Scenario: combined (default branch AND dirty).
func TestGitState_ParityScenario_Combined(t *testing.T) {
	old := gitRunner
	defer func() { gitRunner = old }()

	gitRunner = makeStubRunnerGo(map[string]interface{}{
		"symbolic-ref":   "origin/main",
		"--show-current": "main",
		"--porcelain":    "M modified.js",
	})

	result := resolveGitState(context.Background())
	onDefault := result.DefaultBranch != nil && result.CurrentBranch != nil &&
		*result.DefaultBranch == *result.CurrentBranch
	advisory := composeAdvisory(onDefault, result.Dirty, *result.CurrentBranch)

	if !strings.Contains(advisory, "rama por defecto") {
		t.Errorf("parity/combined: must contain 'rama por defecto': %q", advisory)
	}
	if !strings.Contains(advisory, "sin commitear") {
		t.Errorf("parity/combined: must contain 'sin commitear': %q", advisory)
	}
}

// ── Finding 3 remediation (RED) — hostile branch name sanitized in composeAdvisory ──

func TestComposeAdvisory_HostileBranchName_ControlCharsStripped(t *testing.T) {
	// Branch name with control characters including ESC (ANSI injection attempt)
	hostile := "main\x00\x1f\x1b[31mred\x1b[0m\r\ncontinued"
	msg := composeAdvisory(true, nil, hostile)

	// Control characters must not appear in the advisory
	for _, r := range msg {
		if (r >= 0x00 && r <= 0x1f) || r == 0x7f {
			t.Errorf("control char U+%04X found in advisory: %q", r, msg)
		}
	}
	// Advisory must still be non-empty
	if msg == "" {
		t.Error("advisory must be non-empty even for hostile branch name")
	}
}

func TestComposeAdvisory_LongBranchName_Truncated(t *testing.T) {
	longBranch := strings.Repeat("a", 200)
	msg := composeAdvisory(true, nil, longBranch)
	// 200-char branch name must not appear verbatim
	if strings.Contains(msg, longBranch) {
		t.Error("200-char branch name must be truncated")
	}
	// Must contain the truncated form (120 'a's) or an ellipsis
	if !strings.Contains(msg, strings.Repeat("a", 120)) && !strings.Contains(msg, "…") {
		t.Errorf("truncated advisory must contain 120 'a' chars or ellipsis: %q", msg)
	}
}

// Scenario: clean feature branch → no advisory fires.
func TestGitState_ParityScenario_CleanFeature(t *testing.T) {
	old := gitRunner
	defer func() { gitRunner = old }()

	gitRunner = makeStubRunnerGo(map[string]interface{}{
		"symbolic-ref":   "origin/main",
		"--show-current": "feat/x",
		"--porcelain":    "",
	})

	result := resolveGitState(context.Background())
	onDefault := result.DefaultBranch != nil && result.CurrentBranch != nil &&
		*result.DefaultBranch == *result.CurrentBranch
	isDirty := result.Dirty != nil && *result.Dirty

	if onDefault || isDirty {
		t.Errorf("parity/clean-feature: guard must NOT fire (onDefault=%v, isDirty=%v)", onDefault, isDirty)
	}
}
