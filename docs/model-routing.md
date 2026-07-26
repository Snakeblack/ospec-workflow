# Model Routing

Los agentes incluidos deben evitar nombres de modelos locales codificados de forma rígida.

Política recomendada:

- predeterminado: heredar el modelo seleccionado;
- verificación/diseño: permitir un modelo más potente mediante el perfil local;
- implementación: modelo de programación;
- exploración/propuesta: se acepta un modelo más económico;
- todas las fases: deben poder degradarse al modo de modelo único.

## Abstracción por tiers (`models.yaml`)

El generador multi-target (`scripts/configure/cli.js`) no fija IDs de modelo en cada
agente. En su lugar usa dos tablas en `models.yaml`, ambas editables a mano:

1. `agents`: a qué **tier** pertenece cada agente (la única decisión por agente).
2. `tiers`: cómo se traduce cada tier a un **modelo concreto por target**.

Un agente sin entrada explícita cae en el tier de `_default`. Cualquier hueco
(config ausente, tier o target faltante, o `inherit`) resuelve a OMIT: el generador
no escribe la clave `model:` y el host usa el modelo de la sesión.

### Tabla `agents` → tier

`models.yaml` es la única fuente de verdad del mapeo agente→tier. El validador
solo exige el roster SDD completo, tiers conocidos (`premium`/`default`/`cheap`),
reviewers y `_default` en `default`, y los pins Codex. La partición vigente se
lee del YAML (hoy: premium = design/verify/foundation/workspace; default incluye
orchestrator/propose/spec/clarify/apply/reconcile/baseline; cheap =
init/explore/tasks/archive/onboard/document).

### Tabla `tiers` → modelo por target

| Tier | `claude` (alias) | `vscode` (orden de fallback) | `opencode` (`provider/model`) |
| --- | --- | --- | --- |
| `premium` | `opus` | `Claude Opus 4.8 (copilot)`, `GPT-5.5 (copilot)` | `anthropic/claude-opus-4-8` |
| `default` | `sonnet` | `Claude Sonnet 4.6 (copilot)`, `GPT-5.3-Codex (copilot)` | `anthropic/claude-sonnet-4-6` |
| `cheap` | `haiku` | `Qwen 3.6 MSC1 (customendpoint)`, `GPT-5.4-mini (copilot)` | `anthropic/claude-haiku-4-6` |

El target `github-copilot` no inyecta `model:` (el origen lo omite y no hay columna `github-copilot`
en `tiers`): los agentes generados heredan el modelo de la sesión de Copilot.

## Formato del modelo por target

Cada target expresa el modelo de forma distinta; el resolver
(`scripts/lib/model-resolver.js`) devuelve la forma adecuada y la transform la
serializa en el frontmatter:

- **`claude`**: un **alias** (`opus` | `sonnet` | `haiku`) como escalar. Los alias
  siguen automáticamente el modelo más reciente, así que no hay IDs que mantener.
- **`vscode`**: una lista `"Nombre (vendor)"` que actúa como **orden de preferencia**;
  VS Code usa el primero disponible. Admite vendors como `copilot` y `customendpoint`.
- **`github-copilot`**: no se escribe `model:` (OMIT); el agente hereda el modelo de la sesión de
  Copilot, evitando la sintaxis de modelo aún poco especificada de GitHub.
- **`opencode`**: un slug `provider/model` (p.ej. `anthropic/claude-opus-4-8`) como escalar. Los IDs
  exactos se verifican contra [models.dev](https://models.dev); edita la columna `opencode` de
  `models.yaml` cuando models.dev publique versiones nuevas.

## Perfiles locales heredados

Para el uso directo en VS Code (sin generar) siguen disponibles los perfiles
opcionales en `profiles/models/`:

- `default`: fallback de un solo modelo;
- `cheap`: reduce coste en exploración y propuesta;
- `premium`: aumenta razonamiento en diseño y verificación.

`models.yaml` es la fuente para el generador; `profiles/models/` es la configuración
para el consumo directo del repositorio en VS Code.
