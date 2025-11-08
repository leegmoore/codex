       177 -  **Rationale:**
       178 -  - Reduces round trips (complex workflow in one turn)
       179 -  - Models use familiar async/await patterns
       180 -  - Maintains coherence (original prompt stays in context)
       181 -  - Enables tool result composition
       182 -  
       183 -  **Status:** Implemented (Phases 4.4-4.7)
       184 -  
       185 -  ---
       186 -  
       187 -  ## Enhancement 3: Extended Tool Capabilities
       188 -  
       189 -  ### Additional Tools
       190 -  
       191 -  **From Previous Port:**
       151 +  **File Operations:**
       152    - readFile (indentation-aware navigation)
       153    - listDir (recursive directory listing)
       154 -  - grepFiles (ripgrep integration)
       155 -  - applyPatch (enhanced with full tree-sitter)
       154 +  - grepFiles (ripgrep content search)
       155 +  - applyPatch (unified diff with tree-sitter)
       156 +  - fileSearch (fuzzy filename matching)
       157    
       158 -  **Web Integration:**
       159 -  - webSearch (Perplexity API for ranked results)
       160 -  - fetchUrl (Firecrawl scraping with caching)
       158 +  **Execution:**
       159 +  - exec (sandboxed command execution)
       160    
       161 -  **Document Management (interfaces defined):**
       162 -  - File Cabinet storage (fileKey-based, 30 day retention)
       163 -  - Zero-token file writing (via fileKey references)
       161 +  **Planning:**
       162 +  - updatePlan (structured task management)
       163    
       164 -  **Prompt Management (interfaces defined):**
       165 -  - Prompt caching (store/retrieve by keys)
       166 -  - Enables prompt composition and reuse
       164 +  **Images:**
       165 +  - viewImage (image injection into conversation)
       166    
       167 -  **Agent Orchestration (interfaces defined):**
       168 -  - Direct LLM calls with cached prompts
       169 -  - Synchronous agent execution
       170 -  - Asynchronous agent spawning (for long-running tasks)
       167 +  **MCP:**
       168 +  - Dynamic tools from MCP servers
       169 +  - MCP resource access (list, read)
       170    
       171 -  **Organization:**
       172 -  - Tool registry with metadata
       173 -  - Tool packs for grouped access
       174 -  - Provider-specific tool sets supported
       171 +  **Web & Orchestration (Phase 4.7):**
       172 +  - webSearch (Perplexity integration)
       173 +  - fetchUrl (Firecrawl scraping)
       174 +  - Document management stubs
       175 +  - Prompt caching stubs
       176 +  - Agent orchestration stubs
       177    
       178 -  **Status:** Phases 4.5-4.7 (11 tools implemented, 9 stubbed)
       178 +  **Total:** 20+ tools
       179    
       180 -  ---
       180 +  ### Tool Pack System
       181    
       182 -  ## Enhancement 4: Compression Gradient Memory
       182 +  Pre-configured tool collections for different scenarios:
       183 +  - `core-codex`: Essential editing and execution tools
       184 +  - `anthropic-standard`: Basic Claude tool set
       185 +  - `file-ops`: File system operations only
       186 +  - `research`: Search and information gathering
       187 +  - `all`: Complete tool set
       188    
       189 -  ### Problem Statement
       189 +  **Status:** Complete (Phase 4.4-4.7)
       190    
       191 -  LLM context windows create a hard limit on conversation length. Traditional approaches either truncate history or fail when the window fills. This limits effectiveness on long-term tasks 
           - where project knowledge accumulates over hundreds or thousands of turns.
       191 +  ---
       192    
       193 -  ### Technical Approach
       193 +  ## Enhancement 3: Compression Gradient Memory
       194    
       195 -  Store each conversation turn in multiple compression levels. Select turns for inclusion in the fixed-size context window based on recency gradients, allowing effective access to much larger
           -  total history.
       195 +  ### Motivation
       196    
       197 +  LLM context windows impose hard limits on conversation length. Traditional approaches truncate history when full, losing valuable context. Compression with intelligent fidelity selection 
           + enables extended conversations within fixed token budgets.
       198 +  
       199    ### Compression Tiers
       200    
       201 -  **Four versions generated per turn:**
       201 +  **Four versions created per turn:**
       202    
       203 -  **Raw (R):** Unmodified content
       204 -  - Complete messages, tool calls, results
       205 -  - All reasoning and thinking
       206 -  - 100% of original tokens
       203 +  **Raw (R):** Original, unmodified content
       204 +  - Complete messages
       205 +  - Full tool calls (arguments, outputs)
       206 +  - All reasoning blocks
       207    
       208 -  **Smoothed (S):** Normalized content
       209 -  - Grammar and spelling corrections
       210 -  - Whitespace normalization
       211 -  - Repetition removal
       208 +  **Smoothed (S):** Normalized, cleaned
       209 +  - Grammar and spelling corrected
       210 +  - Formatting standardized
       211 +  - Noise removed
       212    - Tool calls with summarized parameters
       213 -  - ~60% of original tokens
       213    
       214 -  **Compressed (C):** Summarized content
       215 -  - Key points and actions
       216 -  - Results captured
       217 -  - Tool calls reduced to "{tool X called → result Y}"
       218 -  - ~30-40% of original tokens
       214 +  **Compressed (C):** Summarized by LLM
       215 +  - Key points and decisions
       216 +  - Actions taken and results
       217 +  - Tool calls: "{tool X called, result Y}"
       218    
       219 -  **Tiny (T):** Minimal summary
       220 -  - Single sentence per turn
       221 -  - Tool calls omitted or counted only
       222 -  - ~1-5% of original tokens
       219 +  **Tiny (T):** Ultra-compressed
       220 +  - Single sentence summary
       221 +  - Tool calls omitted or aggregated
       222    
       223 -  ### Gradient Allocation
       223 +  **Token reduction:** R (100%) → S (60%) → C (30-40%) → T (1-5%)
       224    
       225 -  **Token budget distributed by recency:**
       225 +  ### Gradient Selection
       226    
       227 -  Example configuration (100k budget, 200 turns):
       227 +  **Allocation by recency:**
       228 +  - Recent turns: Full detail (Raw)
       229 +  - Working memory: Clean version (Smoothed)
       230 +  - Background: Compressed summaries
       231 +  - Deep history: Tiny summaries
       232    
       233 -  | Range | Fidelity | Tokens/Turn | Subtotal | Percentage |
       234 -  |-------|----------|-------------|----------|------------|
       235 -  | Last 20 turns | Raw | 2000 | 40k | 40% |
       236 -  | Next 20 turns | Smoothed | 800 | 16k | 16% |
       237 -  | Next 60 turns | Compressed | 500 | 30k | 30% |
       238 -  | Oldest 100 turns | Tiny | 140 | 14k | 14% |
       233 +  **Example allocation (100k budget, 200 turns):**
       234 +  - Turns 181-200: Raw (40k tokens, 40%)
       235 +  - Turns 161-180: Smoothed (16k tokens, 16%)
       236 +  - Turns 101-160: Compressed (30k tokens, 30%)
       237 +  - Turns 1-100: Tiny (14k tokens, 14%)
       238    
       239 -  **Result:** 200 turns fit in 100k budget (representing ~400k-1M raw tokens)
       239 +  **Recalculation:** Every 10 turns to adjust band boundaries as history grows.
       240    
       241    ### Turn Tagging
       242    
       243 -  **XML element encoding:**
       243 +  **XML element names encode turn ID and level:**
       244    ```xml
       245    <T-183-R>
       246 -  Full content of turn 183 at raw fidelity...
       246 +  [Full turn content]
       247    </T-183-R>
       248 +  ```
       249    
       250 +  **Compressed blocks:**
       251 +  ```xml
       252    <T-50-through-100-C>
       253 -  Turn 50: Implemented OAuth. Turn 51: Fixed bug...
       253 +  Turn 50: [summary]. Turn 51: [summary]...
       254    </T-50-through-100-C>
       255    ```
       256    
       257 -  **Tag structure:**
       258 -  - Turn ID: T-[number]
       259 -  - Fidelity level: -R, -S, -C, -T
       260 -  - Element name encodes both pieces
       257 +  **System prompt informs models:**
       258 +  - Turn ID format and meaning
       259 +  - Compression levels available
       260 +  - How to request higher fidelity
       261    
       262    ### Fidelity Retrieval
       263    
       264 -  **Model can request higher fidelity:**
       264 +  **Tool for on-demand detail:**
       265    ```typescript
       266 -  const detail = await tools.history.getTurn("T-50", "S");
       267 -  // Retrieves smoothed version of turn 50
       268 -  // Added to announcement board (5 turn TTL)
       269 -  // Model can examine older turns in detail when needed
       266 +  tools.history.getTurn(turnId, level)
       267 +  // Returns specified version
       268 +  // Adds to announcement board (5 turn TTL)
       269    ```
       270    
       271 +  **Use case:** Model sees compressed mention of relevant past discussion, requests full detail.
       272 +  
       273    ### Processing Pipeline
       274    
       275 -  **Per turn:**
       276 -  1. Store raw version immediately
       275 +  **After each turn:**
       276 +  1. Store raw version
       277    2. Async: Generate S/C/T versions (parallel LLM calls)
       278 -  3. Complete in 1-2 seconds or continue background
       279 -  4. All versions persisted
       278 +  3. Complete in 1-2 seconds or continue in background
       279 +  4. Failure detection and retry for incomplete processing
       280    
       281    **Every 10 turns:**
       282    - Recalculate gradient band boundaries
       283 -  - Adjust percentages if needed
       283 +  - Update allocation percentages
       284    - Minimize cache invalidation
       285    
       286 -  **On retrieval:**
       287 -  - Select appropriate version per band
       288 -  - Wrap in tagged XML
       289 -  - Assemble coherent history
       286 +  ### Capacity
       287    
       288 -  ### Capacity Estimates
       288 +  **Estimated spans:**
       289 +  - 100k budget: ~200 turns
       290 +  - 200k budget: ~400-500 turns
       291 +  - Raw equivalent: Several million tokens compressed
       292    
       293 -  With gradient compression:
       294 -  - 100k budget: 200-400 turns (hundreds of thousands of raw tokens)
       295 -  - 200k budget: 400-800 turns (1-2 million raw tokens)
       296 -  - Effective capacity depends on compression quality and tool call density
       293 +  **Actual capacity depends on:**
       294 +  - Turn complexity
       295 +  - Tool call density
       296 +  - Compression effectiveness
       297    
       298 -  **Status:** Design phase, planned for Phase 7
       298 +  **Status:** Design complete, implementation Phase 7
       299    
       300    ---
       301    
       302 -  ## Enhancement 5: Offline Knowledge Processing
       302 +  ## Enhancement 4: Offline Memory Processing
       303    
       304 -  ### Technical Approach
       304 +  ### Purpose
       305    
       306 -  Background batch jobs process accumulated conversation history to extract knowledge, identify patterns, and prepare reference materials. Uses large-context 
           -  models (1-2M tokens) running at batch pricing.
       306 +  Background agents with large context windows process conversation history to extract knowledge, identify patterns, and prepare reference materials for dynamic injection.
       307    
       308 -  ### Processing Responsibilities
       308 +  ### Processing Model
       309    
       310 -  **Input Data:**
       311 -  - Compressed history (C/T levels for all turns)
       312 -  - Smoothed recent turns (last 10-20)
       313 -  - Existing knowledge base
       310 +  **Execution:**
       311 +  - Frequency: 2x daily
       312 +  - Context: 1-2M tokens (C/T compressed history + S recent turns)
       313 +  - Pricing: Batch mode (reduced cost)
       314 +  - Models: Large context models (GPT-5, Gemini Pro)
       315    
       316 -  **Extraction Tasks:**
       316 +  ### Extraction Tasks
       317    
       318 -  **1. Topic Analysis**
       318 +  **1. Topic & Category Identification**
       319    - Identify conversation themes
       320 -  - Apply keyword tags
       321 -  - Calculate topic weights (updated over time)
       320 +  - Extract keywords
       321 +  - Assign topic weights
       322 +  - Track evolution over time
       323    
       324 -  **2. Knowledge Organization**
       325 -  - Categorize discussions by project area
       326 -  - Group related conversations
       327 -  - Track topic evolution
       324 +  **2. Knowledge Consolidation**
       325 +  - User preferences
       326 +  - Design patterns
       327 +  - Technology stack understanding
       328 +  - Project-specific conventions
       329    
       330 -  **3. Pattern Recognition**
       331 -  - Extract repeated solutions
       332 -  - Identify what approaches worked/failed
       333 -  - Document recurring problems and fixes
       330 +  **3. Lesson Distillation**
       331 +  - What worked vs what didn't
       332 +  - Solutions to recurring problems
       333 +  - Patterns worth codifying
       334 +  - Mistakes to avoid
       335    
       336 -  **4. Distillation**
       337 -  - Create reusable lessons (200-2000 tokens each)
       338 -  - Document user preferences discovered
       339 -  - Record design pattern usage
       340 -  - Capture project-specific conventions
       341 -  
       342 -  **5. Reference Layer Management**
       343 -  - Identify documentation needs (500-5000 token chunks)
       344 -  - Assemble technology references
       345 -  - Prepare pattern libraries
       336 +  **4. Reference Layer Assembly**
       337 +  - Identify documentation needs (500-5000 tokens)
       338 +  - Prepare technology references
       339 +  - Compile pattern libraries
       340    - Flag knowledge gaps
       341    
       342 -  **Output Artifacts:**
       342 +  ### Outputs
       343    
       344    **Lessons Store:**
       345    ```typescript
     ...
       401      lessonId: string;
       402      topics: string[];
       403      keywords: string[];
       404 -    content: string;          // 200-2000 tokens
       405 -    sourceTurns: string[];
       406 -    relevanceWeight: number;  // 0-1, adjusted over time
       404 +    content: string;          // Distilled lesson
       405 +    sourceTurns: string[];   // Origin
       406 +    weight: number;          // Relevance (0-1)
       407    }
       408    ```
       409    
       410    **Reference Layers:**
       411 -  - Topic-tagged documentation chunks
       412 -  - Technology-specific (TypeScript, React, etc.)
       413 -  - Project-specific (architecture, standards)
       414 -  - Stored with retrieval metadata
       411 +  - Pre-compiled documentation chunks
       412 +  - Tagged by topic and technology
       413 +  - Sized for efficient injection (500-5000 tokens)
       414 +  - Curated by admin when needed
       415    
       416    **Topic Weights:**
       417 -  - Dynamic importance scoring
       418 -  - Updated based on conversation evolution
       419 -  - Used for search ranking
       417 +  - Dynamic importance scores
       418 +  - Adjusted based on conversation patterns
       419 +  - Guide retrieval prioritization
       420    
       421    **Admin Recommendations:**
       422 -  - Suggested new reference layers
       422 +  - Suggested reference layers to create
       423    - Knowledge gaps identified
       424 -  - Curation opportunities
       424 +  - Index optimization suggestions
       425    
       426 -  ### Operational Model
       426 +  ### Integration
       427    
       428 -  **Frequency:** 2x daily (or configurable)
       429 -  **Pricing:** Batch API rates (50% of standard)
       430 -  **Models:** Large context (1-2M tokens)
       431 -  **Duration:** Minutes to hours (non-blocking)
       428 +  Offline processing outputs feed into runtime preprocessing for dynamic context injection.
       429    
       430 -  **Maintenance:**
       431 -  - Rebuild search indexes
       432 -  - Prune outdated content
       433 -  - Merge similar lessons
       434 -  - Optimize coverage
       430 +  **Status:** Design complete, implementation Phase 8
       431    
       432 -  **Status:** Design phase, planned for Phase 8
       433 -  
       432    ---
       433    
       434 -  ## Enhancement 6: Dynamic Context Assembly
       434 +  ## Enhancement 5: Runtime Turn Preprocessing
       435    
       436 -  ### Technical Approach
       436 +  ### Purpose
       437    
       438 -  Before executing each turn, run parallel search and filtering processes to identify potentially relevant historical context, which a judgment model evaluates for inclusion in the final 
           - prompt.
       438 +  Before each turn executes, gather potentially relevant context from past history and knowledge base, filter using small models, and inject into prompt.
       439    
       440 -  ### Processing Pipeline
       440 +  ### Pipeline (1 Second Budget)
       441    
       442 -  **Time Budget:** ~1 second
       442 +  **Parallel Execution:**
       443    
       444 -  **Parallel Processes:**
       445 -  
       446 -  **Keyword Search (100ms target)**
       444 +  **Keyword Search (100ms):**
       445    - Search compressed history
       446    - Search lessons store
       447    - Search reference layers
       448 -  - Return: 20-30 candidates
       448 +  - Returns: 20-30 candidates
       449    
       450 -  **Vector Semantic Search (200ms target)**
       451 -  - Embedding-based similarity
       452 -  - Against compressed history and knowledge base
       453 -  - Return: 20-30 candidates
       450 +  **Vector Semantic Search (200ms):**
       451 +  - Embedding similarity against history
       452 +  - Knowledge base search
       453 +  - Returns: 20-30 candidates
       454    
       455 -  **Nano Agent Swarm (500ms target)**
       456 -  - Launch small fast models (Flash 2.0, Haiku 4.5)
       457 -  - Each evaluates subset of candidates
       458 -  - Task: Filter obviously irrelevant, keep possibly relevant
       459 -  - Return: 10-20 filtered items
       455 +  **Nano Agent Filter (500ms):**
       456 +  - Small models (flash 2.0, haiku 4.5, gpt-5-nano)
       457 +  - Each reviews subset of candidates
       458 +  - Filter obvious non-relevance
       459 +  - Returns: 10-20 filtered items
       460    
       461 -  **Timeout Handling:**
       462 -  - Hard cutoff at 1 second
       463 -  - Use whatever results collected
       464 -  - Some processes may not complete (acceptable)
       461 +  **Timeout at 1 Second:**
       462 +  - Collect completed results
       463 +  - Proceed with available data
       464    
       465 -  **Final Judgment (200ms)**
       466 -  - Small model reviews: current turn + compressed history + candidates
       467 -  - Decides:
       468 -    - Which reference layers to inject
       469 -    - Which memory ticklers to include
       470 -    - Which lessons to surface
       471 -  - Formats for injection
       465 +  ### Final Judgment
       466    
       467 -  **Total Latency:** ~1.2 seconds (can overlap with other processing)
       467 +  **Small fast model reviews:**
       468 +  - Latest user prompt
       469 +  - Compressed recent history
       470 +  - Filtered search results
       471    
       472 -  ### Injection Points
       472 +  **Decides:**
       473 +  - Which reference layers to inject
       474 +  - Which memory ticklers to include
       475 +  - Which lessons to surface
       476 +  - Formatting and placement
       477    
       478 -  **Context assembly order:**
       479 -  ```
       480 -  1. System Prompt
       481 -     - Base instructions
       482 -     - Capabilities overview
       478 +  **Processing time:** ~200ms
       479    
       480 -  2. Memory Layer
       481 -     - Memory ticklers (references to relevant past turns)
       482 -     - Reference layers (documentation, patterns)
       483 -     - Distilled lessons
       484 -     - Reminders of memory system capabilities
       480 +  ### Injection Format
       481    
       482 -  3. Announcement Board
       483 -     - Recent fetches (with fileKeys, 5 turn TTL)
       484 -     - File Cabinet contents
       485 -     - Tool capability reminders
       486 -     - Turn fidelity explanation
       487 -  
       488 -  4. Main History
       489 -     - Compression gradient selected
       490 -     - Turn-tagged with XML
       491 -     - Mixed fidelity levels
       492 -  
       493 -  5. Current User Prompt
       482 +  **Memory Ticklers:**
       483    ```
       484 -  
       485 -  **Memory Ticklers Format:**
       484 +  💭 Related Context:
       485 +  - Turn 87 (3 weeks ago): OAuth implementation approach
       486 +    tools.history.getTurn("T-87", "S") for detail
       487    ```
       488 -  💭 Related History:
       489 -  - Turn 87: Similar authentication issue (resolved via pattern X)
       490 -    Retrieve: tools.history.getTurn("T-87", "S")
       491 -  ```
       488    
       489 -  **Reference Layers Format:**
       489 +  **Reference Layers:**
       490    ```
       491    📚 Relevant Documentation:
       492 -  - OAuth Implementation Patterns (2.3k tokens)
       493 -  - Error Handling Best Practices (1.8k tokens)
       492 +  - TypeScript Error Handling Patterns (1.8k tokens)
       493 +  - OAuth Best Practices (2.3k tokens)
       494    ```
       495    
       496 -  **Caching Considerations:**
       497 -  - System prompt + main history = stable (cacheable)
       498 -  - Memory layer + announcement board = dynamic (<10k tokens)
       499 -  - Cache hit rate optimized by keeping most content stable
       500 -  
       501 -  **Status:** Design phase, planned for Phase 7-8
       502 -  
       503 -  ---
       504 -  
       505 -  ## Memory System Architecture
       506 -  
       507 -  ### Three History Strategies
       508 -  
       509 -  The system supports multiple approaches to conversation memory, selectable per session:
       510 -  
       511 -  **1. Regular Mode**
       512 -  - Standard conversation history
       513 -  - All turns stored as-is
       514 -  - Truncation when context fills
       515 -  - Compatible with current Codex behavior
       516 -  
       517 -  **2. One-Shot Mode**
       518 -  - Epic/specification + task list + log file
       519 -  - No conversation history accumulation
       520 -  - Repeated single-shot executions
       521 -  - Stateless restarts until completion
       522 -  - Optimized for autonomous long-running tasks
       523 -  
       524 -  **3. Gradient Mode**
       525 -  - Multi-tier compression (R/S/C/T)
       526 -  - Intelligent band allocation
       527 -  - Dynamic fidelity selection
       528 -  - Detail retrieval on demand
       529 -  - Designed for long-term knowledge-intensive work
       530 -  
       531 -  **Implementation:**
       532 -  ```typescript
       533 -  interface HistoryStrategy {
       534 -    recordTurn(turn: Turn): Promise<void>;
       535 -    getHistory(budget: TokenBudget): Promise<HistorySegment[]>;
       536 -  }
       537 -  
       538 -  class ConversationHistory {
       539 -    constructor(strategy: HistoryStrategy) {
       540 -      // Strategy pattern allows swappable implementations
       541 -    }
       542 -  }
       496 +  **Distilled Lessons:**
       497    ```
       498 -  
       499 -  **Planned Sequence:**
       500 -  - Phase 5.1: Interface + RegularStrategy (Rust port)
       501 -  - Phase 7: Add GradientStrategy
       502 -  - Phase 8: Add OneShotStrategy
       503 -  
       504 -  ### Session Management
       505 -  
       506 -  **Conversation Forking:**
       498 +  💡 Project Patterns:
       499 +  - Token refresh: Use exponential backoff
       500 +  - Validation: Check input sanitization first
       501    ```
       502 -  Main session (planner context):
       503 -    Turns 1-50
       504 -    ↓
       505 -    Fork → Worker session (starts from turn 50 state)
       506 -           Worker executes turns 51-150
       507 -    ↓
       508 -    Main session continues from turn 50
       509 -    Worker's history not merged back
       510 -  ```
       502    
       503 -  **Use case:** Keep planner context clean while spawning specialized workers.
       503 +  ### Context Assembly
       504    
       505 -  **Implementation:** Already supported via rollout persistence (Phase 2).
       505 +  **Final prompt structure:**
       506 +  1. System prompt (base instructions)
       507 +  2. Memory layer (ticklers, lessons, references)
       508 +  3. Announcement board (capabilities, recent items, turn awareness)
       509 +  4. Main history (gradient-selected, turn-tagged)
       510 +  5. User's current prompt
       511    
       512 -  ---
       512 +  **Placement reasoning:**
       513 +  - Memory/Announcement vary per turn (dynamic content)
       514 +  - History structure stable (cache-friendly)
       515 +  - System + History cacheable
       516 +  - Dynamic injection has minimal cache impact
       517    
