---
title: Conventions
last_updated: 2026-06-21
---

> Este archivo es mantenido por curación humana. Los agentes SDD SOLO lo leen.
> (This file is maintained by human curation. SDD agents ONLY read it.)

## Qué registrar aquí

Convenciones **recurrentes y estables** que ya se aplican en el repo y que emergen a
través de múltiples cambios SDD: naming, estructura de carpetas, estilo, decisiones de
stack, patrones de testing, etc. El objetivo es que los agentes no las re-deriven en
cada ciclo. Una convención = una regla que el equipo ya adoptó, no una idea suelta.

Formato sugerido por entrada: un encabezado `##` con la regla, seguido de viñetas
`ámbito` / `regla` / `por qué` (y opcionalmente `visto en`). Las entradas se agregan
manualmente (los agentes nunca escriben aquí).

<!-- ───────────────────────────────────────────────────────────────────── -->
<!-- EJEMPLO ILUSTRATIVO — NO es una convención real de este proyecto.        -->
<!-- Sirve solo para mostrar el formato. Los agentes DEBEN IGNORAR este       -->
<!-- bloque. El curador humano debe reemplazarlo o borrarlo al registrar la   -->
<!-- primera convención real.                                                 -->
<!-- (EXAMPLE ONLY — NOT a real convention. Agents MUST ignore this block.)   -->

## [EJEMPLO / EXAMPLE] Nombrar los tests de contrato como `*-contract.test.js`

> **Ejemplo ilustrativo — NO es una convención real de este proyecto.** Muestra solo el
> formato de una entrada. Reemplazalo o borralo al registrar tu primera convención real.
> (Illustrative example — NOT a real convention. Replace or delete it.)

- ámbito: `scripts/`
- regla: los tests que pinan invariantes de prosa o estructura (no lógica) usan el
  sufijo `-contract.test.js`
- por qué: los distingue de los unit tests de lógica y agrupa los guardas contra drift
- visto en: (ejemplo — no rastrea ningún cambio real)

<!-- FIN DEL EJEMPLO / END OF EXAMPLE -->
<!-- ───────────────────────────────────────────────────────────────────── -->

## Mensajes de commit convencionales en imperativo español

- ámbito: `git/`
- regla: los mensajes de commit siguen el formato de Conventional Commits, y la descripción breve de primer nivel DEBE estar redactada en imperativo español (por ejemplo, `feat(infra): añade ...`, `fix(skills): corrige ...`).
- por qué: unifica el historial del repositorio bajo una semántica coherente y activa.
- visto en: [skills/branch-pr/SKILL.md](../../skills/branch-pr/SKILL.md)

## Estructura de nombres de rama `<tipo>/<descripción>`

- ámbito: `git/`
- regla: las ramas se nombran usando la estructura `<tipo>/<descripción>` en minúsculas sin espacios (por ejemplo, `refactor/elimina-duplicacion`, `fix/fs-stat-swallowing`).
- por qué: permite clasificar y asociar de manera automatizada las intenciones de los cambios en integraciones CI/CD.
- visto en: [skills/branch-pr/SKILL.md](../../skills/branch-pr/SKILL.md)

## Modularización de habilidades pesadas (Límite de Tokens)

- ámbito: `skills/`
- regla: los archivos `SKILL.md` principales de cada tecnología deben mantenerse por debajo de 500 líneas / 1000 tokens. Los ejemplos detallados y guías estructurales se extraen a un archivo secundario en `references/patterns.md`.
- por qué: reduce el consumo innecesario del presupuesto de tokens en llamadas LLM recurrentes.
- visto en: [skills/stack-kotlin/](../../skills/stack-kotlin/), [skills/stack-go/](../../skills/stack-go/), [skills/stack-python/](../../skills/stack-python/), [skills/stack-vite/](../../skills/stack-vite/)
