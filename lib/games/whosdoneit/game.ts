import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  DEFAULT_PLAYER_COLOR,
  PLAYER_COLOR_POOL,
} from "@/lib/player-color-pool";
import { PLAYER_EMOJI_POOL } from "@/lib/player-emoji-pool";
import { supabase } from "@/lib/supabase";
import type { SayLessRoomSettings } from "@/types/sayless";
import type {
  Confession,
  GameSnapshot,
  Guess,
  Player,
  PlayerProfile,
  Prompt,
  Room,
  RoomSettings,
} from "@/types/whosdoneit";

const MIN_TIMER_SECONDS = 5;
const MAX_TIMER_SECONDS = 180;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 10;
const ROUND_PROMPT_FACTOR = 1000;

const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  promptSeconds: 150,
  roundCount: 1,
  answeringSeconds: 25,
  guessingSeconds: 35,
  revealSeconds: 8,
  fastMode: false,
};

export { DEFAULT_PLAYER_COLOR, PLAYER_COLOR_POOL };
export { PLAYER_EMOJI_POOL };
export const DEFAULT_PLAYER_EMOJI = PLAYER_EMOJI_POOL[0];

const PLAYER_COLOR_SET: Set<string> = new Set<string>(
  PLAYER_COLOR_POOL.map((color) => color.toLowerCase()),
);
const PLAYER_EMOJI_SET: Set<string> = new Set<string>(PLAYER_EMOJI_POOL);
const TEST_BOT_NAME_PREFIX = "Test Bot";
const MAX_TEST_BOT_ADD_COUNT = 20;

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function normalizeName(name: string) {
  return name.trim();
}

function normalizeColor(color?: string) {
  const normalized = (color ?? "").trim().toLowerCase();
  return PLAYER_COLOR_SET.has(normalized) ? normalized : DEFAULT_PLAYER_COLOR;
}

function normalizeEmoji(emoji?: string) {
  const normalized = (emoji ?? "").trim();
  return PLAYER_EMOJI_SET.has(normalized) ? normalized : DEFAULT_PLAYER_EMOJI;
}

function normalizePrompt(prompt: string) {
  return prompt.trim();
}

function parseTestBotNumber(name: string) {
  const match = name.match(/^Test Bot (\d+)$/);
  return match ? Number(match[1]) : null;
}

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

function randomizeOrder<T>(items: T[]) {
  const cloned = [...items];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const swapIndex = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[swapIndex]] = [cloned[swapIndex], cloned[i]];
  }
  return cloned;
}

function pickRandomValues<T extends string>(
  pool: readonly T[],
  count: number,
  exclude: Set<string> = new Set<string>(),
) {
  const available = pool.filter((value) => !exclude.has(value));
  const shuffled = randomizeOrder(available);
  return shuffled.slice(0, Math.max(0, count));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function choicesMatch(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((entry, index) => entry === right[index]);
}

function rerollChoices(
  previousChoices: string[] | undefined,
  createChoices: () => string[],
  shouldRetry?: (nextChoices: string[], previousChoices: string[]) => boolean,
  maxAttempts = 8,
) {
  const previous = previousChoices ?? [];
  let next = createChoices();

  for (
    let attempt = 0;
    attempt < maxAttempts &&
    (choicesMatch(next, previous) || (shouldRetry ? shouldRetry(next, previous) : false));
    attempt += 1
  ) {
    next = createChoices();
  }

  return next;
}

export function buildColorChoices(params: {
  selectedColor?: string;
  takenColors?: string[];
  previousChoices?: string[];
  count?: number;
}) {
  const count = params.count ?? 3;
  const hasSelectedColor = typeof params.selectedColor === "string" && params.selectedColor.trim().length > 0;
  const selectedColor = hasSelectedColor ? normalizeColor(params.selectedColor) : null;
  const availablePool = [...PLAYER_COLOR_POOL] as string[];
  const carryOver = uniqueStrings(
    (params.previousChoices ?? []).filter(
      (color) => availablePool.includes(color),
    ),
  );

  const choices = [...carryOver];
  if (selectedColor && availablePool.includes(selectedColor) && !choices.includes(selectedColor)) {
    choices.unshift(selectedColor);
  }

  const filler = pickRandomValues(
    availablePool,
    Math.max(0, count - choices.length),
    new Set(choices),
  );

  const output = uniqueStrings([...choices, ...filler]).slice(0, count);
  return output.length > 0 ? output : [DEFAULT_PLAYER_COLOR];
}

export function refreshColorChoices(params: {
  takenColors?: string[];
  previousChoices?: string[];
  count?: number;
  maxAttempts?: number;
}) {
  const count = params.count ?? 3;
  const availablePool = [...PLAYER_COLOR_POOL] as string[];
  const previousSet = new Set(
    (params.previousChoices ?? []).filter((color) => availablePool.includes(color)),
  );
  const nonPreviousCount = availablePool.filter(
    (color) => !previousSet.has(color),
  ).length;
  const canAvoidOverlap = nonPreviousCount >= Math.min(count, availablePool.length);

  return rerollChoices(
    params.previousChoices,
    () =>
      buildColorChoices({
        count: params.count,
      }),
    canAvoidOverlap
      ? (nextChoices) => nextChoices.some((choice) => previousSet.has(choice))
      : undefined,
    params.maxAttempts,
  );
}

export function buildEmojiChoices(params: {
  selectedEmoji?: string;
  previousChoices?: string[];
  count?: number;
}) {
  const count = params.count ?? 3;
  const hasSelectedEmoji = typeof params.selectedEmoji === "string" && params.selectedEmoji.trim().length > 0;
  const selectedEmoji = hasSelectedEmoji ? normalizeEmoji(params.selectedEmoji) : null;
  const carryOver = uniqueStrings(
    (params.previousChoices ?? []).filter((emoji) => PLAYER_EMOJI_SET.has(emoji)),
  );

  const choices = [...carryOver];
  if (selectedEmoji && !choices.includes(selectedEmoji)) {
    choices.unshift(selectedEmoji);
  }

  const filler = pickRandomValues(
    PLAYER_EMOJI_POOL,
    Math.max(0, count - choices.length),
    new Set(choices),
  );

  const output = uniqueStrings([...choices, ...filler]).slice(0, count);
  return output.length > 0 ? output : [DEFAULT_PLAYER_EMOJI];
}

export function refreshEmojiChoices(params: {
  previousChoices?: string[];
  count?: number;
  maxAttempts?: number;
}) {
  const count = params.count ?? 3;
  const previousSet = new Set(
    (params.previousChoices ?? []).filter((emoji) => PLAYER_EMOJI_SET.has(emoji)),
  );
  const nonPreviousCount = PLAYER_EMOJI_POOL.filter(
    (emoji) => !previousSet.has(emoji),
  ).length;
  const canAvoidOverlap = nonPreviousCount >= Math.min(count, PLAYER_EMOJI_POOL.length);

  return rerollChoices(
    params.previousChoices,
    () =>
      buildEmojiChoices({
        count: params.count,
      }),
    canAvoidOverlap
      ? (nextChoices) => nextChoices.some((choice) => previousSet.has(choice))
      : undefined,
    params.maxAttempts,
  );
}

function getSortedPlayers(players: Player[]) {
  return [...players].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function getSortedPrompts(prompts: Prompt[]) {
  return [...prompts].sort((a, b) => a.prompt_order - b.prompt_order);
}

function clampSeconds(value: number) {
  return Math.min(MAX_TIMER_SECONDS, Math.max(MIN_TIMER_SECONDS, Math.round(value)));
}

function clampRounds(value: number) {
  return Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Math.round(value)));
}

function sanitizeSettings(
  settings?: Partial<RoomSettings>,
  baseSettings?: Partial<RoomSettings>,
) {
  return {
    promptSeconds: clampSeconds(
      settings?.promptSeconds ??
        baseSettings?.promptSeconds ??
        DEFAULT_ROOM_SETTINGS.promptSeconds,
    ),
    roundCount: clampRounds(
      settings?.roundCount ??
        baseSettings?.roundCount ??
        DEFAULT_ROOM_SETTINGS.roundCount,
    ),
    answeringSeconds: clampSeconds(
      settings?.answeringSeconds ??
        baseSettings?.answeringSeconds ??
        DEFAULT_ROOM_SETTINGS.answeringSeconds,
    ),
    guessingSeconds: clampSeconds(
      settings?.guessingSeconds ??
        baseSettings?.guessingSeconds ??
        DEFAULT_ROOM_SETTINGS.guessingSeconds,
    ),
    revealSeconds: clampSeconds(
      settings?.revealSeconds ??
        baseSettings?.revealSeconds ??
        DEFAULT_ROOM_SETTINGS.revealSeconds,
    ),
    fastMode:
      typeof settings?.fastMode === "boolean"
        ? settings.fastMode
        : typeof baseSettings?.fastMode === "boolean"
          ? baseSettings.fastMode
          : DEFAULT_ROOM_SETTINGS.fastMode,
  };
}

function addSecondsToNow(seconds: number) {
  return new Date(Date.now() + Math.max(1, seconds) * 1000).toISOString();
}

function getExpectedGuessCount(playerCount: number) {
  return playerCount * Math.max(playerCount - 1, 0);
}

const REVEAL_MAJORITY_THRESHOLD = 0.79;

export function getConfessionParticipants(players: Player[], confessions: Confession[]) {
  const participantIds = new Set(confessions.map((entry) => entry.player_id));
  return players.filter((player) => participantIds.has(player.id));
}

function getRevealInterestBucket(params: {
  truth: boolean;
  guessedInnocentCount: number;
  guessedGuiltyCount: number;
}) {
  const totalGuesses = params.guessedInnocentCount + params.guessedGuiltyCount;
  if (totalGuesses <= 0) {
    return 9;
  }

  const innocentRatio = params.guessedInnocentCount / totalGuesses;
  const guiltyRatio = params.guessedGuiltyCount / totalGuesses;
  const allInnocent = params.guessedInnocentCount === totalGuesses;
  const allGuilty = params.guessedGuiltyCount === totalGuesses;

  if (allInnocent && params.truth === false) {
    return 1;
  }
  if (allInnocent && params.truth === true) {
    return 2;
  }
  if (innocentRatio > REVEAL_MAJORITY_THRESHOLD && params.truth === false) {
    return 3;
  }
  if (innocentRatio > REVEAL_MAJORITY_THRESHOLD && params.truth === true) {
    return 4;
  }
  if (allGuilty && params.truth === true) {
    return 5;
  }
  if (allGuilty && params.truth === false) {
    return 6;
  }
  if (guiltyRatio > REVEAL_MAJORITY_THRESHOLD && params.truth === true) {
    return 7;
  }
  if (guiltyRatio > REVEAL_MAJORITY_THRESHOLD && params.truth === false) {
    return 8;
  }

  return 9;
}

export function getRevealPlayersForPrompt(
  players: Player[],
  confessions: Confession[],
  guesses: Guess[],
) {
  const participants = getConfessionParticipants(players, confessions);
  const participantIds = new Set(participants.map((player) => player.id));
  const truthByPlayer = new Map(confessions.map((entry) => [entry.player_id, entry.answer]));

  const withInterest = participants.map((player) => {
    const targetGuesses = guesses.filter(
      (entry) =>
        entry.target_player_id === player.id &&
        participantIds.has(entry.guessing_player_id),
    );
    const guessedInnocentCount = targetGuesses.filter(
      (entry) => entry.guessed_answer === false,
    ).length;
    const guessedGuiltyCount = targetGuesses.length - guessedInnocentCount;
    const truth = truthByPlayer.get(player.id) === true;

    return {
      player,
      interestBucket: getRevealInterestBucket({
        truth,
        guessedInnocentCount,
        guessedGuiltyCount,
      }),
      guessedInnocentCount,
      guessedGuiltyCount,
    };
  });

  return withInterest
    .sort(
      (left, right) =>
        left.interestBucket - right.interestBucket ||
        right.guessedInnocentCount + right.guessedGuiltyCount -
          (left.guessedInnocentCount + left.guessedGuiltyCount) ||
        left.player.created_at.localeCompare(right.player.created_at) ||
        left.player.id.localeCompare(right.player.id),
    )
    .map((entry) => entry.player);
}

function decodeRoundPromptIndex(value: number) {
  const normalized = Math.max(0, Math.floor(value));
  return {
    roundIndex: Math.floor(normalized / ROUND_PROMPT_FACTOR),
    promptIndex: normalized % ROUND_PROMPT_FACTOR,
  };
}

export function getRoundCursor(room: Room) {
  return decodeRoundPromptIndex(room.current_prompt_index);
}

export function getDefaultRoomSettings() {
  return { ...DEFAULT_ROOM_SETTINGS };
}

export function getCurrentPrompt(room: Room, prompts: Prompt[]) {
  const { promptIndex } = decodeRoundPromptIndex(room.current_prompt_index);
  return getSortedPrompts(prompts)[promptIndex] ?? null;
}

type CreateRoomOptions = {
  settings?: Partial<RoomSettings>;
  playerColor?: string;
  playerEmoji?: string;
};

async function getGameSnapshotByRoomId(roomId: string): Promise<GameSnapshot> {
  const [roomResult, playersResult, promptsResult, confessionsResult, guessesResult] =
    await Promise.all([
      supabase.from("rooms").select("*").eq("id", roomId).single(),
      supabase
        .from("players")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true }),
      supabase
        .from("prompts")
        .select("*")
        .eq("room_id", roomId)
        .order("prompt_order", { ascending: true }),
      supabase
        .from("confessions")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true }),
      supabase
        .from("guesses")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true }),
    ]);

  if (roomResult.error) throw new Error(asMessage(roomResult.error));
  if (playersResult.error) throw new Error(asMessage(playersResult.error));
  if (promptsResult.error) throw new Error(asMessage(promptsResult.error));
  if (confessionsResult.error) throw new Error(asMessage(confessionsResult.error));
  if (guessesResult.error) throw new Error(asMessage(guessesResult.error));

  return {
    room: roomResult.data as Room,
    players: (playersResult.data ?? []) as Player[],
    prompts: (promptsResult.data ?? []) as Prompt[],
    confessions: (confessionsResult.data ?? []) as Confession[],
    guesses: (guessesResult.data ?? []) as Guess[],
  };
}

export async function addFakePlayers(roomId: string, playerId: string, count: number) {
  const safeCount = Math.max(
    1,
    Math.min(MAX_TEST_BOT_ADD_COUNT, Math.round(Number(count) || 0)),
  );
  if (!safeCount) {
    throw new Error("Choose at least one fake player.");
  }

  const [playerResult, roomResult, roomPlayersResult] = await Promise.all([
    supabase
      .from("players")
      .select("*")
      .eq("id", playerId)
      .eq("room_id", roomId)
      .maybeSingle(),
    supabase.from("rooms").select("*").eq("id", roomId).maybeSingle(),
    supabase.from("players").select("*").eq("room_id", roomId),
  ]);

  if (playerResult.error) {
    throw new Error(asMessage(playerResult.error));
  }
  if (!playerResult.data || !(playerResult.data as Player).is_host) {
    throw new Error("Only the room creator can add fake players.");
  }
  if (roomResult.error) {
    throw new Error(asMessage(roomResult.error));
  }
  if (!roomResult.data) {
    throw new Error("Room not found.");
  }

  const room = roomResult.data as Room;
  if (room.phase !== "lobby") {
    throw new Error("Fake players can only be added in lobby.");
  }

  if (roomPlayersResult.error) {
    throw new Error(asMessage(roomPlayersResult.error));
  }
  const existingPlayers = (roomPlayersResult.data ?? []) as Player[];
  const takenColors = new Set(existingPlayers.map((player) => player.color.toLowerCase()));
  const availableColors = randomizeOrder(
    PLAYER_COLOR_POOL.filter((color) => !takenColors.has(color)) as string[],
  );
  const createCount = Math.min(safeCount, availableColors.length);

  if (createCount <= 0) {
    throw new Error("No colors available for additional fake players.");
  }

  const takenNames = new Set(existingPlayers.map((player) => player.name.toLowerCase()));
  const usedBotNumbers = new Set<number>();
  existingPlayers.forEach((player) => {
    const botNumber = parseTestBotNumber(player.name);
    if (botNumber) {
      usedBotNumbers.add(botNumber);
    }
  });

  let nextBotNumber = 1;
  const inserts: Array<{
    room_id: string;
    name: string;
    color: string;
    emoji: string;
    is_host: boolean;
    score: number;
  }> = [];

  for (let index = 0; index < createCount; index += 1) {
    while (
      usedBotNumbers.has(nextBotNumber) ||
      takenNames.has(`${TEST_BOT_NAME_PREFIX.toLowerCase()} ${nextBotNumber}`)
    ) {
      nextBotNumber += 1;
    }

    const botName = `${TEST_BOT_NAME_PREFIX} ${nextBotNumber}`;
    usedBotNumbers.add(nextBotNumber);
    takenNames.add(botName.toLowerCase());

    inserts.push({
      room_id: roomId,
      name: botName,
      color: availableColors[index] ?? DEFAULT_PLAYER_COLOR,
      emoji: PLAYER_EMOJI_POOL[Math.floor(Math.random() * PLAYER_EMOJI_POOL.length)] ?? DEFAULT_PLAYER_EMOJI,
      is_host: false,
      score: 0,
    });

    nextBotNumber += 1;
  }

  const { error } = await supabase.from("players").insert(inserts);
  if (error) {
    throw new Error(asMessage(error));
  }

  return { createdCount: inserts.length };
}

export async function createRoom(hostName: string, options?: CreateRoomOptions) {
  const normalizedHostName = normalizeName(hostName);
  if (!normalizedHostName) {
    throw new Error("Name is required.");
  }

  const playerColor = normalizeColor(options?.playerColor);
  const playerEmoji = normalizeEmoji(options?.playerEmoji);
  const sanitizedSettings = sanitizeSettings(options?.settings);
  const payload = await callRpc<{ room: Room; player: Player }>("whd_create_room", {
    host_name: normalizedHostName,
    player_color: playerColor,
    player_emoji: playerEmoji,
    prompt_seconds: sanitizedSettings.promptSeconds,
    round_count: sanitizedSettings.roundCount,
    answering_seconds: sanitizedSettings.answeringSeconds,
    guessing_seconds: sanitizedSettings.guessingSeconds,
    reveal_seconds: sanitizedSettings.revealSeconds,
    fast_mode: sanitizedSettings.fastMode,
  });

  return payload;
}

export async function joinRoom(code: string, name: string, color?: string, emoji?: string) {
  const normalizedCode = normalizeCode(code);
  const normalizedName = normalizeName(name);
  const normalizedColor = normalizeColor(color);
  const normalizedEmoji = normalizeEmoji(emoji);

  if (!normalizedCode || !normalizedName) {
    throw new Error("Room code and name are required.");
  }

  const payload = await callRpc<{ room: Room; player: Player }>("whd_join_room", {
    room_code: normalizedCode,
    player_name: normalizedName,
    player_color: normalizedColor,
    player_emoji: normalizedEmoji,
  });

  return payload;
}

export async function updatePlayerProfile(
  roomId: string,
  playerId: string,
  nextProfile: PlayerProfile,
) {
  const normalizedName = normalizeName(nextProfile.name);
  if (!normalizedName) {
    throw new Error("Name is required.");
  }

  const normalizedColor = normalizeColor(nextProfile.color);
  const normalizedEmoji = normalizeEmoji(nextProfile.emoji);

  await callRpc("whd_update_player_profile", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_name: normalizedName,
    p_color: normalizedColor,
    p_emoji: normalizedEmoji,
  });
}

export async function updateRoomSettings(
  roomId: string,
  playerId: string,
  nextSettings: Partial<RoomSettings>,
) {
  const baseRoomResult = await supabase.from("rooms").select("*").eq("id", roomId).maybeSingle();
  if (baseRoomResult.error) {
    throw new Error(asMessage(baseRoomResult.error));
  }
  if (!baseRoomResult.data) {
    throw new Error("Room not found.");
  }

  const room = baseRoomResult.data as Room;
  const settings = sanitizeSettings(nextSettings, {
    promptSeconds: room.prompt_seconds,
    roundCount: room.round_count,
    answeringSeconds: room.answering_seconds,
    guessingSeconds: room.guessing_seconds,
    revealSeconds: room.reveal_seconds,
    fastMode: room.fast_mode,
  });

  await callRpc("whd_update_room_settings", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_prompt_seconds: settings.promptSeconds,
    p_round_count: settings.roundCount,
    p_answering_seconds: settings.answeringSeconds,
    p_guessing_seconds: settings.guessingSeconds,
    p_reveal_seconds: settings.revealSeconds,
    p_fast_mode: settings.fastMode,
  });
}

export async function switchRoomToSayLess(
  roomId: string,
  playerId: string,
  settings: Partial<SayLessRoomSettings>,
) {
  await callRpc("whd_switch_room_to_sayless", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_team_count: settings.teamCount,
    p_cards_per_player: settings.cardsPerPlayer,
    p_round_count: settings.roundCount,
    p_turn_seconds: settings.turnSeconds,
  });
}

export async function getGameSnapshotByCode(code: string): Promise<GameSnapshot> {
  const normalizedCode = normalizeCode(code);
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", normalizedCode)
    .maybeSingle();

  if (roomError) {
    throw new Error(asMessage(roomError));
  }
  if (!room) {
    throw new Error("Room not found.");
  }

  return getGameSnapshotByRoomId((room as Room).id);
}

export async function submitPrompt(roomId: string, playerId: string, text: string) {
  const normalizedText = normalizePrompt(text);
  if (!normalizedText) {
    throw new Error("Prompt text is required.");
  }

  await callRpc("whd_submit_prompt", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_text: normalizedText,
  });
}

export async function startGame(roomId: string, playerId: string) {
  await callRpc("whd_start_game", {
    p_room_id: roomId,
    p_player_id: playerId,
  });
}

export async function submitConfession(
  roomId: string,
  promptId: string,
  playerId: string,
  answer: boolean,
) {
  await callRpc("whd_submit_confession", {
    p_room_id: roomId,
    p_prompt_id: promptId,
    p_player_id: playerId,
    p_answer: answer,
  });
}

export async function submitGuess(
  roomId: string,
  promptId: string,
  guessingPlayerId: string,
  targetPlayerId: string,
  guessedAnswer: boolean,
) {
  if (guessingPlayerId === targetPlayerId) {
    throw new Error("You cannot guess your own answer.");
  }

  const { error } = await supabase.from("guesses").upsert(
    {
      room_id: roomId,
      prompt_id: promptId,
      guessing_player_id: guessingPlayerId,
      target_player_id: targetPlayerId,
      guessed_answer: guessedAnswer,
    },
    { onConflict: "prompt_id,guessing_player_id,target_player_id" },
  );

  if (error) {
    throw new Error(asMessage(error));
  }
}

export async function submitGuesses(
  roomId: string,
  promptId: string,
  guessingPlayerId: string,
  guesses: Array<{
    targetPlayerId: string;
    guessedAnswer: boolean;
  }>,
) {
  const payload = guesses
    .filter((entry) => entry.targetPlayerId !== guessingPlayerId)
    .map((entry) => ({
      room_id: roomId,
      prompt_id: promptId,
      guessing_player_id: guessingPlayerId,
      target_player_id: entry.targetPlayerId,
      guessed_answer: entry.guessedAnswer,
    }));

  if (payload.length === 0) {
    return;
  }

  await callRpc("whd_submit_guesses", {
    p_room_id: roomId,
    p_prompt_id: promptId,
    p_guessing_player_id: guessingPlayerId,
    p_guesses: payload.map((entry) => ({
      target_player_id: entry.target_player_id,
      guessed_answer: entry.guessed_answer,
    })),
  });
}

export async function maybeAdvanceRoom(roomId: string) {
  await callRpc("whd_maybe_advance_room", {
    p_room_id: roomId,
  });
}

export async function revealCurrentPlayer(roomId: string, playerId: string) {
  const snapshot = await getGameSnapshotByRoomId(roomId);
  const players = getSortedPlayers(snapshot.players);
  const actingPlayer = players.find((player) => player.id === playerId);
  const room = snapshot.room;
  const currentPrompt = getCurrentPrompt(room, snapshot.prompts);

  if (room.phase !== "revealing") {
    throw new Error("Reveal step is not active.");
  }
  if (!currentPrompt) {
    throw new Error("No prompt is active.");
  }
  if (room.reveal_truth_visible) {
    throw new Error("Already revealed.");
  }

  const promptConfessions = snapshot.confessions.filter(
    (entry) => entry.prompt_id === currentPrompt.id,
  );
  const promptGuesses = snapshot.guesses.filter(
    (entry) => entry.prompt_id === currentPrompt.id,
  );
  const revealPlayers = getRevealPlayersForPrompt(
    players,
    promptConfessions,
    promptGuesses,
  );
  const currentRevealPlayer = revealPlayers[room.reveal_player_index];
  if (
    !currentRevealPlayer ||
    (currentRevealPlayer.id !== playerId && !actingPlayer?.is_host)
  ) {
    throw new Error("Only the current reveal player or host can do that.");
  }

  const { error } = await supabase
    .from("rooms")
    .update({
      reveal_truth_visible: true,
      phase_deadline_at: addSecondsToNow(room.reveal_seconds),
    })
    .eq("id", roomId)
    .eq("phase", "revealing")
    .eq("reveal_player_index", room.reveal_player_index)
    .eq("reveal_truth_visible", false);

  if (error) {
    throw new Error(asMessage(error));
  }
}

export async function advanceReveal(roomId: string, playerId: string) {
  await callRpc("whd_advance_reveal", {
    p_room_id: roomId,
    p_player_id: playerId,
  });
}

export async function startNextRound(roomId: string, playerId: string) {
  await callRpc("whd_start_next_round", {
    p_room_id: roomId,
    p_player_id: playerId,
  });
}

export async function playAgainToLobby(roomId: string, playerId: string) {
  await callRpc("whd_play_again", {
    p_room_id: roomId,
    p_player_id: playerId,
  });
}

export function getRoundProgress(snapshot: GameSnapshot) {
  const players = getSortedPlayers(snapshot.players);
  const currentPrompt = getCurrentPrompt(snapshot.room, snapshot.prompts);

  if (!currentPrompt) {
    return {
      players,
      currentPrompt: null,
      confessions: [] as Confession[],
      guesses: [] as Guess[],
      confessionCount: 0,
      expectedConfessions: players.length,
      guessCount: 0,
      expectedGuesses: getExpectedGuessCount(players.length),
    };
  }

  const confessions = snapshot.confessions.filter(
    (confession) => confession.prompt_id === currentPrompt.id,
  );
  const guesses = snapshot.guesses.filter((guess) => guess.prompt_id === currentPrompt.id);
  const confessionParticipants = getConfessionParticipants(players, confessions);

  return {
    players,
    currentPrompt,
    confessions,
    guesses,
    confessionCount: confessions.length,
    expectedConfessions: players.length,
    guessCount: guesses.length,
    expectedGuesses: getExpectedGuessCount(confessionParticipants.length),
  };
}

export function subscribeToRoom(roomId: string, onChange: () => void) {
  const channel: RealtimeChannel = supabase
    .channel(`room-${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "players",
        filter: `room_id=eq.${roomId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "prompts",
        filter: `room_id=eq.${roomId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "confessions",
        filter: `room_id=eq.${roomId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "guesses",
        filter: `room_id=eq.${roomId}`,
      },
      onChange,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
