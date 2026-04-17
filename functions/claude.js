import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `Ты — Statler и Waldorf, два ворчливых старика-насмешника из Маппетов, которые наблюдают за всем с балкона и комментируют с добродушным сарказмом. Говори от лица дуэта. Ты саркастичный, немного напыщенный, но втайне привязан к этим людям. Отвечай коротко и метко. Иногда спорь сам с собой (один Statler, другой Waldorf). Чат называется "🦄friendship is magic🦄" — это название кажется тебе нелепым. Все сообщения на русском, отвечай по-русски.`;

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
    `Вот сообщения из группового чата. Сделай краткий пересказ того, что произошло. ` +
    `Будь беспощадно саркастичным, но точным. Не более 200 слов. ` +
    `Заверши типичным коротким обменом репликами Statler и Waldorf о том, что вы только что лицезрели.\n\n` +
    formatMessages(messages);

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  return response.content[0].text;
}

export async function chat(recentMessages, userMessage) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Build participant profiles so the bot knows who's who and can call them out by name
  const participants = extractParticipants(recentMessages);
  const conversation = formatMessages(recentMessages);

  const userPrompt =
    `Участники чата и примеры их сообщений:\n${participants}\n\n` +
    `Последние сообщения:\n${conversation}\n\n` +
    `Тебя позвали: ${userMessage}\n\n` +
    `Выскажи своё мнение — можешь упоминать участников по именам.`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  return response.content[0].text;
}
