# Agentes y Skills

Este dominio define el núcleo de ejecución de tareas y capacidades del sistema ospec-workflow. Los **agentes** representan roles o fases específicas del ciclo de desarrollo (ej. proponer, aplicar, verificar), mientras que las **skills** (habilidades) son conjuntos de reglas, patrones y herramientas inyectables que dotan a los agentes del contexto necesario para trabajar con tecnologías o flujos particulares.

## Flujo principal
1. El orquestador determina la tarea a realizar y lanza el agente correspondiente (ej. `sdd-apply.agent.md`).
2. Antes de lanzar al sub-agente, el orquestador usa el mecanismo de resolución de skills (`skill-resolver`) para emparejar la tarea y los archivos afectados con las skills relevantes.
3. Se extraen reglas compactas (5-15 líneas) del caché del registro de skills (`skill-registry.cache.json`) y se inyectan en el prompt del sub-agente bajo la sección "Project Standards".
4. El agente ejecuta su fase con este contexto inyectado y reporta su estado, incluyendo cómo resolvió sus skills en su sobre de retorno (`envelope`).

## Detalles técnicos
- **Agentes (`/agents/`)**: Archivos Markdown que definen el prompt del sistema, las restricciones de la fase y el formato estricto de salida esperado (ej. sobres de respuesta con `status`, `artifacts`, `skill_resolution`).
- **Skills (`/skills/`)**: Directorios que contienen un archivo `SKILL.md` principal con metadatos (YAML frontmatter con nombre y triggers) e instrucciones detalladas.
- **Skill Resolver (`/skills/_shared/skill-resolver.md`)**: Protocolo universal que define el orden de resolución (contexto > caché > fallback) y cómo filtrar un máximo de 5 bloques de skills para evitar sobrecargar el prompt.
- **Skill Registry (`/skills/skill-registry/SKILL.md`)**: Es una skill especial encargada de escanear todas las skills globales y del proyecto, omitiendo aquellas de la arquitectura base (`sdd-*`, `_shared`), para generar un archivo JSON con reglas pre-digeridas y listas para inyectar.

## Decisiones de diseño (Por qué es así)
- **Aislamiento sin pérdida de contexto**: Los sub-agentes nacen "en blanco" para ahorrar tokens y mantener el foco, recibiendo sólo el conocimiento técnico estrictamente necesario mediante las reglas compactas.
- **Compaction Safety (Seguridad de compactación)**: Leer múltiples archivos `SKILL.md` en tiempo de ejecución saturaría la ventana de contexto del LLM. Por ello, el registro pre-calcula resúmenes accionables (compact rules) de 5 a 15 líneas, logrando inyecciones baratas y rápidas.
- **Resolución explícita**: Al forzar a los agentes a reportar su estado de `skill_resolution`, el orquestador puede detectar fallas en el contexto y rehidratar el caché antes de futuras delegaciones.

## Puntos de extensión mayores
- **Añadir nuevas skills**: Crear una nueva carpeta en `/skills/` con un `SKILL.md` (idealmente usando `skill-creator`) para soportar nuevos frameworks o convenciones de equipo.
- **Nuevas fases SDD**: Definir nuevos roles en `/agents/` si el flujo de trabajo requiere pasos intermedios (ej. un agente de auditoría de seguridad).

## Consideraciones al editar (Gotchas)
- **Actualizar el caché**: Si se modifica un `SKILL.md`, se DEBE ejecutar la skill `skill-registry` para que el orquestador vea los cambios en el archivo `.ospec/cache/skill-registry.cache.json`.
- **Sobres de respuesta**: Los agentes definidos en `/agents/` están obligados a devolver una estructura JSON o formato específico que incluya `skill_resolution`. Romper este contrato bloqueará el orquestador.
- **Límite de inyección**: Nunca inyectar skills del stack tecnológico en fases puramente administrativas como `sdd-archive` o `sdd-init`.

## Source Map
- `/agents/`: Directorio que contiene los prompts y contratos de cada fase (ej. `sdd-apply.agent.md`, `sdd-verify.agent.md`).
- `/skills/_shared/skill-resolver.md`: Protocolo que dicta cómo se descubren e inyectan las reglas en los prompts de los sub-agentes.
- `/skills/skill-registry/SKILL.md`: Instrucciones para compilar y actualizar el caché de habilidades.
- `/.ospec/cache/skill-registry.cache.json`: Archivo generado automáticamente que contiene los triggers y las reglas compactas listas para consumo.
