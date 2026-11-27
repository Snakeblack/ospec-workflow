---
name: _shared
description: "Reference files that the SDD phase skills and the orchestrator read; never loaded as a skill."
disable-model-invocation: true
user-invocable: false
license: MIT AND Commons-Clause
metadata:
  author: manuel-retamozo-garcia
  version: "2.0"
---

## What it holds

The conventions, contracts and gate handlers that more than one SDD piece
needs: `sdd-phase-common.md` for every phase executor, `persistence-contract.md`
and `openspec-convention.md` for where artifacts live, and the handlers the
orchestrator reads only when their trigger fires.

## How it is used

A skill or agent names the file it needs and reads it. Nothing in this folder
runs on its own, so no request should load `_shared` as a skill.
