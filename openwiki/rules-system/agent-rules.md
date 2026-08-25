# Sistema de Reglas de Agentes

El sistema de reglas define las restricciones, protocolos y políticas innegociables que gobiernan el comportamiento de los agentes dentro del flujo de trabajo de OpenSpec. Su función principal es garantizar la consistencia técnica, el cumplimiento del desarrollo guiado por pruebas (TDD) y evitar la atribución no deseada a modelos de IA.

## Flujo principal y funcionamiento
Las reglas durables se almacenan como archivos Markdown planos en el directorio `/rules/`. Son artefactos fuente versionados del árbol canónico, por lo que el [generador multi-target](../architecture/overview.md) las distribuye a cada target según su perfil declarativo (`scripts/lib/target-profiles/*.js`). Cada agente lee estos protocolos y los aplica como un contrato estricto, afectando desde la redacción de *commits* hasta la generación y verificación de código.

### Distribución de reglas por target
El generador transforma `rules/` según la estrategia declarada en cada perfil:

| Target | Estrategia | Destino |
| --- | --- | --- |
| `claude` | `inline-into-orchestrator` | Se incorporan al agente orquestador, emitido como skill. |
| `github-copilot` | `to-instructions` | `.github/instructions/*.instructions.md` (`applyTo: "**"`). |
| `opencode` | `to-instructions-config` | `.opencode/instructions/`, referenciadas desde `opencode.json`. |
| `cursor` | `to-mdc` | `rules/*.mdc` con `alwaysApply: true`. |
| `antigravity` | `to-instructions` | Instructions con `applyTo: "**"`. |

## Reglas durables vs. reglas compactas
No confundir estas dos capas de inyección:

- **Reglas durables** (`/rules/*.instructions.md`): estáticas, versionadas y distribuidas por el generador a todos los targets. Definen política global (atribución nula, TDD estricto, protocolo OpenSpec/SDD).
- **Reglas compactas**: derivadas dinámicamente del caché del registro de skills (`.ospec/cache/skill-registry.cache.json`) e inyectadas por el `skill-resolver` en el prompt de cada sub-agente (bloques de 5-15 líneas). Su ciclo de vida está documentado en [Agentes y Skills](../agents-skills/agents-and-skills.md).

## Detalles técnicos
El sistema está compuesto por diferentes módulos de reglas:
- **Atribución nula:** Expresiones regulares y políticas que prohíben menciones a IA (ej. `Co-Authored-By`, Anthropic, Claude) en *commits* y PRs.
- **Protocolo OpenSpec:** Define las rutas canónicas de artefactos (ej. `/openspec/config.yaml`, `/openspec/changes/...`) y los permisos de escritura.
- **Protocolo SDD:** Delimita las fases del *Software-Driven Development*, la interacción entre el orquestador y los agentes de fase, y las fronteras de ejecución.
- **TDD Estricto:** Obliga a seguir el ciclo RED → GREEN → TRIANGULATE → REFACTOR y persistir la evidencia en `/openspec/changes/{change-name}/apply-progress.md`.

Estas reglas están sujetas al lint de contratos: el checker `k1-prose-authority` incluye el directorio `rules/` dentro de su alcance de análisis estático. Ver [Lint de Contratos y Reglas de Validación](../contract-lint/validation-rules.md).

## Decisiones de diseño
La arquitectura se basa en instrucciones planas y modulares (archivos separados por dominio) para facilitar la lectura tanto por humanos como por el modelo. Esto permite modificar una política (ej. rutas de OpenSpec) sin alterar las reglas de TDD, logrando que el *prompting* del agente se mantenga ordenado y enfocado en áreas de responsabilidad claras.

## Puntos de extensión principales
- Creación de nuevos archivos `.instructions.md` en el directorio `/rules/` para aplicar nuevas directivas globales o específicas de lenguajes.
- Adaptación de la matriz de evidencia de TDD para incluir nuevos validadores estáticos o *runners* de pruebas.

## Aspectos a tener en cuenta (Gotchas e invariantes)
- No mezclar instrucciones durables con contextos temporales del usuario; las reglas deben permanecer estáticas.
- Los agentes fallarán o rechazarán generar código si se rompen invariantes clave, como exceder las líneas de cambio sin estrategias de PR en cadena, o faltar el respeto a las restricciones de modelo de atribución.

## Mapa de código
Contenido real de `/rules/` (exactamente cuatro archivos):
- `/rules/no-model-attribution.instructions.md`: Prohíbe incluir atribución a IA o modelos en los mensajes de *commit* y *Pull Requests*.
- `/rules/sdd-common.instructions.md`: Contrato compartido para orquestadores y agentes de fase, estableciendo cargas de revisión y formatos de retorno.
- `/rules/sdd-openspec.instructions.md`: Define el protocolo de persistencia, definiendo exactamente dónde y cómo se deben guardar los artefactos de OpenSpec.
- `/rules/sdd-strict-tdd.instructions.md`: Reglas estrictas para el proceso TDD, exigiendo evidencia de pruebas fallidas antes de generar código de producción.
