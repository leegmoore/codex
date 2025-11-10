# Phase 1 Test Conditions

1. **Detector finds single block** – assistant message with one `<tool-calls>` block returns ScriptBlock array length 1 with correct code.
2. **Detector ignores user/tool items** – ensure no false positives.
3. **Parser rejects banned token** – script containing `require('fs')` throws error with helpful message.
4. **Parser wraps top-level await** – script `const x = await tools.readFile(...)` compiles and runs.
5. **QuickJS executes script** – integration test: script runs `await tools.exec({command:['pwd']})`, result captured as FunctionCallOutput.
6. **Runtime error trimmed** – script `throw new Error('boom')` shows trimmed stack (no QuickJS internals).
7. **CLI banner/log output** – simulated ResponseItems produce ANSI log lines containing hash + snippet.
