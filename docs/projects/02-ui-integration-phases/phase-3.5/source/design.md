# Phase 3.5 (Optional): Gemini Support

**Goal:** Add Google Gemini client support (streaming + grounding) as an optional provider that can be enabled once Gemini 3.0 is available. Mirrors existing provider flow while using `@google/generative-ai` SDK.

---

## API Client

```typescript
import {GoogleGenerativeAI, GenerativeModel} from '@google/generative-ai';

class GeminiClient implements ModelClient {
  private model: GenerativeModel;

  constructor(private params: {model: string; apiKey: string; grounding?: boolean}) {
    const genAI = new GoogleGenerativeAI(params.apiKey);
    this.model = genAI.getGenerativeModel({model: params.model});
  }

  async sendMessage(request: ModelRequest): Promise<ModelResponse> {
    const {messages} = request;
    const response = await this.model.generateContent({
      contents: convertToGemini(messages),
      tools: this.params.grounding ? [{googleSearch: {}}] : undefined,
      generationConfig: {temperature: request.temperature, topP: request.topP}
    });
    return convertFromGemini(response);
  }
}
```

Need adapters `convertToGemini` / `convertFromGemini` similar to Messages adapter.

---

## Provider Configuration

Config addition:
```toml
[provider]
name = "gemini"
api = "generateContent"
model = "gemini-2.5-pro"

[auth]
gemini_api_key = "..."
```

CLI `set-provider gemini --api generateContent --model gemini-2.5-pro`.

---

## Grounding Toggle

Allow user flag `--grounding` to enable Google Search grounding (cost $35/1k prompts). Config entry `[gemini] grounding = true`.

---

## Auth

`AuthManager.getToken('gemini')` returns API key from config/env. Add validation.

---

## Testing Strategy

- Mock `@google/generative-ai` module returning stub responses.
- Verify factory selects GeminiClient when provider=gemini.
- Ensure ResponseItems parity with other providers.

---

## Manual Enablement Notes

Only wire this phase when Gemini 3.x stable. Document toggle in README.
