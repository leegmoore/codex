# Codex TypeScript: Product Vision & Innovations

**Version:** 1.0
**Date:** November 7, 2025
**Status:** Active Development

---

## Executive Summary

The Codex TypeScript port transforms the Rust-based Codex agent into a pure TypeScript library (`@openai/codex-core`) while introducing groundbreaking innovations in memory management, tool orchestration, and multi-provider LLM integration. The result is an agent framework that enables models to perform 2-5x above their baseline capabilities through intelligent context management, cognitive scaffolding, and compositional tool execution.

**Key Differentiators:**
- **Script-based tool calling:** Models write TypeScript to orchestrate tools (vs structured JSON)
- **Compression gradient memory:** Infinite conversation history via multi-tier compression
- **Multi-provider optimization:** Unified interface maximizing each API's native capabilities
- **Intelligent context injection:** Dynamic memory retrieval with nano-agent filtering

**Target Impact:**
- Lower-tier models (Haiku, Flash, Nano): 3-5x performance boost
- Mid-tier models (GPT-4o, Sonnet): 2-3x performance boost
- Top-tier models (GPT-5, Opus): 1.5-2x performance boost

**Market Position:** First agent framework with infinite memory via compression gradients and script-based tool composition.

---

## The Rust Port: Faithful Foundation with Strategic Innovations

### Port Philosophy

The TypeScript port maintains high fidelity to the Rust implementation's core architecture while introducing targeted innovations at integration points. We port modules faithfully, then enhance at boundaries where new capabilities can be added without disrupting the proven Rust patterns.

**Rust Codebase Structure:**
- ~40 workspace modules
- Protocol layer (types, events, operations)
- Core engine (configuration, conversation management, persistence)
- Execution layer (command running, file operations, sandboxing)
- Client layer (multi-provider LLM communication)
- Tool system (built-in tools + MCP integration)

### Port Process

**Phase-by-phase approach:**

**Phases 1-3: Faithful Port**
- Protocol types (283 tests) - Direct Rust→TS translation
- Configuration & persistence (87 tests) - Faithful to TOML/JSONL formats
- Execution & tools (163 tests) - Core tool implementations

**Phase 4: Multi-Provider Client Enhancement**
- Port OpenAI Responses + Chat APIs (114 tests)
- **INNOVATION:** Add Anthropic Messages API as third provider
- Unified ResponseStream interface across all APIs

**Phases 4.4-4.7: Tool System Innovations**
- **INNOVATION:** Script-based tool harness (QuickJS sandbox)
- **INNOVATION:** Additional tools from previous port + new tools
- **INNOVATION:** Tool pack system for configurable tool sets
- **INNOVATION:** Web search, document caching, agent orchestration tools

**Phase 5+: Core Integration with Memory Innovations**
- Conversation management (faithful)
- **INNOVATION:** Multi-strategy history system (regular, one-shot, gradient)
- **INNOVATION:** Compression gradient memory
- **INNOVATION:** Dynamic context injection

### Innovation Integration Points

**Where innovations attach:**

1. **Client layer:** Messages API integrates via WireApi enum extension
2. **Response processing:** Script detection before tool routing
3. **History retrieval:** Strategy pattern allows swappable history modes
4. **Context assembly:** Injection points for announcement board, reference layers
5. **Tool execution:** Sandbox wraps existing tool implementations

**Design principle:** Innovations are additive, not replacements. The Rust foundation remains intact.

---

## Innovation 1: Multi-Provider Client with Messages API

### Overview

Extend the Rust client's provider abstraction to support three LLM APIs with a unified streaming interface, while allowing each API to leverage its native capabilities.

### Architecture

**Provider Abstraction:**
```typescript
enum WireApi {
  Responses,  // OpenAI Responses API (semantic streaming)
  Chat,       // OpenAI Chat Completions (delta streaming)
  Messages,   // Anthropic Messages API (content blocks)
}
```

**Each API:**
- Uses native request format
- Leverages provider-specific features
- Normalizes to common ResponseEvent stream
- Supports native tool calling formats

**Key Components:**
- Streaming adapters (convert provider events → ResponseEvent)
- Tool format converters (internal ToolSpec → API-specific schema)
- Authentication abstraction (API keys, OAuth per provider)

**Impact:**
- Users choose best model for task (GPT-5, Claude, o1)
- Single codebase supports all providers
- Each API performs optimally (no lowest-common-denominator)

**Status:** Complete (Phase 4.1-4.3)

---

## Innovation 2: Script-Based Tool Calling

### Overview

Instead of structured JSON tool calls, models write TypeScript code in `<tool-calls>` blocks that execute in a sandboxed QuickJS runtime. This enables unprecedented tool composition, conditional logic, and error handling.

### The Problem with Structured Calls

**Traditional approach:**
```
Turn 1: Model → "search for tests"
Turn 2: Tool → [10 files]
Turn 3: Model → "run test on file1"
Turn 4: Tool → [output]
Turn 5: Model → "apply patch"
Turn 6: Tool → [done]
```

**Issues:**
- 6 turns for simple workflow
- Original context pushed down
- Model loses coherence
- Token waste on repetition

### The Script Solution

**New approach:**
```xml
<tool-calls>
const tests = await tools.fileSearch({pattern: "*.test.ts"});
const results = await Promise.all(
  tests.map(t => tools.exec({command: ["npm", "test", t.path]}))
);
const failed = results.filter(r => r.exitCode !== 0);
if (failed.length > 0) {
  await tools.applyPatch({patch: generateFix(failed)});
}
return {fixed: failed.length};
</tool-calls>
```

**Benefits:**
- ✅ ONE turn for complex workflow
- ✅ Parallel execution (Promise.all)
- ✅ Conditional logic (if/then/else)
- ✅ Error handling (try/catch)
- ✅ Composition (use results from one tool in next)
- ✅ Custom return shapes

### Architecture

**Components:**
- **Detector:** Scans ResponseItems for `<tool-calls>` blocks
- **Parser:** Validates TypeScript, extracts code
- **QuickJS Runtime:** Sandboxed execution (worker threads)
- **Tool Facade:** Exposes tools to sandbox with validation
- **Approval Bridge:** Pauses scripts for user approval (Asyncify)
- **Promise Tracker:** Manages async lifecycle, cancels orphaned promises

**Security:**
- WASM sandbox isolation
- Frozen intrinsics (Object, Function, Promise)
- No Node.js API access
- Resource limits (30s timeout, 96MB memory)
- Tool-level approvals maintained

**Performance:**
- Worker pool (reuse contexts)
- Script caching (by hash)
- Compilation caching (TS→JS)
- <100ms overhead target

**Tools Available:**
- File operations (readFile, listDir, grepFiles, applyPatch)
- Execution (exec with sandboxing)
- Search (fileSearch, webSearch, fetchUrl)
- Planning (updatePlan)
- MCP integration (dynamic tools from servers)
- Agent orchestration (llm.chat, launch.sync, launch.async)

**Impact:**
- Models compose complex workflows in single turn
- Tool calling errors reduced (TypeScript vs JSON)
- Coherence maintained (context not fragmented)
- Enables meta-orchestration (agents spawning agents)

**Status:** Complete (Phase 4.4-4.5)

---

## Innovation 3: Enhanced Tool Set

### Overview

Beyond the core Rust tools, we've added capabilities for web search, document management, and agent orchestration.

### Additional Tools

**From Previous Port:**
- readFile (indentation-aware file reading)
- listDir (recursive directory listing)
- grepFiles (ripgrep content search)
- applyPatch (full tree-sitter bash parsing - enhanced version)

**New Web Tools:**
- webSearch (Perplexity API - ranked SERP results)
- fetchUrl (Firecrawl scraping with caching)

**Document Management (stub interfaces):**
- saveToFC (File Cabinet - 30 day storage)
- fetchFromFC (retrieve by fileKey)
- writeFile (zero-token transfer via fileKey)

**Prompt Tools (stub interfaces):**
- prompts.save (cache prompt arrays, return keys)
- prompts.get (retrieve by keys)

**Agent Orchestration (stub interfaces):**
- agents.llm.chat (single-shot LLM calls with cached prompts)
- agents.launch.sync (synchronous agent execution)
- agents.launch.async (background agents, return fileKeys)

**Tool Pack System:**
- Named collections (core-codex, anthropic-standard, file-ops, research)
- Easy configuration per provider/scenario
- Extensible (custom packs supported)

**Total:** 20+ tools (11 full, 9 stubbed interfaces)

**Status:** Phase 4.5-4.7 (ongoing)

---

## Innovation 4: Compression Gradient Memory System

### Overview

Multi-tier compression with intelligent gradient selection enables infinite conversation history within fixed token budgets. Models access millions of tokens of history through automatic fidelity management and on-demand detail retrieval.

### Compression Tiers

**For each turn, 4 versions created:**

**Raw (R):** Complete, unmodified
- All messages as-is
- Full tool calls with arguments and outputs
- All reasoning and thinking blocks
- ~100% of original tokens

**Smoothed (S):** Normalized, cleaned
- Grammar/spelling corrected
- Casing normalized
- Whitespace cleaned
- Noise removed (repetition, obvious filler)
- Tool calls: Medium compression (params summarized)
- ~60% of original tokens

**Compressed (C):** LLM-summarized
- Key points preserved
- Actions and results captured
- Tool calls: "{tool X called, Y happened}"
- ~30-40% of original tokens

**Tiny (T):** Ultra-compressed
- Single sentence summary
- Tool calls: omitted or "{3 tools called}"
- ~1-5% of original tokens

### Gradient Bands

**Token budget allocation by recency:**

**Example: 100k token budget, 200 turns of history**

| Turns | Fidelity | Tokens/Turn | Total Tokens | Band % |
|-------|----------|-------------|--------------|--------|
| 181-200 (recent 20) | Raw (R) | 2000 | 40k | 40% |
| 161-180 (20 turns) | Smoothed (S) | 800 | 16k | 16% |
| 101-160 (60 turns) | Compressed (C) | 500 | 30k | 30% |
| 1-100 (100 turns) | Tiny (T) | 140 | 14k | 14% |
| **Total** | **200 turns** | **Mixed** | **100k** | **100%** |

**With this gradient:**
- Recent context: Full detail (last 20 turns)
- Working context: Clean version (turns 21-40)
- Background context: Compressed (turns 41-160)
- Deep history: Tiny summaries (turns 1-100)

**Actual history span:** Millions of raw tokens compressed into 100k budget.

### Turn Tagging

**Each turn wrapped in XML:**
```xml
<T-183-R>
I analyzed the authentication module and found 3 security issues...
[full content]
</T-183-R>
```

**Compressed blocks:**
```xml
<T-50-through-100-C>
Turn 50: Implemented OAuth flow. Turn 51: Fixed validation bug...
</T-50-through-100-C>
```

**Tag encoding:**
- `T-183` = Turn ID
- `-R` = Raw level
- `-S` = Smoothed
- `-C` = Compressed
- `-T` = Tiny

**Model awareness:**
- System prompt explains compression levels
- Can reference turn IDs in tool calls
- Understands fidelity trade-offs

### Fidelity Retrieval Tool

**tools.history.getTurn(turnId, level)**
```typescript
// Model requests detail for old turn
const detail = await tools.history.getTurn("T-50", "S");
// Returns smoothed version of turn 50
// Added to announcement board (5 turn TTL)
```

**Use cases:**
- "That fix from turn 50 - what were the exact steps?" → retrieve R
- "Earlier OAuth discussion - give me clean version" → retrieve S
- Model sees compressed mention, wants detail

### Processing Pipeline

**After each turn:**
1. Store raw turn
2. Async: Kick off compression jobs (parallel)
   - Smooth version (algorithmic + small model)
   - Compressed version (LLM summarization)
   - Tiny version (ultra-compression LLM)
3. Process completes in 1-2 seconds (or continues async)
4. All versions stored

**Every 10 turns:**
- Recalculate gradient bands
- Adjust % allocations if history grows
- Minimize cache invalidation (only shift boundaries)

**On retrieval:**
- Select turns per current gradient
- Wrap in appropriate tags
- Assemble into cohesive history block

### Estimated Capacity

**100k token budget:**
- ~200 turns with gradient selection
- Representing ~400k raw tokens (4x compression)

**200k token budget:**
- ~400-500 turns
- Representing ~1-2M raw tokens

**With aggressive compression:**
- Tens of millions of raw tokens accessible
- Limited only by storage, not context window

**Status:** Design complete, implementation planned for Phase 7

---

## Innovation 5: Offline Memory Processing

### Overview

Background batch agents with large context windows (1-2M tokens) process compressed conversation history to extract knowledge, identify patterns, and prepare reference materials. Running twice daily at half-price batch rates.

### Offline Agent Responsibilities

**Input:**
- Compressed history (C/T levels for all turns)
- Smoothed recent (last 10-20 turns)
- Existing knowledge base

**Processing:**
1. **Topic Extraction**
   - Identify conversation themes
   - Tag with keywords
   - Assign topic weights (adjusted over time)

2. **Categorization**
   - Group related discussions
   - Identify project areas (auth, UI, API, etc.)
   - Track evolution over time

3. **Wisdom Distillation**
   - Extract lessons learned
   - Identify patterns (what worked, what didn't)
   - Document solutions to recurring problems
   - Tag by topic and context

4. **Knowledge Consolidation**
   - User preferences discovered
   - Design patterns identified
   - Project-specific conventions
   - Technology stack understanding

5. **Reference Layer Recommendations**
   - Identify needed documentation (500-5000 token chunks)
   - Suggest technology references
   - Recommend pattern libraries
   - Flag gaps in knowledge base

**Output:**
- **Lessons Store:** Tagged, searchable distilled learnings
- **Topic Weights:** Dynamic importance by conversation evolution
- **Reference Layers:** Prepared documentation chunks
- **Admin Notifications:** Recommendations for curation

### Lessons Store

**Structure:**
```typescript
{
  lessonId: string;
  topic: string[];           // ["authentication", "security"]
  keywords: string[];        // ["OAuth", "token", "validation"]
  content: string;           // 200-2000 tokens
  sourceturns: string[];     // Where it came from
  weight: number;            // Relevance score (0-1)
  lastUpdated: timestamp;
}
```

**Retrieval:**
- Keyword match
- Topic filtering
- Weight-based ranking
- Injected into context when relevant

### Reference Layers

**Pre-compiled knowledge chunks:**
- Technology-specific (TypeScript patterns, React hooks, etc.)
- Project-specific (architecture decisions, coding standards)
- Domain-specific (auth patterns, API design)

**Size:** 500-5000 tokens per layer

**Management:**
- Offline agents identify needs
- Offline agents assemble content
- Admin approves/curates
- Stored with topic tags and keywords
- Injected dynamically per conversation context

### Tuning & Maintenance

**Offline agents also:**
- Rebuild search indexes (keyword, vector)
- Prune outdated knowledge
- Merge similar lessons
- Update topic weights based on project evolution
- Optimize reference layer coverage

**Frequency:** 2x daily (batch mode, half-price)

**Status:** Design complete, implementation planned for Phase 8

---

## Innovation 6: Runtime Turn Preprocessing

### Overview

Before each turn executes, a parallel pipeline of searches and nano-agents gathers potentially relevant context, which a small judgment model filters and injects into the final prompt.

### Processing Pipeline (1 Second Budget)

**Triggered:** New turn arrives from user

**Parallel Execution:**

**1. Keyword Search (100ms)**
- Search compressed history for term matches
- Search lessons store
- Search reference layers
- Returns: 20-30 candidates

**2. Vector Semantic Search (200ms)**
- Embedding-based similarity search
- Against compressed history
- Against knowledge base
- Returns: 20-30 candidates

**3. Nano Agent Swarm (500ms)**
- Launch N small agents (flash 2.0, haiku 4.5)
- Each reviews a subset of candidates
- Filter: Keep possibly relevant, discard obviously irrelevant
- Returns: 10-20 filtered items (from ~50 candidates)

**4. Timeout at 1 Second**
- Gather all results collected so far
- Some searches may not complete (acceptable)
- Move to judgment phase

**5. Final Judgment Model (200ms)**
- Small fast model (gpt-5-nano or flash 2.0)
- Reviews: latest turn + compressed history + search results
- Decides:
  - Which reference layers to inject
  - Which memory ticklers to add
  - Which lessons to surface
  - Format and placement

**Total: ~1.2 seconds** (overlaps with other turn processing)

### Injection Strategy

**Memory Ticklers:**
```
💭 This reminds me of:
- Turn 87 (3 weeks ago): Similar auth issue, resolved via X
  Use: tools.history.getTurn("T-87", "S") to retrieve
```

**Reference Layers:**
```
📚 Relevant References:
- OAuth Implementation Patterns (2.3k tokens)
- TypeScript Error Handling Best Practices (1.8k tokens)
```

**Distilled Lessons:**
```
💡 Learned Patterns:
- Validation errors: Always check input sanitization first
- Token refresh: Use exponential backoff (see Turn 45)
```

### Injection Points

**Context assembly order:**
```
1. System prompt (base instructions)
2. Memory Layer (ticklers + lessons + references)
3. Announcement Board (recent fetches, file cabinet, turn awareness)
4. Main History (gradient-selected, turn-tagged)
5. User's current prompt
```

**Reasoning:**
- System prompt: Foundation
- Memory/Announcement: Dynamic, changes each turn (minimal cache impact)
- History: Stable structure (cache-friendly)
- User prompt: Fresh

**Cache Optimization:**
- System prompt + History = cacheable
- Memory + Announcement = variable (but small, <10k tokens)
- Most tokens cached, dynamic injection cheap

### Announcement Board Details

**Location:** After user prompt, before history

**Contains:**
```
📋 Announcement Board (5 turn TTL):

🌐 Recent Web Fetches:
- ABC123: "TypeScript async patterns" (Expires: 3 turns)
  tools.fetchFromFC("ABC123") or tools.writeFile("ABC123", "path")

📁 File Cabinet:
- DEF456: "OAuth implementation notes" (Saved 2 days ago)

🔧 Tool Capabilities Reminder:
- Retrieve turn detail: tools.history.getTurn(id, level)
- Levels: R (raw), S (smoothed), C (compressed), T (tiny)
- Recent 20 turns: Full detail
- Turns 21-100: Compressed in history below
```

**Updates each turn:**
- Add new fetches
- Remove expired items (TTL)
- Show what's available without full content

**Impact:**
- Model sees capabilities
- Contextual reminders reduce errors
- Just-in-time learning

**Status:** Design complete, implementation planned for Phase 7-8

---

## System Integration

### How Innovations Work Together

**Turn Flow with All Innovations:**

```
User submits prompt
  ↓
Runtime Preprocessing (1s parallel)
├─ Keyword search → candidates
├─ Vector search → candidates
├─ Nano swarm → filtered items
└─ Judgment model → injection decisions
  ↓
Context Assembly
├─ System prompt
├─ Memory layer (lessons + references + ticklers)
├─ Announcement board (capabilities + recent items)
└─ History (compression gradient selected, turn-tagged)
  ↓
Model receives (100-200k tokens)
  - Represents millions of raw tokens
  - Dynamically curated
  - Rich with relevant context
  ↓
Model writes response (possibly with <tool-calls>)
  ↓
Script Detection
  ├─ No script: Standard response processing
  └─ Script found: QuickJS execution
      ├─ Tools called (with approvals)
      ├─ Results returned
      └─ Script output captured
  ↓
Response recorded in history
  ↓
Async: Compression processing
  - Generate S/C/T versions (parallel LLM calls)
  - Complete in 1-2s or continue background
  ↓
Every 10 turns: Recalculate gradient bands
  ↓
Cycle repeats
```

**Offline (2x daily):**
```
Batch agents process full history
  ↓
Extract lessons + topics + patterns
  ↓
Update knowledge base
  ↓
Prepare reference layers
  ↓
Admin notifications (if needed)
```

### Emergent Capabilities

**With all systems together:**

1. **Infinite Memory**
   - Compression gradient = no context limit
   - Models remember entire project history

2. **Intelligent Retrieval**
   - Automatic relevance (preprocessing)
   - Manual detail (fidelity tools)
   - Lessons surface automatically

3. **Meta-Orchestration**
   - Agents spawn agents
   - Parallel execution
   - Complex workflows in single turn

4. **Knowledge Accumulation**
   - Project understanding deepens over time
   - Patterns emerge and are codified
   - Lessons prevent repeated mistakes

5. **Model Augmentation**
   - Lower-tier models → competent (3-5x)
   - Mid-tier → senior level (2-3x)
   - Top-tier → principal level (1.5-2x)

---

## Technical Foundations

### Memory Hierarchy

**L1 - Working Memory (Turn Context):**
- Current turn messages
- Active tool executions
- Immediate results

**L2 - Announcement Board (5 turn TTL):**
- Recent fetches (fileKeys)
- Retrieved turn detail
- Temporary references

**L3 - Main History (Gradient-Selected):**
- R/S/C/T mixed per band
- Fixed token budget (100-200k)
- Spans hundreds/thousands of turns

**L4 - Compressed Archive (All Turns):**
- All versions stored
- Retrievable on demand
- Infinite retention

**L5 - Knowledge Base (Distilled):**
- Lessons learned
- Reference layers
- Topic weights
- User preferences

### Storage Strategy

**Turn Storage:**
```typescript
{
  turnId: "T-183",
  timestamp: Date,
  versions: {
    raw: ResponseItem[],     // Full
    smoothed: ResponseItem[], // 60%
    compressed: string,       // 30-40%
    tiny: string              // 1-5%
  },
  metadata: {
    tokensRaw: number,
    tokensSmoothed: number,
    tokensCompressed: number,
    tokensTiny: number,
    toolCallCount: number,
    topics: string[]
  }
}
```

**Gradient State:**
```typescript
{
  lastCalculated: timestamp,
  turnCount: number,
  bands: [
    {range: [181, 200], level: 'R', allocation: 0.40},
    {range: [161, 180], level: 'S', allocation: 0.16},
    {range: [101, 160], level: 'C', allocation: 0.30},
    {range: [1, 100], level: 'T', allocation: 0.14}
  ]
}
```

**Recalculation trigger:** Every 10 turns or on-demand

---

## Development Roadmap

**Current Status:** Phase 4 (Client + Tools + Script Harness)

**Remaining Core (Phase 5-6):**
- Phase 5.1: Conversation management (with strategy pattern)
- Phase 6: Core integration (core/codex, orchestration)

**Memory System (Phase 7-8):**
- Phase 7: Compression gradient + fidelity tools
- Phase 8: Offline processing + dynamic injection

**Future Enhancements:**
- Claude-specific optimizations
- Additional providers (Gemini, Cohere)
- Advanced reference layer management
- Multi-agent conversations

---

## Conclusion

This project combines faithful Rust porting with strategic innovations that address fundamental LLM limitations: context windows, tool orchestration complexity, and knowledge accumulation. By layering compression gradients, intelligent retrieval, script-based composition, and offline processing, we create an agent framework that enables models to perform far beyond their baseline capabilities on long-term, knowledge-intensive tasks.

**The innovation is not in the models - it's in the cognitive scaffolding we provide them.**

Just as the human subconscious augments the cerebral cortex through parallel processing, memory consolidation, and relevance filtering, this system augments LLMs through distributed caching, compression gradients, and intelligent context injection.

**Result:** Lower-tier models become competent, mid-tier become senior-level, top-tier approach principal engineer capabilities - all through engineering, not model improvements.
