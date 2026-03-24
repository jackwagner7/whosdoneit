"use client";

type SettingsSheetProps = {
  open: boolean;
  isHost: boolean;
  allowHostControls: boolean;
  teamName: string;
  teamIndex: number | null;
  teamCount: number;
  cardsPerPlayer: number;
  roundCount: number;
  turnSeconds: number;
  saving: boolean;
  onTeamNameChange: (value: string) => void;
  onTeamCountChange: (teamCount: number) => void;
  onCardsPerPlayerChange: (value: number) => void;
  onRoundCountChange: (value: number) => void;
  onTurnSecondsChange: (value: number) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
};

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
    <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          <p className="text-xs text-slate-500">{hint}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="w-12 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold disabled:opacity-50"
            disabled={value <= min}
            onClick={() => onChange(clamp(value - step, min, max, min))}
            type="button"
          >
            -{step}
          </button>
          <input
            className="settings-number-input w-20 rounded-xl border border-slate-300 px-3 py-2 text-center text-lg font-semibold"
            max={max}
            min={min}
            onChange={(event) =>
              onChange(clamp(Number(event.target.value), min, max, value))
            }
            type="number"
            value={value}
          />
          <button
            className="w-12 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold disabled:opacity-50"
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
  allowHostControls,
  teamName,
  teamIndex,
  teamCount,
  cardsPerPlayer,
  roundCount,
  turnSeconds,
  saving,
  onTeamNameChange,
  onTeamCountChange,
  onCardsPerPlayerChange,
  onRoundCountChange,
  onTurnSecondsChange,
  onClose,
  onSave,
}: SettingsSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-50 flex items-end overflow-hidden bg-black/40 p-3">
      <div className="card-enter flex max-h-full w-full flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="overflow-y-auto p-4">
          <h3 className="text-2xl font-black">Say Less Settings</h3>
          <p className="mt-1 text-sm text-slate-600">
            Anyone can rename their current team. Hosts can edit draft and round settings before the game starts.
          </p>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">
                {teamIndex === null ? "Your team" : `Team ${teamIndex + 1} name`}
              </p>
              <input
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-lg font-semibold"
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
              disabled={saving || !teamName.trim()}
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
