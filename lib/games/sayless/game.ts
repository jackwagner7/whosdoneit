import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  DEFAULT_PLAYER_COLOR,
  DEFAULT_PLAYER_EMOJI,
  PLAYER_COLOR_POOL,
  PLAYER_EMOJI_POOL,
} from "@/lib/games/whosdoneit/game";
import { supabase } from "@/lib/supabase";
import type {
  SayLessCard,
  SayLessDraftHand,
  SayLessDraftRejection,
  SayLessPlayer,
  SayLessRoom,
  SayLessRoomCard,
  SayLessRoomSettings,
  SayLessRoomState,
  SayLessRoundResult,
  SayLessSnapshot,
} from "@/types/sayless";

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MAX_ROOM_CODE_ATTEMPTS = 12;
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

function generateRoomCode(length = 4) {
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
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

function getTeamPlayers(players: SayLessPlayer[], teamIndex: number) {
  return sortPlayers(players).filter((player) => player.team_index === teamIndex);
}

function getBalancedTeamIndex(players: SayLessPlayer[], teamCount: number) {
  const counts = getTeamCounts(players, teamCount);
  let nextTeamIndex = 0;

  for (let index = 1; index < counts.length; index += 1) {
    if (counts[index] < counts[nextTeamIndex]) {
      nextTeamIndex = index;
    }
  }

  return nextTeamIndex;
}

function buildTeamAssignments(
  players: SayLessPlayer[],
  teamCount: number,
  randomize = false,
) {
  const source = randomize ? randomizeOrder(players) : sortPlayers(players);
  return source.map((player, index) => ({
    id: player.id,
    teamIndex: index % teamCount,
  }));
}

function calculateDraftTarget(playerCount: number, cardsPerPlayer: number) {
  return playerCount * cardsPerPlayer;
}

function getDraftCountsByPlayer(roomCards: SayLessRoomCard[]) {
  const counts = new Map<string, number>();
  roomCards.forEach((card) => {
    counts.set(card.drafted_by_player_id, (counts.get(card.drafted_by_player_id) ?? 0) + 1);
  });
  return counts;
}

function getTeamScoreTotals(players: SayLessPlayer[], teamCount: number) {
  const totals = Array.from({ length: teamCount }, () => 0);

  players.forEach((player) => {
    if (
      typeof player.team_index === "number" &&
      player.team_index >= 0 &&
      player.team_index < teamCount
    ) {
      totals[player.team_index] += player.score;
    }
  });

  return totals;
}

function getLowestScoreTeamIndex(players: SayLessPlayer[], teamCount: number) {
  const totals = getTeamScoreTotals(players, teamCount);
  let lowestIndex = 0;

  for (let index = 1; index < totals.length; index += 1) {
    if (totals[index] < totals[lowestIndex]) {
      lowestIndex = index;
    }
  }

  return lowestIndex;
}

function findNextTeamIndex(players: SayLessPlayer[], teamCount: number, startIndex: number) {
  for (let offset = 0; offset < teamCount; offset += 1) {
    const teamIndex = (startIndex + offset) % teamCount;
    if (getTeamPlayers(players, teamIndex).length > 0) {
      return teamIndex;
    }
  }

  return null;
}

function getTurnPlayer(players: SayLessPlayer[], teamIndex: number, turnCount: number) {
  const teamPlayers = getTeamPlayers(players, teamIndex);
  if (teamPlayers.length === 0) {
    return null;
  }

  return teamPlayers[turnCount % teamPlayers.length] ?? null;
}

function buildDeadline(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function isDeadlineExpired(deadlineAt: string | null) {
  return Boolean(deadlineAt && new Date(deadlineAt).getTime() <= Date.now());
}

async function applyTeamAssignments(
  roomId: string,
  assignments: Array<{ id: string; teamIndex: number }>,
) {
  const results = await Promise.all(
    assignments.map((assignment) =>
      supabase
        .from("players")
        .update({ team_index: assignment.teamIndex })
        .eq("id", assignment.id)
        .eq("room_id", roomId),
    ),
  );

  const failed = results.find((result) => Boolean(result.error));
  if (failed?.error) {
    throw new Error(asMessage(failed.error));
  }
}

async function ensureRoomState(room: SayLessRoom, state: SayLessRoomState | null) {
  if (state) {
    return normalizeState(room, state);
  }

  const defaultState = createDefaultState(room);
  const { data, error } = await supabase
    .from("sayless_room_state")
    .insert(defaultState)
    .select("*")
    .single();

  if (error) {
    throw new Error(asMessage(error));
  }

  return normalizeState(room, data as SayLessRoomState);
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

async function getCardLibrary() {
  const { data, error } = await supabase.from("sayless_cards").select("*");

  if (error) {
    throw new Error(asMessage(error));
  }

  return (data ?? []) as SayLessCard[];
}

async function getCardLibraryCount() {
  const { count, error } = await supabase
    .from("sayless_cards")
    .select("id", { count: "exact", head: true });

  if (error) {
    throw new Error(asMessage(error));
  }

  return count ?? 0;
}

async function clearGameData(roomId: string) {
  const results = await Promise.all([
    supabase.from("sayless_room_cards").delete().eq("room_id", roomId),
    supabase.from("sayless_draft_hands").delete().eq("room_id", roomId),
    supabase.from("sayless_draft_rejections").delete().eq("room_id", roomId),
    supabase.from("sayless_round_results").delete().eq("room_id", roomId),
  ]);

  const failed = results.find((result) => Boolean(result.error));
  if (failed?.error) {
    throw new Error(asMessage(failed.error));
  }
}

async function resetPlayerScores(roomId: string) {
  const { error } = await supabase
    .from("players")
    .update({ score: 0 })
    .eq("room_id", roomId);

  if (error) {
    throw new Error(asMessage(error));
  }
}

async function persistState(
  roomId: string,
  values: Partial<SayLessRoomState>,
  room?: SayLessRoom,
) {
  const payload: Record<string, unknown> = {
    room_id: roomId,
    ...values,
  };

  if (room && !("team_turn_counts" in payload)) {
    payload.team_turn_counts = Array.from({ length: room.team_count }, () => 0);
  }

  const { error } = await supabase
    .from("sayless_room_state")
    .upsert(payload, { onConflict: "room_id" });

  if (error) {
    throw new Error(asMessage(error));
  }
}

async function updateRoomPhase(
  roomId: string,
  phase: SayLessRoom["phase"],
  deadlineAt: string | null,
) {
  const { error } = await supabase
    .from("rooms")
    .update({ phase, phase_deadline_at: deadlineAt })
    .eq("id", roomId)
    .eq("game_type", "sayless");

  if (error) {
    throw new Error(asMessage(error));
  }
}

async function updateRoomPhaseDeadline(roomId: string, deadlineAt: string | null) {
  const { error } = await supabase
    .from("rooms")
    .update({ phase_deadline_at: deadlineAt })
    .eq("id", roomId)
    .eq("game_type", "sayless");

  if (error) {
    throw new Error(asMessage(error));
  }
}

async function resetPassedCards(roomId: string) {
  const { error } = await supabase
    .from("sayless_room_cards")
    .update({ status: "pending" })
    .eq("room_id", roomId)
    .eq("status", "passed");

  if (error) {
    throw new Error(asMessage(error));
  }
}

function getPendingCards(roomCards: SayLessRoomCard[]) {
  return sortRoomCards(roomCards.filter((card) => card.status === "pending"));
}

function hasClearedEntireDeck(roomCards: SayLessRoomCard[]) {
  return roomCards.length > 0 && roomCards.every((card) => card.status === "cleared");
}

async function startPlayingTurn(
  roomId: string,
  snapshot: SayLessSnapshot,
  options?: {
    currentRoundIndex?: number;
    startingTeamIndex?: number;
    teamTurnCounts?: number[];
  },
) {
  const roundIndex = options?.currentRoundIndex ?? snapshot.state.current_round_index;
  const teamTurnCounts = options?.teamTurnCounts ?? [...snapshot.state.team_turn_counts];
  const startTeamIndex =
    options?.startingTeamIndex ?? snapshot.state.starting_team_index;
  const nextTeamIndex = findNextTeamIndex(
    snapshot.players,
    snapshot.room.team_count,
    startTeamIndex,
  );

  if (nextTeamIndex === null) {
    throw new Error("Need at least one player in a team to play.");
  }

  const nextPlayer = getTurnPlayer(
    snapshot.players,
    nextTeamIndex,
    teamTurnCounts[nextTeamIndex] ?? 0,
  );

  if (!nextPlayer) {
    throw new Error("Could not determine the next active player.");
  }

  await persistState(roomId, {
    current_round_index: roundIndex,
    starting_team_index: startTeamIndex,
    active_team_index: nextTeamIndex,
    active_player_id: nextPlayer.id,
    active_card_entry_id: null,
    turn_deadline_at: null,
    team_turn_counts: teamTurnCounts,
  });
  await updateRoomPhase(roomId, "playing", null);
}

async function finishRound(snapshot: SayLessSnapshot) {
  await persistState(snapshot.room.id, {
    active_player_id: null,
    active_card_entry_id: null,
    turn_deadline_at: null,
  });
  await updateRoomPhase(snapshot.room.id, "round_summary", null);
}

async function advanceWithinTurn(roomId: string) {
  let snapshot = await getRoomSnapshotByRoomId(roomId);

  if (hasClearedEntireDeck(snapshot.roomCards)) {
    await finishRound(snapshot);
    return;
  }

  let pendingCards = getPendingCards(snapshot.roomCards);
  if (pendingCards.length === 0) {
    await resetPassedCards(roomId);
    snapshot = await getRoomSnapshotByRoomId(roomId);
    pendingCards = getPendingCards(snapshot.roomCards);
  }

  const nextCard = pendingCards[0] ?? null;
  if (!nextCard) {
    await finishRound(snapshot);
    return;
  }

  await persistState(roomId, {
    active_card_entry_id: nextCard.id,
  });
  await updateRoomPhaseDeadline(roomId, null);
}

async function advanceToNextTurn(roomId: string) {
  let snapshot = await getRoomSnapshotByRoomId(roomId);

  if (hasClearedEntireDeck(snapshot.roomCards)) {
    await finishRound(snapshot);
    return;
  }

  await resetPassedCards(roomId);
  snapshot = await getRoomSnapshotByRoomId(roomId);

  const nextTeamTurnCounts = [...snapshot.state.team_turn_counts];
  nextTeamTurnCounts[snapshot.state.active_team_index] =
    (nextTeamTurnCounts[snapshot.state.active_team_index] ?? 0) + 1;

  const nextTeamIndex = findNextTeamIndex(
    snapshot.players,
    snapshot.room.team_count,
    snapshot.state.active_team_index + 1,
  );

  if (nextTeamIndex === null) {
    throw new Error("Could not find the next team.");
  }

  await startPlayingTurn(roomId, snapshot, {
    currentRoundIndex: snapshot.state.current_round_index,
    startingTeamIndex: nextTeamIndex,
    teamTurnCounts: nextTeamTurnCounts,
  });
}

async function beginDraft(roomId: string, snapshot: SayLessSnapshot) {
  await clearGameData(roomId);
  await resetPlayerScores(roomId);
  await persistState(roomId, {
    cards_per_player: snapshot.state.cards_per_player,
    round_count: snapshot.state.round_count,
    turn_seconds: snapshot.state.turn_seconds,
    current_round_index: 0,
    starting_team_index: 0,
    active_team_index: 0,
    active_player_id: null,
    active_card_entry_id: null,
    turn_deadline_at: null,
    team_turn_counts: Array.from({ length: snapshot.room.team_count }, () => 0),
  });
  await updateRoomPhase(roomId, "drafting", null);
}

function getAvailableDraftCards(
  cards: SayLessCard[],
  roomCards: SayLessRoomCard[],
  seenCardIds: Set<string>,
  draftHands: SayLessDraftHand[],
  ignoreSeen = false,
) {
  const draftedCardIds = new Set(roomCards.map((card) => card.card_id));
  const reservedCardIds = new Set(draftHands.map((hand) => hand.card_id));

  return cards.filter((card) => {
    if (draftedCardIds.has(card.id)) {
      return false;
    }

    if (reservedCardIds.has(card.id)) {
      return false;
    }

    if (!ignoreSeen && seenCardIds.has(card.id)) {
      return false;
    }

    return true;
  });
}

async function getDraftHands(roomId: string) {
  const { data, error } = await supabase
    .from("sayless_draft_hands")
    .select("*")
    .eq("room_id", roomId);

  if (error) {
    throw new Error(asMessage(error));
  }

  return (data ?? []) as SayLessDraftHand[];
}

async function clearActiveDraftHand(roomId: string, playerId: string) {
  const { error } = await supabase
    .from("sayless_draft_hands")
    .delete()
    .eq("room_id", roomId)
    .eq("player_id", playerId);

  if (error) {
    throw new Error(asMessage(error));
  }
}

async function reserveDraftCard(
  roomId: string,
  playerId: string,
  candidateCards: SayLessCard[],
) {
  for (const card of randomizeOrder(candidateCards)) {
    const { error: reserveError } = await supabase
      .from("sayless_draft_hands")
      .upsert(
        {
          room_id: roomId,
          player_id: playerId,
          card_id: card.id,
        },
        { onConflict: "room_id,player_id" },
      );

    if (reserveError) {
      if ((reserveError as { code?: string }).code === "23505") {
        continue;
      }

      throw new Error(asMessage(reserveError));
    }

    const { error: seenError } = await supabase
      .from("sayless_draft_rejections")
      .upsert(
        {
          room_id: roomId,
          player_id: playerId,
          card_id: card.id,
        },
        { onConflict: "room_id,player_id,card_id" },
      );

    if (seenError) {
      await clearActiveDraftHand(roomId, playerId);
      throw new Error(asMessage(seenError));
    }

    return card;
  }

  return null;
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
  let room: SayLessRoom | null = null;

  for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
    const code = generateRoomCode();
    const { data, error } = await supabase
      .from("rooms")
      .insert({
        code,
        game_type: "sayless",
        phase: "lobby",
        team_count: settings.teamCount,
        team_names: buildRandomTeamNames(settings.teamCount),
      })
      .select("*")
      .single();

    if (!error) {
      room = normalizeRoom(data as SayLessRoom);
      break;
    }

    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      String(error.code) === "23505"
    ) {
      continue;
    }

    throw new Error(asMessage(error));
  }

  if (!room) {
    throw new Error("Could not generate a unique room code.");
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .insert({
      room_id: room.id,
      name: normalizedHostName,
      color: playerColor,
      emoji: playerEmoji,
      team_index: 0,
      is_host: true,
      score: 0,
    })
    .select("*")
    .single();

  if (playerError) {
    throw new Error(asMessage(playerError));
  }

  await persistState(room.id, {
    cards_per_player: settings.cardsPerPlayer,
    round_count: settings.roundCount,
    turn_seconds: settings.turnSeconds,
    current_round_index: 0,
    starting_team_index: 0,
    active_team_index: 0,
    active_player_id: null,
    active_card_entry_id: null,
    turn_deadline_at: null,
    team_turn_counts: Array.from({ length: room.team_count }, () => 0),
  });

  return { room, player: player as SayLessPlayer };
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

  const snapshot = await getRoomSnapshotByCode(normalizedCode);

  if (snapshot.room.phase !== "lobby") {
    throw new Error("This room has already started.");
  }

  if (
    snapshot.players.some(
      (player) => player.name.toLowerCase() === normalizedName.toLowerCase(),
    )
  ) {
    throw new Error("That name is already taken in this room.");
  }

  if (
    snapshot.players.some(
      (player) => (player.color ?? "").toLowerCase() === normalizedColor,
    )
  ) {
    throw new Error("That color was just taken. Choose another.");
  }

  const assignedTeamIndex = getBalancedTeamIndex(
    snapshot.players,
    snapshot.room.team_count,
  );

  const { data: player, error: playerError } = await supabase
    .from("players")
    .insert({
      room_id: snapshot.room.id,
      name: normalizedName,
      color: normalizedColor,
      emoji: normalizedEmoji,
      team_index: assignedTeamIndex,
      is_host: false,
      score: 0,
    })
    .select("*")
    .single();

  if (playerError) {
    throw new Error(asMessage(playerError));
  }

  return { room: snapshot.room, player: player as SayLessPlayer };
}

export async function updateTeamSelection(
  roomId: string,
  playerId: string,
  teamIndex: number,
) {
  const snapshot = await getRoomSnapshotByRoomId(roomId);
  if (snapshot.room.phase !== "lobby") {
    throw new Error("Teams can only be changed before the game starts.");
  }

  const safeTeamIndex = Math.max(
    0,
    Math.min(snapshot.room.team_count - 1, Math.round(teamIndex)),
  );
  const player = snapshot.players.find((entry) => entry.id === playerId);

  if (!player) {
    throw new Error("Player not found.");
  }

  const { error } = await supabase
    .from("players")
    .update({ team_index: safeTeamIndex })
    .eq("id", playerId)
    .eq("room_id", roomId);

  if (error) {
    throw new Error(asMessage(error));
  }
}

export async function updateRoomSettings(
  roomId: string,
  playerId: string,
  settings: SayLessRoomSettings,
) {
  const snapshot = await getRoomSnapshotByRoomId(roomId);
  const host = snapshot.players.find((player) => player.id === playerId);
  if (!host?.is_host) {
    throw new Error("Only the room creator can do that.");
  }

  if (snapshot.room.phase !== "lobby") {
    throw new Error("Settings can only be changed in the lobby.");
  }

  const nextSettings = sanitizeSettings(settings);
  const teamNames = buildRandomTeamNames(
    nextSettings.teamCount,
    snapshot.room.team_names.slice(0, nextSettings.teamCount),
  );

  const roomResult = await supabase
    .from("rooms")
    .update({
      team_count: nextSettings.teamCount,
      team_names: teamNames,
    })
    .eq("id", roomId)
    .eq("game_type", "sayless");

  if (roomResult.error) {
    throw new Error(asMessage(roomResult.error));
  }

  await persistState(roomId, {
    cards_per_player: nextSettings.cardsPerPlayer,
    round_count: nextSettings.roundCount,
    turn_seconds: nextSettings.turnSeconds,
    current_round_index: 0,
    starting_team_index: 0,
    active_team_index: 0,
    active_player_id: null,
    active_card_entry_id: null,
    turn_deadline_at: null,
    team_turn_counts: Array.from({ length: nextSettings.teamCount }, () => 0),
  });

  await applyTeamAssignments(
    roomId,
    buildTeamAssignments(snapshot.players, nextSettings.teamCount),
  );
}

export async function shuffleTeams(roomId: string, playerId: string) {
  const snapshot = await getRoomSnapshotByRoomId(roomId);
  const host = snapshot.players.find((player) => player.id === playerId);
  if (!host?.is_host) {
    throw new Error("Only the room creator can do that.");
  }

  if (snapshot.room.phase !== "lobby") {
    throw new Error("Teams can only be shuffled in the lobby.");
  }

  await applyTeamAssignments(
    roomId,
    buildTeamAssignments(snapshot.players, snapshot.room.team_count, true),
  );
}

export async function updateTeamName(roomId: string, playerId: string, nextName: string) {
  const snapshot = await getRoomSnapshotByRoomId(roomId);
  const player = snapshot.players.find((entry) => entry.id === playerId);
  const sanitizedName = sanitizeTeamName(nextName);

  if (!player) {
    throw new Error("Player not found.");
  }

  if (typeof player.team_index !== "number") {
    throw new Error("You are not assigned to a team.");
  }

  if (!sanitizedName) {
    throw new Error("Team name is required.");
  }

  const nextTeamNames = [...snapshot.room.team_names];
  nextTeamNames[player.team_index] = sanitizedName;

  const { error } = await supabase
    .from("rooms")
    .update({ team_names: nextTeamNames })
    .eq("id", roomId)
    .eq("game_type", "sayless");

  if (error) {
    throw new Error(asMessage(error));
  }
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

  const snapshot = await getRoomSnapshotByRoomId(roomId);
  const existingPlayer = snapshot.players.find((player) => player.id === playerId);

  if (!existingPlayer) {
    throw new Error("Player not found.");
  }

  if (
    snapshot.players.some(
      (player) =>
        player.id !== playerId &&
        player.name.toLowerCase() === normalizedName.toLowerCase(),
    )
  ) {
    throw new Error("That name is already taken in this room.");
  }

  if (
    snapshot.players.some(
      (player) =>
        player.id !== playerId &&
        (player.color ?? "").toLowerCase() === normalizedColor,
    )
  ) {
    throw new Error("That color was just taken. Choose another.");
  }

  const { error } = await supabase
    .from("players")
    .update({
      name: normalizedName,
      color: normalizedColor,
      emoji: normalizedEmoji,
    })
    .eq("id", playerId)
    .eq("room_id", roomId);

  if (error) {
    throw new Error(asMessage(error));
  }
}

export async function startGame(roomId: string, playerId: string) {
  const snapshot = await getRoomSnapshotByRoomId(roomId);
  const host = snapshot.players.find((player) => player.id === playerId);
  if (!host?.is_host) {
    throw new Error("Only the room creator can do that.");
  }

  if (snapshot.room.phase !== "lobby") {
    throw new Error("The game has already started.");
  }

  if (!hasReadyTeams(snapshot.players, snapshot.room.team_count)) {
    throw new Error("Need at least one player in every team.");
  }

  const totalCardsNeeded = calculateDraftTarget(
    snapshot.players.length,
    snapshot.state.cards_per_player,
  );
  const libraryCount = await getCardLibraryCount();

  if (libraryCount < totalCardsNeeded) {
    throw new Error(
      `Need ${totalCardsNeeded} cards for this lobby, but only ${libraryCount} are in the deck. Lower cards per player or add more cards.`,
    );
  }

  await beginDraft(roomId, snapshot);
}

export async function getDraftCardForPlayer(roomId: string, playerId: string) {
  const [snapshot, cards, draftHands] = await Promise.all([
    getRoomSnapshotByRoomId(roomId),
    getCardLibrary(),
    getDraftHands(roomId),
  ]);

  if (snapshot.room.phase !== "drafting") {
    await clearActiveDraftHand(roomId, playerId);
    return null;
  }

  const player = snapshot.players.find((entry) => entry.id === playerId);
  if (!player) {
    throw new Error("Player not found.");
  }

  const draftCounts = getDraftCountsByPlayer(snapshot.roomCards);
  if ((draftCounts.get(playerId) ?? 0) >= snapshot.state.cards_per_player) {
    await clearActiveDraftHand(roomId, playerId);
    return null;
  }

  const target = calculateDraftTarget(
    snapshot.players.length,
    snapshot.state.cards_per_player,
  );
  if (snapshot.roomCards.length >= target) {
    await clearActiveDraftHand(roomId, playerId);
    return null;
  }

  const activeDraftHand = draftHands.find((hand) => hand.player_id === playerId) ?? null;
  if (activeDraftHand) {
    const activeCardAlreadyDrafted = snapshot.roomCards.some(
      (card) => card.card_id === activeDraftHand.card_id,
    );
    if (!activeCardAlreadyDrafted) {
      const activeCard = cards.find((card) => card.id === activeDraftHand.card_id) ?? null;
      if (activeCard) {
        return activeCard;
      }
    }

    await clearActiveDraftHand(roomId, playerId);
  }

  const seenCardIds = new Set(snapshot.draftRejections.map((rejection) => rejection.card_id));
  const availableCards = getAvailableDraftCards(
    cards,
    snapshot.roomCards,
    seenCardIds,
    draftHands,
    false,
  );

  if (availableCards.length > 0) {
    return reserveDraftCard(roomId, playerId, availableCards);
  }

  const fallbackCards = getAvailableDraftCards(
    cards,
    snapshot.roomCards,
    seenCardIds,
    draftHands,
    true,
  );

  return reserveDraftCard(roomId, playerId, fallbackCards);
}

export async function submitDraftDecision(
  roomId: string,
  playerId: string,
  cardId: string,
  accept: boolean,
) {
  const [snapshot, draftHands] = await Promise.all([
    getRoomSnapshotByRoomId(roomId),
    getDraftHands(roomId),
  ]);

  if (snapshot.room.phase !== "drafting") {
    throw new Error("Drafting is over.");
  }

  const player = snapshot.players.find((entry) => entry.id === playerId);
  if (!player) {
    throw new Error("Player not found.");
  }

  const draftCounts = getDraftCountsByPlayer(snapshot.roomCards);
  if ((draftCounts.get(playerId) ?? 0) >= snapshot.state.cards_per_player) {
    await clearActiveDraftHand(roomId, playerId);
    await maybeAdvanceGame(roomId);
    return;
  }

  const totalTarget = calculateDraftTarget(
    snapshot.players.length,
    snapshot.state.cards_per_player,
  );
  if (snapshot.roomCards.length >= totalTarget) {
    await clearActiveDraftHand(roomId, playerId);
    await maybeAdvanceGame(roomId);
    return;
  }

  const activeDraftHand = draftHands.find((hand) => hand.player_id === playerId) ?? null;
  if (!activeDraftHand || activeDraftHand.card_id !== cardId) {
    throw new Error("That draft card is no longer active. Grab the next one.");
  }

  const cardAlreadyDrafted = snapshot.roomCards.some((card) => card.card_id === cardId);
  if (cardAlreadyDrafted) {
    await clearActiveDraftHand(roomId, playerId);
    throw new Error("That card just got taken. Grab the next one.");
  }

  if (accept) {
    const { error } = await supabase.from("sayless_room_cards").insert({
      room_id: roomId,
      card_id: cardId,
      drafted_by_player_id: playerId,
      sort_order: snapshot.roomCards.length,
      status: "pending",
    });

    if (error) {
      throw new Error(asMessage(error));
    }
  }

  await clearActiveDraftHand(roomId, playerId);

  await maybeAdvanceGame(roomId);
}

export async function startPlayerTurn(roomId: string, playerId: string) {
  let snapshot = await getRoomSnapshotByRoomId(roomId);

  if (snapshot.room.phase !== "playing") {
    throw new Error("It is not an active round.");
  }

  if (snapshot.state.active_player_id !== playerId) {
    throw new Error("It is not your turn.");
  }

  if (snapshot.state.turn_deadline_at) {
    throw new Error("This turn has already started.");
  }

  if (hasClearedEntireDeck(snapshot.roomCards)) {
    await finishRound(snapshot);
    return;
  }

  let pendingCards = getPendingCards(snapshot.roomCards);
  if (pendingCards.length === 0) {
    await resetPassedCards(roomId);
    snapshot = await getRoomSnapshotByRoomId(roomId);
    pendingCards = getPendingCards(snapshot.roomCards);
  }

  const nextCard = pendingCards[0] ?? null;
  if (!nextCard) {
    await finishRound(snapshot);
    return;
  }

  const deadlineAt = buildDeadline(snapshot.state.turn_seconds);
  await persistState(roomId, {
    active_card_entry_id: nextCard.id,
    turn_deadline_at: deadlineAt,
  });
}

export async function submitTurnAction(
  roomId: string,
  playerId: string,
  action: TurnAction,
) {
  const snapshot = await getRoomSnapshotByRoomId(roomId);

  if (snapshot.room.phase !== "playing") {
    throw new Error("It is not an active round.");
  }

  if (snapshot.state.active_player_id !== playerId) {
    throw new Error("It is not your turn.");
  }

  const player = snapshot.players.find((entry) => entry.id === playerId);
  const activeCard = snapshot.roomCards.find(
    (card) => card.id === snapshot.state.active_card_entry_id,
  );

  if (!player || typeof player.team_index !== "number") {
    throw new Error("Player not found.");
  }

  if (!activeCard) {
    await maybeAdvanceGame(roomId);
    return;
  }

  if (activeCard.status === "cleared") {
    throw new Error("Wait for the next card.");
  }

  if (action === "pass") {
    const { error } = await supabase
      .from("sayless_room_cards")
      .update({ status: "passed" })
      .eq("id", activeCard.id)
      .eq("room_id", roomId);

    if (error) {
      throw new Error(asMessage(error));
    }

    await advanceWithinTurn(roomId);
    return;
  }

  const markCardResult = await supabase
    .from("sayless_room_cards")
    .update({ status: "cleared" })
    .eq("id", activeCard.id)
    .eq("room_id", roomId);

  if (markCardResult.error) {
    throw new Error(asMessage(markCardResult.error));
  }

  const roundResult = await supabase.from("sayless_round_results").insert({
    room_id: roomId,
    round_index: snapshot.state.current_round_index,
    team_index: player.team_index,
    player_id: playerId,
    card_entry_id: activeCard.id,
    points: activeCard.card.points,
  });

  if (roundResult.error) {
    throw new Error(asMessage(roundResult.error));
  }

  const scoreResult = await supabase
    .from("players")
    .update({ score: player.score + activeCard.card.points })
    .eq("id", playerId)
    .eq("room_id", roomId);

  if (scoreResult.error) {
    throw new Error(asMessage(scoreResult.error));
  }

  await advanceWithinTurn(roomId);
}

export async function maybeAdvanceGame(roomId: string) {
  const { data: roomData, error: roomError } = await supabase
    .from("rooms")
    .select("id, game_type, phase")
    .eq("id", roomId)
    .maybeSingle();

  if (roomError) {
    throw new Error(asMessage(roomError));
  }

  if (!roomData || roomData.game_type !== "sayless") {
    return;
  }

  if (roomData.phase === "playing") {
    const { data: stateData, error: stateError } = await supabase
      .from("sayless_room_state")
      .select("turn_deadline_at")
      .eq("room_id", roomId)
      .maybeSingle();

    if (stateError) {
      throw new Error(asMessage(stateError));
    }

    if (stateData?.turn_deadline_at && isDeadlineExpired(stateData.turn_deadline_at)) {
      await advanceToNextTurn(roomId);
    }
    return;
  }

  const snapshot = await getRoomSnapshotByRoomId(roomId);

  if (snapshot.room.phase === "drafting") {
    const target = calculateDraftTarget(
      snapshot.players.length,
      snapshot.state.cards_per_player,
    );

    if (snapshot.roomCards.length >= target && target > 0) {
      await startPlayingTurn(roomId, snapshot, {
        currentRoundIndex: 0,
        startingTeamIndex: 0,
        teamTurnCounts: Array.from({ length: snapshot.room.team_count }, () => 0),
      });
    }
    return;
  }

}

export async function continueFromRoundSummary(roomId: string, playerId: string) {
  const snapshot = await getRoomSnapshotByRoomId(roomId);
  const host = snapshot.players.find((player) => player.id === playerId);
  if (!host?.is_host) {
    throw new Error("Only the room creator can do that.");
  }

  if (snapshot.room.phase !== "round_summary") {
    throw new Error("Round summary is not active.");
  }

  const isFinalRound =
    snapshot.state.current_round_index + 1 >= snapshot.state.round_count;

  if (isFinalRound) {
    await updateRoomPhase(roomId, "finished", null);
    return;
  }

  const nextRoundIndex = snapshot.state.current_round_index + 1;
  const nextStartingTeamIndex = getLowestScoreTeamIndex(
    snapshot.players,
    snapshot.room.team_count,
  );

  const roomCardReset = await supabase
    .from("sayless_room_cards")
    .update({ status: "pending" })
    .eq("room_id", roomId);

  if (roomCardReset.error) {
    throw new Error(asMessage(roomCardReset.error));
  }

  await persistState(roomId, {
    current_round_index: nextRoundIndex,
    starting_team_index: nextStartingTeamIndex,
    active_team_index: nextStartingTeamIndex,
    active_player_id: null,
    active_card_entry_id: null,
    turn_deadline_at: null,
    team_turn_counts: Array.from({ length: snapshot.room.team_count }, () => 0),
  });

  const refreshedSnapshot = await getRoomSnapshotByRoomId(roomId);
  await startPlayingTurn(roomId, refreshedSnapshot, {
    currentRoundIndex: nextRoundIndex,
    startingTeamIndex: nextStartingTeamIndex,
    teamTurnCounts: Array.from({ length: snapshot.room.team_count }, () => 0),
  });
}

export async function playAgainToLobby(roomId: string, playerId: string) {
  const snapshot = await getRoomSnapshotByRoomId(roomId);
  const host = snapshot.players.find((player) => player.id === playerId);
  if (!host?.is_host) {
    throw new Error("Only the room creator can do that.");
  }

  await clearGameData(roomId);
  await resetPlayerScores(roomId);
  await persistState(roomId, {
    cards_per_player: snapshot.state.cards_per_player,
    round_count: snapshot.state.round_count,
    turn_seconds: snapshot.state.turn_seconds,
    current_round_index: 0,
    starting_team_index: 0,
    active_team_index: 0,
    active_player_id: null,
    active_card_entry_id: null,
    turn_deadline_at: null,
    team_turn_counts: Array.from({ length: snapshot.room.team_count }, () => 0),
  });
  await updateRoomPhase(roomId, "lobby", null);
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
