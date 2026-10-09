# Task 7 report

Implemented the grounded bilingual Tally AI report layer.

- Added `buildTallyAiReport` with a typed `AiReport` contract containing summary, source period, evidence metrics, confidence/data-quality notes, recommendation evidence IDs, English/Malayalam drafts, and `needs_review`.
- Added deterministic bilingual fallback when AI is disabled, reconciliation/period/identity/consent coverage is incomplete, data contains instruction-like customer/product text, or provider output is invalid. Untrusted text is serialized as data and never treated as instructions.
- Added `POST /api/ai/tally-report`, scoped to the existing viewer guard. It returns `preview_only: true` and performs no send, approval, consent, price, or CRM write operation.
- Added `AiReportPanel` with explicit preview-only copy, review state, evidence metrics, confidence notes, and bilingual drafts.
- Added focused tests for deterministic fallback, Malayalam output, incomplete coverage, hostile text, and unsupported AI output.

Validation: `npm test -- --run src/lib/tally/ai-report.test.ts` (3 tests passed). Repository-wide typecheck remains subject to the existing baseline errors documented in Task 6.
