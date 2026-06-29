# Proposal: Preparar el harness para colaboración git multi-desarrollador

## Intent

El harness no orienta al usuario a crear una rama antes de tocar código ni protege contra trabajo riesgoso en la rama por defecto. Cuando varios desarrolladores comparten un proyecto, esto produce commits directos en `main`, ramas con higiene inconsistente y pisadas de trabajo. Queremos que el flujo (1) recomiende crear una rama antes de editar código y (2) ofrezca estrategias de colaboración ordenada, reforzadas por guardas en hooks que adviertan o bloqueen acciones riesgosas (editar/commitear en la rama por defecto o sobre un árbol sucio).

## Scope

### In Scope
- Recomendación "rama antes de código" en prompts del orquestador y de las fases propose/apply.
- Estrategias de colaboración multi-dev (higiene de ramas, evitar trabajo en la rama por defecto, convenciones de commit/PR, coordinación) consolidadas en la skill de colaboración.
- Guarda en `PreToolUse`: advertir/pedir confirmación al editar código o ejecutar `git commit` sobre la rama por defecto o un árbol sucio.
- Aviso en `SessionStart` cuando la sesión arranca en la rama por defecto.
- Bypass por variable de entorno (patrón `DISABLE_*`) y paridad Go + Node de los hooks.

### Out of Scope
- Imponer un modelo de branching concreto (GitHub Flow, GitFlow) u operaciones git automáticas (crear/cambiar ramas por el agente).
- Integración con APIs de plataformas (GitHub/GitLab) o bloqueo server-side de PRs.
- Rediseño del `pre-commit-hook` o de la validación de Conventional Commits ya existente.

## Capabilities

### New Capabilities
- `git-collaboration-guard`: guarda advisory-first en `PreToolUse`/`SessionStart` que detecta rama por defecto y árbol sucio, advierte o pide confirmación, con bypass por env var y paridad Go/Node.

### Modified Capabilities
- `hooks`: extiende los contratos de `PreToolUse` y `SessionStart` para invocar la guarda de colaboración.
- `skills`: amplía `branch-pr` con "rama antes de código" y estrategias de colaboración multi-dev.
- `agents`: el orquestador (y propose/apply) recomienda crear una rama antes de modificar código.

## Approach

Las recomendaciones viven en prompts de agents/ y skills/; se propagan a los cuatro targets (claude, vscode, github-copilot, opencode) por el pipeline de build existente. La guarda se implementa dentro de los hooks runtime ya activos: `PreToolUse` inspecciona escrituras de código y comandos `git commit`, consulta la rama actual y la rama por defecto vía git, y devuelve `ask` (no `deny` por defecto) si la acción es riesgosa; `SessionStart` añade un aviso. La lógica se mantiene en paridad entre `internal/hooks` (Go) y `scripts/hooks/*.js` (Node fallback).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/hooks/pre-tool-use.js` + `internal/hooks` | Modified | Guarda de rama/árbol sucio (paridad Go/Node) |
| `scripts/hooks/session-start.js` | Modified | Aviso de rama por defecto |
| `skills/branch-pr/SKILL.md` | Modified | Rama-antes-de-código + estrategias multi-dev |
| `agents/sdd-orchestrator.agent.md` | Modified | Recomendación de rama antes de código |
| `openspec/specs/{hooks,skills,agents}/spec.md` | Modified | Deltas de contrato |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Hooks bloquean trabajo legítimo | Med | Default `ask`, no `deny`; bypass por env var |
| Falsos positivos al detectar rama por defecto | Med | Detección robusta de `origin/HEAD`; fallar abierto si git no resuelve |
| Inconsistencia entre los cuatro targets | Med | Prompts compartidos vía build; tests de paridad |
| Divergencia Go vs Node | Med | Cambiar ambas implementaciones con cobertura de tests |
| Latencia por invocar git en cada `PreToolUse` | Low | Chequear solo en escrituras/commits; respetar timeout 5s |

## Rollback Plan

Revertir el commit del cambio restaura prompts y hooks previos. Como mitigación inmediata sin revert, exportar la env var de bypass desactiva la guarda; las recomendaciones en prompts son inertes y no rompen flujos.

## Dependencies

- git disponible en el entorno de ejecución del hook (degradación elegante si falta).

## Success Criteria

- [ ] El orquestador recomienda crear una rama antes de editar código.
- [ ] `SessionStart` avisa al iniciar en la rama por defecto.
- [ ] `PreToolUse` pide confirmación al editar código o commitear en la rama por defecto / árbol sucio.
- [ ] La guarda es desactivable por env var y mantiene paridad Go/Node con tests verdes.
- [ ] La skill documenta estrategias de colaboración multi-dev.
