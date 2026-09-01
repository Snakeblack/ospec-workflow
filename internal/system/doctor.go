package system

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type CheckSeverity string

const (
	SeverityOK      CheckSeverity = "ok"
	SeverityWarning CheckSeverity = "warning"
	SeverityError   CheckSeverity = "error"
)

type CheckCategory string

const (
	CategoryRuntime CheckCategory = "Runtimes & Toolchain"
	CategoryRepo    CheckCategory = "Repository & Git"
	CategoryConfig  CheckCategory = "Project Configuration"
	CategoryAuth    CheckCategory = "API Keys & Credentials"
)

type DoctorCheck struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Category    CheckCategory `json:"category"`
	Severity    CheckSeverity `json:"severity"`
	Message     string        `json:"message"`
	Details     string        `json:"details"`
	Remediation string        `json:"remediation"`
}

type DoctorReport struct {
	Timestamp     time.Time     `json:"timestamp"`
	RepoRoot      string        `json:"repo_root"`
	Checks        []DoctorCheck `json:"checks"`
	TotalPassed   int           `json:"total_passed"`
	TotalWarnings int           `json:"total_warnings"`
	TotalErrors   int           `json:"total_errors"`
}

func (r DoctorReport) Status() string {
	if r.TotalErrors > 0 {
		return "Critical"
	}
	if r.TotalWarnings > 0 {
		return "Degraded"
	}
	return "Healthy"
}

// RunDiagnostics executes the complete diagnostic check suite against the host environment and workspace.
func RunDiagnostics(repoRoot string) DoctorReport {
	report := DoctorReport{
		Timestamp: time.Now(),
		RepoRoot:  repoRoot,
		Checks:    make([]DoctorCheck, 0, 6),
	}

	report.Checks = append(report.Checks, checkNodeVersion())
	report.Checks = append(report.Checks, checkGoVersion())
	report.Checks = append(report.Checks, checkGitCLI())
	report.Checks = append(report.Checks, checkGitWorkingTree(repoRoot))
	report.Checks = append(report.Checks, checkConfigFiles(repoRoot))
	report.Checks = append(report.Checks, checkAPIKeys())

	for _, c := range report.Checks {
		switch c.Severity {
		case SeverityOK:
			report.TotalPassed++
		case SeverityWarning:
			report.TotalWarnings++
		case SeverityError:
			report.TotalErrors++
		}
	}

	return report
}

func checkNodeVersion() DoctorCheck {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "node", "-v")
	out, err := cmd.Output()
	if err != nil {
		return DoctorCheck{
			ID:          "runtime-node",
			Name:        "Node.js Runtime (>= 22)",
			Category:    CategoryRuntime,
			Severity:    SeverityError,
			Message:     "Node.js not found in PATH",
			Details:     fmt.Sprintf("Command 'node -v' failed: %v", err),
			Remediation: "Install Node.js >= 22 (https://nodejs.org or via nvm/fnm/volta)",
		}
	}

	major, minor, patch, parseErr := parseNodeVersion(string(out))
	if parseErr != nil {
		return DoctorCheck{
			ID:          "runtime-node",
			Name:        "Node.js Runtime (>= 22)",
			Category:    CategoryRuntime,
			Severity:    SeverityError,
			Message:     "Unable to parse Node.js version",
			Details:     fmt.Sprintf("Raw output: %s", strings.TrimSpace(string(out))),
			Remediation: "Verify Node.js installation (expected standard semver output)",
		}
	}

	if major < 22 {
		return DoctorCheck{
			ID:          "runtime-node",
			Name:        "Node.js Runtime (>= 22)",
			Category:    CategoryRuntime,
			Severity:    SeverityError,
			Message:     fmt.Sprintf("Node.js v%d.%d.%d is below required version >= 22", major, minor, patch),
			Details:     fmt.Sprintf("Detected version: v%d.%d.%d. Node.js 22 LTS or higher is required.", major, minor, patch),
			Remediation: "Upgrade Node.js to version 22 or higher (e.g. 'nvm install 22')",
		}
	}

	return DoctorCheck{
		ID:          "runtime-node",
		Name:        "Node.js Runtime (>= 22)",
		Category:    CategoryRuntime,
		Severity:    SeverityOK,
		Message:     fmt.Sprintf("Node.js v%d.%d.%d installed and compliant", major, minor, patch),
		Details:     fmt.Sprintf("Detected version v%d.%d.%d meets requirement (>= 22.0.0)", major, minor, patch),
		Remediation: "None (Runtime is healthy)",
	}
}

func parseNodeVersion(raw string) (int, int, int, error) {
	clean := strings.TrimSpace(raw)
	clean = strings.TrimPrefix(clean, "v")
	// Remove pre-release tags like -rc.1
	if idx := strings.Index(clean, "-"); idx != -1 {
		clean = clean[:idx]
	}
	parts := strings.Split(clean, ".")
	if len(parts) < 2 {
		return 0, 0, 0, fmt.Errorf("invalid semver format: %s", raw)
	}

	major, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, 0, 0, err
	}

	minor, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, 0, 0, err
	}

	patch := 0
	if len(parts) >= 3 {
		patch, _ = strconv.Atoi(parts[2])
	}

	return major, minor, patch, nil
}

func checkGoVersion() DoctorCheck {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "go", "version")
	out, err := cmd.Output()
	if err != nil {
		return DoctorCheck{
			ID:          "runtime-go",
			Name:        "Go Toolchain (>= 1.23)",
			Category:    CategoryRuntime,
			Severity:    SeverityError,
			Message:     "Go toolchain not found in PATH",
			Details:     fmt.Sprintf("Command 'go version' failed: %v", err),
			Remediation: "Install Go toolchain >= 1.23 (https://go.dev/dl)",
		}
	}

	major, minor, patch, parseErr := parseGoVersion(string(out))
	if parseErr != nil {
		return DoctorCheck{
			ID:          "runtime-go",
			Name:        "Go Toolchain (>= 1.23)",
			Category:    CategoryRuntime,
			Severity:    SeverityError,
			Message:     "Unable to parse Go version",
			Details:     fmt.Sprintf("Raw output: %s", strings.TrimSpace(string(out))),
			Remediation: "Verify Go installation (expected output containing 'go1.X')",
		}
	}

	if major < 1 || (major == 1 && minor < 23) {
		return DoctorCheck{
			ID:          "runtime-go",
			Name:        "Go Toolchain (>= 1.23)",
			Category:    CategoryRuntime,
			Severity:    SeverityError,
			Message:     fmt.Sprintf("Go go%d.%d.%d is below required version >= 1.23", major, minor, patch),
			Details:     fmt.Sprintf("Detected Go version: go%d.%d.%d. Go 1.23 or higher is required.", major, minor, patch),
			Remediation: "Upgrade Go toolchain to version 1.23 or higher (https://go.dev/doc/install)",
		}
	}

	return DoctorCheck{
		ID:          "runtime-go",
		Name:        "Go Toolchain (>= 1.23)",
		Category:    CategoryRuntime,
		Severity:    SeverityOK,
		Message:     fmt.Sprintf("Go go%d.%d.%d toolchain is compliant", major, minor, patch),
		Details:     fmt.Sprintf("Compiler and toolchain meet requirement (>= 1.23.0)"),
		Remediation: "None (Toolchain is healthy)",
	}
}

var goVersionRegex = regexp.MustCompile(`go(\d+)\.(\d+)(?:\.(\d+))?`)

func parseGoVersion(raw string) (int, int, int, error) {
	matches := goVersionRegex.FindStringSubmatch(raw)
	if len(matches) < 3 {
		return 0, 0, 0, fmt.Errorf("could not find go version pattern in %q", raw)
	}

	major, err := strconv.Atoi(matches[1])
	if err != nil {
		return 0, 0, 0, err
	}

	minor, err := strconv.Atoi(matches[2])
	if err != nil {
		return 0, 0, 0, err
	}

	patch := 0
	if len(matches) > 3 && matches[3] != "" {
		patch, _ = strconv.Atoi(matches[3])
	}

	return major, minor, patch, nil
}

func checkGitCLI() DoctorCheck {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", "--version")
	out, err := cmd.Output()
	if err != nil {
		return DoctorCheck{
			ID:          "repo-git",
			Name:        "Git CLI Availability",
			Category:    CategoryRepo,
			Severity:    SeverityError,
			Message:     "Git CLI not found in PATH",
			Details:     fmt.Sprintf("Command 'git --version' failed: %v", err),
			Remediation: "Install Git (https://git-scm.com/downloads)",
		}
	}

	verStr := strings.TrimSpace(string(out))
	return DoctorCheck{
		ID:          "repo-git",
		Name:        "Git CLI Availability",
		Category:    CategoryRepo,
		Severity:    SeverityOK,
		Message:     verStr,
		Details:     "Git executable is available for version control and workspace operations",
		Remediation: "None",
	}
}

func checkGitWorkingTree(repoRoot string) DoctorCheck {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", "status", "--porcelain")
	if repoRoot != "" {
		cmd.Dir = repoRoot
	}
	out, err := cmd.Output()
	if err != nil {
		return DoctorCheck{
			ID:          "repo-clean",
			Name:        "Git Working Tree Status",
			Category:    CategoryRepo,
			Severity:    SeverityWarning,
			Message:     "Unable to inspect Git working tree",
			Details:     fmt.Sprintf("git status check returned: %v", err),
			Remediation: "Verify that the workspace is inside a valid Git repository",
		}
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	nonEmptyCount := 0
	for _, l := range lines {
		if strings.TrimSpace(l) != "" {
			nonEmptyCount++
		}
	}

	if nonEmptyCount > 0 {
		return DoctorCheck{
			ID:          "repo-clean",
			Name:        "Git Working Tree Status",
			Category:    CategoryRepo,
			Severity:    SeverityWarning,
			Message:     fmt.Sprintf("Working tree has %d uncommitted change(s)", nonEmptyCount),
			Details:     fmt.Sprintf("Detected %d modified, added, or untracked file(s) in working tree", nonEmptyCount),
			Remediation: "Commit or stash working tree modifications before release or publishing",
		}
	}

	return DoctorCheck{
		ID:          "repo-clean",
		Name:        "Git Working Tree Status",
		Category:    CategoryRepo,
		Severity:    SeverityOK,
		Message:     "Working tree is clean",
		Details:     "No unstaged, staged, or untracked modifications detected in repository",
		Remediation: "None",
	}
}

func checkConfigFiles(repoRoot string) DoctorCheck {
	root := repoRoot
	if root == "" {
		root = "."
	}

	var found []string
	var missing []string

	// 1. models.yaml
	modelsPath := filepath.Join(root, "models.yaml")
	if _, err := os.Stat(modelsPath); err == nil {
		found = append(found, "models.yaml")
	} else {
		missing = append(missing, "models.yaml")
	}

	// 2. openspec/config.yaml
	openspecPath := filepath.Join(root, "openspec", "config.yaml")
	if _, err := os.Stat(openspecPath); err == nil {
		found = append(found, "openspec/config.yaml")
	} else {
		missing = append(missing, "openspec/config.yaml")
	}

	// 3. hooks/hooks.json or .hooks.json
	hooksPath1 := filepath.Join(root, "hooks", "hooks.json")
	hooksPath2 := filepath.Join(root, ".hooks.json")
	if _, err := os.Stat(hooksPath1); err == nil {
		found = append(found, "hooks/hooks.json")
	} else if _, err := os.Stat(hooksPath2); err == nil {
		found = append(found, ".hooks.json")
	} else {
		missing = append(missing, "hooks/hooks.json")
	}

	if len(missing) == 0 {
		return DoctorCheck{
			ID:          "config-files",
			Name:        "Project Configuration Files",
			Category:    CategoryConfig,
			Severity:    SeverityOK,
			Message:     fmt.Sprintf("All configuration files present (%d/%d)", len(found), len(found)),
			Details:     fmt.Sprintf("Found: %s", strings.Join(found, ", ")),
			Remediation: "None (Configuration files are complete)",
		}
	}

	// If key configs are missing
	severity := SeverityWarning
	if contains(missing, "models.yaml") && contains(missing, "openspec/config.yaml") {
		severity = SeverityError
	}

	return DoctorCheck{
		ID:          "config-files",
		Name:        "Project Configuration Files",
		Category:    CategoryConfig,
		Severity:    severity,
		Message:     fmt.Sprintf("Missing configuration file(s): %s", strings.Join(missing, ", ")),
		Details:     fmt.Sprintf("Present: %s | Missing: %s", strings.Join(found, ", "), strings.Join(missing, ", ")),
		Remediation: "Run 'ospec' or create missing configuration files according to project documentation",
	}
}

func checkAPIKeys() DoctorCheck {
	standardKeys := []string{
		"OPENAI_API_KEY",
		"ANTHROPIC_API_KEY",
		"GEMINI_API_KEY",
		"DEEPSEEK_API_KEY",
		"GITHUB_TOKEN",
	}

	var found []string
	for _, k := range standardKeys {
		if os.Getenv(k) != "" {
			found = append(found, k)
		}
	}

	if len(found) > 0 {
		return DoctorCheck{
			ID:          "auth-apikeys",
			Name:        "AI Provider API Keys (Advisory)",
			Category:    CategoryAuth,
			Severity:    SeverityOK,
			Message:     fmt.Sprintf("Detected %d active provider key(s)", len(found)),
			Details:     fmt.Sprintf("Configured variables: %s", strings.Join(found, ", ")),
			Remediation: "None (Provider credentials present in environment)",
		}
	}

	return DoctorCheck{
		ID:          "auth-apikeys",
		Name:        "AI Provider API Keys (Advisory)",
		Category:    CategoryAuth,
		Severity:    SeverityWarning,
		Message:     "No standard AI provider API keys detected in environment",
		Details:     "Checked: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, DEEPSEEK_API_KEY, GITHUB_TOKEN (Advisory notice - offline/local modes still work)",
		Remediation: "Export API keys for your preferred targets (e.g. export ANTHROPIC_API_KEY=... or export GEMINI_API_KEY=...)",
	}
}

func contains(slice []string, val string) bool {
	for _, item := range slice {
		if item == val {
			return true
		}
	}
	return false
}
