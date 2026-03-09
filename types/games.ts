export type GamePhase =
  | "lobby"
  | "prompting"
  | "answering"
  | "guessing"
  | "revealing"
  | "leaderboard"
  | "finished";

export type Room = {
  id: string;
  code: string;
  phase: GamePhase;
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

export type Player = {
  id: string;
  room_id: string;
  name: string;
  color: string;
  emoji: string;
  score: number;
  is_host: boolean;
  created_at: string;
};

export type Prompt = {
  id: string;
  room_id: string;
  submitted_by_player_id: string;
  text: string;
  prompt_order: number;
  score_applied: boolean;
  created_at: string;
};

export type Confession = {
  id: string;
  room_id: string;
  prompt_id: string;
  player_id: string;
  answer: boolean;
  created_at: string;
};

export type Guess = {
  id: string;
  room_id: string;
  prompt_id: string;
  guessing_player_id: string;
  target_player_id: string;
  guessed_answer: boolean;
  created_at: string;
};

export type GameSnapshot = {
  room: Room;
  players: Player[];
  prompts: Prompt[];
  confessions: Confession[];
  guesses: Guess[];
};

export type RoomSettings = {
  promptSeconds: number;
  roundCount: number;
  answeringSeconds: number;
  guessingSeconds: number;
  revealSeconds: number;
  fastMode: boolean;
};

export type PlayerProfile = {
  name: string;
  color: string;
  emoji: string;
};
