import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import type {
  SayLessCard,
  SayLessDraftBatchResponse,
  SayLessRoom,
  SayLessRoomState,
} from "@/types/sayless";

const DEFAULT_CARDS_PER_PLAYER = 8;
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini";
const GENERATED_BATCH_SIZE = 12;

type DraftBatchStateRow = {
  latest_duplicate_count: number | null;
  generated_batch_count: number | null;
};

type HandCardRow = {
  slot_index: number;
  card: SayLessCard | SayLessCard[] | null;
};

type RoomCardRow = {
  card: SayLessCard | SayLessCard[] | null;
  drafted_by_player_id: string;
};

type RejectionCardRow = {
  card: SayLessCard | SayLessCard[] | null;
};

type GeneratedCardRow = {
  id: string;
  title: string;
  description: string;
  points: number;
  created_at: string;
  card_source: "base" | "generated";
  generated_room_id: string | null;
  generated_for_player_id: string | null;
};

type GeneratedCardCandidate = {
  title: string;
  description: string;
  points: number;
};

type BatchSlot =
  | { kind: "generated"; candidate: GeneratedCardCandidate }
  | { kind: "fallback"; card: SayLessCard };

function asMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return "Unknown error";
}

function clampPoints(value: unknown) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) {
    return 2;
  }

  return Math.max(1, Math.min(5, Math.round(nextValue)));
}

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeGeneratedCandidate(value: unknown): GeneratedCardCandidate | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawTitle = "title" in value ? String(value.title ?? "") : "";
  const rawDescription = "description" in value ? String(value.description ?? "") : "";
  const title = rawTitle.trim().replace(/\s+/g, " ").slice(0, 48);
  const description = rawDescription.trim().replace(/\s+/g, " ").slice(0, 180);

  if (!title || !description) {
    return null;
  }

  return {
    title,
    description,
    points: clampPoints("points" in value ? value.points : 2),
  };
}

function toCard(row: SayLessCard | SayLessCard[] | null): SayLessCard | null {
  if (!row) {
    return null;
  }

  return Array.isArray(row) ? (row[0] ?? null) : row;
}

function shuffle<T>(items: T[]) {
  const cloned = [...items];
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[swapIndex]] = [cloned[swapIndex], cloned[index]];
  }
  return cloned;
}

function buildCardList(cards: SayLessCard[]) {
  if (cards.length === 0) {
    return "[]";
  }

  return JSON.stringify(
    cards.map((card) => ({
      title: card.title,
      description: card.description,
      points: card.points,
    })),
  );
}

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  if ("output_text" in payload && typeof payload.output_text === "string") {
    return payload.output_text;
  }

  if (!("output" in payload) || !Array.isArray(payload.output)) {
    return "";
  }

  const fragments: string[] = [];
  payload.output.forEach((item) => {
    if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) {
      return;
    }

    item.content.forEach((content: unknown) => {
      if (!content || typeof content !== "object") {
        return;
      }

      if ("text" in content && typeof content.text === "string") {
        fragments.push(content.text);
      }
    });
  });

  return fragments.join("\n").trim();
}

async function getCurrentHand(
  supabase: SupabaseClient,
  roomId: string,
  playerId: string,
) {
  const { data, error } = await supabase
    .from("sayless_draft_hands")
    .select(
      "slot_index, card:sayless_cards(id, title, description, points, created_at, card_source, generated_room_id, generated_for_player_id)",
    )
    .eq("room_id", roomId)
    .eq("player_id", playerId)
    .order("slot_index", { ascending: true });

  if (error) {
    throw new Error(asMessage(error));
  }

  return ((data ?? []) as HandCardRow[])
    .map((entry) => toCard(entry.card))
    .filter((card): card is SayLessCard => card !== null);
}

async function getDraftBatchState(
  supabase: SupabaseClient,
  roomId: string,
  playerId: string,
) {
  const { data, error } = await supabase
    .from("sayless_draft_player_state")
    .select("latest_duplicate_count, generated_batch_count")
    .eq("room_id", roomId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) {
    throw new Error(asMessage(error));
  }

  return (data as DraftBatchStateRow | null) ?? null;
}

async function upsertDraftBatchState(
  supabase: SupabaseClient,
  roomId: string,
  playerId: string,
  duplicateCount: number,
  generatedBatchCount: number,
) {
  const { error } = await supabase.from("sayless_draft_player_state").upsert(
    {
      room_id: roomId,
      player_id: playerId,
      latest_duplicate_count: duplicateCount,
      generated_batch_count: generatedBatchCount,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "room_id,player_id",
    },
  );

  if (error) {
    throw new Error(asMessage(error));
  }
}

async function fetchCount(
  supabase: SupabaseClient,
  table: string,
  filters: Array<[column: string, value: string]>,
) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });

  filters.forEach(([column, value]) => {
    query = query.eq(column, value);
  });

  const { count, error } = await query;
  if (error) {
    throw new Error(asMessage(error));
  }

  return count ?? 0;
}

async function fetchDraftingContext(
  supabase: SupabaseClient,
  roomId: string,
  playerId: string,
) {
  const [
    roomCardsResult,
    handCardsResult,
    rejectionCardsResult,
    generatedCardsResult,
    baseCardsResult,
  ] = await Promise.all([
    supabase
      .from("sayless_room_cards")
      .select(
        "drafted_by_player_id, card:sayless_cards(id, title, description, points, created_at, card_source, generated_room_id, generated_for_player_id)",
      )
      .eq("room_id", roomId),
    supabase
      .from("sayless_draft_hands")
      .select(
        "player_id, card:sayless_cards(id, title, description, points, created_at, card_source, generated_room_id, generated_for_player_id)",
      )
      .eq("room_id", roomId),
    supabase
      .from("sayless_draft_rejections")
      .select(
        "card:sayless_cards(id, title, description, points, created_at, card_source, generated_room_id, generated_for_player_id)",
      )
      .eq("room_id", roomId)
      .eq("player_id", playerId),
    supabase
      .from("sayless_cards")
      .select("id, title, description, points, created_at, card_source, generated_room_id, generated_for_player_id")
      .eq("generated_room_id", roomId),
    supabase
      .from("sayless_cards")
      .select("id, title, description, points, created_at, card_source, generated_room_id, generated_for_player_id")
      .eq("card_source", "base"),
  ]);

  if (roomCardsResult.error) {
    throw new Error(asMessage(roomCardsResult.error));
  }

  if (handCardsResult.error) {
    throw new Error(asMessage(handCardsResult.error));
  }

  if (rejectionCardsResult.error) {
    throw new Error(asMessage(rejectionCardsResult.error));
  }

  if (generatedCardsResult.error) {
    throw new Error(asMessage(generatedCardsResult.error));
  }

  if (baseCardsResult.error) {
    throw new Error(asMessage(baseCardsResult.error));
  }

  const roomCards = (roomCardsResult.data ?? []) as RoomCardRow[];
  const handCards = (handCardsResult.data ?? []) as Array<{
    player_id: string;
    card: SayLessCard | SayLessCard[] | null;
  }>;
  const rejectionCards = (rejectionCardsResult.data ?? []) as RejectionCardRow[];
  const generatedCards = ((generatedCardsResult.data ?? []) as GeneratedCardRow[]).map((card) => ({
    ...card,
    card_source: "generated" as const,
  }));
  const baseCards = ((baseCardsResult.data ?? []) as GeneratedCardRow[]).map((card) => ({
    ...card,
    card_source: "base" as const,
  }));

  const playerSelectedCards = roomCards
    .filter((entry) => entry.drafted_by_player_id === playerId)
    .map((entry) => toCard(entry.card))
    .filter((card): card is SayLessCard => card !== null);
  const otherSelectedCards = roomCards
    .filter((entry) => entry.drafted_by_player_id !== playerId)
    .map((entry) => toCard(entry.card))
    .filter((card): card is SayLessCard => card !== null);
  const currentHandCards = handCards
    .map((entry) => toCard(entry.card))
    .filter((card): card is SayLessCard => card !== null);
  const playerRejectedCards = rejectionCards
    .map((entry) => toCard(entry.card))
    .filter((card): card is SayLessCard => card !== null);

  return {
    playerSelectedCards,
    otherSelectedCards,
    currentHandCards,
    playerRejectedCards,
    generatedCards,
    baseCards,
  };
}

async function generateCardsWithOpenAI(
  playerSelectedCards: SayLessCard[],
  otherSelectedCards: SayLessCard[],
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY for Say Less draft generation.");
  }

  const seed = crypto.randomUUID();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_OPENAI_MODEL,
      instructions:
        "You write weird-but-playable card prompts for a party drafting game. Use recognizable real-world references when helpful, including characters, history, celebrities, music, TV, movies, internet culture, and sports, but do not invent fake public figures, fake media, fake historical facts, or fake canon. Output exactly 12 cards as JSON. Keep titles concise and punchy.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Generate 12 new Say Less draft cards for one player.",
                "Requirements:",
                "- The cards should be relatively wild swings based on vibes",
                "- The remaining cards should bridge those categories without feeling repetitive.",
                "- Focus primarily on the player's own picks, but definitely take inspiration from the other players' drafted cards too.",
                "- Actively play off links, contrasts, riffs, and adjacent references across the whole room instead of trying to keep this batch distinct from everyone else.",
                "- Keep the cards playful, specific, and immediately usable in the game.",
                "- Do not make things up. If you reference a person, character, franchise, era, song, movie, show, historical event, celebrity, or meme, it should be a real recognizable thing.",
                "- It can use characters, history, celebrities, music, TV, movies, sports, and similar references, but those references should be real and grounded.",
                `- Use this randomness seed to stay varied: ${seed}.`,
                "",
                `Player-selected cards: ${buildCardList(playerSelectedCards)}`,
                `Other room-selected cards: ${buildCardList(otherSelectedCards)}`,
              ].join("\n"),
            },
          ],
        },
      ],
      max_output_tokens: 1600,
      text: {
        format: {
          type: "json_schema",
          name: "sayless_draft_batch",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["cards"],
            properties: {
              cards: {
                type: "array",
                minItems: GENERATED_BATCH_SIZE,
                maxItems: GENERATED_BATCH_SIZE,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "description", "points"],
                  properties: {
                    title: {
                      type: "string",
                      minLength: 2,
                      maxLength: 48,
                    },
                    description: {
                      type: "string",
                      minLength: 12,
                      maxLength: 180,
                    },
                    points: {
                      type: "integer",
                      minimum: 1,
                      maximum: 5,
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  });

  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "error" in payload
        ? asMessage(payload.error)
        : "OpenAI draft generation failed.",
    );
  }

  const rawText = extractOutputText(payload);
  if (!rawText) {
    throw new Error("OpenAI draft generation returned no structured output.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("OpenAI draft generation returned invalid JSON.");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("cards" in parsed) ||
    !Array.isArray(parsed.cards)
  ) {
    throw new Error("OpenAI draft generation returned an invalid card payload.");
  }

  return parsed.cards
    .map(normalizeGeneratedCandidate)
    .filter((card): card is GeneratedCardCandidate => card !== null)
    .slice(0, GENERATED_BATCH_SIZE);
}

function resolveBatch(
  generatedCards: GeneratedCardCandidate[],
  fallbackCards: SayLessCard[],
  seenTitles: Set<string>,
) {
  const batch: BatchSlot[] = [];
  const fallbackPool = shuffle(fallbackCards);
  let fallbackIndex = 0;
  let duplicateCount = 0;

  generatedCards.forEach((candidate) => {
    const titleKey = normalizeTitle(candidate.title);
    if (!titleKey || seenTitles.has(titleKey)) {
      duplicateCount += 1;
      return;
    }

    seenTitles.add(titleKey);
    batch.push({ kind: "generated", candidate });
  });

  while (batch.length < GENERATED_BATCH_SIZE && fallbackIndex < fallbackPool.length) {
    const fallbackCard = fallbackPool[fallbackIndex];
    fallbackIndex += 1;

    const titleKey = normalizeTitle(fallbackCard.title);
    if (!titleKey || seenTitles.has(titleKey)) {
      continue;
    }

    seenTitles.add(titleKey);
    batch.push({ kind: "fallback", card: fallbackCard });
  }

  if (batch.length === 0) {
    throw new Error("Could not assemble a draft batch.");
  }

  return {
    batch: batch.slice(0, GENERATED_BATCH_SIZE),
    duplicateCount,
  };
}

async function insertGeneratedCards(
  supabase: SupabaseClient,
  roomId: string,
  playerId: string,
  candidates: GeneratedCardCandidate[],
) {
  if (candidates.length === 0) {
    return new Map<string, SayLessCard>();
  }

  const { data, error } = await supabase
    .from("sayless_cards")
    .insert(
      candidates.map((candidate) => ({
        title: candidate.title,
        description: candidate.description,
        points: candidate.points,
        card_source: "generated",
        generated_room_id: roomId,
        generated_for_player_id: playerId,
      })),
    )
    .select("id, title, description, points, created_at, card_source, generated_room_id, generated_for_player_id");

  if (error) {
    throw new Error(asMessage(error));
  }

  return ((data ?? []) as SayLessCard[]).reduce((map, card) => {
    map.set(normalizeTitle(card.title), card);
    return map;
  }, new Map<string, SayLessCard>());
}

async function insertHandCards(
  supabase: SupabaseClient,
  roomId: string,
  playerId: string,
  cards: SayLessCard[],
) {
  const { error } = await supabase.from("sayless_draft_hands").insert(
    cards.map((card, index) => ({
      room_id: roomId,
      player_id: playerId,
      card_id: card.id,
      slot_index: index,
    })),
  );

  if (error) {
    throw new Error(asMessage(error));
  }
}

async function deleteDraftDeckCards(
  supabase: SupabaseClient,
  roomId: string,
  cardIds: string[],
) {
  if (cardIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("sayless_draft_deck")
    .delete()
    .eq("room_id", roomId)
    .in("card_id", cardIds);

  if (error) {
    throw new Error(asMessage(error));
  }
}

export async function getOrCreateDraftBatch(
  roomId: string,
  playerId: string,
): Promise<SayLessDraftBatchResponse> {
  const supabase = createAdminSupabaseClient();

  const [roomResult, playerResult, stateResult, draftState] = await Promise.all([
    supabase.from("rooms").select("*").eq("id", roomId).maybeSingle(),
    supabase
      .from("players")
      .select("*")
      .eq("id", playerId)
      .eq("room_id", roomId)
      .maybeSingle(),
    supabase.from("sayless_room_state").select("*").eq("room_id", roomId).maybeSingle(),
    getDraftBatchState(supabase, roomId, playerId),
  ]);

  if (roomResult.error) {
    throw new Error(asMessage(roomResult.error));
  }

  if (playerResult.error) {
    throw new Error(asMessage(playerResult.error));
  }

  if (stateResult.error) {
    throw new Error(asMessage(stateResult.error));
  }

  const room = roomResult.data as SayLessRoom | null;
  const player = playerResult.data;
  const state = stateResult.data as SayLessRoomState | null;

  if (!room || room.game_type !== "sayless") {
    throw new Error("Room not found.");
  }

  if (!player) {
    throw new Error("Player not found.");
  }

  if (room.phase !== "drafting") {
    return { cards: [], duplicateCount: 0 };
  }

  const existingHand = await getCurrentHand(supabase, roomId, playerId);
  if (existingHand.length > 0) {
    return {
      cards: existingHand,
      duplicateCount: draftState?.latest_duplicate_count ?? 0,
    };
  }

  const cardsPerPlayer = state?.cards_per_player ?? DEFAULT_CARDS_PER_PLAYER;
  const [playerDraftCount, rejectionCount, roomCardCount, playerCount] = await Promise.all([
    fetchCount(supabase, "sayless_room_cards", [
      ["room_id", roomId],
      ["drafted_by_player_id", playerId],
    ]),
    fetchCount(supabase, "sayless_draft_rejections", [
      ["room_id", roomId],
      ["player_id", playerId],
    ]),
    fetchCount(supabase, "sayless_room_cards", [["room_id", roomId]]),
    fetchCount(supabase, "players", [["room_id", roomId]]),
  ]);

  if (playerDraftCount >= cardsPerPlayer) {
    return { cards: [], duplicateCount: 0 };
  }

  const totalDraftTarget = playerCount * cardsPerPlayer;
  if (roomCardCount >= totalDraftTarget) {
    return { cards: [], duplicateCount: 0 };
  }

  const seenCount = playerDraftCount + rejectionCount;
  if (seenCount === 0) {
    const { data, error } = await supabase.rpc("sl_get_draft_batch_for_player", {
      p_room_id: roomId,
      p_player_id: playerId,
    });

    if (error) {
      throw new Error(asMessage(error));
    }

    const cards = ((data as SayLessCard[] | null) ?? []).map((card) => ({
      ...card,
      card_source: card.card_source ?? "base",
      generated_room_id: card.generated_room_id ?? null,
      generated_for_player_id: card.generated_for_player_id ?? null,
    }));

    await upsertDraftBatchState(
      supabase,
      roomId,
      playerId,
      0,
      draftState?.generated_batch_count ?? 0,
    );

    return { cards, duplicateCount: 0 };
  }

  const {
    playerSelectedCards,
    otherSelectedCards,
    currentHandCards,
    playerRejectedCards,
    generatedCards,
    baseCards,
  } = await fetchDraftingContext(supabase, roomId, playerId);

  const existingTitleSet = new Set<string>();
  [...playerSelectedCards, ...otherSelectedCards, ...currentHandCards, ...playerRejectedCards, ...generatedCards].forEach(
    (card) => {
      const normalized = normalizeTitle(card.title);
      if (normalized) {
        existingTitleSet.add(normalized);
      }
    },
  );

  const reservedCardIds = new Set<string>();
  [...playerSelectedCards, ...otherSelectedCards, ...currentHandCards].forEach((card) => {
    reservedCardIds.add(card.id);
  });

  const fallbackPool = baseCards.filter((card) => {
    if (reservedCardIds.has(card.id)) {
      return false;
    }

    const normalized = normalizeTitle(card.title);
    return normalized ? !existingTitleSet.has(normalized) : false;
  });

  const generatedBatch = await generateCardsWithOpenAI(
    playerSelectedCards,
    otherSelectedCards,
  );
  const { batch, duplicateCount } = resolveBatch(
    generatedBatch,
    fallbackPool,
    new Set(existingTitleSet),
  );

  const generatedCandidates = batch
    .filter((entry): entry is Extract<BatchSlot, { kind: "generated" }> => entry.kind === "generated")
    .map((entry) => entry.candidate);
  const insertedGeneratedCards = await insertGeneratedCards(
    supabase,
    roomId,
    playerId,
    generatedCandidates,
  );

  const finalCards = batch
    .map((entry) => {
      if (entry.kind === "fallback") {
        return entry.card;
      }

      return insertedGeneratedCards.get(normalizeTitle(entry.candidate.title)) ?? null;
    })
    .filter((card): card is SayLessCard => card !== null);

  const fallbackCardIds = batch
    .filter((entry): entry is Extract<BatchSlot, { kind: "fallback" }> => entry.kind === "fallback")
    .map((entry) => entry.card.id);

  await deleteDraftDeckCards(supabase, roomId, fallbackCardIds);

  try {
    await insertHandCards(supabase, roomId, playerId, finalCards);
  } catch (error) {
    const handAfterConflict = await getCurrentHand(supabase, roomId, playerId);
    if (handAfterConflict.length > 0) {
      return {
        cards: handAfterConflict,
        duplicateCount: draftState?.latest_duplicate_count ?? 0,
      };
    }

    throw error;
  }

  await upsertDraftBatchState(
    supabase,
    roomId,
    playerId,
    duplicateCount,
    (draftState?.generated_batch_count ?? 0) + 1,
  );

  return {
    cards: finalCards,
    duplicateCount,
  };
}
