"use client";

import Link from "next/link";
import { useState } from "react";
import { PlayerColorPicker } from "@/components/player-color-picker";
import { PlayerEmojiPicker } from "@/components/player-emoji-picker";
import {
  buildColorChoices,
  buildEmojiChoices,
  DEFAULT_PLAYER_COLOR,
  DEFAULT_PLAYER_EMOJI,
} from "@/lib/game";
import {
  getStoredPlayerPreferences,
  setStoredPlayerPreferences,
} from "@/lib/player-preferences";

export default function SettingsPage() {
  const [defaults] = useState(() => getStoredPlayerPreferences());
  const [name, setName] = useState(() => defaults.name);
  const [color, setColor] = useState(
    () => defaults.color || DEFAULT_PLAYER_COLOR,
  );
  const [emoji, setEmoji] = useState(
    () => defaults.emoji || DEFAULT_PLAYER_EMOJI,
  );
  const [colorOptions, setColorOptions] = useState(() =>
    buildColorChoices({ selectedColor: defaults.color }),
  );
  const [emojiOptions, setEmojiOptions] = useState(() =>
    buildEmojiChoices({ selectedEmoji: defaults.emoji }),
  );
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setStoredPlayerPreferences({ name, color, emoji });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  }

  function handleShuffle() {
    setColorOptions((previousChoices) =>
      buildColorChoices({ selectedColor: color, previousChoices }),
    );
    setEmojiOptions((previousChoices) =>
      buildEmojiChoices({ selectedEmoji: emoji, previousChoices }),
    );
  }

  return (
    <main className="app-page">
      <div className="app-page-card">
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">Default profile for new rooms.</p>

        <input
          autoComplete="nickname"
          className="mt-4 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xl font-semibold sm:text-2xl"
          onChange={(event) => setName(event.target.value)}
          placeholder="Name"
          value={name}
        />

        <div className="mt-4 grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Color</p>
          <PlayerColorPicker onChange={setColor} options={colorOptions} value={color} />
        </div>

        <div className="mt-4 grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Emoji</p>
          <PlayerEmojiPicker onChange={setEmoji} options={emojiOptions} value={emoji} />
        </div>

        <button
          className="mt-4 w-full rounded-2xl border border-slate-300 px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] text-slate-700"
          onClick={handleShuffle}
          type="button"
        >
          Shuffle choices
        </button>

        <p className="mt-2 text-center text-xl font-black" style={{ color }}>
          {name || "Your name"} {emoji}
        </p>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 sm:static sm:mt-4 sm:border-0 sm:bg-transparent sm:p-0">
          <button
            className="w-full rounded-2xl bg-black px-5 py-3 text-xl font-bold text-white disabled:opacity-50 sm:text-2xl"
            disabled={!name.trim()}
            onClick={handleSave}
            type="button"
          >
            Save
          </button>
        </div>

        {saved ? <p className="mt-2 text-sm font-semibold text-emerald-700">Saved</p> : null}

        <Link className="mt-4 inline-block pb-24 text-sm font-semibold underline sm:pb-0" href="/join">
          Back to join
        </Link>
      </div>
    </main>
  );
}
