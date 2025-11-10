# Phase 4 Test Conditions

1. Approval flow: tool requiring approval pauses script, prompt displayed, approval resumes execution, result returned.
2. Denial flow: denial prevents tool execution and script receives `ScriptApprovalDeniedError`.
3. Multiple approvals in one script succeed without deadlocks.
4. Audit log written with hash, tool list, decisions (inspect persistence/mock logger).
5. CLI prompt renders snippet/hash/tool info as designed.
