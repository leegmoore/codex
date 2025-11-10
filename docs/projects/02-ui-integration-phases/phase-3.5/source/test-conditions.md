# Phase 3.5 Test Conditions

1. **Factory Selects GeminiClient** – provider=gemini yields GeminiClient instance.
2. **sendMessage Converts History** – ensure convertToGemini called with correct contents.
3. **Grounding Flag** – when config.gemini.grounding = true, request includes `tools: [{googleSearch:{}}]`.
4. **Response Conversion** – convertFromGemini maps Gemini candidates to ResponseItems.
5. **Missing API Key** – errors clearly instruct user to set GCP key.
