# ospec-workflow quickstart

`ospec-workflow` es un arnés de Spec-Driven Development (SDD) llave en mano. Usa
**OpenSpec** como única fuente de verdad versionable y un orquestador que
coordina agentes de fase (`propose → spec → design → tasks → apply → verify →
archive`), aplicando Strict TDD, control de tamaño de revisión y gates de
seguridad activos en cada commit. El mismo árbol fuente se distribuye a cuatro
targets de chat/IDE (`claude`, `vscode`, `github-copilot`, `opencode`) mediante
un generador puro.

## Qué hace este repositorio

- Define un **orquestador** (`agents/sdd-orchestrator.agent.md`) que clasifica
  cada cambio, elige una ruta declarativa en `openspec/config.yaml` y delega en
  sub-agentes de fase (`sdd-propose`, `sdd-spec`, `sdd-design`, `sdd-tasks`,
  `sdd-apply`, `sdd-verify`, `sdd-archive`, y fases especiales como
  `sdd-baseline`, `sdd-workspace`, `sdd-foundation`, `sdd-document`).
- Persiste todo el estado del cambio (propuesta, specs, diseño, tareas,
  progreso, verificación) como archivos en `openspec/changes/{change}/`, nunca
  en el historial de chat.
- Ejecuta cinco **hooks de ciclo de vida** (`SessionStart`, `PreToolUse`,
  `PreCompact`, `SubagentStop`, `Stop`) implementados dos veces — Node.js
  (`scripts/hooks/`) y Go (`internal/hooks/`, `cmd/ospec-hooks/`) — con
  paridad de comportamiento verificada por tests compartidos.
- Aplica salvaguardas activas: **AgentShield** (secretos/credenciales),
  **Token Budget Advisor** (presupuesto de contexto), **git-collaboration-guard**
  (confirmaciones antes de commits riesgosos) y un hook `pre-commit` que valida
  el estado de OpenSpec y Strict TDD.
- Compila el árbol canónico (formato VS Code) a cuatro distribuciones nativas
  en `dist/<target>/` mediante `scripts/configure/cli.js`, con validadores por
  target y fixtures golden.
- Soporta workspaces multi-repo federados (`sdd-workspace`) con un atlas de
  miembros, baseline federado resumible y marcadores de metadatos por repo.

## Empieza aquí

- [Arquitectura y generador multi-target](architecture/overview.md) — cómo se construye `dist/<target>/` desde el árbol fuente único.
- [Orquestación de fases SDD](orchestration/routing.md) — routing declarativo, agentes, skills y gates.
- [Runtime de hooks de ciclo de vida](hooks-runtime/lifecycle.md) — los cinco eventos, implementación dual Node/Go, launcher.
- [Guardrails de seguridad](security/guardrails.md) — AgentShield, Token Budget Advisor, git-collaboration-guard, pre-commit/commit-msg.
- [Persistencia y estado](state-management/persistence.md) — OpenSpec como fuente de verdad, artifact-store, memoria operativa.
- [Testing y calidad](testing-quality/verification.md) — Strict TDD, `sdd-verify`, quality gates declarativos.
- [Federación de workspaces multi-repo](workspace-federation/multi-repo.md) — atlas, baseline federado, markers.

## Archivos fuente clave

| Archivo | Rol |
| --- | --- |
| `/openspec/config.yaml` | Tabla de routing, reglas por fase, políticas opcionales (quality gates, hooks declarativos, traceability). |
| `/scripts/configure/cli.js` | CLI del generador multi-target; capa de IO sobre `target-transform.js`. |
| `/scripts/lib/target-transform.js` | Transformación pura árbol-fuente → árbol-target. |
| `/scripts/lib/route-dispatcher.js` | Resuelve qué ruta/fases ejecutar dado un cambio clasificado. |
| `/hooks/hooks.json` | Registro de los cinco eventos de ciclo de vida del plugin. |
| `/scripts/hooks/ospec-hooks-launch.js` | Launcher que prefiere el binario Go y cae a Node.js cuando corresponde. |
| `/scripts/lib/artifact-store.js` | Abstracción de persistencia de artefactos (`openspec` / federado). |
| `/scripts/check.js` | Comando único de verificación local/CI (`npm test`). |
| `/agents/sdd-orchestrator.agent.md` | Definición del orquestador. |
| `/skills/_shared/sdd-phase-common.md` | Protocolo compartido por todos los agentes de fase (envelope, memoria, gates). |

## Mapa de documentación

- [quickstart.md](quickstart.md) (este archivo)
- [architecture/overview.md](architecture/overview.md)
- [orchestration/routing.md](orchestration/routing.md)
- [hooks-runtime/lifecycle.md](hooks-runtime/lifecycle.md)
- [security/guardrails.md](security/guardrails.md)
- [state-management/persistence.md](state-management/persistence.md)
- [testing-quality/verification.md](testing-quality/verification.md)
- [workspace-federation/multi-repo.md](workspace-federation/multi-repo.md)

## Notas para futuros agentes

- **OpenSpec es la fuente de verdad**, no el historial de chat. Antes de
  continuar cualquier cambio, lee `openspec/changes/{change-name}/state.yaml`
  y los artefactos de fase — nunca asumas contexto de la conversación.
- El árbol **canónico** vive en formato VS Code en la raíz del repo. `dist/`
  es generado y no se edita a mano; los cambios de comportamiento van en
  `agents/`, `skills/`, `commands/`, `rules/`, `hooks/`, `scripts/lib/`,
  `scripts/configure/` o `scripts/hooks/`.
- Los hooks tienen **dos implementaciones** (Node.js y Go) que deben mantener
  paridad de comportamiento; un cambio de contrato en uno normalmente exige el
  espejo en el otro (ver `scripts/hooks/parity-contract.test.js`).
- No documentes ni expongas secretos, `.env` reales, ni credenciales — ni en
  código ni en wiki. AgentShield y este generador respetan ese límite.
- Este wiki fue generado por el agente `sdd-document` bajo la Opción D
  (OpenWiki + Starlight): el contenido canónico vive en `openwiki/`, y
  `web-doc/` es un sitio estático Starlight que se sincroniza desde
  `openwiki/` en tiempo de build (`scripts/sync-openwiki.mjs`), nunca al
  revés. No escribas directamente en `web-doc/src/content/docs/`.

## Mapa de fuentes

- `/README.md`, `/package.json`, `/openspec/config.yaml`
- `/scripts/configure/cli.js`, `/scripts/lib/target-transform.js`, `/models.yaml`
- `/scripts/lib/route-dispatcher.js`, `/agents/`, `/skills/`, `/commands/`, `/rules/`
- `/hooks/hooks.json`, `/scripts/hooks/`, `/internal/hooks/`, `/cmd/ospec-hooks/`
- `/scripts/lib/artifact-store.js`, `/scripts/lib/ospec-state.js`, `/openspec/memory/`
- `/scripts/check.js`, `/openspec/specs/quality-gates/spec.md`
- `/openspec/specs/workspace-explore/spec.md`, `/openspec/specs/federated-baseline-orchestration/spec.md`

Evidencia git: HEAD `797ba4d` (v2.20.0).
