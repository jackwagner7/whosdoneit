"use client";

import { useState } from "react";
import type { GameType } from "@/types/whosdoneit";

type SettingsSheetProps = {
  open: boolean;
  isHost: boolean;
  currentGame: GameType;
  changingGame: GameType | null;
  allowHostControls: boolean;
  allowTesting: boolean;
  allowFakePlayers: boolean;
  teamName: string;
  teamIndex: number | null;
  teamCount: number;
  cardsPerPlayer: number;
  roundCount: number;
  turnSeconds: number;
  saving: boolean;
  addingFakePlayers: boolean;
  onGameChange: (game: GameType) => Promise<void>;
  onTeamNameChange: (value: string) => void;
  onTeamCountChange: (teamCount: number) => void;
  onCardsPerPlayerChange: (value: number) => void;
  onRoundCountChange: (value: number) => void;
  onTurnSecondsChange: (value: number) => void;
  onAddFakePlayers: (count: number) => Promise<void>;
  onClose: () => void;
  onSave: () => Promise<void>;
};

const GAME_OPTIONS: Array<{ value: GameType; label: string }> = [
  { value: "whosdoneit", label: "Who's Done It?" },
  { value: "sayless", label: "Say Less" },
];

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

type NumberRowProps = {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

function NumberRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
}: NumberRowProps) {
  return (
    <div className="rounded-xl border border-slate-300 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[0.8rem] font-semibold leading-tight text-slate-900">{label}</p>
          <p className="mt-0.5 text-[0.68rem] leading-tight text-slate-500">{hint}</p>
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
            onChange={(event) =>
              onChange(clamp(Number(event.target.value), min, max, value))
            }
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
  teamName,
  teamIndex,
  teamCount,
  cardsPerPlayer,
  roundCount,
  turnSeconds,
  saving,
  addingFakePlayers,
  onGameChange,
  onTeamNameChange,
  onTeamCountChange,
  onCardsPerPlayerChange,
  onRoundCountChange,
  onTurnSecondsChange,
  onAddFakePlayers,
  onClose,
  onSave,
}: SettingsSheetProps) {
  const [fakePlayerCount, setFakePlayerCount] = useState(2);

  if (!open) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-50 flex items-end overflow-hidden bg-black/40 p-2 sm:p-3">
      <div className="card-enter flex max-h-full w-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="overflow-y-auto p-3 sm:p-4">
          <h3 className="text-center text-xl font-black">Settings</h3>
          <p className="mt-1 text-center text-[0.76rem] leading-tight text-slate-600">
            Anyone can rename their current team. Hosts can edit draft and round settings before the game starts.
          </p>

          <div className="mt-3 grid gap-2">
            {isHost && allowHostControls ? (
              <div className="rounded-xl border border-slate-300 bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.8rem] font-semibold text-slate-900">Game</p>
                  <p className="text-[0.68rem] text-slate-500">New lobby</p>
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
                        {isSwitching ? "Opening..." : option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

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

            {isHost && allowHostControls ? (
              <>
                <NumberRow
                  hint="Balanced automatically when changed."
                  label="Teams"
                  max={5}
                  min={2}
                  onChange={onTeamCountChange}
                  step={1}
                  value={teamCount}
                />
                <NumberRow
                  hint="How many cards each player contributes."
                  label="Cards per player"
                  max={12}
                  min={3}
                  onChange={onCardsPerPlayerChange}
                  step={1}
                  value={cardsPerPlayer}
                />
                <NumberRow
                  hint="How many times the full deck gets replayed."
                  label="Rounds"
                  max={5}
                  min={1}
                  onChange={onRoundCountChange}
                  step={1}
                  value={roundCount}
                />
                <NumberRow
                  hint="Seconds per clue-giving turn."
                  label="Turn timer"
                  max={180}
                  min={15}
                  onChange={onTurnSecondsChange}
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
                      onChange={(event) =>
                        setFakePlayerCount(clamp(Number(event.target.value), 1, 20, 2))
                      }
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
                {!allowFakePlayers ? (
                  <p className="mt-2 text-[0.68rem] text-slate-500">
                    Fake users can only be added in lobby.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
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
              disabled={saving || changingGame !== null || !teamName.trim()}
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
