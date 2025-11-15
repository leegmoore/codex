This document defines our core testing philosophy, building upon the foundational principles established in the "Masterclass on Agentic Planning and Documentation." It introduces **Service-Mocked Testing** as the specific methodology that enables reliable, high-quality agentic development by balancing the comprehensiveness of integration testing with the speed of unit testing.

# Constitutional Document: The Service-Mocked Testing Methodology

**Purpose:** Define the testing strategy for ensuring quality, reliability, and functional correctness in agentic development.
**Core Principle:** Test behavior at public boundaries, exercise full in-process code flows, and mock only external dependencies.

-----

## 1\. Introduction to Service-Mocked Testing

Our primary testing methodology is **Service-Mocked Testing**.

### 1.1. Definition and Positioning

**Service-Mocked Tests** are integration-level tests written at the public API boundaries of the system. They exercise the full, in-process code flow, but crucially, all external dependencies (services that cross process or machine boundaries) are mocked.

**Positioning:**

  * **Like Integration Tests:** They test the system through key entry points (the public API) and verify how internal components work together across complete workflows.
  * **Unlike Traditional Integration Tests:** They do not rely on external dependencies, avoiding slowness and flakiness.
  * **Like Unit Tests:** They run fast, deterministically, and in isolation (offline), often using the same testing frameworks (e.g., Vitest, Jest).
  * **Unlike Traditional Unit Tests:** They focus on public behavior and boundaries, not isolated internal implementation details.

We call them "Service-Mocked" tests because the defining characteristic is the explicit mocking of external services while the rest of the system runs as an integrated unit.

### 1.2. The Philosophy: Testing Behavior at Boundaries

As established in the Masterclass, **Functional-Technical Weaving** is essential for coherence. Our testing methodology is the verification mechanism for this weaving. We must verify the functional outcome (What the system does) rather than the technical implementation (How it does it).

Traditional unit testing often fails here. It focuses on implementation, leading to brittle tests tightly coupled to internal code structure. These tests break during refactoring even if behavior is unchanged, providing a false sense of security (high test count, low confidence in the integrated system).

Service-Mocked Testing focuses on the stable public boundaries—the promises the API makes to its consumers.

**Benefits:**

1.  **Behavioral Focus:** Tests verify actual system behavior and full code paths, ensuring the system works as intended from the perspective of the consumer.
2.  **Refactoring Safety:** Internal implementation can be refactored freely as long as the behavior at the public boundary is maintained.
3.  **Optimized Signal Density (Bespoke Depth):** We achieve high coverage through fewer, more meaningful tests by focusing effort on the critical entry points, optimizing the signal density of the test suite.

-----

## 2\. The Two-Layer Testing Strategy

We employ a Two-Layer strategy to balance development speed with real-world validation.

### Layer 1: Service-Mocked Tests (The Inner Loop)

  * **Focus:** Integration wiring correctness, business logic, and adherence to the public API definition.
  * **Characteristics:** Fast, deterministic, offline.
  * **Role:** The primary test layer for development and Continuous Integration (CI). Provides the rapid feedback loop necessary for TDD.
  * **Coverage:** Comprehensive coverage of all scenarios, permutations, and edge cases.

### Layer 2: Model Integration Tests (The Outer Loop)

  * **Focus:** Real-world provider behavior, configuration parameters, and actual compatibility with external services (e.g., LLM APIs).
  * **Characteristics:** Slower, uses real API calls (typically with cheap/fast models), requires network access.
  * **Role:** Final validation layer before release or when integrating new external services.
  * **Coverage:** Focused on critical paths to validate integration without excessive time or cost.

**The Balance:** Layer 1 ensures the system is correct according to our specifications. Layer 2 ensures our specifications match the reality of the external services.

-----

## 3\. Core Principles of Service-Mocked Testing

### 3.1. Identify Public Boundaries

**A Public Boundary is the API entry point that external code calls.**

  * **Libraries:** Public methods (e.g., `ConversationManager.createConversation()`), constructors, exported functions.
  * **REST APIs:** HTTP endpoints (e.g., `POST /conversations`).

During planning (at the 10k ft **Altitude**), we must identify and document the specifications and expected behaviors of these boundaries. These become the targets for our tests.

### 3.2. Define Mocking Boundaries (The Distinction)

Clarity on what to mock is essential.

**External Boundaries (ALWAYS MOCK):** Anything that crosses the process or machine boundary.

  * Network calls (LLM APIs, databases, external services).
  * Filesystem operations (File I/O).
  * Process spawning (shell commands).
  * System time (for time-dependent logic).

**Internal Logic (NEVER MOCK - The Rule of Consultation):** In-process logic within our codebase.

> **The Rule of Consultation:** Do not mock in-process logic without explicit consultation and confirmation with the user. The fundamental principle of Service-Mocked Testing is to exercise the full internal stack. Mocking internal components undermines this principle. Any deviation requires explicit approval.

**Strategy:** Use dependency injection to provide test doubles (e.g., passing a `MockModelClient` to the `ConversationManager`).

### 3.3. Tests Derive from Public Boundaries (The Scaffold)

Once the public boundary (the API definition) is established, the test cases are obvious. This provides a rigid **External Metacognitive Scaffold** for the execution agent, removing ambiguity about what to test.

**API Definition Example:**

```typescript
class ConversationManager {
  // Creates a new conversation. Throws ConfigurationError if invalid.
  createConversation(config: ConversationConfig): Promise<Conversation>
}
```

**Derived Test Cases (Mechanical Execution):**

1.  Happy Path: Can create a conversation with valid config.
2.  State Verification: Created conversation has a unique ID and is stored internally.
3.  Error Case: Invalid config throws `ConfigurationError`.

The agent does not need to interpret what to test. The API defines the surface; the agent tests the surface (happy paths, error cases, edge cases, and state verification).

### 3.4. The TDD Workflow: Boundary-First

We use a Test-Driven Development (TDD) workflow anchored to the public boundaries, providing a reliable, mechanical process for agents.

**Step 1: Define the Public Boundary** (Planning Phase)
Identify the API surface. Document signatures, behavior, and errors.

**Step 2: Write Service-Mocked Tests Against the Boundary** (Execution Phase - Coder)
Create tests at the boundary. Mock external dependencies. Write test cases derived from the API definition. *Tests should fail (Red).*

**Step 3: Implement to Green** (Execution Phase - Coder)
Write the minimal code required to pass the tests. The internal structure is flexible, exercising the full code flow. *Tests should pass (Green).*

**Step 4: Refactor** (Execution Phase - Coder/Reviewer)
Refactor the internal implementation for clarity and performance. Tests remain green, ensuring the public behavior is maintained.

-----

## 4\. Advanced Techniques

### 4.1. Handling Stateful Interactions and Behavioral Flows

Many systems involve stateful objects (like a `Conversation` object) where the sequence of operations matters. Service-Mocked tests must validate these sequences and the resulting behavioral flows. This aligns with the **Narrative Substrate**—testing the journey, not just the steps.

**Strategy:** Write multi-step tests that simulate a user flow.

```typescript
it('handles multi-turn conversation with tool execution flow', async () => {
  // Setup: Mocks configured to require a tool call
  const manager = new ConversationManager({client: mockClient});
  const conv = await manager.createConversation(config);

  // Turn 1: User message -> Model requests tool
  const response1 = await conv.sendMessage("Read the file.");
  expect(conv.state).toBe('AWAITING_TOOL'); // Verify state transition

  // Turn 2: Execute tool -> Model summarizes
  const response2 = await conv.executeTools();
  expect(conv.state).toBe('READY'); // Verify state transition

  // Verification: Ensure the full behavioral flow was orchestrated correctly
  expect(mockClient.sendMessage).toHaveBeenCalledTimes(2);
});
```

### 4.2. Mock Creation Patterns

Create reusable, configurable mock factories in a dedicated `tests/mocks/` directory to streamline test creation.

```typescript
// tests/mocks/model-client.ts
export function createMockClient(responses?: MockResponse[]) {
  const mock = { sendMessage: vi.fn() };
  // Configure mock to return the sequence of predefined responses.
  (responses || []).forEach(response => {
    mock.sendMessage.mockResolvedValueOnce(response);
  });
  return mock;
}
```

-----

## 5\. Practical Application in Planning

The responsibility for defining the testing strategy lies with the Planning Agent during the creation of the Phase README (10k ft **Altitude**).

**For each phase, the Planning Agent must document:**

**1. Public Boundaries Introduced:**

```
Phase 1: Basic Chat
New Boundaries: ConversationManager.createConversation(), Conversation.sendMessage()
```

**2. External Mocks Needed:**

```
External Mocks:
- ModelClient (Mock: Network access to LLM API)
- RolloutRecorder (Mock: Filesystem access for JSONL persistence)
```

**3. Test Scenarios (Derived from the Boundary Definition):**

```
Test Scenarios for createConversation():
- ✅ Creates with valid config (Behavioral check)
- ✅ Assigns unique conversation ID (State check)
- ❌ Throws on invalid config (Error check)
```

By providing this information in the planning documentation, the Coding Agent receives the complete scaffolding required to implement the Service-Mocked TDD workflow reliably.

-----

## 6\. Summary

The Service-Mocked Testing Methodology ensures alignment between functional requirements and technical implementation (**Weaving**). By focusing on behavior at public boundaries and mocking external services, it provides a robust **Scaffold** for agentic execution. This approach optimizes testing effort (**Bespoke Depth**) while providing the comprehensive coverage needed to ensure the resulting systems are reliable, verifiable, and maintainable.