package system

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseNodeVersion(t *testing.T) {
	tests := []struct {
		input       string
		wantMajor   int
		wantMinor   int
		wantPatch   int
		expectError bool
	}{
		{"v22.14.0\n", 22, 14, 0, false},
		{"v20.10.2", 20, 10, 2, false},
		{"v23.0.0-rc.1", 23, 0, 0, false},
		{"invalid", 0, 0, 0, true},
		{"", 0, 0, 0, true},
	}

	for _, tt := range tests {
		major, minor, patch, err := parseNodeVersion(tt.input)
		if tt.expectError {
			if err == nil {
				t.Errorf("parseNodeVersion(%q) expected error, got nil", tt.input)
			}
		} else {
			if err != nil {
				t.Errorf("parseNodeVersion(%q) unexpected error: %v", tt.input, err)
			}
			if major != tt.wantMajor || minor != tt.wantMinor || patch != tt.wantPatch {
				t.Errorf("parseNodeVersion(%q) = (%d, %d, %d), want (%d, %d, %d)",
					tt.input, major, minor, patch, tt.wantMajor, tt.wantMinor, tt.wantPatch)
			}
		}
	}
}

func TestParseGoVersion(t *testing.T) {
	tests := []struct {
		input       string
		wantMajor   int
		wantMinor   int
		wantPatch   int
		expectError bool
	}{
		{"go version go1.23.6 linux/amd64\n", 1, 23, 6, false},
		{"go version go1.24.0 darwin/arm64", 1, 24, 0, false},
		{"go version go1.22.1 windows/amd64", 1, 22, 1, false},
		{"go version go2.0.0 linux/amd64", 2, 0, 0, false},
		{"invalid version output", 0, 0, 0, true},
		{"", 0, 0, 0, true},
	}

	for _, tt := range tests {
		major, minor, patch, err := parseGoVersion(tt.input)
		if tt.expectError {
			if err == nil {
				t.Errorf("parseGoVersion(%q) expected error, got nil", tt.input)
			}
		} else {
			if err != nil {
				t.Errorf("parseGoVersion(%q) unexpected error: %v", tt.input, err)
			}
			if major != tt.wantMajor || minor != tt.wantMinor || patch != tt.wantPatch {
				t.Errorf("parseGoVersion(%q) = (%d, %d, %d), want (%d, %d, %d)",
					tt.input, major, minor, patch, tt.wantMajor, tt.wantMinor, tt.wantPatch)
			}
		}
	}
}

func TestDoctorReportStatus(t *testing.T) {
	tests := []struct {
		name       string
		report     DoctorReport
		wantStatus string
	}{
		{
			name: "Healthy report with zero errors and zero warnings",
			report: DoctorReport{
				TotalPassed:   5,
				TotalWarnings: 0,
				TotalErrors:   0,
			},
			wantStatus: "Healthy",
		},
		{
			name: "Degraded report with warnings but zero errors",
			report: DoctorReport{
				TotalPassed:   4,
				TotalWarnings: 2,
				TotalErrors:   0,
			},
			wantStatus: "Degraded",
		},
		{
			name: "Critical report with errors",
			report: DoctorReport{
				TotalPassed:   3,
				TotalWarnings: 1,
				TotalErrors:   2,
			},
			wantStatus: "Critical",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.report.Status(); got != tt.wantStatus {
				t.Errorf("DoctorReport.Status() = %q, want %q", got, tt.wantStatus)
			}
		})
	}
}

func TestCheckConfigFiles(t *testing.T) {
	tempDir := t.TempDir()

	// Initially empty -> should flag missing files
	checkEmpty := checkConfigFiles(tempDir)
	if checkEmpty.Severity != SeverityError {
		t.Errorf("checkConfigFiles(empty) severity = %v, want %v", checkEmpty.Severity, SeverityError)
	}

	// Create required files
	if err := os.WriteFile(filepath.Join(tempDir, "models.yaml"), []byte("preset: default"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(tempDir, "openspec"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tempDir, "openspec", "config.yaml"), []byte("project:\n  name: test"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(tempDir, "hooks"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tempDir, "hooks", "hooks.json"), []byte("[]"), 0644); err != nil {
		t.Fatal(err)
	}

	checkFull := checkConfigFiles(tempDir)
	if checkFull.Severity != SeverityOK {
		t.Errorf("checkConfigFiles(full) severity = %v, want %v", checkFull.Severity, SeverityOK)
	}
}

func TestCheckAPIKeys(t *testing.T) {
	// Backup env vars
	keys := []string{"OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "DEEPSEEK_API_KEY", "GITHUB_TOKEN"}
	saved := make(map[string]string)
	for _, k := range keys {
		saved[k] = os.Getenv(k)
		os.Unsetenv(k)
	}
	defer func() {
		for k, v := range saved {
			if v != "" {
				os.Setenv(k, v)
			} else {
				os.Unsetenv(k)
			}
		}
	}()

	// No keys set -> should be warning (advisory)
	checkNone := checkAPIKeys()
	if checkNone.Severity != SeverityWarning {
		t.Errorf("checkAPIKeys(none) severity = %v, want %v", checkNone.Severity, SeverityWarning)
	}

	// Set one key
	os.Setenv("ANTHROPIC_API_KEY", "sk-test-key")
	checkOne := checkAPIKeys()
	if checkOne.Severity != SeverityOK {
		t.Errorf("checkAPIKeys(with key) severity = %v, want %v", checkOne.Severity, SeverityOK)
	}
}

func TestRunDiagnostics(t *testing.T) {
	tempDir := t.TempDir()

	// Populate minimal files to avoid config error
	_ = os.WriteFile(filepath.Join(tempDir, "models.yaml"), []byte("preset: default"), 0644)
	_ = os.MkdirAll(filepath.Join(tempDir, "openspec"), 0755)
	_ = os.WriteFile(filepath.Join(tempDir, "openspec", "config.yaml"), []byte("project:\n  name: test"), 0644)
	_ = os.MkdirAll(filepath.Join(tempDir, "hooks"), 0755)
	_ = os.WriteFile(filepath.Join(tempDir, "hooks", "hooks.json"), []byte("[]"), 0644)

	report := RunDiagnostics(tempDir)

	if len(report.Checks) == 0 {
		t.Fatalf("RunDiagnostics returned 0 checks")
	}
	if report.RepoRoot != tempDir {
		t.Errorf("report.RepoRoot = %q, want %q", report.RepoRoot, tempDir)
	}
	if report.Timestamp.IsZero() {
		t.Errorf("report.Timestamp is zero")
	}

	// Sum of passed, warnings, errors should match total checks
	total := report.TotalPassed + report.TotalWarnings + report.TotalErrors
	if total != len(report.Checks) {
		t.Errorf("Sum of counts (%d) != len(report.Checks) (%d)", total, len(report.Checks))
	}

	// Status must not be empty
	status := report.Status()
	if status != "Healthy" && status != "Degraded" && status != "Critical" {
		t.Errorf("Unexpected report status: %q", status)
	}
}
