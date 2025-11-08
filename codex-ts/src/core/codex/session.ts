/**
 * Session class - main orchestration engine.
 * Port of codex-rs/core/src/codex.rs::Session
 */

import { EventEmitter } from "events";
import type { ConversationId } from "../../protocol/conversation-id/index.js";
import type { Event, EventMsg } from "../../protocol/protocol.js";
import type { RolloutItem } from "../rollout.js";
import type {
  SessionConfiguration,
  SessionState,
  SessionServices,
  ActiveTurn,
} from "./types.js";
import * as SessionStateHelpers from "./session-state.js";

/**
 * Internal session state and orchestration.
 * Manages conversation lifecycle, tool execution, and event emission.
 *
 * Port of codex.rs::Session
 */
export class Session {
  readonly conversationId: ConversationId;
  private readonly txEvent: EventEmitter;
  private readonly services: SessionServices;
  private _nextInternalSubId = 0;

  // Private state (unused in skeleton, will be used in later sections)
  // @ts-expect-error - unused until section 3+
  private _state: SessionState;
  // @ts-expect-error - unused until section 3+
  private _activeTurn: ActiveTurn | null = null;

  constructor(
    conversationId: ConversationId,
    sessionConfiguration: SessionConfiguration,
    services: SessionServices,
    txEvent: EventEmitter,
  ) {
    this.conversationId = conversationId;
    this.txEvent = txEvent;
    this._state = SessionStateHelpers.createSessionState(sessionConfiguration);
    this.services = services;
  }

  /**
   * Send an event to clients.
   * Persists to rollout and emits on event channel.
   */
  async sendEvent(subId: string, msg: EventMsg): Promise<void> {
    const event: Event = { id: subId, msg };
    await this.sendEventRaw(event);

    // TODO: Handle legacy events (msg.as_legacy_events)
  }

  /**
   * Send event without legacy processing.
   */
  async sendEventRaw(event: Event): Promise<void> {
    // Persist to rollout
    const rolloutItems: RolloutItem[] = [
      {
        type: "event",
        data: event.msg,
      },
    ];
    await this.persistRolloutItems(rolloutItems);

    // Emit event
    this.txEvent.emit("event", event);
  }

  /**
   * Persist rollout items to disk.
   */
  private async persistRolloutItems(items: RolloutItem[]): Promise<void> {
    const recorder = this.services.rollout.value;
    if (!recorder) {
      return;
    }

    try {
      await recorder.recordItems(items);
    } catch (err) {
      console.error("Failed to record rollout items:", err);
    }
  }

  /**
   * Get the next internal submission ID.
   */
  nextInternalSubId(): string {
    const id = this._nextInternalSubId++;
    return `auto-compact-${id}`;
  }

  /**
   * Get the event transmitter.
   */
  getTxEvent(): EventEmitter {
    return this.txEvent;
  }

  /**
   * Flush rollout writes to disk.
   */
  async flushRollout(): Promise<void> {
    const recorder = this.services.rollout.value;
    if (!recorder) {
      return;
    }

    try {
      await recorder.flush();
    } catch (err) {
      console.warn("Failed to flush rollout recorder:", err);
    }
  }

  /**
   * Get user shell from services.
   */
  userShell() {
    return this.services.userShell;
  }

  /**
   * Get show raw agent reasoning setting.
   */
  showRawAgentReasoning(): boolean {
    return this.services.showRawAgentReasoning;
  }

  // TODO: Port remaining Session methods in future sections:
  // - new_turn, new_turn_with_sub_id
  // - spawn_task, interrupt_task, abort_all_tasks
  // - request_command_approval, request_patch_approval
  // - record_conversation_items, record_into_history
  // - And many more...
}
