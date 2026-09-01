package dashboard

import (
	"github.com/snakeblack/ospec-workflow/internal/system"
)

// DetectTargets scans the repo root to identify which AI target configurations exist,
// delegating to the unified system inspection engine.
func DetectTargets(repoRoot string) []TargetInfo {
	specs := system.InspectTargets(repoRoot)
	results := make([]TargetInfo, 0, len(specs))

	for _, spec := range specs {
		var status TargetStatusKind
		switch spec.Status {
		case system.StatusActive, system.StatusConfigured:
			status = StatusConfigured
		case system.StatusDetected:
			status = StatusDetected
		default:
			status = StatusNotConfigured
		}

		results = append(results, TargetInfo{
			ID:          spec.ID,
			DisplayName: spec.DisplayName,
			Status:      status,
			Evidence:    spec.Evidence,
		})
	}

	return results
}
