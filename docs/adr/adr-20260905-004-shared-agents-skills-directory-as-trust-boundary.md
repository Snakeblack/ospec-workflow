# ADR-20260905-004: `~/.agents/skills` como frontera de confianza equivalente al bundle del plugin

- **Estado**: Accepted
- **Fecha**: 2026-09-05
- **Alcance**: runtime de registro de skills (`scripts/lib/skill-registry.js`, `scripts/hooks/session-start.js`, puerto Go `internal/skillreg`, `internal/hooks/sessionstart.go`)

## Contexto

Las instalaciones globales de Codex separan los scripts del plugin (`~/.codex/ospec-workflow`) del árbol de skills (`~/.agents/skills`). El session-start descubre los `SKILL.md` en ese directorio externo y su contenido parseado (`id`, `path`, `triggers`, `compact_rules`) se persiste en el registry cache y se inyecta como contexto de sesión.

`~/.agents/skills` es un directorio estándar compartido por varios frameworks de agentes, no un directorio exclusivo de este plugin.

## Decisión

Se trata `~/.agents/skills` como una **frontera de confianza equivalente al propio bundle del plugin**:

1. El contenido de cualquier `SKILL.md` presente ahí se considera tan confiable como el del bundle. El descubrimiento no filtra por autoría ni propiedad del directorio.
2. El guard `requireSkills` (fallo si no hay ningún `SKILL.md`) atestigua presencia del bundle, **no** autoría del contenido.
3. El modelo de amenaza aceptado: comprometer el filesystem del home del usuario ya implica compromiso del bundle (`~/.codex/ospec-workflow`); un directorio compartido en el mismo nivel de privilegios no amplía el privilegio del atacante, sí su conveniencia (cualquier herramienta que escriba en `~/.agents/skills` gana inyección de prompt persistente hasta que el archivo cambie, perpetuada por la cache con fingerprint).

## Consecuencias

- La superficie de inyección de contexto pasa de "un directorio por herramienta" a "un directorio compartido por herramientas". Es la contrapartida directa de interoperar con el estándar `~/.agents/skills`.
- Si en el futuro se requiere atestación de autoría, la opción documentada es restringir el descubrimiento a un subdirectorio propio (p. ej. `~/.agents/skills/ospec-workflow/`); ese cambio es una nueva decisión, no una corrección de esta.
- Los paths de skills externos se serializan como rutas absolutas portables en la cache; consumidores del cache no deben asumir rutas relativas al plugin root.
