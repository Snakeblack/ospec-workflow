# Sistema de Reglas de Agentes

El sistema de reglas define las restricciones, protocolos y políticas innegociables que gobiernan el comportamiento de los agentes dentro del flujo de trabajo de OpenSpec. Su función principal es garantizar la consistencia técnica, el cumplimiento del desarrollo guiado por pruebas (TDD) y evitar la atribución no deseada a modelos de IA.

## Flujo principal y funcionamiento
Las reglas se almacenan como archivos Markdown (`.instructions.md`) en el directorio `/rules/`. Estas instrucciones se inyectan en el contexto global del orquestador y los subagentes durante la ejecución. Cada agente lee estos protocolos y los aplica como un contrato estricto, afectando desde la redacción de *commits* hasta la generación y verificación de código.

## Detalles técnicos
El sistema está compuesto por diferentes módulos de reglas:
- **Atribución nula:** Expresiones regulares y políticas que prohíben menciones a IA (ej. `Co-Authored-By`, Anthropic, Claude) en *commits* y PRs.
- **Protocolo OpenSpec:** Define las rutas canónicas de artefactos (ej. `/openspec/config.yaml`, `/openspec/changes/...`) y los permisos de escritura.
- **Protocolo SDD:** Delimita las fases del *Software-Driven Development*, la interacción entre el orquestador y los agentes de fase, y las fronteras de ejecución.
- **TDD Estricto:** Obliga a seguir el ciclo RED → GREEN → TRIANGULATE → REFACTOR y persistir la evidencia en `/openspec/changes/{change-name}/apply-progress.md`.

## Decisiones de diseño
La arquitectura se basa en instrucciones planas y modulares (archivos separados por dominio) para facilitar la lectura tanto por humanos como por el modelo. Esto permite modificar una política (ej. rutas de OpenSpec) sin alterar las reglas de TDD, logrando que el *prompting* del agente se mantenga ordenado y enfocado en áreas de responsabilidad claras.

## Puntos de extensión principales
- Creación de nuevos archivos `.instructions.md` en el directorio `/rules/` para aplicar nuevas directivas globales o específicas de lenguajes.
- Adaptación de la matriz de evidencia de TDD para incluir nuevos validadores estáticos o *runners* de pruebas.

## Aspectos a tener en cuenta (Gotchas e invariantes)
- No mezclar instrucciones durables con contextos temporales del usuario; las reglas deben permanecer estáticas.
- Los agentes fallarán o rechazarán generar código si se rompen invariantes clave, como exceder las líneas de cambio sin estrategias de PR en cadena, o faltar el respeto a las restricciones de modelo de atribución.

## Mapa de código
- `/rules/no-model-attribution.instructions.md`: Prohíbe incluir atribución a IA o modelos en los mensajes de *commit* y *Pull Requests*.
- `/rules/sdd-common.instructions.md`: Contrato compartido para orquestadores y agentes de fase, estableciendo cargas de revisión y formatos de retorno.
- `/rules/sdd-openspec.instructions.md`: Define el protocolo de persistencia, definiendo exactamente dónde y cómo se deben guardar los artefactos de OpenSpec.
- `/rules/sdd-strict-tdd.instructions.md`: Reglas estrictas para el proceso TDD, exigiendo evidencia de pruebas fallidas antes de generar código de producción.
