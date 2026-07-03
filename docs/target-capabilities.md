# Matriz de capacidades y paridad por target (D1/D2)

Los cuatro targets generados NO son equivalentes: cada host expone tools y
lifecycle hooks distintos. Esta matriz declara qué capacidad existe dónde, qué
degradación aplica cuando falta, y qué protecciones corren en cada target —
para que nadie asuma garantías que su host no ejecuta.

Fuente de mapeo de tools: `scripts/lib/target-profiles/*.js` (`toolMap`).

## 1. Capacidades diferenciales por target

| Capacidad | claude (Claude Code) | vscode (Copilot Chat) | github-copilot (CLI) | opencode |
|---|---|---|---|---|
| Preguntas estructuradas | `AskUserQuestion` | `vscode/askQuestions` | `ask_user` | `question` |
| Sub-agentes delegados | ✅ (`Task`/agents) | ✅ (`agent`) | parcial (sesión única) | ✅ (`task`) |
| Sub-agentes en paralelo | ✅ | ❌ (secuencial) | ❌ | ❌ |
| Background tasks | ✅ (`run_in_background`) | ❌ | ❌ | ❌ |
| Lifecycle hooks del plugin | ✅ (los 5) | ❌ | ❌ | parcial (plugin JS propio) |
| Fallback de modelos por tier | vía `models.yaml` | ✅ (orden declarado) | ❌ | ✅ |

Regla de generación: los prompts de un target NO deben instruir tools o
capacidades que su host no tiene — instruir una tool inexistente hace que el
agente alucine o se trabe. Ante la duda, el prompt generado usa el mínimo común
(pregunta de chat numerada con opciones cerradas como fallback de gate).

## 2. Degradación definida

- **Gates sin question-tool**: pregunta de chat estructurada — numerada, con
  opciones cerradas y una recomendada — y espera de respuesta antes de continuar.
- **4R sin paralelismo**: los 4 reviewers corren secuenciales (ver
  `skills/_shared/gate-4r-review.md`, Dispatch). Con paralelismo (Claude Code),
  los 4 se despachan a la vez — es el gate más caro del flujo y la latencia baja ~4x.
- **Sin background tasks**: los batches largos de apply se trocean en dispatches
  síncronos; el orquestador no debe prometer seguimiento en segundo plano.

## 3. Paridad de hooks / protecciones por target (D2)

| Protección | Mecanismo | claude | vscode | github-copilot | opencode | Mitigación donde falta |
|---|---|---|---|---|---|---|
| AgentShield (secretos) | hook `PreToolUse` | ✅ | ❌ | ❌ | parcial | regla instruccional en `rules/` del target |
| Token budget advisor | hook `PreToolUse` | ✅ | ❌ | ❌ | parcial | `skills/_shared/token-budget.md` (pasivo) |
| Git collaboration guard | hook `PreToolUse` | ✅ | ❌ | ❌ | parcial | git hooks locales (`pre-commit`) |
| No-model-attribution | 3 capas | ✅ (hook+git+regla) | git hook + regla | git hook + regla | git hook + regla | git hook cubre TODOS los targets |
| Strict TDD guard | git hook + regla | ✅ | ✅ | ✅ | ✅ | — (git hook, host-agnóstico) |
| Registry fresh / session state | `SessionStart`/`Stop` | ✅ | ❌ (registro por comando) | ❌ | parcial | `sdd-init` regenera el registry on-demand |

Lectura correcta de esta tabla: **los git hooks locales son la única capa que
corre igual en los cuatro targets**; las protecciones de lifecycle hooks son
plenas solo en Claude Code. Un usuario de vscode/copilot NO debe asumir que el
token advisor o AgentShield corren para él — tiene la versión instruccional
(defensa pasiva) generada en las rules de su target.

## 4. Trabajo futuro declarado

- Campo `capabilities:` en `target-profiles/*.js` para inyectar/omitir secciones
  condicionales en la transform (hoy la degradación es prosa compartida).
- MCP server `ospec` read-only (D3) como canal uniforme de estado para los 4
  targets y hosts futuros.
