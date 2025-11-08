/**
 * Operation handlers for the submission loop.
 * Port of codex-rs/core/src/codex.rs::handlers
 */

import type { Session } from "./session.js";
import type { Config } from "../config.js";
import type { SessionSettingsUpdate } from "./types.js";
import type { ReviewDecision, EventMsg } from "../../protocol/protocol.js";

/**
 * Handle Interrupt operation.
 * Port of handlers::interrupt
 */
export async function interrupt(_session: Session): Promise<void> {
  // TODO: session.interruptTask();
  console.warn("interrupt: not yet implemented");
}

/**
 * Handle OverrideTurnContext operation.
 * Port of handlers::override_turn_context
 */
export async function overrideTurnContext(
  _session: Session,
  _updates: SessionSettingsUpdate,
): Promise<void> {
  // TODO: session.updateSettings(updates);
  console.warn("overrideTurnContext: not yet implemented");
}

/**
 * Handle ExecApproval operation.
 * Port of handlers::exec_approval
 */
export async function execApproval(
  _session: Session,
  _id: string,
  decision: ReviewDecision,
): Promise<void> {
  if (decision === "abort") {
    // TODO: await session.interruptTask();
    console.warn("execApproval(abort): not yet implemented");
  } else {
    // TODO: await session.notifyApproval(id, decision);
    console.warn("execApproval: not yet implemented");
  }
}

/**
 * Handle PatchApproval operation.
 * Port of handlers::patch_approval
 */
export async function patchApproval(
  _session: Session,
  _id: string,
  decision: ReviewDecision,
): Promise<void> {
  if (decision === "abort") {
    // TODO: await session.interruptTask();
    console.warn("patchApproval(abort): not yet implemented");
  } else {
    // TODO: await session.notifyApproval(id, decision);
    console.warn("patchApproval: not yet implemented");
  }
}

/**
 * Handle AddToHistory operation.
 * Port of handlers::add_to_history
 */
export async function addToHistory(
  session: Session,
  _config: Config,
  text: string,
): Promise<void> {
  const conversationId = session.conversationId;

  // Spawn background task to append to message history
  // TODO: Import and call message_history::append_entry
  console.warn("addToHistory: not yet implemented", { conversationId, text });
}

/**
 * Handle Shutdown operation.
 * Port of handlers::shutdown
 * Returns true if loop should exit.
 */
export async function shutdown(
  session: Session,
  subId: string,
): Promise<boolean> {
  // TODO: await session.abortAllTasks(TurnAbortReason.Interrupted);
  console.info("Shutting down Codex instance");

  // Flush rollout recorder
  await session.flushRollout();

  // TODO: Gracefully shutdown rollout recorder
  // const recorder = session.services.rollout.value;
  // if (recorder) {
  //   await recorder.shutdown();
  // }

  // Send shutdown complete event
  const event: EventMsg = {
    type: "shutdown_complete",
  };
  await session.sendEvent(subId, event);

  return true;
}

// TODO: Port remaining handlers in future sections:
// - userInputOrTurn
// - runUserShellCommand
// - getHistoryEntryRequest
// - listMcpTools
// - listCustomPrompts
// - undo
// - compact
// - review
