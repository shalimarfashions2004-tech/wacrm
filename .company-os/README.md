# Shalimar Company OS

A version-controlled operating layer for turning rough business requests into safe, evidence-backed engineering work. The OS is local and reversible: it records requests, state, task ownership, session handoffs, verification evidence, and release gates without contacting customers or production services.

## Quick start

```sh
scripts/company/company status
scripts/company/company doctor
scripts/company/company request "Add payment reminder"
scripts/company/company verify
scripts/company/company resume
```

Native persistent agent sessions are not available in this repository. Sessions are represented by registry records, branches/worktrees, checkpoints, and handoffs; `company resume` creates successor records when a prior session cannot be resumed.
