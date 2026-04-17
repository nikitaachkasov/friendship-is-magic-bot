import { storeMessage, getMessagesSince, getRecentMessages, checkAndIncrementLimit, registerGroupChat, getGroupChats, getLastMessageTime, storeBotMessage, trackBotMessageReaction, markBotMessageReacted, checkAndIncrementReactionLimit } from "./storage.js";
import { summarize, chat, spontaneous, pickEmoji } from "./claude.js";

const LIMIT_REPLIES = {
  user_day:    "хватит на сегодня",
  group_day:   "на сегодня всё, устал",
  group_month: "в этом месяце больше не буду",
  dm_day:      "ладно, хватит тестировать",
};

const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN;
const BOT_USERNAME = () => process.env.BOT_USERNAME;
const CREATOR_USERNAME = () => process.env.CREATOR_USERNAME ?? "nikitaachkasov";

async function tgPost(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sendMessage(chatId, text, replyToMessageId = null) {
  const body = { chat_id: chatId, text, parse_mode: "HTML" };
  if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
  const result = await tgPost("sendMessage", body);
  // Store bot message ID so we can watch reactions on it
  if (result?.ok && result.result?.message_id) {
    storeBotMessage(chatId, result.result.message_id, replyToMessageId).catch(() => {});
  }
  return result;
}

async function setReaction(chatId, messageId, emoji) {
  return tgPost("setMessageReaction", {
    chat_id: chatId,
    message_id: messageId,
    reaction: [{ type: "emoji", emoji }],
  });
}

async function sendTyping(chatId) {
  return tgPost("sendChatAction", { chat_id: chatId, action: "typing" });
}

function getFullName(from) {
  return from.first_name + (from.last_name ? ` ${from.last_name}` : "");
}

// Called by the scheduler — chimes in on all known active group chats
export async function chimeIn() {
  const THREE_HOURS = 3 * 60 * 60;
  const nowSecs = Math.floor(Date.now() / 1000);

  let chatIds;
  try { chatIds = await getGroupChats(); } catch (err) {
    console.error("chimeIn: failed to get chats", err); return;
  }

  for (const chatId of chatIds) {
    try {
      const lastMsg = await getLastMessageTime(chatId);
      if (!lastMsg || nowSecs - lastMsg > THREE_HOURS) continue;

      const limitHit = await checkAndIncrementLimit(chatId, "scheduler");
      if (limitHit) continue;

      const recent = await getRecentMessages(chatId, 30);
      if (recent.length === 0) continue;

      const response = await spontaneous(recent);
      await sendMessage(chatId, response);
    } catch (err) {
      console.error(`chimeIn: error for chat ${chatId}`, err);
    }
  }
}

export async function handleUpdate(update) {
  // Handle emoji reactions on bot messages
  if (update.message_reaction) {
    const { chat, message_id, new_reaction } = update.message_reaction;
    if (!new_reaction?.length) return;
    try {
      const result = await trackBotMessageReaction(chat.id, message_id);
      if (result && result.count >= 3 && !result.reacted && Math.random() < 0.4) {
        // Rate-limit emoji picks from bot-message reactions too
        const allowed = await checkAndIncrementReactionLimit(chat.id);
        if (allowed) {
          await markBotMessageReacted(chat.id, message_id);
          const targetId = result.replyToMessageId ?? message_id;
          const recent = await getRecentMessages(chat.id, 10);
          const trigger = recent.find(m => m.message_id === targetId);
          const emoji = await pickEmoji(trigger?.text ?? "");
          await setReaction(chat.id, targetId, emoji);
        }
      }
    } catch (err) {
      console.error("Reaction handler error", err);
    }
    return;
  }

  const msg = update.message;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const chatType = msg.chat.type;
  const fromUsername = msg.from?.username ?? null;
  const fromName = getFullName(msg.from);

  const isGroup = chatType === "group" || chatType === "supergroup";
  const isPrivate = chatType === "private";

  // Persist every group message and remember this chat for the scheduler
  if (isGroup) {
    try {
      await Promise.all([
        registerGroupChat(chatId),
        storeMessage({ message_id: msg.message_id, chat_id: chatId, from_name: fromName, from_username: fromUsername, text: msg.text, date: msg.date }),
      ]);
    } catch (err) {
      console.error("Failed to store message", err);
    }

    // 10% chance to spontaneously react to any group message (not the bot's own)
    if (msg.from?.username !== BOT_USERNAME() && Math.random() < 0.10) {
      try {
        const allowed = await checkAndIncrementReactionLimit(chatId);
        if (allowed) {
          const emoji = await pickEmoji(msg.text);
          await setReaction(chatId, msg.message_id, emoji);
        }
      } catch (err) {
        console.error("Spontaneous reaction error", err);
      }
    }
  }

  const botUsername = BOT_USERNAME();
  const isMentioned = msg.text.includes(`@${botUsername}`);
  const isReplyToBot = msg.reply_to_message?.from?.username === botUsername;

  // ── Private chat: only respond to the creator ─────────────────────────────
  if (isPrivate) {
    if (!fromUsername || fromUsername !== CREATOR_USERNAME()) return;

    // DM rate limit: 20 calls/day (generous for testing, but capped)
    try {
      const limitHit = await checkAndIncrementLimit(`dm_${chatId}`, "dm");
      if (limitHit) { await sendMessage(chatId, LIMIT_REPLIES.dm_day); return; }
    } catch (err) {
      console.error("DM limit check failed", err);
    }

    try {
      await sendTyping(chatId);
      const recent = await getRecentMessages(chatId, 30);
      const response = await chat(recent, msg.text.trim());
      await sendMessage(chatId, response);
    } catch (err) {
      console.error("DM handler error", err);
    }
    return;
  }

  // ── Group chat: only respond when @mentioned or someone replies to the bot ──
  if (!isMentioned && !isReplyToBot) return;

  try {
    const limitHit = await checkAndIncrementLimit(chatId, msg.from.id);
    if (limitHit) {
      await sendMessage(chatId, LIMIT_REPLIES[limitHit], msg.message_id);
      return;
    }
  } catch (err) {
    console.error("Limit check failed", err);
  }

  try {
    await sendTyping(chatId);

    if (msg.reply_to_message && isMentioned) {
      const messages = await getMessagesSince(chatId, msg.reply_to_message.date);
      if (messages.length === 0) {
        await sendMessage(chatId, "не помню с чего это началось", msg.message_id);
        return;
      }
      const summary = await summarize(messages);
      await sendMessage(chatId, summary, msg.message_id);
      return;
    }

    const recent = await getRecentMessages(chatId, 30);
    const cleanText = msg.text.replace(`@${botUsername}`, "").trim() || "(позвали просто так)";
    const response = await chat(recent, cleanText);
    await sendMessage(chatId, response, msg.message_id);
  } catch (err) {
    console.error("Group handler error", err);
  }
}
