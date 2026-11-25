# 0013. Una ejecución automática autorizada solo responde los hechos abiertos

- Status: accepted
- Date: 2026-11-25
- Evidence: scripts/lib/idd-contract.js:74, scripts/lib/idd-record.js:448

## Context and drivers
El principio 8 del roadmap admite aprobaciones solo desde respuestas explícitas del usuario, y un gate solo aceptaba las fuentes `user` y `user-unverified`. Un modo automático que encadena cambios sin el usuario delante solo podría parar en cada gate o registrar como del usuario una respuesta que no dio, que es lo que la valla de turnos vino a marcar. Driver: `constraint:untrusted-model-output`.

## Options considered
1. Una fuente `delegated` que registra el conductor de una ejecución que el usuario autorizó, con la recomendación que el modelo dejó para cada pregunta y solo en los gates delegables: el modelo nunca se aprueba a sí mismo y la regla vive en el CLI; quién fija la marca de la ejecución sigue sin poder verificarse.
2. Que la sesión elija sola la respuesta recomendada: no hace falta conductor; el modelo se aprueba a sí mismo en el mismo turno.
3. Un segundo agente que decide las respuestas: separa el juicio de quien construye; añade coste y otro juicio de modelo.
4. Parar en cada gate: ninguna garantía cambia; el modo automático no avanza.

## Decision
Enmienda el principio 8 del roadmap. La autorización explícita de una ejecución automática cuenta como respuesta del usuario solo para el gate `open-facts`. La respuesta se registra con la fuente `delegated` y el id de la ejecución, la escribe el CLI con la recomendación que el modelo dejó para cada pregunta y exige que haya terminado un turno desde que se abrió el gate. El conductor pone el id en `OSPEC_AUTO_RUN` solo en el entorno de su propia llamada a ospec que registra la respuesta, nunca en el de la sesión donde trabaja el modelo, así que el modelo nunca tiene la marca. El CLI rechaza la respuesta delegada fuera de una ejecución, si a una pregunta le falta recomendación, en cualquier otro gate, en la intención ambigua y en la retracción de una señal. `status`, `close` y el registro del cambio nombran cada respuesta delegada con su ejecución.

## Consequences
Una ejecución automática avanza sola por los hechos abiertos y para en el resto de gates hasta que el usuario responde. El estado crece sin un esquema nuevo y la versión anterior lo sigue leyendo. Abrir otro gate a la delegación pide revisar esta decisión. El CLI no puede verificar quién fija la marca de la ejecución, igual que no verifica una respuesta `user`.

## Fitness function
Los tests de los reductores rechazan una respuesta delegada fuera de una ejecución, en cada gate salvo `open-facts`, sin recomendación en todas las preguntas y sin un turno terminado.
- Check: `node --test scripts/lib/idd-record.test.js`

## Review trigger
Una ejecución automática que necesite resolver sola otro gate, o un host que permita verificar quién responde.
