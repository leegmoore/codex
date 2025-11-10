# Phase 4 Design – Approval Bridge & UX

## Objective
Extend the approval system to scripts so dangerous tools pause execution, display script metadata to the user, and resume cleanly once a decision is made. Capture audit records for every script run.

## Components

1. **Approval Bridge:** integrates with tool facade; when a tool requires approval, orchestrator suspends QuickJS (Asyncify), prompts user with script hash, allowed tools, truncated arguments, and awaits approval/denial. Denials throw `ScriptApprovalDeniedError` into the script.
2. **Metadata + Audit Logging:** compute script hash + normalized tool list, log decisions (approved/denied, user, timestamp) into conversation history/persistence.
3. **CLI UX:** approval prompts show script excerpt, hash, counts of tools used/remaining, and outstanding detached tasks.

## Notes
- Ensure suspension/resume works for multiple approvals within one script.
- Audit log entry should exist even if script fails later.
