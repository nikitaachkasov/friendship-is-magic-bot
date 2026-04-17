import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const LIMITS = { userDay: 5, groupDay: 25, groupMonth: 200, dmDay: 20 };

if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

export async function storeMessage({ message_id, chat_id, from_name, from_username, text, date }) {
  const ref = db
    .collection("chats")
    .doc(String(chat_id))
    .collection("messages")
    .doc(String(message_id));
  await ref.set({ message_id, chat_id, from_name, from_username: from_username ?? null, text, date });
}

// Fetch all messages from sinceDate onward (for summarization)
export async function getMessagesSince(chatId, sinceDate) {
  const snap = await db
    .collection("chats")
    .doc(String(chatId))
    .collection("messages")
    .where("date", ">=", sinceDate)
    .orderBy("date", "asc")
    .limit(300)
    .get();

  return snap.docs.map((d) => d.data());
}

// Check rate limits and increment counters atomically.
// Returns null if ok, or "user_day" | "group_day" | "group_month" if a limit is hit.
export async function checkAndIncrementLimit(chatId, userId) {
  const today = new Date().toISOString().slice(0, 10);   // YYYY-MM-DD
  const month = new Date().toISOString().slice(0, 7);    // YYYY-MM

  const dayRef = db.collection("limits").doc(`${chatId}_${today}`);
  const monthRef = db.collection("limits").doc(`${chatId}_${month}`);

  const [daySnap, monthSnap] = await Promise.all([dayRef.get(), monthRef.get()]);

  const dayData = daySnap.data() ?? {};
  const monthData = monthSnap.data() ?? {};

  const userCount = dayData[`u_${userId}`] ?? 0;
  const dayTotal = dayData.total ?? 0;
  const monthTotal = monthData.total ?? 0;

  if (userCount >= LIMITS.userDay) return "user_day";
  if (dayTotal >= LIMITS.groupDay) return "group_day";
  if (monthTotal >= LIMITS.groupMonth) return "group_month";
  if (dayTotal >= LIMITS.dmDay && String(chatId).startsWith("dm_")) return "dm_day";

  await Promise.all([
    dayRef.set({ total: FieldValue.increment(1), [`u_${userId}`]: FieldValue.increment(1) }, { merge: true }),
    monthRef.set({ total: FieldValue.increment(1) }, { merge: true }),
  ]);

  return null;
}

// Fetch the N most recent messages (for opinions / DM context)
export async function getRecentMessages(chatId, limit = 30) {
  const snap = await db
    .collection("chats")
    .doc(String(chatId))
    .collection("messages")
    .orderBy("date", "desc")
    .limit(limit)
    .get();

  return snap.docs.map((d) => d.data()).reverse();
}

// Check and increment spontaneous reaction counter (max 10/day per chat).
// Returns true if allowed, false if limit hit.
export async function checkAndIncrementReactionLimit(chatId) {
  const today = new Date().toISOString().slice(0, 10);
  const ref = db.collection("reaction_limits").doc(`${chatId}_${today}`);
  const snap = await ref.get();
  const count = snap.data()?.count ?? 0;
  if (count >= 10) return false;
  await ref.set({ count: FieldValue.increment(1) }, { merge: true });
  return true;
}

// Track a message sent by the bot so we can watch for reactions on it
export async function storeBotMessage(chatId, botMessageId, replyToMessageId) {
  await db.collection("bot_messages").doc(`${chatId}_${botMessageId}`).set({
    chatId, botMessageId, replyToMessageId: replyToMessageId ?? null, reactions: 0, reacted: false,
  });
}

// Increment reaction count on a bot message. Returns the new count, or null if not found.
export async function trackBotMessageReaction(chatId, botMessageId) {
  const ref = db.collection("bot_messages").doc(`${chatId}_${botMessageId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (data.reacted) return null; // already reacted, skip
  const newCount = (data.reactions ?? 0) + 1;
  await ref.update({ reactions: newCount });
  return { count: newCount, replyToMessageId: data.replyToMessageId, reacted: data.reacted };
}

// Mark a bot message as already reacted
export async function markBotMessageReacted(chatId, botMessageId) {
  await db.collection("bot_messages").doc(`${chatId}_${botMessageId}`).update({ reacted: true });
}

// Remember this chat so the scheduler can find it later
export async function registerGroupChat(chatId) {
  await db.collection("group_chats").doc(String(chatId)).set({ chatId, updatedAt: Date.now() }, { merge: true });
}

// Return all known group chat IDs
export async function getGroupChats() {
  const snap = await db.collection("group_chats").get();
  return snap.docs.map((d) => d.data().chatId);
}

// Timestamp (unix seconds) of the most recent message in a chat
export async function getLastMessageTime(chatId) {
  const snap = await db
    .collection("chats")
    .doc(String(chatId))
    .collection("messages")
    .orderBy("date", "desc")
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data().date;
}
