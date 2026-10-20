# ospec-workflow en 10 minutos — para el dev que llega a un repo con ospec

**La pregunta que respondes aquí: ¿qué comandos me importan?**

## Tu día a día: pides el cambio, el agente lo lleva

No necesitas memorizar comandos. Pides el cambio en lenguaje natural ("añade X", "arregla Y") y el agente lo lleva con IDD (impact-driven development), que es el flujo por defecto. Las preguntas y la lectura de código van directas, sin abrir ningún change.

Mientras trabaja, el agente usa el CLI `ospec` y te pregunta solo lo necesario:

- **Hechos abiertos**: comportamientos que ni tu petición ni el código resuelven (errores, valores vacíos, redondeos, quién puede hacerlo). Llegan en un solo lote, antes de editar nada.
- **Gates**: se detiene solo en cinco casos: intención ambigua, hechos abiertos, cambio que enmienda o contradice una ADR, operación irreversible (borrar datos, reescribir historia publicada) y revisiones de confianza agotadas (tu respuesta autoriza una más). La primera vez que el proyecto necesita un comando de tests, también te pide aprobarlo. Ningún otro punto bloquea.

Un gate solo se resuelve con tu respuesta explícita.

## Qué mirar cuando quieras saber dónde está

| Qué buscas | Dónde |
|---|---|
| Changes abiertos, obligaciones pendientes y gates abiertos | `ospec status` |
| El siguiente paso de un change | `ospec next --change <id>` |
| El plan, las decisiones y la evidencia de un change | `idd/<change>/change.md` (existe cuando el cambio tiene varias unidades de trabajo o una decisión de diseño) |
| Changes ya cerrados | `idd/archive/` |

## Qué cuenta como hecho

Un cambio está hecho solo cuando `ospec close` tiene éxito. Decir "los tests pasan" no cuenta: solo vale la evidencia que el CLI ha visto ejecutarse sobre el árbol actual. `ospec close` archiva el change en `idd/archive/` y deja el árbol como está. Las ramas, los commits y las PR siguen siendo decisión tuya.

Antes del primer cambio, el proyecto necesita en `idd/config.yaml` al menos un comando en `checks:` (por ejemplo `test: npm test`). Sin él, ningún change puede cerrar, y el agente te lo propondrá para que lo apruebes.

## Reglas de commit que te van a rebotar

- **Atribución a IA: prohibida en todos los modos.** El hook `commit-msg` y el guard de herramientas rechazan `*-by:` con una IA, «generated with/by …» y 🤖 en commits y PR. Nombrar un agente sí está permitido (`fix(claude): …`), y un `Co-Authored-By` humano también.
- **Trailers `Ospec-Change` / `Ospec-Task`: solo en modo SDD.** Con un change SDD activo en `openspec/changes/`, el hook de commit solo avisa por defecto; con `traceability: trailers: required` en `openspec/config.yaml`, bloquea el commit que no los traiga. Con IDD no se piden.

## Si tu equipo usa el modo SDD (opcional)

SDD no se instala por defecto (`--with-sdd`) y solo entra con un comando `/sdd-*` o con una petición explícita ("hazme un SDD para X"). Los comandos reales son:

- `/sdd-new [nombre-cambio] <petición>`: un change persistido nuevo, con su ciclo completo.
- `/sdd-ff`: planificación rápida (propuesta, specs, diseño y tareas de una vez).
- `/sdd-lite`: solo para cambios triviales o pequeños.
- `/sdd-continue`: retomar la siguiente fase lista.
- `/sdd-verify` y `/sdd-archive`: verificar y archivar un change.

Hay además comandos sueltos por fase (`/sdd-propose`, `/sdd-spec`, `/sdd-design`, `/sdd-tasks`, `/sdd-apply`) y de utilidad (`/sdd-init`, `/sdd-explore`). El estado de un change SDD está en `openspec/changes/<change>/` (`state.yaml` y sus artefactos).
