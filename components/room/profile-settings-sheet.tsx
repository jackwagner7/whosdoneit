"use client";

import { PlayerBox } from "@/components/player-box";
import { PlayerColorPicker } from "@/components/player-color-picker";
import { PlayerEmojiPicker } from "@/components/player-emoji-picker";

type ProfileDraft = {
  name: string;
  color: string;
  emoji: string;
};

type ProfileSettingsSheetProps = {
  open: boolean;
  saving: boolean;
  error: string | null;
  values: ProfileDraft;
  colorOptions: string[];
  emojiOptions: string[];
  takenColors: string[];
  onChange: (values: ProfileDraft) => void;
  onRefreshColors: () => void;
  onRefreshEmojis: () => void;
  onClose: () => void;
  onSave: () => Promise<void>;
};

export function ProfileSettingsSheet({
  open,
  saving,
  error,
  values,
  colorOptions,
  emojiOptions,
  takenColors,
  onChange,
  onRefreshColors,
  onRefreshEmojis,
  onClose,
  onSave,
}: ProfileSettingsSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-3">
      <div className="card-enter w-full rounded-3xl bg-white p-4 shadow-xl">
        <h3 className="text-2xl font-black">Profile</h3>
        <p className="mt-1 text-sm text-slate-600">Update your name, colour and emoji.</p>

        <div className="mt-4 grid gap-3">
          <input
            autoComplete="nickname"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xl font-semibold"
            onChange={(event) =>
              onChange({
                ...values,
                name: event.target.value,
              })
            }
            placeholder="Name"
            value={values.name}
          />

          <PlayerColorPicker
            onChange={(nextColor) =>
              onChange({
                ...values,
                color: nextColor,
              })
            }
            onRefresh={onRefreshColors}
            options={colorOptions}
            refreshAriaLabel="Refresh colour options"
            unavailableOptions={takenColors}
            value={values.color}
          />

          <PlayerEmojiPicker
            onChange={(nextEmoji) =>
              onChange({
                ...values,
                emoji: nextEmoji,
              })
            }
            onRefresh={onRefreshEmojis}
            options={emojiOptions}
            refreshAriaLabel="Refresh emoji options"
            value={values.emoji}
          />
        </div>

        <div className="mt-3 flex justify-center">
          <PlayerBox color={values.color} emoji={values.emoji} name={values.name} />
        </div>

        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
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
            disabled={saving || !values.name.trim()}
            onClick={() => void onSave()}
            type="button"
          >
            {saving ? "..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
