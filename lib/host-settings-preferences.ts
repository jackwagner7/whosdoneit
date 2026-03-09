import type { RoomSettings } from "@/types/games";

const HOST_SETTINGS_KEY = "hostRoomSettings";

const DEFAULT_HOST_SETTINGS: RoomSettings = {
  promptSeconds: 20,
  roundCount: 1,
  answeringSeconds: 25,
  guessingSeconds: 35,
  revealSeconds: 8,
  fastMode: false,
};

function clampSeconds(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(5, Math.min(180, Math.round(value)));
}

function clampRounds(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(10, Math.round(value)));
}

function sanitizeHostSettings(settings?: Partial<RoomSettings> | null): RoomSettings {
  return {
    promptSeconds: clampSeconds(
      Number(settings?.promptSeconds),
      DEFAULT_HOST_SETTINGS.promptSeconds,
    ),
    roundCount: clampRounds(
      Number(settings?.roundCount),
      DEFAULT_HOST_SETTINGS.roundCount,
    ),
    answeringSeconds: clampSeconds(
      Number(settings?.answeringSeconds),
      DEFAULT_HOST_SETTINGS.answeringSeconds,
    ),
    guessingSeconds: clampSeconds(
      Number(settings?.guessingSeconds),
      DEFAULT_HOST_SETTINGS.guessingSeconds,
    ),
    revealSeconds: clampSeconds(
      Number(settings?.revealSeconds),
      DEFAULT_HOST_SETTINGS.revealSeconds,
    ),
    fastMode:
      typeof settings?.fastMode === "boolean"
        ? settings.fastMode
        : DEFAULT_HOST_SETTINGS.fastMode,
  };
}

export function getStoredHostSettings(): RoomSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_HOST_SETTINGS };
  }

  const rawSettings = localStorage.getItem(HOST_SETTINGS_KEY);
  if (!rawSettings) {
    return { ...DEFAULT_HOST_SETTINGS };
  }

  try {
    const parsed = JSON.parse(rawSettings) as Partial<RoomSettings> | null;
    return sanitizeHostSettings(parsed);
  } catch {
    return { ...DEFAULT_HOST_SETTINGS };
  }
}

export function setStoredHostSettings(settings: Partial<RoomSettings>) {
  if (typeof window === "undefined") {
    return;
  }

  const sanitized = sanitizeHostSettings(settings);
  localStorage.setItem(HOST_SETTINGS_KEY, JSON.stringify(sanitized));
}
