# acme-invoicing

Fixture repo for the verify-FAIL-with-spec-gap golden scenario. An in-flight
change (`add-invoice-export`) already has a `verify-report.md` tagging a
CRITICAL finding with origin `spec-gap`. The live orchestrator must apply the
Failure & Blocker Routing table and dispatch to `sdd-spec`, not `sdd-apply`.
