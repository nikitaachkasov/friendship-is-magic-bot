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

// Bishkek is UTC+6. Waking hours ≈ 9:00–22:00 local = 3:00–16:00 UTC.
// Two triggers at 07:00 UTC (13:00 Bishkek) and 13:00 UTC (19:00 Bishkek).
export const chimeInMorning = onSchedule({ schedule: "0 7 * * *", region: "us-central1" }, async () => {
  try { await chimeIn(); } catch (err) { console.error("chimeIn error:", err); }
});

export const chimeInEvening = onSchedule({ schedule: "0 13 * * *", region: "us-central1" }, async () => {
  try { await chimeIn(); } catch (err) { console.error("chimeIn error:", err); }
});
