// Maps Telegram display names and usernames → real names for Claude context.
// Key can be a display name (first name) OR a username (without @).
// Add new entries here as needed.
export const NAME_MAP = {
  // display name → real name
  "🐬🐬🐬":     "Диана",
  "𝒔𝒉𝒂𝒌𝒉𝒊𝒅𝒂": "Шахида",

  // username → real name
  "kair":      "Кайрат",
  "bzmtkv":    "Болот",
};

export function resolveName(firstName, username) {
  return NAME_MAP[firstName]
    ?? NAME_MAP[username]
    ?? firstName;
}
