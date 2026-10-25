# Model Routing

ospec no elige modelos por ti. Cada agente pertenece a un **tier** (`premium`,
`default` o `cheap`). Tú decides qué modelo usa cada tier en cada host, y un tier
sin modelo hereda el de la sesión.

## Qué viene con ospec (`models.yaml`)

`models.yaml` contiene solo lo que no caduca:

1. `agents`: a qué tier pertenece cada agente. Es la única decisión por agente, y
   un agente sin entrada cae en el tier de `_default`.
2. `tiers`: por tier, los alias de Claude (`opus`, `sonnet`, `haiku`), que el host
   resuelve a su último modelo, y el `model_reasoning_effort` y el `model_verbosity`
   de Codex.

No trae nombres de modelo de Codex, OpenCode, Cursor, VS Code ni GitHub Copilot,
porque caducan y dependen de los proveedores de cada usuario. El validador solo
exige el roster SDD completo, tiers conocidos y ausencia de agentes `sdd-*`
inesperados.

## Tus modelos por tier

Asigna un modelo a cada tier al instalar:

```bash
npm run setup:codex -- --model premium=gpt-6.1-sol --model cheap=gpt-6-luna
npm run setup:opencode -- --model default=zai-coding-plan/glm-5.3
npm run setup:tui    # un campo por tier en el instalador guiado
```

- El modelo se escribe tal como lo nombra el host: texto libre de una línea, de
  hasta 200 caracteres. ospec no lo compara con ningún catálogo.
- `--model <tier>=` (vacío) quita el modelo de ese tier.
- Con `--dry-run`, los flags valen solo para esa ejecución y no se guardan.
- En Claude, `--model` sustituye el alias del tier (por ejemplo,
  `--model premium=fable`). Sin asignación, Claude usa los alias de `models.yaml`.
- Antigravity hereda siempre el modelo de la sesión y rechaza `--model`.

La asignación se guarda fuera de cualquier proyecto, porque los agentes se
instalan por usuario:

| Sistema | Fichero |
| --- | --- |
| Linux y macOS | `$XDG_CONFIG_HOME/ospec/models.yaml`, o `~/.config/ospec/models.yaml` |
| Windows | `%APPDATA%\ospec\models.yaml` |

```yaml
codex:
  premium: "gpt-6.1-sol"
  cheap: "gpt-6-luna"
opencode:
  default: "zai-coding-plan/glm-5.3"
```

Al terminar, el resumen del instalador muestra el modelo de cada tier y cómo
asignar los que heredan. Si el fichero no se puede leer o nombra un host o un tier
desconocido, el instalador avisa, lo ignora (los agentes heredan) y no lo
sobrescribe: corrígelo o bórralo antes de volver a usar `--model`.

## Cómo se resuelve el modelo de un agente

`scripts/lib/model-resolver.js` busca el tier del agente y aplica, por orden:

1. el modelo que asignaste a ese tier en ese host, con el effort del tier en Codex;
2. el alias del tier en Claude;
3. nada: el generador no escribe `model` y el agente hereda el modelo de la sesión.

Un build normal (`npm run build:*`, `dist/`, la CI o el marketplace publicado)
nunca lee tu asignación, así que solo lleva los alias de Claude. Solo los
instaladores la pasan al generador.

## Formato por host

- **`claude`**: el alias como escalar en el frontmatter (`model: opus`).
- **`codex`**: `model`, `model_reasoning_effort` y `model_verbosity` en el TOML del
  agente. Sin modelo asignado no se escribe ninguno de los tres.
- **`opencode`**: el slug `provider/model` que escribiste, como escalar.
- **`cursor`**: el modelo como escalar. Sin él, Cursor aplica su `inherit` por
  defecto.
- **`vscode`** y **`github-copilot`**: el nombre tal como lo muestra el selector de
  modelos (`"gpt-6 Sol (copilot)"`).
- **`antigravity`**: nunca lleva `model`.

## Perfiles locales heredados

Para usar el repositorio directamente en VS Code, sin generar, siguen disponibles
los perfiles opcionales de `profiles/models/` (`default`, `cheap` y `premium`).
El generador no los lee.
