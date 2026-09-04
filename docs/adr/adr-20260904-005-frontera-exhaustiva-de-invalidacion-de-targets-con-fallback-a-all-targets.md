# ADR-001: Frontera exhaustiva de invalidación de targets con fallback a ALL_TARGETS

- Status: proposed
- Change: precommit-invalidation-and-failclosed
- Date: 2026-09-04

## Context
La función `findAffectedTargets` solo invalidaba `ALL_TARGETS` ante cambios en un subconjunto de scripts de configuración y perfiles. Modificaciones en fuentes canónicas (`agents/**`, `skills/**`, `rules/**`, etc.), helpers compartidos (`frontmatter.js`, `model-resolver.js`) o hooks de runtime (`scripts/hooks/**`) no disparaban la regeneración diferencial de targets, provocando artefactos desactualizados en `dist/`.

## Decision
Ampliar la frontera de detección de `findAffectedTargets` para que cualquier cambio staged en:
1. Entradas canónicas del generador: `agents/**`, `commands/**`, `rules/**`, `skills/**`, `hooks/**`, `schemas/kernel/**`, `.mcp.json`, `.claude-plugin/plugin.json`, `models.yaml`.
2. Implementación de generadores y helpers: `scripts/configure/{cli,install-engine,install-target,validate-phase}.js`, `scripts/lib/{target-transform,frontmatter,model-resolver}.js`, `scripts/lib/target-profiles/**`.
3. Hooks distribuidos de runtime: `scripts/hooks/**`.
fuerce de manera conservadora el retorno de la lista completa `ALL_TARGETS` (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`, `antigravity`). Solo los cambios estrictamente confinados a instaladores/validadores específicos de un target retornarán dicho target aislado.

## Alternatives
- Invalidation granular por target basada en dependencias individuales: rechazada por fragilidad, alta complejidad estática y riesgo de falsos negativos que dejen distribuciones rotas.
- Re-generar siempre todos los targets en cualquier commit: rechazada por degradar severamente la latencia del hook pre-commit en commits triviales (docs, markdown, fixes aislados).

## Consequences
- Facilidad: Garantiza paridad estricta entre fuentes canónicas y artefactos compilados en `dist/` en todo commit.
- Sobrecarga: Modificaciones en skills, prompts o agentes compilarán los 7 targets en el hook, lo cual toma ~1-2 segundos pero es el comportamiento de seguridad intencionado.
- Reversibilidad: Alta; modificar los arreglos de prefijos y rutas en `staged-validator.js`.
