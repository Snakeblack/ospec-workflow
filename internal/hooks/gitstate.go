// gitstate.go — Git state resolution helpers for the collaboration guard.
// Mirrors scripts/hooks/lib/git-state.js with Go/Node parity contract.
package hooks

import (
	"context"
	"os/exec"
	"strings"
	"time"
	"unicode"
)

// gitRunnerFn is the signature for an injectable git command runner.
// It receives the git arguments and returns stdout or an error.
type gitRunnerFn func(ctx context.Context, args []string) (string, error)

// gitRunner is the active runner. Tests replace it via export_test.go.
var gitRunner gitRunnerFn = defaultGitRunner

// defaultGitRunner executes git with a timeout derived from the context.
func defaultGitRunner(ctx context.Context, args []string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(out), nil
}

// gitStateResult holds the three independent probe results.
// A nil pointer means the probe failed (fail-open); &false means clean.
type gitStateResult struct {
	DefaultBranch *string
	CurrentBranch *string
	Dirty         *bool // nil=probe failed, &false=clean, &true=dirty
}

// resolveGitState runs three independent git probes with a 5 s shared
// deadline. Any probe failure sets ONLY that field to nil/zero without
// affecting the others (per-field fail-open contract).
func resolveGitState(ctx context.Context) gitStateResult {
	timeoutCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var result gitStateResult

	// Probe 1: default branch via origin/HEAD symbolic ref.
	if out, err := gitRunner(timeoutCtx, []string{
		"symbolic-ref", "refs/remotes/origin/HEAD", "--short",
	}); err == nil {
		s := strings.TrimSpace(out)
		// "origin/main" → strip "<remote>/" prefix → "main"
		if idx := strings.Index(s, "/"); idx >= 0 {
			s = s[idx+1:]
		}
		if s != "" {
			result.DefaultBranch = &s
		}
	}

	// Probe 2: current branch (empty output = detached HEAD → nil).
	if out, err := gitRunner(timeoutCtx, []string{"branch", "--show-current"}); err == nil {
		s := strings.TrimSpace(out)
		if s != "" {
			result.CurrentBranch = &s
		}
	}

	// Probe 3: working tree state via --porcelain.
	// dirty stays nil only when this probe fails — never falsely reports clean.
	if out, err := gitRunner(timeoutCtx, []string{"status", "--porcelain"}); err == nil {
		isDirty := strings.TrimSpace(out) != ""
		result.Dirty = &isDirty
	}

	return result
}

// sanitizeBranchName strips C0/C1 control characters (U+0000–U+001F, U+007F)
// from the branch name, collapses whitespace, and truncates to 120 Unicode
// code points with an ellipsis to prevent prompt injection.
// Identical logic is applied in composeAdvisory (git-state.js) — keep in sync.
func sanitizeBranchName(name string) string {
	if name == "" {
		return name
	}
	// Strip control characters (C0: 0x00–0x1F, DEL: 0x7F)
	var b strings.Builder
	for _, r := range name {
		if !unicode.IsControl(r) {
			b.WriteRune(r)
		}
	}
	// Collapse whitespace sequences to a single space
	s := strings.Join(strings.Fields(b.String()), " ")
	// Truncate to 120 Unicode code points
	runes := []rune(s)
	if len(runes) > 120 {
		s = string(runes[:120]) + "…"
	}
	return s
}

// composeAdvisory builds the Spanish advisory message for the git-collaboration
// guard. Three variants correspond to the condition(s) that triggered:
//
//	combined     — onDefault=true  AND dirty=true
//	default-only — onDefault=true  AND dirty != true  (incl. nil)
//	dirty-only   — onDefault=false AND dirty=true
//
// branchName is the resolved current branch (may be empty when unresolvable).
func composeAdvisory(onDefault bool, dirty *bool, branchName string) string {
	isDirty := dirty != nil && *dirty
	branch := sanitizeBranchName(branchName)
	if branch == "" {
		branch = "la rama por defecto"
	}

	switch {
	case onDefault && isDirty:
		return "Estás en la rama por defecto '" + branch + "' y el árbol de trabajo tiene cambios sin commitear. " +
			"Crea una rama de feature (<tipo>/<descripción>) y haz commit o stash de los cambios antes de continuar."
	case onDefault:
		return "Estás en la rama por defecto '" + branch + "'. " +
			"Crea una rama de feature (<tipo>/<descripción>) antes de realizar cambios en el código."
	case isDirty:
		return "El árbol de trabajo tiene cambios sin commitear. " +
			"Haz commit o stash de los cambios antes de continuar."
	default:
		return ""
	}
}
