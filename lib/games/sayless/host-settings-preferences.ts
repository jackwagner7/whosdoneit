import type { SayLessRoomSettings } from "@/types/sayless";

const HOST_SETTINGS_KEY = "sayLessRoomSettings";

const DEFAULT_HOST_SETTINGS: SayLessRoomSettings = {
  teamCount: 2,
  cardsPerPlayer: 8,
  roundCount: 3,
  turnSeconds: 60,
  draftMode: "manual",
  hostPhoneOnly: false,
};

export function getDefaultHostSettings(): SayLessRoomSettings {
  return { ...DEFAULT_HOST_SETTINGS };
}

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeSettings(
  settings?: Partial<SayLessRoomSettings> | null,
): SayLessRoomSettings {
  return {
    teamCount: clamp(Number(settings?.teamCount), 1, 5, DEFAULT_HOST_SETTINGS.teamCount),
    cardsPerPlayer: clamp(
      Number(settings?.cardsPerPlayer),
      3,
      20,
      DEFAULT_HOST_SETTINGS.cardsPerPlayer,
    ),
    roundCount: clamp(Number(settings?.roundCount), 1, 5, DEFAULT_HOST_SETTINGS.roundCount),
    turnSeconds: clamp(
      Number(settings?.turnSeconds),
      15,
      180,
      DEFAULT_HOST_SETTINGS.turnSeconds,
    ),
    draftMode:
      settings?.draftMode === "autodraft" || settings?.draftMode === "draftless"
        ? settings.draftMode
        : DEFAULT_HOST_SETTINGS.draftMode,
    hostPhoneOnly: settings?.hostPhoneOnly === true,
  };
}

export function getStoredHostSettings(): SayLessRoomSettings {
  if (typeof window === "undefined") {
    return getDefaultHostSettings();
  }

  const rawSettings = localStorage.getItem(HOST_SETTINGS_KEY);
  if (!rawSettings) {
    return getDefaultHostSettings();
  }

  try {
    return normalizeSettings(
      JSON.parse(rawSettings) as Partial<SayLessRoomSettings> | null | undefined,
    );
  } catch {
    return getDefaultHostSettings();
  }
}

export function setStoredHostSettings(settings: Partial<SayLessRoomSettings>) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(
    HOST_SETTINGS_KEY,
    JSON.stringify(normalizeSettings(settings)),
  );
}
