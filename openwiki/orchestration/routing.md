# Orquestación de fases SDD

Este dominio cubre cómo el orquestador decide qué secuencia de fases ejecutar
para un cambio dado, cómo esas fases se implementan como agentes/skills
delegables, y cómo el catálogo de skills se resuelve en tiempo de sesión.

## El ciclo SDD completo

```text
propose → spec → design → tasks → apply → verify → archive
```

No todo cambio necesita el ciclo entero. El orquestador (`agents/sdd-orchestrator.agent.md`)
evalúa la tabla `routing` de `openspec/config.yaml` de arriba a abajo y activa
la **primera ruta que coincide** con la clasificación del cambio y el estado
del proyecto.

## Cómo funciona el despachador de rutas

`scripts/lib/route-dispatcher.js` es el corazón puro (sin IO) de esta lógica:
exporta funciones puras y listas de constantes conocidas (`KNOWN_PHASES`,
`KNOWN_GATES`, `KNOWN_REVIEWERS`, `KNOWN_CLASSES`, `KNOWN_COSTS`) que actúan
como allowlist de validación para `openspec/config.yaml`.

| Concepto | Definición |
| --- | --- |
| **Route** | Perfil de flujo con una lista ordenada de fases y gates. Representa una intención de usuario distinta. |
| **Phase** | Sub-agente SDD delegado que produce un artefacto. Corre en el orden declarado dentro de la ruta. |
| **Gate** | Chequeo o advertencia en un punto específico de la ruta; no produce artefacto principal, registra su resultado en `state.yaml.gates`. |
| **Context (ctx)** | Objeto con señales del entorno del cambio actual, provisto por el orquestador. |
| **Derived signal** | Clave booleana de ctx calculada determinísticamente (p. ej. `specs_empty_with_code`). |

### Rutas canónicas

| Ruta | Clasificación | Cuándo | Fases |
| --- | --- | --- | --- |
| **foundation** | normal, high-risk | Proyecto vacío | `sdd-foundation` |
| **federated** | normal, high-risk | Workspace multi-repo | `sdd-workspace` → propose → spec → design → tasks → apply → verify → archive |
| **bugfix** | small, normal | Intención explícita de bugfix | `sdd-explore` → tasks → apply → verify → archive |
| **brownfield** | normal, high-risk | Código sin specs | `sdd-baseline` (en tandas por dominio) |
| **refactor** | small, normal | Intención explícita de refactor | design → tasks → apply → verify → archive |
| **hotfix** | trivial, small | Parche de emergencia | apply → verify → archive |
| **standard** | normal, high-risk | Proyecto activo (default) | propose → spec → design → tasks → apply → verify → archive |
| **lite** | trivial, small | Cambio pequeño, bajo riesgo | propose → tasks → apply → verify → archive |

Una ruta NUNCA debe agregarse para variar un solo toggle de configuración —
para eso existen los gates o las opciones de fase.

### Gates

- **clarify** — el orquestador detecta ambigüedad y pide aclaraciones antes de continuar.
- **4r-review-gate** — tras un `sdd-verify` exitoso, cuatro sub-agentes revisores (`review-risk`, `review-readability`, `review-reliability`, `review-resilience`) evalúan si el cambio requiere revisión humana.
- **impact** — en rutas federadas, evalúa impacto cross-repo antes de implementar.
- **brownfield-advisory** — informa sobre el estado de baseline antes de ejecutar `sdd-baseline`.
- **review-workload** — guarda el presupuesto de revisión de ~400 líneas por PR.

## Agentes y skills: dos capas de la misma unidad de trabajo

Cada fase SDD tiene dos artefactos fuente:

- `agents/{phase}.agent.md` — definición del agente (frontmatter + comportamiento).
- `skills/{phase}/SKILL.md` — el procedimiento detallado que el agente ejecutor debe seguir al pie de la letra.
- `commands/{phase}.prompt.md` — comando slash visible que rutea al orquestador.

Todos los agentes son artefactos fuente para el generador (dominio
[Arquitectura y generador multi-target](../architecture/overview.md)): se
transforman al layout nativo de cada target sin reescribir su contenido de
comportamiento.

El catálogo de skills se organiza en tiers bajo `skills/`:

1. **Skills de fase SDD** (`skills/sdd-{phase}/SKILL.md`) — un procedimiento por fase.
2. **`skills/_shared/`** — protocolo común (`sdd-phase-common.md`) que todo agente de fase carga: envelope de retorno, contrato de memoria operativa, guardas de revisión, idioma/mentoría.
3. **Skills de stack** (`stack-react`, `stack-go`, `stack-python`, etc.) — reglas compactas inyectadas cuando el proyecto declara esas capacidades.
4. **Skills de utilidad** (`caveman-*`, `chained-pr`, `branch-pr`, `gh-release-notes`, `harness-audit`, etc.) — herramientas invocables bajo demanda, no atadas a una fase SDD.

### Frontera ejecutor/orquestador

Toda skill de fase SDD (`skills/sdd-*`) declara un **ORCHESTRATOR GATE**: si el
orquestador carga la skill directamente, debe detenerse y delegar a un
sub-agente ejecutor en vez de ejecutar las instrucciones inline. Cada
sub-agente ejecutor sigue su propia skill sin lanzar más sub-agentes.

## Registro de skills (skill-registry)

El árbol `skills/` se compila en un artefacto JSON compacto
(`.ospec/cache/skill-registry.cache.json`) que agentes y hooks leen sin
reescanear el sistema de archivos. El hook `SessionStart` gestiona el ciclo de
vida de esta caché: reutiliza la existente si el fingerprint coincide, o la
regenera si algún archivo de entrada cambió. Esto evita releer decenas de
`SKILL.md` en cada sesión, controlando el presupuesto de tokens.

## Por qué la arquitectura está diseñada así

Separar el **routing declarativo** (`openspec/config.yaml`) de su
**motor de evaluación puro** (`route-dispatcher.js`) permite testear cada
ruta con fixtures de configuración sin montar un orquestador completo, y
permite que un usuario agregue/edite rutas propias sin tocar código. Las
constantes `KNOWN_*` actúan como contrato de validación temprana: una ruta con
un nombre de fase o gate no reconocido falla rápido en vez de comportarse de
forma impredecible en producción.

## Principales puntos de extensión

- Agregar una ruta: añadir una entrada en `openspec/config.yaml::routing` con
  `name`, `classification`, `conditions`, `phases`, `gates`, `description`,
  `cost` — usando solo nombres de `KNOWN_PHASES`/`KNOWN_GATES`.
- Agregar una fase nueva: crear `agents/{phase}.agent.md`,
  `skills/{phase}/SKILL.md`, y añadir el nombre a `KNOWN_PHASES` en
  `route-dispatcher.js`.
- Agregar un gate: implementarlo como módulo evaluado en el hook point
  correspondiente y registrarlo en `KNOWN_GATES`.

## Cosas a vigilar al editar

- El orden de evaluación de rutas importa: la primera coincidencia gana. Rutas
  más específicas deben ir antes que rutas genéricas como `standard`.
- Cambiar el contrato del envelope de retorno (`skills/_shared/sdd-phase-common.md`)
  afecta a **todos** los agentes de fase simultáneamente — requiere revisar
  `scripts/lib/result-envelope.js` y su espejo Go (`internal/resultenvelope`).
- Los agentes de fase son ejecutores, no orquestadores: no deben delegar en
  más sub-agentes salvo instrucción explícita del skill.

## Mapa de fuentes

- `/scripts/lib/route-dispatcher.js` — `git log`: `952d7de`, `cc0f79d` (routing intent-based + gate 4R)
- `/openspec/config.yaml` (bloque `routing`)
- `/agents/sdd-orchestrator.agent.md`, `/agents/*.agent.md`
- `/skills/_shared/sdd-phase-common.md`, `/skills/sdd-*/SKILL.md`
- `/scripts/lib/skill-registry.js`, `/scripts/hooks/session-start.js`
- `/openspec/specs/routing/spec.md`, `/openspec/specs/agents/spec.md`, `/openspec/specs/skills/spec.md`, `/openspec/specs/skill-registry/spec.md`
