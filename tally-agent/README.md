# Shalimar Tally read-only agent

This local worker reads a selected TallyPrime company through the private localhost XML service. It never sends Import or Execute requests and never writes back to Tally. Keep port 9000 private; configure any CRM upload separately with a scoped key after the closed-month reconciliation gate passes.

## Local use

Run the agent on the shop Windows computer with TallyPrime open and the exact `SHALIMAR FASHIONS` company selected. Configure `tallyUrl` as `http://127.0.0.1:9000/`, the reported release, and a closed period. The extractor stops when the company identity differs, XML is malformed, the response is not XML, or the response exceeds its bounded size.

The queue is bounded and stores only retry metadata and payload references. Do not put passwords, Meta tokens, or CRM keys in this folder or in logs.

## Rollback

Stop the worker, remove its local scheduled task or folder, and leave Tally's HTTP/ODBC settings unchanged. Preserve the run receipt for review. Never enable public port forwarding or branch synchronisation.
