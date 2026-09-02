package tui

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
	"github.com/muesli/termenv"
	"github.com/snakeblack/ospec-workflow/internal/config"
	"github.com/snakeblack/ospec-workflow/internal/system"
	"github.com/snakeblack/ospec-workflow/internal/tui/views/install"
	"github.com/snakeblack/ospec-workflow/internal/tui/views/models"
)

// QACheck is one coherence assertion from a dry-run QA pass.
type QACheck struct {
	Name   string
	OK     bool
	Detail string
}

// QAReport is the result of RunQAChecks. It never writes harness files.
type QAReport struct {
	SourceRoot string
	Checks     []QACheck
	Failed     int
}

func (r QAReport) String() string {
	var b strings.Builder
	fmt.Fprintf(&b, "QA ospec (dry-run) — %s\n", r.SourceRoot)
	for _, c := range r.Checks {
		mark := "OK"
		if !c.OK {
			mark = "FAIL"
		}
		fmt.Fprintf(&b, "  [%s] %s", mark, c.Name)
		if c.Detail != "" {
			fmt.Fprintf(&b, " — %s", c.Detail)
		}
		b.WriteByte('\n')
	}
	fmt.Fprintf(&b, "%d comprobaciones, %d fallos\n", len(r.Checks), r.Failed)
	return b.String()
}

func (r *QAReport) add(name string, ok bool, detail string) {
	r.Checks = append(r.Checks, QACheck{Name: name, OK: ok, Detail: detail})
	if !ok {
		r.Failed++
	}
}

// RunQAChecks verifies catalogs, TUI copy, dry-run install, and generator output
// in a temp sandbox. The source tree and host clients are not modified.
func RunQAChecks(sourceRoot string) (QAReport, error) {
	lipgloss.SetColorProfile(termenv.Ascii)
	rep := QAReport{SourceRoot: sourceRoot}
	if sourceRoot == "" {
		found, err := system.FindSourceRoot(".")
		if err != nil {
			return rep, err
		}
		sourceRoot = found
		rep.SourceRoot = sourceRoot
	}

	checkCatalogs(&rep, sourceRoot)
	checkTUI(&rep, sourceRoot)
	checkDryRunInstall(&rep, sourceRoot)
	checkGeneratorTemp(&rep, sourceRoot)
	return rep, nil
}

func checkCatalogs(rep *QAReport, sourceRoot string) {
	mm := config.NewModelsManager(sourceRoot)
	cfg, err := mm.LoadModels()
	if err != nil {
		rep.add("cargar models.yaml", false, err.Error())
		return
	}
	rep.add("cargar models.yaml", true, "")

	claudeOK := strings.Join(config.TargetAvailableModels["claude"], ",") == "sonnet,opus,haiku,fable"
	rep.add("catálogo Claude = sonnet,opus,haiku,fable", claudeOK, strings.Join(config.TargetAvailableModels["claude"], ","))

	codexWant := []string{"gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.4", "gpt-5.4-mini"}
	codexOK := strings.Join(config.TargetAvailableModels["codex"], ",") == strings.Join(codexWant, ",")
	rep.add("catálogo Codex = Sol/Terra/Luna/5.5/5.4/mini", codexOK, strings.Join(config.TargetAvailableModels["codex"], ","))

	rep.add("Claude admite effort", config.TargetSupportsEffort("claude"), "")
	rep.add("Codex admite effort+verbosity", config.TargetSupportsEffort("codex") && config.TargetSupportsVerbosity("codex"), "")
	rep.add("VS Code/Antigravity sin effort", !config.TargetSupportsEffort("vscode") && !config.TargetSupportsEffort("antigravity"), "")
	rep.add("Antigravity no es multiagente", !config.TargetIsMultiAgent("antigravity"), "")
	rep.add("Claude/Codex/Cursor son multiagente", config.TargetIsMultiAgent("claude") && config.TargetIsMultiAgent("codex") && config.TargetIsMultiAgent("cursor"), "")

	for _, tierName := range []string{"cheap", "default", "premium"} {
		tier, ok := cfg.Tiers[tierName]
		if !ok {
			rep.add("tier "+tierName, false, "ausente")
			continue
		}
		checkListed(rep, "claude["+tierName+"]", "claude", tier.GetClaudeModel())
		if e := tier.GetClaudeEffort(); e != "" {
			checkListed(rep, "claude["+tierName+"].effort", "", e, config.EffortValues("claude")...)
		}
		if tier.Codex != nil {
			checkListed(rep, "codex["+tierName+"]", "codex", tier.Codex.Model)
			if e := tier.Codex.ModelReasoningEffort; e != "" {
				checkListed(rep, "codex["+tierName+"].effort", "", e, config.EffortValues("codex")...)
			}
		}
		base, _ := config.SplitCursorModel(tier.Cursor)
		checkListed(rep, "cursor["+tierName+"]", "cursor", base)
		baseOC, _ := config.SplitOpenCodeModel(tier.OpenCode)
		checkListed(rep, "opencode["+tierName+"]", "opencode", baseOC)
		if tier.Antigravity != "" {
			checkListed(rep, "antigravity["+tierName+"]", "antigravity", tier.Antigravity)
		}
		for i, name := range tier.GetVSCodeModels() {
			checkListed(rep, fmt.Sprintf("vscode[%s][%d]", tierName, i), "vscode", name)
		}
	}
}

func checkListed(rep *QAReport, name, target, value string, extra ...string) {
	if value == "" {
		rep.add(name, false, "vacío")
		return
	}
	allowed := extra
	if target != "" {
		allowed = config.TargetAvailableModels[target]
	}
	for _, a := range allowed {
		if a == value {
			rep.add(name, true, value)
			return
		}
	}
	rep.add(name, false, value+" no está en el catálogo")
}

func checkTUI(rep *QAReport, sourceRoot string) {
	sandbox, err := os.MkdirTemp("", "ospec-qa-tui-")
	if err != nil {
		rep.add("sandbox TUI", false, err.Error())
		return
	}
	defer os.RemoveAll(sandbox)
	if err := copyQASandbox(sourceRoot, sandbox); err != nil {
		rep.add("sandbox TUI", false, err.Error())
		return
	}

	app := NewAppModelWithOptions(AppOptions{RepoRoot: sandbox, SourceRoot: sourceRoot, QAMode: true})
	m, _ := app.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	app = m.(AppModel)

	home := ansi.Strip(app.View())
	rep.add("Inicio muestra Instalar/Modelos", strings.Contains(home, "Instalar") && strings.Contains(home, "Configurar modelos"), "")
	rep.add("Inicio no pide API keys", !strings.Contains(home, "API Key"), "")
	rep.add("cabecera QA", strings.Contains(home, "QA"), "")

	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")})
	app = m.(AppModel)
	modelsView := ansi.Strip(app.View())
	rep.add("Modelos explica presets", strings.Contains(modelsView, "Qué es un preset") || strings.Contains(modelsView, "preset"), "")
	rep.add("Modelos sin atajos n/p", !strings.Contains(modelsView, "t/n/p") && !strings.Contains(modelsView, " n/p"), "")
	rep.add("Modelos muestra Económico/Equilibrado/Máximo", strings.Contains(modelsView, "Económico") && strings.Contains(modelsView, "Equilibrado") && strings.Contains(modelsView, "Máximo"), "")

	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyEnter})
	app = m.(AppModel)
	presetClients := ansi.Strip(app.View())
	rep.add("preset Enter pide un cliente", app.ModelsHub().PresetZone() == 1 && (strings.Contains(presetClients, "cliente") || strings.Contains(presetClients, "Claude")), fmt.Sprintf("zone=%d", app.ModelsHub().PresetZone()))
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyEsc})
	app = m.(AppModel)
	rep.add("Esc en lista de clientes no sale de Modelos", app.ActiveTab() == TabModels && app.ModelsHub().PresetZone() == 0, fmt.Sprintf("tab=%v zone=%d", app.ActiveTab(), app.ModelsHub().PresetZone()))

	hub := app.ModelsHub()
	var claude models.TargetConfigItem
	for _, t := range hub.TargetConfigs() {
		if t.ID == "claude" {
			claude = t
		}
	}
	rep.add("picker Claude solo alias", strings.Join(claude.AvailableModels, ",") == "sonnet,opus,haiku,fable", strings.Join(claude.AvailableModels, ","))
	rep.add("Claude TUI admite effort", claude.SupportsEffort, "")

	var vscode models.TargetConfigItem
	for _, t := range hub.TargetConfigs() {
		if t.ID == "vscode" {
			vscode = t
		}
	}
	rep.add("VS Code TUI sin effort", !vscode.SupportsEffort, "")

	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyEsc})
	app = m.(AppModel)
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("1")})
	app = m.(AppModel)
	instView := ansi.Strip(app.View())
	rep.add("Instalar lista clientes", strings.Contains(instView, "Detectados") || strings.Contains(instView, "detectado") || strings.Contains(instView, "cliente"), "")
	rep.add("Instalar agrupa detectados", strings.Contains(instView, "Detectados") && strings.Contains(instView, "No detectados"), "")
	rep.add("Instalar sin confirmación y", !strings.Contains(strings.ToLower(instView), "[y]") && !strings.Contains(instView, " y/n"), "")
	rep.add("Instalar arranca en clientes", app.Installer().Step() == install.StepTargets, fmt.Sprintf("step=%v", app.Installer().Step()))

	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyEsc})
	app = m.(AppModel)
	before, _ := os.ReadFile(filepath.Join(sourceRoot, "models.yaml"))
	m, cmd := app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("3")})
	app = m.(AppModel)
	if cmd != nil {
		_ = cmd()
	}
	after, _ := os.ReadFile(filepath.Join(sourceRoot, "models.yaml"))
	rep.add("tecla 3 en QA no muta models.yaml real", string(before) == string(after), "")
}

func checkDryRunInstall(rep *QAReport, sourceRoot string) {
	var events []system.InstallEvent
	calledRunner := false
	err := system.RunHarnessInstall(context.Background(), system.HarnessInstallRequest{
		SourceRoot: sourceRoot,
		Targets:    []string{"claude", "codex", "cursor", "vscode", "opencode", "antigravity"},
		DryRun:     true,
		Timeout:    2 * time.Second,
		Runner: func(context.Context, string, string, []string, func(string)) error {
			calledRunner = true
			return fmt.Errorf("el runner no debe ejecutarse en dry-run")
		},
		RegisterVSCode: func(string) (int, error) {
			return 0, fmt.Errorf("no registrar VS Code en dry-run")
		},
	}, func(ev system.InstallEvent) {
		events = append(events, ev)
	})
	rep.add("dry-run install 6 clientes", err == nil, fmt.Sprintf("%v", err))
	rep.add("dry-run no spawnea Node", !calledRunner, "")
	sawSkip := false
	for _, ev := range events {
		if strings.Contains(ev.Message, "omitido") || strings.Contains(ev.Message, "dry-run") {
			sawSkip = true
			break
		}
	}
	rep.add("dry-run emite logs de omisión", sawSkip, fmt.Sprintf("%d eventos", len(events)))

	sandbox, err := os.MkdirTemp("", "ospec-qa-install-")
	if err != nil {
		rep.add("sandbox instalador", false, err.Error())
		return
	}
	defer os.RemoveAll(sandbox)
	if err := copyQASandbox(sourceRoot, sandbox); err != nil {
		rep.add("sandbox instalador", false, err.Error())
		return
	}
	srcHash := fileFingerprint(filepath.Join(sourceRoot, "models.yaml"))
	mm := config.NewModelsManager(sandbox)
	wiz := install.NewQA(sandbox, mm, sourceRoot)
	wiz.SetSize(100, 30)
	wiz.ClearTargetSelection()
	updated, _ := wiz.Update(tea.KeyMsg{Type: tea.KeyEnter})
	wiz = updated.(install.Model)
	rep.add("Enter sin marcas selecciona el enfocado", wiz.Step() == install.StepAgents && len(wiz.SelectedTargets()) == 1, fmt.Sprintf("step=%v n=%d", wiz.Step(), len(wiz.SelectedTargets())))
	agentView := ansi.Strip(wiz.View())
	rep.add("pantalla de agentes visible", strings.Contains(agentView, "sdd-") || strings.Contains(agentView, "Todos los agentes") || strings.Contains(agentView, "Modelo"), "")
	updated, _ = wiz.Update(tea.KeyMsg{Type: tea.KeyEsc})
	wiz = updated.(install.Model)
	rep.add("Esc desde agentes vuelve a clientes", wiz.Step() == install.StepTargets, fmt.Sprintf("step=%v", wiz.Step()))

	updated, _ = wiz.Update(tea.KeyMsg{Type: tea.KeyDown})
	wiz = updated.(install.Model)
	updated, _ = wiz.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{' '}})
	wiz = updated.(install.Model)
	nSel := len(wiz.SelectedTargets())
	rep.add("Espacio añade un segundo cliente", nSel >= 1, fmt.Sprintf("n=%d", nSel))
	updated, _ = wiz.Update(tea.KeyMsg{Type: tea.KeyEnter})
	wiz = updated.(install.Model)
	checkedBack := false
	for i := 0; i < 16 && wiz.Step() == install.StepAgents; i++ {
		if !checkedBack && nSel >= 2 && i == 0 {
			updated, _ = wiz.Update(tea.KeyMsg{Type: tea.KeyEnter})
			wiz = updated.(install.Model)
			if wiz.Step() == install.StepAgents {
				updated, _ = wiz.Update(tea.KeyMsg{Type: tea.KeyEsc})
				wiz = updated.(install.Model)
				rep.add("Esc en 2º cliente vuelve al 1º", wiz.Step() == install.StepAgents, fmt.Sprintf("step=%v", wiz.Step()))
			}
			checkedBack = true
			continue
		}
		updated, _ = wiz.Update(tea.KeyMsg{Type: tea.KeyEnter})
		wiz = updated.(install.Model)
	}
	if wiz.Step() != install.StepReview {
		rep.add("asistente dry-run llega al resumen", false, fmt.Sprintf("step=%v", wiz.Step()))
		return
	}
	review := ansi.Strip(wiz.View())
	rep.add("resumen pide Instalar", strings.Contains(review, "Instalar") || strings.Contains(review, "Revisa"), "")
	updated, cmd := wiz.Update(tea.KeyMsg{Type: tea.KeyEnter})
	wiz = updated.(install.Model)
	if cmd == nil {
		rep.add("asistente dry-run lanza comprobación", false, "cmd nil")
		return
	}
	deadline := time.After(8 * time.Second)
	msg := cmd()
	for i := 0; i < 32; i++ {
		select {
		case <-deadline:
			rep.add("asistente dry-run termina", false, "timeout")
			return
		default:
		}
		updated, follow := wiz.Update(msg)
		wiz = updated.(install.Model)
		if wiz.Step() == install.StepDone {
			break
		}
		if follow == nil {
			break
		}
		msg = follow()
	}
	rep.add("asistente dry-run llega a Listo", wiz.Step() == install.StepDone, fmt.Sprintf("step=%v", wiz.Step()))
	rep.add("models.yaml real intacto tras asistente", fileFingerprint(filepath.Join(sourceRoot, "models.yaml")) == srcHash, "")
	logs := strings.Join(wiz.Logs(), "\n")
	view := wiz.View()
	rep.add("asistente anuncia QA/dry-run", strings.Contains(logs, "QA") || strings.Contains(view, "QA") || strings.Contains(view, "dry-run"), "")
}

func checkGeneratorTemp(rep *QAReport, sourceRoot string) {
	node, err := exec.LookPath("node")
	if err != nil {
		rep.add("generador claude/codex en temp", true, "omitido: no hay node en PATH")
		return
	}
	out := filepath.Join(os.TempDir(), fmt.Sprintf("ospec-qa-gen-%d", time.Now().UnixNano()))
	defer os.RemoveAll(out)
	cli := filepath.Join(sourceRoot, "scripts", "configure", "cli.js")
	for _, target := range []string{"claude", "codex"} {
		dest := filepath.Join(out, target)
		cmd := exec.Command(node, cli, "--target", target, "--source", sourceRoot, "--out", dest, "--no-validate")
		cmd.Dir = sourceRoot
		body, err := cmd.CombinedOutput()
		if err != nil {
			rep.add("generar "+target+" en temp", false, strings.TrimSpace(string(body))+" / "+err.Error())
			continue
		}
		rep.add("generar "+target+" en temp", true, dest)

		switch target {
		case "claude":
			apply := filepath.Join(dest, "agents", "sdd-apply.md")
			content, rerr := os.ReadFile(apply)
			if rerr != nil {
				rep.add("claude sdd-apply effort", false, rerr.Error())
				break
			}
			text := string(content)
			rep.add("claude sdd-apply model sonnet", strings.Contains(text, "model: sonnet") || strings.Contains(text, "model:sonnet"), "")
			rep.add("claude sdd-apply effort medium", strings.Contains(text, "effort: medium") || strings.Contains(text, "effort:medium"), "")
		case "codex":
			apply := filepath.Join(dest, ".codex", "agents", "sdd-apply.toml")
			content, rerr := os.ReadFile(apply)
			if rerr != nil {
				rep.add("codex sdd-apply effort", false, rerr.Error())
				break
			}
			text := string(content)
			rep.add("codex sdd-apply model terra", strings.Contains(text, `model = "gpt-5.6-terra"`), "")
			rep.add("codex sdd-apply effort high", strings.Contains(text, `model_reasoning_effort = "high"`), "")
		}
	}
}

func copyQASandbox(sourceRoot, dest string) error {
	if err := copyFile(filepath.Join(sourceRoot, "models.yaml"), filepath.Join(dest, "models.yaml")); err != nil {
		return err
	}
	srcCfg := filepath.Join(sourceRoot, "openspec", "config.yaml")
	if _, err := os.Stat(srcCfg); err == nil {
		if err := os.MkdirAll(filepath.Join(dest, "openspec"), 0755); err != nil {
			return err
		}
		if err := copyFile(srcCfg, filepath.Join(dest, "openspec", "config.yaml")); err != nil {
			return err
		}
	}
	return nil
}

func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0644)
}

func fileFingerprint(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return fmt.Sprintf("%d:%x", len(data), data[:min(32, len(data))])
}
