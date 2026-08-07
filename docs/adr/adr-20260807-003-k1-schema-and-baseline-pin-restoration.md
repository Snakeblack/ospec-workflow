# ADR-003: K1 v1 File And Pin Restore From 02e97a5

- Status: proposed
- Change: k3-identities-boundary-closure
- Date: 2026-08-07

## Context
Post-K3 edits drifted `candidate/v1.schema.json` and `work-order/v1.schema.json`. Pins in `K1_SCHEMA_BASELINE` were retargeted to match drifted digests (`7cf47e0a…` / `33cf07ac…`), while `02e97a5` pins remain `752c7a70…` / `a8204e0f…`.

## Decision
Restore both v1 schema file contents from commit `02e97a5b49aa06e38c493d0221b2bda6ed3e062e` and restore those two pin entries to the `02e97a5`-era digests. Never retarget pins alone to drifted files. Do not wholesale restore unrelated K1 artifacts from that commit.

## Alternatives
- Pin-only retarget — rejected; verify would falsely claim intact baseline.
- Restore entire `schemas/kernel` from `02e97a5` — rejected; would wipe legitimate K2/K2a/K3 additive families.

## Consequences
v1 identity schemas become historically accurate again. K3 freeze fields remain on Candidate v2 only. Manifest/claims pin updates for v2 registration are a separate intentional content change.
