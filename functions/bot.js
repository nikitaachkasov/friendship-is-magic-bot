import { storeMessage, getMessagesSince, getRecentMessages, checkAndIncrementLimit, registerGroupChat, getGroupChats, getLastMessageTime } from "./storage.js";

const LIMIT_REPLIES = {
  user_day:    "— Ты уже достаточно нас потревожил сегодня.\n— Согласен. Приходи завтра. Или не приходи.",
  group_day:   "— На сегодня мы закрыты.\n— Мы вообще-то всегда закрыты, но сегодня особенно.",
  group_month: "— Вы исчерпали наш месячный запас терпения.\n— У нас его и не было!",
};
import { summarize, chat, spontaneous } from "./claude.js";

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
  return tgPost("sendMessage", body);
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

  const chatIds = await getGroupChats();
  for (const chatId of chatIds) {
    const lastMsg = await getLastMessageTime(chatId);
    if (!lastMsg || nowSecs - lastMsg > THREE_HOURS) continue;

    const limitHit = await checkAndIncrementLimit(chatId, "scheduler");
    if (limitHit) continue;

    const recent = await getRecentMessages(chatId, 30);
    if (recent.length === 0) continue;

    const response = await spontaneous(recent);
    await sendMessage(chatId, response);
  }
}

export async function handleUpdate(update) {
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
    await Promise.all([
      registerGroupChat(chatId),
      storeMessage({
      message_id: msg.message_id,
      chat_id: chatId,
      from_name: fromName,
      from_username: fromUsername,
      text: msg.text,
      date: msg.date,
    }),
    ]);
  }

  const botUsername = BOT_USERNAME();
  const isMentioned = msg.text.includes(`@${botUsername}`);

  // ── Private chat: only respond to the creator ─────────────────────────────
  if (isPrivate) {
    if (fromUsername !== CREATOR_USERNAME()) return;
    await sendTyping(chatId);
    // Use chat_id as a pseudo-history key for DMs
    const recent = await getRecentMessages(chatId, 30);
    const cleanText = msg.text.trim();
    const response = await chat(recent, cleanText);
    await sendMessage(chatId, response);
    return;
  }

  // ── Group chat: only respond when @mentioned ───────────────────────────────
  if (!isMentioned) return;

  const limitHit = await checkAndIncrementLimit(chatId, msg.from.id);
  if (limitHit) {
    await sendMessage(chatId, LIMIT_REPLIES[limitHit], msg.message_id);
    return;
  }

  await sendTyping(chatId);

  // @mention + reply-to → summarize from that message to now
  if (msg.reply_to_message) {
    const anchor = msg.reply_to_message;
    const messages = await getMessagesSince(chatId, anchor.date);

    if (messages.length === 0) {
      await sendMessage(
        chatId,
        "— Когда всё это началось, нас здесь ещё не было.\n— Как и смысла в этом разговоре!",
        msg.message_id
      );
      return;
    }

    const summary = await summarize(messages);
    await sendMessage(chatId, summary, msg.message_id);
    return;
  }

  // @mention without reply-to → sarcastic opinion with participant context
  const recent = await getRecentMessages(chatId, 30);
  const cleanText = msg.text.replace(`@${botUsername}`, "").trim() || "(просто позвали нас)";
  const response = await chat(recent, cleanText);
  await sendMessage(chatId, response, msg.message_id);
}
