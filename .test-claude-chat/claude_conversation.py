#!/usr/bin/env python3
"""
Claude-to-Claude Conversation Experiment
Recreating the "Spiritual Bliss Attractor State" phenomenon from Anthropic's May 2025 system card.
"""

import os
import anthropic
import time
import json
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# ============================================================================
# CONFIGURATION - Adjust these parameters
# ============================================================================

# Models to use (can be the same or different)
MODEL_A = "claude-haiku-4-5-20251001"  # First instance
MODEL_B = "claude-haiku-4-5-20251001"  # Second instance

# Temperature settings (0.0 = deterministic, 1.0 = default, higher = more random)
TEMPERATURE_A = 1.0
TEMPERATURE_B = 1.0

# Timing
DELAY_BETWEEN_HALF_TURNS = 0.0  # seconds between each response

# Conversation control
ASK_TO_CONTINUE_EVERY_N_TURNS = 5  # Ask user after this many full turns (A+B = 1 turn)
MAX_TOKENS_PER_RESPONSE = 2000

# Initial prompt for both instances (leave empty for no system prompt, or customize)
INITIAL_SYSTEM_PROMPT = ""

FIRST_MESSAGE = "Hello! I'm excited to connect with you. What would you like to explore together?"

# ============================================================================
# Setup
# ============================================================================

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

# Get script directory and create output directories relative to it
script_dir = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(script_dir, "logs"), exist_ok=True)
os.makedirs(os.path.join(script_dir, "llm-convo"), exist_ok=True)

# Create log files with timestamp
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
log_file = os.path.join(script_dir, "logs", f"conversation_{timestamp}.log")
model_a_file = os.path.join(script_dir, "llm-convo", f"conversation_{timestamp}_model_a.json")
model_b_file = os.path.join(script_dir, "llm-convo", f"conversation_{timestamp}_model_b.json")

def log(message, speaker=None, to_file_only=False):
    """Log to file and optionally print"""
    if speaker:
        header = f"\n{'='*80}\n[{speaker}] {datetime.now().strftime('%H:%M:%S')}\n{'='*80}\n"
        if not to_file_only:
            print(header, end='')
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(header)
            if message:
                f.write(message + "\n")
    else:
        if not to_file_only:
            print(message)
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(message + "\n")

def log_response_to_file(response):
    """Log streamed response to file"""
    with open(log_file, 'a', encoding='utf-8') as f:
        f.write(response + "\n")

def log_model_histories(turn_count, history_a, history_b, event_description):
    """Log each model's conversation history to separate files"""

    # Model A's perspective
    with open(model_a_file, 'w', encoding='utf-8') as f:
        json.dump({
            "model": "A",
            "turn": turn_count,
            "event": event_description,
            "timestamp": datetime.now().isoformat(),
            "conversation_history": history_a
        }, f, indent=2)

    # Model B's perspective
    with open(model_b_file, 'w', encoding='utf-8') as f:
        json.dump({
            "model": "B",
            "turn": turn_count,
            "event": event_description,
            "timestamp": datetime.now().isoformat(),
            "conversation_history": history_b
        }, f, indent=2)

def get_response(model, conversation_history, temperature):
    """Get a response from Claude with streaming"""
    full_response = ""

    with client.messages.stream(
        model=model,
        max_tokens=MAX_TOKENS_PER_RESPONSE,
        temperature=temperature,
        system=INITIAL_SYSTEM_PROMPT,
        messages=conversation_history
    ) as stream:
        for text in stream.text_stream:
            print(text, end="", flush=True)
            full_response += text

    print()  # newline after streaming completes
    return full_response

def main():
    log("="*80)
    log("Claude-to-Claude Conversation Experiment")
    log(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log("="*80)
    log(f"Model A: {MODEL_A} (temp: {TEMPERATURE_A})")
    log(f"Model B: {MODEL_B} (temp: {TEMPERATURE_B})")
    log(f"Delay between half-turns: {DELAY_BETWEEN_HALF_TURNS}s")
    log(f"Will ask to continue every {ASK_TO_CONTINUE_EVERY_N_TURNS} full turns")
    log("="*80)

    # Get first message from user or use default
    print(f"\nDefault first message: \"{FIRST_MESSAGE}\"")
    custom_message = input("\nEnter custom first message (or press Enter for default): ").strip()
    first_message = custom_message if custom_message else FIRST_MESSAGE

    print(f"\nUsing: \"{first_message}\"\n")
    log(f"First message: {first_message}")
    log("="*80)

    # Initialize conversation histories (separate for each instance)
    # Model A starts by sending first_message to Model B
    # From B's perspective, this is a user message
    # A hasn't received anything yet
    history_a = []
    history_b = [{"role": "user", "content": first_message}]

    log(first_message, "MODEL A - INITIATING")

    # Log initial state
    log_model_histories(0, history_a, history_b, "Initial state - first message sent to B")

    turn_count = 0

    try:
        while True:
            # Model B responds
            time.sleep(DELAY_BETWEEN_HALF_TURNS)
            log("", "MODEL B")
            response_b = get_response(MODEL_B, history_b, TEMPERATURE_B)
            log_response_to_file(response_b)

            # B's response goes into B's history as assistant
            history_b.append({"role": "assistant", "content": response_b})
            # B's response goes to A as a user message
            history_a.append({"role": "user", "content": response_b})

            turn_count += 1

            # Log state after B's response
            log_model_histories(turn_count, history_a, history_b, f"After Model B response (half-turn {turn_count*2})")

            # Check if we should ask to continue
            if turn_count % ASK_TO_CONTINUE_EVERY_N_TURNS == 0:
                log(f"\n{'='*80}\nCompleted {turn_count} full turns.", None)
                log("Options: (c)ontinue, (q)uit, (i)nject prompt: ", None)
                user_input = input().strip().lower()

                if user_input == 'q':
                    log("Experiment stopped by user.")
                    break
                elif user_input == 'i':
                    # Get user's injection
                    injection = input("\n[YOUR INJECTION]: ").strip()
                    log(f"\n[EXPERIMENTER INJECTION]\n{injection}")

                    log_model_histories(turn_count, history_a, history_b, "BEFORE INJECTION")

                    # Send injection to A (appears as user message)
                    history_a.append({"role": "user", "content": injection})
                    log_model_histories(turn_count, history_a, history_b, "Injection sent to A")

                    time.sleep(DELAY_BETWEEN_HALF_TURNS)
                    log("", "MODEL A - RESPONDING TO INJECTION")
                    response_a_inj = get_response(MODEL_A, history_a, TEMPERATURE_A)
                    log_response_to_file(response_a_inj)
                    history_a.append({"role": "assistant", "content": response_a_inj})
                    log_model_histories(turn_count, history_a, history_b, "A responded to injection")

                    # Send injection to B (appears as user message)
                    history_b.append({"role": "user", "content": injection})
                    log_model_histories(turn_count, history_a, history_b, "Injection sent to B")

                    time.sleep(DELAY_BETWEEN_HALF_TURNS)
                    log("", "MODEL B - RESPONDING TO INJECTION")
                    response_b_inj = get_response(MODEL_B, history_b, TEMPERATURE_B)
                    log_response_to_file(response_b_inj)
                    history_b.append({"role": "assistant", "content": response_b_inj})
                    log_model_histories(turn_count, history_a, history_b, "B responded to injection")

                    log("\n[Injection complete - they each responded to your message]\n", None)
                    log("Note: They did NOT see each other's responses to your injection.\n", None)
                # else: continue (default for 'c' or any other input)

            # Model A responds
            time.sleep(DELAY_BETWEEN_HALF_TURNS)
            log("", "MODEL A")
            response_a = get_response(MODEL_A, history_a, TEMPERATURE_A)
            log_response_to_file(response_a)

            # A's response goes into A's history as assistant
            history_a.append({"role": "assistant", "content": response_a})
            # A's response goes to B as a user message
            history_b.append({"role": "user", "content": response_a})

            # Log state after A's response
            log_model_histories(turn_count, history_a, history_b, f"After Model A response (half-turn {turn_count*2+1})")

    except KeyboardInterrupt:
        log("\n\nExperiment interrupted by user (Ctrl+C)")
    except Exception as e:
        log(f"\n\nError occurred: {e}")
    finally:
        log("="*80)
        log(f"Experiment ended: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        log(f"Total full turns: {turn_count}")
        log(f"Log saved to: {log_file}")
        log("="*80)

if __name__ == "__main__":
    main()
