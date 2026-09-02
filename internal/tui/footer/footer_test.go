package footer_test

import (
	"strings"
	"testing"

	"github.com/snakeblack/ospec-workflow/internal/tui/footer"
)

func TestRenderContextualFooter(t *testing.T) {
	tests := []struct {
		name     string
		tab      int
		width    int
		mustHave []string
	}{
		{
			name:     "Inicio tab normal width",
			tab:      0,
			width:    100,
			mustHave: []string{"1-4/Enter/clic", "Acciones", "?", "Ayuda", "q", "Salir"},
		},
		{
			name:     "Installer tab normal width",
			tab:      1,
			width:    100,
			mustHave: []string{"↑/↓", "Elegir", "Enter", "Continuar", "Esc", "Atrás"},
		},
		{
			name:     "Models tab normal width",
			tab:      2,
			width:    100,
			mustHave: []string{"Presets", "Agentes", "Clientes", "Enter", "Configurar"},
		},
		{
			name:     "Unknown tab fallback",
			tab:      99,
			width:    100,
			mustHave: []string{"Esc", "Inicio", "?", "Ayuda", "q", "Salir"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out := footer.RenderContextualFooter(tt.tab, tt.width)
			if out == "" {
				t.Fatalf("RenderContextualFooter returned empty string for tab %d, width %d", tt.tab, tt.width)
			}
			for _, expected := range tt.mustHave {
				if !strings.Contains(out, expected) {
					t.Errorf("RenderContextualFooter(tab=%d, width=%d) expected to contain %q, but got:\n%s", tt.tab, tt.width, expected, out)
				}
			}
		})
	}
}

func TestRenderHelpModal(t *testing.T) {
	out := footer.RenderHelpModal(100, 30)
	if out == "" {
		t.Fatal("RenderHelpModal returned empty string")
	}

	expectedSections := []string{
		"Ayuda",
		"Navegación",
		"Inicio",
		"Instalar",
		"Modelos",
		"Esc",
	}

	for _, exp := range expectedSections {
		if !strings.Contains(out, exp) {
			t.Errorf("RenderHelpModal expected to contain %q, but got:\n%s", exp, out)
		}
	}
}

func TestRenderHelpModalSmallViewport(t *testing.T) {
	out := footer.RenderHelpModal(40, 10)
	if out == "" {
		t.Fatal("RenderHelpModal with small dimensions returned empty string")
	}
	if !strings.Contains(out, "Ayuda") {
		t.Errorf("expected 'Ayuda' in output, got:\n%s", out)
	}
}
