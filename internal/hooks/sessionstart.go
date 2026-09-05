// session-start hook handler.
// Ports runSessionStart logic from scripts/hooks/session-start.js.
// Operates in single-repo mode only (no workspace-federated backend in Phase 1).
package hooks

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"time"

	"github.com/snakeblack/ospec-workflow/internal/skillreg"
	"github.com/snakeblack/ospec-workflow/internal/store"
)

func init() {
	Register(&sessionStartHandler{})
}

type sessionStartHandler struct{}

func (h *sessionStartHandler) Name() string { return "session-start" }

// sessionStartInput is the stdin payload for session-start.
type sessionStartInput struct {
	Cwd        string `json:"cwd"`
	PluginRoot string `json:"plugin_root"`
	Now        string `json:"now"` // optional ISO-8601 override for generated_at
}

// sessionStartOutput is the JSON written to stdout on success.
type sessionStartOutput struct {
	Status           string                    `json:"status"`
	OspecDetected    bool                      `json:"ospecDetected"`
	Registry         registryResult            `json:"registry"`
	Baseline         *baselineResult           `json:"baseline,omitempty"`
	Security         *securityResult           `json:"security,omitempty"`
	GitCollaboration *gitCollaborationResult   `json:"gitCollaboration,omitempty"`
	SystemMessage    string                    `json:"systemMessage,omitempty"`
}

// gitCollaborationResult holds the git collaboration advisory data.
// DirtyTree is a pointer so it can be omitted (nil) when the status probe failed
// (never falsely reports "clean").
type gitCollaborationResult struct {
	Status        string  `json:"status"`
	CurrentBranch *string `json:"currentBranch"`
	DefaultBranch *string `json:"defaultBranch"`
	DirtyTree     *bool   `json:"dirtyTree,omitempty"`
	Message       string  `json:"message"`
}

type registryResult struct {
	Status string `json:"status"`
	Path   string `json:"path"`
}

type baselineResult struct {
	Hint string `json:"hint"`
}

type securityResult struct {
	Status string          `json:"status"`
	Alerts []securityAlert `json:"alerts"`
}

type securityAlert struct {
	Type   string `json:"type"`
	File   string `json:"file"`
	Reason string `json:"reason"`
}

// buildBaselineHint ports buildBaselineHint from session-start.js.
func buildBaselineHint(b *store.BaselineState) string {
	if b == nil {
		return ""
	}
	if b.Status == "pending" {
		return "Baseline not started. Run /sdd-baseline to seed openspec/specs/."
	}
	if b.Status == "partial" {
		count := len(b.DomainsPending)
		return fmt.Sprintf("Baseline partial: %d domain(s) pending. Run /sdd-baseline to resume.", count)
	}
	if len(b.StaleDomains) > 0 {
		list := strings.Join(b.StaleDomains, ", ")
		return fmt.Sprintf("Baseline done but %d domain(s) stale: %s. Run /sdd-baseline refresh to update.",
			len(b.StaleDomains), list)
	}
	return ""
}

func (h *sessionStartHandler) Run(stdin []byte) ([]byte, int) {
	var input sessionStartInput
	if err := json.Unmarshal(stdin, &input); err != nil {
		return errorOutput(err), 1
	}
	return runSessionStart(input)
}

func runSessionStart(input sessionStartInput) ([]byte, int) {
	// Resolve workspace.
	workspace := strings.TrimSpace(input.Cwd)
	if workspace == "" {
		// Fallback: use process working directory.
		workspace = "."
	}
	workspace = filepath.Clean(workspace)

	s := store.NewStore(workspace)

	initialized, err := s.IsInitialized()
	if err != nil {
		return errorOutput(err), 1
	}

	if !initialized {
		out := sessionStartOutput{
			Status:        "ok",
			OspecDetected: false,
			Registry: registryResult{
				Status: "skipped",
				Path:   store.CacheRelPath,
			},
		}
		b, _ := json.Marshal(out)
		return b, 0
	}

	// Read config for baseline hint.
	var baselineHint string
	if cfgData, err := s.ReadConfig(); err == nil && cfgData != nil {
		bs := store.ReadBaselineState(string(cfgData))
		baselineHint = buildBaselineHint(bs)
	}

	// Resolve plugin root: the launcher passes it on stdin for known hosts and
	// through OSPEC_PLUGIN_ROOT for hosts whose hook payload is only {cwd}
	// (Codex). Unlike the JS hook (which defaults to the script's own
	// location), the binary cannot derive its bundle, so the final fallback is
	// the process working directory — valid only when invoked from the plugin
	// root; direct invocations should rely on the launcher's env.
	pluginRoot := strings.TrimSpace(input.PluginRoot)
	if pluginRoot == "" {
		pluginRoot = strings.TrimSpace(os.Getenv("OSPEC_PLUGIN_ROOT"))
	}
	if pluginRoot == "" {
		pluginRoot = "."
	}
	pluginRoot = filepath.Clean(pluginRoot)

	// Global Codex installs split scripts (~/.codex/ospec-workflow) from
	// skills (~/.agents/skills). Source and generated bundles retain
	// root/skills.
	skillsRoot := filepath.Join(pluginRoot, "skills")
	if os.Getenv("OSPEC_TARGET") == "codex" {
		if home, err := os.UserHomeDir(); err == nil {
			installedRoot := filepath.Join(home, ".codex", "ospec-workflow")
			if rel, err := filepath.Rel(installedRoot, pluginRoot); err == nil && rel == "." {
				skillsRoot = filepath.Join(home, ".agents", "skills")
			}
		}
	}

	discovery, err := skillreg.DiscoverSkills(pluginRoot, skillreg.DiscoverOptions{
		SkillsRoot:    skillsRoot,
		RequireSkills: true,
	})
	if err != nil {
		return errorOutput(err), 1
	}

	fingerprint, err := skillreg.CalculateFingerprint(discovery.FingerprintPaths)
	if err != nil {
		return errorOutput(err), 1
	}

	cachePath := s.CachePath()
	currentCache, _ := skillreg.ReadCache(cachePath)

	// Cache hit: same version, same fingerprint, and cache entries that match
	// a fresh discovery. A cache whose skills were emptied or stale must be
	// repaired even when the fingerprint still matches.
	cacheHit := false
	if currentCache != nil {
		v, _ := currentCache["version"].(float64)
		fp, _ := currentCache["fingerprint"].(string)
		cacheHit = int(v) == skillreg.CacheVersion && fp == fingerprint &&
			skillsMatchCache(currentCache["skills"], discovery.Skills)
	}

	regStatus := "generated"
	if cacheHit {
		regStatus = "reused"
	}

	if !cacheHit {
		// Resolve now timestamp.
		generatedAt := time.Now().UTC().Format(time.RFC3339Nano)
		if nowStr := strings.TrimSpace(input.Now); nowStr != "" {
			generatedAt = nowStr
		}

		cache := map[string]any{
			"version":      skillreg.CacheVersion,
			"fingerprint":  fingerprint,
			"generated_at": generatedAt,
			"skills":       skillsToMaps(discovery.Skills),
		}
		if err := skillreg.WriteCache(cachePath, cache); err != nil {
			return errorOutput(err), 1
		}
	}

	out := sessionStartOutput{
		Status:        "ok",
		OspecDetected: true,
		Registry: registryResult{
			Status: regStatus,
			Path:   store.CacheRelPath,
		},
	}
	if baselineHint != "" {
		out.Baseline = &baselineResult{Hint: baselineHint}
	}

	if os.Getenv("DISABLE_AGENT_SHIELD") != "true" {
		var alerts []securityAlert

		// Check .env and .npmrc files in workspace root
		envFiles := []string{".env", ".env.local", ".env.development", ".env.production", ".npmrc"}

		// Read .gitignore
		var gitignoreLines []string
		if gitignoreData, err := os.ReadFile(filepath.Join(workspace, ".gitignore")); err == nil {
			lines := strings.Split(string(gitignoreData), "\n")
			for _, line := range lines {
				trimmed := strings.TrimSpace(line)
				if trimmed != "" && !strings.HasPrefix(trimmed, "#") {
					gitignoreLines = append(gitignoreLines, trimmed)
				}
			}
		} else if !os.IsNotExist(err) {
			fmt.Fprintf(os.Stderr, "Warning: failed to read .gitignore: %v\n", err)
		}

		for _, f := range envFiles {
			if _, err := os.Stat(filepath.Join(workspace, f)); err == nil {
				// Check if ignored in gitignore
				ignored := false
				for _, line := range gitignoreLines {
					if isPathIgnored(line, f) {
						ignored = true
						break
					}
				}
				if !ignored {
					alerts = append(alerts, securityAlert{
						Type:   "unignored-env-file",
						File:   f,
						Reason: "El archivo sensible no está ignorado en Git",
					})
				}
			}
		}

		// Check .git/config in workspace root
		gitConfigPath := filepath.Join(workspace, ".git", "config")
		if _, err := os.Stat(gitConfigPath); err == nil {
			if configData, err := os.ReadFile(gitConfigPath); err == nil {
				match, _ := regexp.MatchString(`https?://[^/:\s]+:[^/:\s]+@`, string(configData))
				if match {
					alerts = append(alerts, securityAlert{
						Type:   "embedded-credentials",
						File:   ".git/config",
						Reason: "El archivo contiene credenciales en texto plano",
					})
				}
			} else if !os.IsNotExist(err) {
				fmt.Fprintf(os.Stderr, "Warning: failed to read .git/config: %v\n", err)
			}
		}

		if len(alerts) > 0 {
			out.Security = &securityResult{
				Status: "warning",
				Alerts: alerts,
			}
			var alertDetails []string
			for _, a := range alerts {
				alertDetails = append(alertDetails, fmt.Sprintf("%s (%s)", a.File, a.Reason))
			}
			out.SystemMessage = fmt.Sprintf("Cuidado: Se detectaron riesgos de seguridad en la inicialización: %s. Por favor asegúrate de corregirlos.", strings.Join(alertDetails, ", "))
		}
	}

	// Git collaboration advisory — checked after the security block.
	// Omitted entirely when the bypass env var is set or when both conditions
	// are absent (clean feature branch).
	if os.Getenv("DISABLE_GIT_COLLABORATION_GUARD") != "true" {
		gsCtx, gsCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer gsCancel()
		gs := resolveGitState(gsCtx)
		onDefault := gs.DefaultBranch != nil && gs.CurrentBranch != nil &&
			*gs.DefaultBranch == *gs.CurrentBranch
		if onDefault || (gs.Dirty != nil && *gs.Dirty) {
			branchName := ""
			if gs.CurrentBranch != nil {
				branchName = *gs.CurrentBranch
			}
			advisory := composeAdvisory(onDefault, gs.Dirty, branchName)
			collab := &gitCollaborationResult{
				Status:        "warning",
				CurrentBranch: gs.CurrentBranch,
				DefaultBranch: gs.DefaultBranch,
				// DirtyTree is omitted (nil) when the status probe failed —
				// we never falsely report "clean".
				DirtyTree: gs.Dirty,
				Message:   advisory,
			}
			out.GitCollaboration = collab
			if out.SystemMessage != "" {
				out.SystemMessage += "\n" + advisory
			} else {
				out.SystemMessage = advisory
			}
		}
	}

	b, _ := json.Marshal(out)
	return b, 0
}

// errorOutput encodes a {status:"error",message:...} blob.
func errorOutput(err error) []byte {
	type errOut struct {
		Status  string `json:"status"`
		Message string `json:"message"`
	}
	b, _ := json.Marshal(errOut{Status: "error", Message: err.Error()})
	return b
}

// skillsToMaps converts skill entries to the cache's JSON shape.
func skillsToMaps(skills []skillreg.SkillEntry) []map[string]any {
	skillsSlice := make([]map[string]any, len(skills))
	for i, sk := range skills {
		skillsSlice[i] = map[string]any{
			"id":            sk.ID,
			"path":          sk.Path,
			"triggers":      sk.Triggers,
			"compact_rules": sk.CompactRules,
			"capabilities":  sk.Capabilities,
		}
	}
	return skillsSlice
}

// skillsMatchCache compares the cached skills value against a fresh
// discovery. Both sides go through a JSON round-trip so the comparison sees
// the same dynamic types a decoded cache holds, mirroring the JS
// isDeepStrictEqual cache-hit check.
func skillsMatchCache(cached any, skills []skillreg.SkillEntry) bool {
	expected, err := json.Marshal(skillsToMaps(skills))
	if err != nil {
		return false
	}
	var normalized any
	if err := json.Unmarshal(expected, &normalized); err != nil {
		return false
	}
	return reflect.DeepEqual(normalized, cached)
}

func isPathIgnored(line string, f string) bool {
	if line == f || line == "/"+f || line == f+"/" {
		return true
	}
	// Check for glob matches (e.g. .env*)
	if matched, err := filepath.Match(line, f); err == nil && matched {
		return true
	}
	if matched, err := filepath.Match(strings.TrimPrefix(line, "/"), f); err == nil && matched {
		return true
	}
	return false
}
