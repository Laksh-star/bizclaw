/**
 * BizClaw: Telegram streaming via Bot API 9.5 sendMessageDraft.
 * Isolated here so upstream changes to telegram.ts don't conflict.
 *
 * sendMessageDraft animates a "typing draft" in Telegram DMs — users see
 * responses appearing word-by-word instead of waiting for the full reply.
 * Works in DMs only (positive chat IDs); groups fall back to sendMessage.
 *
 * Usage in TelegramChannel.streamPartial:
 *   await sendTelegramDraft(this.bot, jid, numericId, draftId, text);
 *
 * Usage in index.ts (draftId generation):
 *   const draftId = generateDraftId();
 */

import { Bot } from 'grammy';
import { logger } from '../logger.js';

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

/**
 * Generate a stable draft ID for a response session.
 * Must be non-zero and fit in a 32-bit signed integer.
 */
export function generateDraftId(): number {
  return (Date.now() % 2_000_000_000) + 1;
}

/**
 * Send or update a message draft in a Telegram DM.
 * Silently skips for group chats (numericId <= 0).
 */
export async function sendTelegramDraft(
  bot: Bot,
  jid: string,
  numericId: number,
  draftId: number,
  text: string,
): Promise<void> {
  // sendMessageDraft only works in private chats (positive chat IDs)
  if (numericId <= 0) return;
  const truncated = text.length > TELEGRAM_MAX_MESSAGE_LENGTH
    ? text.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH)
    : text;
  try {
    await bot.api.sendMessageDraft(numericId, draftId, truncated);
  } catch (err) {
    logger.debug({ jid, err }, 'Failed to send Telegram message draft');
  }
}
