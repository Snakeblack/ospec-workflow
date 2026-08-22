package modelconfig_test

import (
	"path/filepath"
	"testing"

	"github.com/snakeblack/ospec-workflow/internal/modelconfig"
)

func TestResolveModelTier(t *testing.T) {
	// Root models.yaml in workspace
	root := filepath.Join("..", "..")

	cases := []struct {
		agent string
		want  string
	}{
		{"sdd-design", "premium"},
		{"sdd-apply", "default"},
	}

	for _, tc := range cases {
		t.Run(tc.agent, func(t *testing.T) {
			got := modelconfig.ResolveModelTier(tc.agent, root)
			if got != tc.want {
				t.Errorf("ResolveModelTier(%q) = %q, want %q", tc.agent, got, tc.want)
			}
		})
	}

	t.Run("configured _default", func(t *testing.T) {
		got := modelconfig.ResolveModelTier("sdd-nonexistent", root)
		if got != "premium" {
			t.Errorf("ResolveModelTier on configured _default = %q, want %q", got, "premium")
		}
	})

	t.Run("missing root", func(t *testing.T) {
		got := modelconfig.ResolveModelTier("sdd-design", "/invalid-path")
		if got != "unknown" {
			t.Errorf("ResolveModelTier on missing root = %q, want %q", got, "unknown")
		}
	})
}
