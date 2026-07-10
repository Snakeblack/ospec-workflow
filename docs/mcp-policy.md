# MCP Policy

El perfil MCP predeterminado debe mantenerse al mínimo.

Incluidos de forma predeterminada:

- Context7
- MarkItDown

En Codex se registran a nivel global mediante `codex mcp`, no dentro del
plugin. El instalador compara `command` y `args` antes de añadirlos para
reutilizar configuraciones preexistentes aunque tengan otro nombre. Esta
excepción evita que Codex inicie simultáneamente la instancia global y otra
instancia con scope de plugin.

No se deben añadir servidores MCP de forma predeterminada, salvo que sean útiles en la mayoría de las sesiones de SDD.

Los perfiles MCP opcionales deben activarse explícitamente.
