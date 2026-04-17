# friendship-is-magic-bot

Grumpy Telegram bot for "🦄friendship is magic🦄". Summarizes conversations, drops sarcastic opinions when @mentioned, and reacts to messages with emojis. Runs on Firebase Cloud Functions + Firestore. Uses Claude Haiku.

---

## How the bot works

| Trigger | What happens |
|---|---|
| Reply to a message + `@friendshipismagicbot` | Summarizes everything from that message to now |
| `@friendshipismagicbot` (no reply) | Drops a sarcastic opinion on the current conversation |
| Reply to the bot's message | Bot responds in character |
| DM the bot (only @nikitaachkasov) | Responds in character, 20 DM calls/day cap |
| Any group message (10% chance) | Bot adds a sarcastic emoji reaction |
| Bot's own message gets 3+ reactions | Bot reacts with an emoji to the original message (40% chance) |
| Automatically at 13:00 and 19:00 Bishkek time | Chimes in if the chat has been active in the last 3 hours |

**Rate limits** (to stay within free tiers):
- 5 calls per person per day (@mention)
- 25 @mention calls per group per day
- 200 @mention calls per group per month
- 20 DM calls per day (creator only)
- 10 spontaneous emoji reactions per group per day

---

## Personality

Single grumpy voice. **Always небрежный** — lowercase, no unnecessary punctuation, short sentences, like a real person texting in a group chat. NOT formal, NOT literary, NOT long. Sarcastic but secretly fond. Never introduces or describes itself. Always Russian.

**If the bot ever starts writing long formal text — the prompts need tightening. Reduce max_tokens and make the system prompt more explicit about brevity.**

---

## One-time setup checklist

### 1. Telegram (@BotFather)
- [ ] Create bot → get token
- [ ] `/setprivacy` → Disable (bot must see all messages to build history)
- [ ] `/setjoingroups` → Enable (so it can be added to groups)

### 2. Firebase
- [ ] Create project at console.firebase.google.com
- [ ] Upgrade to Blaze plan (required for Cloud Functions — costs $0 at this scale)
- [ ] Set budget alert at $5 in Google Cloud Console → Billing
- [ ] Create Firestore database → Standard edition → Native mode → production rules

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
BOT_TOKEN=xxx node -e "
fetch('https://api.telegram.org/botxxx/setWebhook', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    url: 'YOUR_FUNCTION_URL',
    allowed_updates: ['message', 'message_reaction']
  })
}).then(r => r.json()).then(console.log)
"
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

### 8. Fix Cloud Build permissions (if first deploy fails with build error)
```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:YOUR_PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.builder"
```
Find project number in Firebase console → Project Settings.

---

## Redeploying after code changes

```bash
firebase deploy --only functions
# If Firebase says "no changes detected", force it:
firebase deploy --only functions --force
```

Webhook URL stays the same after redeploy — no need to re-register it.

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
- Bot only posts to group chats it has already seen — never DMs random people

---

## Cost summary

| Service | Free tier | Your usage |
|---|---|---|
| Cloud Functions | 2M calls/month free | ~800/month max |
| Firestore | 20k writes/day free | ~150/day max |
| Anthropic Haiku | Pay per token | ~$0.25/month max |

**Total expected cost: ~$0.25/month. $5 of Anthropic credits lasts ~20 months.**

---

## Firestore collections

| Collection | Purpose |
|---|---|
| `chats/{chatId}/messages` | All group messages (for summarization history) |
| `limits/{chatId_date}` | Daily @mention rate limit counters |
| `limits/{chatId_month}` | Monthly @mention rate limit counters |
| `reaction_limits/{chatId_date}` | Daily spontaneous reaction counters |
| `group_chats` | Known group chat IDs (for scheduler) |
| `bot_messages` | Bot message IDs + reaction counts (for reaction feature) |
