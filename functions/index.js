import { onRequest } from "firebase-functions/v2/https";
import { handleUpdate } from "./bot.js";

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
  // Always 200 — Telegram retries on any other status
  res.status(200).send("OK");
});
