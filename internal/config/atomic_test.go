package config

import (
	"os"
	"path/filepath"
	"sync"
	"testing"

	"gopkg.in/yaml.v3"
)

type sampleStruct struct {
	Name    string   `yaml:"name"`
	Version string   `yaml:"version"`
	Tags    []string `yaml:"tags"`
}

func TestAtomicWriteYAML_Success(t *testing.T) {
	tempDir := t.TempDir()
	targetPath := filepath.Join(tempDir, "test.yaml")

	data := sampleStruct{
		Name:    "ospec",
		Version: "2.57.0",
		Tags:    []string{"cli", "tui"},
	}

	err := AtomicWriteYAML(targetPath, data, 0644)
	if err != nil {
		t.Fatalf("unexpected error from AtomicWriteYAML: %v", err)
	}

	// Read file back and verify
	content, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("failed to read target file: %v", err)
	}

	var parsed sampleStruct
	if err := yaml.Unmarshal(content, &parsed); err != nil {
		t.Fatalf("failed to unmarshal generated YAML: %v", err)
	}

	if parsed.Name != data.Name || parsed.Version != data.Version || len(parsed.Tags) != 2 {
		t.Errorf("parsed data mismatch: got %+v, want %+v", parsed, data)
	}

	// Verify no stray .tmp files left in directory
	entries, err := os.ReadDir(tempDir)
	if err != nil {
		t.Fatalf("failed to read temp dir: %v", err)
	}
	if len(entries) != 1 || entries[0].Name() != "test.yaml" {
		t.Errorf("unexpected directory entries: %v", entries)
	}
}

func TestAtomicWriteYAML_Overwrite(t *testing.T) {
	tempDir := t.TempDir()
	targetPath := filepath.Join(tempDir, "overwrite.yaml")

	// Write initial
	if err := AtomicWriteYAML(targetPath, sampleStruct{Name: "v1"}, 0644); err != nil {
		t.Fatalf("initial write failed: %v", err)
	}

	// Overwrite
	if err := AtomicWriteYAML(targetPath, sampleStruct{Name: "v2"}, 0644); err != nil {
		t.Fatalf("overwrite failed: %v", err)
	}

	content, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("failed to read file: %v", err)
	}

	var parsed sampleStruct
	if err := yaml.Unmarshal(content, &parsed); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if parsed.Name != "v2" {
		t.Errorf("expected Name to be 'v2', got %s", parsed.Name)
	}
}

func TestAtomicWriteYAML_InvalidDir(t *testing.T) {
	targetPath := filepath.Join("/non-existent-dir-12345/subdir", "test.yaml")
	err := AtomicWriteYAML(targetPath, sampleStruct{Name: "fail"}, 0644)
	if err == nil {
		t.Fatal("expected error for non-existent directory, got nil")
	}
}

func TestAtomicWriteYAML_ConcurrentWrites(t *testing.T) {
	tempDir := t.TempDir()
	targetPath := filepath.Join(tempDir, "concurrent.yaml")

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			_ = AtomicWriteYAML(targetPath, sampleStruct{
				Name:    "ospec",
				Version: "test",
			}, 0644)
		}(i)
	}
	wg.Wait()

	// Verify file is still valid YAML
	content, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("failed to read target file: %v", err)
	}

	var parsed sampleStruct
	if err := yaml.Unmarshal(content, &parsed); err != nil {
		t.Fatalf("corrupted YAML after concurrent writes: %v", err)
	}
}
