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
    <div className="absolute inset-0 z-50 flex items-end overflow-hidden bg-black/40 p-2 sm:p-3">
      <div className="card-enter flex max-h-full w-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="overflow-y-auto p-3 sm:p-4">
        <h3 className="text-center text-xl font-black sm:text-2xl">Profile</h3>

        <div className="mt-3 grid gap-3">
          <input
            autoComplete="nickname"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-lg font-semibold sm:rounded-2xl sm:px-4 sm:py-3 sm:text-xl"
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
            unavailableOptions={[]}
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
        </div>

        <div className="border-t border-slate-200 p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2">
          <button
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-base font-semibold sm:py-3 sm:text-lg"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          <button
            className="rounded-xl bg-black px-3 py-2.5 text-base font-semibold text-white disabled:opacity-60 sm:py-3 sm:text-lg"
            disabled={saving || !values.name.trim()}
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
