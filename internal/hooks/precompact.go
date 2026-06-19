// pre-compact hook handler.
// Ports runPreCompact from scripts/hooks/pre-compact.js.
// Always exits 0 and emits {"continue":true}. Uses internal/store + internal/yamllite.
package hooks

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/store"
	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/yamllite"
)

func init() {
	Register(&preCompactHandler{})
}

type preCompactHandler struct{}

func (h *preCompactHandler) Name() string { return "pre-compact" }

// phaseRanks mirrors PHASE_RANKS in pre-compact.js.
var phaseRanks = map[string]int{
	"explore":    1,
	"exploration": 1,
	"propose":    2,
	"proposal":   2,
	"spec":       3,
	"specs":      3,
	"design":     3,
	"tasks":      4,
	"apply":      5,
	"verify":     6,
	"archive":    7,
}

// artifactCandidates mirrors ARTIFACT_CANDIDATES in pre-compact.js.
type artifactCandidate struct {
	relativePath string
	rank         int
}

var artifactCandidates = []artifactCandidate{
	{"exploration.md", 1},
	{"proposal-lite.md", 2},
	{"proposal.md", 2},
	{"design.md", 3},
	{"tasks.md", 4},
	{"apply-progress.md", 5},
	{"verify-report.md", 6},
	{"archive-report.md", 7},
}

func (h *preCompactHandler) Run(stdin []byte) ([]byte, int) {
	var input struct {
		Cwd string `json:"cwd"`
	}
	if err := json.Unmarshal(stdin, &input); err != nil {
		return continueWithError(fmt.Sprintf("PreCompact could not persist the session summary: %s", err.Error())), 0
	}

	warn, err := runPreCompact(input.Cwd)
	if err != nil {
		return continueWithError(fmt.Sprintf("PreCompact could not persist the session summary: %s", err.Error())), 0
	}

	if warn != "" {
		b, _ := json.Marshal(map[string]any{"continue": true, "systemMessage": warn})
		return b, 0
	}
	b, _ := json.Marshal(map[string]bool{"continue": true})
	return b, 0
}

// runPreCompact returns (walkWarning, error). walkWarning is non-empty when
// collectSpecArtifactsPC encountered a Walk error during artifact discovery.
// The caller surfaces it as a non-blocking systemMessage (continue:true, exit 0).
func runPreCompact(cwd string) (string, error) {
	workspace := resolveCwd(cwd)
	s := store.NewStore(workspace)

	changes, err := s.FindActiveChanges()
	if err != nil {
		return "", err
	}
	if len(changes) == 0 {
		return "", nil // no active change → silently skip
	}
	activeChange := changes[0]

	changeName := yamllite.ExtractFirstScalar(activeChange.Content, [][]string{
		{"change", "name"},
	})
	if changeName == "" {
		changeName = activeChange.DirectoryName
	}

	currentPhase := yamllite.ExtractFirstScalar(activeChange.Content, [][]string{
		{"change", "current_phase"},
		{"current_phase"},
		{"phase"},
	})

	lastArtifact, walkWarning, err := inferLastCompletedArtifact(workspace, activeChange, currentPhase)
	if err != nil {
		return "", err
	}

	approvals := formatApprovalsPC(activeChange.Content)
	blockers := formatBlockersPC(activeChange.Content)
	nextRec := yamllite.ExtractFirstScalar(activeChange.Content, [][]string{{"next_recommended"}})
	nextAction := yamllite.FormatNextAction(nextRec, changeName)

	summary := renderSummaryPC(renderSummaryPCArgs{
		changeName:            changeName,
		currentPhase:          currentPhase,
		lastCompletedArtifact: lastArtifact,
		blockers:              blockers,
		approvals:             approvals,
		nextAction:            nextAction,
	})

	_, err = s.WriteSessionSummary(activeChange.DirectoryName, summary)
	return walkWarning, err
}

// ── last-artifact inference ────────────────────────────────────────────────────

func normalizePhase(v string) string {
	v = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(v)), "sdd-")
	return v
}

func toPortablePathPC(p string) string {
	return filepath.ToSlash(p)
}

func pathIsFilePC(p string) bool {
	info, err := os.Stat(p)
	return err == nil && info.Mode().IsRegular()
}

// collectSpecArtifactsPC walks changeDir/specs collecting spec.md files.
// Returns (candidates, warning) where warning is non-empty only when filepath.Walk
// encounters a GENUINE error inside an existing tree — not the expected benign case
// where specsRoot itself is absent or inaccessible.
//
// Missing or inaccessible specsRoot is treated as benign: it is the expected state
// for lite changes and standard changes before the spec phase. This mirrors the
// ENOENT/EACCES policy of readFilePermissive, so the "no specs/ yet" condition is
// never surfaced as a user-visible systemMessage.
func collectSpecArtifactsPC(changeDir string) ([]artifactCandidate, string) {
	specsRoot := filepath.Join(changeDir, "specs")

	// Guard: stat specsRoot before walking. An absent (ENOENT) or inaccessible
	// (EACCES) specsRoot is benign — mirror readFilePermissive's errno policy.
	// Only walk when specsRoot is confirmed present and accessible, so the
	// "no specs/ yet" steady state never triggers a user-visible warning.
	if _, err := os.Lstat(specsRoot); err != nil {
		if os.IsNotExist(err) || os.IsPermission(err) {
			return nil, "" // benign: absent/inaccessible root, no warning
		}
		// Non-benign stat error on specsRoot itself — surface it.
		return nil, fmt.Sprintf("PreCompact: artifact scan error at %s: %s", specsRoot, err.Error())
	}

	var out []artifactCandidate
	var walkWarning string

	_ = filepath.Walk(specsRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			if walkWarning == "" {
				walkWarning = fmt.Sprintf("PreCompact: artifact scan error at %s: %s", path, err.Error())
			}
			return nil // non-fatal: continue walking
		}
		if !info.IsDir() && info.Name() == "spec.md" {
			// path is always a descendant of changeDir inside filepath.Walk.
			rel := toPortablePathPC(strings.TrimPrefix(path, changeDir+string(filepath.Separator)))
			out = append(out, artifactCandidate{rel, 3})
		}
		return nil
	})

	sort.Slice(out, func(i, j int) bool { return out[i].relativePath < out[j].relativePath })
	return out, walkWarning
}

// inferLastCompletedArtifact returns (lastArtifact, walkWarning, error).
// walkWarning is non-empty when collectSpecArtifactsPC encountered a Walk error;
// it is surfaced by the caller as a non-blocking systemMessage.
func inferLastCompletedArtifact(workspace string, activeChange *store.ActiveChange, phase string) (string, string, error) {
	// Check for explicit override.
	explicit := yamllite.ExtractFirstScalar(activeChange.Content, [][]string{
		{"runtime", "last_completed_artifact"},
		{"last_completed_artifact"},
	})
	if explicit != "" {
		return toPortablePathPC(explicit), "", nil
	}

	currentRank := phaseRanks[normalizePhase(phase)]
	if currentRank == 0 {
		currentRank = 1<<31 - 1 // infinity
	}

	specCandidates, walkWarning := collectSpecArtifactsPC(activeChange.ChangeDirectory)
	candidates := append(append([]artifactCandidate{}, artifactCandidates...), specCandidates...)

	var existing []artifactCandidate
	for _, c := range candidates {
		if c.rank < currentRank && pathIsFilePC(filepath.Join(activeChange.ChangeDirectory, filepath.FromSlash(c.relativePath))) {
			existing = append(existing, c)
		}
	}

	if len(existing) == 0 {
		return "None", walkWarning, nil
	}

	// Sort: highest rank first, then reverse-alpha.
	sort.Slice(existing, func(i, j int) bool {
		if existing[i].rank != existing[j].rank {
			return existing[i].rank > existing[j].rank
		}
		return existing[i].relativePath > existing[j].relativePath
	})

	best := existing[0]
	abs := filepath.Join(activeChange.ChangeDirectory, filepath.FromSlash(best.relativePath))
	rel, err := filepath.Rel(workspace, abs)
	if err != nil {
		return toPortablePathPC(abs), walkWarning, nil
	}
	return toPortablePathPC(rel), walkWarning, nil
}

// ── rendering ─────────────────────────────────────────────────────────────────

type renderSummaryPCArgs struct {
	changeName            string
	currentPhase          string
	lastCompletedArtifact string
	blockers              []string
	approvals             []string
	nextAction            string
}

func renderListPC(items []string) string {
	if len(items) == 0 {
		return "- None"
	}
	var sb strings.Builder
	for i, v := range items {
		if i > 0 {
			sb.WriteByte('\n')
		}
		sb.WriteString("- ")
		sb.WriteString(v)
	}
	return sb.String()
}

func renderSummaryPC(args renderSummaryPCArgs) string {
	phase := args.currentPhase
	if phase == "" {
		phase = "unknown"
	}
	parts := []string{
		"# Session Summary",
		"",
		"## Active change",
		"`" + args.changeName + "`",
		"",
		"## Current phase",
		"`" + phase + "`",
		"",
		"## Last completed artifact",
		"`" + args.lastCompletedArtifact + "`",
		"",
		"## Blocking decisions",
		renderListPC(args.blockers),
		"",
		"## Approvals",
		renderListPC(args.approvals),
		"",
		"## Next recommended action",
		args.nextAction,
		"",
	}
	return strings.Join(parts, "\n")
}

// formatBlockersPC mirrors formatBlockers in pre-compact.js.
func formatBlockersPC(content string) []string {
	for _, sectionName := range []string{"blocking_questions", "blockers"} {
		items := yamllite.ExtractListSection(content, sectionName)
		if len(items) > 0 {
			var out []string
			for _, item := range items {
				if item.Value != "" {
					out = append(out, item.Value)
				} else if item.Fields != nil {
					// Pick first of: question, message, reason, id, or JSON.
					for _, key := range []string{"question", "message", "reason", "id"} {
						if v, ok := item.Fields[key]; ok && v != "" {
							out = append(out, v)
							break
						}
					}
				}
			}
			if len(out) > 0 {
				return out
			}
		}
		// Scalar fallback.
		scalar := yamllite.ExtractFirstScalar(content, [][]string{{sectionName}})
		if scalar != "" && strings.ToLower(scalar) != "none" {
			return []string{scalar}
		}
	}
	return nil
}

// formatApprovalsPC mirrors formatApprovals in pre-compact.js.
func formatApprovalsPC(content string) []string {
	items := yamllite.ExtractListSection(content, "approvals")
	var out []string
	for _, item := range items {
		if item.Value != "" {
			out = append(out, item.Value)
		} else if item.Fields != nil {
			gate := item.Fields["gate"]
			if gate == "" {
				gate = item.Fields["id"]
			}
			if gate == "" {
				gate = "approval"
			}
			decision := item.Fields["decision"]
			if decision == "" {
				decision = item.Fields["status"]
			}
			if decision == "" {
				decision = "recorded"
			}
			out = append(out, gate+": "+decision)
		}
	}
	return out
}

// resolveCwd resolves the workspace from the input cwd field (or returns ".").
// It applies validatePath (absolute + no "..") then verifies the path is an
// existing directory via os.Stat.  Any failure falls back to ".".
func resolveCwd(cwd string) string {
	cleaned, ok := validatePath(cwd)
	if !ok {
		return "."
	}
	info, err := os.Stat(cleaned)
	if err != nil || !info.IsDir() {
		return "."
	}
	return cleaned
}

// continueWithError returns a {"continue":true,"systemMessage":"..."} payload.
func continueWithError(msg string) []byte {
	b, _ := json.Marshal(map[string]any{
		"continue":      true,
		"systemMessage": msg,
	})
	return b
}
