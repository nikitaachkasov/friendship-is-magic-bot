// Run once after deploying to register the webhook with Telegram:
//   BOT_TOKEN=xxx WEBHOOK_URL=https://... node setup-webhook.js

const token = process.env.BOT_TOKEN;
const url = process.env.WEBHOOK_URL;

if (!token || !url) {
  console.error("Usage: BOT_TOKEN=xxx WEBHOOK_URL=https://... node setup-webhook.js");
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url }),
});

const data = await res.json();
console.log(data.ok ? "✓ Webhook registered:" : "✗ Error:", data);
