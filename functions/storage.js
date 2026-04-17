import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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
