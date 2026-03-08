"use client";

type SettingsSheetProps = {
  open: boolean;
  values: {
    promptSeconds: number;
    roundCount: number;
    answeringSeconds: number;
    guessingSeconds: number;
    revealSeconds: number;
  };
  saving: boolean;
  allowRoundControls: boolean;
  onChange: (values: {
    promptSeconds: number;
    roundCount: number;
    answeringSeconds: number;
    guessingSeconds: number;
    revealSeconds: number;
  }) => void;
  onClose: () => void;
  onSave: (settings: {
    promptSeconds: number;
    roundCount: number;
    answeringSeconds: number;
    guessingSeconds: number;
    revealSeconds: number;
  }) => Promise<void>;
};

function clamp(value: number) {
  return Math.max(5, Math.min(180, Math.round(value)));
}

function clampRounds(value: number) {
  return Math.max(1, Math.min(10, Math.round(value)));
}

export function SettingsSheet({
  open,
  values,
  saving,
  allowRoundControls,
  onChange,
  onClose,
  onSave,
}: SettingsSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-3">
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
        </div>
        {!allowRoundControls ? (
          <p className="mt-2 text-xs text-slate-500">Rounds can only be edited in lobby.</p>
        ) : null}
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
