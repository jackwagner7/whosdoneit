"use client";

import { useMemo, useState } from "react";
import { PlayerBox } from "@/components/player-box";
import {
  DEFAULT_PLAYER_COLOR,
  DEFAULT_PLAYER_EMOJI,
  PLAYER_COLOR_POOL,
  PLAYER_EMOJI_POOL,
} from "@/lib/games/whosdoneit/game";
import type {
  SayLessDraftMode,
  SayLessPlayer,
} from "@/types/sayless";
import type { GameType } from "@/types/whosdoneit";

type SettingsSheetProps = {
  open: boolean;
  isHost: boolean;
  currentGame: GameType;
  changingGame: GameType | null;
  allowHostControls: boolean;
  allowTesting: boolean;
  allowFakePlayers: boolean;
  allowKickPlayers: boolean;
  teamName: string;
  teamIndex: number | null;
  teamCount: number;
  playerCount: number;
  players: SayLessPlayer[];
  currentPlayerId: string | null;
  kickingPlayerId: string | null;
  cardsPerPlayer: number;
  draftedCards: number;
  roundCount: number;
  turnSeconds: number;
  draftMode: SayLessDraftMode;
  hostPhoneOnly: boolean;
  saving: boolean;
  addingFakePlayers: boolean;
  addingHostedPlayer: boolean;
  onGameChange: (game: GameType) => Promise<void>;
  onTeamNameChange: (value: string) => void;
  onTeamCountChange: (teamCount: number) => void;
  onCardsPerPlayerChange: (value: number) => void;
  onDraftedCardsChange: (value: number) => void;
  onRoundCountChange: (value: number) => void;
  onTurnSecondsChange: (value: number) => void;
  onDraftModeChange: (value: SayLessDraftMode) => void;
  onHostPhoneOnlyChange: (value: boolean) => void;
  onKickPlayer: (playerId: string) => Promise<void>;
  onAddHostedPlayer: (values: { name: string; color: string; emoji: string }) => Promise<void>;
  onAddFakePlayers: (count: number) => Promise<void>;
  onClose: () => void;
  onSave: () => Promise<void>;
};

type SettingsTab = "general" | "players";

const GAME_OPTIONS: Array<{ value: GameType; label: string }> = [
  { value: "whosdoneit", label: "Who's Done It?" },
  { value: "sayless", label: "Say Less" },
];

const DRAFT_MODE_OPTIONS: Array<{
  value: SayLessDraftMode;
  label: string;
  shortHint: string;
}> = [
  { value: "manual", label: "Standard", shortHint: "Room draft, then clear the deck." },
  { value: "autodraft", label: "Autodraft", shortHint: "Skip drafting and build the deck automatically." },
  { value: "draftless", label: "Draftless", shortHint: "Random deck with one turn per player each round." },
];

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function nextAvailableColor(players: SayLessPlayer[]) {
  const used = new Set(players.map((player) => player.color.toLowerCase()));
  return (
    PLAYER_COLOR_POOL.find((color) => !used.has(color.toLowerCase())) ?? DEFAULT_PLAYER_COLOR
  );
}

function nextAvailableEmoji(players: SayLessPlayer[]) {
  const used = new Set(players.map((player) => player.emoji));
  return PLAYER_EMOJI_POOL.find((emoji) => !used.has(emoji)) ?? DEFAULT_PLAYER_EMOJI;
}

function InfoButton({
  id,
  infoOpenId,
  label,
  onToggle,
}: {
  id: string;
  infoOpenId: string | null;
  label: string;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      aria-label={label}
      className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-[0.7rem] font-black text-slate-500 transition hover:border-slate-400 hover:text-slate-900"
      onClick={() => onToggle(id)}
      type="button"
    >
      {infoOpenId === id ? "×" : "i"}
    </button>
  );
}

function NumberRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  info,
  infoId,
  infoOpenId,
  onToggleInfo,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  info?: string;
  infoId?: string;
  infoOpenId: string | null;
  onToggleInfo: (id: string) => void;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-300 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[0.8rem] font-semibold leading-tight text-slate-900">{label}</p>
            {info && infoId ? (
              <InfoButton
                id={infoId}
                infoOpenId={infoOpenId}
                label={`${label} info`}
                onToggle={onToggleInfo}
              />
            ) : null}
          </div>
          <p className="mt-0.5 text-[0.68rem] leading-tight text-slate-500">{hint}</p>
          {info && infoId && infoOpenId === infoId ? (
            <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[0.68rem] leading-relaxed text-slate-600">
              {info}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="w-10 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold disabled:opacity-50"
            disabled={value <= min}
            onClick={() => onChange(clamp(value - step, min, max, min))}
            type="button"
          >
            -{step}
          </button>
          <input
            className="settings-number-input w-14 rounded-lg border border-slate-300 px-2 py-1.5 text-center text-base font-semibold"
            max={max}
            min={min}
            onChange={(event) => onChange(clamp(Number(event.target.value), min, max, value))}
            type="number"
            value={value}
          />
          <button
            className="w-10 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold disabled:opacity-50"
            disabled={value >= max}
            onClick={() => onChange(clamp(value + step, min, max, max))}
            type="button"
          >
            +{step}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettingsSheet({
  open,
  isHost,
  currentGame,
  changingGame,
  allowHostControls,
  allowTesting,
  allowFakePlayers,
  allowKickPlayers,
  teamName,
  teamIndex,
  teamCount,
  playerCount,
  players,
  currentPlayerId,
  kickingPlayerId,
  cardsPerPlayer,
  draftedCards,
  roundCount,
  turnSeconds,
  draftMode,
  hostPhoneOnly,
  saving,
  addingFakePlayers,
  addingHostedPlayer,
  onGameChange,
  onTeamNameChange,
  onTeamCountChange,
  onCardsPerPlayerChange,
  onDraftedCardsChange,
  onRoundCountChange,
  onTurnSecondsChange,
  onDraftModeChange,
  onHostPhoneOnlyChange,
  onKickPlayer,
  onAddHostedPlayer,
  onAddFakePlayers,
  onClose,
  onSave,
}: SettingsSheetProps) {
  const [fakePlayerCount, setFakePlayerCount] = useState(2);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [infoOpenId, setInfoOpenId] = useState<string | null>(null);
  const [hostedPlayerName, setHostedPlayerName] = useState("");
  const removablePlayers = players.filter(
    (player) => !player.is_host && player.id !== currentPlayerId,
  );
  const isTeamless = teamCount < 2;
  const toggleInfo = (id: string) => {
    setInfoOpenId((current) => (current === id ? null : id));
  };
  const modeDescription = useMemo(() => {
    if (isTeamless) {
      return "Individual play. Turns rotate player by player and points go to the active player.";
    }

    return "Team play. Teams alternate turns and score together.";
  }, [isTeamless]);

  if (!open) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-50 flex items-end overflow-hidden bg-black/40 p-2 sm:p-3">
      <div className="card-enter flex max-h-full w-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="overflow-y-auto p-3 sm:p-4">
          <h3 className="text-center text-xl font-black">Settings</h3>
          <p className="mt-1 text-center text-[0.76rem] leading-tight text-slate-600">
            Team names, play style, and room controls live here.
          </p>

          {isHost ? (
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              <button
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  activeTab === "general" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"
                }`}
                onClick={() => setActiveTab("general")}
                type="button"
              >
                General
              </button>
              <button
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  activeTab === "players" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"
                }`}
                onClick={() => setActiveTab("players")}
                type="button"
              >
                Players
              </button>
            </div>
          ) : null}

          {activeTab === "players" && isHost ? (
            <div className="mt-3 grid gap-2">
              {hostPhoneOnly ? (
                <div className="rounded-xl border border-slate-300 bg-white px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[0.8rem] font-semibold text-slate-900">Add player</p>
                      <p className="mt-0.5 text-[0.68rem] leading-tight text-slate-500">
                        Host phone mode can build the whole room from here.
                      </p>
                    </div>
                    <InfoButton
                      id="host-phone-add"
                      infoOpenId={infoOpenId}
                      label="Host phone only info"
                      onToggle={toggleInfo}
                    />
                  </div>
                  {infoOpenId === "host-phone-add" ? (
                    <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[0.68rem] leading-relaxed text-slate-600">
                      Add players here when the host is running the room on one device. Other devices can still join later for drafting if you want them to.
                    </p>
                  ) : null}
                  <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                    <input
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                      maxLength={24}
                      onChange={(event) => setHostedPlayerName(event.target.value)}
                      placeholder="Player name"
                      value={hostedPlayerName}
                    />
                    <button
                      className="rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      disabled={!allowHostControls || addingHostedPlayer || !hostedPlayerName.trim()}
                      onClick={() =>
                        void onAddHostedPlayer({
                          name: hostedPlayerName.trim(),
                          color: nextAvailableColor(players),
                          emoji: nextAvailableEmoji(players),
                        }).then(() => setHostedPlayerName(""))
                      }
                      type="button"
                    >
                      {addingHostedPlayer ? "..." : "Add"}
                    </button>
                  </div>
                </div>
              ) : null}

              {!allowKickPlayers ? (
                <div className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[0.68rem] leading-tight text-slate-500">
                  Players can only be added or removed in the lobby.
                </div>
              ) : null}

              {removablePlayers.map((player) => {
                const isBusy = kickingPlayerId === player.id;
                return (
                  <div
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2"
                    key={player.id}
                  >
                    <PlayerBox color={player.color} emoji={player.emoji} name={player.name} />
                    <button
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-rose-700 disabled:opacity-50"
                      disabled={!allowKickPlayers || isBusy}
                      onClick={() => void onKickPlayer(player.id)}
                      type="button"
                    >
                      {isBusy ? "..." : "Kick"}
                    </button>
                  </div>
                );
              })}

              {removablePlayers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-[0.75rem] text-slate-500">
                  No removable players in the room.
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTab === "general" ? (
            <div className="mt-3 grid gap-2">
              {isHost && allowHostControls ? (
                <div className="rounded-xl border border-slate-300 bg-white px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.8rem] font-semibold text-slate-900">Game</p>
                    <p className="text-[0.68rem] text-slate-500">Same code</p>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {GAME_OPTIONS.map((option) => {
                      const isActive = option.value === currentGame;
                      const isSwitching = option.value === changingGame;
                      return (
                        <button
                          className={`rounded-lg border px-2 py-2 text-[0.78rem] font-semibold leading-tight transition ${
                            isActive
                              ? "border-black bg-black text-white"
                              : "border-slate-300 bg-white text-slate-900"
                          } disabled:opacity-60`}
                          disabled={isActive || changingGame !== null || saving}
                          key={option.value}
                          onClick={() => void onGameChange(option.value)}
                          type="button"
                        >
                          {isSwitching ? "Switching..." : option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {!isTeamless ? (
                <div className="rounded-xl border border-slate-300 bg-white px-3 py-2">
                  <p className="text-[0.8rem] font-semibold text-slate-900">
                    {teamIndex === null ? "Your team" : `Team ${teamIndex + 1} name`}
                  </p>
                  <input
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-semibold"
                    maxLength={24}
                    onChange={(event) => onTeamNameChange(event.target.value)}
                    placeholder="Enter a team name"
                    value={teamName}
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-slate-300 bg-white px-3 py-2">
                  <div className="flex items-center gap-2">
                    <p className="text-[0.8rem] font-semibold text-slate-900">Teamless</p>
                    <InfoButton
                      id="teamless"
                      infoOpenId={infoOpenId}
                      label="Teamless info"
                      onToggle={toggleInfo}
                    />
                  </div>
                  <p className="mt-0.5 text-[0.68rem] leading-tight text-slate-500">{modeDescription}</p>
                  {infoOpenId === "teamless" ? (
                    <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[0.68rem] leading-relaxed text-slate-600">
                      One team automatically switches Say Less into individual mode. The room still uses the same card, round, and timer settings.
                    </p>
                  ) : null}
                </div>
              )}

              {isHost && allowHostControls ? (
                <>
                  <NumberRow
                    hint={isTeamless ? "1 team enables teamless play." : "Balanced automatically when changed."}
                    info="Use 1 team for teamless individual mode. Use 2 or more teams for alternating team turns."
                    infoId="teams"
                    infoOpenId={infoOpenId}
                    label="Teams"
                    max={5}
                    min={1}
                    onChange={onTeamCountChange}
                    onToggleInfo={toggleInfo}
                    step={1}
                    value={teamCount}
                  />

                  <div className="rounded-xl border border-slate-300 bg-white px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-[0.8rem] font-semibold text-slate-900">Play style</p>
                          <InfoButton
                            id="draft-mode"
                            infoOpenId={infoOpenId}
                            label="Play style info"
                            onToggle={toggleInfo}
                          />
                        </div>
                        <p className="mt-0.5 text-[0.68rem] leading-tight text-slate-500">
                          Choose how the deck is built and how rounds flow.
                        </p>
                      </div>
                    </div>
                    {infoOpenId === "draft-mode" ? (
                      <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[0.68rem] leading-relaxed text-slate-600">
                        Standard uses a real player draft. Autodraft skips that and fills the room deck automatically. Draftless also skips drafting, but each player gets one timed turn per round.
                      </p>
                    ) : null}
                    <div className="mt-3 grid gap-2">
                      {DRAFT_MODE_OPTIONS.map((option) => {
                        const active = option.value === draftMode;
                        return (
                          <button
                            className={`rounded-xl border px-3 py-3 text-left transition ${
                              active
                                ? "border-black bg-black text-white"
                                : "border-slate-300 bg-white text-slate-900"
                            }`}
                            key={option.value}
                            onClick={() => onDraftModeChange(option.value)}
                            type="button"
                          >
                            <p className="text-sm font-black">{option.label}</p>
                            <p className={`mt-1 text-[0.72rem] leading-relaxed ${active ? "text-white/80" : "text-slate-500"}`}>
                              {option.shortHint}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[0.8rem] font-semibold text-slate-900">Host phone only</p>
                        <InfoButton
                          id="host-phone-only"
                          infoOpenId={infoOpenId}
                          label="Host phone only info"
                          onToggle={toggleInfo}
                        />
                      </div>
                      <p className="mt-0.5 text-[0.68rem] leading-tight text-slate-500">
                        The host runs turns from one device.
                      </p>
                      {infoOpenId === "host-phone-only" ? (
                        <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[0.68rem] leading-relaxed text-slate-600">
                          This can combine with any play style. In manual draft mode, the host can draft on behalf of each player from the host device.
                        </p>
                      ) : null}
                    </div>
                    <input
                      checked={hostPhoneOnly}
                      className="h-4 w-4 shrink-0 accent-black"
                      onChange={(event) => onHostPhoneOnlyChange(event.target.checked)}
                      type="checkbox"
                    />
                  </label>

                  {draftMode === "draftless" ? (
                    <div className="rounded-xl border border-slate-300 bg-white px-3 py-2">
                      <div className="flex items-center gap-2">
                        <p className="text-[0.8rem] font-semibold text-slate-900">Card flow</p>
                        <InfoButton
                          id="draftless-cards"
                          infoOpenId={infoOpenId}
                          label="Draftless cards info"
                          onToggle={toggleInfo}
                        />
                      </div>
                      <p className="mt-0.5 text-[0.68rem] leading-tight text-slate-500">
                        Draftless skips the deck and keeps serving random cards for the full turn.
                      </p>
                      {infoOpenId === "draftless-cards" ? (
                        <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[0.68rem] leading-relaxed text-slate-600">
                          There is no shared deck in draftless mode. Each turn keeps drawing fresh random cards until the timer ends, then the room advances to the next player.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <NumberRow
                        hint={`Shared deck target. Split evenly across ${playerCount} player${playerCount === 1 ? "" : "s"}.`}
                        info="This is the total deck size for the room. Everyone contributes the same number of cards."
                        infoId="drafted-cards"
                        infoOpenId={infoOpenId}
                        label="Drafted cards"
                        max={Math.max(playerCount, 1) * 20}
                        min={Math.max(playerCount, 1) * 3}
                        onChange={onDraftedCardsChange}
                        onToggleInfo={toggleInfo}
                        step={Math.max(playerCount, 1)}
                        value={draftedCards}
                      />
                      <NumberRow
                        hint={`${playerCount} x ${cardsPerPlayer} = ${draftedCards}.`}
                        info="This is the equal per-player split that feeds the total room deck size."
                        infoId="cards-per-player"
                        infoOpenId={infoOpenId}
                        label="Cards per player"
                        max={20}
                        min={3}
                        onChange={onCardsPerPlayerChange}
                        onToggleInfo={toggleInfo}
                        step={1}
                        value={cardsPerPlayer}
                      />
                    </>
                  )}
                  <NumberRow
                    hint="How many rounds the room plays."
                    info="Standard and autodraft replay the same deck each round. Draftless still gives one timed turn per player per round."
                    infoId="rounds"
                    infoOpenId={infoOpenId}
                    label="Rounds"
                    max={5}
                    min={1}
                    onChange={onRoundCountChange}
                    onToggleInfo={toggleInfo}
                    step={1}
                    value={roundCount}
                  />
                  <NumberRow
                    hint="Seconds per timed turn."
                    info="This timer is reused across all Say Less modes."
                    infoId="turn-timer"
                    infoOpenId={infoOpenId}
                    label="Turn timer"
                    max={180}
                    min={15}
                    onChange={onTurnSecondsChange}
                    onToggleInfo={toggleInfo}
                    step={5}
                    value={turnSeconds}
                  />
                </>
              ) : null}

              {allowTesting ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.8rem] font-semibold text-slate-900">Testing</p>
                    <p className="text-[0.68rem] text-slate-500">Fake users</p>
                  </div>
                  <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-2">
                    <label className="grid gap-1">
                      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Fake users
                      </span>
                      <input
                        className="settings-number-input rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-base font-semibold"
                        disabled={addingFakePlayers || !allowFakePlayers}
                        max={20}
                        min={1}
                        onChange={(event) => setFakePlayerCount(clamp(Number(event.target.value), 1, 20, 2))}
                        type="number"
                        value={fakePlayerCount}
                      />
                    </label>
                    <button
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[0.7rem] font-bold uppercase tracking-[0.08em] disabled:opacity-60"
                      disabled={addingFakePlayers || !allowFakePlayers}
                      onClick={() => void onAddFakePlayers(fakePlayerCount)}
                      type="button"
                    >
                      {addingFakePlayers ? "..." : "Add fake users"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-200 p-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
            <button
              className="rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={saving || changingGame !== null || (!isTeamless && !teamName.trim())}
              onClick={() => void onSave()}
              type="button"
            >
              {saving ? "..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
