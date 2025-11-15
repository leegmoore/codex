



## CORE INSIGHT: Narrative as Third Dimension of Information Structure

### The Fundamental Principle

Human knowledge representation is built on narrative structure. Not just hierarchies (parent/child relationships) or networks (node/edge graphs), but temporal/causal flow - what happened, then what happened next, and why. This creates a third dimension where context lives.

**Traditional documentation thinking:**
- Information organized by hierarchy (categories, subcategories)
- Or by reference (alphabetical, topical grouping)
- Assumes random access (reader jumps to what they need)
- Optimizes for lookup, not comprehension

**Narrative-structured documentation:**
- Information organized by journey (where you start, where you go, why you go there)
- Temporal flow (first this, then this, because of this)
- Assumes progressive reading (guide the reader through understanding)
- Optimizes for comprehension, building mental models

**Why this matters for AI agents:**
- LLMs trained on 50TB of internet text—messy, narrative, temporal
- Not trained on curated knowledge graphs or hierarchical databases
- The substrate they use to represent knowledge IS narrative structure
- Conforming to that substrate = more efficient encoding, better retrieval

**Why this matters for humans:**
- We think in stories (events over time, cause and effect)
- We remember journeys better than lists
- Context is temporal ("what led to this decision")
- Understanding emerges from flow, not from categorization alone

### The Three Dimensions

**Dimension 1: Hierarchy**
- Sections, subsections, nested structure
- Categories and taxonomy
- Parent/child relationships
- Answers: "What category does this belong to?"

**Dimension 2: Network**
- Cross-references, links between concepts
- Related topics, see-also
- Lateral connections
- Answers: "What else is connected to this?"

**Dimension 3: Temporal/Narrative**
- What came before, what comes after
- Cause and effect, decisions and outcomes
- Journey from ignorance to understanding
- Evolution of design over time
- Answers: "How did we get here? What happens next?"

**Most technical documentation uses only Dimension 1 (hierarchy).** Good documentation uses all three. The temporal dimension is what creates CONTEXT.

### Why Flat Bullets Fail

Bullets are 1-dimensional lists masquerading as hierarchy. Each item competes equally for attention.

```
- Important strategic decision
- Minor implementation detail
- Critical architectural constraint
- Formatting preference
```

**Reader/model doesn't know which matters most.** Attentional weights spread evenly. Key insights lost in noise.

### Why Narrative + Bullets Work

Prose paragraphs establish BRANCH (context, importance, relationships). Bullets hang LEAVES (specifics, details, examples) off that branch.

```
We're building a simple baseline CLI for three reasons. First, Ratatui doesn't port
easily to TypeScript. Second, simple modes are testable (agents can drive via commands).
Third, we can layer richer UI later without changing the foundation.

CLI components being built:
- Command parser (Commander.js)
- Interactive REPL
- One-shot command mode
- JSON output flag
```

**The paragraph creates the branch** ("why we're doing this, what it enables"). **The bullets hang details** (specific components). Attentional hierarchy clear.

**Models process this better:**
- Paragraph signals "important context coming"
- Bullets signal "specifics within that context"
- Weight distribution natural
- Memory anchors on branches, details retrievable from branches

---
