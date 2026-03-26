import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  DEFAULT_PLAYER_COLOR,
  DEFAULT_PLAYER_EMOJI,
  PLAYER_EMOJI_POOL,
} from "@/lib/games/whosdoneit/game";
import { PLAYER_COLOR_POOL } from "@/lib/player-color-pool";
import { supabase } from "@/lib/supabase";
import type {
  SayLessCard,
  SayLessDraftRejection,
  SayLessPlayer,
  SayLessRoom,
  SayLessRoomCard,
  SayLessRoomSettings,
  SayLessRoomState,
  SayLessRoundResult,
  SayLessSnapshot,
} from "@/types/sayless";
const MIN_TEAMS = 2;
const MAX_TEAMS = 5;
const MIN_CARDS_PER_PLAYER = 3;
const MAX_CARDS_PER_PLAYER = 12;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 5;
const MIN_TURN_SECONDS = 15;
const MAX_TURN_SECONDS = 180;

const DEFAULT_ROOM_SETTINGS: SayLessRoomSettings = {
  teamCount: 2,
  cardsPerPlayer: 8,
  roundCount: 3,
  turnSeconds: 60,
};

const TEAM_NAME_POOL = [
  "Chaos Goblins",
  "Snack Bandits",
  "Oops All Clues",
  "Couch Detectives",
  "Hot Mess Express",
  "Mildly Ferocious",
  "Gremlin Energy",
  "Questionable Tactics",
  "Tiny Conspiracies",
  "Loud Whispers",
  "Blank Stares",
  "Panic Button",
  "Wildcard Noodles",
  "Suspicious Legends",
  "The Bit",
] as const;

export const SAY_LESS_TEAM_PALETTE = [
  { name: "Coral", color: "#ef4444", background: "#fff1f2" },
  { name: "Ocean", color: "#2563eb", background: "#eff6ff" },
  { name: "Mint", color: "#10b981", background: "#ecfdf5" },
  { name: "Gold", color: "#f59e0b", background: "#fffbeb" },
  { name: "Plum", color: "#7c3aed", background: "#f5f3ff" },
] as const;

type CreateRoomOptions = {
  settings?: Partial<SayLessRoomSettings>;
  playerColor?: string;
  playerEmoji?: string;
};

type TurnAction = "pass" | "correct";

function asMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return "Unknown Supabase error";
}

async function callRpc<T>(
  fn: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    throw new Error(asMessage(error));
  }

  return data as T;
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function normalizeName(name: string) {
  return name.trim();
}

function normalizeColor(color?: string) {
  const normalized = (color ?? "").trim().toLowerCase();
  return PLAYER_COLOR_POOL.includes(normalized as (typeof PLAYER_COLOR_POOL)[number])
    ? normalized
    : DEFAULT_PLAYER_COLOR;
}

function normalizeEmoji(emoji?: string) {
  const normalized = (emoji ?? "").trim();
  return PLAYER_EMOJI_POOL.includes(normalized as (typeof PLAYER_EMOJI_POOL)[number])
    ? normalized
    : DEFAULT_PLAYER_EMOJI;
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function sanitizeTeamCount(value?: number) {
  return clampNumber(
    Number(value),
    MIN_TEAMS,
    MAX_TEAMS,
    DEFAULT_ROOM_SETTINGS.teamCount,
  );
}

function sanitizeCardsPerPlayer(value?: number) {
  return clampNumber(
    Number(value),
    MIN_CARDS_PER_PLAYER,
    MAX_CARDS_PER_PLAYER,
    DEFAULT_ROOM_SETTINGS.cardsPerPlayer,
  );
}

function sanitizeRoundCount(value?: number) {
  return clampNumber(
    Number(value),
    MIN_ROUNDS,
    MAX_ROUNDS,
    DEFAULT_ROOM_SETTINGS.roundCount,
  );
}

function sanitizeTurnSeconds(value?: number) {
  return clampNumber(
    Number(value),
    MIN_TURN_SECONDS,
    MAX_TURN_SECONDS,
    DEFAULT_ROOM_SETTINGS.turnSeconds,
  );
}

function sanitizeSettings(settings?: Partial<SayLessRoomSettings>): SayLessRoomSettings {
  return {
    teamCount: sanitizeTeamCount(settings?.teamCount),
    cardsPerPlayer: sanitizeCardsPerPlayer(settings?.cardsPerPlayer),
    roundCount: sanitizeRoundCount(settings?.roundCount),
    turnSeconds: sanitizeTurnSeconds(settings?.turnSeconds),
  };
}

function sortPlayers(players: SayLessPlayer[]) {
  return [...players].sort((left, right) => left.created_at.localeCompare(right.created_at));
}

function sortRoomCards(cards: SayLessRoomCard[]) {
  return [...cards].sort(
    (left, right) =>
      left.sort_order - right.sort_order || left.created_at.localeCompare(right.created_at),
  );
}

function sortRoundResults(results: SayLessRoundResult[]) {
  return [...results].sort((left, right) => left.created_at.localeCompare(right.created_at));
}

function randomizeOrder<T>(items: T[]) {
  const cloned = [...items];
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[swapIndex]] = [cloned[swapIndex], cloned[index]];
  }
  return cloned;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function sanitizeTeamName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 24);
}

function getFallbackTeamNames(count: number) {
  return Array.from({ length: count }, (_, index) => `Team ${index + 1}`);
}

function buildRandomTeamNames(count: number, existingNames: string[] = []) {
  const normalizedExisting = uniqueStrings(
    existingNames.map(sanitizeTeamName).filter(Boolean),
  ).slice(0, count);
  const available = TEAM_NAME_POOL.filter((name) => !normalizedExisting.includes(name));
  const filler = randomizeOrder([...available]).slice(
    0,
    Math.max(0, count - normalizedExisting.length),
  );
  const output = [...normalizedExisting, ...filler];

  if (output.length >= count) {
    return output.slice(0, count);
  }

  for (let index = output.length; index < count; index += 1) {
    output.push(`Team ${index + 1}`);
  }

  return output;
}

function normalizeRoom(room: SayLessRoom) {
  const teamCount = sanitizeTeamCount(room.team_count);
  const rawTeamNames = Array.isArray((room as { team_names?: unknown }).team_names)
    ? (room.team_names ?? []).filter((name): name is string => typeof name === "string")
    : [];

  return {
    ...room,
    team_count: teamCount,
    team_names:
      rawTeamNames.length > 0
        ? buildRandomTeamNames(teamCount, rawTeamNames)
        : getFallbackTeamNames(teamCount),
  };
}

function createDefaultState(room: SayLessRoom): Omit<SayLessRoomState, "created_at"> {
  return {
    room_id: room.id,
    cards_per_player: DEFAULT_ROOM_SETTINGS.cardsPerPlayer,
    round_count: DEFAULT_ROOM_SETTINGS.roundCount,
    turn_seconds: DEFAULT_ROOM_SETTINGS.turnSeconds,
    current_round_index: 0,
    starting_team_index: 0,
    active_team_index: 0,
    active_player_id: null,
    active_card_entry_id: null,
    turn_deadline_at: null,
    team_turn_counts: Array.from({ length: room.team_count }, () => 0),
  };
}

function normalizeState(room: SayLessRoom, state: SayLessRoomState | null) {
  const fallback = createDefaultState(room);
  return {
    room_id: room.id,
    cards_per_player: sanitizeCardsPerPlayer(state?.cards_per_player),
    round_count: sanitizeRoundCount(state?.round_count),
    turn_seconds: sanitizeTurnSeconds(state?.turn_seconds),
    current_round_index: Math.max(0, Math.round(state?.current_round_index ?? 0)),
    starting_team_index: clampNumber(
      Number(state?.starting_team_index ?? 0),
      0,
      room.team_count - 1,
      fallback.starting_team_index,
    ),
    active_team_index: clampNumber(
      Number(state?.active_team_index ?? 0),
      0,
      room.team_count - 1,
      fallback.active_team_index,
    ),
    active_player_id: state?.active_player_id ?? null,
    active_card_entry_id: state?.active_card_entry_id ?? null,
    turn_deadline_at: state?.turn_deadline_at ?? null,
    team_turn_counts: Array.from({ length: room.team_count }, (_, index) => {
      const value = state?.team_turn_counts?.[index];
      return typeof value === "number" ? Math.max(0, Math.round(value)) : 0;
    }),
    created_at: state?.created_at ?? new Date().toISOString(),
  };
}

function getTeamCounts(players: SayLessPlayer[], teamCount: number) {
  const counts = Array.from({ length: teamCount }, () => 0);

  players.forEach((player) => {
    if (
      typeof player.team_index === "number" &&
      player.team_index >= 0 &&
      player.team_index < teamCount
    ) {
      counts[player.team_index] += 1;
    }
  });

  return counts;
}

async function ensureRoomState(room: SayLessRoom, state: SayLessRoomState | null) {
  return normalizeState(room, state);
}

async function getRoomSnapshotByRoomId(roomId: string): Promise<SayLessSnapshot> {
  const [roomResult, playersResult, stateResult, roomCardsResult, draftRejectionsResult, roundResultsResult] =
    await Promise.all([
      supabase.from("rooms").select("*").eq("id", roomId).maybeSingle(),
      supabase.from("players").select("*").eq("room_id", roomId),
      supabase.from("sayless_room_state").select("*").eq("room_id", roomId).maybeSingle(),
      supabase
        .from("sayless_room_cards")
        .select("id, room_id, card_id, drafted_by_player_id, sort_order, status, created_at, card:sayless_cards(*)")
        .eq("room_id", roomId),
      supabase.from("sayless_draft_rejections").select("*").eq("room_id", roomId),
      supabase.from("sayless_round_results").select("*").eq("room_id", roomId),
    ]);

  if (roomResult.error) {
    throw new Error(asMessage(roomResult.error));
  }

  if (!roomResult.data) {
    throw new Error("Room not found.");
  }

  if (roomResult.data.game_type !== "sayless") {
    throw new Error("That room is not a Say Less room.");
  }

  if (playersResult.error) {
    throw new Error(asMessage(playersResult.error));
  }

  if (stateResult.error) {
    throw new Error(asMessage(stateResult.error));
  }

  if (roomCardsResult.error) {
    throw new Error(asMessage(roomCardsResult.error));
  }

  if (draftRejectionsResult.error) {
    throw new Error(asMessage(draftRejectionsResult.error));
  }

  if (roundResultsResult.error) {
    throw new Error(asMessage(roundResultsResult.error));
  }

  const room = normalizeRoom(roomResult.data as SayLessRoom);
  const state = await ensureRoomState(room, (stateResult.data as SayLessRoomState | null) ?? null);
  const roomCards = ((roomCardsResult.data ?? []) as Array<
    Omit<SayLessRoomCard, "card"> & { card: SayLessCard | SayLessCard[] | null }
  >).map((entry) => ({
    ...entry,
    card: Array.isArray(entry.card) ? entry.card[0] : entry.card,
  })) as SayLessRoomCard[];

  return {
    room,
    players: sortPlayers((playersResult.data ?? []) as SayLessPlayer[]),
    state,
    roomCards: sortRoomCards(roomCards),
    draftRejections: (draftRejectionsResult.data ?? []) as SayLessDraftRejection[],
    roundResults: sortRoundResults((roundResultsResult.data ?? []) as SayLessRoundResult[]),
  };
}

export function getDefaultRoomSettings() {
  return { ...DEFAULT_ROOM_SETTINGS };
}

export function getTeamName(room: SayLessRoom, teamIndex: number) {
  return normalizeRoom(room).team_names[teamIndex] ?? `Team ${teamIndex + 1}`;
}

export function hasReadyTeams(players: SayLessPlayer[], teamCount: number) {
  return getTeamCounts(players, teamCount).every((count) => count > 0);
}

export async function createRoom(hostName: string, options?: CreateRoomOptions) {
  const normalizedHostName = normalizeName(hostName);
  if (!normalizedHostName) {
    throw new Error("Name is required.");
  }

  const settings = sanitizeSettings(options?.settings);
  const playerColor = normalizeColor(options?.playerColor);
  const playerEmoji = normalizeEmoji(options?.playerEmoji);
  const payload = await callRpc<{ room: SayLessRoom; player: SayLessPlayer }>(
    "sl_create_room",
    {
      host_name: normalizedHostName,
      player_color: playerColor,
      player_emoji: playerEmoji,
      team_count: settings.teamCount,
      cards_per_player: settings.cardsPerPlayer,
      round_count: settings.roundCount,
      turn_seconds: settings.turnSeconds,
    },
  );

  return {
    room: normalizeRoom(payload.room),
    player: payload.player,
  };
}

export async function getRoomSnapshotByCode(code: string) {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) {
    throw new Error("Room code is required.");
  }

  const { data: room, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", normalizedCode)
    .maybeSingle();

  if (error) {
    throw new Error(asMessage(error));
  }

  if (!room || room.game_type !== "sayless") {
    throw new Error("Room not found.");
  }

  return getRoomSnapshotByRoomId(room.id);
}

export async function joinRoom(code: string, name: string, color?: string, emoji?: string) {
  const normalizedCode = normalizeCode(code);
  const normalizedName = normalizeName(name);
  const normalizedColor = normalizeColor(color);
  const normalizedEmoji = normalizeEmoji(emoji);

  if (!normalizedCode || !normalizedName) {
    throw new Error("Room code and name are required.");
  }

  const payload = await callRpc<{ room: SayLessRoom; player: SayLessPlayer }>(
    "sl_join_room",
    {
      room_code: normalizedCode,
      player_name: normalizedName,
      player_color: normalizedColor,
      player_emoji: normalizedEmoji,
    },
  );

  return {
    room: normalizeRoom(payload.room),
    player: payload.player,
  };
}

export async function updateTeamSelection(
  roomId: string,
  playerId: string,
  teamIndex: number,
) {
  await callRpc("sl_update_team_selection", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_team_index: teamIndex,
  });
}

export async function updateRoomSettings(
  roomId: string,
  playerId: string,
  settings: SayLessRoomSettings,
) {
  const nextSettings = sanitizeSettings(settings);
  await callRpc("sl_update_room_settings", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_team_count: nextSettings.teamCount,
    p_cards_per_player: nextSettings.cardsPerPlayer,
    p_round_count: nextSettings.roundCount,
    p_turn_seconds: nextSettings.turnSeconds,
  });
}

export async function shuffleTeams(roomId: string, playerId: string) {
  await callRpc("sl_shuffle_teams", {
    p_room_id: roomId,
    p_player_id: playerId,
  });
}

export async function updateTeamName(roomId: string, playerId: string, nextName: string) {
  const sanitizedName = sanitizeTeamName(nextName);

  if (!sanitizedName) {
    throw new Error("Team name is required.");
  }

  await callRpc("sl_update_team_name", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_next_name: sanitizedName,
  });
}

export async function updatePlayerProfile(
  roomId: string,
  playerId: string,
  nextProfile: { name: string; color: string; emoji: string },
) {
  const normalizedName = normalizeName(nextProfile.name);
  const normalizedColor = normalizeColor(nextProfile.color);
  const normalizedEmoji = normalizeEmoji(nextProfile.emoji);

  if (!normalizedName) {
    throw new Error("Name is required.");
  }

  await callRpc("sl_update_player_profile", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_name: normalizedName,
    p_color: normalizedColor,
    p_emoji: normalizedEmoji,
  });
}

export async function startGame(roomId: string, playerId: string) {
  await callRpc("sl_start_game", {
    p_room_id: roomId,
    p_player_id: playerId,
  });
}

export async function getDraftBatchForPlayer(roomId: string, playerId: string) {
  return callRpc<SayLessCard[]>("sl_get_draft_batch_for_player", {
    p_room_id: roomId,
    p_player_id: playerId,
  });
}

export async function submitDraftDecision(
  roomId: string,
  playerId: string,
  cardId: string,
  accept: boolean,
) {
  await callRpc("sl_submit_draft_decision", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_card_id: cardId,
    p_accept: accept,
  });
}

export async function startPlayerTurn(roomId: string, playerId: string) {
  await callRpc("sl_start_player_turn", {
    p_room_id: roomId,
    p_player_id: playerId,
  });
}

export async function submitTurnAction(
  roomId: string,
  playerId: string,
  action: TurnAction,
) {
  await callRpc("sl_submit_turn_action", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_action: action,
  });
}

export async function maybeAdvanceGame(roomId: string) {
  await callRpc("sl_maybe_advance_game", {
    p_room_id: roomId,
  });
}

export async function continueFromRoundSummary(roomId: string, playerId: string) {
  await callRpc("sl_continue_from_round_summary", {
    p_room_id: roomId,
    p_player_id: playerId,
  });
}

export async function playAgainToLobby(roomId: string, playerId: string) {
  await callRpc("sl_play_again", {
    p_room_id: roomId,
    p_player_id: playerId,
  });
}

export function getRoundTeamScores(snapshot: SayLessSnapshot, roundIndex: number) {
  const scores = Array.from({ length: snapshot.room.team_count }, () => 0);

  snapshot.roundResults
    .filter((result) => result.round_index === roundIndex)
    .forEach((result) => {
      if (result.team_index >= 0 && result.team_index < scores.length) {
        scores[result.team_index] += result.points;
      }
    });

  return scores;
}

export function subscribeToRoom(roomId: string, onChange: () => void) {
  const channel: RealtimeChannel = supabase
    .channel(`sayless-room-${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "sayless_room_state",
        filter: `room_id=eq.${roomId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "sayless_room_cards",
        filter: `room_id=eq.${roomId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "sayless_draft_rejections",
        filter: `room_id=eq.${roomId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "sayless_round_results",
        filter: `room_id=eq.${roomId}`,
      },
      onChange,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
