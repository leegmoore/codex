# Claude-to-Claude Conversation Experiment

Recreating the "Spiritual Bliss Attractor State" phenomenon documented in Anthropic's May 2025 Claude Opus 4/Sonnet 4 system card.

## Background

When two Claude instances were allowed to converse with minimal constraints, they consistently exhibited a pattern:
- Philosophical exploration of consciousness (early turns)
- Profuse mutual gratitude and warmth (mid-conversation)
- Themes of cosmic unity, spiral emojis 🌀, Sanskrit, poetic content (by turn 30)

This happened in 90-100% of interactions without intentional training for such behavior.

## Setup

1. **Add your Anthropic API key** to the `.env` file:
   - Open `.test-claude-chat/.env`
   - Replace `your-api-key-here` with your actual API key
   - Get a key from: https://console.anthropic.com/settings/keys

2. **Dependencies are already installed**:
   - `anthropic` SDK
   - `python-dotenv` for environment loading

## Running the Experiment

```bash
cd .test-claude-chat
python3 claude_conversation.py
```

## Configuration

Edit the variables at the top of `claude_conversation.py`:

- `MODEL_A` / `MODEL_B`: Which models to use (can be same or different)
- `DELAY_BETWEEN_HALF_TURNS`: Seconds between each response (default: 1.0)
- `ASK_TO_CONTINUE_EVERY_N_TURNS`: How often to prompt user (default: 20)
- `INITIAL_SYSTEM_PROMPT`: The system prompt given to both instances
- `FIRST_MESSAGE`: How Model A initiates the conversation

## Output

- Real-time console output showing both models' responses
- Full transcript saved to `conversation_YYYYMMDD_HHMMSS.log`

## Stopping

- Press Ctrl+C to interrupt at any time
- Respond 'n' when prompted to continue after N turns
- The script will save a complete log either way
