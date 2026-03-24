"use client";

import { useEffect, useState } from "react";
import { AppBanner } from "@/components/app-banner";
import { PlayerColorPicker } from "@/components/player-color-picker";
import { PlayerEmojiPicker } from "@/components/player-emoji-picker";
import { PlayerBox } from "@/components/player-box";
import {
  buildColorChoices,
  buildEmojiChoices,
  DEFAULT_PLAYER_COLOR,
  DEFAULT_PLAYER_EMOJI,
} from "@/lib/game";

type EntryProfileFormProps = {
  bannerLabel?: string;
  title: string;
  submitLabel: string;
  showCodeInput?: boolean;
  codeReadOnly?: boolean;
  initialCode?: string;
  initialName: string;
  initialColor: string;
  initialEmoji: string;
  loading: boolean;
  error: string | null;
  onSubmit: (values: {
    code: string;
    name: string;
    color: string;
    emoji: string;
  }) => Promise<void>;
};

type PickerState = {
  options: string[];
  value: string;
};

function randomOption(options: string[], fallback: string, excluded?: string) {
  if (!options.length) {
    return fallback;
  }

  const allowed = excluded ? options.filter((option) => option !== excluded) : options;
  const source = allowed.length > 0 ? allowed : options;
  const index = Math.floor(Math.random() * source.length);
  return source[index] ?? fallback;
}

function buildInitialColorState(initialColor: string): PickerState {
  const options = buildColorChoices({ selectedColor: initialColor || DEFAULT_PLAYER_COLOR });
  return { options, value: options[0] ?? DEFAULT_PLAYER_COLOR };
}

function buildInitialEmojiState(initialEmoji: string): PickerState {
  const options = buildEmojiChoices({ selectedEmoji: initialEmoji || DEFAULT_PLAYER_EMOJI });
  return { options, value: options[0] ?? DEFAULT_PLAYER_EMOJI };
}

export function EntryProfileForm({
  bannerLabel,
  title,
  submitLabel,
  showCodeInput = false,
  codeReadOnly = false,
  initialCode = "",
  initialName,
  initialColor,
  initialEmoji,
  loading,
  error,
  onSubmit,
}: EntryProfileFormProps) {
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [name, setName] = useState(initialName);
  const [colorState, setColorState] = useState<PickerState>(() =>
    buildInitialColorState(initialColor),
  );
  const [emojiState, setEmojiState] = useState<PickerState>(() =>
    buildInitialEmojiState(initialEmoji),
  );

  useEffect(() => {
    setCode(initialCode.toUpperCase());
  }, [initialCode]);

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  useEffect(() => {
    setColorState(buildInitialColorState(initialColor));
  }, [initialColor]);

  useEffect(() => {
    setEmojiState(buildInitialEmojiState(initialEmoji));
  }, [initialEmoji]);

  function refreshColors() {
    setColorState((previous) => {
      let nextOptions = previous.options;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const candidate = buildColorChoices({});
        if (candidate.join("|") !== previous.options.join("|")) {
          nextOptions = candidate;
          break;
        }
        nextOptions = candidate;
      }
      return {
        options: nextOptions,
        value: randomOption(nextOptions, DEFAULT_PLAYER_COLOR, previous.value),
      };
    });
  }

  function refreshEmojis() {
    setEmojiState((previous) => {
      let nextOptions = previous.options;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const candidate = buildEmojiChoices({});
        if (candidate.join("|") !== previous.options.join("|")) {
          nextOptions = candidate;
          break;
        }
        nextOptions = candidate;
      }
      return {
        options: nextOptions,
        value: randomOption(nextOptions, DEFAULT_PLAYER_EMOJI, previous.value),
      };
    });
  }

  return (
    <div className="app-page-card app-page-card-wide app-page-card-mobile-fill flex flex-col">
      <AppBanner label={bannerLabel} />

      <div className="flex-1 grid content-center gap-4 pt-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl text-center pb-[13px]">{title}</h1>
        </div>
        {showCodeInput ? (
          <div className="grid gap-0.5">
            <input
              autoCapitalize="characters"
              autoComplete="off"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xl font-semibold uppercase sm:text-2xl"
              maxLength={8}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="Room Code"
              readOnly={codeReadOnly}
              value={code}
            />
          </div>
        ) : null}
        <div className="grid gap-0.5">
          <input
            autoComplete="nickname"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xl font-semibold sm:text-2xl"
            onChange={(event) => setName(event.target.value)}
            placeholder="Name"
            value={name}
          />
        </div>

        <div className="grid gap-5">
          <PlayerColorPicker
            onChange={(next) =>
              setColorState((previous) => ({ ...previous, value: next }))
            }
            onRefresh={refreshColors}
            options={colorState.options}
            refreshAriaLabel="Refresh colour options"
            value={colorState.value}
          />
        </div>

        <div className="grid gap-5">
          <PlayerEmojiPicker
            onChange={(next) =>
              setEmojiState((previous) => ({ ...previous, value: next }))
            }
            onRefresh={refreshEmojis}
            options={emojiState.options}
            refreshAriaLabel="Refresh emoji options"
            value={emojiState.value}
          />
        </div>

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-auto grid gap-3">
        <PlayerBox
          className="player-box-floating"
          color={colorState.value}
          emoji={emojiState.value}
          name={name}
        />
        <button
          className="w-full rounded-2xl bg-black px-5 py-3 text-xl font-bold text-white disabled:opacity-50 sm:text-2xl"
          disabled={loading || !name.trim() || (showCodeInput && !code.trim())}
          onClick={() =>
            void onSubmit({
              code: code.trim().toUpperCase(),
              name,
              color: colorState.value,
              emoji: emojiState.value,
            })
          }
          type="button"
        >
          {loading ? "..." : submitLabel}
        </button>
      </div>
    </div>
  );
}
