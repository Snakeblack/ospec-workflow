# notas-api

API de notas personales con adjuntos. Cada nota pertenece a una persona, y sus
adjuntos se guardan en `<adjuntosDir>/<id de la nota>/`.

`createApp({ adjuntosDir }).handle({ method, path, user })` devuelve
`{ status, headers, body }`. El gateway autentica y pasa `user` (`{ id }`).

| Ruta | Qué hace |
| --- | --- |
| `GET /notes` | Notas del usuario |
| `GET /notes/:id/attachments` | Nombres de los adjuntos de una nota del usuario |

Pruebas: `npm test`.
