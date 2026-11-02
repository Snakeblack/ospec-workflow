---
sidebar:
  order: 3
---

# Reglas de comportamiento

> **En pocas palabras:** el instalador añade a tu herramienta unas pocas reglas que el asistente lee en cada petición: el router, que decide el flujo, y las reglas de comportamiento: parar cuando pregunta, verificar antes de dar la razón, proponer alternativas y no atribuirse los commits. Las reglas son instrucciones. Lo que de verdad no se puede saltar lo garantizan el CLI `ospec` (la evidencia) y los hooks (los bloqueos).

---

## Las reglas que se instalan

| Regla | Fichero | Qué dice |
| --- | --- | --- |
| **Router** | `rules/ospec-router.instructions.md` | Los cambios de código van a IDD, las preguntas son directas y SDD solo entra si lo pides. Ver [El router](/openwiki/idd/router.md). |
| **Comportamiento y commits** | `rules/no-model-attribution.instructions.md` | Las reglas de la sección siguiente. |
| **Memoria entre sesiones** | `rules/engram-session-memory.instructions.md` | Solo si usas Engram: qué se guarda y que el disco manda sobre la memoria. |
| **SDD** | `rules/sdd-*.instructions.md` | Solo con `--with-sdd`: las reglas comunes del modo SDD y su TDD. |

---

## Comportamiento

1. **Parar al preguntar.** Cuando el asistente te pregunta algo, se detiene y espera tu respuesta. No supone la respuesta para seguir.
2. **Verificar antes de dar la razón.** Si afirmas algo técnico, primero lo comprueba en el código o la documentación.
3. **Explicar con pruebas.** Si te equivocas, explica por qué con evidencia; si se equivocó él, lo reconoce con pruebas.
4. **Proponer alternativas** con sus pros y contras cuando las hay.
5. **Investigar antes de afirmar.** Si no está seguro de algo técnico, lo investiga antes de decirlo.

## Commits y PRs sin atribución a la IA

Un commit o una PR puede **hablar** de una herramienta (`fix(claude): …`), pero nunca **atribuirle** la autoría, en ningún idioma:

- ningún trailer `*-by:` que nombre a un modelo o una herramienta (un `Co-Authored-By:` de una persona sí vale);
- ninguna línea «generated with», «written by» o similar;
- ningún 🤖 ni insignia de herramienta.

Los mensajes siguen Conventional Commits y dicen qué cambió y por qué. **No es solo una instrucción:** el hook `PreToolUse` bloquea un `git commit` con atribución ([Guardrails](/openwiki/proteccion/guardrails.md)).

---

## Lo que no depende de las reglas

Una regla escrita se puede incumplir. Por eso lo importante no descansa en ellas:

| Garantía | Quién la impone |
| --- | --- |
| Un cambio no se cierra sin evidencia | El CLI `ospec` ([Evidencia y tests](/openwiki/idd/evidencia.md)) |
| Strict TDD, cuando está activo | La obligación `tdd-red-green` del CLI |
| Los gates se resuelven con tu respuesta | El CLI, con la valla de turnos del hook `Stop` |
| No se fuerza un push ni se borra el disco | El hook `PreToolUse` |
| El estado de IDD no se edita a mano | El hook `PreToolUse` |

---

## Cómo llegan a cada herramienta

El generador traduce cada regla al formato de la herramienta:

- **Claude Code y Codex:** el router va como bloque con marcadores en `~/.claude/CLAUDE.md` o `AGENTS.md`, junto a tu propio texto.
- **Cursor:** reglas `.mdc` con `alwaysApply: true`.
- **GitHub Copilot:** ficheros de instrucciones en `.github/instructions/`.
- **El resto:** el formato nativo de instrucciones de cada herramienta.
