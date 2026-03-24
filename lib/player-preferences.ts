import {
  DEFAULT_PLAYER_COLOR,
  DEFAULT_PLAYER_EMOJI,
  PLAYER_COLOR_POOL,
  PLAYER_EMOJI_POOL,
} from "@/lib/game";
import type { PlayerProfile } from "@/types/games";

const PLAYER_NAME_KEY = "playerName";
const PLAYER_COLOR_KEY = "playerColor";
const PLAYER_EMOJI_KEY = "playerEmoji";
const PLAYER_COLOR_SET: Set<string> = new Set<string>(
  PLAYER_COLOR_POOL.map((color) => color.toLowerCase()),
);
const PLAYER_EMOJI_SET: Set<string> = new Set<string>(PLAYER_EMOJI_POOL);

const DEFAULT_PLAYER_PREFERENCES: PlayerProfile = {
  name: "",
  color: DEFAULT_PLAYER_COLOR,
  emoji: DEFAULT_PLAYER_EMOJI,
};

export function getDefaultPlayerPreferences(): PlayerProfile {
  return { ...DEFAULT_PLAYER_PREFERENCES };
}

export function getStoredPlayerPreferences(): PlayerProfile {
  if (typeof window === "undefined") {
    return getDefaultPlayerPreferences();
  }

  const name = localStorage.getItem(PLAYER_NAME_KEY) ?? "";
  const rawColor = (localStorage.getItem(PLAYER_COLOR_KEY) ?? "").toLowerCase();
  const rawEmoji = localStorage.getItem(PLAYER_EMOJI_KEY) ?? "";
  const color = PLAYER_COLOR_SET.has(rawColor) ? rawColor : DEFAULT_PLAYER_COLOR;
  const emoji = PLAYER_EMOJI_SET.has(rawEmoji) ? rawEmoji : DEFAULT_PLAYER_EMOJI;
  return { name, color, emoji };
}

export function setStoredPlayerPreferences(profile: PlayerProfile) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(PLAYER_NAME_KEY, profile.name.trim());
  const normalizedColor = profile.color.toLowerCase();
  localStorage.setItem(
    PLAYER_COLOR_KEY,
    PLAYER_COLOR_SET.has(normalizedColor) ? normalizedColor : DEFAULT_PLAYER_COLOR,
  );

  localStorage.setItem(
    PLAYER_EMOJI_KEY,
    PLAYER_EMOJI_SET.has(profile.emoji) ? profile.emoji : DEFAULT_PLAYER_EMOJI,
  );
}
