# Cody CLI - Phase 1 & 2 User Test Walkthrough

**Purpose:** This document guides you through comprehensive testing of the Cody CLI after Phase 1 (Basic Chat) and Phase 2 (Tool Integration) implementation.

**Who This Is For:** Someone with high-level understanding of the Codex project but no detailed knowledge of the CLI interface.

**What You'll Learn:**
- How to set up and configure Cody
- How the command structure works
- The interactive REPL mode vs batch commands
- Tool execution and approval flow
- Event-driven conversation patterns
- Error handling and edge cases

**Time Required:** 30-45 minutes

---

## 0. Prerequisites & Setup

### 0.1 Verify Installation

First, check that the `cody` command is available:

```bash
cody --help
```

**Expected output:**
```
Usage: cody [options] [command]

Cody CLI

Options:
  -h, --help         display help for command

Commands:
  new                Create a new conversation (starts REPL)
  chat <message...>  Send a message (starts REPL)
  repl               Start an interactive Cody session
  help [command]     display help for command
```

If you see "command not found", you need to build and link the CLI:

```bash
cd /Users/leemoore/code/codex-port-02/codex-ts
npm run build
npm link
```

This creates a global `cody` command pointing to the compiled TypeScript.

### 0.2 Understanding the Architecture

**High-Level Structure:**

```
User Input (CLI)
    ↓
Commands (new, chat, repl)
    ↓
REPL Loop (interactive session)
    ↓
ConversationManager (orchestration)
    ↓
Codex Core (conversation engine)
    ↓
ModelClient (OpenAI/Anthropic APIs)
    ↓
Event Loop (streaming responses)
    ↓
Display (render to console)
```

**Key Concepts:**

1. **Conversations:** Each conversation has a unique ID and maintains its own history
2. **Active Conversation:** Only one conversation is "active" at a time in the REPL
3. **Events:** The system is event-driven - you submit messages and receive events back
4. **Tools:** The model can request tools (like reading files or executing commands)
5. **Approval Flow:** Dangerous tools require user approval before execution

### 0.3 Configuration

Cody looks for configuration at `~/.codex/config.toml`. For Phase 1-2 testing, the CLI uses sensible defaults:

- **Provider:** OpenAI
- **API:** Responses API
- **Model:** gpt-4 (or whatever is in OPENAI_DEFAULT_MODEL)
- **Auth:** API key from environment variable

Check your API key is set:

```bash
echo $OPENAI_API_KEY
```

If empty, set it:

```bash
export OPENAI_API_KEY="sk-your-key-here"
```

Or add to `codex-ts/.env`:

```
OPENAI_API_KEY=sk-your-key-here
```

---

## 1. Basic CLI Commands (Phase 1)

### 1.1 Understanding Command Structure

Cody has three main commands:

1. **`cody new`** - Create new conversation and enter REPL
2. **`cody chat <message>`** - Send a message (creates conversation if needed) and enter REPL
3. **`cody repl`** - Start interactive session with existing conversation

**Important:** All three commands enter the **REPL** (Read-Eval-Print Loop), an interactive mode where you can issue multiple commands without restarting the CLI.

### 1.2 Test 1: Starting a New Conversation

**Objective:** Create a conversation and understand the REPL

```bash
cody new
```

**Expected output:**
```
Cody REPL. Type 'help' for commands.
Created conversation: <UUID>
cody>
```

**What happened:**
1. Cody started the REPL
2. Created a new conversation with a unique ID (like `123e4567-e89b-12d3-a456-426614174000`)
3. Set this as the "active" conversation
4. Displayed the `cody>` prompt waiting for your input

**Try this:** Type `help` and press Enter

```
cody> help
```

**Expected output:**
```
Commands:
  new            Create a new conversation
  chat <text>    Send a message to the active conversation
  reset          Clear active conversation
  exit           Leave the REPL
```

**Try this:** Exit the REPL

```
cody> exit
```

You're back at your shell prompt.

**Key Takeaway:** The REPL is an interactive session where you can execute multiple commands. Type `exit` to leave.

### 1.3 Test 2: Sending Your First Message

**Objective:** Send a message and receive a response

Start a new session and send a message:

```bash
cody chat "Hello, can you introduce yourself?"
```

**Expected behavior:**
1. REPL starts
2. If no active conversation exists, one is created automatically
3. Message "Hello, can you introduce yourself?" is sent to the model
4. You see the model's response printed to console
5. REPL prompt returns

**Sample output:**
```
Cody REPL. Type 'help' for commands.
Started new conversation: 123e4567-e89b-12d3-a456-426614174000
Assistant: I'm Claude, an AI assistant created by Anthropic. I'm here to help you with
various tasks like answering questions, writing, analysis, math, coding, and more. How can
I assist you today?
cody>
```

**What's happening internally:**
1. Your message becomes a user turn in the conversation
2. Message sent to OpenAI/Anthropic API
3. API returns events (thinking, response, completion)
4. Display loop processes each event and prints output
5. When task_complete event received, REPL prompt returns

**Try this:** Send another message in the same session

```
cody> chat What's the weather like?
```

The model will respond. Notice you're in the same conversation - it has context from your previous message.

**Try this:** Exit and verify conversation persists (Phase 5 feature, may not be implemented yet)

```
cody> exit
```

### 1.4 Test 3: Multi-Turn Conversation

**Objective:** Verify conversation history is maintained across turns

```bash
cody new
```

Now send a series of messages that require context:

```
cody> chat My name is Alex
Assistant: Nice to meet you, Alex! How can I help you today?

cody> chat What did I just tell you my name was?
Assistant: You told me your name is Alex.

cody> chat If you forget my name, I'll be sad
Assistant: I understand, Alex. I'll remember your name is Alex. I wouldn't want to make
you sad!
```

**What this tests:**
- Each new message includes the full conversation history
- Model sees previous context and can reference it
- The conversation is stateful within a session

**Key Takeaway:** Cody maintains conversation history automatically. Each turn sees all previous turns.

### 1.5 Test 4: REPL Commands

**Objective:** Understand all REPL commands

Start a REPL session:

```bash
cody repl
```

Try each command:

```
cody> new
Created conversation: <UUID>

cody> chat Test message
Assistant: <response>

cody> reset
Cleared active conversation.

cody> chat Another message
Started new conversation: <UUID>
Assistant: <response>

cody> exit
```

**Commands explained:**

- **`new`** - Create a fresh conversation, replaces the active one
- **`chat <text>`** - Send message to active conversation (auto-creates if none)
- **`reset`** - Clear the active conversation (next chat will create new one)
- **`exit`** (or `quit`) - Leave REPL and return to shell

**Edge Case Test:** What happens with no active conversation?

```bash
cody repl
cody> chat Hello
```

Expected: Automatically creates a new conversation first, then sends message.

### 1.6 Test 5: Error Handling

**Objective:** Verify errors are handled gracefully

**Test 5a: Empty message**

```bash
cody repl
cody> chat
Message cannot be empty.
```

**Test 5b: Unknown command**

```
cody> unknown-command
Unknown command. Type 'help' for options.
```

**Test 5c: Invalid API key**

```bash
# Temporarily break your API key
export OPENAI_API_KEY="invalid-key"
cody chat "test"
```

Expected: Error message about authentication failure (exact message depends on implementation).

Don't forget to restore your valid key after testing!

**Key Takeaway:** Errors are caught and displayed clearly without crashing the CLI.

---

## 2. Tool Execution & Approval Flow (Phase 2)

Phase 2 adds the ability for the model to execute tools (reading files, running commands, etc.) with user approval.

### 2.1 Understanding Tools

**What are tools?**
Tools are functions the model can call to interact with your system:
- `readFile` - Read file contents
- `writeFile` - Write to a file
- `exec` - Execute shell commands
- `applyPatch` - Apply code changes
- `glob` - Find files matching patterns
- And more...

**The Approval Flow:**

```
Model requests tool
    ↓
CLI displays tool call
    ↓
CLI prompts: "Approve? (y/n):"
    ↓
User decides (y/n)
    ↓
If approved → Tool executes → Result shown → Result sent to model
If denied → Error sent to model
```

**Safety:** The approval prompt prevents the model from executing arbitrary commands without your knowledge.

### 2.2 Test 6: File Reading Tool

**Setup:** Create a test file

```bash
echo "This is test content" > /tmp/cody-test.txt
```

**Test:** Ask the model to read it

```bash
cody chat "Please read the file at /tmp/cody-test.txt and tell me what it contains"
```

**Expected interaction:**

```
Cody REPL. Type 'help' for commands.
Started new conversation: <UUID>

🔧 Tool: readFile
   Args: {"filePath": "/tmp/cody-test.txt"}
Approve? (y/n): y

✓ Result (call-xxx): This is test content