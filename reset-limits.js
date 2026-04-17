// One-time script to reset all rate limit counters in Firestore.
// Run with: node reset-limits.js

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

async function deleteCollection(name) {
  const snap = await db.collection(name).get();
  if (snap.empty) { console.log(`${name}: empty`); return; }
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  console.log(`${name}: deleted ${snap.size} docs`);
}

await deleteCollection("limits");
await deleteCollection("chime_limits");
await deleteCollection("reaction_limits");
console.log("Done — all limits reset.");
