# trust-review-receipts

## Intent and acceptance

Follow-ups de E1.33: recibo del hook SubagentStop para review-trust y review-correction, y la misma exigencia de digest y citas en ospec review validate

Acceptance: review validate rechaza un resultado sin el request_digest de la corrección o sin citas reales; con un recibo SubagentStop del digest, record y validate registran attestation subagent-stop; sin recibo registran relayed con un aviso y no bloquean

## Plan

1. `review validate` con la misma exigencia que `review record`: `review correct` (y `review start` mientras espera la validación) devuelve una petición con `request_digest` propio (linaje, generación, árbol corregido, rutas corregidas e IDs) y `result_contract`; `validate` exige ese digest y `reviewed` con citas de cada ruta corregida en el árbol corregido (`scripts/lib/idd-review.js`, `scripts/ospec.js`).
2. Recibo `SubagentStop` (paso 2 de #351): `scripts/lib/review-receipt.js` compartido por el hook y el CLI; el hook escribe `.ospec/review-receipts/<hex>.json` con el digest canónico del resultado de `review-trust` o `review-correction`; `record` y `validate` lo leen: coincide → `attestation: subagent-stop` con el recibo en la evidencia; no coincide → `review-refused`; sin recibo → `relayed` y aviso. `idd-contract.js` acepta la nueva atestación.
3. Specs (REQ-idd-016, REQ-hooks-027 nuevo), onboarding del revisor y estado de E1.33 en el roadmap.

## Decisions

- Respuestas del usuario a los open facts: validate con digest y citas; un resultado distinto del recibo se rechaza; el recibo vive en `.ospec/` (ignorado por git) y se conserva; no hay regla PreToolUse nueva: se documenta que el recibo no es prueba; el aviso sin recibo sale siempre; un solo cambio, una release y el estado de E1.33.
- El hook solo lee `agent_transcript_path` (o un campo de resultado de la entrada): en Claude Code `transcript_path` es la sesión principal, cuyo texto escribe el agente principal.
- Cuenta solo el último mensaje del asistente, y solo un objeto con `request_digest` y la lista del revisor (`findings` u `outcomes`): la petición que recibe el revisor también lleva el digest, pero no esa lista.
- La evidencia aprobada lleva la atestación del resultado que la aprueba (`record` o `validate`); el linaje no guarda la del resultado anterior.
- Hallazgo WARNING de la trust review 1 (el usuario pidió arreglarlo aquí): en un proyecto que no ignora `.ospec/`, el recibo era una ruta cambiada y hacía que `review correct` rechazara una corrección válida. `idd-workspace.js` deja `.ospec/review-receipts/` fuera del diff, del snapshot y de la huella del árbol, igual que `idd/`. La SUGGESTION (un segundo stop sobrescribe el recibo y no se ve el relanzamiento) queda como follow-up.
- Solo el hook Node escribe recibos; Claude Code y Codex ya enrutan `SubagentStop` a Node (REQ-hooks-019). En hosts con el binario nativo el resultado queda `relayed`.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-20T23:44:21.691Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-10-20T23:44:21.691Z)
- ev-3: check-run for checks-pass (2026-10-20T23:45:30.693Z)
- ev-4: contract-spec-and-test for contract-spec-and-test (2026-10-20T23:45:30.693Z)
- ev-5: migration-test for migration-compat-and-test (2026-10-20T23:45:49.380Z)
- ev-6: check-run for checks-pass (2026-10-20T23:47:08.744Z)
- ev-7: contract-spec-and-test for contract-spec-and-test (2026-10-20T23:47:08.744Z)
- ev-8: adr-impact-declaration for adr-impact-declaration (2026-10-20T23:47:08.744Z)
- ev-9: frozen-review for trust-review (2026-10-20T23:50:13.206Z, relayed)
- ev-10: check-run for checks-pass (2026-10-21T00:01:50.658Z)
- ev-11: contract-spec-and-test for contract-spec-and-test (2026-10-21T00:01:50.658Z)
- ev-12: adr-impact-declaration for adr-impact-declaration (2026-10-21T00:01:50.658Z)
- ev-13: migration-test for migration-compat-and-test (2026-10-21T00:02:56.821Z)
- ev-14: check-run for checks-pass (2026-10-21T00:03:58.499Z)
- ev-15: contract-spec-and-test for contract-spec-and-test (2026-10-21T00:03:58.499Z)
- ev-16: adr-impact-declaration for adr-impact-declaration (2026-10-21T00:03:58.499Z)
- ev-17: frozen-review for trust-review (2026-10-21T00:06:45.372Z, relayed)
- ev-18: living-doc-current for living-doc (2026-10-21T00:06:50.352Z)
<!-- ospec:evidence:end -->
