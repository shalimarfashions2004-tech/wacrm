# Decisions

## ADR-001 — File-backed local Company OS
- Date: 2026-10-02
- Context: The repository needs persistent context and orchestration records without claiming unavailable native sessions.
- Options: add a heavy framework; use external service; use simple version-controlled files and a small CLI.
- Chosen: version-controlled JSON/Markdown plus a Python standard-library CLI.
- Reason: reversible, inspectable, no new dependency or credentials.
- Trade-offs: session execution remains manual/platform-dependent.
- Reversal plan: remove the OS directory and CLI in a scoped commit.
- Approver: repository owner required for consequential actions.
