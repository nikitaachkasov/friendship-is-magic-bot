import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { handleUpdate, chimeIn } from "./bot.js";

export const webhook = onRequest({ region: "us-central1" }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }
  try {
    await handleUpdate(req.body);
  } catch (err) {
    console.error("Update error:", err);
  }
  res.status(200).send("OK");
});

// Runs every 2 hours. 10% chance to actually fire → ~once a day on average,
// varies naturally. Only sends if chat was active in the last 3 hours.
export const chimeInScheduled = onSchedule({ schedule: "every 2 hours", region: "us-central1" }, async () => {
  if (Math.random() > 0.10) return;
  try { await chimeIn(); } catch (err) { console.error("chimeIn error:", err); }
});
