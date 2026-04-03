"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { GameType } from "@/types/whosdoneit";

type SettingsSheetProps = {
  open: boolean;
  currentGame: GameType;
  changingGame: GameType | null;
  values: {
    promptSeconds: number;
    roundCount: number;
    answeringSeconds: number;
    guessingSeconds: number;
    revealSeconds: number;
    fastMode: boolean;
  };
  saving: boolean;
  addingFakePlayers: boolean;
  allowRoundControls: boolean;
  allowTesting: boolean;
  allowFakePlayers: boolean;
  allowGameChange: boolean;
  onChange: (values: {
    promptSeconds: number;
    roundCount: number;
    answeringSeconds: number;
    guessingSeconds: number;
    revealSeconds: number;
    fastMode: boolean;
  }) => void;
  onGameChange: (game: GameType) => Promise<void>;
  onAddFakePlayers: (count: number) => Promise<void>;
  onClose: () => void;
  onSave: (settings: {
    promptSeconds: number;
    roundCount: number;
    answeringSeconds: number;
    guessingSeconds: number;
    revealSeconds: number;
    fastMode: boolean;
  }) => Promise<void>;
};

function clamp(value: number) {
  return Math.max(5, Math.min(180, Math.round(value)));
}

function clampRounds(value: number) {
  return Math.max(1, Math.min(10, Math.round(value)));
}

function clampFakePlayers(value: number) {
  return Math.max(1, Math.min(20, Math.round(value)));
}

type TimerFieldKey =
  | "promptSeconds"
  | "answeringSeconds"
  | "guessingSeconds"
  | "revealSeconds";

const TIMER_FIELDS: Array<{ key: TimerFieldKey; label: string }> = [
  { key: "promptSeconds", label: "Prompt" },
  { key: "answeringSeconds", label: "Answer" },
  { key: "guessingSeconds", label: "Guess" },
  { key: "revealSeconds", label: "Reveal" },
];

type SettingRowProps = {
  label: string;
  description?: string;
  disabled?: boolean;
  children: ReactNode;
};

function SettingRow({ label, description, disabled = false, children }: SettingRowProps) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
        disabled ? "border-slate-200 bg-slate-100" : "border-slate-300 bg-white"
      }`}
    >
      <div className="min-w-0">
        <p className="text-[0.8rem] font-semibold leading-tight text-slate-900">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[0.68rem] leading-tight text-slate-500">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const GAME_OPTIONS: Array<{ value: GameType; label: string }> = [
  { value: "whosdoneit", label: "Who's Done It?" },
  { value: "sayless", label: "Say Less" },
];

export function SettingsSheet({
  open,
  currentGame,
  changingGame,
  values,
  saving,
  addingFakePlayers,
  allowRoundControls,
  allowTesting,
  allowFakePlayers,
  allowGameChange,
  onChange,
  onGameChange,
  onAddFakePlayers,
  onClose,
  onSave,
}: SettingsSheetProps) {
  const [fakePlayerCount, setFakePlayerCount] = useState(2);
  const [timersOpen, setTimersOpen] = useState(false);

  if (!open) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-50 flex items-end overflow-hidden bg-black/40 p-2 sm:p-3">
      <div className="card-enter flex max-h-full w-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="overflow-y-auto p-3 sm:p-4">
        <h3 className="text-center text-xl font-black">Settings</h3>
        <div className="mt-3 grid gap-2">
          {allowGameChange ? (
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
          <SettingRow
            description={!allowRoundControls ? "Only editable in lobby." : undefined}
            disabled={!allowRoundControls}
            label="Rounds"
          >
            <div className="flex items-center gap-2">
              <input
                className="settings-number-input w-14 rounded-lg border border-slate-300 px-2 py-1.5 text-center text-base font-semibold disabled:bg-slate-100"
                disabled={!allowRoundControls}
                max={10}
                min={1}
                onChange={(event) =>
                  onChange({
                    ...values,
                    roundCount: clampRounds(Number(event.target.value)),
                  })
                }
                type="number"
                value={values.roundCount}
              />
              <div className="flex items-center gap-2">
                <button
                  className="w-10 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-xs font-bold disabled:opacity-50"
                  disabled={!allowRoundControls || values.roundCount <= 1}
                  onClick={() =>
                    onChange({
                      ...values,
                      roundCount: clampRounds(values.roundCount - 1),
                    })
                  }
                  type="button"
                >
                  -1
                </button>
                <button
                  className="w-10 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-xs font-bold disabled:opacity-50"
                  disabled={!allowRoundControls || values.roundCount >= 10}
                  onClick={() =>
                    onChange({
                      ...values,
                      roundCount: clampRounds(values.roundCount + 1),
                    })
                  }
                  type="button"
                >
                  +1
                </button>
              </div>
            </div>
          </SettingRow>

          <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2">
            <div className="min-w-0">
              <p className="text-[0.8rem] font-semibold text-slate-900">Fast mode</p>
              <p className="text-[0.68rem] text-slate-500">Skip Trial.</p>
            </div>
            <input
              checked={values.fastMode}
              className="h-4 w-4 shrink-0 accent-black"
              onChange={(event) =>
                onChange({
                  ...values,
                  fastMode: event.target.checked,
                })
              }
              type="checkbox"
            />
          </label>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <button
              aria-expanded={timersOpen}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
              onClick={() => setTimersOpen((current) => !current)}
              type="button"
            >
              <div>
                <p className="text-[0.8rem] font-semibold text-slate-900">Timers</p>
                <p className="text-[0.68rem] text-slate-500">Values in seconds.</p>
              </div>
              <span className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-slate-500">
                {timersOpen ? "Hide" : "Show"}
              </span>
            </button>

            {timersOpen ? (
              <div className="grid gap-2 border-t border-slate-200 px-2 py-2">
                {TIMER_FIELDS.map(({ key, label }) => (
                  <SettingRow key={key} label={label}>
                    <div className="flex items-center gap-2">
                      <input
                        className="settings-number-input w-14 rounded-lg border border-slate-300 px-2 py-1.5 text-center text-base font-semibold"
                        max={180}
                        min={5}
                        onChange={(event) =>
                          onChange({
                            ...values,
                            [key]: clamp(Number(event.target.value)),
                          })
                        }
                        type="number"
                        value={values[key]}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          className="w-11 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-[0.7rem] font-bold disabled:opacity-50"
                          disabled={values[key] <= 5}
                          onClick={() =>
                            onChange({
                              ...values,
                              [key]: clamp(values[key] - (key === "revealSeconds" ? 2 : 10)),
                            })
                          }
                          type="button"
                        >
                          {key === "revealSeconds" ? "-2" : "-10"}
                        </button>
                        <button
                          className="w-11 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-[0.7rem] font-bold disabled:opacity-50"
                          disabled={values[key] >= 180}
                          onClick={() =>
                            onChange({
                              ...values,
                              [key]: clamp(values[key] + (key === "revealSeconds" ? 2 : 10)),
                            })
                          }
                          type="button"
                        >
                          {key === "revealSeconds" ? "+2" : "+10"}
                        </button>
                      </div>
                    </div>
                  </SettingRow>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {allowTesting ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.8rem] font-semibold">Testing</p>
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
                  setFakePlayerCount(clampFakePlayers(Number(event.target.value)))
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
            <p className="mt-2 text-[0.68rem] text-slate-500">Fake users can only be added in lobby.</p>
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
              disabled={saving || changingGame !== null}
              onClick={() => void onSave(values)}
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
