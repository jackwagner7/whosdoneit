import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type {
  Confession,
  GameSnapshot,
  Guess,
  Player,
  PlayerProfile,
  Prompt,
  Room,
  RoomSettings,
} from "@/types/games";

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MAX_ROOM_CODE_ATTEMPTS = 12;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;
const MIN_TIMER_SECONDS = 5;
const MAX_TIMER_SECONDS = 180;

const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  answeringSeconds: 25,
  guessingSeconds: 35,
  revealSeconds: 8,
};

export const PLAYER_COLOR_POOL = [
  "#2563eb",
  "#0ea5e9",
  "#06b6d4",
  "#14b8a6",
  "#10b981",
  "#22c55e",
  "#84cc16",
  "#eab308",
  "#f59e0b",
  "#f97316",
  "#f97393",
  "#ec4899",
  "#d946ef",
  "#a855f7",
  "#8b5cf6",
  "#6366f1",
  "#ef4444",
  "#dc2626",
  "#b91c1c",
  "#475569",
] as const;

export const PLAYER_EMOJI_POOL = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😆",
  "😅",
  "😂",
  "🤣",
  "🙂",
  "😊",
  "😇",
  "🙃",
  "😉",
  "😌",
  "😍",
  "🥰",
  "😘",
  "😋",
  "😛",
  "😜",
  "🤪",
  "🤨",
  "🧐",
  "🤓",
  "😎",
  "🤩",
  "🥳",
  "😏",
  "😬",
  "🤗",
  "🤭",
  "🤫",
  "🤔",
  "🫡",
  "🫠",
  "😴",
  "🤤",
  "😺",
  "😸",
  "😹",
  "😻",
  "😼",
  "🙈",
  "🙉",
  "🙊",
  "🦊",
  "🐼",
  "🐸",
  "🐵",
  "🦁",
  "🐯",
  "🐨",
  "🐧",
  "🐙",
  "🦄",
  "🐲",
  "👻",
  "🤖",
  "👽",
  "🎃",
  "🌞",
  "🌈",
  "🔥",
  "⚡",
  "💥",
  "✨",
  "🎉",
  "🎯",
  "🧠",
  "🕵️",
  "🧩",
  "🎲",
  "🍕",
  "🍔",
  "🍟",
  "🌮",
  "🍩",
  "🍪",
  "🍉",
  "🍓",
  "🍒",
] as const;

export const DEFAULT_PLAYER_COLOR = PLAYER_COLOR_POOL[0];
export const DEFAULT_PLAYER_EMOJI = PLAYER_EMOJI_POOL[0];

const PLAYER_COLOR_SET: Set<string> = new Set<string>(
  PLAYER_COLOR_POOL.map((color) => color.toLowerCase()),
);
const PLAYER_EMOJI_SET: Set<string> = new Set<string>(PLAYER_EMOJI_POOL);

type SupabaseResult = { error: unknown };

function generateRoomCode(length = 4) {
  let code = "";
  for (let i = 0; i < length; i += 1) {
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
  return PLAYER_COLOR_SET.has(normalized) ? normalized : DEFAULT_PLAYER_COLOR;
}

function normalizeEmoji(emoji?: string) {
  const normalized = (emoji ?? "").trim();
  return PLAYER_EMOJI_SET.has(normalized) ? normalized : DEFAULT_PLAYER_EMOJI;
}

function normalizePrompt(prompt: string) {
  return prompt.trim();
}

function asMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "Unknown Supabase error";
}

function throwOnResultError(results: SupabaseResult[]) {
  const failed = results.find((result) => Boolean(result.error));
  if (failed) {
    throw new Error(asMessage(failed.error));
  }
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

export function buildColorChoices(params: {
  selectedColor?: string;
  takenColors?: string[];
  previousChoices?: string[];
  count?: number;
}) {
  const count = params.count ?? 3;
  const hasSelectedColor = typeof params.selectedColor === "string" && params.selectedColor.trim().length > 0;
  const selectedColor = hasSelectedColor ? normalizeColor(params.selectedColor) : null;
  const takenColors = new Set(
    (params.takenColors ?? []).map((color) => color.toLowerCase()),
  );

  const availablePool = PLAYER_COLOR_POOL.filter(
    (color) => !takenColors.has(color),
  ) as string[];
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

function getSortedPlayers(players: Player[]) {
  return [...players].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function getSortedPrompts(prompts: Prompt[]) {
  return [...prompts].sort((a, b) => a.prompt_order - b.prompt_order);
}

function clampSeconds(value: number) {
  return Math.min(MAX_TIMER_SECONDS, Math.max(MIN_TIMER_SECONDS, Math.round(value)));
}

function sanitizeSettings(settings?: Partial<RoomSettings>) {
  return {
    answeringSeconds: clampSeconds(
      settings?.answeringSeconds ?? DEFAULT_ROOM_SETTINGS.answeringSeconds,
    ),
    guessingSeconds: clampSeconds(
      settings?.guessingSeconds ?? DEFAULT_ROOM_SETTINGS.guessingSeconds,
    ),
    revealSeconds: clampSeconds(settings?.revealSeconds ?? DEFAULT_ROOM_SETTINGS.revealSeconds),
  };
}

function addSecondsToNow(seconds: number) {
  return new Date(Date.now() + Math.max(1, seconds) * 1000).toISOString();
}

function hasDeadlinePassed(deadline: string | null) {
  if (!deadline) {
    return false;
  }
  return Date.now() >= new Date(deadline).getTime();
}

function getExpectedGuessCount(playerCount: number) {
  return playerCount * Math.max(playerCount - 1, 0);
}

export function getDefaultRoomSettings() {
  return { ...DEFAULT_ROOM_SETTINGS };
}

export function getCurrentPrompt(room: Room, prompts: Prompt[]) {
  return getSortedPrompts(prompts)[room.current_prompt_index] ?? null;
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

async function ensureAllConfessions(
  roomId: string,
  promptId: string,
  players: Player[],
  confessions: Confession[],
) {
  const answeredPlayers = new Set(confessions.map((entry) => entry.player_id));
  const missingPlayers = players.filter((player) => !answeredPlayers.has(player.id));

  if (missingPlayers.length === 0) {
    return;
  }

  const fillResults = await Promise.all(
    missingPlayers.map((player) =>
      supabase.from("confessions").upsert(
        {
          room_id: roomId,
          prompt_id: promptId,
          player_id: player.id,
          answer: false,
        },
        { onConflict: "prompt_id,player_id" },
      ),
    ),
  );

  throwOnResultError(fillResults);
}

async function applyPromptScoresOnce(
  promptId: string,
  players: Player[],
  confessions: Confession[],
  guesses: Guess[],
) {
  const { data: updatedPromptRows, error: promptMarkError } = await supabase
    .from("prompts")
    .update({ score_applied: true })
    .eq("id", promptId)
    .eq("score_applied", false)
    .select("id");

  if (promptMarkError) {
    throw new Error(asMessage(promptMarkError));
  }

  if (!updatedPromptRows || updatedPromptRows.length === 0) {
    return;
  }

  const confessionByPlayer = new Map<string, boolean>(
    confessions.map((confession) => [confession.player_id, confession.answer]),
  );
  const scoreDelta = new Map<string, number>();

  players.forEach((player) => scoreDelta.set(player.id, 0));
  guesses.forEach((guess) => {
    const trueAnswer = confessionByPlayer.get(guess.target_player_id);
    if (typeof trueAnswer === "boolean" && trueAnswer === guess.guessed_answer) {
      scoreDelta.set(
        guess.guessing_player_id,
        (scoreDelta.get(guess.guessing_player_id) ?? 0) + 1,
      );
    }
  });

  const scoreResults = await Promise.all(
    players.map((player) =>
      supabase
        .from("players")
        .update({ score: player.score + (scoreDelta.get(player.id) ?? 0) })
        .eq("id", player.id),
    ),
  );

  throwOnResultError(scoreResults);
}

async function getHostPlayer(roomId: string) {
  const { data: host, error } = await supabase
    .from("players")
    .select("*")
    .eq("room_id", roomId)
    .eq("is_host", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(asMessage(error));
  }

  return (host as Player | null) ?? null;
}

export async function createRoom(hostName: string, options?: CreateRoomOptions) {
  const normalizedHostName = normalizeName(hostName);
  if (!normalizedHostName) {
    throw new Error("Name is required.");
  }

  const playerColor = normalizeColor(options?.playerColor);
  const playerEmoji = normalizeEmoji(options?.playerEmoji);
  const sanitizedSettings = sanitizeSettings(options?.settings);
  let room: Room | null = null;

  for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
    const code = generateRoomCode();
    const { data, error } = await supabase
      .from("rooms")
      .insert({
        code,
        phase: "lobby",
        current_prompt_index: 0,
        reveal_player_index: 0,
        reveal_truth_visible: false,
        phase_deadline_at: null,
        answering_seconds: sanitizedSettings.answeringSeconds,
        guessing_seconds: sanitizedSettings.guessingSeconds,
        reveal_seconds: sanitizedSettings.revealSeconds,
      })
      .select("*")
      .single();

    if (!error) {
      room = data as Room;
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
      is_host: true,
      score: 0,
    })
    .select("*")
    .single();

  if (playerError) {
    throw new Error(asMessage(playerError));
  }

  return { room, player: player as Player };
}

export async function joinRoom(code: string, name: string, color?: string, emoji?: string) {
  const normalizedCode = normalizeCode(code);
  const normalizedName = normalizeName(name);
  const normalizedColor = normalizeColor(color);
  const normalizedEmoji = normalizeEmoji(emoji);

  if (!normalizedCode || !normalizedName) {
    throw new Error("Room code and name are required.");
  }

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

  const { data: existingPlayers, error: playersError } = await supabase
    .from("players")
    .select("*")
    .eq("room_id", room.id);

  if (playersError) {
    throw new Error(asMessage(playersError));
  }

  const typedPlayers = (existingPlayers ?? []) as Player[];
  if (typedPlayers.length >= MAX_PLAYERS) {
    throw new Error("Room is full.");
  }

  if (
    typedPlayers.some(
      (player) => player.name.toLowerCase() === normalizedName.toLowerCase(),
    )
  ) {
    throw new Error("That name is already taken in this room.");
  }

  if (
    typedPlayers.some(
      (player) => (player.color ?? "").toLowerCase() === normalizedColor,
    )
  ) {
    throw new Error("That color was just taken. Choose another.");
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .insert({
      room_id: room.id,
      name: normalizedName,
      color: normalizedColor,
      emoji: normalizedEmoji,
      is_host: false,
      score: 0,
    })
    .select("*")
    .single();

  if (playerError) {
    throw new Error(asMessage(playerError));
  }

  return { room: room as Room, player: player as Player };
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

  const [playerResult, roomPlayersResult] = await Promise.all([
    supabase
      .from("players")
      .select("*")
      .eq("id", playerId)
      .eq("room_id", roomId)
      .maybeSingle(),
    supabase.from("players").select("*").eq("room_id", roomId),
  ]);

  if (playerResult.error) {
    throw new Error(asMessage(playerResult.error));
  }
  if (!playerResult.data) {
    throw new Error("Player not found.");
  }
  if (roomPlayersResult.error) {
    throw new Error(asMessage(roomPlayersResult.error));
  }

  const takenName = ((roomPlayersResult.data ?? []) as Player[]).some(
    (player) =>
      player.id !== playerId &&
      player.name.toLowerCase() === normalizedName.toLowerCase(),
  );

  if (takenName) {
    throw new Error("That name is already taken in this room.");
  }

  const takenColor = ((roomPlayersResult.data ?? []) as Player[]).some(
    (player) =>
      player.id !== playerId &&
      (player.color ?? "").toLowerCase() === normalizedColor,
  );

  if (takenColor) {
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

export async function updateRoomSettings(
  roomId: string,
  playerId: string,
  nextSettings: Partial<RoomSettings>,
) {
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("*")
    .eq("id", playerId)
    .eq("room_id", roomId)
    .maybeSingle();

  if (playerError) {
    throw new Error(asMessage(playerError));
  }

  if (!player || !(player as Player).is_host) {
    throw new Error("Only the room creator can edit settings.");
  }

  const settings = sanitizeSettings(nextSettings);
  const { error } = await supabase
    .from("rooms")
    .update({
      answering_seconds: settings.answeringSeconds,
      guessing_seconds: settings.guessingSeconds,
      reveal_seconds: settings.revealSeconds,
    })
    .eq("id", roomId);

  if (error) {
    throw new Error(asMessage(error));
  }
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

  const { data, error } = await supabase
    .from("prompts")
    .upsert(
      {
        room_id: roomId,
        submitted_by_player_id: playerId,
        text: normalizedText,
      },
      { onConflict: "room_id,submitted_by_player_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(asMessage(error));
  }

  return data as Prompt;
}

export async function startGame(roomId: string) {
  const [roomResult, playersResult, promptsResult] = await Promise.all([
    supabase.from("rooms").select("*").eq("id", roomId).single(),
    supabase
      .from("players")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true }),
    supabase.from("prompts").select("*").eq("room_id", roomId),
  ]);

  if (roomResult.error) throw new Error(asMessage(roomResult.error));
  if (playersResult.error) throw new Error(asMessage(playersResult.error));
  if (promptsResult.error) throw new Error(asMessage(promptsResult.error));

  const room = roomResult.data as Room;
  const players = (playersResult.data ?? []) as Player[];
  const prompts = (promptsResult.data ?? []) as Prompt[];

  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`Game requires ${MIN_PLAYERS}-${MAX_PLAYERS} players.`);
  }
  if (prompts.length !== players.length) {
    throw new Error("Everyone needs to submit one question first.");
  }

  if (!(await getHostPlayer(roomId))) {
    throw new Error("Room host is missing.");
  }

  const orderedPrompts = randomizeOrder(prompts);
  const resetResults = await Promise.all([
    ...orderedPrompts.map((prompt, index) =>
      supabase
        .from("prompts")
        .update({ prompt_order: index, score_applied: false })
        .eq("id", prompt.id),
    ),
    ...players.map((player) =>
      supabase.from("players").update({ score: 0 }).eq("id", player.id),
    ),
    supabase.from("confessions").delete().eq("room_id", roomId),
    supabase.from("guesses").delete().eq("room_id", roomId),
    supabase
      .from("rooms")
      .update({
        phase: "answering",
        current_prompt_index: 0,
        reveal_player_index: 0,
        reveal_truth_visible: false,
        phase_deadline_at: addSecondsToNow(room.answering_seconds),
      })
      .eq("id", roomId)
      .eq("phase", "lobby"),
  ]);

  throwOnResultError(resetResults);
}

export async function submitConfession(
  roomId: string,
  promptId: string,
  playerId: string,
  answer: boolean,
) {
  const { error } = await supabase.from("confessions").upsert(
    {
      room_id: roomId,
      prompt_id: promptId,
      player_id: playerId,
      answer,
    },
    { onConflict: "prompt_id,player_id" },
  );

  if (error) {
    throw new Error(asMessage(error));
  }
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

export async function maybeAdvanceRoom(roomId: string) {
  const snapshot = await getGameSnapshotByRoomId(roomId);
  const { room } = snapshot;
  const players = getSortedPlayers(snapshot.players);
  const currentPrompt = getCurrentPrompt(room, snapshot.prompts);

  if (!currentPrompt) {
    return;
  }

  const roundConfessions = snapshot.confessions.filter(
    (confession) => confession.prompt_id === currentPrompt.id,
  );
  const roundGuesses = snapshot.guesses.filter((guess) => guess.prompt_id === currentPrompt.id);

  if (room.phase === "answering") {
    const allConfessed = roundConfessions.length >= players.length;
    const timeoutReached = hasDeadlinePassed(room.phase_deadline_at);
    if (!allConfessed && !timeoutReached) {
      return;
    }

    await ensureAllConfessions(roomId, currentPrompt.id, players, roundConfessions);
    const { error } = await supabase
      .from("rooms")
      .update({
        phase: "guessing",
        phase_deadline_at: addSecondsToNow(room.guessing_seconds),
      })
      .eq("id", roomId)
      .eq("phase", "answering")
      .eq("current_prompt_index", room.current_prompt_index);

    if (error) {
      throw new Error(asMessage(error));
    }
    return;
  }

  if (room.phase === "guessing") {
    const expectedGuesses = getExpectedGuessCount(players.length);
    const allGuessed = roundGuesses.length >= expectedGuesses;
    const timeoutReached = hasDeadlinePassed(room.phase_deadline_at);
    if (!allGuessed && !timeoutReached) {
      return;
    }

    const freshSnapshot = await getGameSnapshotByRoomId(roomId);
    const freshPrompt = getCurrentPrompt(freshSnapshot.room, freshSnapshot.prompts);
    if (!freshPrompt) {
      return;
    }
    const freshConfessions = freshSnapshot.confessions.filter(
      (entry) => entry.prompt_id === freshPrompt.id,
    );
    const freshGuesses = freshSnapshot.guesses.filter(
      (entry) => entry.prompt_id === freshPrompt.id,
    );

    await applyPromptScoresOnce(
      freshPrompt.id,
      freshSnapshot.players,
      freshConfessions,
      freshGuesses,
    );

    const { error } = await supabase
      .from("rooms")
      .update({
        phase: "revealing",
        reveal_player_index: 0,
        reveal_truth_visible: false,
        phase_deadline_at: addSecondsToNow(freshSnapshot.room.reveal_seconds),
      })
      .eq("id", roomId)
      .eq("phase", "guessing")
      .eq("current_prompt_index", freshSnapshot.room.current_prompt_index);

    if (error) {
      throw new Error(asMessage(error));
    }
    return;
  }

  if (room.phase === "revealing") {
    const currentRevealPlayer = players[room.reveal_player_index];
    if (!currentRevealPlayer) {
      const { error } = await supabase
        .from("rooms")
        .update({
          phase: "leaderboard",
          phase_deadline_at: null,
          reveal_truth_visible: false,
        })
        .eq("id", roomId)
        .eq("phase", "revealing");

      if (error) {
        throw new Error(asMessage(error));
      }
      return;
    }

    if (!hasDeadlinePassed(room.phase_deadline_at)) {
      return;
    }

    if (!room.reveal_truth_visible) {
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
      return;
    }

    const nextIndex = room.reveal_player_index + 1;
    if (nextIndex >= players.length) {
      const { error } = await supabase
        .from("rooms")
        .update({
          phase: "leaderboard",
          phase_deadline_at: null,
          reveal_truth_visible: false,
        })
        .eq("id", roomId)
        .eq("phase", "revealing");

      if (error) {
        throw new Error(asMessage(error));
      }
      return;
    }

    const { error } = await supabase
      .from("rooms")
      .update({
        reveal_player_index: nextIndex,
        reveal_truth_visible: false,
        phase_deadline_at: addSecondsToNow(room.reveal_seconds),
      })
      .eq("id", roomId)
      .eq("phase", "revealing")
      .eq("reveal_player_index", room.reveal_player_index);

    if (error) {
      throw new Error(asMessage(error));
    }
  }
}

export async function revealCurrentPlayer(roomId: string, playerId: string) {
  const snapshot = await getGameSnapshotByRoomId(roomId);
  const players = getSortedPlayers(snapshot.players);
  const room = snapshot.room;

  if (room.phase !== "revealing") {
    throw new Error("Reveal step is not active.");
  }
  if (room.reveal_truth_visible) {
    throw new Error("Already revealed.");
  }

  const currentRevealPlayer = players[room.reveal_player_index];
  if (!currentRevealPlayer || currentRevealPlayer.id !== playerId) {
    throw new Error("Only the current reveal player can do that.");
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
  const snapshot = await getGameSnapshotByRoomId(roomId);
  const players = getSortedPlayers(snapshot.players);
  const room = snapshot.room;

  if (room.phase !== "revealing") {
    throw new Error("Reveal step is not active.");
  }
  if (!room.reveal_truth_visible) {
    throw new Error("Reveal first.");
  }

  const currentRevealPlayer = players[room.reveal_player_index];
  if (!currentRevealPlayer || currentRevealPlayer.id !== playerId) {
    throw new Error("Only the current reveal player can do that.");
  }

  const nextIndex = room.reveal_player_index + 1;
  if (nextIndex >= players.length) {
    const { error } = await supabase
      .from("rooms")
      .update({
        phase: "leaderboard",
        phase_deadline_at: null,
        reveal_truth_visible: false,
      })
      .eq("id", roomId)
      .eq("phase", "revealing");

    if (error) {
      throw new Error(asMessage(error));
    }
    return;
  }

  const { error } = await supabase
    .from("rooms")
    .update({
      reveal_player_index: nextIndex,
      reveal_truth_visible: false,
      phase_deadline_at: addSecondsToNow(room.reveal_seconds),
    })
    .eq("id", roomId)
    .eq("phase", "revealing")
    .eq("reveal_player_index", room.reveal_player_index);

  if (error) {
    throw new Error(asMessage(error));
  }
}

export async function startNextRound(roomId: string) {
  const [roomResult, promptsResult] = await Promise.all([
    supabase.from("rooms").select("*").eq("id", roomId).single(),
    supabase.from("prompts").select("*").eq("room_id", roomId),
  ]);

  if (roomResult.error) throw new Error(asMessage(roomResult.error));
  if (promptsResult.error) throw new Error(asMessage(promptsResult.error));

  const room = roomResult.data as Room;
  const prompts = (promptsResult.data ?? []) as Prompt[];
  const hasNextRound = room.current_prompt_index + 1 < prompts.length;

  if (!hasNextRound) {
    const { error } = await supabase
      .from("rooms")
      .update({
        phase: "finished",
        phase_deadline_at: null,
        reveal_truth_visible: false,
      })
      .eq("id", roomId);

    if (error) {
      throw new Error(asMessage(error));
    }
    return;
  }

  const { error } = await supabase
    .from("rooms")
    .update({
      phase: "answering",
      current_prompt_index: room.current_prompt_index + 1,
      reveal_player_index: 0,
      reveal_truth_visible: false,
      phase_deadline_at: addSecondsToNow(room.answering_seconds),
    })
    .eq("id", roomId)
    .eq("phase", "leaderboard");

  if (error) {
    throw new Error(asMessage(error));
  }
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

  return {
    players,
    currentPrompt,
    confessions,
    guesses,
    confessionCount: confessions.length,
    expectedConfessions: players.length,
    guessCount: guesses.length,
    expectedGuesses: getExpectedGuessCount(players.length),
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
