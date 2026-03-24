"use client";

import { useState } from "react";
import type { ReactNode } from "react";

type SettingsSheetProps = {
  open: boolean;
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
  allowFakePlayers: boolean;
  onChange: (values: {
    promptSeconds: number;
    roundCount: number;
    answeringSeconds: number;
    guessingSeconds: number;
    revealSeconds: number;
    fastMode: boolean;
  }) => void;
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
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
        disabled ? "border-slate-200 bg-slate-100" : "border-slate-300 bg-white"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        {description ? <p className="text-xs text-slate-500">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsSheet({
  open,
  values,
  saving,
  addingFakePlayers,
  allowRoundControls,
  allowFakePlayers,
  onChange,
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
    <div className="absolute inset-0 z-50 flex items-end overflow-hidden bg-black/40 p-3">
      <div className="card-enter flex max-h-full w-full flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="overflow-y-auto p-4">
        <h3 className="text-2xl font-black">Host Settings</h3>
        <p className="mt-1 text-sm text-slate-600">Host controls for this room.</p>
        <div className="mt-4 grid gap-3">
          <SettingRow
            description={!allowRoundControls ? "Only editable in lobby." : undefined}
            disabled={!allowRoundControls}
            label="Rounds"
          >
            <div className="flex items-center gap-2">
              <input
                className="settings-number-input w-20 rounded-xl border border-slate-300 px-3 py-2 text-center text-lg font-semibold disabled:bg-slate-100"
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
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold disabled:opacity-50"
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
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold disabled:opacity-50"
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

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Fast mode</p>
              <p className="text-xs text-slate-500">Skip Trial.</p>
            </div>
            <input
              checked={values.fastMode}
              className="h-5 w-5 shrink-0 accent-black"
              onChange={(event) =>
                onChange({
                  ...values,
                  fastMode: event.target.checked,
                })
              }
              type="checkbox"
            />
          </label>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <button
              aria-expanded={timersOpen}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              onClick={() => setTimersOpen((current) => !current)}
              type="button"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">Timers</p>
                <p className="text-xs text-slate-500">All timer values are in seconds.</p>
              </div>
              <span className="text-sm font-bold uppercase tracking-[0.12em] text-slate-500">
                {timersOpen ? "Hide" : "Show"}
              </span>
            </button>

            {timersOpen ? (
              <div className="grid gap-2 border-t border-slate-200 px-3 py-3">
                {TIMER_FIELDS.map(({ key, label }) => (
                  <SettingRow key={key} label={label}>
                    <div className="flex items-center gap-2">
                      <input
                        className="settings-number-input w-20 rounded-xl border border-slate-300 px-3 py-2 text-center text-lg font-semibold"
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
                          className="w-14 rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-sm font-bold disabled:opacity-50"
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
                          className="w-14 rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-sm font-bold disabled:opacity-50"
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
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold">Testing</p>
          <p className="mt-1 text-xs text-slate-600">
            Temporary helper: add fake users that auto-submit prompts and responses.
          </p>
          <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2">
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Fake users
              </span>
              <input
                className="settings-number-input rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-lg font-semibold"
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
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold uppercase tracking-[0.08em] disabled:opacity-60"
              disabled={addingFakePlayers || !allowFakePlayers}
              onClick={() => void onAddFakePlayers(fakePlayerCount)}
              type="button"
            >
              {addingFakePlayers ? "..." : "Add fake users"}
            </button>
          </div>
          {!allowFakePlayers ? (
            <p className="mt-2 text-xs text-slate-500">Fake users can only be added in lobby.</p>
          ) : null}
        </div>
        </div>

        <div className="border-t border-slate-200 p-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              className="rounded-xl border border-slate-300 px-3 py-3 text-lg font-semibold"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
            <button
              className="rounded-xl bg-black px-3 py-3 text-lg font-semibold text-white disabled:opacity-60"
              disabled={saving}
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
