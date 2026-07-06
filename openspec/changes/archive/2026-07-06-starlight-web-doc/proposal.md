# Proposal: Opción D de sdd-document — OpenWiki + Starlight web

## Intent

Hoy `sdd-document` genera solo wikis Markdown locales (Opciones A/B/C). Los equipos quieren publicar esa documentación como sitio web navegable sin duplicar contenido ni introducir un segundo origen de verdad. La Opción D añade un cascarón Starlight (`web-doc/`) que se alimenta de `openwiki/` mediante sincronización, manteniendo `openwiki/` como única fuente de verdad y sin ejecutar instaladores durante la generación.

## Scope

### In Scope
- Nueva Opción D "OpenWiki + Starlight web" en el gate batched de idioma+scope (Step 3 de sdd-document y §1 del route handler).
- Escritura de `web-doc/` como scaffold estático desde plantilla: `package.json`, `astro.config.mjs`, `content.config.ts`, `tsconfig.json` y CSS custom. Nunca `npm create astro` ni instalación de dependencias.
- Script de sincronización eficiente invocado en `predev`/`prebuild` que copia/transforma `openwiki/` → `web-doc/src/content/docs/`.
- Inyección de frontmatter `title` (+ `description` opcional) en las páginas transformadas para cumplir el schema de Starlight.
- Reescritura de enlaces a archivos fuente (`/path`) hacia enlaces al repositorio remoto.
- Sandbox de escritura que apruebe `openwiki/` Y `web-doc/` a la vez.
- Persistir `scope_choice: D` en `.last-update.json`.

### Out of Scope
- Divergencia de granularidad wiki↔web: paridad estricta 1:1, sin páginas web-only.
- Instalación de dependencias o build real en tiempo de generación.
- Generar `web-doc/` cuando el usuario NO elige Opción D.
- Deploy/hosting del sitio (CI/CD de publicación).

## Capabilities

### New Capabilities
- Ninguna. Toda la conducta nueva extiende la capacidad `sdd-document` existente.

### Modified Capabilities
- `sdd-document`: nueva Opción D en el batched gate (REQ-006); sandbox multi-directorio `openwiki/`+`web-doc/` (REQ-002); enum `scope_choice` amplíado a `A|B|C|D` en `.last-update.json` (REQ-011); nuevos requisitos para el scaffold Starlight cascarón, la sincronización `openwiki/`→`web-doc/`, la inyección de frontmatter y la reescritura de enlaces remotos.
- `agents`: el post-run sandbox inventory (J5) debe cubrir ambos directorios aprobados cuando el scope es D, no un único directorio.

## Approach

Opción D reutiliza toda la generación OpenWiki de Opción A y añade un paso de scaffolding determinista: se escriben archivos de plantilla estáticos en `web-doc/` (sin ejecución). El contenido nunca se duplica en `web-doc/`; un script de sync leído en `predev`/`prebuild` transforma `openwiki/` bajo demanda. El route handler (`skills/_shared/route-document.md`) ofrece la Opción D, resuelve el directorio de salida como el par `openwiki/` + `web-doc/`, y amplía el scoping de `git status` de J5 a ambos.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `skills/sdd-document/SKILL.md` | Modified | Opción D en gate, sandbox dual, scaffold + sync + frontmatter + reescritura de enlaces |
| `skills/_shared/route-document.md` | Modified | Opción D en §1, resolución de salida §3, J5 multi-dir §6 |
| `openspec/specs/sdd-document/spec.md` | Modified | Deltas REQ-002/006/011 + nuevos REQ Opción D |
| `openspec/specs/agents/spec.md` | Modified | J5 sandbox inventory cubre múltiples dirs aprobados |
| `web-doc/` (repo objetivo) | New | Scaffold Starlight generado solo con Opción D |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Deriva de plantilla Starlight desactualizada | Med | Basar el scaffold en `skills/stack-starlight` como referencia versionada |
| Sync ineficiente en wikis grandes | Med | Diff por mtime/hash; solo transformar páginas cambiadas |
| Fuga del sandbox a un tercer directorio | Low | Sandbox dual explícito + J5 multi-dir independiente |
| Frontmatter/enlaces mal transformados rompen build Starlight | Med | Contrato de transformación testeado; `title` obligatorio garantizado |

## Rollback Plan

Revertir es de bajo costo: la Opción D es aditiva. Eliminar la opción del gate y del route handler, revertir los deltas de spec, y borrar el directorio `web-doc/` generado. Las Opciones A/B/C quedan intactas porque `web-doc/` solo se crea al elegir D.

## Dependencies

- `skills/stack-starlight/*` como referencia técnica de la plantilla (solo lectura).
- Ninguna dependencia de runtime nueva instalada en tiempo de generación.

## Success Criteria

- [ ] Elegir Opción D genera `openwiki/` completo más `web-doc/` cascarón sin ejecutar instaladores.
- [ ] `web-doc/src/content/docs/` se puebla solo vía script de sync desde `openwiki/`, con paridad 1:1.
- [ ] Páginas web tienen `title` en frontmatter y enlaces `/path` reescritos al repo remoto.
- [ ] `scope_choice: D` persiste en `.last-update.json` y el sandbox aprueba ambos directorios.
- [ ] J5 verifica ambos directorios; Opciones A/B/C sin cambios de conducta.

> **Branch advisory:** Antes de que arranque `sdd-apply`, SHOULD crearse una rama de feature siguiendo la convención `<tipo>/<descripción>` del skill `branch-pr` (p. ej. `git checkout -b feat/starlight-web-doc main`).
