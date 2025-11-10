# Phase 1 Manual Test Script

1. Start CLI (`npm run build && cody new`).
2. Paste prompt containing script:
   ```
   <tool-calls>
   const result = await tools.exec({command: ['pwd']});
   console.log('pwd:', result.stdout.trim());
   </tool-calls>
   ```
3. Expect banner + console output, followed by assistant message summarizing result.
4. Paste script with banned token (`require('fs')`) → CLI shows parser error.
5. Paste two scripts in one turn → both execute sequentially.
6. Induce runtime error (`throw new Error('oops')`) → CLI displays ScriptRuntimeError with snippet.
