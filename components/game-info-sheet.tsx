"use client";

type GameInfoSheetProps = {
  open: boolean;
  title: string;
  summary: string;
  steps: string[];
  tips?: string[];
  onClose: () => void;
};

export function GameInfoSheet({
  open,
  title,
  summary,
  steps,
  tips = [],
  onClose,
}: GameInfoSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-50 flex items-end overflow-hidden bg-black/40 p-3">
      <div className="card-enter flex max-h-full w-full flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="overflow-y-auto p-4">
          <h3 className="text-2xl font-black">{title}</h3>
          <p className="mt-2 text-sm text-slate-600">{summary}</p>

          <div className="mt-4 grid gap-3">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
                How It Works
              </p>
              <ol className="mt-3 grid gap-3">
                {steps.map((step, index) => (
                  <li
                    className="grid grid-cols-[1.75rem_1fr] items-start gap-3"
                    key={`${index + 1}-${step}`}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-sm font-bold text-white">
                      {index + 1}
                    </span>
                    <p className="pt-1 text-sm text-slate-700">{step}</p>
                  </li>
                ))}
              </ol>
            </section>

            {tips.length > 0 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Tips
                </p>
                <ul className="mt-3 grid gap-2 text-sm text-slate-700">
                  {tips.map((tip) => (
                    <li className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" key={tip}>
                      {tip}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>

        <div className="border-t border-slate-200 p-4">
          <button
            className="w-full rounded-xl bg-black px-3 py-3 text-lg font-semibold text-white"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
