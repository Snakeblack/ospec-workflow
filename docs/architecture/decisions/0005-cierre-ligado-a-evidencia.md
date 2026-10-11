# 0005. Un cambio cierra solo con evidencia observada

- Status: accepted
- Date: 2026-10-11
- Evidence: scripts/lib/idd-close.js:4, skills/idd/SKILL.md:27

## Context and drivers
Un modelo puede afirmar que los tests pasan sin haberlos ejecutado. La única prueba fiable es una ejecución que el propio harness observa. Drivers: `constraint:untrusted-model-output` y `scenario:deterministic-resume`.

## Options considered
1. Evidencia que el CLI registra de una ejecución que él mismo lanza: no se puede falsificar desde la conversación; cada obligación necesita su orden.
2. Declaración del agente: barato; no prueba nada.
3. Revisión humana de cada cierre: fiable; no escala a un mantenedor.

## Decision
Una obligación se satisface solo con evidencia que el CLI registra al observar una ejecución, un check o una revisión. El cierre se niega mientras quede una obligación pendiente o un gate abierto.

## Consequences
"Hecho" significa lo mismo en cualquier sesión. Un check que no se puede ejecutar bloquea el cierre hasta configurarlo. Retirar una obligación exige que ninguna señal activa la derive.

## Fitness function
`scripts/lib/idd-close.test.js` comprueba que `ospec close` se niega con una obligación pendiente o un gate abierto.

## Review trigger
Una obligación cuya evidencia no pueda producirse en la máquina del usuario.
