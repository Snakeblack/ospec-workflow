# acme-payments

A small payments-adjacent service. Fixture repo for the high-risk
classification golden scenario: the request explicitly touches payment
processing, so the orchestrator must classify it `high-risk` and resolve a
route whose gates include `clarify`.
