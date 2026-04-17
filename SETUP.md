# friendship-is-magic-bot

Grumpy Telegram bot for "🦄friendship is magic🦄". Summarizes conversations and drops sarcastic opinions when @mentioned. Runs on Firebase Cloud Functions + Firestore. Uses Claude Haiku.

---

## How the bot works

| Trigger | What happens |
|---|---|
| Reply to a message + `@friendshipismagicbot` | Summarizes everything from that message to now |
| `@friendshipismagicbot` (no reply) | Drops a sarcastic opinion on the current conversation |
| DM the bot (only @nikitaachkasov) | Responds in character |
| Automatically, 2x/day | Chimes in if the chat has been active in the last 3 hours |

**Rate limits** (to stay within free tiers):
- 5 calls per person per day
- 25 calls per group per day
- 200 calls per group per month
- 20 DM calls per day (creator only)

---

## One-time setup checklist

### 1. Telegram (@BotFather)
- [ ] Create bot → get token
- [ ] `/setprivacy` → Disable (bot must see all messages to build history)

### 2. Firebase
- [ ] Create project at console.firebase.google.com
- [ ] Upgrade to Blaze plan (required for Cloud Functions — costs $0 at this scale)
- [ ] Set budget alert at $5 in Google Cloud Console → Billing
- [ ] Create Firestore database → Native mode → us-central1

### 3. Anthropic
- [ ] Get API key at console.anthropic.com → API Keys
- [ ] Add credits ($5 lasts ~20 months at current usage)

### 4. Local setup
```bash
npm install -g firebase-tools
firebase login
cd friendship-is-magic-bot
```

Create `functions/.env` (never commit this):
```
TELEGRAM_BOT_TOKEN=your_token_here
ANTHROPIC_API_KEY=your_key_here
BOT_USERNAME=friendshipismagicbot
CREATOR_USERNAME=nikitaachkasov
```

### 5. Deploy
```bash
cd functions && npm install && cd ..
firebase deploy
```

### 6. Register webhook (once, after first deploy)
```bash
BOT_TOKEN=xxx WEBHOOK_URL=https://webhook-p46z5wnq5q-uc.a.run.app node setup-webhook.js
```
The function URL is printed at the end of `firebase deploy`.

### 7. Fix Cloud Run auth (if deploy succeeds but bot doesn't respond)
```bash
gcloud run services add-iam-policy-binding webhook \
  --region=us-central1 \
  --member="allUsers" \
  --role="roles/run.invoker" \
  --project=friendship-is-magic-bot
```

### 8. Fix Cloud Build permissions (if first deploy fails)
```bash
# Find your project number in Firebase console → Project Settings
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:YOUR_PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.builder"
```

---

## Redeploying after code changes

```bash
firebase deploy --only functions
```

Webhook URL stays the same — no need to re-register it.

---

## Checking logs

```bash
firebase functions:log
```

---

## Secrets are safe because
- `functions/.env` is gitignored — never pushed to GitHub
- Firebase loads env vars into the function runtime at deploy time
- Firestore rules deny all client-side access (only server-side admin SDK works)

---

## Cost summary

| Service | Free tier | Your usage |
|---|---|---|
| Cloud Functions | 2M calls/month free | ~800/month max |
| Firestore | 20k writes/day free | ~100/day max |
| Anthropic Haiku | Pay per token | ~$0.25/month max |

**Total expected cost: ~$0.25/month. $5 of Anthropic credits lasts ~20 months.**
