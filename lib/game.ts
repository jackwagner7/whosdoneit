import type { RealtimeChannel } from "@supabase/supabase-js";
import { PLAYER_EMOJI_POOL } from "@/lib/player-emoji-pool";
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
const MIN_PLAYERS = 2;
const MIN_TIMER_SECONDS = 5;
const MAX_TIMER_SECONDS = 180;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 10;
const ROUND_PROMPT_FACTOR = 1000;

const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  promptSeconds: 20,
  roundCount: 1,
  answeringSeconds: 25,
  guessingSeconds: 35,
  revealSeconds: 8,
  fastMode: false,
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

export { PLAYER_EMOJI_POOL };

export const DEFAULT_PLAYER_COLOR = PLAYER_COLOR_POOL[0];
export const DEFAULT_PLAYER_EMOJI = PLAYER_EMOJI_POOL[0];

const PLAYER_COLOR_SET: Set<string> = new Set<string>(
  PLAYER_COLOR_POOL.map((color) => color.toLowerCase()),
);
const PLAYER_EMOJI_SET: Set<string> = new Set<string>(PLAYER_EMOJI_POOL);
const TEST_BOT_NAME_PREFIX = "Test Bot";
const MAX_TEST_BOT_ADD_COUNT = 20;
const TEST_PROMPT_POOL = [
  "eaten breakfast for dinner",
  "sent a text to the wrong person",
  "watched a full season in one day",
  "laughed at the wrong moment",
  "forgotten why you entered a room",
  "tried a strange food and liked it",
] as const;

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

function isTestBotPlayer(player: Player) {
  return player.name.startsWith(`${TEST_BOT_NAME_PREFIX} `);
}

function parseTestBotNumber(name: string) {
  const match = name.match(/^Test Bot (\d+)$/);
  return match ? Number(match[1]) : null;
}

function buildTestPrompt(seed: number) {
  const poolIndex = Math.abs(seed) % TEST_PROMPT_POOL.length;
  return `Test prompt: Have you ever ${TEST_PROMPT_POOL[poolIndex]}?`;
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

export function refreshColorChoices(params: {
  takenColors?: string[];
  previousChoices?: string[];
  count?: number;
  maxAttempts?: number;
}) {
  const count = params.count ?? 3;
  const takenColors = new Set(
    (params.takenColors ?? []).map((color) => color.toLowerCase()),
  );
  const availablePool = PLAYER_COLOR_POOL.filter(
    (color) => !takenColors.has(color),
  ) as string[];
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
        takenColors: params.takenColors,
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

function addMillisecondsToNow(milliseconds: number) {
  return new Date(Date.now() + Math.max(1, Math.round(milliseconds))).toISOString();
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

const REVEAL_MAJORITY_THRESHOLD = 0.79;
const REVEAL_WAIT_MS = {
  quick: 240,
  normal: 560,
  dramatic: 1300,
} as const;
const PRETRUTH_REVEAL_SYNC_BUFFER_MS = 700;

type RevealWaitKey = keyof typeof REVEAL_WAIT_MS;
const PRE_GUESS_WAIT_KEY: RevealWaitKey = "dramatic";
type RevealGroupKey = "innocent" | "guilty";
type RevealTimingPlan = {
  groupOrder: RevealGroupKey[];
  primaryDropWait: RevealWaitKey;
  secondaryDropWait: RevealWaitKey;
  betweenGroupWait: RevealWaitKey;
  revealWait: RevealWaitKey;
};

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

function getRevealTimingPlanForBucket(bucket: number): RevealTimingPlan {
  const defaults: RevealTimingPlan = {
    groupOrder: ["innocent", "guilty"],
    primaryDropWait: "normal",
    secondaryDropWait: "normal",
    betweenGroupWait: "normal",
    revealWait: "dramatic",
  };

  switch (bucket) {
    case 1:
      return {
        ...defaults,
        groupOrder: ["innocent", "guilty"],
        primaryDropWait: "quick",
        secondaryDropWait: "quick",
        betweenGroupWait: "quick",
        revealWait: "normal",
      };
    case 2:
      return {
        ...defaults,
        groupOrder: ["innocent", "guilty"],
        primaryDropWait: "quick",
        secondaryDropWait: "quick",
        betweenGroupWait: "quick",
        revealWait: "dramatic",
      };
    case 3:
      return {
        ...defaults,
        groupOrder: ["innocent", "guilty"],
        primaryDropWait: "quick",
        secondaryDropWait: "quick",
        betweenGroupWait: "dramatic",
        revealWait: "normal",
      };
    case 4:
      return {
        ...defaults,
        groupOrder: ["innocent", "guilty"],
        primaryDropWait: "quick",
        secondaryDropWait: "normal",
        betweenGroupWait: "dramatic",
        revealWait: "dramatic",
      };
    case 5:
      return {
        ...defaults,
        groupOrder: ["guilty", "innocent"],
        primaryDropWait: "quick",
        secondaryDropWait: "quick",
        betweenGroupWait: "quick",
        revealWait: "normal",
      };
    case 6:
      return {
        ...defaults,
        groupOrder: ["guilty", "innocent"],
        primaryDropWait: "quick",
        secondaryDropWait: "quick",
        betweenGroupWait: "quick",
        revealWait: "dramatic",
      };
    case 7:
      return {
        ...defaults,
        groupOrder: ["guilty", "innocent"],
        primaryDropWait: "quick",
        secondaryDropWait: "quick",
        betweenGroupWait: "dramatic",
        revealWait: "normal",
      };
    case 8:
      return {
        ...defaults,
        groupOrder: ["guilty", "innocent"],
        primaryDropWait: "quick",
        secondaryDropWait: "normal",
        betweenGroupWait: "dramatic",
        revealWait: "dramatic",
      };
    default:
      return defaults;
  }
}

function getPretruthRevealWaitMilliseconds(params: {
  guessedInnocentCount: number;
  guessedGuiltyCount: number;
  truth: boolean;
}) {
  const bucket = getRevealInterestBucket(params);
  const plan = getRevealTimingPlanForBucket(bucket);
  const innocentCount = params.guessedInnocentCount;
  const guiltyCount = params.guessedGuiltyCount;
  const primaryCount = plan.groupOrder[0] === "innocent" ? innocentCount : guiltyCount;
  const secondaryCount = plan.groupOrder[1] === "innocent" ? innocentCount : guiltyCount;

  let totalMs = REVEAL_WAIT_MS[PRE_GUESS_WAIT_KEY] + REVEAL_WAIT_MS[plan.revealWait];
  if (primaryCount > 1) {
    totalMs += (primaryCount - 1) * REVEAL_WAIT_MS[plan.primaryDropWait];
  }
  if (secondaryCount > 1) {
    totalMs += (secondaryCount - 1) * REVEAL_WAIT_MS[plan.secondaryDropWait];
  }
  if (primaryCount > 0 && secondaryCount > 0) {
    totalMs += REVEAL_WAIT_MS[plan.betweenGroupWait];
  }

  return totalMs + PRETRUTH_REVEAL_SYNC_BUFFER_MS;
}

function getPretruthRevealDeadline(params: {
  revealPlayers: Player[];
  confessions: Confession[];
  guesses: Guess[];
  revealPlayerIndex: number;
}) {
  const target = params.revealPlayers[params.revealPlayerIndex];
  if (!target) {
    return null;
  }

  const revealPlayerIds = new Set(params.revealPlayers.map((player) => player.id));
  const targetGuesses = params.guesses.filter(
    (entry) =>
      entry.target_player_id === target.id &&
      revealPlayerIds.has(entry.guessing_player_id),
  );
  const guessedInnocentCount = targetGuesses.filter(
    (entry) => entry.guessed_answer === false,
  ).length;
  const guessedGuiltyCount = targetGuesses.length - guessedInnocentCount;
  const truth =
    params.confessions.find((entry) => entry.player_id === target.id)?.answer === true;

  return addMillisecondsToNow(
    getPretruthRevealWaitMilliseconds({
      guessedInnocentCount,
      guessedGuiltyCount,
      truth,
    }),
  );
}

function decodeRoundPromptIndex(value: number) {
  const normalized = Math.max(0, Math.floor(value));
  return {
    roundIndex: Math.floor(normalized / ROUND_PROMPT_FACTOR),
    promptIndex: normalized % ROUND_PROMPT_FACTOR,
  };
}

function encodeRoundPromptIndex(roundIndex: number, promptIndex: number) {
  const safeRoundIndex = Math.max(0, Math.floor(roundIndex));
  const safePromptIndex = Math.max(0, Math.floor(promptIndex));
  return safeRoundIndex * ROUND_PROMPT_FACTOR + safePromptIndex;
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

async function submitTestBotPrompts(roomId: string, players: Player[], prompts: Prompt[]) {
  const testBots = players.filter(isTestBotPlayer);
  if (testBots.length === 0) {
    return;
  }

  const submittedBy = new Set(prompts.map((prompt) => prompt.submitted_by_player_id));
  const missingBots = testBots.filter((bot) => !submittedBy.has(bot.id));
  if (missingBots.length === 0) {
    return;
  }

  const results = await Promise.all(
    missingBots.map((bot, index) =>
      supabase.from("prompts").upsert(
        {
          room_id: roomId,
          submitted_by_player_id: bot.id,
          text: buildTestPrompt(index + bot.name.length),
        },
        { onConflict: "room_id,submitted_by_player_id" },
      ),
    ),
  );

  throwOnResultError(results);
}

async function submitTestBotConfessions(
  roomId: string,
  promptId: string,
  players: Player[],
  confessions: Confession[],
) {
  const testBots = players.filter(isTestBotPlayer);
  if (testBots.length === 0) {
    return;
  }

  const submittedBy = new Set(confessions.map((entry) => entry.player_id));
  const missingBots = testBots.filter((bot) => !submittedBy.has(bot.id));
  if (missingBots.length === 0) {
    return;
  }

  const results = await Promise.all(
    missingBots.map((bot) =>
      supabase.from("confessions").upsert(
        {
          room_id: roomId,
          prompt_id: promptId,
          player_id: bot.id,
          answer: Math.random() >= 0.5,
        },
        { onConflict: "prompt_id,player_id" },
      ),
    ),
  );

  throwOnResultError(results);
}

async function submitTestBotGuesses(
  roomId: string,
  promptId: string,
  players: Player[],
  guesses: Guess[],
) {
  const testBots = players.filter(isTestBotPlayer);
  if (testBots.length === 0) {
    return;
  }

  const guessedPairs = new Set(
    guesses.map((guess) => `${guess.guessing_player_id}:${guess.target_player_id}`),
  );
  const missingGuessEntries: Array<{
    room_id: string;
    prompt_id: string;
    guessing_player_id: string;
    target_player_id: string;
    guessed_answer: boolean;
  }> = [];

  testBots.forEach((bot) => {
    players.forEach((target) => {
      if (target.id === bot.id) {
        return;
      }
      const key = `${bot.id}:${target.id}`;
      if (guessedPairs.has(key)) {
        return;
      }
      missingGuessEntries.push({
        room_id: roomId,
        prompt_id: promptId,
        guessing_player_id: bot.id,
        target_player_id: target.id,
        guessed_answer: Math.random() >= 0.5,
      });
    });
  });

  if (missingGuessEntries.length === 0) {
    return;
  }

  const results = await Promise.all(
    missingGuessEntries.map((entry) =>
      supabase.from("guesses").upsert(entry, {
        onConflict: "prompt_id,guessing_player_id,target_player_id",
      }),
    ),
  );

  throwOnResultError(results);
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
        prompt_seconds: sanitizedSettings.promptSeconds,
        round_count: sanitizedSettings.roundCount,
        answering_seconds: sanitizedSettings.answeringSeconds,
        guessing_seconds: sanitizedSettings.guessingSeconds,
        reveal_seconds: sanitizedSettings.revealSeconds,
        fast_mode: sanitizedSettings.fastMode,
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
  const [playerResult, roomResult] = await Promise.all([
    supabase
      .from("players")
      .select("*")
      .eq("id", playerId)
      .eq("room_id", roomId)
      .maybeSingle(),
    supabase.from("rooms").select("*").eq("id", roomId).maybeSingle(),
  ]);

  if (playerResult.error) {
    throw new Error(asMessage(playerResult.error));
  }
  if (roomResult.error) {
    throw new Error(asMessage(roomResult.error));
  }

  if (!playerResult.data || !(playerResult.data as Player).is_host) {
    throw new Error("Only the room creator can edit settings.");
  }
  if (!roomResult.data) {
    throw new Error("Room not found.");
  }

  const room = roomResult.data as Room;
  const settings = sanitizeSettings(nextSettings, {
    promptSeconds: room.prompt_seconds,
    roundCount: room.round_count,
    answeringSeconds: room.answering_seconds,
    guessingSeconds: room.guessing_seconds,
    revealSeconds: room.reveal_seconds,
    fastMode: room.fast_mode,
  });

  if (room.phase !== "lobby") {
    settings.promptSeconds = room.prompt_seconds;
    settings.roundCount = room.round_count;
  }

  const { error } = await supabase
    .from("rooms")
    .update({
      prompt_seconds: settings.promptSeconds,
      round_count: settings.roundCount,
      answering_seconds: settings.answeringSeconds,
      guessing_seconds: settings.guessingSeconds,
      reveal_seconds: settings.revealSeconds,
      fast_mode: settings.fastMode,
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

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();

  if (roomError) {
    throw new Error(asMessage(roomError));
  }
  if (!room) {
    throw new Error("Room not found.");
  }
  if ((room as Room).phase !== "prompting") {
    throw new Error("Prompt stage is not active.");
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

export async function startGame(roomId: string, playerId: string) {
  const [roomResult, playersResult] = await Promise.all([
    supabase.from("rooms").select("*").eq("id", roomId).single(),
    supabase
      .from("players")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true }),
  ]);

  if (roomResult.error) throw new Error(asMessage(roomResult.error));
  if (playersResult.error) throw new Error(asMessage(playersResult.error));

  const room = roomResult.data as Room;
  const players = (playersResult.data ?? []) as Player[];

  if (room.phase !== "lobby") {
    throw new Error("Game can only be started from lobby.");
  }

  if (players.length < MIN_PLAYERS) {
    throw new Error(`Game requires at least ${MIN_PLAYERS} players.`);
  }

  const host = await getHostPlayer(roomId);
  if (!host) {
    throw new Error("Room host is missing.");
  }
  if (host.id !== playerId) {
    throw new Error("Only the room creator can start the game.");
  }

  const resetResults = await Promise.all([
    ...players.map((player) =>
      supabase.from("players").update({ score: 0 }).eq("id", player.id),
    ),
    supabase.from("prompts").delete().eq("room_id", roomId),
    supabase.from("confessions").delete().eq("room_id", roomId),
    supabase.from("guesses").delete().eq("room_id", roomId),
    supabase
      .from("rooms")
      .update({
        phase: "prompting",
        current_prompt_index: 0,
        reveal_player_index: 0,
        reveal_truth_visible: false,
        phase_deadline_at: addSecondsToNow(room.prompt_seconds),
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

  const { error } = await supabase.from("guesses").upsert(payload, {
    onConflict: "prompt_id,guessing_player_id,target_player_id",
  });

  if (error) {
    throw new Error(asMessage(error));
  }
}

export async function maybeAdvanceRoom(roomId: string) {
  const snapshot = await getGameSnapshotByRoomId(roomId);
  const { room } = snapshot;
  const players = getSortedPlayers(snapshot.players);
  const hasTestBots = players.some(isTestBotPlayer);

  if (room.phase === "prompting") {
    let phaseSnapshot = snapshot;
    let phaseRoom = room;
    let phasePlayers = players;

    if (hasTestBots) {
      await submitTestBotPrompts(roomId, players, snapshot.prompts);
      phaseSnapshot = await getGameSnapshotByRoomId(roomId);
      phaseRoom = phaseSnapshot.room;
      phasePlayers = getSortedPlayers(phaseSnapshot.players);
      if (phaseRoom.phase !== "prompting") {
        return;
      }
    }

    const allSubmitted = phaseSnapshot.prompts.length >= phasePlayers.length;
    const timeoutReached = hasDeadlinePassed(phaseRoom.phase_deadline_at);
    if (!allSubmitted && !timeoutReached) {
      return;
    }

    let promptPool = phaseSnapshot.prompts;
    if (promptPool.length === 0) {
      const host = await getHostPlayer(roomId);
      if (!host) {
        throw new Error("Room host is missing.");
      }

      await submitPrompt(roomId, host.id, "Have you ever done it?");
      const refreshed = await getGameSnapshotByRoomId(roomId);
      promptPool = refreshed.prompts;
      phaseRoom = refreshed.room;
    }

    const selectedPrompts = randomizeOrder(promptPool);
    const { roundIndex } = decodeRoundPromptIndex(phaseRoom.current_prompt_index);

    const promptResults: SupabaseResult[] = await Promise.all(
      selectedPrompts.map((prompt, index) =>
        supabase
          .from("prompts")
          .update({ prompt_order: index, score_applied: false })
          .eq("id", prompt.id),
      ),
    );

    const [confessionResetResult, guessResetResult, roomUpdateResult] = await Promise.all([
      supabase.from("confessions").delete().eq("room_id", roomId),
      supabase.from("guesses").delete().eq("room_id", roomId),
      supabase
        .from("rooms")
        .update({
          phase: "answering",
          current_prompt_index: encodeRoundPromptIndex(roundIndex, 0),
          reveal_player_index: 0,
          reveal_truth_visible: false,
          phase_deadline_at: addSecondsToNow(phaseRoom.answering_seconds),
        })
        .eq("id", roomId)
        .eq("phase", "prompting"),
    ]);

    throwOnResultError([
      ...promptResults,
      confessionResetResult,
      guessResetResult,
      roomUpdateResult,
    ]);
    return;
  }

  const currentPrompt = getCurrentPrompt(room, snapshot.prompts);
  if (!currentPrompt) {
    return;
  }

  const roundConfessions = snapshot.confessions.filter(
    (confession) => confession.prompt_id === currentPrompt.id,
  );
  const roundGuesses = snapshot.guesses.filter((guess) => guess.prompt_id === currentPrompt.id);

  if (room.phase === "answering") {
    let phaseSnapshot = snapshot;
    let phaseRoom = room;
    let phasePlayers = players;
    let phasePrompt = currentPrompt;
    let phaseConfessions = roundConfessions;

    if (hasTestBots) {
      await submitTestBotConfessions(roomId, currentPrompt.id, players, roundConfessions);
      phaseSnapshot = await getGameSnapshotByRoomId(roomId);
      phaseRoom = phaseSnapshot.room;
      if (phaseRoom.phase !== "answering") {
        return;
      }
      phasePlayers = getSortedPlayers(phaseSnapshot.players);
      phasePrompt = getCurrentPrompt(phaseRoom, phaseSnapshot.prompts);
      if (!phasePrompt) {
        return;
      }
      phaseConfessions = phaseSnapshot.confessions.filter(
        (confession) => confession.prompt_id === phasePrompt.id,
      );
    }

    const allConfessed = phaseConfessions.length >= phasePlayers.length;
    const timeoutReached = hasDeadlinePassed(phaseRoom.phase_deadline_at);
    if (!allConfessed && !timeoutReached) {
      return;
    }

    await ensureAllConfessions(roomId, phasePrompt.id, phasePlayers, phaseConfessions);
    const { error } = await supabase
      .from("rooms")
      .update({
        phase: "guessing",
        phase_deadline_at: addSecondsToNow(phaseRoom.guessing_seconds),
      })
      .eq("id", roomId)
      .eq("phase", "answering")
      .eq("current_prompt_index", phaseRoom.current_prompt_index);

    if (error) {
      throw new Error(asMessage(error));
    }
    return;
  }

  if (room.phase === "guessing") {
    let phaseSnapshot = snapshot;
    let phaseRoom = room;
    let phasePlayers = players;
    let phasePrompt = currentPrompt;
    let phaseGuesses = roundGuesses;
    let phaseConfessions = roundConfessions;
    let phaseParticipants = getConfessionParticipants(phasePlayers, phaseConfessions);

    if (hasTestBots) {
      await submitTestBotGuesses(
        roomId,
        currentPrompt.id,
        phaseParticipants,
        roundGuesses,
      );
      phaseSnapshot = await getGameSnapshotByRoomId(roomId);
      phaseRoom = phaseSnapshot.room;
      if (phaseRoom.phase !== "guessing") {
        return;
      }
      phasePlayers = getSortedPlayers(phaseSnapshot.players);
      phasePrompt = getCurrentPrompt(phaseRoom, phaseSnapshot.prompts);
      if (!phasePrompt) {
        return;
      }
      phaseConfessions = phaseSnapshot.confessions.filter(
        (entry) => entry.prompt_id === phasePrompt.id,
      );
      phaseGuesses = phaseSnapshot.guesses.filter(
        (entry) => entry.prompt_id === phasePrompt.id,
      );
      phaseParticipants = getConfessionParticipants(phasePlayers, phaseConfessions);
    }

    const phaseParticipantIds = new Set(phaseParticipants.map((player) => player.id));
    const phaseParticipantConfessions = phaseConfessions.filter((entry) =>
      phaseParticipantIds.has(entry.player_id),
    );
    const phaseParticipantGuesses = phaseGuesses.filter(
      (entry) =>
        phaseParticipantIds.has(entry.guessing_player_id) &&
        phaseParticipantIds.has(entry.target_player_id),
    );

    const expectedGuesses = getExpectedGuessCount(phaseParticipants.length);
    const allGuessed = phaseParticipantGuesses.length >= expectedGuesses;
    const timeoutReached = hasDeadlinePassed(phaseRoom.phase_deadline_at);
    if (!allGuessed && !timeoutReached) {
      return;
    }

    await applyPromptScoresOnce(
      phasePrompt.id,
      phaseParticipants,
      phaseParticipantConfessions,
      phaseParticipantGuesses,
    );
    const revealPlayers = getRevealPlayersForPrompt(
      phaseParticipants,
      phaseParticipantConfessions,
      phaseParticipantGuesses,
    );
    const fastModeEnabled = phaseRoom.fast_mode === true;
    const nextRevealIndex = fastModeEnabled ? revealPlayers.length : 0;
    const nextRevealTruthVisible = fastModeEnabled;
    const nextPhaseDeadlineAt = fastModeEnabled
      ? addSecondsToNow(phaseRoom.reveal_seconds)
      : getPretruthRevealDeadline({
          revealPlayers,
          confessions: phaseParticipantConfessions,
          guesses: phaseParticipantGuesses,
          revealPlayerIndex: 0,
        });

    const { error } = await supabase
      .from("rooms")
      .update({
        phase: "revealing",
        reveal_player_index: nextRevealIndex,
        reveal_truth_visible: nextRevealTruthVisible,
        phase_deadline_at: nextPhaseDeadlineAt,
      })
      .eq("id", roomId)
      .eq("phase", "guessing")
      .eq("current_prompt_index", phaseRoom.current_prompt_index);

    if (error) {
      throw new Error(asMessage(error));
    }
    return;
  }

  if (room.phase === "revealing") {
    const revealPlayers = getRevealPlayersForPrompt(
      players,
      roundConfessions,
      roundGuesses,
    );
    const currentRevealPlayer = revealPlayers[room.reveal_player_index];
    if (!currentRevealPlayer) {
      if (room.phase_deadline_at && !hasDeadlinePassed(room.phase_deadline_at)) {
        return;
      }

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

    if (!room.reveal_truth_visible) {
      if (!room.phase_deadline_at) {
        const { error } = await supabase
          .from("rooms")
          .update({
            phase_deadline_at: getPretruthRevealDeadline({
              revealPlayers,
              confessions: roundConfessions,
              guesses: roundGuesses,
              revealPlayerIndex: room.reveal_player_index,
            }),
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

      if (!hasDeadlinePassed(room.phase_deadline_at)) {
        return;
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
      return;
    }

    if (!room.phase_deadline_at || !hasDeadlinePassed(room.phase_deadline_at)) {
      return;
    }

    const nextIndex = room.reveal_player_index + 1;
    if (nextIndex >= revealPlayers.length) {
      const { error } = await supabase
        .from("rooms")
        .update({
          reveal_player_index: revealPlayers.length,
          reveal_truth_visible: true,
          phase_deadline_at: addSecondsToNow(room.reveal_seconds),
        })
        .eq("id", roomId)
        .eq("phase", "revealing")
        .eq("reveal_player_index", room.reveal_player_index);

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
        phase_deadline_at: getPretruthRevealDeadline({
          revealPlayers,
          confessions: roundConfessions,
          guesses: roundGuesses,
          revealPlayerIndex: nextIndex,
        }),
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
  if (!currentRevealPlayer) {
    if (!actingPlayer?.is_host) {
      throw new Error("Only the room creator can do that.");
    }

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

  if (!room.reveal_truth_visible) {
    throw new Error("Reveal first.");
  }

  if (
    !currentRevealPlayer ||
    (currentRevealPlayer.id !== playerId && !actingPlayer?.is_host)
  ) {
    throw new Error("Only the current reveal player or host can do that.");
  }

  const nextIndex = room.reveal_player_index + 1;
  if (nextIndex >= revealPlayers.length) {
    const { error } = await supabase
      .from("rooms")
      .update({
        reveal_player_index: revealPlayers.length,
        reveal_truth_visible: true,
        phase_deadline_at: addSecondsToNow(room.reveal_seconds),
      })
      .eq("id", roomId)
      .eq("phase", "revealing")
      .eq("reveal_player_index", room.reveal_player_index);

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
      phase_deadline_at: getPretruthRevealDeadline({
        revealPlayers,
        confessions: promptConfessions,
        guesses: promptGuesses,
        revealPlayerIndex: nextIndex,
      }),
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
  const { roundIndex, promptIndex } = decodeRoundPromptIndex(room.current_prompt_index);
  const hasNextPromptInRound = promptIndex + 1 < prompts.length;
  const hasAnotherRound = roundIndex + 1 < room.round_count;

  if (!hasNextPromptInRound && !hasAnotherRound) {
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

  if (!hasNextPromptInRound && hasAnotherRound) {
    const [promptResetResult, confessionResetResult, guessResetResult, roomUpdateResult] =
      await Promise.all([
        supabase.from("prompts").delete().eq("room_id", roomId),
        supabase.from("confessions").delete().eq("room_id", roomId),
        supabase.from("guesses").delete().eq("room_id", roomId),
        supabase
          .from("rooms")
          .update({
            phase: "prompting",
            current_prompt_index: encodeRoundPromptIndex(roundIndex + 1, 0),
            reveal_player_index: 0,
            reveal_truth_visible: false,
            phase_deadline_at: addSecondsToNow(room.prompt_seconds),
          })
          .eq("id", roomId)
          .eq("phase", "leaderboard"),
      ]);

    throwOnResultError([
      promptResetResult,
      confessionResetResult,
      guessResetResult,
      roomUpdateResult,
    ]);
    return;
  }

  const { error } = await supabase
    .from("rooms")
    .update({
      phase: "answering",
      current_prompt_index: encodeRoundPromptIndex(roundIndex, promptIndex + 1),
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

export async function playAgainToLobby(roomId: string, playerId: string) {
  const [roomResult, playerResult, playersResult] = await Promise.all([
    supabase.from("rooms").select("*").eq("id", roomId).maybeSingle(),
    supabase
      .from("players")
      .select("*")
      .eq("id", playerId)
      .eq("room_id", roomId)
      .maybeSingle(),
    supabase.from("players").select("*").eq("room_id", roomId),
  ]);

  if (roomResult.error) {
    throw new Error(asMessage(roomResult.error));
  }
  if (!roomResult.data) {
    throw new Error("Room not found.");
  }
  if (playerResult.error) {
    throw new Error(asMessage(playerResult.error));
  }
  if (!playerResult.data || !(playerResult.data as Player).is_host) {
    throw new Error("Only the room creator can play again.");
  }
  if (playersResult.error) {
    throw new Error(asMessage(playersResult.error));
  }

  const roomPlayers = (playersResult.data ?? []) as Player[];
  const resetResults = await Promise.all([
    ...roomPlayers.map((player) =>
      supabase.from("players").update({ score: 0 }).eq("id", player.id),
    ),
    supabase.from("prompts").delete().eq("room_id", roomId),
    supabase.from("confessions").delete().eq("room_id", roomId),
    supabase.from("guesses").delete().eq("room_id", roomId),
    supabase
      .from("rooms")
      .update({
        phase: "lobby",
        current_prompt_index: 0,
        reveal_player_index: 0,
        reveal_truth_visible: false,
        phase_deadline_at: null,
      })
      .eq("id", roomId),
  ]);

  throwOnResultError(resetResults);
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
