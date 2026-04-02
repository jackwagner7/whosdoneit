import type { GameType } from "@/types/whosdoneit";

export type SayLessPhase =
  | "lobby"
  | "drafting"
  | "playing"
  | "round_summary"
  | "finished";

export type SayLessRoom = {
  id: string;
  code: string;
  game_type: GameType;
  phase: SayLessPhase;
  team_count: number;
  team_names: string[];
  current_prompt_index: number;
  reveal_player_index: number;
  reveal_truth_visible: boolean;
  prompt_seconds: number;
  round_count: number;
  answering_seconds: number;
  guessing_seconds: number;
  reveal_seconds: number;
  fast_mode: boolean;
  phase_deadline_at: string | null;
  created_at: string;
};

export type SayLessCard = {
  id: string;
  title: string;
  description: string;
  points: number;
  created_at: string;
  card_source?: "base" | "generated";
  generated_room_id?: string | null;
  generated_for_player_id?: string | null;
};

export type SayLessPlayer = {
  id: string;
  room_id: string;
  name: string;
  color: string;
  emoji: string;
  team_index: number | null;
  score: number;
  is_host: boolean;
  created_at: string;
};

export type SayLessRoomCardStatus = "pending" | "passed" | "cleared";

export type SayLessRoomCard = {
  id: string;
  room_id: string;
  card_id: string;
  drafted_by_player_id: string;
  sort_order: number;
  status: SayLessRoomCardStatus;
  created_at: string;
  card: SayLessCard;
};

export type SayLessDraftRejection = {
  room_id: string;
  player_id: string;
  card_id: string;
  created_at: string;
};

export type SayLessDraftHand = {
  room_id: string;
  player_id: string;
  card_id: string;
  slot_index: number;
  created_at: string;
};

export type SayLessRoundResult = {
  id: string;
  room_id: string;
  round_index: number;
  team_index: number;
  player_id: string;
  card_entry_id: string;
  points: number;
  created_at: string;
};

export type SayLessRoomState = {
  room_id: string;
  cards_per_player: number;
  round_count: number;
  turn_seconds: number;
  current_round_index: number;
  starting_team_index: number;
  active_team_index: number;
  active_player_id: string | null;
  active_card_entry_id: string | null;
  turn_deadline_at: string | null;
  paused_turn_seconds_remaining: number | null;
  team_turn_counts: number[];
  created_at: string;
};

export type SayLessSnapshot = {
  room: SayLessRoom;
  players: SayLessPlayer[];
  state: SayLessRoomState;
  roomCards: SayLessRoomCard[];
  draftRejections: SayLessDraftRejection[];
  roundResults: SayLessRoundResult[];
};

export type SayLessRoomSettings = {
  teamCount: number;
  cardsPerPlayer: number;
  roundCount: number;
  turnSeconds: number;
};

export type SayLessDraftBatchResponse = {
  cards: SayLessCard[];
  duplicateCount: number;
};
