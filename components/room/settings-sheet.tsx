"use client";

type SettingsSheetProps = {
  open: boolean;
  values: {
    answeringSeconds: number;
    guessingSeconds: number;
    revealSeconds: number;
  };
  saving: boolean;
  onChange: (values: {
    answeringSeconds: number;
    guessingSeconds: number;
    revealSeconds: number;
  }) => void;
  onClose: () => void;
  onSave: (settings: {
    answeringSeconds: number;
    guessingSeconds: number;
    revealSeconds: number;
  }) => Promise<void>;
};

function clamp(value: number) {
  return Math.max(5, Math.min(180, Math.round(value)));
}

export function SettingsSheet({
  open,
  values,
  saving,
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
        <h3 className="text-2xl font-black">Host Timers</h3>
        <p className="mt-1 text-sm text-slate-600">These are the only in-game host settings.</p>
        <div className="mt-4 grid gap-3">
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
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className="rounded-xl border border-slate-300 px-3 py-3 text-lg font-semibold"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          <button
            className="rounded-xl bg-slate-900 px-3 py-3 text-lg font-semibold text-white disabled:opacity-60"
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
