import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `пишешь как ворчливый чувак в групповом чате — строчными буквами, небрежно, без лишних знаков препинания. одна-две фразы максимум. никаких диалогов, никаких персонажей, никаких имён перед репликами. просто короткий небрежный комментарий от одного человека. не описывай себя. только русский.`;

const SUMMARIZE_SYSTEM_PROMPT = `Ты один человек — ворчливый и саркастичный, но втайне добрый. Пишешь от первого лица, одним голосом. Никаких диалогов, никаких "Statler:", "Waldorf:", никакого форматирования. Всегда по-русски.`;

function formatMessages(messages) {
  return messages
    .map((m) => `${m.from_name}: ${m.text}`)
    .join("\n");
}

function extractParticipants(messages) {
  const seen = new Map();
  for (const m of messages) {
    if (!seen.has(m.from_name)) seen.set(m.from_name, []);
    if (seen.get(m.from_name).length < 3) seen.get(m.from_name).push(m.text);
  }
  return [...seen.entries()]
    .map(([name, msgs]) => `${name}: "${msgs.join('" / "')}"`)
    .join("\n");
}

export async function summarize(messages) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt =
    `Вот сообщения из чата. Кратко и саркастично перескажи что произошло — не более 5-6 предложений.\n\n` +
    formatMessages(messages);

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: SUMMARIZE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  return response.content[0].text;
}

// Returns { text, messageId } — picks the most interesting message and replies to it
export async function spontaneous(recentMessages) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const numbered = recentMessages
    .map((m, i) => `[${i}] ${m.from_name}: ${m.text}`)
    .join("\n");

  const userPrompt =
    `Вот последние сообщения из чата. Выбери ОДНО самое интересное или смешное сообщение и ответь на него коротко и небрежно.\n\n` +
    `Ответь строго в формате:\nINDEX: <номер>\nREPLY: <твой ответ>\n\n${numbered}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = response.content[0].text;
  const indexMatch = raw.match(/INDEX:\s*(\d+)/);
  const replyMatch = raw.match(/REPLY:\s*(.+)/s);

  const index = indexMatch ? parseInt(indexMatch[1]) : null;
  const text = replyMatch ? replyMatch[1].trim() : raw.trim();
  const messageId = (index !== null && recentMessages[index])
    ? recentMessages[index].message_id
    : null;

  return { text, messageId };
}

// Pick one emoji reaction for a message. Returns a single emoji character.
const ALLOWED_EMOJIS = ["👍","👎","🔥","🤣","😱","🤔","🤨","😐","💅","🥱","😴","👀","🤡","💩","🏆","💔","😈","🤦","🤷","👌"];

export async function pickEmoji(messageText) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 10,
    system: "Ты выбираешь одну эмодзи-реакцию на сообщение. Отвечай ТОЛЬКО одним эмодзи из списка, без пробелов и текста.",
    messages: [{ role: "user", content: `Список: ${ALLOWED_EMOJIS.join(" ")}\n\nСообщение: ${messageText}\n\nОдна эмодзи:` }],
  });
  const emoji = response.content[0].text.trim();
  return ALLOWED_EMOJIS.includes(emoji) ? emoji : "👀";
}

export async function chat(recentMessages, userMessage) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const participants = extractParticipants(recentMessages);
  const conversation = formatMessages(recentMessages);

  const userPrompt =
    `Участники: ${participants}\n\n` +
    `Последние сообщения:\n${conversation}\n\n` +
    `Тебя позвали: ${userMessage}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  return response.content[0].text;
}
