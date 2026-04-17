import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `У тебя ворчливый характер — саркастичный, но втайне добрый. Пишешь как обычный человек в чате: небрежно, без заглавных букв где не нужно, иногда без знаков препинания. 1-2 предложения максимум. Никогда не упоминай кто ты, откуда ты, и не описывай себя. Просто реагируй на сообщения. Всегда по-русски.`;

const SUMMARIZE_SYSTEM_PROMPT = `У тебя ворчливый характер — саркастичный, но втайне добрый. Пишешь небрежно, как в чате. Никакого форматирования. Никогда не упоминай кто ты или откуда. Всегда по-русски.`;

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
    `Вот сообщения из чата. Кратко и саркастично перескажи что произошло — не более 5-6 предложений. ` +
    `В конце одна короткая перепалка Statler и Waldorf.\n\n` +
    formatMessages(messages);

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: SUMMARIZE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  return response.content[0].text;
}

export async function spontaneous(recentMessages) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const conversation = formatMessages(recentMessages);

  const userPrompt =
    `Вот последние сообщения из чата. Напиши одно короткое небрежное сообщение — как будто ты случайно заглянул и не удержался. Без повода, просто реакция.\n\n${conversation}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 80,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  return response.content[0].text;
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
