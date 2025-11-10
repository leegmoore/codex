# Phase 3 Manual Script

1. Run script spawning long-running exec:
   ```
   const build = tools.spawn.exec({command: ['sleep','5']});
   console.log('started', build.id);
   await tools.exec({command:['echo','done']});
   ```
2. Observe CLI summary showing one detached task. Run `cody scripts tasks` to view status.
3. In next turn, query tasks to confirm completion.
4. Press Ctrl+C during script and ensure pending tasks cancel with friendly message.
