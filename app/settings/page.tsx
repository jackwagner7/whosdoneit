"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppBanner } from "@/components/app-banner";
import { PlayerColorPicker } from "@/components/player-color-picker";
import { PlayerEmojiPicker } from "@/components/player-emoji-picker";
import {
  buildColorChoices,
  buildEmojiChoices,
  DEFAULT_PLAYER_COLOR,
  DEFAULT_PLAYER_EMOJI,
  refreshColorChoices,
  refreshEmojiChoices,
} from "@/lib/game";
import {
  getDefaultPlayerPreferences,
  getStoredPlayerPreferences,
  setStoredPlayerPreferences,
} from "@/lib/player-preferences";

export default function SettingsPage() {
  const [defaults, setDefaults] = useState(() => getDefaultPlayerPreferences());
  const [name, setName] = useState<string>("");
  const [color, setColor] = useState<string>(DEFAULT_PLAYER_COLOR);
  const [emoji, setEmoji] = useState<string>(DEFAULT_PLAYER_EMOJI);
  const [colorOptions, setColorOptions] = useState(() =>
    buildColorChoices({ selectedColor: DEFAULT_PLAYER_COLOR }),
  );
  const [emojiOptions, setEmojiOptions] = useState(() =>
    buildEmojiChoices({ selectedEmoji: DEFAULT_PLAYER_EMOJI }),
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = getStoredPlayerPreferences();
    setDefaults(stored);
  }, []);

  useEffect(() => {
    setName(defaults.name);
    setColor(defaults.color || DEFAULT_PLAYER_COLOR);
    setEmoji(defaults.emoji || DEFAULT_PLAYER_EMOJI);
    setColorOptions(buildColorChoices({ selectedColor: defaults.color }));
    setEmojiOptions(buildEmojiChoices({ selectedEmoji: defaults.emoji }));
  }, [defaults]);

  function refreshColors() {
    setColorOptions((previousChoices = []) => {
      const nextOptions = refreshColorChoices({ previousChoices });
      setColor(nextOptions[0] ?? DEFAULT_PLAYER_COLOR);
      return nextOptions;
    });
  }

  function refreshEmojis() {
    setEmojiOptions((previousChoices = []) => {
      const nextOptions = refreshEmojiChoices({ previousChoices });
      setEmoji(nextOptions[0] ?? DEFAULT_PLAYER_EMOJI);
      return nextOptions;
    });
  }

  function handleSave() {
    setStoredPlayerPreferences({ name, color, emoji });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  }

  function handleShuffle() {
    refreshColors();
    refreshEmojis();
  }

  return (
    <main className="app-page">
      <div className="app-page-card">
        <AppBanner />
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
          <PlayerColorPicker
            onChange={setColor}
            onRefresh={refreshColors}
            options={colorOptions}
            value={color}
          />
        </div>

        <div className="mt-4 grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Emoji</p>
          <PlayerEmojiPicker
            onChange={setEmoji}
            onRefresh={refreshEmojis}
            options={emojiOptions}
            value={emoji}
          />
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

        <div className="mt-4 border-t border-slate-200 pt-3">
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

        <Link className="mt-4 inline-block text-sm font-semibold underline" href="/join">
          Back to join
        </Link>
      </div>
    </main>
  );
}
