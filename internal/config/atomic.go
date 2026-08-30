package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// AtomicWriteYAML encodes data as YAML and writes it to filePath atomically using a temporary file.
func AtomicWriteYAML(filePath string, data any, perm os.FileMode) error {
	dir := filepath.Dir(filePath)
	base := filepath.Base(filePath)

	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create parent directories: %w", err)
	}

	tempFile, err := os.CreateTemp(dir, fmt.Sprintf(".%s.*.tmp", base))
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	tempPath := tempFile.Name()
	defer os.Remove(tempPath) // Clean up if rename fails or error occurs

	encoder := yaml.NewEncoder(tempFile)
	encoder.SetIndent(2)
	if err := encoder.Encode(data); err != nil {
		tempFile.Close()
		return fmt.Errorf("failed to encode YAML: %w", err)
	}
	if err := encoder.Close(); err != nil {
		tempFile.Close()
		return fmt.Errorf("failed to close YAML encoder: %w", err)
	}

	if err := tempFile.Sync(); err != nil {
		tempFile.Close()
		return fmt.Errorf("failed to sync temp file: %w", err)
	}

	if err := tempFile.Close(); err != nil {
		return fmt.Errorf("failed to close temp file: %w", err)
	}

	if err := os.Chmod(tempPath, perm); err != nil {
		return fmt.Errorf("failed to set permissions: %w", err)
	}

	if err := os.Rename(tempPath, filePath); err != nil {
		return fmt.Errorf("failed to atomic rename: %w", err)
	}

	return nil
}
