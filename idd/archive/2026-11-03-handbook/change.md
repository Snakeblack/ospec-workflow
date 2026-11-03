# handbook

## Intent and acceptance

Sustituir sdd-document por la skill handbook (dos modos como foundation): fuente en handbook/ con manifiesto handbook.json y web Starlight opcional

Acceptance: La skill handbook se instala siempre y se invoca fuera de SDD; SDD delega en el agente handbook; openwiki/ pasa a handbook/; el orden, las etiquetas y la audiencia de los grupos de la web salen de handbook/handbook.json; sdd-document y /sdd-document desaparecen; node scripts/check.js en verde

## Plan

<!-- ospec:plan:start -->
- Files: `README.es.md`, `README.md`, `agents/handbook.agent.md`, `agents/sdd-document.agent.md`, `agents/sdd-orchestrator.agent.md`, `commands/sdd-document.prompt.md`, `handbook/handbook.json`, `models.yaml`, `openspec/specs/sdd-document/spec.md`, `openwiki/quickstart.md`, `scripts/lib/model-resolver.js`, `scripts/sdd-document.test.js`, `scripts/starlight-web-doc-contract.test.js`, `scripts/sync-openwiki.test.js`, `skills/_shared/route-document.md`, `skills/handbook/SKILL.md`, `skills/sdd-document/SKILL.md`, `web-doc/scripts/sync-openwiki.mjs`
- Work units: 4
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Carpeta fuente handbook/ (se renombra openwiki/), decidido por el usuario
- Manifiesto handbook/handbook.json, leído con JSON.parse por el sync sin dependencias, decidido por el usuario
- Una skill handbook con modo directo e instalada siempre, más agente handbook para la delegación de SDD; se borran sdd-document y /sdd-document, decidido por el usuario
- Destino único handbook/ (ruta configurable en el manifiesto) más web Starlight opcional; se eliminan las opciones A/B/C/D, decidido por el usuario
- handbook.json lleva solo grupos (orden, etiqueta, audiencia), idioma y web sí/no; el orden de páginas sigue en el frontmatter sidebar.order
- SDD delega en el agente handbook cuando se pide documentar, sin comando; sin comando /handbook, basta la skill como foundation
- Un directorio no nombrado en el manifiesto se añade al final, alfabético, con nombre humanizado y aviso
- El estado de ejecución va en handbook/.state.json generado; un openwiki/ existente se migra con git mv y conversión al manifiesto tras preguntar una vez
- El bloque de AGENTS.md/CLAUDE.md pasa a '## Handbook' y se sigue escribiendo por defecto
- Se mantienen web-doc/ y las URL de páginas; el script pasa a sync-handbook.mjs
- audience se muestra como badge de texto en cada grupo del sidebar
- handbook.json ausente o inválido: el sync avisa y cae al orden alfabético sin romper el build
- El agente handbook, como foundation, no entra en la telemetría de coste de fase: la identidad de agentes solo reconoce sdd-* y review-*
- La ruta del handbook no va en handbook.json (vive dentro de esa carpeta): se configura con --source en los scripts de web-doc/package.json; por defecto ../handbook
- Frontera en SDD: el orquestador fija web y la línea base (con git hash-object por fichero) antes de cada despacho, guarda en su contexto el hash de todo el state.yaml y comprueba la frontera también en cada retorno blocked; en modo directo la skill compara git status antes y después y lo informa
- El sync quita usuario, contraseña y puerto ssh de la URL de origin antes de reescribir enlaces
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-03T08:13:11.270Z)
- ev-2: migration-test for migration-compat-and-test (2026-11-03T08:13:52.513Z)
- ev-3: check-run for checks-pass (2026-11-03T08:15:27.282Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-11-03T08:15:27.282Z)
- ev-5: frozen-review for trust-review (2026-11-03T08:22:41.459Z, subagent-stop)
- ev-6: check-run for checks-pass (2026-11-03T08:28:06.812Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-11-03T08:28:06.812Z)
- ev-8: migration-test for migration-compat-and-test (2026-11-03T08:28:18.911Z)
- ev-9: frozen-review for trust-review (2026-11-03T08:30:38.611Z, subagent-stop)
- ev-10: check-run for checks-pass (2026-11-03T08:34:21.504Z)
- ev-11: adr-impact-declaration for adr-impact-declaration (2026-11-03T08:34:21.504Z)
- ev-12: migration-test for migration-compat-and-test (2026-11-03T08:34:32.087Z)
- ev-13: frozen-review for trust-review (2026-11-03T08:36:28.832Z, subagent-stop)
- ev-14: migration-test for migration-compat-and-test (2026-11-03T09:49:46.401Z)
- ev-15: check-run for checks-pass (2026-11-03T09:50:57.902Z)
- ev-16: adr-impact-declaration for adr-impact-declaration (2026-11-03T09:50:57.902Z)
- ev-17: frozen-review for trust-review (2026-11-03T09:54:26.354Z, subagent-stop)
- ev-18: migration-test for migration-compat-and-test (2026-11-03T09:56:34.669Z)
- ev-19: check-run for checks-pass (2026-11-03T09:57:46.016Z)
- ev-20: adr-impact-declaration for adr-impact-declaration (2026-11-03T09:57:46.016Z)
- ev-21: frozen-review for trust-review (2026-11-03T10:34:57.411Z, subagent-stop)
- ev-22: check-run for checks-pass (2026-11-03T10:36:09.599Z)
- ev-23: adr-impact-declaration for adr-impact-declaration (2026-11-03T10:36:09.599Z)
- ev-24: living-doc-current for living-doc (2026-11-03T10:36:18.813Z)
<!-- ospec:evidence:end -->
