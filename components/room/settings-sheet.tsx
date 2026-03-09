"use client";

import { useState } from "react";

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

  if (!open) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-50 flex items-end bg-black/40 p-3">
      <div className="card-enter w-full rounded-3xl bg-white p-4 shadow-xl">
        <h3 className="text-2xl font-black">Host Settings</h3>
        <p className="mt-1 text-sm text-slate-600">Host controls for this room.</p>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-2">
            <span className="text-sm font-semibold">Prompt</span>
            <input
              className="rounded-xl border border-slate-300 px-3 py-3 text-xl font-semibold"
              max={180}
              min={5}
              onChange={(event) =>
                onChange({
                  ...values,
                  promptSeconds: clamp(Number(event.target.value)),
                })
              }
              type="number"
              value={values.promptSeconds}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold">Rounds</span>
            <input
              className="rounded-xl border border-slate-300 px-3 py-3 text-xl font-semibold disabled:bg-slate-100"
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
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold">Answer</span>
            <input
              className="rounded-xl border border-slate-300 px-3 py-3 text-xl font-semibold"
              max={180}
              min={5}
              onChange={(event) =>
                onChange({
                  ...values,
                  answeringSeconds: clamp(Number(event.target.value)),
                })
              }
              type="number"
              value={values.answeringSeconds}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold">Guess</span>
            <input
              className="rounded-xl border border-slate-300 px-3 py-3 text-xl font-semibold"
              max={180}
              min={5}
              onChange={(event) =>
                onChange({
                  ...values,
                  guessingSeconds: clamp(Number(event.target.value)),
                })
              }
              type="number"
              value={values.guessingSeconds}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold">Reveal</span>
            <input
              className="rounded-xl border border-slate-300 px-3 py-3 text-xl font-semibold"
              max={180}
              min={5}
              onChange={(event) =>
                onChange({
                  ...values,
                  revealSeconds: clamp(Number(event.target.value)),
                })
              }
              type="number"
              value={values.revealSeconds}
            />
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-slate-300 px-3 py-3">
            <input
              checked={values.fastMode}
              className="h-5 w-5 accent-black"
              onChange={(event) =>
                onChange({
                  ...values,
                  fastMode: event.target.checked,
                })
              }
              type="checkbox"
            />
            <span className="text-sm font-semibold">Fast mode (skip Trial)</span>
          </label>
        </div>
        {!allowRoundControls ? (
          <p className="mt-2 text-xs text-slate-500">Rounds can only be edited in lobby.</p>
        ) : null}

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
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-lg font-semibold"
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

        <div className="mt-4 grid grid-cols-2 gap-2">
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
  );
}
