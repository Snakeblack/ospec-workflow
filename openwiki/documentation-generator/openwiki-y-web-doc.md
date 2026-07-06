---
title: "Generación de documentación: OpenWiki y Starlight web-doc"
---

# Generación de documentación: OpenWiki y Starlight web-doc

La fase `/sdd-document` compila el conocimiento técnico del repositorio en una wiki Markdown navegable (`openwiki/`) y, opcionalmente, en un sitio web estático de búsqueda (`web-doc/`) construido con Starlight/Astro. `openwiki/` es siempre la única fuente de verdad de contenido; `web-doc/` nunca se edita a mano, se sincroniza desde `openwiki/` mediante un script determinista.

## Cómo funciona

```
[/sdd-document]
      │
      ▼
[Gate de idioma + alcance] ──► (Opción A/B/C/D, una sola pregunta agrupada)
      │
      ▼
[sub-agente sdd-document] ──► genera openwiki/{quickstart.md, dominio/*.md}
      │                        (Opción D: además materializa web-doc/ una vez)
      ▼
[openwiki/.last-update.json] ──► persiste gitHead, doc_language, scope_choice
      │
      ▼ (solo Opción D, en tiempo de build del sitio)
[web-doc: predev/prebuild] ──► node scripts/sync-openwiki.mjs
      │
      ▼
[web-doc/src/content/docs/] ──► árbol espejo de openwiki/, con frontmatter y
                                  enlaces reescritos; Astro/Starlight lo sirve
```

1. **Selección de alcance**: el manejador de ruta dedicado `skills/_shared/route-document.md` agrupa idioma + alcance en una sola pregunta (o, en modo actualización, ofrece "mantener o cambiar" los valores persistidos). La Opción D aprueba el sandbox de escritura como el CONJUNTO `{openwiki/, web-doc/}` — dos directorios hermanos, nunca uno anidado en el otro.
2. **Generación de `openwiki/`**: idéntica a la Opción A — descubrimiento de dominios, guarda de máximo de páginas, ediciones quirúrgicas en modo actualización (ver `skills/sdd-document/SKILL.md`).
3. **Materialización del scaffold `web-doc/`**: se copian, solo si faltan (regla "copy-if-missing", idempotente entre init y update), los archivos estáticos de `skills/sdd-document/assets/web-doc-template/` — nunca se ejecutan instaladores (`npm create astro`, `npm install`, etc.); todo se escribe verbatim vía la herramienta de escritura del agente.
4. **Sincronización en build**: `web-doc/package.json` declara `predev`/`prebuild` que invocan `node scripts/sync-openwiki.mjs`. Este script transforma cada página de `openwiki/` en `web-doc/src/content/docs/`, nunca al revés.
5. **`.last-update.json`**: se escribe siempre bajo `openwiki/` (nunca bajo `web-doc/`), y ahora incluye `doc_language` y `scope_choice` para que la siguiente corrida en modo actualización pueda saltarse el gate de idioma/alcance.

## Detalles técnicos

### El motor de sincronización (`sync-openwiki.mjs`)

Script Node ESM de cero dependencias (solo módulos `node:*`) que garantiza:

- **Frontmatter no destructivo**: inyecta `title` (primer encabezado `#`, o el nombre de archivo humanizado) solo si no existe ya un `title` de nivel raíz; nunca re-serializa un bloque YAML existente completo — evita perder estructuras anidadas o multilínea.
- **Reescritura de enlaces**: los enlaces a archivos fuente del repositorio (rutas que empiezan con `/` y no son `/openwiki/...`) se reescriben a `{originUrl}/blob/{defaultBranch}{ruta}`; los enlaces internos de la wiki quedan intactos. Si no hay remoto `origin` configurado, degrada con un aviso y continúa (nunca rompe `predev`/`prebuild`).
- **Incremental**: usa una caché (`.sync-cache.json`) de `mtimeMs` + hash SHA-256 por página para evitar retransformar contenido sin cambios.
- **Paridad 1:1 y poda**: elimina en `web-doc/src/content/docs/` cualquier página cuya fuente en `openwiki/` ya no exista. Guarda de seguridad: si `openwiki/` está vacío o ausente, aborta ANTES de tocar el directorio de salida, para nunca confundir "sin fuente" con "borrar todo el sitio".
- **Degradación general**: un fallo por página, una caché corrupta, o un origin ausente jamás detienen el build completo; se reportan como advertencias.

### El scaffold estático (`skills/sdd-document/assets/web-doc-template/`)

| Archivo | Rol |
| :--- | :--- |
| `package.json` | Declara `predev`/`prebuild` → `sync-openwiki.mjs`, y las dependencias `astro` + `@astrojs/starlight`. |
| `astro.config.mjs` | Configura Starlight (`title`, `customCss`); comenta explícitamente que el contenido nunca se autora a mano. |
| `content.config.ts` | Define la colección `docs` usando `docsLoader`/`docsSchema` de Starlight. |
| `tsconfig.json` | Extiende `astro/tsconfigs/strict`. |
| `src/styles/custom.css` | Overrides de variables `--sl-*` para theming de marca. |
| `scripts/sync-openwiki.mjs` | El motor de sincronización descrito arriba. |

Estos archivos se referencian también desde la skill de convenciones `skills/stack-starlight/SKILL.md` (páginas en `src/content/docs/`, frontmatter `title` obligatorio, sidebars por `autogenerate`, componentes nativos solo en `.mdx`).

### Contrato de la Opción D (recuperación y reintentos)

- **Copy-if-missing uniforme**: la presencia de un archivo en su ruta de scaffold es la única señal considerada — nunca se inspecciona su origen ni se re-valida su contenido en corridas posteriores. Un archivo parcialmente escrito por una corrida interrumpida se trata igual que cualquier archivo preexistente (se deja intacto).
- **Reintento único**: si falla la escritura de un archivo del scaffold, se reintenta una sola vez; si sigue fallando, se reporta como WARNING no fatal y continúa con el resto (mismo patrón que el fallo de escritura de `.last-update.json`).
- **Verificación de sandbox post-ejecución (J5)**: el orquestador — no el sub-agente — corre `git status` acotado al CONJUNTO `{openwiki/, web-doc/}` más las excepciones `/AGENTS.md`/`/CLAUDE.md` tras cada corrida, como verificación independiente de que no se escribió nada fuera del sandbox aprobado.

## Por qué la arquitectura tiene esta forma

Separar el contenido (`openwiki/`, Markdown plano, editable por agentes) de su presentación web (`web-doc/`, generado, nunca editado a mano) evita una fuente de verdad dual: cualquier corrección de contenido se hace una sola vez en `openwiki/` y se propaga automáticamente al sitio en el siguiente `predev`/`prebuild`. Ejecutar la sincronización como script de cero dependencias (en vez de un plugin de build o una dependencia npm adicional) mantiene el scaffold auditable línea por línea y evitable de invocar instaladores dentro de un sandbox de escritura restringido.

## Puntos de extensión principales

- **Añadir un nuevo target de documentación** (por ejemplo, otro generador de sitio): definir una nueva Opción de alcance en el gate batched de `skills/sdd-document/SKILL.md` Paso 3, y su propio archivo de referencia bajo `skills/sdd-document/references/`.
- **Personalizar el theming del sitio**: editar `web-doc/src/styles/custom.css` (variables `--sl-*`) siguiendo `skills/stack-starlight/references/sidebar-and-customization.md`.
- **Extender el frontmatter inyectado**: modificar `buildFrontmatterBlock` en `sync-openwiki.mjs`, preservando la regla de nunca re-serializar frontmatter preexistente.

## Aspectos a tener en cuenta al editar

- **Nunca escribir en `web-doc/src/content/docs/`**: ese árbol es 100% generado; cualquier edición manual se pierde en el siguiente `predev`/`prebuild` (y puede ser podada por la regla de paridad 1:1).
- **`.last-update.json` vive solo en `openwiki/`**: no crear una copia bajo `web-doc/`; el generador y el route handler (`skills/_shared/route-document.md`) asumen esa única ubicación para decidir modo init/update y para saltar el gate de idioma/alcance en corridas futuras.
- **No ejecutar instaladores**: cualquier cambio al scaffold debe seguir escribiéndose como archivo estático verbatim, nunca vía `npm create`/`npm install` durante la generación.
- **Sandbox dual**: cualquier escritura de esta fase fuera de `{openwiki/, web-doc/}` (salvo `/AGENTS.md`/`/CLAUDE.md`) es una violación de sandbox que debe detener la ejecución (`blocker_type: design-mismatch`).

## Mapa de fuentes

| Archivo / Directorio | Rol | Evidencia de Git |
| :--- | :--- | :--- |
| [/skills/sdd-document/SKILL.md](/skills/sdd-document/SKILL.md) | Procedimiento completo del sub-agente `sdd-document`. | `fe02de1` |
| [/skills/sdd-document/references/option-d-starlight.md](/skills/sdd-document/references/option-d-starlight.md) | Procedimiento íntegro de la Opción D (scaffold, sandbox dual, `.last-update.json`). | `e822228` |
| [/skills/sdd-document/assets/web-doc-template/scripts/sync-openwiki.mjs](/skills/sdd-document/assets/web-doc-template/scripts/sync-openwiki.mjs) | Motor de sincronización `openwiki/` → `web-doc/src/content/docs/`. | `fdd3ce3` |
| [/scripts/sync-openwiki.test.js](/scripts/sync-openwiki.test.js) | Suite de tests del motor de sincronización (incluye caso incremental). | `80983c7` |
| [/scripts/starlight-web-doc-contract.test.js](/scripts/starlight-web-doc-contract.test.js) | Contrato estático que ancla los strings de la Opción D en `SKILL.md`. | `9c3b3b3` |
| [/skills/_shared/route-document.md](/skills/_shared/route-document.md) | Manejador de ruta orquestador-side para `/sdd-document` (gate batched, J5). | `e822228` |
| [/skills/stack-starlight/SKILL.md](/skills/stack-starlight/SKILL.md) | Convenciones de Starlight (frontmatter, sidebars, componentes). | `68af849` |
