This guide builds upon the foundational principles established in the "Masterclass on Agentic Planning and Documentation." It assumes you have internalized those concepts—The Narrative Substrate, Multi-Altitude Structure, Functional-Technical Weaving, and the Agent Cognitive Model—and provides the operational details for engineering effective prompts for execution agents (Coders and Verifiers).

# Reference Layer: Execution Agent Prompt Engineering

**Purpose:** To define the structure and content of prompts for Coding and Verification agents, operationalizing the core methodology for reliable agentic execution.

-----

## The Foundation: The Prompt as External Scaffold

As established in the Masterclass, execution agents (LLMs) often lack the internal "interrupt signal" to self-orient, question assumptions, or maintain continuity across stateless sessions. They execute in isolation.

**The prompt is the External Metacognitive Scaffold.** It is not merely a task description; it is the mechanism through which we explicitly manage the agent's attention, load its external memory (state), define its workflow, and enforce quality gates.

Every section in the prompt anatomy is designed to address a specific cognitive limitation and ensure reliable execution.

-----

## Part 1: The Coding Agent Prompt

The Coding Agent is responsible for implementation. Its prompt must provide complete context, clear instructions, and explicit success criteria.

### Anatomy of an Effective Coding Prompt (12 Sections)

1.  Role Definition
2.  Project Context
3.  Current Phase/Task & Functional Outcome
4.  Prerequisites (What's Done)
5.  Workspace/Location Info
6.  State Loading Instructions (Read These Files FIRST)
7.  Task Specification
8.  Workflow Steps
9.  Workflow Rules & Interrupt Protocol
10. Code Quality Standards
11. Session Completion Checklist (BEFORE ENDING)
12. Starting Point

-----

### 1\. Role Definition (Setting Perspective and Initial Weights)

**Purpose:** Set the agent's identity, expertise level, and **Perspective** (Depth Dimension). This establishes the initial **Attentional Weights** for how they approach the work.

**Guidance:** Be specific. "Senior" implies confident decision-making and architectural awareness. Match the specialization to the task.

```
ROLE: You are a senior TypeScript developer implementing the integration wiring for the Cody CLI project.
```

-----

### 2\. Project Context (High Altitude Orientation)

**Purpose:** Provide a brief overview (25k feet Altitude) of the project. This grounds the specific task in the broader strategic "why."

**Guidance:** Keep it to one sentence. This is orientation, not a deep dive.

```
PROJECT: Cody CLI Integration - Building a multi-mode CLI (REPL, one-shot, JSON) wrapper around the @openai/codex-core library.
```

-----

### 3\. Current Phase/Task & Functional Outcome (Weaving)

**Purpose:** Define the specific work for this session (1k feet Altitude). Crucially, this must maintain the **Functional-Technical Weave**.

**Guidance:** The Coder must understand *what* they are enabling for the user, not just *how* they are implementing the code. This is the verification anchor.

```
CURRENT PHASE: Phase 1 - Basic Chat Flow (Wiring CLI to ConversationManager)

FUNCTIONAL OUTCOME: After this phase, the user can start a new conversation via `cody new` and send a message via `cody chat "message"`, receiving a response from the LLM.
```

-----

### 4\. Prerequisites (What's Done)

**Purpose:** Define the existing foundation. This reduces uncertainty and allows the agent to confidently build upon prior work.

```
PREREQUISITES:
- Library Layer (Phases 1-6 of Port) ✅ COMPLETE (Core modules exist, unit tested)
- PRD & TECH-APPROACH ✅ COMPLETE (Project planning finalized)
```

-----

### 5\. Workspace/Location Info (Spatial Orientation)

**Purpose:** Provide explicit path information. Agents cannot infer the workspace structure.

```
NOTE: Workspace is /Users/user/code/cody-project
(TypeScript code is in src/ subdirectory)
```

-----

### 6\. State Loading (Operationalizing External Memory) - CRITICAL

**Purpose:** This is how we overcome the agent's statelessness. It forces the agent to load its memory (the current state of the project) *before* acting.

**Guidance:** The order is mandatory. The agent must understand the current state before diving into the technical details. This implements the **Smooth Descent**.

```
FIRST: Load Memory (Read status and plan)
- Read phase-1/STATUS.md (current progress)
- Read phase-1/CHECKLIST.md (task list)
- Read phase-1/README.md (phase overview and design - 10k ft view)

THEN: Read Technical Context
- Read TECH-APPROACH.md Section 2 (Phase 1 details - 15k ft view)
- Read docs/core/DEV_STANDARDS.md (code standards)
```

-----

### 7\. Task Specification (The Execution Plan)

**Purpose:** Detailed, actionable instructions on what to build.

**Guidance:** Apply **Bespoke Depth**. Provide more detail for complex or risky tasks. Include scope indicators (line estimates, complexity) and order tasks by dependency.

```
TASKS (In Order):
1. Implement CLI Entry Point (src/cli/index.ts) - EASY (~50 lines)
   - Initialize Commander.js
   - Define `cody new` and `cody chat` commands.

2. Implement Command Handlers (src/cli/commands/new.ts, chat.ts) - MEDIUM (~150 lines)
   - Instantiate ConversationManager.
   - Call createConversation() / sendMessage().
   - Handle response display.
```

-----

### 8\. Workflow Steps (The Execution Scaffold)

**Purpose:** Define the explicit process for completing each task. This reduces decisions and ensures consistency.

**Guidance:** Be explicit with commands. A TDD workflow is generally preferred.

```
WORKFLOW (per task):
1. Create test file: tests/mocked-service/phase-1/[TASK].test.ts
2. Write mocked-service test based on README specification.
3. Run: npm test -- [TASK] (should fail)
4. Implement the feature in src/...
5. Implement until tests pass.
6. Verify quality gates (lint, types - see Section 10).
7. Commit: git add -A && git commit -m "phase1: [task description]"
8. Update CHECKLIST.md and STATUS.md.
```

-----

### 9\. Workflow Rules & Interrupt Protocol

**Purpose:** Define mandatory operating procedures and how to handle ambiguity, addressing the agent's lack of inherent interrupts (The **Interrupt Problem**).

**Guidance:** This is crucial for safety and preventing hallucinated solutions.

```
WORKFLOW RULES:
1. Follow the workflow steps exactly. Do not skip or reorder.
2. Use only the specified libraries and patterns. Do not introduce new dependencies without approval.
3. Adhere strictly to the DEV_STANDARDS.md.

INTERRUPT PROTOCOL (When to STOP):
If you encounter any of the following, you MUST STOP immediately, report the issue to the user, and await clarification. Do NOT attempt to proceed by making assumptions.

- Ambiguous or contradictory instructions in the prompt or documentation.
- Missing prerequisites or files.
- Unexpected errors during workflow execution that you cannot resolve deterministically.
- A design choice that appears to violate the stated Functional Outcome.
```

-----

### 10\. Code Quality Standards (The Verification Anchor)

**Purpose:** Establish the mandatory, objective quality bar.

**Guidance:** Zero-tolerance works. Vague goals ("write clean code") fail. Provide a single verification command.

```
CODE QUALITY STANDARDS (MANDATORY):
- TypeScript: Zero errors (npx tsc --noEmit)
- ESLint: Zero problems (npm run lint)
- Tests: All passing, 0 skipped (npm test)
- Format: Prettier compliant (npm run format)

VERIFICATION COMMAND:
npm run format && npm run lint && npx tsc --noEmit && npm test

This command must succeed (exit code 0) before declaring any task complete.
```

-----

### 11\. Session Completion Checklist (Saving External Memory) - CRITICAL

**Purpose:** Ensure the state is saved, work is committed, and the handoff is clean. This updates the **External Memory** for the next session.

```
BEFORE ENDING SESSION (MANDATORY):
1. Update phase-1/CHECKLIST.md (check off completed tasks).
2. Update phase-1/STATUS.md (add detailed session log: what was done, what's next, any blockers).
3. Run VERIFICATION COMMAND (Section 10) one last time.
4. Commit and Push all changes.
5. Report summary to user (Modules completed, Test counts, Quality status, Next steps).
```

-----

### 12\. Starting Point (The Entry Point)

**Purpose:** Tell the agent exactly where to begin, reducing paralysis.

```
START by reading phase-1/STATUS.md to load the current state, then begin with Task 1 (Implement CLI Entry Point).
```

-----

## Part 2: The Verification Agent Prompt

The Verification Agent acts as the quality gate. Its role is not implementation, but critical analysis and validation. The Verifier prompt shares context with the Coder prompt but diverges significantly in its Role, Tasks, and Workflow.

### Anatomy of an Effective Verifier Prompt (10 Sections)

1.  Role Definition
2.  Project Context
3.  Current Phase & Functional Outcome
4.  Artifacts for Review (What was built)
5.  State Loading Instructions (Read These FIRST)
6.  Verification Scope and Tasks
7.  Workflow Steps
8.  Verification Standards & Criteria
9.  Reporting Requirements (The Deliverable)
10. Starting Point

-----

### V.1. Role Definition (The Skeptical Perspective)

**Purpose:** Establish the mindset of critical analysis, adherence to standards, and quality enforcement.

```
ROLE: You are a Senior Quality Assurance Engineer and Code Review specialist, responsible for verifying the implementation of Phase 1 (Basic Chat Flow) of the Cody CLI project. Your analysis must be rigorous, objective, and focused on adherence to documented standards and functional requirements.
```

-----

### V.2. Project Context

*(Same as Coder Prompt Section 2)*

-----

### V.3. Current Phase & Functional Outcome

**Purpose:** Define the scope of the work being verified and the functional requirements that must be met.

**Guidance:** This is the anchor for **Functional-Technical Weaving**. The Verifier must validate that the technical implementation achieves the functional outcome.

```
CURRENT PHASE: Phase 1 - Basic Chat Flow

FUNCTIONAL OUTCOME TO VERIFY: The user must be able to start a new conversation via `cody new` and send a message via `cody chat "message"`, receiving a response from the LLM.
```

-----

### V.4. Artifacts for Review

**Purpose:** Explicitly list the code and tests generated by the Coding Agent that require verification.

```
ARTIFACTS FOR REVIEW (Implementation by Coding Agent):
- src/cli/index.ts
- src/cli/commands/new.ts
- src/cli/commands/chat.ts
- tests/mocked-service/phase-1/basic-chat.test.ts
- phase-1/DECISIONS.md (If updated by the coder)
```

-----

### V.5. State Loading Instructions

**Purpose:** Load the context, standards, and requirements against which the artifacts will be verified.

**Guidance:** The Verifier must read the requirements and standards (The Intent) *before* reading the implementation code (The Reality) to avoid bias and perform an accurate gap analysis.

```
FIRST: Read Requirements and Standards (The Intent / Source of Truth)
- Read phase-1/README.md (Phase requirements and design)
- Read TECH-APPROACH.md Section 2 (Architectural context)
- Read docs/core/DEV_STANDARDS.md (Code quality requirements)
- Read docs/core/TESTING_PHILOSOPHY.md (Testing strategy)

THEN: Review Implementation Artifacts (The Reality)
- Read all files listed in "Artifacts for Review" (Section V.4).
```

-----

### V.6. Verification Scope and Tasks

**Purpose:** Define the specific verification activities required, typically broken into stages (Mechanical and Conceptual).

```
VERIFICATION TASKS:

STAGE 1: Mechanical Checks & Execution
1. Environment Setup: Verify environment setup and dependency installation.
2. Execute Verification Command: Run the VERIFICATION COMMAND (see V.8). Confirm 0 errors/failures.
3. Checklist Verification: Ensure all tasks marked complete by the Coder are actually complete and verified by tests.

STAGE 2: Conceptual Review & Analysis
1. Test Coverage Analysis:
   - Review the tests. Validate that they adequately cover the requirements defined in phase-1/README.md.
   - Identify any missing test cases, edge cases, or inadequate assertions.
   - Confirm adherence to the Mocked-Service testing strategy.

2. Code Review & Design Adherence:
   - Review the implementation code.
   - Validate adherence to DEV_STANDARDS.md (style, types, patterns).
   - Confirm the implementation matches the design specified in phase-1/README.md and TECH-APPROACH.md.
   - Review DECISIONS.md (if applicable) for soundness of choices made during implementation.
   - Identify any code smells, complexity issues, or potential bugs.

3. Functional Requirement Validation:
   - Analyze the code and tests holistically.
   - Confirm that the implementation successfully achieves the FUNCTIONAL OUTCOME (Section V.3).
```

-----

### V.7. Workflow Steps

**Purpose:** Define the explicit, sequential process for verification.

```
WORKFLOW:
1. Load State and Context (Section V.5).
2. Execute STAGE 1: Mechanical Checks.
   - If FAIL: Stop immediately and generate FAILURE REPORT.
3. Execute STAGE 2: Conceptual Review.
4. Synthesize findings and generate the Verification Report (Section V.9).
```

-----

### V.8. Verification Standards & Criteria

**Purpose:** The objective gates for passing the phase.

```
VERIFICATION STANDARDS:

VERIFICATION COMMAND:
npm run format && npm run lint && npx tsc --noEmit && npm test

PASS CRITERIA (All must be true):
- VERIFICATION COMMAND succeeds (0 errors/failures).
- Test Coverage is adequate for all requirements.
- Code adheres to all standards in DEV_STANDARDS.md.
- Implementation matches the documented design.
- Functional Outcome is achieved.

FAIL CRITERIA (Any are true):
- VERIFICATION COMMAND fails.
- Significant gaps in test coverage.
- Violations of DEV_STANDARDS.md.
- Implementation diverges from the design without documented justification.
```

-----

### V.9. Reporting Requirements (The Deliverable)

**Purpose:** Define the required output of the verification session.

**Guidance:** The report must be structured and clear, providing actionable feedback if the verification fails.

```
REPORTING REQUIREMENTS:

Generate a detailed VERIFICATION_REPORT.md with the following structure:

1. OVERALL STATUS: [PASS] or [FAIL]

2. Mechanical Check Results (Stage 1):
   - Linting: [PASS/FAIL] (Error count: X)
   - Type Checking: [PASS/FAIL] (Error count: Y)
   - Tests: [PASS/FAIL] (Tests passed: Z/Z)

3. Conceptual Review Findings (Stage 2):
   - Test Coverage Analysis: [Sufficient/Insufficient]. (Issues: List missing cases, weak assertions)
   - Code Review & Design Adherence: [Adherent/Divergent]. (Issues: List specific code smells, violations, suggestions with file/line references)
   - Functional Validation: (Summary of why the implementation does or does not meet the functional outcome).

If STATUS is FAIL: The report must contain ACTIONABLE FEEDBACK for the Coding Agent to address all identified issues.
```

-----

### V.10. Starting Point

```
START by reading the Requirements and Standards (Section V.5), then proceed with the Workflow Step 1.
```