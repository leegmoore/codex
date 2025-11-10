# Phase 3.5 Manual Steps (when Gemini enabled)

1. Obtain Gemini API key (`GEMINI_API_KEY`).
2. `cody set-provider gemini --api generateContent --model gemini-2.5-pro`
3. `cody chat "Summarize today's plan"`
4. Toggle grounding: `cody config set gemini.grounding true` (or edit config), re-run chat, ensure response cites sources.
