"use client";

import { useEffect, useMemo, useState } from "react";
import { PlayerColorPicker } from "@/components/player-color-picker";
import { PlayerEmojiPicker } from "@/components/player-emoji-picker";
import {
  buildColorChoices,
  buildEmojiChoices,
  DEFAULT_PLAYER_COLOR,
  DEFAULT_PLAYER_EMOJI,
} from "@/lib/game";

type JoinInlineProps = {
  code: string;
  loading: boolean;
  error: string | null;
  defaultName: string;
  defaultColor: string;
  defaultEmoji: string;
  takenColors: string[];
  onJoin: (name: string, color: string, emoji: string) => Promise<void>;
};

export function JoinInline({
  code,
  loading,
  error,
  defaultName,
  defaultColor,
  defaultEmoji,
  takenColors,
  onJoin,
}: JoinInlineProps) {
  const [name, setName] = useState(defaultName);
  const [color, setColor] = useState(defaultColor || DEFAULT_PLAYER_COLOR);
  const [emoji, setEmoji] = useState(defaultEmoji || DEFAULT_PLAYER_EMOJI);
  const [colorOptions, setColorOptions] = useState(() =>
    buildColorChoices({
      selectedColor: defaultColor || DEFAULT_PLAYER_COLOR,
      takenColors,
    }),
  );
  const [emojiOptions, setEmojiOptions] = useState(() =>
    buildEmojiChoices({ selectedEmoji: defaultEmoji || DEFAULT_PLAYER_EMOJI }),
  );

  const takenColorsKey = useMemo(
    () => [...new Set(takenColors.map((entry) => entry.toLowerCase()))].sort().join(","),
    [takenColors],
  );

  useEffect(() => {
    setName(defaultName);
  }, [defaultName]);

  useEffect(() => {
    setColor(defaultColor || DEFAULT_PLAYER_COLOR);
  }, [defaultColor]);

  useEffect(() => {
    setEmoji(defaultEmoji || DEFAULT_PLAYER_EMOJI);
  }, [defaultEmoji]);

  useEffect(() => {
    const taken = takenColorsKey ? takenColorsKey.split(",") : [];
    setColorOptions((previousChoices) => {
      const nextChoices = buildColorChoices({
        selectedColor: color,
        takenColors: taken,
        previousChoices,
      });

      if (!nextChoices.includes(color)) {
        setColor(nextChoices[0] ?? DEFAULT_PLAYER_COLOR);
      }

      return nextChoices;
    });
  }, [color, takenColorsKey]);

  return (
    <section className="card-enter rounded-3xl border border-slate-200 bg-white p-5 pb-28 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
        Room {code}
      </p>
      <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Join</h2>
      <input
        autoComplete="nickname"
        className="mt-4 w-full rounded-2xl border border-slate-300 px-4 py-3 text-xl font-semibold outline-none focus:border-violet-500 sm:text-2xl"
        maxLength={20}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name"
        value={name}
      />
      <div className="mt-4 grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Color</p>
        <PlayerColorPicker
          onChange={setColor}
          options={colorOptions}
          unavailableOptions={takenColors}
          value={color}
        />
      </div>
      <div className="mt-4 grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Emoji</p>
        <PlayerEmojiPicker onChange={setEmoji} options={emojiOptions} value={emoji} />
      </div>
      <button
        className="mt-4 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold uppercase tracking-[0.12em] text-slate-700"
        disabled={loading}
        onClick={() =>
          setEmojiOptions((previousChoices) =>
            buildEmojiChoices({ selectedEmoji: emoji, previousChoices }),
          )
        }
        type="button"
      >
        New emoji choices
      </button>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3">
        <button
          className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-xl font-bold text-white disabled:opacity-60 sm:text-2xl"
          disabled={!name.trim() || loading}
          onClick={() => void onJoin(name, color, emoji)}
        >
          {loading ? "..." : "Join Room"}
        </button>
      </div>
      {error ? (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
